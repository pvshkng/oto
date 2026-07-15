// Soundfont sourcing for the playback engine.
//
// The MuseScore General banks are too large to serve from the GitHub Pages
// build, so they are fetched from GitHub directly (raw file for the SF3,
// release asset for the SF2, which exceeds the 100 MB repo file limit) and
// cached in IndexedDB so later visits load locally. Dev serves the SF3 from
// the repo's soundfont/ dir (see vite.config.ts).

import { loading } from '$lib/stores/loading.svelte';

export type SoundFontQuality = 'standard' | 'high';

export interface SoundFontSource {
	label: string;
	/** Approximate download size shown in the settings UI. */
	sizeMB: number;
	url: string;
}

const GITHUB_RAW = 'https://raw.githubusercontent.com/pvshkng/oto/main/soundfont';
const GITHUB_RELEASE = 'https://github.com/pvshkng/oto/releases/download/soundfont';

export const SOUNDFONTS: Record<SoundFontQuality, SoundFontSource> = {
	standard: {
		label: 'MuseScore General (SF3)',
		sizeMB: 38,
		url: import.meta.env.DEV
			? '/soundfont/MuseScore_General.sf3'
			: `${GITHUB_RAW}/MuseScore_General.sf3`
	},
	high: {
		label: 'MuseScore General (SF2)',
		sizeMB: 208,
		url: `${GITHUB_RELEASE}/MuseScore_General.sf2`
	}
};

// One-slot-per-quality IndexedDB cache, same best-effort pattern as
// audio-cache.ts: private browsing or quota pressure just means a re-download.
const DB_NAME = 'oto-soundfont';
const DB_VERSION = 1;
const STORE = 'files';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) {
				req.result.createObjectStore(STORE);
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	op: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openDb();
	try {
		return await new Promise<T>((resolve, reject) => {
			const req = op(db.transaction(STORE, mode).objectStore(STORE));
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	} finally {
		db.close();
	}
}

async function cachedBytes(quality: SoundFontQuality): Promise<Uint8Array | null> {
	if (typeof indexedDB === 'undefined') return null;
	try {
		const blob = (await withStore('readonly', (s) => s.get(quality))) as Blob | undefined;
		if (!(blob instanceof Blob)) return null;
		return new Uint8Array(await blob.arrayBuffer());
	} catch {
		return null;
	}
}

async function cacheBytes(quality: SoundFontQuality, bytes: Uint8Array): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	try {
		await withStore('readwrite', (s) =>
			s.put(new Blob([bytes as Uint8Array<ArrayBuffer>]), quality)
		);
	} catch {
		/* quota / private mode */
	}
}

/** Whether a quality is already stored locally (settings UI hint). */
export async function isSoundFontCached(quality: SoundFontQuality): Promise<boolean> {
	if (typeof indexedDB === 'undefined') return false;
	try {
		const key = await withStore('readonly', (s) => s.getKey(quality));
		return key !== undefined;
	} catch {
		return false;
	}
}

/** Soundfont bytes for a quality: local cache first, network otherwise. */
export async function loadSoundFontBytes(quality: SoundFontQuality): Promise<Uint8Array> {
	const cached = await cachedBytes(quality);
	if (cached) return cached;
	const bytes = await download(SOUNDFONTS[quality].url);
	await cacheBytes(quality, bytes);
	return bytes;
}

const MB = 1024 * 1024;
const fmtMB = (n: number) => (n / MB).toFixed(1);

/** Download with the loading overlay showing byte progress. The batch opens
 *  before the request so the overlay covers the whole download; the caller's
 *  loading.finish() closes it on failure. */
async function download(url: string): Promise<Uint8Array> {
	const STEPS = 20;
	loading.begin(STEPS, 'Downloading sounds');
	let ticked = 0;
	const tickTo = (n: number) => {
		while (ticked < n) {
			loading.tick();
			ticked++;
		}
	};
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`soundfont fetch failed: ${res.status}`);
		const total = Number(res.headers.get('content-length')) || 0;
		if (!res.body || !total) {
			const bytes = new Uint8Array(await res.arrayBuffer());
			tickTo(STEPS);
			return bytes;
		}
		const reader = res.body.getReader();
		const chunks: Uint8Array[] = [];
		let received = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			received += value.length;
			loading.detail = `${fmtMB(received)} of ${fmtMB(total)} MB`;
			tickTo(Math.min(STEPS, Math.floor((received / total) * STEPS)));
		}
		tickTo(STEPS);
		const out = new Uint8Array(received);
		let offset = 0;
		for (const c of chunks) {
			out.set(c, offset);
			offset += c.length;
		}
		return out;
	} finally {
		loading.detail = '';
	}
}
