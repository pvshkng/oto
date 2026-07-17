// Window-level pointer drag: the pattern behind every "grab and drag" gesture
// that must keep tracking after the pointer leaves the node it started on
// (column resizes, row reorders, audio-clip nudges, panel drags). Attaches
// move/up/cancel listeners to `window` and detaches all three when the pointer
// is released, handing the release event to `onEnd`.
//
// Returns an end function for gestures that cancel themselves mid-move (e.g.
// a touch drag that turns out to be a scroll): calling it detaches the
// listeners and runs `onEnd` immediately.
export function windowPointerDrag(
	onMove: (e: PointerEvent) => void,
	onEnd?: (e?: PointerEvent) => void
): (e?: PointerEvent) => void {
	const end = (e?: PointerEvent) => {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', end);
		window.removeEventListener('pointercancel', end);
		onEnd?.(e);
	};
	window.addEventListener('pointermove', onMove);
	window.addEventListener('pointerup', end);
	window.addEventListener('pointercancel', end);
	return end;
}
