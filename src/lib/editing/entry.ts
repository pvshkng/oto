// Shared fret-entry logic used by both the physical keyboard (page) and the
// on-screen keypad (edit panel). Accumulates multi-digit frets, auditions the
// note, and smart-advances the cursor (instant for unambiguous frets; a brief
// wait for 1/2 which could grow into 10..24).

import { store } from '$lib/stores/score.svelte';
import { audio } from '$lib/audio/engine';

let buffer = '';
let timer: ReturnType<typeof setTimeout> | null = null;

function finish() {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
	buffer = '';
	if (store.autoAdvance) store.advanceForEntry();
}

export function enterDigit(d: string) {
	const next = buffer + d;
	const fret = parseInt(next, 10);
	buffer = fret > 24 ? d : next; // frets above 24 restart the buffer
	store.setFretAtCursor(parseInt(buffer, 10));

	const n = store.currentNote;
	if (n) audio.pluck(store.track, n.string, n.fret);

	if (timer) clearTimeout(timer);
	const complete = buffer.length === 2 || !['1', '2'].includes(buffer);
	if (complete) finish();
	else timer = setTimeout(finish, 650);
}

export function resetEntry() {
	if (timer) clearTimeout(timer);
	timer = null;
	buffer = '';
}
