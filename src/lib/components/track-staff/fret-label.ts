// Tab fret-label text + its ink width, shared by the tab voice (which draws the
// label and its string-line mask) and the highlight overlay (which sizes the
// note-selection box to the same label). Kept in one place so the two never
// drift: natural harmonics read as `<12>` inline, ghost/tied notes wrap in
// parens, and a dead note is an `x`.

export interface FretLabelNote {
	fret: number;
	tied?: unknown;
	techniques: string[];
}

export function fretText(n: FretLabelNote): string {
	if (n.techniques.includes('dead')) return 'x';
	const base = n.techniques.includes('harmonic') ? `<${n.fret}>` : String(n.fret);
	return n.techniques.includes('ghost') || n.tied ? `(${base})` : base;
}

/** Ink width (px) of a fret label — mirrors TabVoice's mask sizing. */
export function fretLabelWidth(n: FretLabelNote): number {
	return fretText(n).length * 6.5 + 3;
}
