// Playback engine built on Tone.js.
//
// We pre-compute a flat schedule of "events" (one per beat per track) with an
// absolute time offset in seconds, then drive them with a single Tone.Transport
// loop. A metronome click and a UI playhead callback are scheduled alongside.
//
// Overflow handling: beats whose start time exceeds the bar capacity are dropped
// from the schedule (matching the "skip the over part if played" requirement).

import * as Tone from 'tone';
import { frettedFreq } from '$lib/oto/pitch';
import { beatFraction, beatsCutoff } from '$lib/oto/duration';
import { measureVoices, type OtoScore, type OtoTrack } from '$lib/oto/types';
import {
	createSampler,
	isSetLoaded,
	loadSets,
	pendingSampleCount,
	sampleSetForEngine,
	type SampleSet
} from './samples';
import { loading } from '$lib/stores/loading.svelte';

// Tone's default context uses latencyHint "interactive" (the browser's smallest
// safe buffer) with a 100ms scheduling look-ahead. That's tuned for things like
// live instruments, not a pre-composed multitrack player — under any main-thread
// jank (GC pause, layout, a burst of scheduled notes) there's barely any margin
// before the audio thread runs out of queued work, which is exactly what reads as
// "laggy / choppy / glitchy" playback. Swapping to "playback" (a larger hardware
// buffer) and tripling the look-ahead trades a little extra output latency for a
// much wider safety margin. This must run before any other Tone API call/import
// touches the global context, so it happens at module load, here.
if (typeof window !== 'undefined') {
	Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: 0.3 }));
}

export type MetronomeSound = 'click' | 'beep' | 'wood' | 'bell';

export interface ScheduledNote {
	time: number; // seconds from start
	duration: number; // seconds
	freq: number;
	velocity: number;
	trackId: string;
	muted: boolean;
	bend?: number;
	slideToFreq?: number;
	palmMute?: boolean;
}

export interface BeatMarker {
	time: number;
	measure: number;
	beat: number;
}

export interface CompiledScore {
	notes: ScheduledNote[];
	markers: BeatMarker[];
	/** One per beat of the primary track/voice, for the moving playhead. */
	beatMarkers: BeatMarker[];
	beatTimes: number[]; // metronome click times (one per quarter note)
	totalTime: number;
}

/** Build the absolute-time schedule for the whole score. */
export function compileScore(score: OtoScore): CompiledScore {
	const notes: ScheduledNote[] = [];
	const markers: BeatMarker[] = [];
	const beatMarkers: BeatMarker[] = [];
	const anySolo = score.tracks.some((t) => t.soloed);

	// Use the longest track to drive measure timing / markers.
	const measureCount = Math.max(...score.tracks.map((t) => t.measures.length), 0);

	let cursorTime = 0;
	const beatTimesSet: number[] = [];

	for (let mi = 0; mi < measureCount; mi++) {
		const tempo = score.tracks[0]?.measures[mi]?.tempo ?? score.tempo;
		const quarterSec = 60 / tempo;
		const timeSig = score.tracks[0]?.measures[mi]?.timeSignature ?? score.timeSignature;
		const measureStart = cursorTime;
		const measureSeconds = (timeSig[0] / timeSig[1]) * 4 * quarterSec;

		// metronome clicks: one per beat of the time signature
		for (let b = 0; b < timeSig[0]; b++) {
			beatTimesSet.push(measureStart + b * (measureSeconds / timeSig[0]));
		}

		// schedule each track's voices within this measure independently
		const capacity = timeSig[0] / timeSig[1];
		for (const track of score.tracks) {
			const measure = track.measures[mi];
			if (!measure) continue;
			const voices = measureVoices(measure);
			const isPrimary = track === score.tracks[0];
			for (const voice of voices) {
				const cutoff = beatsCutoff(voice, capacity);
				const isPrimaryVoice = isPrimary && voice === voices[0];
				let local = 0;
				for (let bi = 0; bi < voice.length; bi++) {
					if (bi >= cutoff) break; // skip overflow
					const beat = voice[bi];
					const durSec = beatFraction(beat) * 4 * quarterSec;
					const startT = measureStart + local;
					if (isPrimaryVoice) beatMarkers.push({ time: startT, measure: mi, beat: bi });
					if (!beat.rest) {
						const palm = beat.notes.some((n) => n.techniques?.includes('palm-mute'));
						for (const note of beat.notes) {
							if (note.techniques?.includes('dead')) continue;
							const freq = frettedFreq(track.tuning, note.string, note.fret, {
								capo: track.capo,
								transpose: track.transpose
							});
							const slideToFreq =
								note.slideTo !== undefined
									? frettedFreq(track.tuning, note.string, note.slideTo, {
											capo: track.capo,
											transpose: track.transpose
										})
									: undefined;
							notes.push({
								time: startT,
								duration: durSec * (note.techniques?.includes('staccato') ? 0.4 : 0.95),
								freq,
								// Per-track volume is applied live by the voice's gain node (see
								// TrackVoice.gain), so it is intentionally *not* baked into velocity —
								// that keeps the fader audible mid-playback.
								velocity: note.techniques?.includes('ghost') ? 0.4 : 1,
								trackId: track.id,
								muted: track.muted || (anySolo && !track.soloed),
								bend: note.techniques?.includes('bend') ? (note.bend ?? 1) : undefined,
								slideToFreq,
								palmMute: palm
							});
						}
					}
					local += durSec;
				}
			}
		}

		markers.push({ time: measureStart, measure: mi, beat: 0 });
		cursorTime += measureSeconds;
	}

	return {
		notes,
		markers,
		beatMarkers,
		beatTimes: beatTimesSet,
		totalTime: cursorTime
	};
}

