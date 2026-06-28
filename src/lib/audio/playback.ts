// Bridges the reactive store and the Tone.js engine: compiles the score, maps a
// beat-based loop selection to a time window, starts/stops playback and pushes
// the playhead position back into the store.

import { audio, compileScore, type CompiledScore } from './engine';
import { store } from '$lib/stores/score.svelte';

// Compiling builds the full note/marker schedule for the whole score, which is
// wasted work on a resume (or repeated Play presses without an edit in between).
// Cache the result and only recompile when the store's scoreVersion has moved.
let cachedCompiled: CompiledScore | null = null;
let cachedVersion = -1;

function getCompiledScore(): CompiledScore {
	if (!cachedCompiled || cachedVersion !== store.scoreVersion) {
		cachedCompiled = compileScore(store.score);
		cachedVersion = store.scoreVersion;
	}
	return cachedCompiled;
}

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

/** Start playback from the cursor (or the loop region, if looping). A no-op if
 *  already playing — the cursor is always the single source of truth for where
 *  playback begins, whether this is a fresh play or a resume after pause. */
export async function play() {
	if (store.isPlaying) return;
	const compiled = getCompiledScore();

	let window: { start: number; end: number } | null = null;
	let repeat = false;
	const bounds = store.loopEnabled ? store.loopBounds : null;

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
	} else if (store.cursor.measure > 0 || store.cursor.beat > 0) {
		// Otherwise start one-shot playback from the cursor position.
		const start = timeAt(compiled, store.cursor.measure, store.cursor.beat);
		if (start > 0.01) window = { start, end: compiled.totalTime };
	}

	// Count-in: a bar of clicks (one per beat of the starting bar's metre) before
	// the music. Uses the metre and tempo in effect at the first played measure.
	const startMeasure = bounds?.startMeasure ?? store.cursor.measure;
	const startBeat = bounds?.startBeat ?? store.cursor.beat;
	const countIn = store.countInOn ? countInFor(startMeasure) : null;

	store.isPlaying = true;
	store.isPaused = false;
	store.playhead = { measure: startMeasure, beat: startBeat };

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

/** Pause in place: freezes the audio and syncs the cursor to the exact beat it
 *  stopped on, so the next Play resumes from there — and so the user can
 *  navigate the cursor anywhere else and have Play start from there instead. */
export function pausePlayback() {
	if (!store.isPlaying) return;
	audio.stop();
	const at = store.playhead ?? { measure: store.cursor.measure, beat: store.cursor.beat };
	store.setCursor({ measure: at.measure, beat: at.beat });
	store.isPlaying = false;
	store.isPaused = true;
	store.playhead = null;
}

/** Full stop: rewinds the cursor to bar 1, but doesn't scroll the score view
 *  (that's reserved for the explicit "back to start" button). */
export function stopPlayback() {
	audio.stop();
	store.isPlaying = false;
	store.isPaused = false;
	store.playhead = null;
	store.setCursor({ measure: 0, beat: 0 });
}

/** Toggle between play and pause, for the spacebar shortcut and the command
 *  palette — Play/Pause are otherwise driven by their own dedicated buttons. */
export function togglePlayback() {
	if (store.isPlaying) pausePlayback();
	else play();
}

/** Stop playback (if running), rewind the cursor to bar 1 and scroll the score back up. */
export function goToStart() {
	if (store.isPlaying || store.isPaused) stopPlayback();
	store.setCursor({ measure: 0, beat: 0 });
	store.scrollToStart();
}
