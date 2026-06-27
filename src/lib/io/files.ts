// Save/load .oto files and export the rendered score to PDF (via print).

import { store } from '$lib/stores/score.svelte';
import { importGuitarProBytes, isGuitarProFile } from './guitarpro';

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
				if (isGuitarProFile(file.name)) {
					const buf = new Uint8Array(await file.arrayBuffer());
					const score = await importGuitarProBytes(buf);
					store.loadScore(JSON.stringify(score));
				} else {
					store.loadScore(await file.text());
				}
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
 */
export function exportPdf() {
	window.print();
}
