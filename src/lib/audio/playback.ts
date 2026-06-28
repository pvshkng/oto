// Bridges the reactive store and the Tone.js engine: compiles the score, maps a
// beat-based loop selection to a time window, starts/stops playback and pushes
// the playhead position back into the store.

import { audio, compileScore, type CompiledScore } from './engine';
import { store } from '$lib/stores/score.svelte';

/** Seconds offset of the start of a (measure, beat) in the compiled timeline.
 *  Takes an already-compiled score so a single play cycle compiles once rather
 *  than re-compiling the whole score on every timing lookup. */
function timeAt(compiled: CompiledScore, measure: number, beat: number): number {
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

/** Count-in spec for a starting measure: one click per beat of that bar's metre,
 *  spaced by the bar's beat length in seconds at the measure's tempo. */
function countInFor(measure: number): { beats: number; interval: number } {
	const ts = store.timeSignatureAt(measure);
	const m = store.score.tracks[0]?.measures[measure];
	const tempo = m?.tempo ?? store.score.tempo;
	// Seconds per notated beat = (4/den) quarter notes × (60/tempo) per quarter.
	const interval = (4 / ts[1]) * (60 / tempo);
	return { beats: ts[0], interval };
}

/** Play from the current position, or resume from where playback was paused.
 *  Pressing this while already playing pauses (see `pausePlayback`) — it does
 *  not stop, so a second press resumes exactly where it left off. */
export async function togglePlayback() {
	if (store.isPlaying) {
		pausePlayback();
		return;
	}
	const compiled = compileScore(store.score);

	let window: { start: number; end: number } | null = null;
	let repeat = false;
	const bounds = store.loopEnabled ? store.loopBounds : null;
	// Resuming from a pause takes priority over the loop/cursor start so
	// "play again" continues from the exact note it was paused at, never from
	// the selection or the top of the loop.
	const resumeAt = !bounds && store.isPaused ? store.pausePosition : null;

	if (bounds) {
		// Loop the selected region.
		const start = timeAt(compiled, bounds.startMeasure, bounds.startBeat);
		const endTrack = store.score.tracks[0];
		const endMeasure = endTrack.measures[bounds.endMeasure];
		const endBeatCount = endMeasure?.beats.length ?? 0;
		const end =
			bounds.endBeat + 1 < endBeatCount
				? timeAt(compiled, bounds.endMeasure, bounds.endBeat + 1)
				: timeAt(compiled, bounds.endMeasure + 1, 0) || compiled.totalTime;
		window = { start, end };
		repeat = true;
	} else if (resumeAt) {
		const start = timeAt(compiled, resumeAt.measure, resumeAt.beat);
		if (start > 0.01) window = { start, end: compiled.totalTime };
	} else if (store.cursor.measure > 0 || store.cursor.beat > 0) {
		// Otherwise start one-shot playback from the cursor position.
		const start = timeAt(compiled, store.cursor.measure, store.cursor.beat);
		if (start > 0.01) window = { start, end: compiled.totalTime };
	}

	// Count-in: a bar of clicks (one per beat of the starting bar's metre) before
	// the music. Uses the metre and tempo in effect at the first played measure.
	const startMeasure = bounds?.startMeasure ?? resumeAt?.measure ?? store.cursor.measure;
	const countIn = store.countInOn ? countInFor(startMeasure) : null;

	store.isPlaying = true;
	store.isPaused = false;
	store.pausePosition = null;
	store.playhead = resumeAt ?? { measure: bounds?.startMeasure ?? store.cursor.measure, beat: 0 };

	try {
		await audio.play(store.score, compiled, {
			metronome: store.metronomeOn,
			metronomeSound: store.metronomeSound,
			metronomeVolume: store.metronomeVolume,
			window,
			repeat,
			countIn,
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

/** Pause in place: freezes the audio at the current beat and remembers it, so
 *  the next Play resumes from here rather than the selection or bar 1. */
export function pausePlayback() {
	audio.stop();
	store.isPlaying = false;
	store.isPaused = true;
	store.pausePosition = store.playhead ?? {
		measure: store.cursor.measure,
		beat: store.cursor.beat
	};
}

/** Full stop: drops the paused position too, so the next Play restarts from
 *  the selection cursor. */
export function stopPlayback() {
	audio.stop();
	store.isPlaying = false;
	store.isPaused = false;
	store.pausePosition = null;
	store.playhead = null;
}

/** Stop playback (if running), rewind the cursor to bar 1 and scroll the score back up. */
export function goToStart() {
	if (store.isPlaying || store.isPaused) stopPlayback();
	store.setCursor({ measure: 0, beat: 0 });
	store.scrollToStart();
}
