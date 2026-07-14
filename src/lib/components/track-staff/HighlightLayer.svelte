<script lang="ts">
	// One system's editing/playback highlights — cursor beat, playhead beat, loop
	// selection, sub-beat note selection and the pending mark-start flag — drawn
	// as a single reactive layer instead of a per-beat conditional inside every
	// notehead. This is what decouples the (heavy, pure) note rendering in
	// StdVoice/TabVoice from the (frequent) cursor/playback state: moving the
	// cursor or advancing the playhead re-runs only this layer's small `rects`
	// derived, never the thousands of note glyphs, which no longer read the store
	// at all.
	//
	// Coordinates match the old per-band rects exactly, just resolved to absolute
	// system space (band.offsetY + local y) so they can live in one flat layer.
	// Rendered first inside the system <svg> so the translucent tints sit behind
	// the notes, as before.
	import { store } from '$lib/stores/score.svelte';
	import { METRICS, type LaidBeat, type LaidSystem, type TrackLayout } from '$lib/notation/layout';
	import { fretLabelWidth } from './fret-label';

	let {
		layout,
		system,
		trackIndex
	}: {
		layout: TrackLayout;
		system: LaidSystem;
		trackIndex: number;
	} = $props();

	type HighlightKind = 'play' | 'cursor' | 'sel' | 'string' | 'note';
	interface HRect {
		x: number;
		y: number;
		w: number;
		h: number;
		kind: HighlightKind;
	}

	// Per-kind styling — byte-for-byte the classes the old inline rects used, so
	// the appearance is unchanged. Editing/playback chrome is screen-only
	// (print:hidden) so it never lands in the exported PDF; the note-selection box
	// keeps its original always-on styling.
	const CLASS: Record<HighlightKind, string> = {
		play: 'fill-[rgba(24,24,27,0.28)] [rx:3] print:hidden',
		cursor: 'fill-[rgba(24,24,27,0.16)] [rx:3] print:hidden',
		sel: 'fill-[rgba(24,24,27,0.07)] [rx:3] print:hidden',
		string: 'fill-[rgba(24,24,27,0.14)] [rx:2] print:hidden',
		note: 'fill-[rgba(24,24,27,0.22)] [rx:3]'
	};

	const rects = $derived.by(() => {
		const out: HRect[] = [];
		const std = layout.bands.standard;
		const tab = layout.bands.tab;
		const c = store.cursor;
		const active = c.track === trackIndex;
		const play = store.playhead;
		const bounds = store.loopBounds;
		const selTrack = store.selection?.track;
		const noteSel = store.noteSelection;

		const inSel = (mi: number, bi: number): boolean => {
			if (!bounds || selTrack !== trackIndex) return false;
			const key = mi * 1000 + bi;
			return (
				key >= bounds.startMeasure * 1000 + bounds.startBeat &&
				key <= bounds.endMeasure * 1000 + bounds.endBeat
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
					const isPlay = vIdx === 0 && !!play && play.measure === mi && play.beat === bi;
					const isCursor = active && c.voice === vIdx && c.measure === mi && c.beat === bi;
					const kind: HighlightKind | null = isPlay
						? 'play'
						: isCursor
							? 'cursor'
							: vIdx === 0 && inSel(mi, bi)
								? 'sel'
								: null;
					if (kind) {
						if (std)
							out.push({ x: beat.x - 9, y: std.offsetY + 2, w: 18, h: std.height - 4, kind });
						if (tab)
							out.push({ x: beat.x - 9, y: tab.offsetY + 6, w: 18, h: tab.height - 12, kind });
					}
					// Active cursor also highlights the string cell in the tab band.
					if (isCursor && tab) {
						out.push({
							x: beat.x - 9,
							y: tab.offsetY + layout.tabTop + c.string * METRICS.tabLineGap - 6,
							w: 18,
							h: 12,
							kind: 'string'
						});
					}
					// Sub-beat note selection (a set of strings within one beat). Not
					// track-scoped — matches the original per-note check.
					if (
						tab &&
						noteSel &&
						noteSel.measure === mi &&
						noteSel.beat === bi &&
						noteSel.voice === vIdx
					) {
						for (const n of beat.notes) {
							if (!noteSel.strings.has(n.string)) continue;
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
	});

	// Pending mark-start anchor: a dashed vertical flag across the whole system at
	// the anchored beat (shown until the two-step selection is completed).
	const markStartX = $derived.by(() => {
		if (!store.markStartPending) return null;
		const pos = store.markStartPos;
		if (!pos || pos.track !== trackIndex) return null;
		for (const m of system.measures) {
			if (m.index !== pos.measure) continue;
			for (const b of m.beats) if (b.index === pos.beat) return b.x;
		}
		return null;
	});
</script>

{#each rects as r (r.kind + ':' + r.x + ':' + r.y)}
	<rect x={r.x} y={r.y} width={r.w} height={r.h} class={CLASS[r.kind]} />
{/each}

{#if markStartX != null}
	<line
		x1={markStartX - 9}
		y1={4}
		x2={markStartX - 9}
		y2={system.height - 4}
		class="stroke-[#f59e0b] [stroke-width:2] [stroke-dasharray:4_3] pointer-events-none"
	/>
	<text x={markStartX - 6} y={14} class="fill-[#f59e0b] text-[13px] font-black pointer-events-none"
		>[</text
	>
{/if}
