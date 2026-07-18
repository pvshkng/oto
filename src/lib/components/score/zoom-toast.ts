// Transient zoom-percentage toast, raised by the store's zoom methods so every
// entry point (Ctrl+±/0, Ctrl+wheel, command palette, the toast's own buttons)
// surfaces the same feedback. Keyed by a stable id: repeated zooms update one
// toast in place and refresh its timer instead of stacking.

import { toast } from 'svelte-sonner';
import ZoomToast from './ZoomToast.svelte';

export function showZoomToast() {
	toast(ZoomToast, {
		id: 'score-zoom',
		duration: 3000,
		// A component passed as the message renders inside sonner's shrink-wrapped
		// [data-content]/[data-title] wrappers; stretch them so the component's
		// left-label / right-buttons layout spans the toast at any width.
		classes: { content: 'w-full', title: 'w-full' }
	});
}
