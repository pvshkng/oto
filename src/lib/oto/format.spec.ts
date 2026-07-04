import { describe, it, expect } from 'vitest';
import { makeScore, makeTrack, serialize, parse, OtoParseError, OTO_VERSION } from './format';
import type { Technique } from './types';

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

	it('round-trips the mixer fields (pan / EQ / masterVolume / sections)', () => {
		const s = makeScore({
			masterVolume: 0.6,
			sections: [
				{ id: 'sec-1', measure: 0, label: 'Intro' },
				{ id: 'sec-2', measure: 8, label: 'Chorus' }
			],
			tracks: [
				makeTrack({
					name: 'Lead',
					volume: 0.5,
					pan: -0.4,
					eq: { low: 3, mid: -2, high: 6 }
				})
			]
		});
		const back = parse(serialize(s));
		expect(back.masterVolume).toBe(0.6);
		expect(back.sections).toHaveLength(2);
		expect(back.sections[1]).toMatchObject({ measure: 8, label: 'Chorus' });
		expect(back.tracks[0].volume).toBe(0.5);
		expect(back.tracks[0].pan).toBe(-0.4);
		expect(back.tracks[0].eq).toEqual({ low: 3, mid: -2, high: 6 });
	});

	it('stamps the current format version', () => {
		expect(makeScore().version).toBe(OTO_VERSION);
		expect(OTO_VERSION).toBeGreaterThanOrEqual(2);
	});

	it('backfills mixer defaults when loading an old (v1) document', () => {
		// A v1 file predates pan/eq/masterVolume/sections.
		const v1 = JSON.stringify({
			format: 'oto',
			version: 1,
			title: 'Legacy',
			tracks: [{ measures: [{ beats: [{ duration: 4, notes: [{ string: 0, fret: 3 }] }] }] }]
		});
		const s = parse(v1);
		expect(s.version).toBe(OTO_VERSION); // upgraded
		expect(s.masterVolume).toBe(0.85);
		expect(s.sections).toEqual([]);
		expect(s.tracks[0].pan).toBe(0);
		expect(s.tracks[0].eq).toEqual({ low: 0, mid: 0, high: 0 });
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

	it('round-trips the full technique vocabulary', () => {
		const techniques: Technique[] = [
			'pull',
			'tap',
			'trill',
			'tremolo',
			'slap',
			'pop',
			'wide-vibrato',
			'heavy-accent',
			'tenuto',
			'fade-in',
			'grace'
		];
		const s = makeScore({
			tracks: [
				makeTrack({
					measures: [
						{
							beats: techniques.map((t) => ({
								duration: 8 as const,
								notes: [{ string: 0, fret: 5, techniques: [t] }],
								rest: false
							}))
						}
					]
				})
			]
		});
		const back = parse(serialize(s));
		const beats = back.tracks[0].measures[0].beats;
		techniques.forEach((t, i) => expect(beats[i].notes[0].techniques).toEqual([t]));
	});

	it('round-trips beat-level notation marks (tuplet/dynamic/strum/fermata/ottava)', () => {
		const s = makeScore({
			tracks: [
				makeTrack({
					measures: [
						{
							beats: [
								{
									duration: 8,
									tuplet: 3,
									dynamic: 'sffz',
									strum: 'down',
									fermata: true,
									ottava: '15mb',
									notes: [{ string: 0, fret: 5 }],
									rest: false
								}
							]
						}
					]
				})
			]
		});
		const b = parse(serialize(s)).tracks[0].measures[0].beats[0];
		expect(b.tuplet).toBe(3);
		expect(b.dynamic).toBe('sffz');
		expect(b.strum).toBe('down');
		expect(b.fermata).toBe(true);
		expect(b.ottava).toBe('15mb');
	});

	it('round-trips measure-level structure marks', () => {
		const s = makeScore({
			tracks: [
				makeTrack({
					measures: [
						{ repeatStart: true, segno: true, beats: [{ duration: 4, notes: [], rest: true }] },
						{ volta: 1, simile: true, beats: [{ duration: 4, notes: [], rest: true }] },
						{
							volta: 2,
							repeatEnd: true,
							repeatCount: 3,
							beats: [{ duration: 4, notes: [], rest: true }]
						},
						{
							barline: 'double',
							coda: true,
							beats: [{ duration: 4, notes: [], rest: true }]
						}
					]
				})
			]
		});
		const ms = parse(serialize(s)).tracks[0].measures;
		expect(ms[0]).toMatchObject({ repeatStart: true, segno: true });
		expect(ms[1]).toMatchObject({ volta: 1, simile: true });
		expect(ms[2]).toMatchObject({ volta: 2, repeatEnd: true, repeatCount: 3 });
		expect(ms[3]).toMatchObject({ barline: 'double', coda: true });
	});

	it('drops invalid notation-mark values on load', () => {
		const doc = JSON.stringify({
			format: 'oto',
			tracks: [
				{
					measures: [
						{
							barline: 'wavy',
							volta: -2,
							repeatCount: 5, // without repeatEnd → dropped
							beats: [
								{
									duration: 4,
									tuplet: 4,
									dynamic: 'fffff',
									strum: 'sideways',
									ottava: '32va',
									notes: [{ string: 0, fret: 3 }]
								}
							]
						}
					]
				}
			]
		});
		const m = parse(doc).tracks[0].measures[0];
		expect(m.barline).toBeUndefined();
		expect(m.volta).toBeUndefined();
		expect(m.repeatCount).toBeUndefined();
		const b = m.beats[0];
		expect(b.tuplet).toBeUndefined();
		expect(b.dynamic).toBeUndefined();
		expect(b.strum).toBeUndefined();
		expect(b.ottava).toBeUndefined();
	});

	it('drops unknown technique values on load', () => {
		const doc = JSON.stringify({
			format: 'oto',
			tracks: [
				{
					measures: [
						{
							beats: [
								{
									duration: 4,
									notes: [{ string: 0, fret: 3, techniques: ['slap', 'laser-beam'] }]
								}
							]
						}
					]
				}
			]
		});
		const s = parse(doc);
		expect(s.tracks[0].measures[0].beats[0].notes[0].techniques).toEqual(['slap']);
	});
});
