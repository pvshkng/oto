// Latest computed layout per track, published by TrackStaff and read by the
// playback line (PlayheadLine). The line runs on a requestAnimationFrame loop
// outside Svelte's reactivity, so this is a plain non-reactive map: it must be
// readable every frame without registering dependencies, and it must not force
// a relayout — TrackStaff already computed (and cached) the layout to render,
// this just shares the same object. Entries are overwritten on every layout
// rebuild and never deleted; a stale entry for a removed track is harmless
// because readers only look up currently visible tracks.

import type { TrackLayout } from './layout';

const layouts = new Map<string, TrackLayout>();

export function registerTrackLayout(trackId: string, layout: TrackLayout): void {
	layouts.set(trackId, layout);
}

export function getTrackLayout(trackId: string): TrackLayout | undefined {
	return layouts.get(trackId);
}
