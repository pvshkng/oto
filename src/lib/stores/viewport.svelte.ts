// Reactive geometry of the score-area scroll container.
//
// The continuous notation view virtualizes its systems — only those near the
// viewport are built as real SVG, the rest are cheap fixed-height placeholders —
// so the DOM stays small no matter how long the piece is. To decide what's near
// the viewport, the views need the scroll container's current scroll offset and
// visible box; +page owns that element and publishes it here, and the views read
// it. Exactly one score area is mounted at a time (desktop OR mobile layout), so
// a single module singleton is enough.

class ScoreViewport {
	/** Scroll offset of the score-area container. */
	scrollTop = $state(0);
	/** Visible height (clientHeight) of the container. 0 until the first sync —
	 *  consumers treat 0 as "not measured yet" and fall back to the window. */
	height = $state(0);
	/** Client-y of the container's top edge (getBoundingClientRect().top). */
	top = $state(0);
	/** Bumped on every sync, so a consumer's visibility effect re-runs even when
	 *  the numeric fields land on the same values (it still needs to re-measure
	 *  its own element against a possibly-shifted layout). */
	version = $state(0);
	/** True while the browser is capturing the page for print/PDF. Virtualization
	 *  is suspended then (every system is rendered) so offscreen music isn't
	 *  dropped from the printout. Toggled from `beforeprint`/`afterprint` with a
	 *  synchronous flush, so the full DOM exists before the snapshot. */
	printing = $state(false);

	sync(scrollTop: number, top: number, height: number) {
		// No-op when nothing moved, so a stray re-measure never bumps `version`
		// (and re-runs every consumer's visibility effect) for no reason — and so
		// this can't drive a reactive write loop.
		if (scrollTop === this.scrollTop && top === this.top && height === this.height) return;
		this.scrollTop = scrollTop;
		this.top = top;
		this.height = height;
		this.version++;
	}
}

export const scoreViewport = new ScoreViewport();
