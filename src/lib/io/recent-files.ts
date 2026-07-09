const RECENT_KEY = 'oto.recent';
const MAX_RECENT = 8;
const MAX_CONTENT_CHARS = 1_500_000;

export interface RecentFile {
	name: string;
	openedAt: number;
	content: string;
}

export function getRecentFiles(): RecentFile[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(RECENT_KEY);
		if (!raw) return [];
		const list = JSON.parse(raw);
		if (!Array.isArray(list)) return [];
		return list.filter(
			(f) =>
				f &&
				typeof f.name === 'string' &&
				typeof f.openedAt === 'number' &&
				typeof f.content === 'string'
		);
	} catch {
		return [];
	}
}

export function addRecentFile(name: string, content: string) {
	if (typeof localStorage === 'undefined') return;
	if (content.length > MAX_CONTENT_CHARS) return;
	const list = getRecentFiles().filter((f) => f.name !== name);
	list.unshift({ name, openedAt: Date.now(), content });
	while (list.length > MAX_RECENT) list.pop();
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(list));
	} catch {
		return;
	}
}

export function removeRecentFile(name: string) {
	if (typeof localStorage === 'undefined') return;
	const list = getRecentFiles().filter((f) => f.name !== name);
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(list));
	} catch {
		return;
	}
}
