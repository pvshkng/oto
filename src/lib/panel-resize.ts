// Pointer-driven column-width resize, generalized from +page.svelte's
// startLeftResize/startRightResize (mirrored in TracksPanel's own
// startColumnResize, which stays separate since it's genuinely desktop-only
// with no matching mobile counterpart to share this with). Returns a fresh
// pointerdown handler; each call creates its own onMove/onUp closures so
// concurrent/rapid drags never remove the wrong listener.
export function createColumnResize(opts: {
	getWidth: () => number;
	setWidth: (w: number) => void;
	min: number;
	max: number;
	/** 1: dragging right grows the panel (left panel). -1: dragging right shrinks it (right panel). */
	direction: 1 | -1;
}) {
	return function onPointerDown(e: PointerEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startW = opts.getWidth();
		function onMove(ev: PointerEvent) {
			const delta = opts.direction * (ev.clientX - startX);
			opts.setWidth(Math.max(opts.min, Math.min(opts.max, startW + delta)));
		}
		function onUp() {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		}
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	};
}
