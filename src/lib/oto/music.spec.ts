import { describe, it, expect } from 'vitest';
import { noteToMidi, midiToNote, frettedMidi, midiToFreq, TUNINGS } from './pitch';
import {
	beatFraction,
	measureCapacity,
	measureFilled,
	analyzeMeasure,
	overflowCutoff
} from './duration';
import { detuneTrack, transposeTrackFrets } from './transpose';
import { makeTrack } from './format';
import type { OtoBeat, OtoMeasure } from './types';

describe('pitch', () => {
	it('round-trips scientific notation through MIDI', () => {
		expect(noteToMidi('E4')).toBe(64);
		expect(noteToMidi('A4')).toBe(69);
		expect(noteToMidi('C4')).toBe(60);
		expect(noteToMidi('E2')).toBe(40);
		expect(midiToNote(64)).toBe('E4');
		expect(midiToNote(69)).toBe('A4');
		expect(midiToNote(40)).toBe('E2');
	});

	it('parses sharps and flats', () => {
		expect(noteToMidi('F#3')).toBe(54);
		expect(noteToMidi('Eb3')).toBe(51);
		expect(noteToMidi('D#3')).toBe(51);
	});

	it('computes fretted MIDI with capo and transpose', () => {
		const tuning = TUNINGS['Guitar Standard'];
		expect(frettedMidi(tuning, 0, 0)).toBe(64); // open high E
		expect(frettedMidi(tuning, 5, 3)).toBe(43); // low E, 3rd fret = G2
		expect(frettedMidi(tuning, 0, 0, { capo: 2 })).toBe(66);
		expect(frettedMidi(tuning, 0, 0, { transpose: -12 })).toBe(52);
	});

	it('A4 is 440Hz', () => {
		expect(midiToFreq(69)).toBeCloseTo(440, 5);
		expect(midiToFreq(81)).toBeCloseTo(880, 5);
	});
});

describe('duration math', () => {
	const beat = (duration: 1 | 2 | 4 | 8 | 16 | 32, dotted = false): OtoBeat => ({
		duration,
		dotted,
		notes: [],
		rest: true
	});

	it('computes beat fractions of a whole note', () => {
		expect(beatFraction(beat(4))).toBe(0.25);
		expect(beatFraction(beat(8))).toBe(0.125);
		expect(beatFraction(beat(1))).toBe(1);
		expect(beatFraction(beat(4, true))).toBe(0.375); // dotted quarter
	});

	it('computes measure capacity for time signatures', () => {
		expect(measureCapacity([4, 4])).toBe(1);
		expect(measureCapacity([3, 4])).toBe(0.75);
		expect(measureCapacity([6, 8])).toBe(0.75);
	});

	it('detects a perfectly filled 4/4 bar', () => {
		const m: OtoMeasure = { beats: [beat(4), beat(4), beat(4), beat(4)] };
		expect(measureFilled(m)).toBe(1);
		const a = analyzeMeasure(m, [4, 4]);
		expect(a.overflow).toBe(false);
		expect(a.underfilled).toBe(false);
	});

	it('flags an overflowing bar', () => {
		const m: OtoMeasure = { beats: [beat(4), beat(4), beat(4), beat(4), beat(4)] };
		const a = analyzeMeasure(m, [4, 4]);
		expect(a.overflow).toBe(true);
		expect(a.filled).toBe(1.25);
	});

	it('flags an underfilled bar', () => {
		const m: OtoMeasure = { beats: [beat(4), beat(4)] };
		const a = analyzeMeasure(m, [4, 4]);
		expect(a.underfilled).toBe(true);
		expect(a.remaining).toBe(0.5);
	});

	it('finds the overflow cutoff beat (skip the over part)', () => {
		const m: OtoMeasure = { beats: [beat(4), beat(4), beat(4), beat(4), beat(4), beat(4)] };
		// capacity is 4 quarters; the 5th beat (index 4) is the first to overflow
		expect(overflowCutoff(m, [4, 4])).toBe(4);
	});

	it('cutoff equals beat count when within capacity', () => {
		const m: OtoMeasure = { beats: [beat(2), beat(2)] };
		expect(overflowCutoff(m, [4, 4])).toBe(2);
	});
});

describe('transpose & detune', () => {
	it('detune rewrites the tuning by semitones', () => {
		const t = makeTrack({ tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'] });
		const down = detuneTrack(t, -2);
		expect(down.tuning[0]).toBe('D4');
		expect(down.tuning[5]).toBe('D2');
	});

	it('transpose shifts frets and keeps them non-negative', () => {
		const t = makeTrack({
			tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'],
			measures: [{ beats: [{ duration: 4, notes: [{ string: 0, fret: 0 }], rest: false }] }]
		});
		const up = transposeTrackFrets(t, 2);
		expect(up.measures[0].beats[0].notes[0].fret).toBe(2);
		const down = transposeTrackFrets(t, -1);
		// 0 - 1 = -1 → bumped up an octave to 11
		expect(down.measures[0].beats[0].notes[0].fret).toBe(11);
	});
});
