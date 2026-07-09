<script lang="ts">
	// Renders one track as crisp SVG: standard staff, tablature and/or rhythm.
	// Click anywhere to move the edit cursor; shift-click extends the loop
	// selection. Layout geometry comes from notation/layout.ts.

	import { store } from '$lib/stores/score.svelte';
	import { observeWidth } from '$lib/resize';
	import {
		layoutTrack,
		computeSharedSystems,
		timeSigAllowance,
		METRICS,
		type LaidMeasure,
		type SharedSystems,
		type TrackLayout
	} from '$lib/notation/layout';
	import { GLYPH, restGlyph, timeSigGlyphs } from '$lib/notation/glyphs';
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { beamGroups } from './track-staff/beam-geometry';
	import { createDragSelect } from './track-staff/DragSelect';
	import StdVoice from './track-staff/StdVoice.svelte';
	import TabVoice from './track-staff/TabVoice.svelte';
	import StaffContextMenu from './track-staff/StaffContextMenu.svelte';
	import { noteheadStyle } from './track-staff/note-styles';

	let {
		trackIndex,
		onlySystemIndex,
		sharedOverride,
		layoutOverride
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
	} = $props();

	const ctxNote = $derived(store.currentNote);

	let containerWidth = $state(800);
	let container: HTMLDivElement;

	const track = $derived(store.score.tracks[trackIndex]);

	// When multiple tracks are shown together (multi-track view), every
	// track's systems must break at the same measures so bars line up in
	// parallel — track 1 and track 2 both show bars 1–2 on line one, then
	// both show bars 3–4 on line two, instead of each wrapping independently.
	const visibleTracks = $derived(store.score.tracks.filter((t) => store.isTrackVisible(t.id)));
	const shared = $derived(
		sharedOverride ??
			(store.trackViewMode === 'multi' && visibleTracks.length > 1
				? computeSharedSystems(store.score, visibleTracks, containerWidth)
				: undefined)
	);

	// `$derived` is lazy, so when a pre-computed layout is supplied the local
	// layoutTrack() call (and the `shared`/`visibleTracks` deriveds above)
	// never even run for this instance.
	const layout = $derived(
		layoutOverride ??
			layoutTrack(store.score, track, {
				containerWidth: containerWidth,
				showStandard: track.view.standard,
				showTab: track.view.tab,
				showRhythm: track.view.rhythm,
				shared
			})
	);

	// When rendering just one system (interleaved multi-track view), only
	// that system is drawn; otherwise every system for this track is.
	const systemsToRender = $derived(
		onlySystemIndex != null ? [layout.systems[onlySystemIndex]].filter(Boolean) : layout.systems
	);

	// Small vertical track-name label to the left of the first bar. Shown on
	// every rendered row in the interleaved multi-track view (each row is a
	// separate instance there), since otherwise a row's track wouldn't be
	// identifiable once tracks alternate line by line.
	const showTrackLabel = $derived(onlySystemIndex != null);

	const isActiveTrack = $derived(store.cursor.track === trackIndex);

	/** Nearest (beat, string) for a pointer event within a band's <g>. */
	function locate(
		e: MouseEvent | PointerEvent,
		measure: LaidMeasure,
		band: 'tab' | 'standard' | 'rhythm'
	): { beat: number; string: number } {
		const svg = (e.currentTarget as SVGGElement).ownerSVGElement!;
		const rect = svg.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

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
			const localY = py - layout.bands.tab.offsetY - 14;
			string = Math.max(
				0,
				Math.min(track.tuning.length - 1, Math.round(localY / METRICS.tabLineGap))
			);
		}
		return { beat: best, string };
	}

	function handleClick(e: MouseEvent, measure: LaidMeasure, band: 'tab' | 'standard' | 'rhythm') {
		if (drag.isSuppressingClick()) return;
		const { beat, string } = locate(e, measure, band);
		if (e.shiftKey) {
			// Keep cursor where it is (just ensure this track is active), then extend
			// selection from that anchor to the clicked beat.
			store.setCursor({ track: trackIndex });
			store.setSelectionTo(measure.index, beat);
		} else {
			store.setCursor({ track: trackIndex, measure: measure.index, beat, string });
			store.clearSelection();
			store.clearNoteSelection();
		}
	}

	// Double-click selects all beats in the tapped bar.
	function handleDoubleClick(
		_e: MouseEvent,
		measure: LaidMeasure,
		_band: 'tab' | 'standard' | 'rhythm'
	) {
		store.setCursor({ track: trackIndex, measure: measure.index, beat: 0 });
		store.setSelectionTo(measure.index, measure.beats.length - 1);
	}

	// Prime the cursor on press so a long-press / right-click context menu acts on
	// the beat and string under the finger, not wherever the cursor happened to be.
	function primeContext(
		e: PointerEvent,
		measure: LaidMeasure,
		band: 'tab' | 'standard' | 'rhythm'
	) {
		if (e.shiftKey) return;
		const { beat, string } = locate(e, measure, band);
		store.setCursor({ track: trackIndex, measure: measure.index, beat, string });
	}

	// We render each system in its own translated <g>; track its y offset.
	function _sysOffsetFor(measure: LaidMeasure): number {
		for (const s of layout.systems) {
			if (s.measures.includes(measure)) return s.y;
		}
		return 0;
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
		return observeWidth(container, (w) => (containerWidth = w));
	});

	const drag = createDragSelect({
		container: () => container,
		layout: () => layout,
		track: () => track,
		trackIndex: () => trackIndex
	});

	// Absolute index of the track's final measure — it gets a double barline
	// (thin + thick) to mark the end of the score, like an engraved sheet.
	const lastMeasureIndex = $derived(track.measures.length - 1);

	const BRAVURA = "[font-family:'Bravura',serif] fill-[#18181b]";
	const HIT_AREA = 'fill-transparent [pointer-events:all] touch-manipulation';
	const STAFF_LINE = 'stroke-[#d4d4d8] [stroke-width:1]';
	const BARLINE = 'stroke-[#3f3f46] [stroke-width:1.4]';
	const BARLINE_THICK = 'stroke-[#3f3f46] [stroke-width:4]';
	const STEM = 'stroke-[#18181b] [stroke-width:1.4]';
	const BEAM = 'stroke-[#18181b] [stroke-width:3.4] [stroke-linecap:butt]';
