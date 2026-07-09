// Guards the .oto fixtures in <repo>/public/test-files: every file must
// parse with the current format code, and no bar in any fixture may
// overflow its metre (overflowing beats are skipped on playback, which
// would make a fixture silently exercise less than it claims to).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse, OTO_VERSION } from './format';
import { analyzeMeasure } from './duration';

const DIR = fileURLToPath(new URL('../../../static/test-files', import.meta.url));
const files = readdirSync(DIR).filter((f) => f.endsWith('.oto'));

describe('test-files fixtures', () => {
	it('has the expected fixture set', () => {
		expect(files.sort()).toEqual([
			'all-note-effects.oto',
			'drums.oto',
			'dynamics.oto',
			'everything-combined.oto',
			'multiple-tracks.oto',
			'octaves-and-marks.oto',
			'repeats-and-structure.oto',
			'tuplets.oto'
		]);
	});

	for (const file of files) {
		describe(file, () => {
			const score = parse(readFileSync(join(DIR, file), 'utf-8'));

			it('parses at the current format version with at least one track', () => {
				expect(score.version).toBe(OTO_VERSION);
				expect(score.tracks.length).toBeGreaterThan(0);
			});

			it('has no overflowing bars', () => {
				for (const track of score.tracks) {
					for (const m of track.measures) {
						expect(analyzeMeasure(m, score.timeSignature).overflow).toBe(false);
					}
				}
			});
		});
	}

	it('everything-combined exercises the full mark vocabulary', () => {
		const score = parse(readFileSync(join(DIR, 'everything-combined.oto'), 'utf-8'));
		expect(score.tracks.length).toBeGreaterThanOrEqual(4);
		const measures = score.tracks.flatMap((t) => t.measures);
		const beats = measures.flatMap((m) => [...m.beats, ...(m.voice2 ?? [])]);
		expect(measures.some((m) => m.barline === 'double')).toBe(true);
		expect(measures.some((m) => m.repeatStart)).toBe(true);
		expect(measures.some((m) => m.repeatEnd)).toBe(true);
		expect(measures.some((m) => m.volta === 1)).toBe(true);
		expect(measures.some((m) => m.volta === 2)).toBe(true);
		expect(measures.some((m) => m.simile)).toBe(true);
		expect(measures.some((m) => m.segno)).toBe(true);
		expect(measures.some((m) => m.coda)).toBe(true);
		expect(beats.some((b) => b.tuplet === 3)).toBe(true);
		expect(beats.some((b) => b.dynamic)).toBe(true);
		expect(beats.some((b) => b.strum === 'down')).toBe(true);
		expect(beats.some((b) => b.strum === 'up')).toBe(true);
		expect(beats.some((b) => b.fermata)).toBe(true);
		expect(beats.some((b) => b.ottava === '8va')).toBe(true);
	});
});
