<script lang="ts">
	// One notation system rendered as two stacked canvases:
	//  - overlay (bottom): editing/playback highlights — repainted on cursor/
	//    playhead/selection changes only, so those never touch the note glyphs.
	//  - notation (top, transparent): staff frame + note glyphs. Its white fret
	//    masks and opaque ink sit over the overlay so the translucent highlight
	//    tints read as "behind the notes", exactly as the SVG layered them.
	// The paper background comes from the wrapping .system div (bg-paper), so both
	// canvases stay transparent where nothing is drawn.
	import { store } from '$lib/stores/score.svelte';
	import { scoreViewport } from '$lib/stores/viewport.svelte';
	import type { LaidSystem, TrackLayout } from '$lib/notation/layout';
	import { drawSystem } from './canvas/draw-system';
	import { computeHighlights, computeMarkStartX, drawHighlights } from './canvas/draw-highlights';
	import { bravuraFont } from './canvas/fonts.svelte';

	let {
		layout,
		system,
		trackIndex,
		containerWidth,
		lastMeasureIndex,
		editingSectionId
	}: {
		layout: TrackLayout;
		system: LaidSystem;
		trackIndex: number;
		containerWidth: number;
		lastMeasureIndex: number;
		editingSectionId: string | null;
	} = $props();

	let notationCanvas = $state<HTMLCanvasElement | undefined>();
	let overlayCanvas = $state<HTMLCanvasElement | undefined>();

	// Match the old SVG width (max of content and container) so the row fills the
	// track column; hit-testing is done in this same left-origin coordinate space.
	const cssWidth = $derived(Math.max(system.width, containerWidth));
	const cssHeight = $derived(system.height);

	/** Size a canvas's backing store to the current CSS box × devicePixelRatio,
	 *  reset the transform to draw in CSS px, and clear it. */
	function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
		const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
		const bw = Math.max(1, Math.round(cssWidth * dpr));
		const bh = Math.max(1, Math.round(cssHeight * dpr));
		if (canvas.width !== bw) canvas.width = bw;
		if (canvas.height !== bh) canvas.height = bh;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, cssWidth, cssHeight);
		return ctx;
	}

	// Notation layer — depends only on geometry, font readiness and the section
	// being edited (whose on-canvas label is suppressed while its input shows).
	$effect(() => {
		// Track dependencies explicitly so the intent is clear.
		void bravuraFont.ready;
		void cssWidth;
		void cssHeight;
		void editingSectionId;
		void layout;
		void system;
		void scoreViewport.printing;
		if (!notationCanvas) return;
		const ctx = prepare(notationCanvas);
		if (!ctx) return;
		drawSystem(ctx, { layout, system, lastMeasureIndex, containerWidth, editingSectionId });
	});

	// Overlay layer — repainted whenever any highlight input changes.
	$effect(() => {
		if (!overlayCanvas) return;
		const rects = computeHighlights({
			layout,
			system,
			trackIndex,
			cursor: store.cursor,
			playhead: store.playhead,
			loopBounds: store.loopBounds,
			selectionTrack: store.selection?.track,
			noteSelection: store.noteSelection
		});
		const markStartX = computeMarkStartX(
			system,
			store.markStartPending,
			store.markStartPos,
			trackIndex
		);
		const ctx = prepare(overlayCanvas);
		if (!ctx) return;
		drawHighlights(ctx, rects, markStartX, system.height, scoreViewport.printing);
	});
</script>

<div class="relative block" style="width:{cssWidth}px;height:{cssHeight}px">
	<canvas
		bind:this={overlayCanvas}
		class="absolute top-0 left-0 block [pointer-events:none]"
		style="width:{cssWidth}px;height:{cssHeight}px"
	></canvas>
	<canvas
		bind:this={notationCanvas}
		class="absolute top-0 left-0 block [pointer-events:none]"
		style="width:{cssWidth}px;height:{cssHeight}px"
	></canvas>
</div>
