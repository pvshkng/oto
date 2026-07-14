// Canvas port of HighlightLayer.svelte — the editing/playback overlay drawn on
// its own canvas so cursor/playhead/selection changes never repaint the (heavy)
// notation layer. `computeHighlights` is a pure function of the store snapshot
// the component passes in; `drawHighlights` paints the result. Coordinates,
// fills and priority mirror the SVG original 1:1.

import { METRICS, type LaidBeat, type LaidSystem, type TrackLayout } from '$lib/notation/layout';
import { fretLabelWidth } from '../fret-label';

export type HighlightKind = 'play' | 'cursor' | 'sel' | 'string' | 'note';

export interface HRect {
	x: number;
	y: number;
	w: number;
	h: number;
	kind: HighlightKind;
}

// Per-kind fill + corner radius — byte-for-byte the classes the SVG rects used.
const FILL: Record<HighlightKind, string> = {
	play: 'rgba(24,24,27,0.28)',
	cursor: 'rgba(24,24,27,0.16)',
	sel: 'rgba(24,24,27,0.07)',
	string: 'rgba(24,24,27,0.14)',
	note: 'rgba(24,24,27,0.22)'
};
const RADIUS: Record<HighlightKind, number> = { play: 3, cursor: 3, sel: 3, string: 2, note: 3 };
// The play/cursor/sel/string chrome was `print:hidden`; only `note` printed.
const PRINT_HIDDEN: Record<HighlightKind, boolean> = {
	play: true,
	cursor: true,
	sel: true,
	string: true,
	note: false
};

export interface HighlightInputs {
	layout: TrackLayout;
	system: LaidSystem;
	trackIndex: number;
	cursor: { track: number; voice: number; measure: number; beat: number; string: number };
	playhead: { measure: number; beat: number } | null;
	loopBounds: {
		startMeasure: number;
		startBeat: number;
		endMeasure: number;
		endBeat: number;
	} | null;
	selectionTrack: number | undefined;
	noteSelection: { measure: number; beat: number; voice: number; strings: Set<number> } | null;
}

export function computeHighlights(inp: HighlightInputs): HRect[] {
	const {
		layout,
		system,
		trackIndex,
		cursor,
		playhead,
		loopBounds,
		selectionTrack,
		noteSelection
	} = inp;
	const out: HRect[] = [];
	const std = layout.bands.standard;
	const tab = layout.bands.tab;
	const active = cursor.track === trackIndex;

	const inSel = (mi: number, bi: number): boolean => {
		if (!loopBounds || selectionTrack !== trackIndex) return false;
		const key = mi * 1000 + bi;
		return (
			key >= loopBounds.startMeasure * 1000 + loopBounds.startBeat &&
			key <= loopBounds.endMeasure * 1000 + loopBounds.endBeat
		);
	};

	for (const measure of system.measures) {
		const mi = measure.index;
		const voices: [LaidBeat[], number][] = [[measure.beats, 0]];
		if (measure.voice2) voices.push([measure.voice2, 1]);
		for (const [beats, vIdx] of voices) {
			for (const beat of beats) {
				const bi = beat.index;
				// Priority mirrors the old {#if}/{:else if} chain: play > cursor > sel.
				const isPlay = vIdx === 0 && !!playhead && playhead.measure === mi && playhead.beat === bi;
				const isCursor =
					active && cursor.voice === vIdx && cursor.measure === mi && cursor.beat === bi;
				const kind: HighlightKind | null = isPlay
					? 'play'
					: isCursor
						? 'cursor'
						: vIdx === 0 && inSel(mi, bi)
							? 'sel'
							: null;
				if (kind) {
					if (std) out.push({ x: beat.x - 9, y: std.offsetY + 2, w: 18, h: std.height - 4, kind });
					if (tab) out.push({ x: beat.x - 9, y: tab.offsetY + 6, w: 18, h: tab.height - 12, kind });
				}
				if (isCursor && tab) {
					out.push({
						x: beat.x - 9,
						y: tab.offsetY + layout.tabTop + cursor.string * METRICS.tabLineGap - 6,
						w: 18,
						h: 12,
						kind: 'string'
					});
				}
				if (
					tab &&
					noteSelection &&
					noteSelection.measure === mi &&
					noteSelection.beat === bi &&
					noteSelection.voice === vIdx
				) {
					for (const n of beat.notes) {
						if (!noteSelection.strings.has(n.string)) continue;
						const w = fretLabelWidth(n);
						out.push({
							x: n.x - w / 2 - 1,
							y: tab.offsetY + n.tabY - 5,
							w: w + 2,
							h: 12,
							kind: 'note'
						});
					}
				}
			}
		}
	}
	return out;
}

/** Pending mark-start anchor x within this system, or null. */
export function computeMarkStartX(
	system: LaidSystem,
	pending: boolean,
	pos: { track: number; measure: number; beat: number } | null,
	trackIndex: number
): number | null {
	if (!pending || !pos || pos.track !== trackIndex) return null;
	for (const m of system.measures) {
		if (m.index !== pos.measure) continue;
		for (const b of m.beats) if (b.index === pos.beat) return b.x;
	}
	return null;
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}

export function drawHighlights(
	ctx: CanvasRenderingContext2D,
	rects: HRect[],
	markStartX: number | null,
	systemHeight: number,
	forPrint = false
): void {
	for (const r of rects) {
		if (forPrint && PRINT_HIDDEN[r.kind]) continue;
		ctx.fillStyle = FILL[r.kind];
		roundRect(ctx, r.x, r.y, r.w, r.h, RADIUS[r.kind]);
		ctx.fill();
	}
	if (markStartX != null && !forPrint) {
		ctx.strokeStyle = '#f59e0b';
		ctx.lineWidth = 2;
		ctx.setLineDash([4, 3]);
		ctx.beginPath();
		ctx.moveTo(markStartX - 9, 4);
		ctx.lineTo(markStartX - 9, systemHeight - 4);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.fillStyle = '#f59e0b';
		ctx.font = '900 13px ui-sans-serif, sans-serif';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		ctx.fillText('[', markStartX - 6, 14);
	}
}