/** Minimal interface every instrument exposes to the scheduler. Frequency
 *  accepts a note name too (e.g. "C2") since the metronome voices trigger by
 *  name rather than a computed fretboard frequency. */
interface Instrument {
	triggerAttackRelease(freq: number | string, dur: number, time?: number, velocity?: number): void;
	releaseAll?(): void;
	dispose(): void;
}

/**
 * Polyphonic Karplus–Strong plucked string. Tone's `PluckSynth` is monophonic and
 * incompatible with `PolySynth`, so we pool a handful of voices and allocate them
 * round-robin. This gives nylon/steel guitars a genuinely string-like timbre
 * rather than a generic synth tone.
 */
class PluckPoly implements Instrument {
	private voices: Tone.PluckSynth[];
	private idx = 0;
	constructor(
		opts: ConstructorParameters<typeof Tone.PluckSynth>[0],
		dest: Tone.InputNode,
		count = 8
	) {
		this.voices = Array.from({ length: count }, () => new Tone.PluckSynth(opts).connect(dest));
	}
	triggerAttackRelease(freq: number, dur: number, time?: number) {
		const v = this.voices[this.idx];
		this.idx = (this.idx + 1) % this.voices.length;
		v.triggerAttackRelease(freq, dur, time);
	}
	releaseAll() {
		/* plucked strings decay naturally */
	}
	dispose() {
		for (const v of this.voices) v.dispose();
	}
}

/**
 * A small synthesised drum kit. The notation model is pitch-based (a fret maps to
 * a frequency), so we route each hit to a kick / snare / hat / tom by register:
 * the lower the pitch, the deeper the drum. It's an approximation of a real kit,
 * but it makes a "Drums" track read as percussion instead of a melodic synth.
 */
class DrumKit implements Instrument {
	private kick: Tone.MembraneSynth;
	private tom: Tone.MembraneSynth;
	private snare: Tone.NoiseSynth;
	private hat: Tone.MetalSynth;
	constructor(dest: Tone.InputNode) {
		const out = dest as Tone.ToneAudioNode;
		this.kick = new Tone.MembraneSynth({
			pitchDecay: 0.05,
			octaves: 6,
			envelope: { attack: 0.001, decay: 0.4, sustain: 0 }
		}).connect(out);
		this.tom = new Tone.MembraneSynth({
			pitchDecay: 0.03,
			octaves: 3,
			envelope: { attack: 0.001, decay: 0.25, sustain: 0 }
		}).connect(out);
		this.snare = new Tone.NoiseSynth({
			noise: { type: 'white' },
			envelope: { attack: 0.001, decay: 0.18, sustain: 0 }
		}).connect(out);
		this.hat = new Tone.MetalSynth({
			envelope: { attack: 0.001, decay: 0.08, release: 0.02 },
			harmonicity: 5.1,
			resonance: 4000,
			octaves: 1.5
		}).connect(out);
	}
	triggerAttackRelease(freq: number, dur: number, time?: number, velocity = 1) {
		const t = time ?? Tone.now();
		if (freq < 110) {
			this.kick.triggerAttackRelease('C1', 0.4, t, velocity);
		} else if (freq < 220) {
			this.tom.triggerAttackRelease(freq, 0.2, t, velocity);
		} else if (freq < 600) {
			this.snare.triggerAttackRelease(0.18, t, velocity);
		} else {
			this.hat.triggerAttackRelease(0.05, t, velocity * 0.6);
		}
	}
	releaseAll() {
		/* percussion decays on its own */
	}
	dispose() {
		this.kick.dispose();
		this.tom.dispose();
		this.snare.dispose();
		this.hat.dispose();
	}
}

