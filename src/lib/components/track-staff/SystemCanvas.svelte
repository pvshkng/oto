<script lang="ts">
	// One notation system rendered as two stacked canvases:
	//  - overlay (bottom): editing highlights — repainted on cursor/selection
	//    changes only, so those never touch the note glyphs. (Playback focus is
	//    the PlayheadLine DOM overlay, deliberately not drawn here: beat ticks
	//    must never trigger canvas repaints.)
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

	// A signature of everything drawSystem() actually rasterizes for THIS system:
	// the laid system (all measures/beats/notes/beams/symbols/positions) plus the
	// few track-level fields the frame reads and the canvas/section/font/print
	// state. Every edit rebuilds the whole layout, so `system` is a fresh object
	// each time even when its content is identical — comparing this string lets an
	// unchanged system skip the (expensive) repaint, restoring the SVG renderer's
	// "only the edited bar updates" behaviour. The voice drawers are pure over
	// `beats`, so the system alone captures their output.
	const notationSig = $derived(
		JSON.stringify({
			system,
			bands: layout.bands,
			keySigWidth: layout.keySigWidth,
			keySigGlyphs: layout.keySigGlyphs,
			clef: layout.clef,
			tabTop: layout.tabTop,
			stringCount: layout.stringCount,
			cssWidth,
			cssHeight,
			lastMeasureIndex,
			editingSectionId,
			fontReady: bravuraFont.ready,
			printing: scoreViewport.printing
		})
	);
	let drawnSig = '';

	// Notation layer — repainted only when the signature above changes, so a note
	// edit repaints the one bar it touched instead of every mounted system.
	$effect(() => {
		const sig = notationSig;
		if (!notationCanvas || sig === drawnSig) return;
		const ctx = prepare(notationCanvas);
		if (!ctx) return;
		drawSystem(ctx, { layout, system, lastMeasureIndex, containerWidth, editingSectionId });
		drawnSig = sig;
	});

	// Overlay layer — repainted whenever any highlight input changes.
	$effect(() => {
		if (!overlayCanvas) return;
		const rects = computeHighlights({
			layout,
			system,
			trackIndex,
			cursor: store.cursor,
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
