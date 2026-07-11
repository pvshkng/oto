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
	| 'wide-vibrato' // wide/slow vibrato (Guitar Pro "wide")
	| 'trill' // trill (tr)
	| 'tremolo' // tremolo picking
	| 'palm-mute'
	| 'let-ring'
	| 'tap'
	| 'slap' // bass slap (S)
	| 'pop' // bass pop (P)
	| 'harmonic' // natural harmonic
	| 'artificial-harmonic' // artificial harmonic (A.H.)
	| 'dead' // dead/muted note (x)
	| 'staccato'
	| 'tenuto' // tenuto (–)
	| 'ghost' // ghost note (parentheses)
	| 'accent' // accent (>)
	| 'heavy-accent' // heavy accent / marcato (^)
	| 'fade-in' // fade in / volume swell
	| 'grace'; // grace note

export const TECHNIQUE_LABELS: Record<Technique, string> = {
	hammer: 'Hammer-on',
	pull: 'Pull-off',
	slide: 'Slide',
	bend: 'Bend',
	release: 'Release',
	'bend-release': 'Bend/Release',
	vibrato: 'Vibrato',
	'wide-vibrato': 'Wide Vibrato',
	trill: 'Trill',
	tremolo: 'Tremolo Picking',
	'palm-mute': 'Palm Mute',
	'let-ring': 'Let Ring',
	tap: 'Tap',
	slap: 'Slap',
	pop: 'Pop',
	harmonic: 'Nat. Harmonic',
	'artificial-harmonic': 'Art. Harmonic',
	dead: 'Dead Note',
	staccato: 'Staccato',
	tenuto: 'Tenuto',
	ghost: 'Ghost Note',
	accent: 'Accent',
	'heavy-accent': 'Heavy Accent',
	'fade-in': 'Fade In',
	grace: 'Grace Note'
};

/** All valid technique values — used to sanitise techniques read from disk. */
export const TECHNIQUES = Object.keys(TECHNIQUE_LABELS) as Technique[];

export function isTechnique(v: unknown): v is Technique {
	return typeof v === 'string' && (TECHNIQUES as string[]).includes(v);
}

/**
 * Dynamic marking attached to a beat. Ordered soft → loud, with the accented
 * ("subito"/sforzando family) marks after the plain levels, mirroring the
 * Guitar Pro dynamics palette.
 */
export type Dynamic =
	| 'ppp'
	| 'pp'
	| 'p'
	| 'mp'
	| 'mf'
	| 'f'
	| 'ff'
	| 'fff'
	| 'fp' // fortepiano
	| 'fz' // forzando
	| 'sf' // sforzando
	| 'sfz' // sforzato
	| 'sffz'; // sforzato-fortissimo

export const DYNAMICS: Dynamic[] = [
	'ppp',
	'pp',
	'p',
	'mp',
	'mf',
	'f',
	'ff',
	'fff',
	'fp',
	'fz',
	'sf',
	'sfz',
	'sffz'
];

export function isDynamic(v: unknown): v is Dynamic {
	return typeof v === 'string' && (DYNAMICS as string[]).includes(v);
}

/**
 * Playback velocity (0..1) for each dynamic. The sforzando family plays at
 * forte-or-louder attack strength — the notation carries the nuance.
 */
export const DYNAMIC_VELOCITY: Record<Dynamic, number> = {
	ppp: 0.16,
	pp: 0.26,
	p: 0.38,
	mp: 0.52,
	mf: 0.66,
	f: 0.8,
	ff: 0.9,
	fff: 1,
	fp: 0.85,
	fz: 0.9,
	sf: 0.85,
	sfz: 0.92,
	sffz: 1
};

/** Octave-transposition marks drawn over/under the standard staff. */
export type Ottava = '8va' | '8vb' | '15ma' | '15mb';

export const OTTAVAS: Ottava[] = ['8va', '8vb', '15ma', '15mb'];

export function isOttava(v: unknown): v is Ottava {
	return typeof v === 'string' && (OTTAVAS as string[]).includes(v);
}

/** Tab strum (brush) direction for a chord beat. */
export type StrumDirection = 'up' | 'down';

export function isStrumDirection(v: unknown): v is StrumDirection {
	return v === 'up' || v === 'down';
}

/**
 * Supported tuplet sizes: N notes in the time of the next-lower power of two
 * (3:2, 5:4, 6:4, 7:4, 9:8) — see `tupletFactor` in `./duration`.
 */
