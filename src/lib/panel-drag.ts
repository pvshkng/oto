import { store, type PanelId } from '$lib/stores/score.svelte';
import { windowPointerDrag } from '$lib/pointer-drag';

// Every floating panel is anchored to the top-left corner (top-4 / left-4) and
// offset from there by `panelLayout[id].{x,y}`, so a single translate drives
// them all and the tear-off maths below stays uniform.
const ANCHOR = 16;
const DRAG_THRESHOLD = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export interface PanelDragParams {
	id: PanelId;
	/** Whether the panel is currently floating (vs docked). Drives whether a
	 *  drag repositions the window or tears it out of its dock first. */
	floating: boolean;
}

// The drag runs on window listeners, deliberately decoupled from the panel node:
// tearing a panel out of a dock relocates it in the layout (a remount), which
// would destroy a node-bound drag mid-gesture. Owning the loop globally lets the
// drag continue seamlessly across that remount.
function runDrag(node: HTMLElement, id: PanelId, floating: boolean, start: PointerEvent) {
	let started = false;
	let sx = start.clientX;
	let sy = start.clientY;
	let bx = store.panelLayout[id].x;
	let by = store.panelLayout[id].y;
	const width = node.offsetWidth; // capture now — the node may be replaced on tear-off
	let isFloating = floating;

	function onMove(e: PointerEvent) {
		if (!started) {
			if (Math.abs(e.clientX - sx) < DRAG_THRESHOLD && Math.abs(e.clientY - sy) < DRAG_THRESHOLD)
				return;
			started = true;
			store.beginPanelDrag(id);
			if (!isFloating) {
				// Tear-off: freeze the panel where it sits on screen, then float it
				// there so it lifts out of its dock without jumping.
				const r = node.getBoundingClientRect();
				bx = r.left - ANCHOR;
				by = r.top - ANCHOR;
				store.setPanelDock(id, 'float');
				store.panelLayout[id].x = bx;
				store.panelLayout[id].y = by;
				sx = e.clientX;
				sy = e.clientY;
				isFloating = true;
			}
		}
		let x = bx + (e.clientX - sx);
		let y = by + (e.clientY - sy);
		// Keep a grabbable strip on-screen no matter how far it's flung.
		const left = clamp(ANCHOR + x, -(width - 120), window.innerWidth - 120);
		const top = clamp(ANCHOR + y, 0, window.innerHeight - 52);
		x = left - ANCHOR;
		y = top - ANCHOR;
		store.panelLayout[id].x = x;
		store.panelLayout[id].y = y;
		store.updatePanelDrag(id, e.clientX, e.clientY);
	}
	windowPointerDrag(onMove, () => {
		if (started) store.endPanelDrag(id, store.panelLayout[id].x, store.panelLayout[id].y);
	});
}

/**
 * Unified pointer-drag for the dockable panels — used for BOTH floating and
 * docked panels, so the header grip works the same everywhere:
 *
 *  - Floating: drags the window, arming an edge's drop zone as it nears one.
 *  - Docked: the first movement tears the panel out of its dock into a floating
 *    window pinned under the cursor (no jump), then it drags like any other.
 *
 * The drag reads/writes `panelLayout[id].{x,y}` directly (applied by the panel
 * as an inline `translate`), so there's no dependency on a drag library's
 * internal transform state.
 */
export function panelDrag(node: HTMLElement, params: PanelDragParams) {
	let p = params;
	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const target = e.target as HTMLElement;
		// Any left-press on the panel raises it above its peers…
		store.bringToFront(p.id);
		// …but a drag only starts from the header (grip + title), never from its
		// buttons (dock controls / close), which opt out via data-panel-cancel.
		if (target.closest?.('[data-panel-cancel]')) return;
		if (!target.closest?.('[data-panel-handle]')) return;
		e.preventDefault();
		runDrag(node, p.id, p.floating, e);
	}
	node.addEventListener('pointerdown', onPointerDown);
	return {
		update(np: PanelDragParams) {
			p = np;
		},
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
		}
	};
}
