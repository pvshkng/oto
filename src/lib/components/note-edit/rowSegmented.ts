// Detects visual row boundaries in a wrapping flex row (ResizeObserver-
// driven, since which items start a new row depends on layout, not DOM
// order) and toggles border/radius classes on the first/last item of each
// row so a segmented control still looks contiguous when it wraps. No-op
// when `enabled` is false, so hosts whose row never wraps can rely on plain
// first:/last: CSS variants instead.
const FIRST_CLASSES = ['border-l', 'rounded-l-legacy-xs'];
const LAST_CLASSES = ['rounded-r-legacy-xs'];

export function rowSegmented(node: HTMLElement, enabled: boolean = true) {
	if (!enabled) return {};

	function update() {
		const items = [...node.children] as HTMLElement[];
		items.forEach((el) => el.classList.remove(...FIRST_CLASSES, ...LAST_CLASSES));
		let prevTop = -1;
		for (let i = 0; i < items.length; i++) {
			const top = items[i].offsetTop;
			if (top !== prevTop) {
				if (prevTop !== -1) items[i - 1].classList.add(...LAST_CLASSES);
				items[i].classList.add(...FIRST_CLASSES);
				prevTop = top;
			}
		}
		if (items.length > 0) items[items.length - 1].classList.add(...LAST_CLASSES);
	}
	const ro = new ResizeObserver(update);
	ro.observe(node);
	update();
	return {
		destroy() {
			ro.disconnect();
		}
	};
}
