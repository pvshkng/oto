// Global keyboard shortcut dispatch for the main editor. Extracted from
// +page.svelte's onMount wiring — self-contained (only reads store/imports),
// so it can be attached to window's keydown listener as-is.
import { store } from '$lib/stores/score.svelte';
import { togglePlayback } from '$lib/audio/playback';
import { enterDigit, resetEntry } from '$lib/editing/entry';

export function handleGlobalKeydown(e: KeyboardEvent) {
	const target = e.target as HTMLElement;
	if (
		target &&
		(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
	) {
		return;
	}

	if (e.code === 'Space') {
		e.preventDefault();
		togglePlayback();
		return;
	}
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
		e.preventDefault();
		if (e.shiftKey) store.redo();
		else store.undo();
		return;
	}
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
		e.preventDefault();
		store.redo();
		return;
	}
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
		e.preventDefault();
		import('$lib/io/files').then((m) => m.downloadOto());
		return;
	}
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
		e.preventDefault();
		store.cutSelection();
		return;
	}
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
		e.preventDefault();
		store.copySelection();
		return;
	}
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
		e.preventDefault();
		store.pasteClipboard();
		return;
	}
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
		e.preventDefault();
		if (e.shiftKey) store.duplicateMeasureAt(store.cursor.measure);
		else store.clearSelection();
		return;
	}
	if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
		e.preventDefault();
		if (e.shiftKey) store.insertMeasureAt(store.cursor.measure);
		else store.insertMeasureAt(store.cursor.measure + 1);
		return;
	}
	if (store.isPlaying) return;

	if (/^[0-9]$/.test(e.key)) {
		e.preventDefault();
		enterDigit(e.key);
		return;
	}
	resetEntry();

	switch (e.key) {
		case 'ArrowLeft':
			e.preventDefault();
			if (e.shiftKey) store.extendSelection('left');
			else store.moveCursor('left');
			break;
		case 'ArrowRight':
			e.preventDefault();
			if (e.shiftKey) store.extendSelection('right');
			else store.moveCursor('right');
			break;
		case 'ArrowUp':
			e.preventDefault();
			store.moveCursor('up');
			break;
		case 'ArrowDown':
			e.preventDefault();
			store.moveCursor('down');
			break;
		case 'Backspace':
		case 'Delete':
			e.preventDefault();
			if (store.selection) store.deleteNotesInSelection();
			else store.deleteNoteAtCursor();
			break;
		case 'Enter':
			e.preventDefault();
			if (e.shiftKey) store.insertBeatBefore();
			else store.insertBeat();
			break;
		case '[':
			store.beginMarkStart();
			break;
		case ']':
			store.completeMarkEnd();
			break;
		case '-':
			store.deleteBeat();
			break;
		case 'w':
			store.setBeatDuration(1, false);
			store.activeDuration = 1;
			break;
		case 'h':
			store.setBeatDuration(2, false);
			store.activeDuration = 2;
			break;
		case 'q':
			store.setBeatDuration(4, false);
			store.activeDuration = 4;
			break;
		case 'e':
			store.setBeatDuration(8, false);
			store.activeDuration = 8;
			break;
		case 's':
			store.setBeatDuration(16, false);
			store.activeDuration = 16;
			break;
		case '.':
			store.activeDotted = !store.activeDotted;
			store.setBeatDuration(store.activeDuration, store.activeDotted);
			break;
		case 'x':
			store.toggleTechnique('dead');
			break;
	}
}
