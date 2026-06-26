// SMuFL (Bravura) glyph code points used by the standard-notation renderer.
// We draw note heads/stems/beams as vector primitives and use the font only for
// clefs, time-signature digits, rests and a few ornaments where it reads best.

export const GLYPH = {
	trebleClef: '',
	bassClef: '',
	restWhole: '',
	restHalf: '',
	restQuarter: '',
	restEighth: '',
	rest16th: '',
	rest32nd: '',
	augmentationDot: '',
	flag8thUp: '',
	flag16thUp: '',
	flag32ndUp: '',
	flag8thDown: '',
	flag16thDown: ''
} as const;

import type { DurationValue } from '$lib/oto/types';

export function restGlyph(d: DurationValue): string {
	switch (d) {
		case 1:
			return GLYPH.restWhole;
		case 2:
			return GLYPH.restHalf;
		case 4:
			return GLYPH.restQuarter;
		case 8:
			return GLYPH.restEighth;
		case 16:
			return GLYPH.rest16th;
		case 32:
			return GLYPH.rest32nd;
	}
}

/** Number of beams/flags for a duration (eighth = 1, sixteenth = 2, …). */
export function beamCount(d: DurationValue): number {
	switch (d) {
		case 8:
			return 1;
		case 16:
			return 2;
		case 32:
			return 3;
		default:
			return 0;
	}
}

/** Treble-clef diatonic staff step for a MIDI pitch.
 * Returns the number of diatonic steps above the bottom staff line (E4 = 0 in
 * treble for line positions). We map to a "position" where each step = half a
 * staff-line gap. Higher pitch = smaller y. */
const DIATONIC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // semitone -> diatonic step within octave (C=0)
const IS_SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];

export interface StaffStep {
	/** diatonic steps relative to middle C (C4 = 0), positive = higher. */
	step: number;
	sharp: boolean;
}

export function midiToStaffStep(midi: number): StaffStep {
	const pc = ((midi % 12) + 12) % 12;
	const octave = Math.floor(midi / 12) - 1; // C4 -> octave 4
	const step = (octave - 4) * 7 + DIATONIC[pc];
	return { step, sharp: IS_SHARP[pc] };
}
