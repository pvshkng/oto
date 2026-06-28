import { describe, it, expect } from 'vitest';
import { layoutTrack, type LaidBeat } from './layout';
import { makeScore, makeTrack } from '$lib/oto/format';
import type { OtoBeat, OtoMeasure, DurationValue } from '$lib/oto/types';

const TUNING = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];

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

function lay(measures: OtoMeasure[], timeSignature: [number, number] = [4, 4]) {
	const track = makeTrack({
		tuning: TUNING,
		measures,
		view: { standard: true, tab: true, rhythm: false }
	});
	const score = makeScore({ timeSignature, tracks: [track] });
	const layout = layoutTrack(score, track, {
		containerWidth: 4000, // wide enough to keep everything on one system
		showStandard: true,
		showTab: true,
		showRhythm: false
	});
	return layout.systems[0].measures[0].beats;
}

function groupsOf(beats: LaidBeat[]): number[][] {
	const map = new Map<number, number[]>();
	beats.forEach((b, i) => {
		if (b.beamGroup < 0) return;
		(map.get(b.beamGroup) ?? map.set(b.beamGroup, []).get(b.beamGroup)!).push(i);
	});
	return [...map.values()];
}

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
		expect(beats[0].stemDir).toBe(-1); // high E5 region → stem down
		expect(beats[1].stemDir).toBe(1); // low E2 → stem up
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

describe('notehead clusters', () => {
	it('offsets one of two noteheads a second apart so they do not overlap', () => {
		// E4 (string 0 fret 0, step 2) + D4 (string 1 fret 3, step 1): a second.
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
		// E4 (step 2) + B3 (string 1 fret 0, step -1): a fourth apart.
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