/** Build an instrument and connect its full chain to `dest`. Returns the
 * triggerable instrument plus any effect nodes so they can be disposed. */
function buildInstrument(
	name: string,
	dest: Tone.InputNode
): { instrument: Instrument; nodes: { dispose(): void }[] } {
	// Prefer a recorded multisample when its set is loaded — this is what makes
	// the guitars/bass/piano sound real rather than synthesised. The synth cases
	// below remain a graceful fallback for the brief window before samples finish
	// downloading (or if a fetch fails).
	const set = sampleSetForEngine(name);
	if (set && isSetLoaded(set)) {
		const sampler = createSampler(set, dest);
		if (sampler) return { instrument: sampler, nodes: [] };
	}

	switch (name) {
		case 'drums': {
			return { instrument: new DrumKit(dest), nodes: [] };
		}
		case 'nylon': {
			// Classical/nylon: mellow, warm, quick damping, gentle ring.
			const inst = new PluckPoly(
				{ attackNoise: 0.7, dampening: 2400, resonance: 0.72, release: 0.9 },
				dest
			);
			return { instrument: inst, nodes: [] };
		}
		case 'acoustic': {
			// Steel-string acoustic: brighter attack, longer sustain.
			const inst = new PluckPoly(
				{ attackNoise: 1.4, dampening: 5200, resonance: 0.95, release: 1.4 },
				dest
			);
			return { instrument: inst, nodes: [] };
		}
		case 'electric': {
			// Electric: sawtooth body shaped by a low-pass + a touch of drive.
			const filter = new Tone.Filter({ type: 'lowpass', frequency: 2800, Q: 0.8 });
			const drive = new Tone.Distortion({ distortion: 0.16, wet: 0.5 });
			const synth = new Tone.PolySynth(Tone.Synth, {
				oscillator: { type: 'sawtooth' },
				envelope: { attack: 0.004, decay: 0.22, sustain: 0.32, release: 0.7 }
			});
			// Cap voices per track: each track gets its own synth instance, so an
			// unbounded default (32) lets one dense/looping track alone load the
			// audio thread. 24 is far more than any real chord needs.
			synth.maxPolyphony = 24;
			synth.chain(filter, drive, dest as Tone.ToneAudioNode);
			return { instrument: synth, nodes: [filter, drive] };
		}
		case 'bass': {
			const filter = new Tone.Filter({ type: 'lowpass', frequency: 900, Q: 0.6 });
			const synth = new Tone.PolySynth(Tone.Synth, {
				oscillator: { type: 'triangle' },
				envelope: { attack: 0.012, decay: 0.22, sustain: 0.62, release: 0.45 }
			});
			// Bass parts are rarely more than a couple of notes at once.
			synth.maxPolyphony = 12;
			synth.chain(filter, dest as Tone.ToneAudioNode);
			return { instrument: synth, nodes: [filter] };
		}
		case 'clean':
		default: {
			// Clean electric: soft pluck-like body via FM, with a hint of chorus.
			const chorus = new Tone.Chorus({
				frequency: 1.2,
				delayTime: 3,
				depth: 0.4,
				wet: 0.25
			}).start();
			const synth = new Tone.PolySynth(Tone.FMSynth, {
				harmonicity: 2,
				modulationIndex: 4,
				oscillator: { type: 'sine' },
				envelope: { attack: 0.006, decay: 0.4, sustain: 0.25, release: 1 },
				modulation: { type: 'triangle' },
				modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.4 }
			});
			// FMSynth runs two oscillators + two envelopes per voice, noticeably
			// heavier than a plain Synth voice, so it gets a tighter cap.
			synth.maxPolyphony = 16;
			synth.chain(chorus, dest as Tone.ToneAudioNode);
			return { instrument: synth, nodes: [chorus] };
		}
	}
}

