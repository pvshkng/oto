import { describe, it, expect } from 'vitest';
import { AudioEngine } from './engine';
import { METRONOME_CHANNEL, type BeatTick } from './midi';
import { makeTrack } from '$lib/oto/format';

/** Minimal stand-in for the alphaSynth worker API — records the channel mix
 *  calls the engine writes through to it. TS `private` is erased at runtime,
 *  so tests inject it straight into the engine's `synth` field. */
function fakeSynth() {
	return {
		volumes: new Map<number, number>(),
		mutes: new Map<number, boolean>(),
		solos: new Map<number, boolean>(),
		setChannelVolume(channel: number, volume: number) {
			this.volumes.set(channel, volume);
		},
		setChannelMute(channel: number, mute: boolean) {
			this.mutes.set(channel, mute);
		},
		setChannelSolo(channel: number, solo: boolean) {
			this.solos.set(channel, solo);
		}
	};
}

type EngineInternals = {
	synth: ReturnType<typeof fakeSynth>;
	channels: Map<string, number>;
	metroEnabled: boolean;
};

function engineWithFakeSynth(channelByTrack: Record<string, number>) {
	const engine = new AudioEngine();
	const synth = fakeSynth();
	const internals = engine as unknown as EngineInternals;
	internals.synth = synth;
	internals.channels = new Map(Object.entries(channelByTrack));
	return { engine, synth };
}

describe('AudioEngine.setMetronomeVolume', () => {
	it('clamps the stored level to 0..1', () => {
		const engine = new AudioEngine();
		engine.setMetronomeVolume(0.42);
		expect(engine.metronomeVolume).toBeCloseTo(0.42, 5);

		engine.setMetronomeVolume(1.5);
		expect(engine.metronomeVolume).toBe(1);

		engine.setMetronomeVolume(-0.5);
		expect(engine.metronomeVolume).toBe(0);
	});

	it('writes the clamped level to the metronome channel when the synth is up', () => {
		const { engine, synth } = engineWithFakeSynth({});
		engine.setMetronomeVolume(0.3);
		expect(synth.volumes.get(METRONOME_CHANNEL)).toBeCloseTo(0.3, 5);

		engine.setMetronomeVolume(2);
		expect(synth.volumes.get(METRONOME_CHANNEL)).toBe(1);
	});
});

describe('AudioEngine.setMetronomeEnabled', () => {
	it('mutes/unmutes the metronome channel live', () => {
		const { engine, synth } = engineWithFakeSynth({});
		engine.setMetronomeEnabled(true);
		expect(synth.mutes.get(METRONOME_CHANNEL)).toBe(false);
		engine.setMetronomeEnabled(false);
		expect(synth.mutes.get(METRONOME_CHANNEL)).toBe(true);
	});
});

describe('AudioEngine mute/solo (applied live via synth channel state)', () => {
	it('passes a muted track through and restores it on unmute', () => {
		const { engine, synth } = engineWithFakeSynth({ t1: 0 });
		const track = makeTrack({ id: 't1', volume: 0.7 });

		engine.syncAllTracks([track]);
		expect(synth.volumes.get(0)).toBeCloseTo(0.7, 5);
		expect(synth.mutes.get(0)).toBe(false);

		track.muted = true;
		engine.syncAllTracks([track]);
		expect(synth.mutes.get(0)).toBe(true);

		track.muted = false;
		engine.syncAllTracks([track]);
		expect(synth.mutes.get(0)).toBe(false);
	});

	it('marks soloed channels and keeps the metronome exempt from solo muting', () => {
		const { engine, synth } = engineWithFakeSynth({ a: 0, b: 1 });
		const a = makeTrack({ id: 'a', volume: 1 });
		const b = makeTrack({ id: 'b', volume: 1 });

		// No solo yet — nothing marked solo, metronome not solo either.
		engine.syncAllTracks([a, b]);
		expect(synth.solos.get(0)).toBe(false);
		expect(synth.solos.get(1)).toBe(false);
		expect(synth.solos.get(METRONOME_CHANNEL)).toBe(false);

		// Solo b — only b's channel is solo; the metronome channel is marked
		// solo too so clicks aren't silenced by the synth's solo logic.
		b.soloed = true;
		engine.syncAllTracks([a, b]);
		expect(synth.solos.get(0)).toBe(false);
		expect(synth.solos.get(1)).toBe(true);
		expect(synth.solos.get(METRONOME_CHANNEL)).toBe(true);

		// Un-solo — everything clears.
		b.soloed = false;
		engine.syncAllTracks([a, b]);
		expect(synth.solos.get(1)).toBe(false);
		expect(synth.solos.get(METRONOME_CHANNEL)).toBe(false);
	});
});

