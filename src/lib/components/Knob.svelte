<script lang="ts">
	// A compact rotary knob. Drag vertically (or use arrow keys) to change the
	// value; double-click resets to the centre/default. Pointer capture + a
	// `touch-action: none` surface keep a drag from scrolling the parent, so it
	// stays usable inside the horizontally-scrollable mixer on touch devices.

	import { cn } from '$lib/utils';

	let {
		value = 0,
		min = -1,
		max = 1,
		default: def = 0,
		size = 28,
		label = 'Knob',
		onInput
	}: {
		value?: number;
		min?: number;
		max?: number;
		default?: number;
		size?: number;
		label?: string;
		onInput: (v: number) => void;
	} = $props();

	let dragging = $state(false);
	let startY = 0;
	let startVal = 0;

	// Map value → rotation. Full travel spans 270° (−135° … +135°).
	const angle = $derived(((value - min) / (max - min)) * 270 - 135);

	function clamp(v: number) {
		return Math.max(min, Math.min(max, v));
	}

	function onPointerDown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
		startY = e.clientY;
		startVal = value;
		e.preventDefault();
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		// 160px of vertical travel covers the whole range; up = increase.
		const delta = ((startY - e.clientY) / 160) * (max - min);
		onInput(clamp(startVal + delta));
	}
	function onPointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}
	function onKeyDown(e: KeyboardEvent) {
		const step = (max - min) / 20;
		if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
			onInput(clamp(value + step));
			e.preventDefault();
		} else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
			onInput(clamp(value - step));
			e.preventDefault();
		}
	}
</script>

<div
	role="slider"
	tabindex="0"
	aria-label={label}
	aria-valuemin={min}
	aria-valuemax={max}
	aria-valuenow={value}
	title={`${label} — drag to adjust, double-click to centre`}
	class={cn(
		'relative shrink-0 cursor-ns-resize touch-none rounded-full border bg-muted',
		'outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring',
		dragging && 'ring-2 ring-ring'
	)}
	style="width:{size}px;height:{size}px"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	ondblclick={() => onInput(def)}
	onkeydown={onKeyDown}
>
	<!-- Pointer/indicator line -->
	<span
		class="bg-foreground absolute top-1/2 left-1/2 w-[1.5px] origin-bottom rounded-full"
		style="height:{size *
			0.42}px;transform:translate(-50%,-100%) rotate({angle}deg);transform-origin:50% 100%"
	></span>
</div>