/**
 * Build a metronome click voice. Like `buildInstrument`, but the four sounds
 * here all ignore the frequency they're triggered with — each one is voiced at
 * whatever pitch reads best for that timbre, so the click stays clearly
 * audible (and distinct from the instruments) at any tempo.
 */
function buildMetronomeVoice(
	sound: MetronomeSound,
	dest: Tone.InputNode
): { instrument: Instrument; nodes: { dispose(): void }[] } {
	switch (sound) {
		case 'beep': {
			const synth = new Tone.Synth({
				oscillator: { type: 'square' },
				envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }
			}).connect(dest);
			return {
				instrument: {
					triggerAttackRelease: (_freq, dur, time, velocity) =>
						synth.triggerAttackRelease('A5', dur, time, velocity),
					dispose: () => synth.dispose()
				},
				nodes: []
			};
		}
		case 'wood': {
			// A short, filtered noise burst reads as a woodblock/claves tap.
			const filter = new Tone.Filter({ type: 'bandpass', frequency: 1100, Q: 1.4 });
			const noise = new Tone.NoiseSynth({
				noise: { type: 'brown' },
				envelope: { attack: 0.001, decay: 0.045, sustain: 0 }
			});
			noise.chain(filter, dest as Tone.ToneAudioNode);
			return {
				instrument: {
					triggerAttackRelease: (_freq, dur, time, velocity) =>
						noise.triggerAttackRelease(Math.min(dur, 0.05), time, velocity),
					dispose: () => {
						noise.dispose();
						filter.dispose();
					}
				},
				nodes: []
			};
		}
		case 'bell': {
			const synth = new Tone.MetalSynth({
				envelope: { attack: 0.001, decay: 0.18, release: 0.05 },
				harmonicity: 4.2,
				resonance: 2200,
				octaves: 1
			}).connect(dest);
			return {
				instrument: {
					triggerAttackRelease: (_freq, dur, time, velocity) =>
						synth.triggerAttackRelease('G5', dur, time, velocity),
					dispose: () => synth.dispose()
				},
				nodes: []
			};
		}
		case 'click':
		default: {
			const synth = new Tone.MembraneSynth({
				pitchDecay: 0.008,
				octaves: 2,
				envelope: { attack: 0.001, decay: 0.1, sustain: 0 }
			}).connect(dest);
			return { instrument: synth, nodes: [] };
		}
	}
}

export interface PlayOptions {
	metronome: boolean;
	metronomeSound: MetronomeSound;
	/** Time window to play. null = whole piece from the start. */
	window: { start: number; end: number } | null;
	/** Loop the window indefinitely (used for loop-selection playback). */
	repeat: boolean;
	onMarker: (measure: number) => void;
	/** Fired as the playhead reaches each beat of the primary voice. */
	onBeatMarker: (measure: number, beat: number) => void;
	onBeat: (time: number) => void;
	onStop: () => void;
}

interface TrackVoice {
	instrument: Instrument;
	nodes: { dispose(): void }[];
	/** Per-track stereo placement, fed from track.pan. */
	panner: Tone.Panner;
	/** Per-track three-band EQ, fed from track.eq. */
	eq: Tone.EQ3;
	/** Per-track output level, fed from track.volume. Applying volume here (rather
	 * than baking it into note velocity) keeps the fader audible mid-playback. */
	gain: Tone.Gain;
	/** instrument name the voice was built for, so we can rebuild on change. */
	key: string;
	/** True when this voice is the synth fallback for a sampled instrument whose
	 *  samples weren't loaded yet — rebuilt into a real sampler once they are. */
	fallback: boolean;
}

export class AudioEngine {
	private voices = new Map<string, TrackVoice>();
	private metro: Instrument | null = null;
	private metroNodes: { dispose(): void }[] = [];
	private metroSound: MetronomeSound = 'click';
	private master: Tone.Gain | null = null;
	private reverb: Tone.Reverb | null = null;
	private started = false;
	playing = false;
	/** Set when ensureStarted() fails (e.g. blocked autoplay policy), so callers
	 *  can surface a UX warning instead of silently producing no sound. */
	lastStartError: unknown = null;

	private async ensureStarted() {
		if (this.started) return;
		try {
			await Tone.start();
			// A small amount of room reverb gives the plucked strings body.
			this.reverb = new Tone.Reverb({ decay: 1.4, preDelay: 0.01, wet: 0.14 }).toDestination();
			this.master = new Tone.Gain(0.85).connect(this.reverb);
			const { instrument, nodes } = buildMetronomeVoice(this.metroSound, this.master);
			this.metro = instrument;
			this.metroNodes = nodes;
			this.started = true;
			this.lastStartError = null;
		} catch (err) {
			// Most commonly a blocked autoplay policy (no user gesture yet) or an
			// unsupported/locked-down AudioContext. Record it instead of throwing
			// into a generic catch elsewhere, so the UI can show a clear message.
			this.lastStartError = err;
			throw err;
		}
	}

