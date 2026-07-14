// Bravura webfont readiness for canvas rendering. Unlike SVG (where the
// browser re-renders text when a font finishes loading), a canvas draw made
// before the font is ready rasterizes the fallback serif and stays that way —
// so the first notation draw must wait for the flag below and effects must
// read it to re-draw once it flips.

let ready = $state(false);

if (typeof document !== 'undefined' && 'fonts' in document) {
	// The renderer's Bravura sizes all resolve from the same face; loading one
	// size is enough to pull the woff2 in.
	document.fonts
		.load('26px Bravura')
		.catch(() => {})
		.finally(() => {
			ready = true;
		});
} else {
	ready = true;
}

export const bravuraFont = {
	get ready(): boolean {
		return ready;
	}
};
