// Duration & bar-capacity math.
//
// All durations are expressed as a fraction of a whole note. A 4/4 bar holds
// 4 quarter notes = 1 whole note of capacity. A 3/4 bar holds 3/4. We use this
// to detect bars that overflow (too many notes) and to schedule playback.

import {
	measureVoices,
	type DurationValue,
	type OtoBeat,
	type OtoMeasure,
	type TupletValue
} from './types';

/**
 * Time-scaling factor for a tuplet: N notes in the time of M, where M is the
 * next-lower power of two (3:2, 5:4, 6:4, 7:4, 9:8). Each member's nominal
 * duration is multiplied by M/N, so e.g. three triplet eighths fill exactly
 * one quarter note.
 */
export function tupletFactor(n: TupletValue): number {
	const m = Math.pow(2, Math.floor(Math.log2(n)));
	return m / n;
}

/** Fraction of a whole note that a beat occupies (accounts for dotting + tuplets). */
export function beatFraction(beat: OtoBeat): number {
	let frac = 1 / beat.duration;
	if (beat.dotted) frac *= 1.5;
	if (beat.tuplet) frac *= tupletFactor(beat.tuplet);
	return frac;
}

/** Capacity of a measure as a fraction of a whole note. */
export function measureCapacity(timeSignature: [number, number]): number {
	const [num, den] = timeSignature;
	return num / den;
}

/** Summed fraction of a single voice (beat list). */
export function beatsFilled(beats: OtoBeat[]): number {
	return beats.reduce((sum, b) => sum + beatFraction(b), 0);
}

/** Filled fraction of a measure = its longest voice. */
export function measureFilled(measure: OtoMeasure): number {
	return Math.max(...measureVoices(measure).map(beatsFilled));
}

export interface MeasureFill {
	filled: number;
	capacity: number;
	/** True when content exceeds the bar capacity (rendered red). */
	overflow: boolean;
	/** True when there is unused space left in the bar. */
	underfilled: boolean;
	/** Remaining capacity (>= 0). */
	remaining: number;
}

export function analyzeMeasure(measure: OtoMeasure, defaultTimeSig: [number, number]): MeasureFill {
	const capacity = measureCapacity(measure.timeSignature ?? defaultTimeSig);
	const filled = measureFilled(measure);
	const epsilon = 1e-9;
	return {
		filled,
		capacity,
		overflow: filled > capacity + epsilon,
		underfilled: filled < capacity - epsilon,
		remaining: Math.max(0, capacity - filled)
	};
}

/** First beat index in a voice at which capacity is exceeded (skipped on play). */
export function beatsCutoff(beats: OtoBeat[], capacity: number): number {
	let acc = 0;
	for (let i = 0; i < beats.length; i++) {
		acc += beatFraction(beats[i]);
		if (acc > capacity + 1e-9) return i;
	}
	return beats.length;
}

/**
 * Index of the first beat (in voice 1) at which a measure overflows its
 * capacity. Beats at/after this point are skipped during playback.
 */
export function overflowCutoff(measure: OtoMeasure, defaultTimeSig: [number, number]): number {
	const capacity = measureCapacity(measure.timeSignature ?? defaultTimeSig);
	return beatsCutoff(measure.beats, capacity);
}

/** Beats per whole note in seconds, given a tempo where the beat = quarter note. */
export function wholeNoteSeconds(tempo: number, beatUnit: number = 4): number {
	// One quarter note = 60/tempo seconds. A whole note = 4 quarter notes.
	const quarterSeconds = 60 / tempo;
	return quarterSeconds * (beatUnit === 4 ? 4 : 4);
}

/** Duration of one beat in seconds at the given tempo (quarter-note beat). */
export function beatSeconds(beat: OtoBeat, tempo: number): number {
	return beatFraction(beat) * (60 / tempo) * 4;
}

export const DURATION_ORDER: DurationValue[] = [1, 2, 4, 8, 16, 32];
