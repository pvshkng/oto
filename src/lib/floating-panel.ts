import type { DragOptions } from '@neodrag/svelte';

// Bounds for a popped-out side panel: `{ top, right, bottom, left }` all 0 pins
// the draggable to the window edges, so it can never be dragged fully off-screen
// (and can therefore always be dragged back into view).
const WINDOW_BOUNDS = { top: 0, right: 0, bottom: 0, left: 0 };

/** neodrag options shared by the pop-out side panels. The header is the drag
 *  handle; its buttons opt out via `data-panel-cancel`. */
export function panelDragOptions(popped: boolean): DragOptions {
	return {
		bounds: WINDOW_BOUNDS,
		handle: '[data-panel-handle]',
		cancel: '[data-panel-cancel]',
		disabled: !popped
	};
}