export const TUPLET_VALUES = [3, 5, 6, 7, 9] as const;
export type TupletValue = (typeof TUPLET_VALUES)[number];

export function isTupletValue(v: unknown): v is TupletValue {
	return typeof v === 'number' && (TUPLET_VALUES as readonly number[]).includes(v);
}

/** End-of-measure barline style. Default (undefined) is a single thin line. */
export type BarlineStyle = 'double';

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
	/** Tie: this note continues the most recent earlier note on the same string
	 *  (possibly several beats or bars back) instead of restriking — the origin
	 *  keeps sounding through this note's duration. Set on the destination. */
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
	/**
	 * Tuplet membership: this beat is one of N notes played in the time of the
	 * next-lower power of two (3 = triplet, 5 = quintuplet, …). Scales the
	 * beat's duration by that ratio; consecutive same-N beats render under one
	 * bracket.
	 */
	tuplet?: TupletValue;
	/** Dynamic marking shown under the staff (also drives playback velocity). */
	dynamic?: Dynamic;
	/** Strum/brush direction arrow next to the chord in tab. */
	strum?: StrumDirection;
	/** Fermata (hold) over this beat. */
	fermata?: boolean;
	/** Octave sign over/under the standard staff for this beat. */
	ottava?: Ottava;
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
	/** Closing barline style ('double' = thin+thin section barline). */
	barline?: BarlineStyle;
	/** Begin-repeat barline (thick + thin + dots) at the start of this measure. */
	repeatStart?: boolean;
	/** End-repeat barline (dots + thin + thick) at the end of this measure. */
	repeatEnd?: boolean;
	/** Number of times the repeated passage plays (with repeatEnd; default 2). */
	repeatCount?: number;
	/** Volta bracket (alternate ending) number this measure belongs to. */
	volta?: number;
	/** Simile mark: this bar repeats the previous bar's content (%). */
	simile?: boolean;
	/** Segno mark at the start of this measure. */
	segno?: boolean;
	/** Coda mark at the start of this measure. */
	coda?: boolean;
	/** Locked bar: content edits (notes, beats, clearing, deleting) are rejected
	 *  until unlocked, so a finished bar can't be changed accidentally. */
	locked?: boolean;
	/** Force this bar to start a new system (line) in the score layout,
	 *  regardless of how many bars would otherwise fit on the previous line. */
	lineBreak?: boolean;
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

/**
 * Configuration for the single optional audio backing track. This lives inside
 * the .oto document so tempo/position/pitch survive a save — but the audio file
 * itself does NOT (it can be megabytes and isn't ours to embed). The bytes are
 * cached per-browser in IndexedDB, so a reload usually restores them silently;
 * when that cache misses (another browser, cleared storage), reopening shows an
 * empty audio slot until the user re-imports the same file, at which point
 * everything realigns.
 */
export interface AudioTrackConfig {
	/** Original file name — shown in the track header and used to prompt the user
	 *  to re-add the matching file when a saved document is reopened. */
	fileName: string;
	/** Display name (defaults to the file name; user-editable). */
	name: string;
	/**
	 * Where the audio's start (its own time 0) sits on the song timeline, in
	 * seconds measured from the song start (measure 0, beat 0). Positive → the
	 * audio begins later than the song (e.g. a count-in of silence before it).
	 * Negative → the audio's head is pushed left of the song start, so that part
	 * is hidden/skipped and the audio is already mid-way when the song begins —
	 * the way you line a long no-notes intro up with bar 1.
	 */
	offsetSec: number;
	/** Playback gain, 0..1. */
	volume: number;
	muted: boolean;
	soloed: boolean;
	/** The audio's own musical tempo in BPM, used by the tempo-match tool to
	 *  time-stretch it onto the song's grid. Undefined until the user sets it. */
	sourceTempo?: number;
	/** When true, time-stretch the audio (pitch preserved) so its tempo matches
	 *  the song tempo. Requires sourceTempo. */
	matchTempo: boolean;
	/** Pitch shift applied to the audio, in semitones (−12..+12). 0 = bypassed. */
	pitchSemitones: number;
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
	/** Audio engine voice name (mapped to a General MIDI program at playback). */
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
	/** Optional single audio backing track. The file bytes are never persisted
	 *  here — only the alignment/tempo/pitch config (see AudioTrackConfig). */
	audio?: AudioTrackConfig;
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
