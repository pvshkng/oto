// Sampled-instrument support.
//
// Note→file maps are ported from nbrosowsky/tonejs-instruments
// (https://github.com/nbrosowsky/tonejs-instruments). Each recorded note lives
// at /samples/<set>/<file>.mp3 (vendored under static/samples). Tone.Sampler
// pitch-shifts between the recorded notes to cover the whole range, so a couple
// dozen samples per instrument give a continuous, realistic timbre — far better
// than the synthesised approximations these replace.
//
// Buffers are decoded once and cached here, shared by reference across every
// track that uses the same set: building a per-track Sampler from already-loaded
// buffers is effectively free, so each track keeps its own voice/EQ/pan chain
// without paying for the samples more than once.

import * as Tone from 'tone';

export type SampleSet =
	'bass-electric' | 'guitar-acoustic' | 'guitar-electric' | 'guitar-nylon' | 'piano';

/** Where the vendored samples are served from (static/samples → /samples). */
const BASE_URL = '/samples/';

// Maps below are verbatim from the upstream library, with two upstream octave
// typos dropped (guitar-acoustic D#4→Ds3, guitar-nylon G5→G3) so the Sampler
// interpolates those notes correctly instead of playing the wrong octave.
export const SAMPLE_MAPS: Record<SampleSet, Record<string, string>> = {
	'bass-electric': {
		'A#1': 'As1.mp3',
		'A#2': 'As2.mp3',
		'A#3': 'As3.mp3',
		'A#4': 'As4.mp3',
		'C#1': 'Cs1.mp3',
		'C#2': 'Cs2.mp3',
		'C#3': 'Cs3.mp3',
		'C#4': 'Cs4.mp3',
		E1: 'E1.mp3',
		E2: 'E2.mp3',
		E3: 'E3.mp3',
		E4: 'E4.mp3',
		G1: 'G1.mp3',
		G2: 'G2.mp3',
		G3: 'G3.mp3',
		G4: 'G4.mp3'
	},
	'guitar-acoustic': {
		F4: 'F4.mp3',
		'F#2': 'Fs2.mp3',
		'F#3': 'Fs3.mp3',
		'F#4': 'Fs4.mp3',
		G2: 'G2.mp3',
		G3: 'G3.mp3',
		G4: 'G4.mp3',
		'G#2': 'Gs2.mp3',
		'G#3': 'Gs3.mp3',
		'G#4': 'Gs4.mp3',
		A2: 'A2.mp3',
		A3: 'A3.mp3',
		A4: 'A4.mp3',
		'A#2': 'As2.mp3',
		'A#3': 'As3.mp3',
		'A#4': 'As4.mp3',
		B2: 'B2.mp3',
		B3: 'B3.mp3',
		B4: 'B4.mp3',
		C3: 'C3.mp3',
		C4: 'C4.mp3',
		C5: 'C5.mp3',
		'C#3': 'Cs3.mp3',
		'C#4': 'Cs4.mp3',
		'C#5': 'Cs5.mp3',
		D2: 'D2.mp3',
		D3: 'D3.mp3',
		D4: 'D4.mp3',
		D5: 'D5.mp3',
		'D#2': 'Ds2.mp3',
		'D#3': 'Ds3.mp3',
		E2: 'E2.mp3',
		E3: 'E3.mp3',
		E4: 'E4.mp3',
		F2: 'F2.mp3',
		F3: 'F3.mp3'
	},
	'guitar-electric': {
		'D#3': 'Ds3.mp3',
		'D#4': 'Ds4.mp3',
		'D#5': 'Ds5.mp3',
		E2: 'E2.mp3',
		'F#2': 'Fs2.mp3',
		'F#3': 'Fs3.mp3',
		'F#4': 'Fs4.mp3',
		'F#5': 'Fs5.mp3',
		A2: 'A2.mp3',
		A3: 'A3.mp3',
		A4: 'A4.mp3',
		A5: 'A5.mp3',
		C3: 'C3.mp3',
		C4: 'C4.mp3',
		C5: 'C5.mp3',
		C6: 'C6.mp3',
		'C#2': 'Cs2.mp3'
	},
	'guitar-nylon': {
		'F#2': 'Fs2.mp3',
		'F#3': 'Fs3.mp3',
		'F#4': 'Fs4.mp3',
		'F#5': 'Fs5.mp3',
		G3: 'G3.mp3',
		'G#2': 'Gs2.mp3',
		'G#4': 'Gs4.mp3',
		'G#5': 'Gs5.mp3',
		A2: 'A2.mp3',
		A3: 'A3.mp3',
		A4: 'A4.mp3',
		A5: 'A5.mp3',
		'A#5': 'As5.mp3',
		B1: 'B1.mp3',
		B2: 'B2.mp3',
		B3: 'B3.mp3',
		B4: 'B4.mp3',
		'C#3': 'Cs3.mp3',
		'C#4': 'Cs4.mp3',
		'C#5': 'Cs5.mp3',
		D2: 'D2.mp3',
		D3: 'D3.mp3',
		D5: 'D5.mp3',
		'D#4': 'Ds4.mp3',
		E2: 'E2.mp3',
		E3: 'E3.mp3',
		E4: 'E4.mp3',
		E5: 'E5.mp3'
	},
	piano: {
		A7: 'A7.mp3',
		A1: 'A1.mp3',
		A2: 'A2.mp3',
		A3: 'A3.mp3',
		A4: 'A4.mp3',
		A5: 'A5.mp3',
		A6: 'A6.mp3',
		'A#7': 'As7.mp3',
		'A#1': 'As1.mp3',
		'A#2': 'As2.mp3',
		'A#3': 'As3.mp3',
		'A#4': 'As4.mp3',
		'A#5': 'As5.mp3',
		'A#6': 'As6.mp3',
		B7: 'B7.mp3',
		B1: 'B1.mp3',
		B2: 'B2.mp3',
		B3: 'B3.mp3',
		B4: 'B4.mp3',
		B5: 'B5.mp3',
		B6: 'B6.mp3',
		C7: 'C7.mp3',
		C1: 'C1.mp3',
		C2: 'C2.mp3',
		C3: 'C3.mp3',
		C4: 'C4.mp3',
		C5: 'C5.mp3',
		C6: 'C6.mp3',
		'C#7': 'Cs7.mp3',
		'C#1': 'Cs1.mp3',
		'C#2': 'Cs2.mp3',
		'C#3': 'Cs3.mp3',
		'C#4': 'Cs4.mp3',
		'C#5': 'Cs5.mp3',
		'C#6': 'Cs6.mp3',
		D7: 'D7.mp3',
		D1: 'D1.mp3',
		D2: 'D2.mp3',
		D3: 'D3.mp3',
		D4: 'D4.mp3',
		D5: 'D5.mp3',
		D6: 'D6.mp3',
		'D#7': 'Ds7.mp3',
		'D#1': 'Ds1.mp3',
		'D#2': 'Ds2.mp3',
		'D#3': 'Ds3.mp3',
		'D#4': 'Ds4.mp3',
		'D#5': 'Ds5.mp3',
		'D#6': 'Ds6.mp3',
		E7: 'E7.mp3',
		E1: 'E1.mp3',
		E2: 'E2.mp3',
		E3: 'E3.mp3',
		E4: 'E4.mp3',
		E5: 'E5.mp3',
		E6: 'E6.mp3',
		F7: 'F7.mp3',
		F1: 'F1.mp3',
		F2: 'F2.mp3',
		F3: 'F3.mp3',
		F4: 'F4.mp3',
		F5: 'F5.mp3',
		F6: 'F6.mp3',
		'F#7': 'Fs7.mp3',
		'F#1': 'Fs1.mp3',
		'F#2': 'Fs2.mp3',
		'F#3': 'Fs3.mp3',
		'F#4': 'Fs4.mp3',
		'F#5': 'Fs5.mp3',
		'F#6': 'Fs6.mp3',
		G7: 'G7.mp3',
		G1: 'G1.mp3',
		G2: 'G2.mp3',
		G3: 'G3.mp3',
		G4: 'G4.mp3',
		G5: 'G5.mp3',
		G6: 'G6.mp3',
		'G#7': 'Gs7.mp3',
		'G#1': 'Gs1.mp3',
		'G#2': 'Gs2.mp3',
		'G#3': 'Gs3.mp3',
		'G#4': 'Gs4.mp3',
		'G#5': 'Gs5.mp3',
		'G#6': 'Gs6.mp3'
	}
};