</script>

<ContextMenuPrimitive.Root bind:open={store.contextMenuOpen}>
	<ContextMenuPrimitive.Trigger class="block">
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
			>
				{#each systemsToRender as system (system.y)}
					<!-- content-visibility:auto lets the browser skip layout/paint for
					     systems far off screen, which is most of a long score while
					     scrolling or following playback. Each svg carries explicit
					     width/height attributes, so skipping its contents never changes
					     its box (no layout shift). Forced back to visible for print so
					     every page renders. -->
					<svg
						class="system block [content-visibility:auto] print:[content-visibility:visible]"
						data-first-measure={system.measures[0]?.index}
						data-last-measure={system.measures[system.measures.length - 1]?.index}
						width={Math.max(system.width, containerWidth)}
						height={system.height}
						role="presentation"
					>
						{#each system.measures as measure, mIdx (measure.index)}
							<!-- x where a begin-repeat sign sits: at the bar's start, or just
							     after the clef/key header (and any time signature) on the
							     first bar of a system. -->
							{@const repeatX =
								measure.x +
								(measure.showHeader ? METRICS.headerWidth + layout.keySigWidth + 2 : 0) +
								timeSigAllowance(measure.timeSignature)}
							{@const nextMeasure = system.measures[mIdx + 1] ?? null}
							<!-- ===== Standard staff band ===== -->
							{#if layout.bands.standard}
								{@const band = layout.bands.standard}
								{@const stdTop = METRICS.stdTopPad + METRICS.staffLineGap}
								{@const stdBottom = METRICS.stdTopPad + 5 * METRICS.staffLineGap}
								<g
									transform="translate(0,{band.offsetY})"
									onclick={(e) => handleClick(e, measure, 'standard')}
									ondblclick={(e) => handleDoubleClick(e, measure, 'standard')}
									onpointerdown={(e) => primeContext(e, measure, 'standard')}
									role="presentation"
								>
									<!-- Invisible full-band rect so taps on empty space (not just on a
								     drawn line/note) still register a click on this <g>. -->
									<rect
										x={measure.x}
										y="0"
										width={measure.width}
										height={band.height}
										class={HIT_AREA}
									/>
									<!-- 5 staff lines -->
									{#each [0, 1, 2, 3, 4] as i (i)}
										<line
											x1={measure.x + (measure.showHeader ? 4 : 0)}
											y1={METRICS.stdTopPad + METRICS.staffLineGap + i * METRICS.staffLineGap}
											x2={measure.x + measure.width}
											y2={METRICS.stdTopPad + METRICS.staffLineGap + i * METRICS.staffLineGap}
											class={STAFF_LINE}
										/>
									{/each}
									<!-- Opening barline — aligned with the left end of the staff
									     lines (which are inset by 4px on a header bar) so it sits
									     flush against the staff, with no gap like the closing line. -->
									<line
										x1={measure.x + (measure.showHeader ? 4 : 0)}
										y1={METRICS.stdTopPad + METRICS.staffLineGap}
										x2={measure.x + (measure.showHeader ? 4 : 0)}
										y2={METRICS.stdTopPad + 5 * METRICS.staffLineGap}
										class={BARLINE}
									/>
									{#if measure.repeatStart}
										<!-- Begin repeat: thick + thin + two dots, after the header. -->
										<line
											x1={repeatX + 2}
											y1={stdTop}
											x2={repeatX + 2}
											y2={stdBottom}
											class={BARLINE_THICK}
										/>
										<line
											x1={repeatX + 6.5}
											y1={stdTop}
											x2={repeatX + 6.5}
											y2={stdBottom}
											class={BARLINE}
										/>
										<circle
											cx={repeatX + 11.5}
											cy={stdTop + 1.5 * METRICS.staffLineGap}
											r="2"
											class="fill-[#3f3f46]"
										/>
										<circle
											cx={repeatX + 11.5}
											cy={stdTop + 2.5 * METRICS.staffLineGap}
											r="2"
											class="fill-[#3f3f46]"
										/>
									{/if}
									{#if measure.repeatEnd}
										<!-- End repeat: two dots + thin + thick (mirrors begin). -->
										<circle
											cx={measure.x + measure.width - 11.5}
											cy={stdTop + 1.5 * METRICS.staffLineGap}
											r="2"
											class="fill-[#3f3f46]"
										/>
										<circle
											cx={measure.x + measure.width - 11.5}
											cy={stdTop + 2.5 * METRICS.staffLineGap}
											r="2"
											class="fill-[#3f3f46]"
										/>
										<line
											x1={measure.x + measure.width - 6.5}
											y1={stdTop}
											x2={measure.x + measure.width - 6.5}
											y2={stdBottom}
											class={BARLINE}
										/>
										<line
											x1={measure.x + measure.width - 2}
											y1={stdTop}
											x2={measure.x + measure.width - 2}
											y2={stdBottom}
											class={BARLINE_THICK}
										/>
										{#if measure.repeatCount && measure.repeatCount > 2}
											<text
												x={measure.x + measure.width - 8}
												y={stdTop - 4}
												class="fill-[#3f3f46] [font:700_9px_ui-sans-serif,sans-serif] [text-anchor:end]"
												>x{measure.repeatCount}</text
											>
										{/if}
									{:else if measure.index === lastMeasureIndex}
										<!-- Final double barline: thin then thick at the very end. -->
										<line
											x1={measure.x + measure.width - 5}
											y1={stdTop}
											x2={measure.x + measure.width - 5}
											y2={stdBottom}
											class={BARLINE}
										/>
										<line
											x1={measure.x + measure.width - 1.5}
											y1={stdTop}
											x2={measure.x + measure.width - 1.5}
											y2={stdBottom}
											class={BARLINE_THICK}
										/>
									{:else if measure.barline === 'double'}
										<!-- Section double barline: two thin lines. -->
										<line
											x1={measure.x + measure.width - 4}
											y1={stdTop}
											x2={measure.x + measure.width - 4}
											y2={stdBottom}
											class={BARLINE}
										/>
										<line
											x1={measure.x + measure.width}
											y1={stdTop}
											x2={measure.x + measure.width}
											y2={stdBottom}
											class={BARLINE}
										/>
									{:else}
										<line
											x1={measure.x + measure.width}
											y1={stdTop}
											x2={measure.x + measure.width}
											y2={stdBottom}
											class={BARLINE}
										/>
									{/if}
									{#if measure.simile}
										<!-- Simile: repeat-previous-bar mark, centred in the bar. -->
										<text
											x={measure.x +
												measure.width / 2 +
												(measure.showHeader ? (METRICS.headerWidth + layout.keySigWidth) / 2 : 0)}
											y={stdTop + 2 * METRICS.staffLineGap + 6}
											class="{BRAVURA} text-[26px] [text-anchor:middle]">{GLYPH.repeat1Bar}</text
										>
									{/if}

									{#if measure.showHeader}
										{#if layout.clef === 'bass'}
											<text
												x={measure.x + 8}
												y={METRICS.stdTopPad + 2.5 * METRICS.staffLineGap}
												class="{BRAVURA} text-[40px]">{GLYPH.bassClef}</text
											>
										{:else}
											<text
												x={measure.x + 8}
												y={METRICS.stdTopPad + 3.4 * METRICS.staffLineGap}
												class="{BRAVURA} text-[40px]">{GLYPH.trebleClef}</text
											>
										{/if}
									{/if}
									{#if measure.showHeader}
										{#each layout.keySigGlyphs as g, gi (gi)}
											<text x={measure.x + g.dx} y={g.y} class="{BRAVURA} text-[24px]"
												>{g.glyph}</text
											>
										{/each}
									{/if}
									{#if measure.timeSignature}
										<text
											x={measure.x + (measure.showHeader ? 40 + layout.keySigWidth : 6)}
											y={METRICS.stdTopPad + 2 * METRICS.staffLineGap + 1}
											class="{BRAVURA} text-[26px]">{timeSigGlyphs(measure.timeSignature[0])}</text
										>
										<text
											x={measure.x + (measure.showHeader ? 40 + layout.keySigWidth : 6)}
											y={METRICS.stdTopPad + 4 * METRICS.staffLineGap + 1}
											class="{BRAVURA} text-[26px]">{timeSigGlyphs(measure.timeSignature[1])}</text
										>
									{/if}

									<StdVoice
										beats={measure.beats}
										measureIndex={measure.index}
										vIdx={0}
										bandHeight={band.height}
										{isActiveTrack}
										{trackIndex}
									/>
									{#if measure.voice2}
										<StdVoice
											beats={measure.voice2}
											measureIndex={measure.index}
											vIdx={1}
											bandHeight={band.height}
											{isActiveTrack}
											{trackIndex}
										/>
									{/if}
								</g>
							{/if}

							<!-- ===== Tablature band ===== -->
							{#if layout.bands.tab}
								{@const band = layout.bands.tab}
								{@const tabTop = 14}
								{@const tabBottom = 14 + (track.tuning.length - 1) * METRICS.tabLineGap}
								{@const tabMid = (tabTop + tabBottom) / 2}
								<g
									transform="translate(0,{band.offsetY})"
									onclick={(e) => handleClick(e, measure, 'tab')}
									ondblclick={(e) => handleDoubleClick(e, measure, 'tab')}
									onpointerdown={(e) => primeContext(e, measure, 'tab')}
									role="presentation"
								>
									<rect
										x={measure.x}
										y="0"
										width={measure.width}
										height={band.height}
										class={HIT_AREA}
									/>
									{#if measure.overflow}
										<rect
											x={measure.x}
											y="0"
											width={measure.width}
											height={band.height}
											class="fill-[rgba(185,28,28,0.1)]"
										/>
									{/if}
									<!-- string lines -->
									{#each track.tuning as _, i (i)}
										<line
											x1={measure.x + (measure.showHeader ? 4 : 0)}
											y1={14 + i * METRICS.tabLineGap}
											x2={measure.x + measure.width}
											y2={14 + i * METRICS.tabLineGap}
											class={STAFF_LINE}
										/>
									{/each}
									<!-- Opening barline flush with the (inset) string lines. -->
									<line
										x1={measure.x + (measure.showHeader ? 4 : 0)}
										y1={14}
										x2={measure.x + (measure.showHeader ? 4 : 0)}
										y2={14 + (track.tuning.length - 1) * METRICS.tabLineGap}
										class={BARLINE}
									/>
									{#if measure.repeatStart}
										<line
											x1={repeatX + 2}
											y1={tabTop}
											x2={repeatX + 2}
											y2={tabBottom}
											class={BARLINE_THICK}
										/>
										<line
											x1={repeatX + 6.5}
											y1={tabTop}
											x2={repeatX + 6.5}
											y2={tabBottom}
											class={BARLINE}
										/>
										<circle cx={repeatX + 11.5} cy={tabMid - 5.5} r="2" class="fill-[#3f3f46]" />
										<circle cx={repeatX + 11.5} cy={tabMid + 5.5} r="2" class="fill-[#3f3f46]" />
									{/if}
									{#if measure.repeatEnd}
										<circle
											cx={measure.x + measure.width - 11.5}
											cy={tabMid - 5.5}
											r="2"
											class="fill-[#3f3f46]"
										/>
										<circle
											cx={measure.x + measure.width - 11.5}
											cy={tabMid + 5.5}
											r="2"
											class="fill-[#3f3f46]"
										/>
										<line
											x1={measure.x + measure.width - 6.5}
											y1={tabTop}
											x2={measure.x + measure.width - 6.5}
											y2={tabBottom}
											class={BARLINE}
										/>
										<line
											x1={measure.x + measure.width - 2}
											y1={tabTop}
											x2={measure.x + measure.width - 2}
											y2={tabBottom}
											class={BARLINE_THICK}
										/>
										{#if measure.repeatCount && measure.repeatCount > 2}
											<text
												x={measure.x + measure.width - 8}
												y={tabTop - 3}
												class="fill-[#3f3f46] [font:700_9px_ui-sans-serif,sans-serif] [text-anchor:end]"
												>x{measure.repeatCount}</text
											>
										{/if}
									{:else if measure.index === lastMeasureIndex}
										<line
											x1={measure.x + measure.width - 5}
											y1={tabTop}
											x2={measure.x + measure.width - 5}
											y2={tabBottom}
											class={BARLINE}
										/>
										<line
											x1={measure.x + measure.width - 1.5}
											y1={tabTop}
											x2={measure.x + measure.width - 1.5}
											y2={tabBottom}
											class={BARLINE_THICK}
										/>
									{:else if measure.barline === 'double'}
										<line
											x1={measure.x + measure.width - 4}
											y1={tabTop}
											x2={measure.x + measure.width - 4}
											y2={tabBottom}
											class={BARLINE}
										/>
										<line
											x1={measure.x + measure.width}
											y1={tabTop}
											x2={measure.x + measure.width}
											y2={tabBottom}
											class={BARLINE}
										/>
									{:else}
										<line
											x1={measure.x + measure.width}
											y1={tabTop}
											x2={measure.x + measure.width}
											y2={tabBottom}
											class={BARLINE}
										/>
									{/if}
									{#if measure.simile}
										<text
											x={measure.x +
												measure.width / 2 +
												(measure.showHeader ? (METRICS.headerWidth + layout.keySigWidth) / 2 : 0)}
											y={tabMid + 7}
											class="{BRAVURA} text-[24px] [text-anchor:middle]">{GLYPH.repeat1Bar}</text
										>
									{/if}

									{#if measure.showHeader}
										<text
											x={measure.x + 8}
											y={14 + ((track.tuning.length - 1) * METRICS.tabLineGap) / 2 + 4}
											class="[font:700_9px_ui-sans-serif,sans-serif] fill-[#a1a1aa] tracking-[1px]"
											>TAB</text
										>
									{/if}

									<TabVoice
										beats={measure.beats}
										measureIndex={measure.index}
										vIdx={0}
										bandHeight={band.height}
										{isActiveTrack}
										{trackIndex}
										showMarks={!layout.bands.standard}
									/>
									{#if measure.voice2}
										<TabVoice
											beats={measure.voice2}
											measureIndex={measure.index}
											vIdx={1}
											bandHeight={band.height}
											{isActiveTrack}
											{trackIndex}
											showMarks={!layout.bands.standard}
										/>
									{/if}
								</g>
							{/if}

							<!-- ===== Rhythm-only band ===== -->
							{#if layout.bands.rhythm}
								{@const band = layout.bands.rhythm}
								{@const stemTop = band.height / 2 - 18}
								<g
									transform="translate(0,{band.offsetY})"
									onclick={(e) => handleClick(e, measure, 'rhythm')}
									onpointerdown={(e) => primeContext(e, measure, 'rhythm')}
									role="presentation"
								>
									<rect
										x={measure.x}
										y="0"
										width={measure.width}
										height={band.height}
										class={HIT_AREA}
									/>
									<line
										x1={measure.x}
										y1={band.height / 2}
										x2={measure.x + measure.width}
										y2={band.height / 2}
										class={STAFF_LINE}
									/>
									<line
										x1={measure.x}
										y1={band.height / 2 - 8}
										x2={measure.x}
										y2={band.height / 2 + 8}
										class={BARLINE}
									/>
									<!-- Beams first: consecutive same-rhythm beats connect into a group. -->
									{#each beamGroups(measure.beats) as group (group)}
										{@const members = measure.beats.filter((b) => b.beamGroup === group)}
										<line
											x1={members[0].x}
											y1={stemTop}
											x2={members[members.length - 1].x}
											y2={stemTop}
											class={BEAM}
										/>
										{#each members as m (m.index)}
											<line x1={m.x} y1={band.height / 2} x2={m.x} y2={stemTop} class={STEM} />
											{#if m.beams >= 2}
												<line
													x1={m.x}
													y1={stemTop + 4}
													x2={m.x + 8}
													y2={stemTop + 4}
													class={BEAM}
												/>
											{/if}
										{/each}
									{/each}
									{#each measure.beats as beat (beat.index)}
										{#if beat.rest}
											<text x={beat.x - 3} y={band.height / 2 + 4} class="{BRAVURA} text-[26px]"
												>{restGlyph(beat.duration)}</text
											>
										{:else}
											{#if beat.beamGroup === -1}
												<line
													x1={beat.x}
													y1={band.height / 2}
													x2={beat.x}
													y2={stemTop}
													class={STEM}
												/>
												{#if beat.beams > 0}
													<!-- Flag baseline sits exactly at the stem tip (SMuFL flags
													     anchor there) so the flag always connects to the stem. -->
													<text x={beat.x} y={stemTop} class="{BRAVURA} text-[26px]"
														>{beat.beams === 1 ? GLYPH.flag8thUp : GLYPH.flag16thUp}</text
													>
												{/if}
											{/if}
											<ellipse
												cx={beat.x}
												cy={band.height / 2}
												rx="4.5"
												ry="3.4"
												class={noteheadStyle({
													hollow: beat.duration <= 2,
													v2: false,
													ghost: false
												})}
											/>
										{/if}
									{/each}
								</g>
							{/if}
							<!-- Volta bracket + segno/coda marks in the reserved strip above the
							     bands (layout reserves it whenever any measure carries one). -->
							{#if measure.volta}
								{@const voltaEnds = !nextMeasure || nextMeasure.volta !== measure.volta}
								{#if measure.voltaStart}
									<line x1={measure.x + 1} y1={13} x2={measure.x + 1} y2={3} class={BARLINE} />
								{/if}
								<line
									x1={measure.x + 1}
									y1={3}
									x2={measure.x + measure.width - 1}
									y2={3}
									class={BARLINE}
								/>
								{#if voltaEnds}
									<line
										x1={measure.x + measure.width - 1}
										y1={3}
										x2={measure.x + measure.width - 1}
										y2={13}
										class={BARLINE}
									/>
								{/if}
								{#if measure.voltaStart}
									<text
										x={measure.x + 5}
										y={13}
										class="fill-[#3f3f46] [font:700_9px_ui-sans-serif,sans-serif]"
										>{measure.volta}.</text
									>
								{/if}
							{/if}
							<!-- Bar-attribute symbols (segno, coda, tempo change, lock) in the
							     strip above the bands. Positions come pre-computed from
							     layout.ts, laid left→right after the volta number and section
							     label so nothing overlaps. -->
							{#each measure.symbols as sym (sym.kind)}
								{#if sym.kind === 'segno'}
									<text x={sym.x} y={15} class="{BRAVURA} text-[15px]">{GLYPH.segno}</text>
								{:else if sym.kind === 'coda'}
									<text x={sym.x} y={15} class="{BRAVURA} text-[15px]">{GLYPH.coda}</text>
								{:else if sym.kind === 'tempo'}
									<!-- Mid-song tempo change: ♩ = N above the bar. -->
									<text x={sym.x} y={14} class="{BRAVURA} text-[13px]"
										>{GLYPH.metNoteQuarterUp}</text
									>
									<text
										x={sym.x + 7}
										y={14}
										class="fill-[#18181b] [font:700_10px_ui-sans-serif,sans-serif]"
										>= {sym.tempo}</text
									>
								{:else if sym.kind === 'lock'}
									<!-- Locked bar: small padlock. -->
									<path
										d="M {sym.x + 2.2} 9.5 V 7.6 a 2.2 2.2 0 0 1 4.4 0 V 9.5"
										class="fill-none stroke-[#71717a] [stroke-width:1.2]"
									/>
									<rect x={sym.x} y="9.5" width="8.8" height="5.8" rx="1" class="fill-[#71717a]" />
								{/if}
							{/each}
							<!-- Section-marker label: small text above the staff bands. Rendered
						     last (on top) so its hit area always wins over the bands' glyphs.
						     Click to rename inline; the same store update the tracks panel uses. -->
							{#if measure.sectionLetter}
								{#if editingSectionId === measure.sectionId}
									<foreignObject
										x={measure.x + (measure.showHeader ? 4 : 2)}
										y="0"
										width={Math.max(60, measure.width - 6)}
										height={METRICS.sectionLabelHeight}
									>
										<input
											bind:this={editingSectionInput}
											class="h-[15px] w-full rounded-sm border border-border-strong bg-paper px-1 text-[10px] font-bold text-ink outline-none"
											value={editingSectionText}
											placeholder={measure.sectionLetter}
											oninput={(e) => (editingSectionText = e.currentTarget.value)}
											onblur={commitEditSection}
											onkeydown={(e) => {
												if (e.key === 'Enter') e.currentTarget.blur();
												else if (e.key === 'Escape') cancelEditSection();
											}}
											onclick={(e) => e.stopPropagation()}
											onpointerdown={(e) => e.stopPropagation()}
										/>
									</foreignObject>
								{:else}
									<g
										class="cursor-text"
										onclick={(e) => {
											e.stopPropagation();
											startEditSection(measure);
										}}
										onpointerdown={(e) => e.stopPropagation()}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												startEditSection(measure);
											}
										}}
										role="button"
										tabindex="0"
										aria-label={`Edit section ${measure.sectionLetter}${measure.sectionName ? ': ' + measure.sectionName : ''}`}
									>
										<rect
											x={measure.x}
											y="0"
											width={measure.width}
											height={METRICS.sectionLabelHeight}
											class="fill-transparent [pointer-events:all]"
										/>
										<text
											x={measure.x + (measure.showHeader ? 4 : 2)}
											y="12"
											class="fill-[#71717a] [font:700_10px_ui-sans-serif,sans-serif] tracking-[0.3px]"
											>{measure.sectionLetter}{measure.sectionName
												? ' ' + measure.sectionName
												: ''}</text
										>
									</g>
								{/if}
							{/if}
						{/each}

						<!-- Pending mark-start flag: thin vertical line at the anchor beat -->
						{#if store.markStartPending && store.markStartPos?.track === trackIndex}
							{@const pos = store.markStartPos!}
							{#each system.measures as m (m.index)}
								{#if m.index === pos.measure}
									{#each m.beats as beat (beat.index)}
										{#if beat.index === pos.beat}
											<line
												x1={beat.x - 9}
												y1={4}
												x2={beat.x - 9}
												y2={system.height - 4}
												class="stroke-[#f59e0b] [stroke-width:2] [stroke-dasharray:4_3] pointer-events-none"
											/>
											<text
												x={beat.x - 6}
												y={14}
												class="fill-[#f59e0b] text-[13px] font-black pointer-events-none">[</text
											>
										{/if}
									{/each}
								{/if}
							{/each}
						{/if}
					</svg>
				{/each}
			</div>
		</div>
	</ContextMenuPrimitive.Trigger>
	<StaffContextMenu bind:ctxOpen={store.contextMenuOpen} {ctxNote} {track} />
</ContextMenuPrimitive.Root>
