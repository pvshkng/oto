<script lang="ts">
	// Renders one track as crisp SVG: standard staff, tablature and/or rhythm.
	// Click anywhere to move the edit cursor; shift-click extends the loop
	// selection. Layout geometry comes from notation/layout.ts.

	import { store } from '$lib/stores/score.svelte';
	import { layoutTrack, METRICS, type LaidMeasure } from '$lib/notation/layout';
	import { GLYPH, restGlyph, timeSigGlyphs } from '$lib/notation/glyphs';
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { beamGroups } from './track-staff/beam-geometry';
	import { createDragSelect } from './track-staff/DragSelect';
	import StdVoice from './track-staff/StdVoice.svelte';
	import TabVoice from './track-staff/TabVoice.svelte';
	import StaffContextMenu from './track-staff/StaffContextMenu.svelte';

	let { trackIndex }: { trackIndex: number } = $props();

	const ctxNote = $derived(store.currentNote);

	let ctxOpen = $state(false);
	let containerWidth = $state(800);
	let container: HTMLDivElement;

	const track = $derived(store.score.tracks[trackIndex]);
	const layout = $derived(
		layoutTrack(store.score, track, {
			containerWidth: containerWidth - 8,
			showStandard: track.view.standard,
			showTab: track.view.tab,
			showRhythm: track.view.rhythm
		})
	);

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

	$effect(() => {
		if (!container) return;
		const ro = new ResizeObserver((entries) => {
			containerWidth = entries[0].contentRect.width;
		});
		ro.observe(container);
		return () => ro.disconnect();
	});

	const drag = createDragSelect({
		container: () => container,
		layout: () => layout,
		track: () => track,
		trackIndex: () => trackIndex
	});
</script>

