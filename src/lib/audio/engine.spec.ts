import { describe, it, expect } from 'vitest';
import { AudioEngine } from './engine';

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
