import { describe, it, expect } from 'vitest';
import { layoutTrack, type LaidBeat } from './layout';
import { accidentalGlyph } from './glyphs';
import { makeScore, makeTrack } from '$lib/oto/format';
import type { OtoBeat, OtoMeasure, DurationValue, TrackKind } from '$lib/oto/types';

const TUNING = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];
const BASS_TUNING = ['G2', 'D2', 'A1', 'E1'];

function note(string: number, fret: number, extra: Partial<OtoBeat['notes'][number]> = {}) {
	return { string, fret, ...extra };
}
function beat(
	duration: DurationValue,
	notes: OtoBeat['notes'],
	extra: Partial<OtoBeat> = {}
): OtoBeat {
	return { duration, notes, ...extra };
}

function layTrack(
	measures: OtoMeasure[],
	opts: {
		tuning?: string[];
		kind?: TrackKind;
		timeSignature?: [number, number];
		keySignature?: number;
	} = {}
) {
	const track = makeTrack({
		tuning: opts.tuning ?? TUNING,
		kind: opts.kind ?? 'guitar',
		measures,
		view: { standard: true, tab: true, rhythm: false }
	});
	const score = makeScore({
		timeSignature: opts.timeSignature ?? [4, 4],
		keySignature: opts.keySignature ?? 0,
		tracks: [track]
	});
	const layout = layoutTrack(score, track, {
		containerWidth: 4000, // wide enough to keep everything on one system
		showStandard: true,
		showTab: true,
		showRhythm: false
	});
	return layout;
}

function lay(measures: OtoMeasure[], timeSignature: [number, number] = [4, 4]) {
	return layTrack(measures, { timeSignature }).systems[0].measures[0].beats;
}

function groupsOf(beats: LaidBeat[]): number[][] {
	const map = new Map<number, number[]>();
	beats.forEach((b, i) => {
		if (b.beamGroup < 0) return;
		(map.get(b.beamGroup) ?? map.set(b.beamGroup, []).get(b.beamGroup)!).push(i);
	});
	return [...map.values()];
}

describe('standard notation pitch placement', () => {
	it('writes guitar notes an octave above sounding pitch (open B sits on the middle line)', () => {
		// Open 2nd string (index 1) sounds B3, but guitar standard notation is a
		// transposing convention written an octave higher — so it should land on
		// the middle staff line (B4, step 6), not a step and a half below the staff.
		const beats = lay([
			{
				beats: [
					beat(4, [note(1, 0)]),
					beat(4, [note(1, 0)]),
					beat(4, [note(1, 0)]),
					beat(4, [note(1, 0)])
				]
			}
		]);
		expect(beats[0].notes[0].step).toBe(6);
	});

	it('places open high E (string 0) a third above the middle line', () => {
		const beats = lay([
			{
				beats: [
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)])
				]
			}
		]);
		expect(beats[0].notes[0].step).toBe(9);
	});
});

