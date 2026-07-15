// Bridges the reactive store and the alphaSynth engine: compiles the score to
// MIDI, maps a beat-based loop selection to a tick window, starts/stops
// playback and pushes the playhead position back into the store.

import { audio, type CompiledSong, type MetronomeSound } from './engine';
import { compileSong } from './midi';
import { audioTrack } from './audio-track.svelte';
import { store } from '$lib/stores/score.svelte';

// Compiling builds the full MIDI file + tick tables for the whole score, which
// is wasted work on a resume (or repeated Play presses without an edit in
// between). Cache the result and only recompile when the store's scoreVersion
// has moved or the metronome click sound changed (it's baked into the MIDI).
let cachedCompiled: CompiledSong | null = null;
let cachedVersion = -1;
let cachedSound: MetronomeSound | null = null;

async function getCompiledSong(): Promise<CompiledSong> {
	if (
		!cachedCompiled ||
		cachedVersion !== store.scoreVersion ||
		cachedSound !== store.metronomeSound
	) {
		cachedCompiled = await compileSong(store.score, store.metronomeSound);
		cachedVersion = store.scoreVersion;
		cachedSound = store.metronomeSound;
	}
	return cachedCompiled;
}

/** MIDI tick of the start of a (measure, beat) in the compiled timeline.
 *  A beat index past the end of a measure resolves to the next measure's
 *  start (or the end of the piece), which is exactly what loop-end lookups
 *  need. */
function tickAt(compiled: CompiledSong, measure: number, beat: number): number {
	const beats = compiled.measureBeatTicks[measure];
	if (!beats) return compiled.totalTicks;
	if (beat < beats.length) return beats[beat];
	return compiled.measureTicks[measure + 1] ?? compiled.totalTicks;
}

/** Shared by `play()` and the live tempo-change reschedule: compute the
 *  window/loop for a given start position and hand it to the audio engine.
 *  Doesn't guard on `store.isPlaying` — callers decide whether this is a
 *  fresh start or a reschedule of an already-playing piece. */
async function startPlaybackFrom(
	startMeasure: number,
	startBeat: number,
	opts: { countIn: boolean }
) {
	store.isPlaying = true;
	store.isPaused = false;
	store.playhead = { measure: startMeasure, beat: startBeat };
	// Arm the audio backing track so it starts chasing the clock from the first
	// position callback below.
	audioTrack.onSongStart();

	try {
		const compiled = await getCompiledSong();

		let startTick = tickAt(compiled, startMeasure, startBeat);
		let loopStartTick = startTick;
		let endTick = compiled.totalTicks;
		let repeat = false;
		const bounds = store.loopEnabled ? store.loopBounds : null;

		if (bounds) {
			const selStart = tickAt(compiled, bounds.startMeasure, bounds.startBeat);
			const selEnd = tickAt(compiled, bounds.endMeasure, bounds.endBeat + 1) || compiled.totalTicks;
			if (startTick < selStart) {
				// Cursor is before the loop region: play from cursor, then loop within
				// the selection after reaching its end for the first time.
				loopStartTick = selStart;
			} else {
				// Cursor is inside or after the loop region: just loop the selection.
				startTick = selStart;
				loopStartTick = selStart;
			}
			endTick = selEnd;
			repeat = true;
		}

		await audio.play(compiled, {
			tracks: store.score.tracks,
			masterVolume: store.score.masterVolume ?? 0.85,
			metronome: store.metronomeOn,
			metronomeVolume: store.metronomeVolume,
			countIn: opts.countIn,
			playbackSpeed: store.effectivePlaybackSpeed,
			startTick,
			endTick,
			loopStartTick,
			repeat,
			onBeatMarker: (measure, beat) => {
				// The moving playback line does NOT read this — it extrapolates from
				// the engine clock on its own rAF loop (see PlayheadLine.svelte). The
				// store playhead only drives the per-measure consumers: playback
				// auto-scroll and the tracks panel's section highlight, plus the
				// pause-in-place cursor sync. Mutate in place rather than replacing
				// the object: Svelte 5's deep state only notifies subscribers of a
				// property that actually changed, so a beat tick inside the same
				// measure doesn't re-run the measure-level subscribers at all.
				const p = store.playhead;
				if (p) {
					p.measure = measure;
					p.beat = beat;
				} else {
					store.playhead = { measure, beat };
				}
			},
			onPosition: (ms) => audioTrack.syncToSong(ms),
			onStop: () => stopPlayback()
		});
		store.audioError = null;
	} catch {
		// Most commonly a failed engine start (soundfont couldn't load, or the
		// browser refused the AudioContext) — revert to a clean stopped state
		// and let the user know, instead of silently producing no sound.
		store.isPlaying = false;
		store.playhead = null;
		store.audioError = "Audio couldn't start. Tap Play again.";
	}
}

/** Start playback from the cursor (or the loop region, if looping). A no-op if
 *  already playing — the cursor is always the single source of truth for where
 *  playback begins, whether this is a fresh play or a resume after pause. */
export async function play() {
	if (store.isPlaying) return;
	await startPlaybackFrom(store.cursor.measure, store.cursor.beat, {
		countIn: store.countInOn
	});
}

/** Jump a playing piece to a new position and keep playing from there —
 *  click-to-seek from the score staff or the tracks panel. The beat index is
 *  clamped to the playback beats of the target measure (a click on a busier
 *  track can carry a beat index past what the compiled primary voice has —
 *  unclamped it would resolve to the *next* measure's start). No-op while
 *  stopped/paused: there a click just moves the cursor, and the next Play
 *  starts from the cursor anyway. */
export async function seekPlayback(measure: number, beat: number) {
	if (!store.isPlaying) return;
	const compiled = await getCompiledSong();
	if (!store.isPlaying) return; // stopped while compiling
	const beats = compiled.measureBeatTicks[measure];
	const clamped = Math.max(0, Math.min(beat, (beats?.length ?? 1) - 1));
	await startPlaybackFrom(measure, clamped, { countIn: false });
}

let tempoRescheduleTimer: ReturnType<typeof setTimeout> | null = null;

/** Call after a tempo change (stepper or live slider) so a piece already
 *  playing picks up the new speed immediately instead of waiting for the next
 *  Play. Tempo is baked into the compiled MIDI, so "live" here means
 *  reschedule from the current playhead with the newly compiled
 *  (faster/slower) timeline — debounced so a slider drag doesn't trigger a
 *  reschedule on every pointer-move tick. No-op while stopped/paused, since
 *  the next Play already picks up the new tempo on its own. */
export function reflectTempoChange() {
	if (!store.isPlaying) return;
	if (tempoRescheduleTimer) clearTimeout(tempoRescheduleTimer);
	tempoRescheduleTimer = setTimeout(() => {
		tempoRescheduleTimer = null;
		if (!store.isPlaying) return;
		const at = store.playhead ?? { measure: store.cursor.measure, beat: store.cursor.beat };
		startPlaybackFrom(at.measure, at.beat, { countIn: false });
	}, 120);
}

/** Pause in place: freezes the audio and syncs the cursor to the exact beat it
 *  stopped on, so the next Play resumes from there — and so the user can
 *  navigate the cursor anywhere else and have Play start from there instead. */
export function pausePlayback() {
	if (!store.isPlaying) return;
	audio.stop();
	audioTrack.onSongStop();
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
	audioTrack.onSongStop();
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
