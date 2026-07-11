// Guitar Pro import → .oto conversion.
//
// alphaTab parses Guitar Pro files (GP3/4/5, GPX, GP7) entirely in the browser,
// so no backend is required — we load the bytes, walk alphaTab's score model and
// translate it into our .oto document. The heavy alphaTab module is loaded on
// demand (dynamic import) so it never bloats the initial bundle.
//
// Model mapping notes (verified against alphaTab 1.7):
//  - Score → OtoScore; Track[0..] → OtoTrack (first stringed staff, or the first
//    percussion staff for a drum kit track — see convertDrumTrack).
//  - alphaTab `Duration` enum already matches our denominators (Quarter=4 …).
//  - alphaTab numbers strings 1..N from the LOWEST pitch, while .oto indexes 0..N
//    from the HIGHEST. So otoString = tuning.length - note.string.
//  - Tuning is an array of MIDI numbers, highest string first (same order as us).
//  - Percussion notes carry no fret/string; alphaTab identifies the GM drum piece
//    via `note.percussionArticulation`, an index into `track.percussionArticulations`
//    (each with an `outputMidiNumber`). When that list doesn't contain the index
//    (true for GP3-5 files, which never populate it), the raw value IS the GM
//    percussion MIDI number already — see PercussionMapper in alphaTab's source.
//    We build one .oto tuning line per distinct GM piece used (fret always 0) so
//    every hit round-trips to the exact sample our drum kit (oto/drums.ts) expects.

import { midiToNote } from '$lib/oto/pitch';
import { makeScore, makeTrack } from '$lib/oto/format';
import type {
	DurationValue,
	OtoBeat,
	OtoMeasure,
	OtoNote,
	OtoScore,
	OtoTrack,
	Technique,
	TrackKind
} from '$lib/oto/types';

// --- Minimal structural views of the alphaTab model we read. Kept local so this
// module carries no static dependency on alphaTab (only the dynamic import does).

interface AtNote {
	string: number;
	fret: number;
	isPalmMute?: boolean;
	isLetRing?: boolean;
	isStaccato?: boolean;
	isGhost?: boolean;
	isDead?: boolean;
	isHammerPullOrigin?: boolean;
	hammerPullDestination?: { fret: number } | null;
	isTieDestination?: boolean;
	vibrato?: number; // 0 = none
	harmonicType?: number; // 0 = none; 1 = natural, 2+ = artificial/pinch/tap/semi
	bendType?: number; // 0 = none
	hasBend?: boolean;
	maxBendPoint?: { value: number } | null;
	slideOutType?: number; // 0 = none
	slideInType?: number; // 0 = none
	slideTarget?: { fret: number } | null;
	accentuated?: number; // AccentuationType: 0 none, 1 normal, 2 heavy, 3 tenuto
	isLeftHandTapped?: boolean;
	trillValue?: number; // -1 = no trill; >= 0 = trill fret as MIDI value
	isPercussion?: boolean;
	percussionArticulation?: number;
}
interface AtBeat {
	duration: number;
	dots?: number;
	isRest?: boolean;
	isPalmMute?: boolean;
	isLetRing?: boolean;
	vibrato?: number; // VibratoType: 0 none, 1 slight, 2 wide
	slap?: boolean;
	pop?: boolean;
	tap?: boolean;
	fade?: number; // FadeType: 0 none, 1 fade-in, 2 fade-out, 3 volume swell
	graceType?: number; // GraceType: 0 = none
	tremoloSpeed?: number | null; // tremolo picking speed (Duration); null = none
	notes: AtNote[];
}
interface AtVoice {
	isEmpty: boolean;
	beats: AtBeat[];
}
interface AtMasterBar {
	timeSignatureNumerator: number;
	timeSignatureDenominator: number;
}
interface AtBar {
	voices: AtVoice[];
	masterBar: AtMasterBar;
}
interface AtStaff {
	tuning: number[];
	capo?: number;
	isPercussion?: boolean;
	bars: AtBar[];
}
interface AtInstrumentArticulation {
	outputMidiNumber: number;
}
interface AtTrack {
	name: string;
	staves: AtStaff[];
	playbackInfo?: { volume?: number; program?: number };
	percussionArticulations?: AtInstrumentArticulation[];
}
export interface AtScore {
	title?: string;
	artist?: string;
	music?: string;
	subTitle?: string;
	tempo: number;
	masterBars?: {
		timeSignatureNumerator: number;
		timeSignatureDenominator: number;
		keySignature?: number;
	}[];
	tracks: AtTrack[];
}