describe('clef selection', () => {
	it('renders bass tracks in bass clef and everything else in treble', () => {
		const guitar = layTrack([{ beats: [beat(4, [note(0, 0)])] }], { kind: 'guitar' });
		const bass = layTrack([{ beats: [beat(4, [note(0, 0)])] }], {
			kind: 'bass',
			tuning: BASS_TUNING
		});
		const ukulele = layTrack([{ beats: [beat(4, [note(0, 0)])] }], { kind: 'ukulele' });
		expect(guitar.clef).toBe('treble');
		expect(bass.clef).toBe('bass');
		expect(ukulele.clef).toBe('treble');
	});

	it('places a bass open G string (written an octave up, G3) in the top space of the bass staff', () => {
		const layout = layTrack(
			[
				{
					beats: [
						beat(4, [note(0, 0)]),
						beat(4, [note(0, 0)]),
						beat(4, [note(0, 0)]),
						beat(4, [note(0, 0)])
					]
				}
			],
			{ kind: 'bass', tuning: BASS_TUNING }
		);
		const beats = layout.systems[0].measures[0].beats;
		// G2 sounding, written +12 as G3: bass-clef top space, step -3.
		expect(beats[0].notes[0].step).toBe(-3);
	});

	it('places a bass open D string (written D3) exactly on the bass staff middle line', () => {
		const layout = layTrack(
			[
				{
					beats: [
						beat(4, [note(1, 0)]),
						beat(4, [note(1, 0)]),
						beat(4, [note(1, 0)]),
						beat(4, [note(1, 0)])
					]
				}
			],
			{ kind: 'bass', tuning: BASS_TUNING }
		);
		const beats = layout.systems[0].measures[0].beats;
		expect(beats[0].notes[0].step).toBe(-6);
	});

	it('adds a ledger line for a bass open low-E string (written E2, below the bass staff)', () => {
		const layout = layTrack(
			[
				{
					beats: [
						beat(4, [note(3, 0)]),
						beat(4, [note(3, 0)]),
						beat(4, [note(3, 0)]),
						beat(4, [note(3, 0)])
					]
				}
			],
			{ kind: 'bass', tuning: BASS_TUNING }
		);
		const beats = layout.systems[0].measures[0].beats;
		expect(beats[0].notes[0].step).toBe(-12);
		expect(beats[0].notes[0].ledgerLines.length).toBeGreaterThan(0);
	});
});

describe('beam grouping', () => {
	it('breaks beams at each notated beat (eight eighths in 4/4 → four pairs)', () => {
		const beats = lay([{ beats: Array.from({ length: 8 }, () => beat(8, [note(0, 0)])) }]);
		const groups = groupsOf(beats);
		expect(groups).toHaveLength(4);
		for (const g of groups) expect(g).toHaveLength(2);
	});

	it('beams four sixteenths within one beat as a single group', () => {
		const beats = lay([
			{
				beats: [
					...Array.from({ length: 4 }, () => beat(16, [note(0, 0)])),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)])
				]
			}
		]);
		const groups = groupsOf(beats);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toEqual([0, 1, 2, 3]);
	});

	it('does not beam a lone eighth (it keeps a flag instead)', () => {
		const beats = lay([
			{
				beats: [
					beat(8, [note(0, 0)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)]),
					beat(8, [note(0, 0)])
				]
			}
		]);
		expect(beats.every((b) => b.beamGroup === -1)).toBe(true);
	});
});

describe('stem direction', () => {
	it('is unified across all members of a beam group', () => {
		// Low then high notes in one beat-cell: without unification the two would
		// disagree; the group must pick a single direction.
		const beats = lay([
			{
				beats: [
					beat(8, [note(5, 0)]),
					beat(8, [note(0, 12)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)])
				]
			}
		]);
		const group = beats.filter((b) => b.beamGroup === 0);
		expect(group).toHaveLength(2);
		expect(new Set(group.map((b) => b.stemDir)).size).toBe(1);
	});

	it('points down for high notes and up for low notes when unbeamed', () => {
		const beats = lay([
			{
				beats: [
					beat(4, [note(0, 12)]),
					beat(4, [note(5, 0)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)])
				]
			}
		]);
		expect(beats[0].stemDir).toBe(-1); // high E5 (sounding) → stem down
		expect(beats[1].stemDir).toBe(1); // low E2 (sounding) → stem up
	});
});

