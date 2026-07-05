import { describe, it, expect } from 'vitest';
import { AudioEngine } from './engine';
import { METRONOME_CHANNEL } from './midi';
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
