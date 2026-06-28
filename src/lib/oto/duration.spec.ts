import { describe, it, expect } from 'vitest';
import {
	analyzeMeasure,
	beatsCutoff,
	measureCapacity,
	overflowCutoff,
	beatFraction
} from './duration';
import type { DurationValue, OtoBeat, OtoMeasure } from './types';

function beat(duration: DurationValue, dotted = false): OtoBeat {
	return { duration, dotted, notes: [{ string: 0, fret: 0 }] };
}

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
