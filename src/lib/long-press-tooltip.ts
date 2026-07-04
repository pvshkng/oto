// Long-press tooltips for touch input. Desktop users hover to read a button's
// `title`; touch has no hover, so this shows the same text in a small floating
// bubble after the finger rests on a button for a moment. Works for every
// button in the app that carries a `title` (or `aria-label` fallback) — no
// per-button opt-in. The press that triggered a tooltip does NOT activate the
// button on release: a long press means "what is this?", not "do it".

const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;
const TARGET_SELECTOR =
	'button[title], button[aria-label], [role="button"][title], [role="button"][aria-label]';

export function initLongPressTooltips(): () => void {
	let tip: HTMLDivElement | null = null;
	let timer = 0;
	let target: HTMLElement | null = null;
	let startX = 0;
	let startY = 0;
	let shown = false;
	// Release after a shown tooltip must not click the button through.
	let suppressClickUntil = 0;

	function ensureTip(): HTMLDivElement {
		if (tip) return tip;
		tip = document.createElement('div');
		// Inline-styled (theme CSS vars) since this element never appears in
		// markup Tailwind can scan.
		Object.assign(tip.style, {
			position: 'fixed',
			zIndex: '9999',
			maxWidth: 'min(260px, calc(100vw - 16px))',
			padding: '6px 10px',
			borderRadius: '6px',
			border: '1px solid var(--border)',
			background: 'var(--popover)',
			color: 'var(--popover-foreground)',
			font: '500 12px/1.35 var(--font-sans, system-ui, sans-serif)',
			boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
			pointerEvents: 'none',
			opacity: '0',
			transition: 'opacity 120ms ease'
		} satisfies Partial<CSSStyleDeclaration>);
		document.body.appendChild(tip);
		return tip;
	}

	function show(el: HTMLElement, text: string) {
		const t = ensureTip();
		t.textContent = text;
		t.style.opacity = '0';
		// Measure after setting text, then place above the button (below if
		// there's no room), clamped inside the viewport.
		const rect = el.getBoundingClientRect();
		const w = t.offsetWidth;
		const h = t.offsetHeight;
		const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), innerWidth - w - 8);
		let top = rect.top - h - 10;
		if (top < 8) top = Math.min(rect.bottom + 10, innerHeight - h - 8);
		t.style.left = `${left}px`;
		t.style.top = `${top}px`;
		t.style.opacity = '1';
		shown = true;
	}

	function hide() {
		if (tip) tip.style.opacity = '0';
		shown = false;
	}

	function reset() {
		clearTimeout(timer);
		timer = 0;
		target = null;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
		const el = (e.target as Element | null)?.closest?.(TARGET_SELECTOR) as HTMLElement | null;
		const text = el?.getAttribute('title') || el?.getAttribute('aria-label');
		if (!el || !text) return;
		target = el;
		startX = e.clientX;
		startY = e.clientY;
		clearTimeout(timer);
		timer = window.setTimeout(() => show(el, text), HOLD_MS);
	}

	function onPointerMove(e: PointerEvent) {
		if (!target) return;
		if (
			Math.abs(e.clientX - startX) > MOVE_TOLERANCE_PX ||
			Math.abs(e.clientY - startY) > MOVE_TOLERANCE_PX
		) {
			// Finger is dragging/scrolling, not resting — call the press off.
			reset();
			hide();
		}
	}

	function onPointerEnd() {
		if (!target) return;
		if (shown) {
			suppressClickUntil = Date.now() + 600;
			hide();
		}
		reset();
	}

	// Android fires a native contextmenu on long-press; swallow it while a
	// tooltip press is in flight so the two don't fight.
	function onContextMenu(e: Event) {
		if (target) e.preventDefault();
	}

	// Capture-phase so the button never sees the click that ends a tooltip press.
	function onClickCapture(e: MouseEvent) {
		if (Date.now() < suppressClickUntil) {
			suppressClickUntil = 0;
			e.preventDefault();
			e.stopPropagation();
		}
	}

	function onScroll() {
		if (target) {
			reset();
			hide();
		}
	}

	document.addEventListener('pointerdown', onPointerDown, true);
	document.addEventListener('pointermove', onPointerMove, true);
	document.addEventListener('pointerup', onPointerEnd, true);
	document.addEventListener('pointercancel', onPointerEnd, true);
	document.addEventListener('contextmenu', onContextMenu, true);
	document.addEventListener('click', onClickCapture, true);
	document.addEventListener('scroll', onScroll, true);

	return () => {
		document.removeEventListener('pointerdown', onPointerDown, true);
		document.removeEventListener('pointermove', onPointerMove, true);
		document.removeEventListener('pointerup', onPointerEnd, true);
		document.removeEventListener('pointercancel', onPointerEnd, true);
		document.removeEventListener('contextmenu', onContextMenu, true);
		document.removeEventListener('click', onClickCapture, true);
		document.removeEventListener('scroll', onScroll, true);
		clearTimeout(timer);
		tip?.remove();
		tip = null;
	};
}
