// Mixer actions shared by the tracks panel and its mixer popover. Each mirrors
// the store, then pushes the change onto the live audio chain so a fader/knob
// is audible mid-playback rather than on the next play.

import { store } from '$lib/stores/score.svelte';
import { audio } from '$lib/audio/engine';
import { audioTrack } from '$lib/audio/audio-track.svelte';
import { seekPlayback } from '$lib/audio/playback';

export function setTrackVolume(i: number, v: number) {
	store.setVolume(i, v);
	audio.syncTrack(store.score.tracks[i]);
}

export function setMasterVolume(v: number) {
	store.setMasterVolume(v);
	audio.setMasterVolume(v); // live while playing
}

export function toggleMute(i: number) {
	store.toggleMute(i);
	// Solo/mute change every track's effective gain, so re-sync all of them.
	audio.syncAllTracks(store.score.tracks);
	audioTrack.applyGain();
}

export function toggleSolo(i: number) {
	store.toggleSolo(i);
	audio.syncAllTracks(store.score.tracks);
	// A MIDI solo also silences the audio track (unless it too is soloed).
	audioTrack.applyGain();
}

/** Jump the score view (and, mid-playback, the playback itself) to a bar of a
 *  track: reveal the track, move the cursor there, and when a piece is playing
 *  restart it from that bar so the panel doubles as a live navigator. */
export function jumpToBar(trackIdx: number, measure: number) {
	store.goToBar(trackIdx, measure);
	if (store.isPlaying) seekPlayback(measure, 0);
}
