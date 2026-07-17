<script lang="ts">
	// Renders one track's systems as HTML canvas (was crisp SVG). Layout geometry
	// still comes from notation/layout.ts and every editing interaction is
	// geometry-based (nearest beat/string from the pointer position), so the
	// renderer swap left the editor untouched. Click anywhere to move the edit
	// cursor; shift-click extends the loop selection.

	import { untrack } from 'svelte';
	import { store } from '$lib/stores/score.svelte';
	import { pausePlayback, seekPlayback } from '$lib/audio/playback';
	import { scoreViewport } from '$lib/stores/viewport.svelte';
	import { observeWidth } from '$lib/resize';
	import {
		layoutTrackCached,
		computeSharedSystemsCached,
		METRICS,
		type LaidMeasure,
		type LaidSystem,
		type SharedSystems,
		type TrackLayout
	} from '$lib/notation/layout';
	import { registerTrackLayout } from '$lib/notation/layout-registry';
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { createDragSelect } from './DragSelect';
	import StaffContextMenu from './StaffContextMenu.svelte';
	import SystemCanvas from './SystemCanvas.svelte';

	let {
		trackIndex,
		onlySystemIndex,
		sharedOverride,
		layoutOverride,
		showLabel
	}: {
		trackIndex: number;
		/** Multi-track (interleaved) view: render only this one system (row),
		 *  so ScoreArea can place all tracks' Nth system together before
		 *  moving on to their (N+1)th, instead of stacking a track's whole
		 *  staff before the next track's. */
		onlySystemIndex?: number;
		/** Pre-computed shared system breakdown from ScoreArea, so every track
		 *  instance agrees on the exact same breaks without recomputing it
		 *  (and re-measuring width) independently per track. */
		sharedOverride?: SharedSystems;
		/** Pre-computed full layout for this track from ScoreArea. In the
		 *  interleaved view this component is instantiated once per (system ×
		 *  track); without this every instance would lay out the whole track
		 *  again just to render its one row. */
		layoutOverride?: TrackLayout;
		/** Force the vertical track-name label on/off. Defaults to on whenever a
		 *  single system is rendered (the interleaved multi-track view); the page
		 *  view's single-track mode also renders per-system but needs no label. */
		showLabel?: boolean;
	} = $props();

	const ctxNote = $derived(store.currentNote);

	let containerWidth = $state(800);
	let container: HTMLDivElement;

	const track = $derived(store.score.tracks[trackIndex]);

	// When multiple tracks are shown together (multi-track view), every
	// track's systems must break at the same measures so bars line up in
	// parallel — track 1 and track 2 both show bars 1–2 on line one, then
	// both show bars 3–4 on line two, instead of each wrapping independently.
	//
	// The layout walks below run inside untrack(): they read every note of the
	// deep-reactive score, and letting a $derived register those tens of
	// thousands of reads as dependencies costs far more than the layout itself
	// (dependency bookkeeping dominated the profile on large scores). Every
	// layout-relevant mutation bumps store.scoreVersion — that's its contract —
	// so tracking version + identities + width + view flags is exactly enough.
	const visibleTracks = $derived(store.score.tracks.filter((t) => store.isTrackVisible(t.id)));
	const shared = $derived.by(() => {
		if (sharedOverride) return sharedOverride;
		if (store.trackViewMode !== 'multi' || visibleTracks.length <= 1) return undefined;
		const version = store.scoreVersion;
		const score = store.score;
		const tracks = visibleTracks;
		const width = containerWidth;
		return untrack(() => computeSharedSystemsCached(score, tracks, width, version));
	});

	// `$derived` is lazy, so when a pre-computed layout is supplied the local
	// layoutTrack() call (and the `shared`/`visibleTracks` deriveds above)
	// never even run for this instance.
	const layout = $derived.by(() => {
		if (layoutOverride) return layoutOverride;
		const version = store.scoreVersion;
		const score = store.score;
		const t = track;
		const opts = {
			containerWidth: containerWidth,
			showStandard: t.view.standard,
			showTab: t.view.tab,
			showRhythm: t.view.rhythm,
			shared
		};
		return untrack(() => layoutTrackCached(score, t, opts, version));
	});

	// Publish this track's current layout for the playback line, which maps the
	// playhead tick to an x position on its own rAF loop and so can't take part
	// in component reactivity. Every instance of a track (one per system row in
	// the interleaved view) registers the same shared layout object — idempotent.
	$effect(() => {
		registerTrackLayout(track.id, layout);
	});

	// When rendering just one system (interleaved multi-track view), only
	// that system is drawn; otherwise every system for this track is.
	const systemsToRender = $derived(
		onlySystemIndex != null ? [layout.systems[onlySystemIndex]].filter(Boolean) : layout.systems
	);

	// ── System virtualization ────────────────────────────────────────────────
	// A long piece can have hundreds of systems; building every one up front is
	// what makes a big score slow to open and sluggish to edit. In the continuous
	// single-track view we keep a cheap fixed-height placeholder for every system
	// (so total height and scroll targets are exact) and mount the heavy canvas
	// only for systems near the viewport.
	//
	// Also applies to the interleaved multi-track view: there ScoreArea mounts one
	// instance per (system × track), so without virtualization the whole score's
	// canvases are built and painted on load. Off while printing (every page must
	// be in the DOM for the snapshot).
	const virtualize = $derived(!scoreViewport.printing);

	// Don't build the systems until the real container width is known: the first
	// layout would otherwise run against the placeholder default width and be
	// thrown away a frame later. A supplied layoutOverride is already sized, so
	// it needs no measurement.
	let measuredWidth = $state(false);
	const layoutReady = $derived(layoutOverride != null || measuredWidth);

	// Half-open [visFrom, visTo) range of systemsToRender to actually build.
	let visFrom = $state(0);
	let visTo = $state(0);
	const isSystemVisible = (i: number): boolean => !virtualize || (i >= visFrom && i < visTo);

	// Stable geometry signature of the rendered systems. Every edit rebuilds the
	// layout, handing this component all-new system objects with (almost always)
	// identical geometry — a string that only changes when positions/heights
	// actually change lets the visibility effect below skip those runs. That
	// matters because the effect reads getBoundingClientRect(): in the interleaved
	// multi-track view there's one instance per (system × track), and a hundred
	// rect reads interleaved with template updates is a forced-reflow storm that
	// costs ~1s per keystroke on a large score.
	const geometrySig = $derived(systemsToRender.map((s) => `${s.y}:${s.height}`).join('|'));

	$effect(() => {
		// Re-run on every viewport sync. Scrolling the container changes only its
		// scrollTop (its top edge and height stay put), so `version` — bumped on
		// each sync — is the trigger that makes this recompute as the user scrolls;
		// without reading it here, systems revealed by scrolling would stay blank
		// placeholders. `getBoundingClientRect()` below is read fresh each run and
		// already reflects the new scroll offset. Content edits that keep the
		// geometry identical don't re-trigger (see geometrySig above).
		void scoreViewport.version;
		void geometrySig;
		if (!layoutReady) return;
		const systems = untrack(() => systemsToRender);
		if (!virtualize || !container || !systems.length) {
			visFrom = 0;
			visTo = systems.length;
			return;
		}
		const rect = container.getBoundingClientRect();
		const measured = scoreViewport.height > 0;
		const vTop = measured ? scoreViewport.top : 0;
		const vHeight = measured
			? scoreViewport.height
			: typeof window !== 'undefined'
				? window.innerHeight
				: 0;
		if (vHeight <= 0) {
			visFrom = 0;
			visTo = systems.length;
			return;
		}
		const buffer = vHeight; // one screenful of over-scan above and below

		// Interleaved multi-track / page view: this instance renders a single
		// system filling its own container, so `system.y` (an offset within the
		// whole-track layout) doesn't map to a position inside this container.
		// Decide visibility straight from the container's own box vs the viewport.
		if (onlySystemIndex != null) {
			const visible = rect.bottom >= vTop - buffer && rect.top <= vTop + vHeight + buffer;
			visFrom = 0;
			visTo = visible ? systems.length : 0;
			return;
		}

		const wrapperTop = rect.top;
		const lo = vTop - buffer - wrapperTop;
		const hi = vTop + vHeight + buffer - wrapperTop;
		let from = systems.length;
		let to = 0;
		for (let i = 0; i < systems.length; i++) {
			const y0 = systems[i].y;
			if (y0 + systems[i].height >= lo && y0 <= hi) {
				if (i < from) from = i;
				to = i + 1;
			}
		}
		if (from > to) {
			from = 0;
			to = 0;
		}
		visFrom = from;
		visTo = to;
	});

	// Small vertical track-name label to the left of the first bar. Shown on
	// every rendered row in the interleaved multi-track view (each row is a
	// separate instance there), since otherwise a row's track wouldn't be
	// identifiable once tracks alternate line by line.
	const showTrackLabel = $derived(showLabel ?? onlySystemIndex != null);

	const isActiveTrack = $derived(store.cursor.track === trackIndex);

	// Absolute index of the track's final measure — it gets a double barline
	// (thin + thick) to mark the end of the score, like an engraved sheet.
	const lastMeasureIndex = $derived(track.measures.length - 1);

	type Band = 'tab' | 'standard' | 'rhythm';

	/** Resolve the measure + band under a pointer within a system's canvas box.
	 *  `px`/`py` are in system space (the same space layout geometry uses), and
	 *  the .system div's top-left is that space's origin — so a plain
	 *  client-minus-rect gives the coordinates the old per-band <g> handlers saw. */
	function resolvePointer(
		e: MouseEvent | PointerEvent,
		system: LaidSystem
	): { measure: LaidMeasure; band: Band | null; px: number; py: number } | null {
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;
		if (!system.measures.length) return null;
		let measure = system.measures[0];
		for (const m of system.measures) if (px >= m.x) measure = m;
		const b = layout.bands;
		let band: Band | null = null;
		if (b.standard && py >= b.standard.offsetY && py < b.standard.offsetY + b.standard.height)
			band = 'standard';
		else if (b.tab && py >= b.tab.offsetY && py < b.tab.offsetY + b.tab.height) band = 'tab';
		else if (b.rhythm && py >= b.rhythm.offsetY && py < b.rhythm.offsetY + b.rhythm.height)
			band = 'rhythm';
		return { measure, band, px, py };
	}

	/** Nearest (beat, string) for a resolved pointer position. */
	function locate(
		measure: LaidMeasure,
		band: Band | null,
		px: number,
		py: number
	): { beat: number; string: number } {
		let best = 0;
		let bestD = Infinity;
		measure.beats.forEach((b, i) => {
			const d = Math.abs(b.x - px);
			if (d < bestD) {
				bestD = d;
				best = i;
			}
		});

		let string = store.cursor.string;
		if (band === 'tab' && layout.bands.tab) {
			const localY = py - layout.bands.tab.offsetY - layout.tabTop;
			string = Math.max(
				0,
				Math.min(track.tuning.length - 1, Math.round(localY / METRICS.tabLineGap))
			);
		}
		return { beat: best, string };
	}

	/** True when the pointer is in the reserved section-label strip over a
	 *  measure that carries a section marker (click there renames it). */
	function inSectionLabel(measure: LaidMeasure, py: number): boolean {
		return py < METRICS.sectionLabelHeight && !!measure.sectionLetter;
	}

	// Any click in the staff interrupts a running playback: a plain click on a
	// beat is a seek (playback restarts from the clicked spot), everything else
	// (section labels, whitespace, shift-selection) pauses in place.
	function handleClick(e: MouseEvent, system: LaidSystem) {
		const r = resolvePointer(e, system);
		if (!r) {
			if (store.isPlaying) pausePlayback();
			return;
		}
		if (inSectionLabel(r.measure, r.py)) {
			if (store.isPlaying) pausePlayback();
			startEditSection(r.measure);
			return;
		}
		if (!r.band) {
			if (store.isPlaying) pausePlayback();
			return;
		}
		if (drag.isSuppressingClick()) return;
		const { beat, string } = locate(r.measure, r.band, r.px, r.py);
		if (e.shiftKey) {
			if (store.isPlaying) pausePlayback();
			// Keep cursor where it is (just ensure this track is active), then extend
			// selection from that anchor to the clicked beat.
			store.setCursor({ track: trackIndex });
			store.setSelectionTo(r.measure.index, beat);
		} else {
			store.setCursor({ track: trackIndex, measure: r.measure.index, beat, string });
			store.clearSelection();
			store.clearNoteSelection();
			if (store.isPlaying) seekPlayback(r.measure.index, beat);
		}
	}

	// Double-click selects all beats in the tapped bar (standard/tab only, as in
	// the SVG version where the rhythm band carried no double-click handler).
	function handleDoubleClick(e: MouseEvent, system: LaidSystem) {
		const r = resolvePointer(e, system);
		if (!r || (r.band !== 'standard' && r.band !== 'tab')) return;
		store.setCursor({ track: trackIndex, measure: r.measure.index, beat: 0 });
		store.setSelectionTo(r.measure.index, r.measure.beats.length - 1);
	}

	// Prime the cursor on press so a long-press / right-click context menu acts on
	// the beat and string under the finger, not wherever the cursor happened to be.
	function primeContext(e: PointerEvent, system: LaidSystem) {
		const r = resolvePointer(e, system);
		if (!r || inSectionLabel(r.measure, r.py) || !r.band || e.shiftKey) return;
		const { beat, string } = locate(r.measure, r.band, r.px, r.py);
		store.setCursor({ track: trackIndex, measure: r.measure.index, beat, string });
	}

	// Inline section-name editing, triggered by clicking a section marker's
	// label above the staff. Committed through the same `store.updateSection`
	// the tracks panel section navigator uses, so both stay in sync.
	let editingSectionId = $state<string | null>(null);
	let editingSectionText = $state('');
	let editingSectionInput = $state<HTMLInputElement | null>(null);

	function startEditSection(measure: LaidMeasure) {
		if (!measure.sectionId) return;
		editingSectionId = measure.sectionId;
		editingSectionText = measure.sectionName ?? '';
	}
	function commitEditSection() {
		if (editingSectionId)
			store.updateSection(editingSectionId, { label: editingSectionText.trim() });
		editingSectionId = null;
	}
	function cancelEditSection() {
		editingSectionId = null;
	}

	$effect(() => {
		if (editingSectionId && editingSectionInput) {
			editingSectionInput.focus();
			editingSectionInput.select();
		}
	});

	$effect(() => {
		if (!container) return;
		return observeWidth(container, (w) => {
			containerWidth = w;
			measuredWidth = true;
		});
	});

	const drag = createDragSelect({
		container: () => container,
		layout: () => layout,
		track: () => track,
		trackIndex: () => trackIndex
	});

	/** The measure (within a system) whose section marker is being renamed, so
	 *  its input overlay is placed over the right bar. */
	function editingMeasureIn(system: LaidSystem): LaidMeasure | null {
		if (!editingSectionId) return null;
		return system.measures.find((m) => m.sectionId === editingSectionId) ?? null;
	}
