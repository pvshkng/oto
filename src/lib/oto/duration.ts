// Duration & bar-capacity math.
//
// All durations are expressed as a fraction of a whole note. A 4/4 bar holds
// 4 quarter notes = 1 whole note of capacity. A 3/4 bar holds 3/4. We use this
// to detect bars that overflow (too many notes) and to schedule playback.

import type { DurationValue, OtoBeat, OtoMeasure } from './types';

/** Fraction of a whole note that a beat occupies (accounts for dotting). */
export function beatFraction(beat: OtoBeat): number {
	const base = 1 / beat.duration;
	return beat.dotted ? base * 1.5 : base;
}

/** Capacity of a measure as a fraction of a whole note. */
export function measureCapacity(timeSignature: [number, number]): number {
	const [num, den] = timeSignature;
	return num / den;
}

/** Total filled fraction of a measure. */
export function measureFilled(measure: OtoMeasure): number {
	return measure.beats.reduce((sum, b) => sum + beatFraction(b), 0);
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

/**
 * Index of the first beat (and the fraction into it) at which a measure
 * overflows its capacity. Beats at/after this point are skipped during playback.
 */
export function overflowCutoff(measure: OtoMeasure, defaultTimeSig: [number, number]): number {
	const capacity = measureCapacity(measure.timeSignature ?? defaultTimeSig);
	let acc = 0;
	for (let i = 0; i < measure.beats.length; i++) {
		acc += beatFraction(measure.beats[i]);
		if (acc > capacity + 1e-9) return i; // this beat starts the overflow
	}
	return measure.beats.length;
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
