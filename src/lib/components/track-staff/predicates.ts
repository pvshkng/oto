// Cursor/selection/playhead hit-tests shared by TrackStaff and its Voice
// components. All read the store directly; the caller supplies only the
// per-track/per-band context (trackIndex, isActiveTrack) it already has.

import { store } from '$lib/stores/score.svelte';

export function isCursorBeat(
	measureIndex: number,
	beatIndex: number,
	voice: number,
	isActiveTrack: boolean
): boolean {
	return (
		isActiveTrack &&
		store.cursor.voice === voice &&
		store.cursor.measure === measureIndex &&
		store.cursor.beat === beatIndex
	);
}

export function inSelection(measureIndex: number, beatIndex: number, trackIndex: number): boolean {
	const b = store.loopBounds;
	if (!b || store.selection?.track !== trackIndex) return false;
	const key = measureIndex * 1000 + beatIndex;
	return key >= b.startMeasure * 1000 + b.startBeat && key <= b.endMeasure * 1000 + b.endBeat;
}

export function isPlayingBeat(measureIndex: number, beatIndex: number): boolean {
	// Check the measure first and only touch `beat` when it matches: reads are
	// what subscribe the calling template block, so beats outside the playing
	// measure never subscribe to the per-beat signal and stay untouched by the
	// high-frequency beat ticks (the playhead object is mutated in place — see
	// playback.ts — so per-property granularity holds across ticks).
	const p = store.playhead;
	if (!p || p.measure !== measureIndex) return false;
	return p.beat === beatIndex;
}
