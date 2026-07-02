// Section markers are lettered A–Z purely by their position along the
// timeline, never by a letter baked into stored data. That way the letters
// always run in order and stay correct after sections are added, removed or
// reordered — there is nothing to fall out of sync. `label` on a `Section`
// is just an optional, freely-editable name shown alongside the letter.

import type { Section } from './types';

/** Sections cannot be lettered past Z (26 markers). */
export const MAX_SECTIONS = 26;

export function sortSections(sections: Section[]): Section[] {
	return [...sections].sort((a, b) => a.measure - b.measure);
}

export function sectionLetterAt(index: number): string {
	return String.fromCharCode(65 + (index % MAX_SECTIONS));
}

/** Letter for a given section id, derived from its position among all sections sorted by measure. */
export function sectionLetterById(sections: Section[], id: string): string {
	const sorted = sortSections(sections);
	const idx = sorted.findIndex((s) => s.id === id);
	return idx >= 0 ? sectionLetterAt(idx) : '';
}
