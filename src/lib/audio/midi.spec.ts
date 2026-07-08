import { describe, it, expect } from 'vitest';
import {
	allocateChannels,
	compileSong,
	expandRepeats,
	METRONOME_CHANNEL,
	TICKS_PER_QUARTER
} from './midi';
import { makeScore, makeTrack } from '$lib/oto/format';
import type { OtoBeat } from '$lib/oto/types';

function note(string: number, fret: number, duration: OtoBeat['duration'] = 4): OtoBeat {
	return { duration, notes: [{ string, fret }] };
}

describe('allocateChannels', () => {
	it('gives pitched tracks their own channels, skipping percussion/reserved ones', () => {
		const tracks = [
			makeTrack({ id: 'a' }),
			makeTrack({ id: 'b' }),
			makeTrack({ id: 'd', instrument: 'drums' }),
			makeTrack({ id: 'c' })
		];
		const channels = allocateChannels(tracks);
		expect(channels.get('a')).toBe(0);
		expect(channels.get('b')).toBe(1);
		expect(channels.get('d')).toBe(9); // GM percussion
		expect(channels.get('c')).toBe(2);
		// None may collide with the metronome channel.
		expect([...channels.values()]).not.toContain(METRONOME_CHANNEL);
	});
});

describe('compileSong', () => {
	it('computes tick tables for a simple 4/4 score', async () => {
		const track = makeTrack({
			measures: [
				{ beats: [note(0, 0), note(0, 2), note(0, 3), note(0, 5)] },
				{ beats: [note(1, 0), note(1, 1)] }
			]
		});
		const score = makeScore({ tempo: 120, timeSignature: [4, 4], tracks: [track] });
		const compiled = await compileSong(score, 'click');

		const bar = TICKS_PER_QUARTER * 4;
		expect(compiled.totalTicks).toBe(bar * 2);
		expect(compiled.measureTicks).toEqual([0, bar]);
		expect(compiled.measureBeatTicks[0]).toEqual([
			0,
			TICKS_PER_QUARTER,
			TICKS_PER_QUARTER * 2,
			TICKS_PER_QUARTER * 3
		]);
		expect(compiled.measureBeatTicks[1]).toEqual([bar, bar + TICKS_PER_QUARTER]);
		expect(compiled.beatTicks.map((b) => `${b.measure}:${b.beat}`)).toEqual([
			'0:0',
			'0:1',
			'0:2',
			'0:3',
			'1:0',
			'1:1'
		]);
	});

	it('writes notes to each track channel and clicks to the metronome channel', async () => {
		const guitar = makeTrack({ id: 'g', measures: [{ beats: [note(0, 0)] }] });
		const drums = makeTrack({
			id: 'd',
			instrument: 'drums',
			tuning: ['C2'],
			measures: [{ beats: [note(0, 0)] }]
		});
		const score = makeScore({ timeSignature: [4, 4], tracks: [guitar, drums] });
		const compiled = await compileSong(score, 'click');

		type NoteOn = { channel?: number; type: number };
		const events = compiled.midi.events as unknown as NoteOn[];
		// NoteOn = 0x90 in alphaTab's MidiEventType enum.
		const noteOns = events.filter((e) => e.type === 0x90);
		const byChannel = new Map<number, number>();
		for (const e of noteOns) {
			byChannel.set(e.channel!, (byChannel.get(e.channel!) ?? 0) + 1);
		}
		expect(byChannel.get(0)).toBe(1); // guitar note
		expect(byChannel.get(9)).toBe(1); // drum hit on GM percussion
		expect(byChannel.get(METRONOME_CHANNEL)).toBe(4); // 4 clicks in a 4/4 bar
	});

	it('respects per-measure tempo for tick math (ticks are tempo-independent)', async () => {
		const track = makeTrack({
			measures: [{ tempo: 60, beats: [note(0, 0), note(0, 1)] }, { beats: [note(0, 2)] }]
		});
		const score = makeScore({ tempo: 120, tracks: [track] });
		const compiled = await compileSong(score, 'click');
		// Ticks measure musical time, so a slower bar still spans the same ticks.
		expect(compiled.measureTicks).toEqual([0, TICKS_PER_QUARTER * 4]);
	});

	it('keeps a mid-song tempo change in effect until the next one', async () => {
		const track = makeTrack({
			measures: [
				{ beats: [note(0, 0)] },
				{ tempo: 90, beats: [note(0, 1)] },
				{ beats: [note(0, 2)] },
				{ tempo: 180, beats: [note(0, 3)] }
			]
		});
		const score = makeScore({ tempo: 120, timeSignature: [4, 4], tracks: [track] });
		const compiled = await compileSong(score, 'click');
		const bar = TICKS_PER_QUARTER * 4;

		type TempoEvent = { type: number; tick: number; beatsPerMinute: number };
		const events = compiled.midi.events as unknown as TempoEvent[];
		// MidiEventType.TempoChange = 81. One event per change — and none where a
		// bar merely inherits the tempo already in effect (bar 3 stays at 90
		// instead of snapping back to the base 120).
		const tempos = events.filter((e) => e.type === 81).map((e) => `${e.tick}:${e.beatsPerMinute}`);
		expect(tempos).toEqual([`0:120`, `${bar}:90`, `${bar * 3}:180`]);
	});

	it('expands a plain repeat into two passes', () => {
		const track = makeTrack({
			measures: [
				{ repeatStart: true, beats: [note(0, 0)] },
				{ repeatEnd: true, beats: [note(0, 1)] },
				{ beats: [note(0, 2)] }
			]
		});
		const score = makeScore({ tracks: [track] });
		expect(expandRepeats(score, 3)).toEqual([0, 1, 0, 1, 2]);
	});

	it('honors repeatCount for extra passes', () => {
		const track = makeTrack({
			measures: [
				{ repeatStart: true, beats: [note(0, 0)] },
				{ repeatEnd: true, repeatCount: 3, beats: [note(0, 1)] }
			]
		});
		const score = makeScore({ tracks: [track] });
		expect(expandRepeats(score, 2)).toEqual([0, 1, 0, 1, 0, 1]);
	});

	it('rewinds a bare end-repeat to the start of the piece', () => {
		const track = makeTrack({
			measures: [{ beats: [note(0, 0)] }, { repeatEnd: true, beats: [note(0, 1)] }]
		});
		const score = makeScore({ tracks: [track] });
		expect(expandRepeats(score, 2)).toEqual([0, 1, 0, 1]);
	});

	it('plays volta endings only on their matching pass', () => {
		const track = makeTrack({
			measures: [
				{ repeatStart: true, beats: [note(0, 0)] },
				{ volta: 1, repeatEnd: true, beats: [note(0, 1)] },
				{ volta: 2, beats: [note(0, 2)] },
				{ beats: [note(0, 3)] }
			]
		});
		const score = makeScore({ tracks: [track] });
		expect(expandRepeats(score, 4)).toEqual([0, 1, 0, 2, 3]);
	});

	it('lays repeated passes out on the compiled timeline', async () => {
		const track = makeTrack({
			measures: [
				{ repeatStart: true, beats: [note(0, 0)] },
				{ repeatEnd: true, beats: [note(0, 1)] },
				{ beats: [note(0, 2)] }
			]
		});
		const score = makeScore({ timeSignature: [4, 4], tracks: [track] });
		const compiled = await compileSong(score, 'click');
		const bar = TICKS_PER_QUARTER * 4;
		// 0,1,0,1,2 → five bars of audio; per-measure tables keep the first pass.
		expect(compiled.totalTicks).toBe(bar * 5);
		expect(compiled.measureTicks).toEqual([0, bar, bar * 4]);
		// Playhead markers follow the jump back to bar 0 on the second pass.
		expect(compiled.beatTicks.map((b) => b.measure)).toEqual([0, 1, 0, 1, 2]);
		expect(compiled.beatTicks.map((b) => b.tick)).toEqual([0, bar, bar * 2, bar * 3, bar * 4]);
	});

	it('maps a skipped volta ending to the next played tick', async () => {
		const track = makeTrack({
			measures: [
				{ repeatStart: true, beats: [note(0, 0)] },
				{ volta: 3, beats: [note(0, 1)] }, // never plays with the default ×2
				{ repeatEnd: true, beats: [note(0, 2)] }
			]
		});
		const score = makeScore({ timeSignature: [4, 4], tracks: [track] });
		const compiled = await compileSong(score, 'click');
		const bar = TICKS_PER_QUARTER * 4;
		// Order is 0,2,0,2 — bar 1 never sounds but still resolves to a tick.
		expect(compiled.totalTicks).toBe(bar * 4);
		expect(compiled.measureTicks[1]).toBe(compiled.measureTicks[2]);
	});

	it('sounds the echoed bar for a simile mark', async () => {
		const track = makeTrack({
			measures: [
				{ beats: [note(0, 5), note(0, 7), note(0, 5), note(0, 7)] },
				{ simile: true, beats: [{ duration: 1, notes: [], rest: true }] }
			]
		});
		const score = makeScore({ timeSignature: [4, 4], tracks: [track] });
		const compiled = await compileSong(score, 'click');

		type NoteOn = { channel?: number; type: number };
		const events = compiled.midi.events as unknown as NoteOn[];
		const noteOns = events.filter((e) => e.type === 0x90 && e.channel === 0);
		// Bar 2 replays bar 1's four notes instead of its own whole rest.
		expect(noteOns.length).toBe(8);
		// The playhead stays clamped to the simile bar's own single beat.
		const barTwoMarkers = compiled.beatTicks.filter((b) => b.measure === 1);
		expect(barTwoMarkers.map((b) => b.beat)).toEqual([0, 0, 0, 0]);
	});

	it('drops beats that overflow the bar capacity', async () => {
		const track = makeTrack({
			measures: [{ beats: [note(0, 0, 2), note(0, 1, 2), note(0, 2, 2)] }] // 3 halves in 4/4
		});
		const score = makeScore({ timeSignature: [4, 4], tracks: [track] });
		const compiled = await compileSong(score, 'click');
		// Only the two halves that fit produce beat markers.
		expect(compiled.measureBeatTicks[0]).toEqual([0, TICKS_PER_QUARTER * 2]);
	});
});
