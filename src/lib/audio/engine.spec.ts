import { describe, it, expect } from 'vitest';
import { AudioEngine } from './engine';
import { makeTrack } from '$lib/oto/format';

/** Minimal stand-in for the Tone nodes a TrackVoice wraps — enough for
 *  applyTrackSettings()/syncAllTracks() to write through to, same trick
 *  engine.spec.ts already uses for metroGain above. */
function fakeVoice() {
	return {
		gain: { gain: { value: 1 } },
		panner: { pan: { value: 0 } },
		eq: { low: { value: 0 }, mid: { value: 0 }, high: { value: 0 } }
	};
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

	it('updates the gain node when one is attached, also clamped', () => {
		const engine = new AudioEngine();
		// Stand in for the Tone.Gain the engine builds on start. TS `private` is
		// erased at runtime, so the engine writes straight through to it.
		const gain = { gain: { value: 0 } };
		(engine as unknown as { metroGain: typeof gain }).metroGain = gain;

		engine.setMetronomeVolume(0.3);
		expect(gain.gain.value).toBeCloseTo(0.3, 5);

		engine.setMetronomeVolume(2);
		expect(gain.gain.value).toBe(1);

		engine.setMetronomeVolume(-1);
		expect(gain.gain.value).toBe(0);
	});
});

describe('AudioEngine.setMetronomeEnabled', () => {
	it('flips the live on/off flag checked by the click scheduler', () => {
		const engine = new AudioEngine();
		expect((engine as unknown as { metroEnabled: boolean }).metroEnabled).toBe(false);
		engine.setMetronomeEnabled(true);
		expect((engine as unknown as { metroEnabled: boolean }).metroEnabled).toBe(true);
		engine.setMetronomeEnabled(false);
		expect((engine as unknown as { metroEnabled: boolean }).metroEnabled).toBe(false);
	});
});

describe('AudioEngine mute/solo (applied live via each track gain node)', () => {
	it('silences a muted track and restores it on unmute', () => {
		const engine = new AudioEngine();
		const voice = fakeVoice();
		(engine as unknown as { voices: Map<string, typeof voice> }).voices.set('t1', voice);
		const track = makeTrack({ id: 't1', volume: 0.7 });

		engine.syncAllTracks([track]);
		expect(voice.gain.gain.value).toBeCloseTo(0.7, 5);

		track.muted = true;
		engine.syncAllTracks([track]);
		expect(voice.gain.gain.value).toBe(0);

		track.muted = false;
		engine.syncAllTracks([track]);
		expect(voice.gain.gain.value).toBeCloseTo(0.7, 5);
	});

	it('solo silences every other track live, and clears when un-soloed', () => {
		const engine = new AudioEngine();
		const voiceA = fakeVoice();
		const voiceB = fakeVoice();
		const engineInternals = engine as unknown as {
			voices: Map<string, ReturnType<typeof fakeVoice>>;
		};
		engineInternals.voices.set('a', voiceA);
		engineInternals.voices.set('b', voiceB);
		const a = makeTrack({ id: 'a', volume: 1 });
		const b = makeTrack({ id: 'b', volume: 1 });

		// No solo yet — both audible.
		engine.syncAllTracks([a, b]);
		expect(voiceA.gain.gain.value).toBe(1);
		expect(voiceB.gain.gain.value).toBe(1);

		// Solo b — a goes silent even though it isn't muted itself.
		b.soloed = true;
		engine.syncAllTracks([a, b]);
		expect(voiceA.gain.gain.value).toBe(0);
		expect(voiceB.gain.gain.value).toBe(1);

		// Un-solo — a is audible again.
		b.soloed = false;
		engine.syncAllTracks([a, b]);
		expect(voiceA.gain.gain.value).toBe(1);
	});
});
