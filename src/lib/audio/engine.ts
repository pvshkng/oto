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
import { beatFraction, overflowCutoff } from '$lib/oto/duration';
import type { OtoScore, OtoTrack } from '$lib/oto/types';

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
	beatTimes: number[]; // metronome click times (one per quarter note)
	totalTime: number;
}

/** Build the absolute-time schedule for the whole score. */
export function compileScore(score: OtoScore): CompiledScore {
	const notes: ScheduledNote[] = [];
	const markers: BeatMarker[] = [];
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

		// schedule each track within this measure independently
		for (const track of score.tracks) {
			const measure = track.measures[mi];
			if (!measure) continue;
			const cutoff = overflowCutoff(measure, score.timeSignature);
			let local = 0;
			for (let bi = 0; bi < measure.beats.length; bi++) {
				if (bi >= cutoff) break; // skip overflow
				const beat = measure.beats[bi];
				const durSec = beatFraction(beat) * 4 * quarterSec;
				const startT = measureStart + local;
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

		markers.push({ time: measureStart, measure: mi, beat: 0 });
		cursorTime += measureSeconds;
	}

	return {
		notes,
		markers,
		beatTimes: beatTimesSet,
		totalTime: cursorTime
	};
}

type InstrumentFactory = () => Tone.PolySynth;

const INSTRUMENTS: Record<string, () => Tone.PolySynth> = {
	electric: () =>
		new Tone.PolySynth(Tone.Synth, {
			oscillator: { type: 'sawtooth' },
			envelope: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.8 }
		}),
	acoustic: () =>
		new Tone.PolySynth(Tone.Synth, {
			oscillator: { type: 'triangle' },
			envelope: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 1.2 }
		}),
	clean: () =>
		new Tone.PolySynth(Tone.Synth, {
			oscillator: { type: 'sine' },
			envelope: { attack: 0.01, decay: 0.4, sustain: 0.3, release: 1 }
		}),
	bass: () =>
		new Tone.PolySynth(Tone.Synth, {
			oscillator: { type: 'square' },
			envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.4 }
		})
};

export interface PlayOptions {
	metronome: boolean;
	/** Time window to play. null = whole piece from the start. */
	window: { start: number; end: number } | null;
	/** Loop the window indefinitely (used for loop-selection playback). */
	repeat: boolean;
	onMarker: (measure: number) => void;
	onBeat: (time: number) => void;
	onStop: () => void;
}

export class AudioEngine {
	private synths = new Map<string, Tone.PolySynth>();
	private metro: Tone.MembraneSynth | null = null;
	private master: Tone.Gain | null = null;
	private started = false;
	playing = false;

	private async ensureStarted() {
		if (!this.started) {
			await Tone.start();
			this.master = new Tone.Gain(0.9).toDestination();
			this.metro = new Tone.MembraneSynth({
				pitchDecay: 0.008,
				octaves: 2,
				envelope: { attack: 0.001, decay: 0.1, sustain: 0 }
			}).connect(this.master);
			this.started = true;
		}
	}

	private synthFor(track: OtoTrack): Tone.PolySynth {
		let s = this.synths.get(track.id);
		if (!s) {
			const make: InstrumentFactory = INSTRUMENTS[track.instrument] ?? INSTRUMENTS.electric;
			s = make().connect(this.master!);
			this.synths.set(track.id, s);
		}
		return s;
	}

	/** Audition a single note immediately (used by the fretboard / note entry). */
	async pluck(track: OtoTrack, stringIndex: number, fret: number) {
		await this.ensureStarted();
		const freq = frettedFreq(track.tuning, stringIndex, fret, {
			capo: track.capo,
			transpose: track.transpose
		});
		this.synthFor(track).triggerAttackRelease(freq, 0.6, undefined, 0.8 * track.volume);
	}

	async play(score: OtoScore, compiled: CompiledScore, opts: PlayOptions) {
		await this.ensureStarted();
		this.stop();
		this.playing = true;

		const transport = Tone.getTransport();
		const windowStart = opts.window ? opts.window.start : 0;
		const windowEnd = opts.window ? opts.window.end : compiled.totalTime;

		// Schedule notes inside the window.
		for (const ev of compiled.notes) {
			if (ev.muted) continue;
			if (ev.time < windowStart - 1e-6 || ev.time >= windowEnd - 1e-6) continue;
			const synth =
				this.synths.get(ev.trackId) ??
				this.synthFor(score.tracks.find((t) => t.id === ev.trackId)!);
			const rel = ev.time - windowStart;
			transport.schedule((time) => {
				const dur = ev.palmMute ? Math.min(ev.duration, 0.12) : ev.duration;
				synth.triggerAttackRelease(ev.freq, dur, time, ev.velocity);
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

		// Playhead markers.
		for (const m of compiled.markers) {
			if (m.time < windowStart - 1e-6 || m.time >= windowEnd - 1e-6) continue;
			const rel = m.time - windowStart;
			transport.schedule((time) => {
				Tone.getDraw().schedule(() => opts.onMarker(m.measure), time);
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
		for (const s of this.synths.values()) s.releaseAll?.();
	}

	dispose() {
		this.stop();
		for (const s of this.synths.values()) s.dispose();
		this.synths.clear();
		this.metro?.dispose();
		this.master?.dispose();
		this.started = false;
	}
}

export const audio = new AudioEngine();