const ALLOWED: DurationValue[] = [1, 2, 4, 8, 16, 32];

function clampDuration(d: number): DurationValue {
	if (d <= 0) return 1; // double/quadruple whole → treat as whole
	if ((ALLOWED as number[]).includes(d)) return d as DurationValue;
	return d > 32 ? 32 : 4;
}

function firstStringedStaff(track: AtTrack): AtStaff | null {
	for (const s of track.staves) if (s.tuning && s.tuning.length > 0) return s;
	return null;
}

function firstPercussionStaff(track: AtTrack): AtStaff | null {
	for (const s of track.staves) if (s.isPercussion) return s;
	return null;
}

/**
 * Resolve a percussion note to its GM drum-kit MIDI number. Prefers the
 * track's explicit articulation mapping (populated by GP6/7 and alphaTex);
 * falls back to treating the raw index as the GM number directly, which is
 * how GP3-5 binaries encode it (see module notes above).
 */
function percussionMidi(note: AtNote, track: AtTrack): number | undefined {
	const idx = note.percussionArticulation;
	if (idx === undefined || idx < 0) return undefined;
	const articulation = track.percussionArticulations?.[idx];
	return articulation ? articulation.outputMidiNumber : idx;
}

function noteTechniques(note: AtNote, beat: AtBeat): Technique[] {
	const t: Technique[] = [];
	if (note.isPalmMute || beat.isPalmMute) t.push('palm-mute');
	if (note.isLetRing || beat.isLetRing) t.push('let-ring');
	// VibratoType distinguishes slight (1) from wide (2), on either note or beat.
	const vibrato = Math.max(note.vibrato ?? 0, beat.vibrato ?? 0);
	if (vibrato === 1) t.push('vibrato');
	else if (vibrato >= 2) t.push('wide-vibrato');
	if ((note.trillValue ?? -1) >= 0) t.push('trill');
	if (note.isHammerPullOrigin) {
		// Same alphaTab flag covers both directions; the destination fret tells
		// them apart (higher fret = hammer-on, lower/equal = pull-off).
		const destFret = note.hammerPullDestination?.fret;
		t.push(typeof destFret === 'number' && destFret < note.fret ? 'pull' : 'hammer');
	}
	const harmonic = note.harmonicType ?? 0;
	if (harmonic === 1) t.push('harmonic');
	else if (harmonic > 1) t.push('artificial-harmonic');
	if (note.isStaccato) t.push('staccato');
	if (note.isGhost) t.push('ghost');
	if (note.isDead) t.push('dead');
	if (note.hasBend || (note.bendType ?? 0) > 0) t.push('bend');
	if ((note.slideOutType ?? 0) > 0 || (note.slideInType ?? 0) > 0 || note.slideTarget)
		t.push('slide');
	// AccentuationType: 1 = normal accent, 2 = heavy accent, 3 = tenuto.
	const accent = note.accentuated ?? 0;
	if (accent === 1) t.push('accent');
	else if (accent === 2) t.push('heavy-accent');
	else if (accent === 3) t.push('tenuto');
	if (note.isLeftHandTapped || beat.tap) t.push('tap');
	if (beat.slap) t.push('slap');
	if (beat.pop) t.push('pop');
	// FadeType fade-in (1) and volume swell (3) both start from silence.
	if (beat.fade === 1 || beat.fade === 3) t.push('fade-in');
	if (beat.tremoloSpeed !== null && beat.tremoloSpeed !== undefined) t.push('tremolo');
	if ((beat.graceType ?? 0) > 0) t.push('grace');
	return t;
}

