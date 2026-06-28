// SMuFL (Bravura) glyph code points used by the standard-notation renderer.
// We draw note heads/stems/beams as vector primitives and use the font only for
// clefs, time-signature digits, rests and a few ornaments where it reads best.
//
// Glyphs are built from explicit SMuFL code points (Private Use Area) via
// String.fromCodePoint so this source stays ASCII-readable and diffable.

import type { DurationValue } from '$lib/oto/types';

const cp = (n: number) => String.fromCodePoint(n);

export const GLYPH = {
	trebleClef: cp(0xe050),
	bassClef: cp(0xe062),
	restWhole: cp(0xe4e3),
	restHalf: cp(0xe4e4),
	restQuarter: cp(0xe4e5),
	restEighth: cp(0xe4e6),
	rest16th: cp(0xe4e7),
	rest32nd: cp(0xe4e8),
	augmentationDot: cp(0xe1e7),
	flag8thUp: cp(0xe240),
	flag16thUp: cp(0xe242),
	flag32ndUp: cp(0xe244),
	flag8thDown: cp(0xe241),
	flag16thDown: cp(0xe243),
	accidentalSharp: cp(0xe262),
	accidentalFlat: cp(0xe260),
	accidentalNatural: cp(0xe261)
} as const;

// SMuFL time-signature digits live at U+E080–U+E089 (timeSig0 … timeSig9). The
// plain ASCII digits don't carry the staff-specific design, so the time
// signature renders blank without these.
const TIME_SIG_DIGITS = Array.from({ length: 10 }, (_, d) => cp(0xe080 + d));

/** Render an integer as Bravura staff time-signature digits. */
export function timeSigGlyphs(n: number): string {
	return String(n)
		.split('')
		.map((d) => TIME_SIG_DIGITS[+d] ?? '')
		.join('');
}

/** Glyph for an accidental kind, or '' when none. */
export function accidentalGlyph(kind: 'sharp' | 'flat' | 'natural' | null): string {
	switch (kind) {
		case 'sharp':
			return GLYPH.accidentalSharp;
		case 'flat':
			return GLYPH.accidentalFlat;
		case 'natural':
			return GLYPH.accidentalNatural;
		default:
			return '';
	}
}

// Single-note glyphs (notehead + stem) for the duration picker UI. Drawn from
// the Bravura font so the picker matches the engraved score and renders
// identically across platforms, instead of relying on the system font's
// Musical-Symbol code points (which size inconsistently and may be missing).
const NOTE_GLYPHS: Record<DurationValue, string> = {
	1: cp(0xe1d2), // noteWhole
	2: cp(0xe1d3), // noteHalfUp
	4: cp(0xe1d5), // noteQuarterUp
	8: cp(0xe1d7), // note8thUp
	16: cp(0xe1d9), // note16thUp
	32: cp(0xe1db) // note32ndUp
};

/** Bravura single-note glyph for a duration (notehead + stem + flags). */
export function durationGlyph(d: DurationValue): string {
	return NOTE_GLYPHS[d] ?? '';
}

/** Bravura augmentation (dot) glyph, for the dotted-note button. */
export const AUGMENTATION_DOT = GLYPH.augmentationDot;

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
