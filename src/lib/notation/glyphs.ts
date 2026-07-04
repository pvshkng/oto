// SMuFL (Bravura) glyph code points used by the standard-notation renderer.
// We draw note heads/stems/beams as vector primitives and use the font only for
// clefs, time-signature digits, rests and a few ornaments where it reads best.
//
// Glyphs are built from explicit SMuFL code points (Private Use Area) via
// String.fromCodePoint so this source stays ASCII-readable and diffable.

import type { Dynamic, DurationValue } from '$lib/oto/types';

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
	accidentalNatural: cp(0xe261),
	// Small quarter note designed for tempo markings (e.g. "♩ = 120").
	metNoteQuarterUp: cp(0xeca5),
	// Navigation / structure marks.
	segno: cp(0xe047),
	coda: cp(0xe048),
	fermataAbove: cp(0xe4c0),
	/** Simile: repeat the previous bar (%). */
	repeat1Bar: cp(0xe500)
} as const;

// SMuFL tuplet digits live at U+E880–U+E889 (tuplet0 … tuplet9).
const TUPLET_DIGITS = Array.from({ length: 10 }, (_, d) => cp(0xe880 + d));

/** Render a tuplet number as Bravura tuplet digits. */
export function tupletGlyphs(n: number): string {
	return String(n)
		.split('')
		.map((d) => TUPLET_DIGITS[+d] ?? '')
		.join('');
}

// Bravura dynamics glyphs (single pre-composed glyphs, U+E520 block), so the
// marks render with the engraved italic look instead of a faux-italic web font.
const DYNAMIC_GLYPHS: Record<Dynamic, string> = {
	ppp: cp(0xe52a), // dynamicPPP
	pp: cp(0xe52b), // dynamicPP
	p: cp(0xe520), // dynamicPiano
	mp: cp(0xe52c), // dynamicMP
	mf: cp(0xe52d), // dynamicMF
	f: cp(0xe522), // dynamicForte
	ff: cp(0xe52f), // dynamicFF
	fff: cp(0xe530), // dynamicFFF
	fp: cp(0xe534), // dynamicFortePiano
	fz: cp(0xe535), // dynamicForzando
	sf: cp(0xe536), // dynamicSforzando1
	sfz: cp(0xe539), // dynamicSforzato
	sffz: cp(0xe53b) // dynamicSforzatoFF
};

/** Bravura glyph for a dynamic marking. */
export function dynamicGlyph(d: Dynamic): string {
	return DYNAMIC_GLYPHS[d] ?? '';
}

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
// semitone -> diatonic step within octave (C=0), spelling each black key as the
// sharp of its lower neighbour (the default, key-of-C-friendly spelling).
const DIATONIC_SHARP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
// Same black keys, spelled as the flat of their upper neighbour instead — used
// for flat key signatures so accidentals land on the expected staff position
// (e.g. Bb on B's line, not A's).
const DIATONIC_FLAT = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
// Which semitones are black keys at all — same set regardless of spelling.
const IS_ALTERED = [false, true, false, true, false, false, true, false, true, false, true, false];

export interface StaffStep {
	/** diatonic steps relative to middle C (C4 = 0), positive = higher. */
	step: number;
	/** Accidental implied by this pitch's spelling, or null for a natural-letter pitch. */
	accidentalHint: 'sharp' | 'flat' | null;
}

/** `preferFlat` spells black keys as flats (for flat key signatures) instead of sharps. */
export function midiToStaffStep(midi: number, preferFlat = false): StaffStep {
	const pc = ((midi % 12) + 12) % 12;
	const octave = Math.floor(midi / 12) - 1; // C4 -> octave 4
	const diatonic = preferFlat ? DIATONIC_FLAT : DIATONIC_SHARP;
	const step = (octave - 4) * 7 + diatonic[pc];
	const accidentalHint = IS_ALTERED[pc] ? (preferFlat ? 'flat' : 'sharp') : null;
	return { step, accidentalHint };
}
