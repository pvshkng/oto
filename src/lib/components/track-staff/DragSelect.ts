// Mouse drag-to-select: horizontal drag extends the beat-range loop
// selection, vertical drag (within the tab band) extends the note/string
// selection. Gated on pointerType rather than viewport width so it still
// works when a mouse is used on a narrow (mobile-layout) window. Extracted
// from TrackStaff.svelte as a factory so the pointer state (anchor, mode,
// dragging flag) lives in one place independent of the component's own
// reactive state.

import { SvelteSet } from 'svelte/reactivity';
import { store } from '$lib/stores/score.svelte';
import { METRICS, type TrackLayout } from '$lib/notation/layout';
import type { OtoTrack } from '$lib/oto/types';

interface DragSelectOptions {
	container: () => HTMLDivElement | undefined;
	layout: () => TrackLayout;
	track: () => OtoTrack;
	trackIndex: () => number;
}

export function createDragSelect(opts: DragSelectOptions) {
	let dragAnchor: { measureIndex: number; beat: number } | null = null;
	let dragging = false;
	let suppressNextClick = false;
	let dragStartClient = { x: 0, y: 0 };
	// 'beat' = horizontal drag for beat selection, 'note' = vertical drag for string selection
	let dragMode: 'beat' | 'note' | null = null;
	let dragAnchorString: number | null = null;

	/** Convert a client position to the nearest (measureIndex, beat) in this track. */
	function findBeatAtClient(
		clientX: number,
		clientY: number
	): { measureIndex: number; beat: number } | null {
		const container = opts.container();
		if (!container) return null;
		const layout = opts.layout();
		// Rects are in real px, layout in local px — the paper's CSS zoom
		// (ScoreArea) is the factor between them.
		const zoom = store.scoreZoom;
		const svgEls = container.querySelectorAll<HTMLElement>('.system');
		for (const svgEl of svgEls) {
			const rect = svgEl.getBoundingClientRect();
			if (clientY < rect.top || clientY > rect.bottom) continue;
			const svgX = (clientX - rect.left) / zoom;
			const firstIdx = Number(svgEl.dataset.firstMeasure ?? -1);
			const sys = layout.systems.find((s) => s.measures[0]?.index === firstIdx);
			if (!sys || !sys.measures.length) continue;
			let bestMeasure = sys.measures[0];
			for (const m of sys.measures) {
				if (svgX >= m.x) bestMeasure = m;
			}
			if (!bestMeasure.beats.length) continue;
			let bestBeat = 0,
				bestD = Infinity;
			for (let i = 0; i < bestMeasure.beats.length; i++) {
				const d = Math.abs(bestMeasure.beats[i].x - svgX);
				if (d < bestD) {
					bestD = d;
					bestBeat = i;
				}
			}
			return { measureIndex: bestMeasure.index, beat: bestBeat };
		}
		return null;
	}

	/** Returns which string (0-indexed) the pointer is over in the tab band, or null. */
	function findStringAtClient(clientX: number, clientY: number): number | null {
		const container = opts.container();
		const layout = opts.layout();
		if (!container || !layout.bands.tab) return null;
		const track = opts.track();
		const zoom = store.scoreZoom;
		const svgEls = container.querySelectorAll<HTMLElement>('.system');
		for (const svgEl of svgEls) {
			const rect = svgEl.getBoundingClientRect();
			if (clientY < rect.top || clientY > rect.bottom) continue;
			const tabOffsetY = rect.top + (layout.bands.tab.offsetY + layout.tabTop) * zoom;
			const localY = (clientY - tabOffsetY) / zoom;
			const string = Math.round(localY / METRICS.tabLineGap);
			return Math.max(0, Math.min(track.tuning.length - 1, string));
		}
		return null;
	}

	function onDragPointerDown(e: PointerEvent) {
		if (e.pointerType !== 'mouse' || e.button !== 0) return;
		dragStartClient = { x: e.clientX, y: e.clientY };
		dragAnchor = findBeatAtClient(e.clientX, e.clientY);
		dragAnchorString = findStringAtClient(e.clientX, e.clientY);
		dragging = false;
		dragMode = null;
		// Use document listeners instead of setPointerCapture so click/dblclick
		// still fire on the <g> children (setPointerCapture redirects them to the div).
		document.addEventListener('pointermove', onDragPointerMove);
		document.addEventListener('pointerup', onDragPointerUp);
	}

	function onDragPointerMove(e: PointerEvent) {
		if (!dragAnchor || !(e.buttons & 1)) return;
		const dx = Math.abs(e.clientX - dragStartClient.x);
		const dy = Math.abs(e.clientY - dragStartClient.y);
		const dist = Math.hypot(dx, dy);
		if (dist < 6 && !dragging) return;
		dragging = true;

		// Determine mode on first significant movement
		if (!dragMode) {
			const layout = opts.layout();
			dragMode =
				dy > dx && dragAnchorString !== null && layout.bands.tab !== null ? 'note' : 'beat';
		}

		if (dragMode === 'note' && dragAnchor && dragAnchorString !== null) {
			const curStr = findStringAtClient(e.clientX, e.clientY);
			if (curStr !== null) {
				const lo = Math.min(dragAnchorString, curStr);
				const hi = Math.max(dragAnchorString, curStr);
				const strings = new SvelteSet<number>();
				for (let s = lo; s <= hi; s++) strings.add(s);
				store.setNoteSelection({
					measure: dragAnchor.measureIndex,
					beat: dragAnchor.beat,
					voice: store.cursor.voice,
					strings
				});
				store.setCursor({
					track: opts.trackIndex(),
					measure: dragAnchor.measureIndex,
					beat: dragAnchor.beat
				});
			}
		} else {
			const pos = findBeatAtClient(e.clientX, e.clientY);
			if (!pos) return;
			store.setCursor({
				track: opts.trackIndex(),
				measure: dragAnchor.measureIndex,
				beat: dragAnchor.beat
			});
			store.setSelectionTo(pos.measureIndex, pos.beat);
		}
	}

	function onDragPointerUp(_e: PointerEvent) {
		document.removeEventListener('pointermove', onDragPointerMove);
		document.removeEventListener('pointerup', onDragPointerUp);
		if (dragging) {
			if (dragMode === 'beat') store.loopEnabled = true;
			suppressNextClick = true;
			setTimeout(() => {
				suppressNextClick = false;
			}, 100);
		}
		dragAnchor = null;
		dragAnchorString = null;
		dragMode = null;
		dragging = false;
	}

	return {
		onDragPointerDown,
		isSuppressingClick: () => suppressNextClick
	};
}
