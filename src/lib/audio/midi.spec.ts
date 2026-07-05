import { describe, it, expect } from 'vitest';
import { allocateChannels, compileSong, METRONOME_CHANNEL, TICKS_PER_QUARTER } from './midi';
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