const SAMPLE_SETS = Object.keys(SAMPLE_MAPS) as SampleSet[];

/**
 * Audio-engine voice name → sample set. Drums have no recorded set (they stay
 * synthesised), so they map to `null` and keep their procedural kit.
 */
export function sampleSetForEngine(name: string): SampleSet | null {
	switch (name) {
		case 'electric':
		case 'clean':
			return 'guitar-electric';
		case 'acoustic':
			return 'guitar-acoustic';
		case 'nylon':
			return 'guitar-nylon';
		case 'bass':
			return 'bass-electric';
		case 'piano':
			return 'piano';
		default:
			return null;
	}
}

/** decoded buffers per set: note name → buffer. */
const cache = new Map<SampleSet, Record<string, Tone.ToneAudioBuffer>>();

/** Bookkeeping for an in-flight set load so concurrent callers can each track
 *  determinate progress (every listener is brought up to date on join). */
interface LoadState {
	promise: Promise<void>;
	completed: number;
	listeners: Set<() => void>;
}
const inflight = new Map<SampleSet, LoadState>();

export function isSetLoaded(set: SampleSet): boolean {
	return cache.has(set);
}

/** Total number of sample files in a set (for progress totals). */
export function sampleCount(set: SampleSet): number {
	return Object.keys(SAMPLE_MAPS[set]).length;
}

