// .oto document factory, (de)serialisation and validation.

import { TUNINGS } from './pitch';
import type { DurationValue, OtoBeat, OtoMeasure, OtoScore, OtoTrack, TrackKind } from './types';

export const OTO_VERSION = 1;

let idCounter = 0;
export function uid(prefix = 'id'): string {
	idCounter += 1;
	return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

// Monochrome track accents, distinguished by lightness, not hue.
const TRACK_COLORS = ['#18181b', '#52525b', '#a1a1aa', '#3f3f46', '#71717a', '#27272a', '#d4d4d8'];

export function emptyMeasure(): OtoMeasure {
	return { beats: [restBeat(4)] };
}

export function restBeat(duration: DurationValue = 4): OtoBeat {
	return { duration, notes: [], rest: true };
}

export function makeTrack(opts: Partial<OtoTrack> = {}): OtoTrack {
	const kind: TrackKind = opts.kind ?? 'guitar';
	const tuning =
		opts.tuning ??
		(kind === 'bass'
			? TUNINGS['Bass Standard']
			: kind === 'ukulele'
				? TUNINGS['Ukulele']
				: TUNINGS['Guitar Standard']);
	const index = opts.color ? 0 : Math.floor(Math.random() * TRACK_COLORS.length);
	return {
		id: opts.id ?? uid('trk'),
		name: opts.name ?? 'Electric Guitar',
		kind,
		tuning,
		capo: opts.capo ?? 0,
		transpose: opts.transpose ?? 0,
		instrument: opts.instrument ?? 'electric',
		volume: opts.volume ?? 0.8,
		muted: opts.muted ?? false,
		soloed: opts.soloed ?? false,
		view: opts.view ?? { standard: true, tab: true, rhythm: false },
		measures: opts.measures ?? [emptyMeasure(), emptyMeasure(), emptyMeasure(), emptyMeasure()],
		color: opts.color ?? TRACK_COLORS[index]
	};
}

export function makeScore(opts: Partial<OtoScore> = {}): OtoScore {
	const now = new Date().toISOString();
	return {
		format: 'oto',
		version: OTO_VERSION,
		title: opts.title ?? 'Untitled Score',
		artist: opts.artist ?? 'Unknown Artist',
		tempo: opts.tempo ?? 120,
		timeSignature: opts.timeSignature ?? [4, 4],
		tracks: opts.tracks ?? [makeTrack()],
		createdAt: opts.createdAt ?? now,
		updatedAt: now
	};
}

export function serialize(score: OtoScore): string {
	return JSON.stringify({ ...score, updatedAt: new Date().toISOString() }, null, 2);
}

export class OtoParseError extends Error {}

/** Parse + validate an .oto document, filling defaults defensively. */
export function parse(text: string): OtoScore {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new OtoParseError('File is not valid JSON.');
	}
	if (!data || typeof data !== 'object') throw new OtoParseError('Empty document.');
	const d = data as Record<string, unknown>;
	if (d.format !== 'oto') throw new OtoParseError('Not an .oto document (missing format flag).');
	if (!Array.isArray(d.tracks) || d.tracks.length === 0)
		throw new OtoParseError('Document has no tracks.');

	const tracks = (d.tracks as unknown[]).map((t) => normaliseTrack(t));
	return makeScore({
		title: typeof d.title === 'string' ? d.title : 'Untitled Score',
		artist: typeof d.artist === 'string' ? d.artist : 'Unknown Artist',
		tempo: typeof d.tempo === 'number' ? d.tempo : 120,
		timeSignature: isTimeSig(d.timeSignature) ? d.timeSignature : [4, 4],
		tracks,
		createdAt: typeof d.createdAt === 'string' ? d.createdAt : undefined
	});
}

function isTimeSig(v: unknown): v is [number, number] {
	return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number');
}

function normaliseTrack(t: unknown): OtoTrack {
	const o = (t ?? {}) as Record<string, unknown>;
	const measures = Array.isArray(o.measures)
		? (o.measures as unknown[]).map(normaliseMeasure)
		: [emptyMeasure()];
	return makeTrack({
		id: typeof o.id === 'string' ? o.id : undefined,
		name: typeof o.name === 'string' ? o.name : undefined,
		kind: typeof o.kind === 'string' ? (o.kind as TrackKind) : undefined,
		tuning: Array.isArray(o.tuning) ? (o.tuning as string[]) : undefined,
		capo: typeof o.capo === 'number' ? o.capo : undefined,
		transpose: typeof o.transpose === 'number' ? o.transpose : undefined,
		instrument: typeof o.instrument === 'string' ? o.instrument : undefined,
		volume: typeof o.volume === 'number' ? o.volume : undefined,
		muted: typeof o.muted === 'boolean' ? o.muted : undefined,
		soloed: typeof o.soloed === 'boolean' ? o.soloed : undefined,
		view:
			o.view && typeof o.view === 'object'
				? {
						standard: !!(o.view as Record<string, unknown>).standard,
						tab: !!(o.view as Record<string, unknown>).tab,
						rhythm: !!(o.view as Record<string, unknown>).rhythm
					}
				: undefined,
		measures,
		color: typeof o.color === 'string' ? o.color : undefined
	});
}

function normaliseMeasure(m: unknown): OtoMeasure {
	const o = (m ?? {}) as Record<string, unknown>;
	const beats = Array.isArray(o.beats)
		? (o.beats as unknown[]).map(normaliseBeat).filter(Boolean)
		: [restBeat()];
	const voice2 =
		Array.isArray(o.voice2) && o.voice2.length
			? (o.voice2 as unknown[]).map(normaliseBeat).filter(Boolean)
			: undefined;
	return {
		timeSignature: isTimeSig(o.timeSignature) ? o.timeSignature : undefined,
		tempo: typeof o.tempo === 'number' ? o.tempo : undefined,
		beats: beats.length ? beats : [restBeat()],
		voice2: voice2 && voice2.length ? voice2 : undefined
	};
}

function normaliseBeat(b: unknown): OtoBeat {
	const o = (b ?? {}) as Record<string, unknown>;
	const duration = (
		[1, 2, 4, 8, 16, 32].includes(o.duration as number) ? o.duration : 4
	) as DurationValue;
	const notes = Array.isArray(o.notes)
		? (o.notes as unknown[]).map((n) => {
				const no = (n ?? {}) as Record<string, unknown>;
				return {
					string: typeof no.string === 'number' ? no.string : 0,
					fret: typeof no.fret === 'number' ? no.fret : 0,
					techniques: Array.isArray(no.techniques) ? (no.techniques as never[]) : undefined,
					bend: typeof no.bend === 'number' ? no.bend : undefined,
					slideTo: typeof no.slideTo === 'number' ? no.slideTo : undefined,
					tied: typeof no.tied === 'boolean' ? no.tied : undefined
				};
			})
		: [];
	return {
		duration,
		dotted: !!o.dotted,
		notes,
		rest: notes.length === 0 ? true : !!o.rest
	};
}