<ContextMenuPrimitive.Root bind:open={ctxOpen}>
	<ContextMenuPrimitive.Trigger class="ctx-anchor">
		<div
			class="track-staff"
			bind:this={container}
			class:active={isActiveTrack}
			onpointerdown={drag.onDragPointerDown}
		>
			{#each layout.systems as system (system.y)}
				<svg
					class="system"
					data-first-measure={system.measures[0]?.index}
					data-last-measure={system.measures[system.measures.length - 1]?.index}
					width={Math.max(system.width, containerWidth - 8)}
					height={system.height}
					role="presentation"
				>
					{#each system.measures as measure (measure.index)}
						<!-- ===== Standard staff band ===== -->
						{#if layout.bands.standard}
							{@const band = layout.bands.standard}
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
									class="hit-area"
								/>
								<!-- 5 staff lines -->
								{#each [0, 1, 2, 3, 4] as i (i)}
									<line
										x1={measure.x + (measure.showHeader ? 4 : 0)}
										y1={METRICS.stdTopPad + METRICS.staffLineGap + i * METRICS.staffLineGap}
										x2={measure.x + measure.width}
										y2={METRICS.stdTopPad + METRICS.staffLineGap + i * METRICS.staffLineGap}
										class="staff-line"
									/>
								{/each}
								<!-- barlines -->
								<line
									x1={measure.x}
									y1={METRICS.stdTopPad + METRICS.staffLineGap}
									x2={measure.x}
									y2={METRICS.stdTopPad + 5 * METRICS.staffLineGap}
									class="barline"
								/>
								<line
									x1={measure.x + measure.width}
									y1={METRICS.stdTopPad + METRICS.staffLineGap}
									x2={measure.x + measure.width}
									y2={METRICS.stdTopPad + 5 * METRICS.staffLineGap}
									class="barline"
								/>

								{#if measure.showHeader}
									{#if layout.clef === 'bass'}
										<text
											x={measure.x + 8}
											y={METRICS.stdTopPad + 2.5 * METRICS.staffLineGap}
											class="bravura clef">{GLYPH.bassClef}</text
										>
									{:else}
										<text
											x={measure.x + 8}
											y={METRICS.stdTopPad + 3.4 * METRICS.staffLineGap}
											class="bravura clef">{GLYPH.trebleClef}</text
										>
									{/if}
								{/if}
								{#if measure.showHeader}
									{#each layout.keySigGlyphs as g, gi (gi)}
										<text x={measure.x + g.dx} y={g.y} class="bravura keysig">{g.glyph}</text>
									{/each}
								{/if}
								{#if measure.timeSignature}
									<text
										x={measure.x + (measure.showHeader ? 34 + layout.keySigWidth : 6)}
										y={METRICS.stdTopPad + 2 * METRICS.staffLineGap + 1}
										class="bravura tsig">{timeSigGlyphs(measure.timeSignature[0])}</text
									>
									<text
										x={measure.x + (measure.showHeader ? 34 + layout.keySigWidth : 6)}
										y={METRICS.stdTopPad + 4 * METRICS.staffLineGap + 1}
										class="bravura tsig">{timeSigGlyphs(measure.timeSignature[1])}</text
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
									class="hit-area"
								/>
								{#if measure.overflow}
									<rect
										x={measure.x}
										y="0"
										width={measure.width}
										height={band.height}
										class="bg-overflow"
									/>
								{/if}
								<!-- string lines -->
								{#each track.tuning as _, i (i)}
									<line
										x1={measure.x + (measure.showHeader ? 4 : 0)}
										y1={14 + i * METRICS.tabLineGap}
										x2={measure.x + measure.width}
										y2={14 + i * METRICS.tabLineGap}
										class="staff-line"
									/>
								{/each}
								<line
									x1={measure.x}
									y1={14}
									x2={measure.x}
									y2={14 + (track.tuning.length - 1) * METRICS.tabLineGap}
									class="barline"
								/>
								<line
									x1={measure.x + measure.width}
									y1={14}
									x2={measure.x + measure.width}
									y2={14 + (track.tuning.length - 1) * METRICS.tabLineGap}
									class="barline"
								/>

								{#if measure.showHeader}
									<text
										x={measure.x + 8}
										y={14 + ((track.tuning.length - 1) * METRICS.tabLineGap) / 2 + 4}
										class="tab-label">TAB</text
									>
								{/if}

								<TabVoice
									beats={measure.beats}
									measureIndex={measure.index}
									vIdx={0}
									bandHeight={band.height}
									{isActiveTrack}
									{trackIndex}
								/>
								{#if measure.voice2}
									<TabVoice
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
									class="hit-area"
								/>
								<line
									x1={measure.x}
									y1={band.height / 2}
									x2={measure.x + measure.width}
									y2={band.height / 2}
									class="staff-line"
								/>
								<line
									x1={measure.x}
									y1={band.height / 2 - 8}
									x2={measure.x}
									y2={band.height / 2 + 8}
									class="barline"
								/>
								<!-- Beams first: consecutive same-rhythm beats connect into a group. -->
								{#each beamGroups(measure.beats) as group (group)}
									{@const members = measure.beats.filter((b) => b.beamGroup === group)}
									<line
										x1={members[0].x}
										y1={stemTop}
										x2={members[members.length - 1].x}
										y2={stemTop}
										class="beam"
									/>
									{#each members as m (m.index)}
										<line x1={m.x} y1={band.height / 2} x2={m.x} y2={stemTop} class="stem" />
										{#if m.beams >= 2}
											<line x1={m.x} y1={stemTop + 4} x2={m.x + 8} y2={stemTop + 4} class="beam" />
										{/if}
									{/each}
								{/each}
								{#each measure.beats as beat (beat.index)}
									{#if beat.rest}
										<text x={beat.x - 3} y={band.height / 2 + 4} class="bravura rest"
											>{restGlyph(beat.duration)}</text
										>
									{:else}
										{#if beat.beamGroup === -1}
											<line
												x1={beat.x}
												y1={band.height / 2}
												x2={beat.x}
												y2={stemTop}
												class="stem"
											/>
											{#if beat.beams > 0}
												<text x={beat.x} y={stemTop} class="bravura flag"
													>{beat.beams === 1 ? GLYPH.flag8thUp : GLYPH.flag16thUp}</text
												>
											{/if}
										{/if}
										<ellipse
											cx={beat.x}
											cy={band.height / 2}
											rx="4.5"
											ry="3.4"
											class="notehead"
											class:hollow={beat.duration <= 2}
										/>
									{/if}
								{/each}
							</g>
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
											class="mark-start-line"
										/>
										<text x={beat.x - 6} y={14} class="mark-start-label">[</text>
									{/if}
								{/each}
							{/if}
						{/each}
					{/if}
				</svg>
			{/each}
		</div>
	</ContextMenuPrimitive.Trigger>
	<StaffContextMenu bind:ctxOpen {ctxNote} {track} />
</ContextMenuPrimitive.Root>

<style>
	:global(.ctx-anchor) {
		display: block;
	}
	.mark-start-line {
		stroke: #f59e0b;
		stroke-width: 2;
		stroke-dasharray: 4 3;
		pointer-events: none;
	}
	.mark-start-label {
		fill: #f59e0b;
		font-size: 13px;
		font-weight: 900;
		pointer-events: none;
	}
	.track-staff {
		width: 100%;
		overflow-x: auto;
		background: var(--paper, #fff);
		user-select: none;
	}
	.system {
		display: block;
	}
	/* Transparent backstop so a tap on empty space inside a band still hits the
	   <g>'s click handler — without it, SVG only dispatches pointer events where
	   something is actually painted (a line, note, etc). */
	.hit-area {
		fill: transparent;
		pointer-events: all;
		touch-action: manipulation;
	}
	.staff-line {
		stroke: #d4d4d8;
		stroke-width: 1;
	}
	.barline {
		stroke: #3f3f46;
		stroke-width: 1.4;
	}
	.notehead {
		fill: #18181b;
	}
	.notehead.hollow {
		fill: #fff;
		stroke: #18181b;
		stroke-width: 1.6;
	}
	.keysig {
		font-size: 24px;
	}
	.bravura {
		font-family: 'Bravura', serif;
		fill: #18181b;
	}
	.clef {
		font-size: 40px;
	}
	.tsig {
		font-size: 26px;
	}
	.rest {
		font-size: 26px;
	}
	.flag {
		font-size: 26px;
		dominant-baseline: middle;
	}
	.tab-label {
		font:
			700 9px ui-sans-serif,
			sans-serif;
		fill: #a1a1aa;
		letter-spacing: 1px;
	}
	.stem,
	.beam {
		stroke: #18181b;
	}
	.stem {
		stroke-width: 1.4;
	}
	.beam {
		stroke-width: 3.4;
		stroke-linecap: butt;
	}
	.bg-overflow {
		fill: rgba(185, 28, 28, 0.1);
	}
</style>