/** alphaTab bend points are in quarter-tones; convert the peak to semitones. */
function bendSemitones(note: AtNote): number | undefined {
	if (!(note.hasBend || (note.bendType ?? 0) > 0)) return undefined;
	const v = note.maxBendPoint?.value;
	if (typeof v === 'number' && v > 0) return Math.max(0.5, Math.round((v / 2) * 2) / 2);
	return 1;
}

/**
 * Shared bar/voice/beat walk: turns alphaTab bars into .oto measures given a
 * per-note converter. `convertNote` returning null drops the note (e.g. a
 * percussion hit whose piece couldn't be resolved) without dropping the beat.
 */
function convertMeasures(
	bars: AtBar[],
	fallbackTs: [number, number],
	convertNote: (note: AtNote, beat: AtBeat) => OtoNote | null
): OtoMeasure[] {
	const convertBeats = (atBeats: AtBeat[] | undefined): OtoBeat[] =>
		(atBeats ?? []).map((beat) => {
			const notes: OtoNote[] = (beat.notes ?? [])
				.map((n) => convertNote(n, beat))
				.filter((n): n is OtoNote => n !== null);
			return {
				duration: clampDuration(beat.duration),
				dotted: (beat.dots ?? 0) > 0,
				notes,
				rest: beat.isRest || notes.length === 0
			};
		});

	return bars.map((bar) => {
		const ts: [number, number] = [
			bar.masterBar?.timeSignatureNumerator ?? fallbackTs[0],
			bar.masterBar?.timeSignatureDenominator ?? fallbackTs[1]
		];
		// Voice 0 → beats; a second non-empty voice → voice2 (mixed durations).
		const filled = (bar.voices ?? []).filter((v) => !v.isEmpty);
		const primary = filled[0] ?? bar.voices?.[0];
		const beats = convertBeats(primary?.beats);
		const secondary = filled[1];
		const voice2 = secondary ? convertBeats(secondary.beats) : undefined;
		return {
			timeSignature: ts,
			beats: beats.length ? beats : [{ duration: 4, notes: [], rest: true }],
			voice2: voice2 && voice2.length ? voice2 : undefined
		};
	});
}

function convertStringedTrack(
	track: AtTrack,
	staff: AtStaff,
	index: number,
	fallbackTs: [number, number]
): OtoTrack {
	const tuning = staff.tuning.map((m) => midiToNote(m));
	const stringCount = tuning.length;
	const kind: TrackKind = stringCount === 4 ? 'bass' : stringCount === 6 ? 'guitar' : 'custom';
	const program = track.playbackInfo?.program ?? 25;
	const instrument =
		kind === 'bass'
			? 'bass'
			: program === 24
				? 'nylon'
				: program === 25
					? 'acoustic'
					: program === 27 || program === 28
						? 'clean'
						: program >= 26 && program <= 31
							? 'electric'
							: 'clean';

	const convertNote = (n: AtNote, beat: AtBeat): OtoNote => {
		const otoString = Math.max(0, Math.min(stringCount - 1, stringCount - n.string));
		const techniques = noteTechniques(n, beat);
		const out: OtoNote = { string: otoString, fret: n.fret };
		if (techniques.length) out.techniques = techniques;
		const bend = bendSemitones(n);
		if (bend !== undefined) out.bend = bend;
		if (n.slideTarget) out.slideTo = n.slideTarget.fret;
		if (n.isTieDestination) out.tied = true;
		return out;
	};

	const measures = convertMeasures(staff.bars, fallbackTs, convertNote);

	return makeTrack({
		name: track.name?.trim() || `Track ${index + 1}`,
		kind,
		tuning,
		capo: staff.capo ?? 0,
		instrument,
		volume: Math.min(1, (track.playbackInfo?.volume ?? 12) / 16),
		view: { standard: true, tab: true, rhythm: false },
		measures: measures.length ? measures : undefined
	});
}

/**
 * Convert a percussion staff into a drum-kit .oto track. Each distinct GM
 * piece used gets its own tuning line (fret always 0, highest pitch first,
 * matching the app's own "Drum Kit" preset convention — see oto/drums.ts) so
 * the audio engine's GM lookup and the tab display both stay exact.
 */
