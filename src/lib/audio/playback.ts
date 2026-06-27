// Bridges the reactive store and the Tone.js engine: compiles the score, maps a
// beat-based loop selection to a time window, starts/stops playback and pushes
// the playhead position back into the store.

import { audio, compileScore } from './engine';
import { store } from '$lib/stores/score.svelte';

/** Seconds offset of the start of a (measure, beat) in the compiled timeline. */
function timeAt(measure: number, beat: number): number {
	const compiled = compileScore(store.score);
	// Find the marker for the measure, then add up beat durations of track 0.
	const marker = compiled.markers.find((m) => m.measure === measure);
	let t = marker?.time ?? 0;
	const track = store.score.tracks[0];
	const m = track.measures[measure];
	if (m) {
		const tempo = m.tempo ?? store.score.tempo;
		const q = 60 / tempo;
		for (let i = 0; i < beat && i < m.beats.length; i++) {
			const b = m.beats[i];
			const frac = b.dotted ? (1 / b.duration) * 1.5 : 1 / b.duration;
			t += frac * 4 * q;
		}
	}
	return t;
}

export async function togglePlayback() {
	if (store.isPlaying) {
		stopPlayback();
		return;
	}
	const compiled = compileScore(store.score);

	let window: { start: number; end: number } | null = null;
	let repeat = false;
	const bounds = store.loopEnabled ? store.loopBounds : null;
	if (bounds) {
		// Loop the selected region.
		const start = timeAt(bounds.startMeasure, bounds.startBeat);
		const endTrack = store.score.tracks[0];
		const endMeasure = endTrack.measures[bounds.endMeasure];
		const endBeatCount = endMeasure?.beats.length ?? 0;
		const end =
			bounds.endBeat + 1 < endBeatCount
				? timeAt(bounds.endMeasure, bounds.endBeat + 1)
				: timeAt(bounds.endMeasure + 1, 0) || compiled.totalTime;
		window = { start, end };
		repeat = true;
	} else if (store.cursor.measure > 0 || store.cursor.beat > 0) {
		// Otherwise start one-shot playback from the cursor position.
		const start = timeAt(store.cursor.measure, store.cursor.beat);
		if (start > 0.01) window = { start, end: compiled.totalTime };
	}

	store.isPlaying = true;
	store.playhead = { measure: bounds?.startMeasure ?? store.cursor.measure, beat: 0 };

	try {
		await audio.play(store.score, compiled, {
			metronome: store.metronomeOn,
			metronomeSound: store.metronomeSound,
			window,
			repeat,
			onMarker: () => {},
			onBeatMarker: (measure, beat) => {
				store.playhead = { measure, beat };
			},
			onBeat: () => {},
			onStop: () => stopPlayback()
		});
		store.audioError = null;
	} catch {
		// Most commonly a blocked autoplay policy (the click didn't count as a
		// direct user gesture in this browser) — revert to a clean stopped state
		// and let the user know, instead of silently producing no sound.
		store.isPlaying = false;
		store.playhead = null;
		store.audioError = "Audio couldn't start — tap Play again.";
	}
}

export function stopPlayback() {
	audio.stop();
	store.isPlaying = false;
	store.playhead = null;
}

/** Stop playback (if running), rewind the cursor to bar 1 and scroll the score back up. */
export function goToStart() {
	if (store.isPlaying) stopPlayback();
	store.setCursor({ measure: 0, beat: 0 });
	store.scrollToStart();
}
