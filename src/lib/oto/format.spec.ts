import { describe, it, expect } from 'vitest';
import { makeScore, makeTrack, serialize, parse, OtoParseError } from './format';

describe('.oto format', () => {
	it('creates a valid default score', () => {
		const s = makeScore();
		expect(s.format).toBe('oto');
		expect(s.tracks.length).toBeGreaterThan(0);
		expect(s.tracks[0].measures.length).toBe(4);
	});

	it('round-trips through serialize/parse', () => {
		const s = makeScore({
			title: 'My Song',
			artist: 'Me',
			tempo: 96,
			timeSignature: [3, 4],
			tracks: [
				makeTrack({
					name: 'Lead',
					measures: [
						{
							beats: [
								{
									duration: 8,
									notes: [{ string: 0, fret: 5, techniques: ['bend'], bend: 1 }],
									rest: false
								},
								{ duration: 8, notes: [{ string: 1, fret: 7 }], rest: false }
							]
						}
					]
				})
			]
		});
		const json = serialize(s);
		const back = parse(json);
		expect(back.title).toBe('My Song');
		expect(back.tempo).toBe(96);
		expect(back.timeSignature).toEqual([3, 4]);
		expect(back.tracks[0].name).toBe('Lead');
		expect(back.tracks[0].measures[0].beats[0].notes[0].fret).toBe(5);
		expect(back.tracks[0].measures[0].beats[0].notes[0].techniques).toContain('bend');
	});

	it('rejects non-JSON', () => {
		expect(() => parse('not json {')).toThrow(OtoParseError);
	});

	it('rejects documents without the oto flag', () => {
		expect(() => parse(JSON.stringify({ tracks: [] }))).toThrow(OtoParseError);
	});

	it('rejects documents with no tracks', () => {
		expect(() => parse(JSON.stringify({ format: 'oto', tracks: [] }))).toThrow(OtoParseError);
	});

	it('defensively fills missing fields', () => {
		const minimal = JSON.stringify({
			format: 'oto',
			tracks: [{ measures: [{ beats: [{ duration: 4, notes: [{ string: 0, fret: 3 }] }] }] }]
		});
		const s = parse(minimal);
		expect(s.tracks[0].tuning.length).toBeGreaterThan(0);
		expect(s.tracks[0].measures[0].beats[0].duration).toBe(4);
		expect(s.tracks[0].measures[0].beats[0].rest).toBe(false);
	});

	it('coerces an invalid duration to a quarter note', () => {
		const doc = JSON.stringify({
			format: 'oto',
			tracks: [{ measures: [{ beats: [{ duration: 7, notes: [] }] }] }]
		});
		const s = parse(doc);
		expect(s.tracks[0].measures[0].beats[0].duration).toBe(4);
		expect(s.tracks[0].measures[0].beats[0].rest).toBe(true);
	});
});