/**
 * Decode and cache every sample in a set. `onOne` fires once per file as it
 * finishes, so callers can drive a determinate progress bar. Idempotent and
 * concurrency-safe: a set already loaded resolves immediately; a set mid-load
 * is shared (a late caller is caught up on already-finished files, then gets
 * the remaining ticks), so every caller's progress reaches 100%.
 */
export function loadSet(set: SampleSet, onOne?: () => void): Promise<void> {
	if (cache.has(set)) return Promise.resolve();

	const existing = inflight.get(set);
	if (existing) {
		if (onOne) {
			for (let i = 0; i < existing.completed; i++) onOne(); // catch up
			existing.listeners.add(onOne);
		}
		return existing.promise;
	}

	const entries = Object.entries(SAMPLE_MAPS[set]);
	const buffers: Record<string, Tone.ToneAudioBuffer> = {};
	const state: LoadState = { promise: Promise.resolve(), completed: 0, listeners: new Set() };
	if (onOne) state.listeners.add(onOne);

	state.promise = Promise.all(
		entries.map(async ([note, file]) => {
			const buf = new Tone.ToneAudioBuffer();
			await buf.load(`${BASE_URL}${set}/${file}`);
			buffers[note] = buf;
			state.completed++;
			for (const fn of state.listeners) fn();
		})
	)
		.then(() => {
			cache.set(set, buffers);
			inflight.delete(set);
		})
		.catch((err) => {
			inflight.delete(set);
			throw err;
		});

	inflight.set(set, state);
	return state.promise;
}

/** Load several sets, returning their combined file total for progress UIs. */
export async function loadSets(sets: SampleSet[], onOne?: () => void): Promise<void> {
	await Promise.all([...new Set(sets)].map((s) => loadSet(s, onOne)));
}

/** Files still needing download across the given sets (0 = all cached). */
export function pendingSampleCount(sets: SampleSet[]): number {
	let n = 0;
	for (const s of new Set(sets)) if (!cache.has(s)) n += sampleCount(s);
	return n;
}

export { SAMPLE_SETS };

/**
 * Build a Tone.Sampler for a set from its cached buffers and connect it to
 * `dest`. The set must already be loaded (see loadSet); returns null otherwise
 * so the caller can fall back rather than throw mid-playback.
 */
export function createSampler(set: SampleSet, dest: Tone.InputNode): Tone.Sampler | null {
	const buffers = cache.get(set);
	if (!buffers) return null;
	const sampler = new Tone.Sampler({
		urls: buffers,
		// A short, natural release so notes don't click off when they end.
		release: 0.6,
		curve: 'exponential'
	});
	sampler.connect(dest as Tone.ToneAudioNode);
	return sampler;
}