	/** Switch the metronome's timbre. Safe to call before the engine has
	 *  started — the choice is remembered and applied on first `ensureStarted()`. */
	setMetronomeSound(sound: MetronomeSound) {
		if (sound === this.metroSound && this.metro) return;
		this.metroSound = sound;
		if (!this.master) return;
		this.metro?.dispose();
		for (const n of this.metroNodes) n.dispose();
		const { instrument, nodes } = buildMetronomeVoice(sound, this.master);
		this.metro = instrument;
		this.metroNodes = nodes;
	}

	private instrumentFor(track: OtoTrack): Instrument {
		const existing = this.voices.get(track.id);
		// Reuse the cached voice unless the instrument changed, or it's a synth
		// fallback whose samples have since finished loading (so we can upgrade it
		// to the real sampler).
		const set = sampleSetForEngine(track.instrument);
		const stale = existing?.fallback && set !== null && isSetLoaded(set);
		if (existing && existing.key === track.instrument && !stale) {
			this.applyTrackSettings(track, existing);
			return existing.instrument;
		}
		// Instrument changed (or first use, or upgrade) → (re)build the chain.
		if (existing) {
			existing.instrument.dispose();
			for (const n of existing.nodes) n.dispose();
			existing.eq.dispose();
			existing.panner.dispose();
			existing.gain.dispose();
		}
		// Chain: instrument → EQ3 → Panner → Gain → master.
		const gain = new Tone.Gain(1).connect(this.master!);
		const panner = new Tone.Panner(0).connect(gain);
		const eq = new Tone.EQ3().connect(panner);
		const { instrument, nodes } = buildInstrument(track.instrument, eq);
		const fallback = set !== null && !isSetLoaded(set);
		const voice: TrackVoice = {
			instrument,
			nodes,
			panner,
			eq,
			gain,
			key: track.instrument,
			fallback
		};
		this.voices.set(track.id, voice);
		this.applyTrackSettings(track, voice);
		return instrument;
	}

	/**
	 * Ensure the recorded sample sets used by the given tracks are decoded and
	 * cached before playback, driving the loading overlay's progress while they
	 * download. Resolves immediately when everything needed is already cached, so
	 * it's cheap to call on every play/audition. Loading failures are swallowed —
	 * the synth fallback still makes sound — but the overlay is closed so the app
	 * never gets stuck behind it.
	 */
	async ensureSamples(engineNames: string[]): Promise<void> {
		const sets = [
			...new Set(engineNames.map(sampleSetForEngine).filter((s): s is SampleSet => s !== null))
		];
		if (sets.length === 0) return;
		const pending = pendingSampleCount(sets);
		if (pending > 0) loading.begin(pending);
		try {
			await loadSets(sets, () => loading.tick());
		} catch {
			loading.finish();
		}
	}

	/**
	 * Push a track's live volume/pan/EQ onto its audio nodes. Public so the store
	 * (via the mixer) can make a fader/knob audible while a piece is playing,
	 * instead of waiting for the next play() to re-sync. No-op until the track's
	 * voice has been built (i.e. the engine has been started at least once).
	 */
	syncTrack(track: OtoTrack) {
		const voice = this.voices.get(track.id);
		if (voice) this.applyTrackSettings(track, voice);
	}

	private applyTrackSettings(track: OtoTrack, voice: TrackVoice) {
		voice.gain.gain.value = Math.max(0, Math.min(1, track.volume ?? 1));
		voice.panner.pan.value = Math.max(-1, Math.min(1, track.pan ?? 0));
		const eq = track.eq ?? { low: 0, mid: 0, high: 0 };
		voice.eq.low.value = eq.low;
		voice.eq.mid.value = eq.mid;
		voice.eq.high.value = eq.high;
	}

	/** Set the master output level (0..1). No-op until the engine has started. */
	setMasterVolume(v: number) {
		if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
	}

	/** Play one metronome click immediately (used by the sound picker, so picking
	 *  a variant gives instant audible feedback without starting playback). */
	async previewMetronome() {
		await this.ensureStarted();
		this.metro?.triggerAttackRelease('C2', 0.05, undefined, 0.6);
	}

