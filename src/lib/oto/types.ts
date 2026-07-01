// Core type definitions for the .oto music notation format.
//
// The .oto format is a JSON document describing a multi-track score, conceptually
// similar to MIDI (multiple instruments, timing, pitches) but human-readable and
// tailored for guitar/bass tablature plus standard & rhythmic notation.

/** Note duration expressed as a denominator of a whole note. */
export type DurationValue = 1 | 2 | 4 | 8 | 16 | 32;

export const DURATION_LABELS: Record<DurationValue, string> = {
	1: 'Whole',
	2: 'Half',
	4: 'Quarter',
	8: 'Eighth',
	16: 'Sixteenth',
	32: 'Thirty-second'
};

/** SMuFL glyph for the note head + flags used in the duration picker. */
export const DURATION_GLYPHS: Record<DurationValue, string> = {
	1: '', // noteWhole
	2: '', // noteHalfUp
	4: '', // noteQuarterUp
	8: '', // note8thUp
	16: '', // note16thUp
	32: '' // note32ndUp
};

export type Technique =
	| 'hammer' // hammer-on
	| 'pull' // pull-off
	| 'slide' // slide up/down
	| 'bend'
	| 'release'
	| 'bend-release' // bend then release back
	| 'vibrato'
	| 'palm-mute'
	| 'let-ring'
	| 'tap'
	| 'harmonic' // natural harmonic
	| 'artificial-harmonic' // artificial harmonic (A.H.)
	| 'dead' // dead/muted note (x)
	| 'staccato'
	| 'ghost' // ghost note (parentheses)
	| 'accent' // accent (>)
	| 'grace'; // grace note

export const TECHNIQUE_LABELS: Record<Technique, string> = {
	hammer: 'Hammer-on',
	pull: 'Pull-off',
	slide: 'Slide',
	bend: 'Bend',
	release: 'Release',
	'bend-release': 'Bend/Release',
	vibrato: 'Vibrato',
	'palm-mute': 'Palm Mute',
	'let-ring': 'Let Ring',
	tap: 'Tap',
	harmonic: 'Nat. Harmonic',
	'artificial-harmonic': 'Art. Harmonic',
	dead: 'Dead Note',
	staccato: 'Staccato',
	ghost: 'Ghost Note',
	accent: 'Accent',
	grace: 'Grace Note'
};

/** Circle-of-fifths lookup: fifths offset -> major/relative-minor key names. */
export const KEY_SIGS: { fifths: number; major: string; minor: string }[] = [
	{ fifths: -7, major: 'Cb', minor: 'Ab' },
	{ fifths: -6, major: 'Gb', minor: 'Eb' },
	{ fifths: -5, major: 'Db', minor: 'Bb' },
	{ fifths: -4, major: 'Ab', minor: 'F' },
	{ fifths: -3, major: 'Eb', minor: 'C' },
	{ fifths: -2, major: 'Bb', minor: 'G' },
	{ fifths: -1, major: 'F', minor: 'D' },
	{ fifths: 0, major: 'C', minor: 'A' },
	{ fifths: 1, major: 'G', minor: 'E' },
	{ fifths: 2, major: 'D', minor: 'B' },
	{ fifths: 3, major: 'A', minor: 'F#' },
	{ fifths: 4, major: 'E', minor: 'C#' },
	{ fifths: 5, major: 'B', minor: 'G#' },
	{ fifths: 6, major: 'F#', minor: 'D#' },
	{ fifths: 7, major: 'C#', minor: 'A#' }
];

/** A single fretted note on a specific string within a beat. */
export interface OtoNote {
	/** String index, 0 = highest-pitched string (top of tab) … n = lowest. */
	string: number;
	/** Fret number. 0 = open. -1 reserved for "no note". */
	fret: number;
	/** Techniques/effects attached to this note. */
	techniques?: Technique[];
	/** For bends: amount in semitones (e.g. 1 = full, 0.5 = half). */
	bend?: number;
	/** For slides: destination fret. */
	slideTo?: number;
	/** Tie to the next beat's note on the same string. */
	tied?: boolean;
}

/**
 * A "beat" is a vertical slice of time in a measure. It has one duration and may
 * contain multiple simultaneous notes (a chord) or be a rest.
 */
export interface OtoBeat {
	/** Duration denominator (4 = quarter note, 8 = eighth, …). */
	duration: DurationValue;
	/** Dotted note → 1.5× duration. */
	dotted?: boolean;
	/** Notes sounding on this beat. Empty + rest=true → a rest. */
	notes: OtoNote[];
	/** True when this beat is an explicit rest. */
	rest?: boolean;
}

export interface OtoMeasure {
	/** Per-measure time signature override. Falls back to track default. */
	timeSignature?: [number, number];
	/** Per-measure tempo override (BPM). */
	tempo?: number;
	/** Voice 1 (primary). Always present. */
	beats: OtoBeat[];
	/**
	 * Optional voice 2. A second independent rhythm that sounds at the same time
	 * as voice 1 — this is what lets, say, a sustained half note ring under a run
	 * of eighth notes, instead of forcing every note to share one duration.
	 */
	voice2?: OtoBeat[];
}

/** All non-empty voices of a measure, voice 0 first. */
export function measureVoices(m: OtoMeasure): OtoBeat[][] {
	return m.voice2 && m.voice2.length ? [m.beats, m.voice2] : [m.beats];
}

export type TrackKind = 'guitar' | 'bass' | 'ukulele' | 'custom';

/** Which notation systems are visible for a track. */
export interface TrackView {
	standard: boolean;
	tab: boolean;
	rhythm: boolean;
}

/** Three-band EQ in decibels (−12..+12). 0 across the board = flat / bypassed. */
export interface TrackEq {
	low: number;
	mid: number;
	high: number;
}

/** A structural anchor placed at a measure (e.g. "Intro", "Chorus"). */
export interface Section {
	id: string;
	/** Zero-based measure the section starts on. */
	measure: number;
	label: string;
}

export interface OtoTrack {
	id: string;
	name: string;
	kind: TrackKind;
	/** Tuning from highest string (index 0) to lowest, as scientific pitch (e.g. "E4"). */
	tuning: string[];
	capo: number;
	/** Semitone transposition applied at playback/display time. */
	transpose: number;
	/** Tone.js oscillator/instrument preset name. */
	instrument: string;
	/** 0..1 */
	volume: number;
	/** Stereo position, −1 (hard left) … 0 (centre) … +1 (hard right). */
	pan: number;
	/** Three-band EQ. Defaults to flat. */
	eq: TrackEq;
	muted: boolean;
	soloed: boolean;
	view: TrackView;
	measures: OtoMeasure[];
	color: string;
}

export interface OtoScore {
	format: 'oto';
	version: number;
	title: string;
	artist: string;
	/** Global default tempo (BPM). Measures may override. */
	tempo: number;
	/** Global default time signature. Measures may override. */
	timeSignature: [number, number];
	/** Key signature as a circle-of-fifths count: 0 = C/Am, positive = sharps,
	 *  negative = flats (range -7..7). */
	keySignature: number;
	/** Master output level, 0..1. */
	masterVolume: number;
	tracks: OtoTrack[];
	/** Structural section markers along the timeline. */
	sections: Section[];
	createdAt: string;
	updatedAt: string;
}

/** A location within the score for cursor/selection. */
export interface ScorePosition {
	track: number;
	measure: number;
	beat: number;
	/** String index, used when entering fret numbers. */
	string: number;
	/** Active voice (0 = primary, 1 = second voice). */
	voice: number;
}
