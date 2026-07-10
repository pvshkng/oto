<script lang="ts">
	// The "paper" content shared by +page.svelte's desktop and mobile layouts:
	// the score title/artist header button and the track loop. Byte-identical
	// between the two hosts except what happens when the header is clicked
	// (desktop closes the other right-panel modes first; mobile doesn't).
	//
	// Two display modes:
	//  - Continuous (default): one tall sheet, systems flow without breaks.
	//  - Page view (store.pageView): the score is split into A4 pages. Systems
	//    are packed greedily — a page only breaks when the next system row no
	//    longer fits — and each page shows a "current/total" footer. PDF export
	//    prints these pages one per sheet.
	import { store } from '$lib/stores/score.svelte';
	import { observeWidth } from '$lib/resize';
	import { computeSharedSystems, layoutTrack, type TrackLayout } from '$lib/notation/layout';
	import { GLYPH } from '$lib/notation/glyphs';
	import { TUNINGS } from '$lib/oto/pitch';
	import type { OtoTrack } from '$lib/oto/types';
	import TrackStaff from './TrackStaff.svelte';

	let { onHeaderClick }: { onHeaderClick: () => void } = $props();

	// A4 geometry at CSS 96dpi: 210mm × 297mm ≈ 794 × 1123 px. The print
	// stylesheet (layout.css) maps .a4-page back to true millimetres, so what
	// paginates on screen is exactly what lands on each printed sheet.
	const PAGE_W = 794;
	const PAGE_H = 1123;
	const PAGE_PAD_X = 44;
	const PAGE_PAD_TOP = 40;
	// Taller than the top pad: the bottom band also hosts the page-number footer.
	const PAGE_PAD_BOTTOM = 64;
	const PAGE_CONTENT_W = PAGE_W - 2 * PAGE_PAD_X;
	const PAGE_CONTENT_H = PAGE_H - PAGE_PAD_TOP - PAGE_PAD_BOTTOM;
	// Width of the vertical track-name label column TrackStaff renders beside
	// each row in the interleaved multi-track view. Must be subtracted from the
	// width given to the layout engine or the staff's right edge gets clipped.
	const TRACK_LABEL_W = 18;

	// Tempo marking sits above the first staff, like an engraved score. Clicking it
	// opens the tempo editor — the desktop right panel, or the mobile drawer.
	function toggleTempo() {
		if (store.isDesktop) store.togglePanel('tempo');
		else store.tempoOpen = true;
	}

	// Width available to each track's staff, measured once here so every
	// track's shared system breakdown (below) agrees on the same value.
	// Only meaningful in continuous mode — page view uses the fixed A4 width.
	let tracksWidth = $state(1000);
	let tracksWrapperEl = $state<HTMLDivElement | undefined>(undefined);
	$effect(() => {
		if (!tracksWrapperEl) return;
		// This wrapper resizes with the viewport in both single- and multi-track
		// modes, so its busy signal covers every resize episode — enough to drive
		// the score-area spinner without each TrackStaff reporting separately.
		return observeWidth(tracksWrapperEl, (w) => (tracksWidth = w), {
			onBusy: (b) => (b ? store.showRelayout() : store.hideRelayoutSoon())
		});
	});

	// Visible tracks with their absolute index into score.tracks (TrackStaff
	// addresses tracks by that index).
	const visibleEntries = $derived(
		store.score.tracks
			.map((track, index) => ({ track, index }))
			.filter((e) => store.isTrackVisible(e.track.id))
	);
	const visibleTracks = $derived(visibleEntries.map((e) => e.track));

	// Non-standard tunings called out under the title, the way engraved guitar
	// sheets announce "Tuning: D A D G B E". A track counts as custom-tuned when
	// its tuning differs from its kind's standard set; drums have no tuning in
	// the musical sense and never qualify.
	const STANDARD_TUNING: Partial<Record<OtoTrack['kind'], string[]>> = {
		guitar: TUNINGS['Guitar Standard'],
		bass: TUNINGS['Bass Standard'],
		ukulele: TUNINGS['Ukulele']
	};
	function hasCustomTuning(t: OtoTrack): boolean {
		if (t.instrument === 'drums') return false;
		const std = STANDARD_TUNING[t.kind];
		if (!std) return true; // 'custom' kind: nothing standard to match
		return std.length !== t.tuning.length || std.some((n, i) => n !== t.tuning[i]);
	}
	// Low string first, octave digits stripped: ['E4','B3',…,'D2'] → "D A D G B E".
	function tuningLabel(t: OtoTrack): string {
		return [...t.tuning]
			.reverse()
			.map((n) => n.replace(/-?\d+$/, ''))
			.join(' ');
	}
	const customTunedTracks = $derived(visibleTracks.filter(hasCustomTuning));

	const isMulti = $derived(store.trackViewMode === 'multi' && visibleTracks.length > 1);

	// The width handed to the layout engine. Page view lays out against the
	// fixed A4 content width; continuous mode against the measured wrapper.
	// The multi-track view renders an 18px track-name label column beside every
	// row, so that much is subtracted — otherwise the staff overflows its
	// wrapper and the right edge is clipped.
	const layoutWidth = $derived(
		(store.pageView ? PAGE_CONTENT_W : tracksWidth) - (isMulti ? TRACK_LABEL_W : 0)
	);

	// Multi-track view: every visible track's systems must break at the same
	// measures and share the same computed system count, so a shared system
	// index N groups track 1's Nth system with track 2's Nth system etc. —
	// bars read top-to-bottom in parallel instead of one track's whole staff
	// followed by the next track's whole staff.
	const shared = $derived(
		isMulti ? computeSharedSystems(store.score, visibleTracks, layoutWidth) : undefined
	);

	// In the interleaved view each track appears once per shared system, i.e.
	// systems × tracks TrackStaff instances. Left to itself, every instance
	// would run layoutTrack() over its whole track just to draw one row, making
	// layout cost O(systems × tracks × measures). Compute each visible track's
	// full layout exactly once here and hand it to every row instance instead.
	const sharedLayouts = $derived.by(() => {
		if (!shared) return null;
		const layouts: Record<string, TrackLayout> = {};
		for (const t of visibleTracks) {
			layouts[t.id] = layoutTrack(store.score, t, {
				containerWidth: layoutWidth,
				showStandard: t.view.standard,
				showTab: t.view.tab,
				showRhythm: t.view.rhythm,
				shared
			});
		}
		return layouts;
	});

	// Page view, single-track mode: full layout per visible track against the
	// A4 content width (the multi-track case reuses sharedLayouts above).
	const pageSingleLayouts = $derived.by(() => {
		if (!store.pageView || shared) return null;
		const layouts: Record<string, TrackLayout> = {};
		for (const t of visibleTracks) {
			layouts[t.id] = layoutTrack(store.score, t, {
				containerWidth: layoutWidth,
				showStandard: t.view.standard,
				showTab: t.view.tab,
				showRhythm: t.view.rhythm
			});
		}
		return layouts;
	});
	const pageLayouts = $derived(shared ? sharedLayouts : pageSingleLayouts);

	// ---- pagination ----------------------------------------------------------
	// One block = one system row of one track (the atomic unit that must never
	// be split across pages). Multi-track view interleaves: system 0 of every
	// track, then system 1 of every track, … so if the focused tracks are too
	// many for one page, a single bar group simply continues onto the next page.
	interface PageBlock {
		trackId: string;
		trackIndex: number;
		si: number;
		h: number;
		/** Space after this block (px) — counted while packing so the next
		 *  block's fit check stays exact. */
		gap: number;
	}

	// Measured height of the title header on page 1 (bind:clientHeight below).
	// Starts with an estimate; the measurement re-runs pagination once real.
	let headerHeight = $state(150);

	const pages = $derived.by(() => {
		if (!store.pageView || !pageLayouts) return null;
		const blocks: PageBlock[] = [];
		if (shared) {
			for (let si = 0; si < shared.systems.length; si++) {
				for (const { track, index } of visibleEntries) {
					const sys = pageLayouts[track.id]?.systems[si];
					if (!sys) continue;
					blocks.push({ trackId: track.id, trackIndex: index, si, h: sys.height, gap: 4 });
				}
			}
		} else {
			for (const { track, index } of visibleEntries) {
				const l = pageLayouts[track.id];
				if (!l) continue;
				l.systems.forEach((sys, si) => {
					blocks.push({
						trackId: track.id,
						trackIndex: index,
						si,
						h: sys.height,
						// Breathing room between one track's staff and the next.
						gap: si === l.systems.length - 1 ? 12 : 0
					});
				});
			}
		}

		// Greedy packing: keep filling the current page while the next block
		// still fits; only then break. The last page is allowed to end short.
		const paged: PageBlock[][] = [];
		let cur: PageBlock[] = [];
		let used = headerHeight; // page 1 carries the title header
		for (const b of blocks) {
			if (cur.length && used + b.h > PAGE_CONTENT_H) {
				paged.push(cur);
				cur = [];
				used = 0;
			}
			cur.push(b);
			used += b.h + b.gap;
		}
		if (cur.length) paged.push(cur);
		return paged;
	});
