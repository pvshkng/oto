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
	| 'vibrato'
	| 'palm-mute'
	| 'let-ring'
	| 'tap'
	| 'harmonic'
	| 'dead' // dead/muted note (x)
	| 'staccato'
	| 'ghost';

export const TECHNIQUE_LABELS: Record<Technique, string> = {
	hammer: 'Hammer-on',
	pull: 'Pull-off',
	slide: 'Slide',
	bend: 'Bend',
	release: 'Release',
	vibrato: 'Vibrato',
	'palm-mute': 'Palm Mute',
	'let-ring': 'Let Ring',
	tap: 'Tap',
	harmonic: 'Harmonic',
	dead: 'Dead Note',
	staccato: 'Staccato',
	ghost: 'Ghost Note'
};

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
	beats: OtoBeat[];
}

export type TrackKind = 'guitar' | 'bass' | 'ukulele' | 'custom';

/** Which notation systems are visible for a track. */
export interface TrackView {
	standard: boolean;
	tab: boolean;
	rhythm: boolean;
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
	tracks: OtoTrack[];
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
}