describe('accidentals', () => {
	it('marks the first sharp, suppresses the repeat, then cancels with a natural', () => {
		// C#5 (string 0 fret 9) twice, then C5 (fret 8) in the same bar.
		const beats = lay([
			{
				beats: [
					beat(4, [note(0, 9)]),
					beat(4, [note(0, 9)]),
					beat(4, [note(0, 8)]),
					beat(4, [note(0, 8)])
				]
			}
		]);
		expect(beats[0].notes[0].accidental).toBe('sharp');
		expect(beats[1].notes[0].accidental).toBe(null);
		expect(beats[2].notes[0].accidental).toBe('natural');
		expect(beats[3].notes[0].accidental).toBe(null);
	});

	it('keeps accidental memory per measure (resets next bar)', () => {
		const track = makeTrack({
			tuning: TUNING,
			measures: [
				{
					beats: [
						beat(4, [note(0, 9)]),
						beat(4, [note(0, 9)]),
						beat(4, [note(0, 9)]),
						beat(4, [note(0, 9)])
					]
				},
				{
					beats: [
						beat(4, [note(0, 9)]),
						beat(4, [note(0, 9)]),
						beat(4, [note(0, 9)]),
						beat(4, [note(0, 9)])
					]
				}
			],
			view: { standard: true, tab: true, rhythm: false }
		});
		const score = makeScore({ tracks: [track] });
		const layout = layoutTrack(score, track, {
			containerWidth: 4000,
			showStandard: true,
			showTab: true,
			showRhythm: false
		});
		const m0 = layout.systems[0].measures[0].beats;
		const m1 = layout.systems[0].measures[1].beats;
		expect(m0[0].notes[0].accidental).toBe('sharp');
		expect(m0[1].notes[0].accidental).toBe(null);
		// New bar re-states the accidental.
		expect(m1[0].notes[0].accidental).toBe('sharp');
	});
});

describe('key signatures', () => {
	it('draws no accidental for a pitch the key signature already alters (G major, F#)', () => {
		// String 0 (E4) fret 2 → F#4 sounding, written F#5 — already sharped by
		// a one-sharp (G major) key signature, so no accidental should render.
		const layout = layTrack(
			[{ beats: [beat(4, [note(0, 2)]), beat(4, [note(0, 0)]), beat(4, [note(0, 0)])] }],
			{ keySignature: 1 }
		);
		const beats = layout.systems[0].measures[0].beats;
		expect(beats[0].notes[0].accidental).toBe(null);
	});

	it('cancels a key-signature sharp with a natural when the bar plays the plain letter (G major, F)', () => {
		// String 0 (E4) fret 1 → F4 sounding, written F5 — the key signature
		// already sharps F, so the plain (natural) F needs an explicit natural.
		const layout = layTrack(
			[{ beats: [beat(4, [note(0, 1)]), beat(4, [note(0, 0)]), beat(4, [note(0, 0)])] }],
			{ keySignature: 1 }
		);
		const beats = layout.systems[0].measures[0].beats;
		expect(beats[0].notes[0].accidental).toBe('natural');
	});

	it('draws no accidental for a pitch the key signature already flats (F major, Bb)', () => {
		// String 0 (E4) fret 6 → Bb4 sounding — already flatted by a one-flat
		// (F major) key signature, so no accidental should render, and it should
		// be spelled as a flat (same staff position as B) rather than a sharp.
		const layout = layTrack(
			[{ beats: [beat(4, [note(0, 6)]), beat(4, [note(0, 0)]), beat(4, [note(0, 0)])] }],
			{ keySignature: -1 }
		);
		const beats = layout.systems[0].measures[0].beats;
		expect(beats[0].notes[0].accidental).toBe(null);
		expect(beats[0].notes[0].step % 7).toBe(6); // lands on B's staff position
	});

	it('cancels a key-signature flat with a natural when the bar plays the plain letter (F major, B)', () => {
		// String 1 (B3) open → B3 sounding, written B4 — the key signature
		// already flats B, so the plain (natural) B needs an explicit natural.
		const layout = layTrack(
			[{ beats: [beat(4, [note(1, 0)]), beat(4, [note(0, 0)]), beat(4, [note(0, 0)])] }],
			{ keySignature: -1 }
		);
		const beats = layout.systems[0].measures[0].beats;
		expect(beats[0].notes[0].accidental).toBe('natural');
	});

	it('renders one sharp glyph on F#5 line for a one-sharp (G major) treble key signature', () => {
		const layout = layTrack([{ beats: [beat(4, [note(0, 0)])] }], { keySignature: 1 });
		expect(layout.keySigGlyphs).toHaveLength(1);
		expect(layout.keySigGlyphs[0].glyph).toBe(accidentalGlyph('sharp'));
	});

	it('renders one flat glyph for a one-flat (F major) treble key signature', () => {
		const layout = layTrack([{ beats: [beat(4, [note(0, 0)])] }], { keySignature: -1 });
		expect(layout.keySigGlyphs).toHaveLength(1);
		expect(layout.keySigGlyphs[0].glyph).toBe(accidentalGlyph('flat'));
	});

	it('renders no key signature glyphs for the key of C', () => {
		const layout = layTrack([{ beats: [beat(4, [note(0, 0)])] }], { keySignature: 0 });
		expect(layout.keySigGlyphs).toHaveLength(0);
		expect(layout.keySigWidth).toBe(0);
	});

	it('renders the correct count of accidentals for a multi-sharp key (E major, 4 sharps)', () => {
		const layout = layTrack([{ beats: [beat(4, [note(0, 0)])] }], { keySignature: 4 });
		expect(layout.keySigGlyphs).toHaveLength(4);
		expect(layout.keySigGlyphs.every((g) => g.glyph === accidentalGlyph('sharp'))).toBe(true);
	});
});