</script>

<ContextMenuPrimitive.Root bind:open={store.contextMenuOpen}>
	<ContextMenuPrimitive.Trigger class="block outline-none focus-visible:outline-none">
		<div class="flex items-start">
			{#if showTrackLabel}
				<div
					class="text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden text-[10px] font-semibold [text-orientation:mixed] [writing-mode:vertical-lr]"
					style="width:18px;height:{systemsToRender[0]?.height ?? 0}px"
					title={track.name}
				>
					<span class="truncate">{track.name}</span>
				</div>
			{/if}
			<div
				class="min-w-0 flex-1 overflow-x-hidden bg-paper select-none"
				bind:this={container}
				class:active={isActiveTrack}
				onpointerdown={drag.onDragPointerDown}
				role="presentation"
			>
				{#if layoutReady}
					{#each systemsToRender as system, i (system.y)}
						<!-- Fixed-height placeholder for every system: it reserves the exact
						     vertical space and carries the scroll-target metadata (class +
						     data-*), so the total height and "scroll to bar" behaviour are
						     unchanged whether or not the heavy canvas inside is mounted. -->
						<div
							class="system relative block"
							data-first-measure={system.measures[0]?.index}
							data-last-measure={system.measures[system.measures.length - 1]?.index}
							style="height:{system.height}px"
							onclick={(e) => handleClick(e, system)}
							ondblclick={(e) => handleDoubleClick(e, system)}
							onpointerdown={(e) => primeContext(e, system)}
							role="presentation"
						>
							{#if isSystemVisible(i)}
								<SystemCanvas
									{layout}
									{system}
									{trackIndex}
									{containerWidth}
									{lastMeasureIndex}
									{editingSectionId}
								/>
								{@const editMeasure = editingMeasureIn(system)}
								{#if editMeasure}
									<input
										bind:this={editingSectionInput}
										class="absolute top-0 h-[15px] rounded-sm border border-border-strong bg-paper px-1 text-[10px] font-bold text-ink outline-none"
										style="left:{editMeasure.x +
											(editMeasure.showHeader ? 4 : 2)}px;width:{Math.max(
											60,
											editMeasure.width - 6
										)}px"
										value={editingSectionText}
										placeholder={editMeasure.sectionLetter}
										oninput={(e) => (editingSectionText = e.currentTarget.value)}
										onblur={commitEditSection}
										onkeydown={(e) => {
											if (e.key === 'Enter') e.currentTarget.blur();
											else if (e.key === 'Escape') cancelEditSection();
										}}
										onclick={(e) => e.stopPropagation()}
										onpointerdown={(e) => e.stopPropagation()}
									/>
								{/if}
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</ContextMenuPrimitive.Trigger>
	<StaffContextMenu bind:ctxOpen={store.contextMenuOpen} {ctxNote} {track} />
</ContextMenuPrimitive.Root>
