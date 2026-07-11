// Save/load .oto files and export the rendered score to PDF (via print).

import { store } from '$lib/stores/score.svelte';
import { audio } from '$lib/audio/engine';
import { loading } from '$lib/stores/loading.svelte';
import { importGuitarProBytes, isGuitarProFile } from './guitarpro';
import { addRecentFile } from './recent-files';

/** Wait two frames so a just-shown loading overlay actually paints before we
 *  run the heavy synchronous parse/commit that would otherwise block the main
 *  thread — and the screen — before the overlay ever appears. */
function nextPaint(): Promise<void> {
	if (typeof requestAnimationFrame === 'undefined') return Promise.resolve();
	return new Promise((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	);
}

/**
 * Shared open pipeline: show the loading overlay, yield a frame so it paints,
 * fetch/read the file bytes, then parse and commit. Every entry point (recent,
 * example, browse) routes through here so a slow fetch or a heavy parse always
 * shows progress instead of a frozen UI.
 */
export async function openWithLoading(
	name: string,
	produce: () => Promise<string> | string
): Promise<void> {
	loading.start(`Opening ${name}`);
	try {
		await nextPaint();
		const json = await produce();
		// Second yield: the overlay may have only just mounted (recent files
		// resolve `produce` synchronously), so paint it before the blocking parse.
		await nextPaint();
		loadOtoJson(name, json);
	} finally {
		loading.finish();
	}
}

export function downloadOto() {
	const json = store.toJSON();
	// Use a generic binary MIME so the browser never appends a `.json` extension
	// based on content sniffing — the file is saved exactly as `<title>.oto`.
	const blob = new Blob([json], { type: 'application/octet-stream' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	const safe = store.score.title.replace(/[^\w-]+/g, '_').slice(0, 40) || 'score';
	a.href = url;
	a.download = `${safe}.oto`;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function loadOtoJson(name: string, json: string) {
	store.loadScore(json);
	// Warm up the audio engine behind the loading screen so playback is
	// ready the moment the import lands (the user interaction that triggered
	// the load counts as the user gesture the AudioContext needs).
	audio.warmup();
	addRecentFile(name, json);
}

/** Open a file picker accepting both .oto and Guitar Pro files. */
export function openFile(): Promise<void> {
	return new Promise((resolve, reject) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.oto,application/json,.gp,.gpx,.gp3,.gp4,.gp5,.gp7,.gpif';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return resolve();
			try {
				await openWithLoading(file.name, async () => {
					if (isGuitarProFile(file.name)) {
						const buf = new Uint8Array(await file.arrayBuffer());
						return JSON.stringify(await importGuitarProBytes(buf));
					}
					return file.text();
				});
				resolve();
			} catch (e) {
				reject(e);
			}
		};
		input.click();
	});
}

/** Backwards-compatible alias. */
export const openOtoFile = openFile;

/**
 * Export to PDF. We rely on the browser's print-to-PDF on a print-styled view:
 * a dedicated stylesheet (in app) hides the chrome and lays the score out on
 * paper. This keeps the vector SVG crisp in the resulting PDF.
 *
 * The score must be printed in page view — the A4 pagination is what puts each
 * page's systems on its own sheet (a continuous sheet would be clipped to a
 * single page by the app shell).
 *
 * Desktop can flip to page view transparently for the print dialog and flip
 * back afterward. Mobile can't: window.print() there is non-blocking, so the
 * finally below would revert page view before the browser snapshots the DOM,
 * printing the continuous (narrow, wrapped) layout. So when a mobile user
 * exports from continuous view we hand off to PdfExportModal, which asks them
 * to switch to page view first and then drives the print once they're in it.
 */
export async function exportPdf() {
	if (!store.isDesktop && !store.pageView) {
		store.pdfExportModalOpen = true;
		return;
	}
	const wasPageView = store.pageView;
	if (!wasPageView) {
		store.pageView = true;
		// Let the paginated layout render and paint before the print dialog
		// snapshots the document.
		await nextPaint();
	}
	try {
		window.print();
	} finally {
		if (!wasPageView) store.pageView = false;
	}
}

/**
 * Print the score as-is, without touching page view. Used by the mobile
 * export prompt once the user has switched to page view themselves — we must
 * not flip page view back afterward (mobile's print is async), so the score
 * stays paginated while the browser captures it.
 */
export function printCurrentView() {
	window.print();
}
