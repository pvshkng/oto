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
								velocity: (note.techniques?.includes('ghost') ? 0.4 : 1) * track.volume,
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

/** Minimal interface every instrument exposes to the scheduler. */
interface Instrument {
	triggerAttackRelease(freq: number, dur: number, time?: number, velocity?: number): void;
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

/** Build an instrument and connect its full chain to `dest`. Returns the
 * triggerable instrument plus any effect nodes so they can be disposed. */
function buildInstrument(
	name: string,
	dest: Tone.InputNode
): { instrument: Instrument; nodes: { dispose(): void }[] } {
	switch (name) {
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
			synth.chain(filter, drive, dest as Tone.ToneAudioNode);
			return { instrument: synth, nodes: [filter, drive] };
		}
		case 'bass': {
			const filter = new Tone.Filter({ type: 'lowpass', frequency: 900, Q: 0.6 });
			const synth = new Tone.PolySynth(Tone.Synth, {
				oscillator: { type: 'triangle' },
				envelope: { attack: 0.012, decay: 0.22, sustain: 0.62, release: 0.45 }
			});
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
			synth.chain(chorus, dest as Tone.ToneAudioNode);
			return { instrument: synth, nodes: [chorus] };
		}
	}
}

export interface PlayOptions {
	metronome: boolean;
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
	/** instrument name the voice was built for, so we can rebuild on change. */
	key: string;
}

export class AudioEngine {
	private voices = new Map<string, TrackVoice>();
	private metro: Tone.MembraneSynth | null = null;
	private master: Tone.Gain | null = null;
	private reverb: Tone.Reverb | null = null;
	private started = false;
	playing = false;

	private async ensureStarted() {
		if (!this.started) {
			await Tone.start();
			// A small amount of room reverb gives the plucked strings body.
			this.reverb = new Tone.Reverb({ decay: 1.4, preDelay: 0.01, wet: 0.14 }).toDestination();
			this.master = new Tone.Gain(0.85).connect(this.reverb);
			this.metro = new Tone.MembraneSynth({
				pitchDecay: 0.008,
				octaves: 2,
				envelope: { attack: 0.001, decay: 0.1, sustain: 0 }
			}).connect(this.master);
			this.started = true;
		}
	}

	private instrumentFor(track: OtoTrack): Instrument {
		const existing = this.voices.get(track.id);
		if (existing && existing.key === track.instrument) {
			this.syncTrack(track, existing);
			return existing.instrument;
		}
		// Instrument changed (or first use) → (re)build the chain.
		if (existing) {
			existing.instrument.dispose();
			for (const n of existing.nodes) n.dispose();
			existing.eq.dispose();
			existing.panner.dispose();
		}
		// Chain: instrument → EQ3 → Panner → master.
		const panner = new Tone.Panner(0).connect(this.master!);
		const eq = new Tone.EQ3().connect(panner);
		const { instrument, nodes } = buildInstrument(track.instrument, eq);
		const voice: TrackVoice = { instrument, nodes, panner, eq, key: track.instrument };
		this.voices.set(track.id, voice);
		this.syncTrack(track, voice);
		return instrument;
	}

	/** Push a track's live pan/EQ settings onto its audio nodes. */
	private syncTrack(track: OtoTrack, voice: TrackVoice) {
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

	/** Audition a single note immediately (used by the fretboard / note entry). */
	async pluck(track: OtoTrack, stringIndex: number, fret: number) {
		await this.ensureStarted();
		const freq = frettedFreq(track.tuning, stringIndex, fret, {
			capo: track.capo,
			transpose: track.transpose
		});
		this.instrumentFor(track).triggerAttackRelease(freq, 0.6, undefined, 0.8 * track.volume);
	}

	async play(score: OtoScore, compiled: CompiledScore, opts: PlayOptions) {
		await this.ensureStarted();
		this.stop();
		this.playing = true;

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
		}
		this.voices.clear();
		this.metro?.dispose();
		this.master?.dispose();
		this.reverb?.dispose();
		this.started = false;
	}
}

export const audio = new AudioEngine();