describe('notehead clusters', () => {
	it('offsets one of two noteheads a second apart so they do not overlap', () => {
		// E4 (string 0 fret 0, step 9) + D4 (string 1 fret 3, step 8): a second.
		const beats = lay([
			{
				beats: [
					beat(4, [note(0, 0), note(1, 3)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)])
				]
			}
		]);
		const offsets = beats[0].notes.map((n) => n.headXOffset);
		expect(offsets.filter((o) => o !== 0)).toHaveLength(1);
	});

	it('leaves a third or wider cluster un-offset', () => {
		// E4 (step 9) + B3 (string 1 fret 0, step 6): a fourth apart.
		const beats = lay([
			{
				beats: [
					beat(4, [note(0, 0), note(1, 0)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)])
				]
			}
		]);
		expect(beats[0].notes.every((n) => n.headXOffset === 0)).toBe(true);
	});
});

describe('ties', () => {
	it('links a tied note to the matching string in the next beat', () => {
		const beats = lay([
			{
				beats: [
					beat(4, [note(0, 5, { tied: true })]),
					beat(4, [note(0, 5)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)])
				]
			}
		]);
		const tie = beats[0].notes[0].tie;
		expect(tie).not.toBeNull();
		expect(tie!.x2).toBeCloseTo(beats[1].notes[0].x, 5);
	});

	it('does not create a tie when the next beat lacks the string', () => {
		const beats = lay([
			{
				beats: [
					beat(4, [note(0, 5, { tied: true })]),
					beat(4, [note(2, 5)]),
					beat(4, [note(0, 0)]),
					beat(4, [note(0, 0)])
				]
			}
		]);
		expect(beats[0].notes[0].tie).toBeNull();
	});

	it('links a tie across a barline to the next measure (same system)', () => {
		const track = makeTrack({
			tuning: TUNING,
			measures: [
				{ beats: [beat(2, [note(0, 5)]), beat(2, [note(0, 5, { tied: true })])] },
				{ beats: [beat(2, [note(0, 5)]), beat(2, [note(0, 5)])] }
			],
			view: { standard: true, tab: true, rhythm: false }
		});
		const score = makeScore({ tracks: [track] });
		const layout = layoutTrack(score, track, {
			containerWidth: 4000,
			showStandard: true,
			showTab: true,
			showRhythm: false
		});
		const m0 = layout.systems[0].measures[0].beats;
		const m1 = layout.systems[0].measures[1].beats;
		const tie = m0[m0.length - 1].notes[0].tie;
		expect(tie).not.toBeNull();
		expect(tie!.x2).toBeCloseTo(m1[0].notes[0].x, 5);
	});
});