function convertDrumTrack(
	track: AtTrack,
	staff: AtStaff,
	index: number,
	fallbackTs: [number, number]
): OtoTrack | null {
	const midis = new Set<number>();
	for (const bar of staff.bars ?? [])
		for (const voice of bar.voices ?? [])
			for (const beat of voice.beats ?? [])
				for (const note of beat.notes ?? []) {
					const midi = percussionMidi(note, track);
					if (midi !== undefined) midis.add(Math.round(midi));
				}
	if (midis.size === 0) return null; // no resolvable percussion hits

	const orderedMidis = Array.from(midis).sort((a, b) => b - a);
	const stringByMidi = new Map(orderedMidis.map((m, i) => [m, i]));
	const tuning = orderedMidis.map((m) => midiToNote(m));

	const convertNote = (n: AtNote, beat: AtBeat): OtoNote | null => {
		const midi = percussionMidi(n, track);
		const string = midi === undefined ? undefined : stringByMidi.get(Math.round(midi));
		if (string === undefined) return null;
		const techniques = noteTechniques(n, beat);
		const out: OtoNote = { string, fret: 0 };
		if (techniques.length) out.techniques = techniques;
		if (n.isTieDestination) out.tied = true;
		return out;
	};

	const measures = convertMeasures(staff.bars, fallbackTs, convertNote);

	return makeTrack({
		name: track.name?.trim() || `Track ${index + 1}`,
		kind: 'custom',
		tuning,
		capo: 0,
		instrument: 'drums',
		volume: Math.min(1, (track.playbackInfo?.volume ?? 12) / 16),
		view: { standard: false, tab: true, rhythm: false },
		measures: measures.length ? measures : undefined
	});
}

function convertTrack(
	track: AtTrack,
	index: number,
	fallbackTs: [number, number]
): OtoTrack | null {
	const staff = firstStringedStaff(track);
	if (staff) return convertStringedTrack(track, staff, index, fallbackTs);
	const drumStaff = firstPercussionStaff(track);
	if (drumStaff) return convertDrumTrack(track, drumStaff, index, fallbackTs);
	return null; // no fretted or percussion staff found → skip
}

/** Convert a parsed alphaTab Score into an .oto document. */
export function gpScoreToOto(score: AtScore): OtoScore {
	const firstMaster = score.masterBars?.[0];
	const ts: [number, number] = firstMaster
		? [firstMaster.timeSignatureNumerator, firstMaster.timeSignatureDenominator]
		: [4, 4];

	const tracks = score.tracks
		.map((t, i) => convertTrack(t, i, ts))
		.filter((t): t is OtoTrack => t !== null);

	if (tracks.length === 0) {
		throw new Error(
			'This Guitar Pro file has no fretted, stringed or percussion tracks to import.'
		);
	}

	const keySignature = firstMaster?.keySignature;

	return makeScore({
		title: score.title?.trim() || 'Imported Score',
		artist:
			score.artist?.trim() || score.music?.trim() || score.subTitle?.trim() || 'Unknown Artist',
		tempo: Math.round(score.tempo) || 120,
		timeSignature: ts,
		keySignature:
			typeof keySignature === 'number' ? Math.max(-7, Math.min(7, keySignature)) : undefined,
		tracks
	});
}

/**
 * Parse Guitar Pro file bytes and convert to .oto. alphaTab is imported lazily so
 * it is only fetched when the user actually imports a file.
 */
export async function importGuitarProBytes(bytes: Uint8Array): Promise<OtoScore> {
	const at = await import('@coderline/alphatab');
	const settings = new at.Settings();
	const score = at.importer.ScoreLoader.loadScoreFromBytes(bytes, settings) as unknown as AtScore;
	return gpScoreToOto(score);
}

/** Heuristic: does this filename look like a Guitar Pro file? */
export function isGuitarProFile(name: string): boolean {
	return /\.(gp|gpx|gp3|gp4|gp5|gp7|gpif)$/i.test(name);
}