	/** Audition a single note immediately (used by the fretboard / note entry). */
	async pluck(track: OtoTrack, stringIndex: number, fret: number) {
		await this.ensureStarted();
		await this.ensureSamples([track.instrument]);
		const freq = frettedFreq(track.tuning, stringIndex, fret, {
			capo: track.capo,
			transpose: track.transpose
		});
		// Volume is applied by the track's gain node (built/synced in instrumentFor).
		this.instrumentFor(track).triggerAttackRelease(freq, 0.6, undefined, 0.8);
	}

	async play(score: OtoScore, compiled: CompiledScore, opts: PlayOptions) {
		await this.ensureStarted();
		// Make sure every track's samples are decoded before we build its voice,
		// so playback starts on real samplers (not the synth fallback) and never
		// stutters waiting on a fetch mid-bar.
		await this.ensureSamples(score.tracks.map((t) => t.instrument));
		this.stop();
		this.playing = true;
		this.setMetronomeSound(opts.metronomeSound);

		// Apply master level and refresh every track's pan/EQ before scheduling.
		this.setMasterVolume(score.masterVolume ?? 0.85);
		for (const t of score.tracks) this.instrumentFor(t);

		const transport = Tone.getTransport();
		const windowStart = opts.window ? opts.window.start : 0;
		const windowEnd = opts.window ? opts.window.end : compiled.totalTime;

		// Schedule notes inside the window.
		for (const ev of compiled.notes) {
			if (ev.muted) continue;
			if (ev.time < windowStart - 1e-6 || ev.time >= windowEnd - 1e-6) continue;
			const instrument = this.instrumentFor(score.tracks.find((t) => t.id === ev.trackId)!);
			const rel = ev.time - windowStart;
			transport.schedule((time) => {
				const dur = ev.palmMute ? Math.min(ev.duration, 0.12) : ev.duration;
				instrument.triggerAttackRelease(ev.freq, dur, time, ev.velocity);
			}, rel);
		}

		// Metronome clicks.
		if (opts.metronome) {
			for (const t of compiled.beatTimes) {
				if (t < windowStart - 1e-6 || t >= windowEnd - 1e-6) continue;
				const rel = t - windowStart;
				transport.schedule((time) => {
					this.metro?.triggerAttackRelease('C2', 0.05, time, 0.6);
					opts.onBeat(time);
				}, rel);
			}
		}

		// Playhead markers (per measure, kept for callers that only need the bar).
		for (const m of compiled.markers) {
			if (m.time < windowStart - 1e-6 || m.time >= windowEnd - 1e-6) continue;
			const rel = m.time - windowStart;
			transport.schedule((time) => {
				Tone.getDraw().schedule(() => opts.onMarker(m.measure), time);
			}, rel);
		}

		// Per-beat playhead — drives the moving note cursor during playback.
		for (const m of compiled.beatMarkers) {
			if (m.time < windowStart - 1e-6 || m.time >= windowEnd - 1e-6) continue;
			const rel = m.time - windowStart;
			transport.schedule((time) => {
				Tone.getDraw().schedule(() => opts.onBeatMarker(m.measure, m.beat), time);
			}, rel);
		}

		const windowDur = windowEnd - windowStart;
		transport.position = 0;
		if (opts.repeat) {
			transport.loop = true;
			transport.loopStart = 0;
			transport.loopEnd = windowDur;
		} else {
			transport.loop = false;
			transport.schedule((time) => {
				Tone.getDraw().schedule(() => {
					this.stop();
					opts.onStop();
				}, time);
			}, windowDur);
		}
		transport.start();
	}

	stop() {
		this.playing = false;
		const transport = Tone.getTransport();
		transport.stop();
		transport.cancel();
		transport.loop = false;
		transport.position = 0;
		for (const v of this.voices.values()) v.instrument.releaseAll?.();
	}

	dispose() {
		this.stop();
		for (const v of this.voices.values()) {
			v.instrument.dispose();
			for (const n of v.nodes) n.dispose();
			v.eq.dispose();
			v.panner.dispose();
			v.gain.dispose();
		}
		this.voices.clear();
		this.metro?.dispose();
		for (const n of this.metroNodes) n.dispose();
		this.master?.dispose();
		this.reverb?.dispose();
		this.started = false;
	}
}

export const audio = new AudioEngine();
