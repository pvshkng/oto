import { describe, expect, it } from 'vitest';
import { autoCorrelate } from './tuner.svelte';

const SAMPLE_RATE = 44100;
const SIZE = 2048;
const TARGET_RMS = 0.25;

/** Build a detection window normalised to the tuner's working RMS, the way
 *  the controller hands buffers to autoCorrelate. */
function normalized(fill: (i: number) => number): Float32Array {
	const buf = new Float32Array(SIZE);
	let rms = 0;
	for (let i = 0; i < SIZE; i++) {
		buf[i] = fill(i);
		rms += buf[i] * buf[i];
	}
	rms = Math.sqrt(rms / SIZE);
	for (let i = 0; i < SIZE; i++) buf[i] *= TARGET_RMS / rms;
	return buf;
}

function sine(freq: number, amplitude = 1) {
	return (i: number) => amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
}

describe('autoCorrelate', () => {
	it('detects A4 regardless of capture level (normalisation upstream)', () => {
		// The same waveform at a phone-mic whisper and a hot desktop level must
		// produce the same reading once normalised.
		for (const amplitude of [0.003, 0.9]) {
			const f = autoCorrelate(normalized(sine(440, amplitude)), SAMPLE_RATE);
			expect(Math.abs(f - 440)).toBeLessThan(1);
		}
	});

	it('detects a low guitar E with harmonics', () => {
		const f0 = 82.41;
		const buf = normalized(
			(i) =>
				Math.sin((2 * Math.PI * f0 * i) / SAMPLE_RATE) +
				0.5 * Math.sin((2 * Math.PI * 2 * f0 * i) / SAMPLE_RATE) +
				0.3 * Math.sin((2 * Math.PI * 3 * f0 * i) / SAMPLE_RATE)
		);
		const f = autoCorrelate(buf, SAMPLE_RATE);
		expect(Math.abs(f - f0)).toBeLessThan(1);
	});

	it('detects a clipped (hot-mic) signal', () => {
		const buf = normalized((i) =>
			Math.max(-0.4, Math.min(0.4, Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE)))
		);
		const f = autoCorrelate(buf, SAMPLE_RATE);
		expect(Math.abs(f - 220)).toBeLessThan(1);
	});

	it('rejects broadband noise however loud (confidence gate)', () => {
		// Deterministic pseudo-noise, normalised to full working level — exactly
		// what a hot desktop mic's room noise looks like after the AGC.
		let seed = 1;
		const rand = () => {
			seed = (seed * 48271) % 2147483647;
			return seed / 2147483647 - 0.5;
		};
		const f = autoCorrelate(
			normalized(() => rand()),
			SAMPLE_RATE
		);
		expect(f).toBe(-1);
	});
});
