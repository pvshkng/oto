import { describe, it, expect } from 'vitest';
import {
	analyzeMeasure,
	beatsCutoff,
	beatCountFraction,
	isGraceBeat,
	measureCapacity,
	overflowCutoff,
	beatFraction,
	tupletFactor
} from './duration';
import type { DurationValue, OtoBeat, OtoMeasure, TupletValue } from './types';

function beat(duration: DurationValue, dotted = false): OtoBeat {
	return { duration, dotted, notes: [{ string: 0, fret: 0 }] };
}

function graceBeat(duration: DurationValue = 8): OtoBeat {
	return { duration, notes: [{ string: 0, fret: 0, techniques: ['grace'] }] };
}

function tupletBeat(duration: DurationValue, tuplet: TupletValue): OtoBeat {
	return { duration, tuplet, notes: [{ string: 0, fret: 0 }] };
}

describe('tuplet math', () => {
	it('maps each tuplet size to N-in-the-time-of-M', () => {
		expect(tupletFactor(3)).toBeCloseTo(2 / 3, 12); // triplet: 3 in the time of 2
		expect(tupletFactor(5)).toBeCloseTo(4 / 5, 12);
		expect(tupletFactor(6)).toBeCloseTo(4 / 6, 12);
		expect(tupletFactor(7)).toBeCloseTo(4 / 7, 12);
		expect(tupletFactor(9)).toBeCloseTo(8 / 9, 12);
	});

	it('three triplet eighths occupy exactly one quarter note', () => {
		const total = [1, 2, 3].reduce((s) => s + beatFraction(tupletBeat(8, 3)), 0);
		expect(total).toBeCloseTo(1 / 4, 12);
	});

	it('twelve triplet eighths exactly fill a 4/4 bar (no overflow, not underfilled)', () => {
		const measure: OtoMeasure = {
			beats: Array.from({ length: 12 }, () => tupletBeat(8, 3))
		};
		const fill = analyzeMeasure(measure, [4, 4]);
		expect(fill.overflow).toBe(false);
		expect(fill.underfilled).toBe(false);
	});

	it('a quintuplet of sixteenths occupies one quarter note', () => {
		const total = Array.from({ length: 5 }).reduce<number>(
			(s) => s + beatFraction(tupletBeat(16, 5)),
			0
		);
		expect(total).toBeCloseTo(1 / 4, 12);
	});

	it('dotting composes with the tuplet ratio', () => {
		expect(beatFraction({ duration: 8, dotted: true, tuplet: 3, notes: [] })).toBeCloseTo(
			(1 / 8) * 1.5 * (2 / 3),
			12
		);
	});
});

describe('grace notes do not count toward the bar', () => {
	it('recognises a grace beat only when every sounding note is a grace note', () => {
		expect(isGraceBeat(graceBeat())).toBe(true);
		expect(isGraceBeat(beat(8))).toBe(false);
		// A rest is never a grace beat, even if flagged.
		expect(isGraceBeat({ duration: 8, rest: true, notes: [] })).toBe(false);
		// Mixed chord (one plain note) still counts as a real beat.
		expect(
			isGraceBeat({
				duration: 8,
				notes: [
					{ string: 0, fret: 0, techniques: ['grace'] },
					{ string: 1, fret: 2 }
				]
			})
		).toBe(false);
	});

	it('contributes zero to the count-fraction while keeping its notated value', () => {
		const g = graceBeat(8);
		expect(beatFraction(g)).toBeCloseTo(1 / 8, 12);
		expect(beatCountFraction(g)).toBe(0);
	});

	it('a full 4/4 bar stays full — not overfull — after adding a grace note', () => {
		const measure: OtoMeasure = { beats: [beat(4), graceBeat(), beat(4), beat(4), beat(4)] };
		const fill = analyzeMeasure(measure, [4, 4]);
		expect(fill.overflow).toBe(false);
		expect(fill.underfilled).toBe(false);
		// Nothing is dropped: the grace beat is skipped by the count, not the four quarters.
		expect(overflowCutoff(measure, [4, 4])).toBe(measure.beats.length);
	});
});

const TS: [number, number] = [4, 4];

// The notation layer renders a bar red when analyzeMeasure().overflow is true;
// the audio engine drops every beat at/after beatsCutoff(). These two must agree:
// a bar is red exactly when at least one of its beats is actually skipped.
describe('overflow vs. playback cutoff agreement', () => {
	const cases: { name: string; measure: OtoMeasure }[] = [
		{
			name: 'exactly full 4/4 (4 quarters)',
			measure: { beats: [beat(4), beat(4), beat(4), beat(4)] }
		},
		{ name: 'underfilled (3 quarters)', measure: { beats: [beat(4), beat(4), beat(4)] } },
		{
			name: 'overfull by one quarter',
			measure: { beats: [beat(4), beat(4), beat(4), beat(4), beat(4)] }
		},
		{
			name: 'overfull by an eighth',
			measure: { beats: [beat(4), beat(4), beat(4), beat(4), beat(8)] }
		},
		{ name: 'single whole note (full)', measure: { beats: [beat(1)] } },
		{ name: 'whole note + extra (overfull)', measure: { beats: [beat(1), beat(8)] } },
		{
			name: 'dotted halves overfill 4/4',
			measure: { beats: [beat(2, true), beat(2, true)] } // 0.75 + 0.75 = 1.5 > 1
		},
		{
			name: 'per-bar 3/4, full',
			measure: { timeSignature: [3, 4], beats: [beat(4), beat(4), beat(4)] }
		},
		{
			name: 'per-bar 3/4, overfull',
			measure: { timeSignature: [3, 4], beats: [beat(4), beat(4), beat(4), beat(4)] }
		}
	];

	for (const { name, measure } of cases) {
		it(name, () => {
			const ts = measure.timeSignature ?? TS;
			const fill = analyzeMeasure(measure, TS);
			const cutoff = overflowCutoff(measure, TS);
			const renderedRed = fill.overflow;
			const playbackDrops = cutoff < measure.beats.length;
			expect(playbackDrops).toBe(renderedRed);

			// And the cutoff index matches a direct beatsCutoff on the bar's capacity
			// (the exact call the engine makes per voice).
			expect(cutoff).toBe(beatsCutoff(measure.beats, measureCapacity(ts)));

			// Beats kept by the cutoff never exceed capacity; the dropped tail is what
			// pushed it over.
			const keptFraction = measure.beats.slice(0, cutoff).reduce((s, b) => s + beatFraction(b), 0);
			expect(keptFraction).toBeLessThanOrEqual(measureCapacity(ts) + 1e-9);
		});
	}
});
