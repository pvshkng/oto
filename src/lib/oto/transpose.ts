// Transpose & detune operations on a score/track.

import { noteToMidi, midiToNote } from './pitch';
import type { OtoTrack } from './types';

/**
 * Detune: shift every open-string pitch of a track by `semitones`. This rewrites
 * the tuning so frets stay the same but the instrument sounds higher/lower —
 * matching how Guitar Pro "tuning"/detune works.
 */
export function detuneTrack(track: OtoTrack, semitones: number): OtoTrack {
	return {
		...track,
		tuning: track.tuning.map((n) => midiToNote(noteToMidi(n) + semitones))
	};
}

/**
 * Transpose: shift the written notes. We move frets by `semitones`, keeping the
 * same string where possible. If a fret would go below 0 we bump it up an octave
 * (still negative? clamp to 0). This keeps the tab playable without retuning.
 */
export function transposeTrackFrets(track: OtoTrack, semitones: number): OtoTrack {
	return {
		...track,
		measures: track.measures.map((measure) => ({
			...measure,
			beats: measure.beats.map((beat) => ({
				...beat,
				notes: beat.notes.map((note) => {
					let fret = note.fret + semitones;
					while (fret < 0) fret += 12;
					return { ...note, fret };
				})
			}))
		}))
	};
}

/**
 * Display transpose: store a semitone offset applied at render/playback without
 * changing the stored frets. Used for the non-destructive transpose control.
 */
export function setDisplayTranspose(track: OtoTrack, semitones: number): OtoTrack {
	return { ...track, transpose: semitones };
}