type ClockInternals = {
	beatTicks: BeatTick[];
	totalTicks: number;
	clockTick: number;
	clockWall: number;
	clockRate: number;
	repeat: boolean;
	loopEndTick: number;
};

/** Engine primed as if playing: two 4/4 measures of quarter beats (960 ticks
 *  each), with measure 1 repeated — so the beat table carries two passes of
 *  measure 1, exactly like a compiled score with a repeat barline. */
function playingEngine(at: { tick: number; rate?: number }) {
	const engine = new AudioEngine();
	const c = engine as unknown as ClockInternals;
	const beats: BeatTick[] = [];
	// measure 0: ticks 0..3840, measure 1 (pass 1): 3840..7680,
	// measure 1 (pass 2): 7680..11520
	for (const [m, base] of [
		[0, 0],
		[1, 3840],
		[1, 7680]
	] as const) {
		for (let b = 0; b < 4; b++) beats.push({ tick: base + b * 960, measure: m, beat: b });
	}
	c.beatTicks = beats;
	c.totalTicks = 11520;
	c.clockTick = at.tick;
	c.clockWall = performance.now();
	c.clockRate = at.rate ?? 0;
	engine.playing = true;
	return engine;
}

describe('AudioEngine.displayPosition', () => {
	it('returns null while stopped', () => {
		const engine = playingEngine({ tick: 0 });
		engine.playing = false;
		expect(engine.displayPosition()).toBeNull();
	});

	it('maps a tick to its measure with tick-within-measure and measure length', () => {
		const pos = playingEngine({ tick: 4800 }).displayPosition()!;
		expect(pos.measure).toBe(1);
		expect(pos.tickIn).toBe(960);
		expect(pos.measureTicks).toBe(3840);
	});

	it('resolves a repeated measure to the pass being played now', () => {
		// Tick 8640 is beat 1 of measure 1's SECOND pass — the measure walk must
		// stop at the pass boundary (beat index reset), not merge both passes.
		const pos = playingEngine({ tick: 8640 }).displayPosition()!;
		expect(pos.measure).toBe(1);
		expect(pos.tickIn).toBe(960);
		expect(pos.measureTicks).toBe(3840);
	});

	it('extrapolates from the anchor at the measured rate', () => {
		const engine = playingEngine({ tick: 0, rate: 1.92 });
		const c = engine as unknown as ClockInternals;
		c.clockWall = performance.now() - 100; // 100ms since the last callback
		const pos = engine.displayPosition()!;
		expect(pos.measure).toBe(0);
		expect(pos.tickIn).toBeGreaterThan(150); // ≈192, minus timer jitter
		expect(pos.tickIn).toBeLessThan(250);
	});

	it('caps extrapolation when callbacks stop arriving', () => {
		const engine = playingEngine({ tick: 0, rate: 1.92 });
		const c = engine as unknown as ClockInternals;
		c.clockWall = performance.now() - 10_000; // stalled for 10s
		const pos = engine.displayPosition()!;
		// At most 300ms × rate past the anchor — not 10s ahead.
		expect(pos.measure).toBe(0);
		expect(pos.tickIn).toBeLessThanOrEqual(1.92 * 300 + 1);
	});

	it('never runs past the loop end while repeating', () => {
		const engine = playingEngine({ tick: 7600, rate: 1.92 });
		const c = engine as unknown as ClockInternals;
		c.repeat = true;
		c.loopEndTick = 7680;
		c.clockWall = performance.now() - 200;
		const pos = engine.displayPosition()!;
		// Clamped to the wrap point (end of measure 1's first pass).
		expect(pos.measure).toBe(1);
		expect(pos.tickIn).toBeLessThanOrEqual(3840);
	});
});
