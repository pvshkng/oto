// Width observation for the notation layout engine.
//
// Re-laying out a whole track (notation/layout.ts) is a synchronous, main-thread
// cost that scales with the number of notes, and it re-runs whenever the score
// area's width changes. A raw ResizeObserver fires on *every* layout frame while
// the window is being dragged, so without coalescing the engine would relayout
// dozens of times a second mid-drag — the resize freeze.
//
// observeWidth collapses that to a single relayout after the drag settles:
//   • the first measurement (initial mount / breakpoint remount) is applied
//     immediately, so the correct layout paints with no debounce lag;
//   • subsequent live-resize changes are debounced (trailing edge), so the heavy
//     relayout runs once the width stops changing;
//   • widths are quantized to whole pixels, so sub-pixel jitter that maps to an
//     identical layout is dropped instead of triggering a redundant relayout.

export interface ObserveWidthOptions {
	/** Trailing debounce for live resizes, in ms. */
	debounceMs?: number;
	/**
	 * Called with `true` when a live resize starts (a real width change is
	 * pending) and `false` once the resulting layout has rendered and painted.
	 * Lets the host show a spinner over the score while the (synchronous)
	 * relayout runs. Never fired for the initial measurement.
	 */
	onBusy?: (busy: boolean) => void;
}

/**
 * Observe an element's content-box width and report meaningful changes.
 * Returns a disposer; call from within a Svelte `$effect` and return it.
 */
export function observeWidth(
	el: Element,
	onWidth: (width: number) => void,
	{ debounceMs = 120, onBusy }: ObserveWidthOptions = {}
): () => void {
	let last = NaN;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let raf1 = 0;
	let raf2 = 0;
	let busy = false;

	// Idempotent so repeated resize ticks don't fire onBusy(true) over and over,
	// and so the push/pop stays balanced no matter how the episode unfolds.
	function setBusy(v: boolean) {
		if (v === busy) return;
		busy = v;
		onBusy?.(v);
	}

	const ro = new ResizeObserver((entries) => {
		const w = Math.round(entries[entries.length - 1].contentRect.width);
		if (w === last) return; // identical layout — nothing to relayout
		if (Number.isNaN(last)) {
			// First measurement: apply now so there's no debounce delay before the
			// initial (or post-remount) layout is correct. No busy signal.
			last = w;
			onWidth(w);
			return;
		}
		setBusy(true); // mark busy up front so the spinner can paint during the wait
		clearTimeout(timer);
		timer = setTimeout(() => {
			// Defer the heavy relayout one frame so the spinner is guaranteed on
			// screen (and spinning on the compositor) before we block the main
			// thread; clear busy a frame after, once the new layout has painted.
			cancelAnimationFrame(raf1);
			cancelAnimationFrame(raf2);
			raf1 = requestAnimationFrame(() => {
				last = w;
				onWidth(w); // triggers the heavy, synchronous relayout
				raf2 = requestAnimationFrame(() => setBusy(false));
			});
		}, debounceMs);
	});
	ro.observe(el);

	return () => {
		clearTimeout(timer);
		cancelAnimationFrame(raf1);
		cancelAnimationFrame(raf2);
		ro.disconnect();
		setBusy(false);
	};
}
