// Guitar Pro import → .oto conversion.
//
// alphaTab parses Guitar Pro files (GP3/4/5, GPX, GP7) entirely in the browser,
// so no backend is required — we load the bytes, walk alphaTab's score model and
// translate it into our .oto document. The heavy alphaTab module is loaded on
// demand (dynamic import) so it never bloats the initial bundle.
//
// Model mapping notes (verified against alphaTab 1.7):
//  - Score → OtoScore; Track[0..] → OtoTrack (first stringed staff only).
//  - alphaTab `Duration` enum already matches our denominators (Quarter=4 …).
//  - alphaTab numbers strings 1..N from the LOWEST pitch, while .oto indexes 0..N
//    from the HIGHEST. So otoString = tuning.length - note.string.
//  - Tuning is an array of MIDI numbers, highest string first (same order as us).

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
	isTieOrigin?: boolean;
	vibrato?: number; // 0 = none
	harmonicType?: number; // 0 = none
	bendType?: number; // 0 = none
	hasBend?: boolean;
	maxBendPoint?: { value: number } | null;
	slideOutType?: number; // 0 = none
	slideTarget?: { fret: number } | null;
}
interface AtBeat {
	duration: number;
	dots?: number;
	isRest?: boolean;
	isPalmMute?: boolean;
	isLetRing?: boolean;
	vibrato?: number;
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
	bars: AtBar[];
}
interface AtTrack {
	name: string;
	staves: AtStaff[];
	playbackInfo?: { volume?: number; program?: number };
}
export interface AtScore {
	title?: string;
	artist?: string;
	music?: string;
	subTitle?: string;
	tempo: number;
	masterBars?: { timeSignatureNumerator: number; timeSignatureDenominator: number }[];
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

function noteTechniques(note: AtNote, beat: AtBeat): Technique[] {
	const t: Technique[] = [];
	if (note.isPalmMute || beat.isPalmMute) t.push('palm-mute');
	if (note.isLetRing || beat.isLetRing) t.push('let-ring');
	if ((note.vibrato ?? 0) > 0 || (beat.vibrato ?? 0) > 0) t.push('vibrato');
	if (note.isHammerPullOrigin) t.push('hammer');
	if ((note.harmonicType ?? 0) > 0) t.push('harmonic');
	if (note.isStaccato) t.push('staccato');
	if (note.isGhost) t.push('ghost');
	if (note.isDead) t.push('dead');
	if (note.hasBend || (note.bendType ?? 0) > 0) t.push('bend');
	if ((note.slideOutType ?? 0) > 0 || note.slideTarget) t.push('slide');
	return t;
}

/** alphaTab bend points are in quarter-tones; convert the peak to semitones. */
function bendSemitones(note: AtNote): number | undefined {
	if (!(note.hasBend || (note.bendType ?? 0) > 0)) return undefined;
	const v = note.maxBendPoint?.value;
	if (typeof v === 'number' && v > 0) return Math.max(0.5, Math.round((v / 2) * 2) / 2);
	return 1;
}

function convertTrack(
	track: AtTrack,
	index: number,
	fallbackTs: [number, number]
): OtoTrack | null {
	const staff = firstStringedStaff(track);
	if (!staff) return null; // percussion / non-fretted → skipped

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

	const convertBeats = (atBeats: AtBeat[] | undefined): OtoBeat[] =>
		(atBeats ?? []).map((beat) => {
			const notes: OtoNote[] = (beat.notes ?? []).map((n) => {
				const otoString = Math.max(0, Math.min(stringCount - 1, stringCount - n.string));
				const techniques = noteTechniques(n, beat);
				const out: OtoNote = { string: otoString, fret: n.fret };
				if (techniques.length) out.techniques = techniques;
				const bend = bendSemitones(n);
				if (bend !== undefined) out.bend = bend;
				if (n.slideTarget) out.slideTo = n.slideTarget.fret;
				if (n.isTieOrigin) out.tied = true;
				return out;
			});
			return {
				duration: clampDuration(beat.duration),
				dotted: (beat.dots ?? 0) > 0,
				notes,
				rest: beat.isRest || notes.length === 0
			};
		});

	const measures: OtoMeasure[] = staff.bars.map((bar) => {
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
		throw new Error('This Guitar Pro file has no fretted/stringed tracks to import.');
	}

	return makeScore({
		title: score.title?.trim() || 'Imported Score',
		artist:
			score.artist?.trim() || score.music?.trim() || score.subTitle?.trim() || 'Unknown Artist',
		tempo: Math.round(score.tempo) || 120,
		timeSignature: ts,
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
