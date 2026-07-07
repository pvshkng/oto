// Local cache for the audio backing track's bytes, so a page reload (or
// revisiting later) doesn't force the user to re-import the same file.
//
// The bytes still never live inside the .oto document — this is a per-browser
// convenience cache in IndexedDB (localStorage can't hold multi-MB blobs).
// One slot only, mirroring the one-audio-track rule: importing a new file
// overwrites the previous one. On load, the controller restores the cached
// file only when its name matches the open document's saved audio config;
// otherwise the "re-add the file" prompt shows as before.
//
// Everything here is best-effort: private browsing modes and storage pressure
// can deny IndexedDB, so every operation swallows failures and the app simply
// falls back to manual re-import.

const DB_NAME = 'oto-audio';
const DB_VERSION = 1;
const STORE = 'files';
const KEY = 'backing-track';

/** Stored shape: the pieces needed to reconstruct a File. The blob is stored
 *  separately from its metadata (rather than the File object itself) because
 *  File cloning into IndexedDB has had bugs in older Safari builds. */
interface CachedAudioRecord {
	name: string;
	type: string;
	blob: Blob;
}

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

/** Run one operation in its own short-lived transaction, then close the DB. */
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

/** Cache the imported audio file (overwrites any previous one). Best-effort. */
export async function cacheAudioFile(file: File): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	try {
		const record: CachedAudioRecord = { name: file.name, type: file.type, blob: file };
		await withStore('readwrite', (s) => s.put(record, KEY));
	} catch {
		/* quota / private mode — manual re-import still works */
	}
}

/** The cached audio file, or null when absent/unreadable. */
export async function loadCachedAudioFile(): Promise<File | null> {
	if (typeof indexedDB === 'undefined') return null;
	try {
		const rec = (await withStore('readonly', (s) => s.get(KEY))) as CachedAudioRecord | undefined;
		if (!rec || typeof rec.name !== 'string' || !(rec.blob instanceof Blob)) return null;
		return new File([rec.blob], rec.name, { type: rec.type || rec.blob.type });
	} catch {
		return null;
	}
}

/** Drop the cached file (audio track removed). Best-effort. */
export async function clearCachedAudioFile(): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	try {
		await withStore('readwrite', (s) => s.delete(KEY));
	} catch {
		/* ignore */
	}
}