</script>

{#snippet scoreHeader()}
	<button
		class="group relative mb-[22px] block w-full cursor-pointer border-none bg-transparent [background-image:none!important] [padding:0_0_16px] text-center [border-bottom:1px_solid_var(--border)]"
		onclick={onHeaderClick}
		title="Edit song details"
	>
		<h1
			class="m-0 [font-family:var(--serif)] text-[27px] font-semibold text-ink max-[720px]:text-[22px]"
		>
			{store.score.title || 'Untitled Score'}
		</h1>
		<p class="[margin:4px_0_0] [font-family:var(--serif)] text-text-muted italic">
			{store.score.artist || 'Unknown'}
		</p>
		<span
			class="absolute top-0 right-0 rounded-legacy-xs border border-border-strong px-1.5 py-0.5 text-[10px] text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-[720px]:opacity-100 print:hidden"
			>edit ✎</span
		>
	</button>

	<!-- Custom tunings, called out between the title and the tempo marking. -->
	{#if customTunedTracks.length}
		<div class="mb-1 flex flex-col items-start">
			{#each customTunedTracks as t (t.id)}
				<span class="[font-family:var(--serif)] text-[13px] text-text-muted italic">
					{store.score.tracks.length > 1 ? `${t.name} tuning` : 'Tuning'}: {tuningLabel(t)}
				</span>
			{/each}
		</div>
	{/if}

	<!-- Tempo marking (♩ = bpm), engraved above the first staff. Click to edit. -->
	<button
		class="mb-1.5 inline-flex cursor-pointer items-center gap-1 border-none bg-transparent [background-image:none!important] p-1 text-ink hover:opacity-70"
		onclick={toggleTempo}
		title="Tempo — click to edit"
		aria-label="Tempo {store.score.tempo} bpm, click to edit"
	>
		<span class="[font-family:'Bravura',serif] text-[19px] leading-none"
			>{GLYPH.metNoteQuarterUp}</span
		>
		<span class="text-[15px] font-semibold [font-family:var(--serif)]">= {store.score.tempo}</span>
	</button>
{/snippet}

{#if store.pageView && pages}
	<!-- ═══ Page view: the score split into A4 sheets ═══ -->
	<div class="print-pages flex flex-col items-center gap-6">
		{#each pages as page, pi (pi)}
			<div
				class="a4-page relative shrink-0 rounded-md border border-border bg-paper shadow-[var(--shadow-1),var(--shadow-2)]"
				style="width:{PAGE_W}px; height:{PAGE_H}px; padding:{PAGE_PAD_TOP}px {PAGE_PAD_X}px {PAGE_PAD_BOTTOM}px"
			>
				<!-- overflow-hidden guarantees nothing ever bleeds past the page's
				     content area, even if a measurement is momentarily stale. -->
				<div class="h-full overflow-hidden">
					{#if pi === 0}
						<!-- flow-root so the header's child margins are contained in the
						     measured height that pagination subtracts from page 1. -->
						<div class="flow-root" bind:clientHeight={headerHeight}>
							{@render scoreHeader()}
						</div>
					{/if}
					{#each page as block (block.trackId + ':' + block.si)}
						<section style="margin-bottom:{block.gap}px" data-track-id={block.trackId}>
							<TrackStaff
								trackIndex={block.trackIndex}
								onlySystemIndex={block.si}
								sharedOverride={shared}
								layoutOverride={pageLayouts?.[block.trackId]}
								showLabel={!!shared}
							/>
						</section>
					{/each}
				</div>
				<div
					class="pointer-events-none absolute inset-x-0 bottom-[24px] text-center text-[11px] text-text-muted"
				>
					{pi + 1} / {pages.length}
				</div>
			</div>
		{/each}
	</div>
{:else}
	<!-- ═══ Continuous view: one tall sheet ═══ -->
	<div
		class="[padding:28px_30px_36px] h-fit w-full max-w-[1080px] rounded-md border border-border bg-paper shadow-[var(--shadow-1),var(--shadow-2)] max-[720px]:[padding:18px_12px_26px] lg:min-w-[860px] print:max-w-none print:min-w-0 print:border-none print:shadow-none"
	>
		{@render scoreHeader()}

		<div bind:this={tracksWrapperEl}>
			{#if shared}
				{#each shared.systems as _, si (si)}
					{#each store.score.tracks as track, i (track.id)}
						{#if store.isTrackVisible(track.id)}
							<section class="mb-1" data-track-id={track.id}>
								<TrackStaff
									trackIndex={i}
									onlySystemIndex={si}
									sharedOverride={shared}
									layoutOverride={sharedLayouts?.[track.id]}
								/>
							</section>
						{/if}
					{/each}
				{/each}
			{:else}
				{#each store.score.tracks as track, i (track.id)}
					{#if store.isTrackVisible(track.id)}
						<section class="mb-3" data-track-id={track.id}>
							<TrackStaff trackIndex={i} />
						</section>
					{/if}
				{/each}
			{/if}
		</div>
	</div>
{/if}
