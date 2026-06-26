// Save/load .oto files and export the rendered score to PDF (via print).

import { store } from '$lib/stores/score.svelte';
import { importGuitarProBytes, isGuitarProFile } from './guitarpro';

export function downloadOto() {
	const json = store.toJSON();
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	const safe = store.score.title.replace(/[^\w-]+/g, '_').slice(0, 40) || 'score';
	a.href = url;
	a.download = `${safe}.oto`;
	a.click();
	URL.revokeObjectURL(url);
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
