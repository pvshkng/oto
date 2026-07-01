<script lang="ts">
	// Tracks panel. A bottom-docked panel (toggled from the menubar, mutually
	// exclusive with the note editor's keypad/fretboard dock) that gathers every
	// per-track mixing control in one place: a frozen track-list column on the
	// left (name, mute/solo, volume fader, pan knob, EQ) and a scrollable
	// arrangement timeline on the right, with a Master strip and section
	// markers underneath. All edits apply immediately.

	import { store } from '$lib/stores/score.svelte';
	import { audio } from '$lib/audio/engine';
	import { analyzeMeasure } from '$lib/oto/duration';
	import { cn } from '$lib/utils';
	import TrackControlDrawer from './TrackControlDrawer.svelte';
	import TrackIdentityRow from './tracks-panel/TrackIdentityRow.svelte';
	import TrackMixerControls from './tracks-panel/TrackMixerControls.svelte';
	import { MIXER_FADER_CLASS } from './tracks-panel/mixer-fader';
	import type { OtoTrack } from '$lib/oto/types';

	import Plus from 'phosphor-svelte/lib/Plus';
	import X from 'phosphor-svelte/lib/X';
	import MapPin from 'phosphor-svelte/lib/MapPin';
	import MagnifyingGlassPlus from 'phosphor-svelte/lib/MagnifyingGlassPlus';
	import MagnifyingGlassMinus from 'phosphor-svelte/lib/MagnifyingGlassMinus';
	import CaretDown from 'phosphor-svelte/lib/CaretDown';
	import Minus from 'phosphor-svelte/lib/Minus';
	import List from 'phosphor-svelte/lib/List';

	// Width of the frozen track-controls column. Desktop: draggable 350–520 px.
	// Mobile: fixed 250 px.
	const LEAD_MOBILE = 250;
	let LEAD = $state(350);

	function startColumnResize(e: PointerEvent) {
		if (!store.isDesktop) return;
		e.preventDefault();
		const startX = e.clientX;
		const startW = LEAD;
		function onMove(ev: PointerEvent) {
			LEAD = Math.max(350, Math.min(520, startW + ev.clientX - startX));
		}
		function onUp() {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		}
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}

	// Pixels per measure in the timeline. Adjustable via the zoom control so long
	// songs don't sprawl; defaults small enough to fit a few bars on a phone, and
	// the strip scrolls horizontally beyond that.
	const MIN_CELL = 16;
	const MAX_CELL = 96;
	let cell = $state(30);
	function zoom(dir: 1 | -1) {
		cell = Math.max(MIN_CELL, Math.min(MAX_CELL, cell + dir * 14));
	}

	const tracks = $derived(store.score.tracks);
	const measureCount = $derived(Math.max(1, ...tracks.map((t) => t.measures.length)));
	const timelineW = $derived(measureCount * cell);
	const sections = $derived([...store.score.sections].sort((a, b) => a.measure - b.measure));

	// Section markers are absolutely positioned by measure and collide when placed
	// close together. Greedily pack them into rows so each label clears the one to
	// its left, stacking downward when there isn't room on a row.
	const MARKER_W = 92;
	const laidOutSections = $derived.by(() => {
		const rowRightEdge: number[] = [];
		return sections.map((sec, si) => {
			const left = Math.min(sec.measure, measureCount - 1) * cell;
			let row = 0;
			while (row < rowRightEdge.length && rowRightEdge[row] > left + 0.5) row++;
			rowRightEdge[row] = left + MARKER_W;
			return { sec, si, left, row };
		});
	});
	const markerRows = $derived(Math.max(1, ...laidOutSections.map((m) => m.row + 1)));

	// Playhead position (px from the timeline's left edge). During playback this
	// tracks the live beat; otherwise it falls back to the edit cursor so
	// scrubbing/seeking while stopped still shows where you are.
	const playheadX = $derived.by(() => {
		const p = store.isPlaying && store.playhead ? store.playhead : store.cursor;
		const m = Math.min(p.measure, measureCount - 1);
		const beats = tracks[0]?.measures[p.measure]?.beats.length ?? 1;
		const frac = beats > 0 ? Math.min(p.beat, beats) / beats : 0;
		return (m + frac) * cell;
	});

	let editIndex = $state(-1);
	let editOpen = $state(false);
	let eqOpen = $state<Record<string, boolean>>({});

	// Per-row mixer detail (volume/pan/EQ/settings) expand state. Collapsed by
	// default — rows show only name, mute, solo and the expand chevron.
	let rowOpen = $state<Record<string, boolean>>({});
	const allRowsOpen = $derived(tracks.length > 0 && tracks.every((t) => rowOpen[t.id]));

	function toggleRow(id: string) {
		rowOpen = { ...rowOpen, [id]: !rowOpen[id] };
	}
	function toggleAllRows() {
		const next = !allRowsOpen;
		rowOpen = Object.fromEntries(tracks.map((t) => [t.id, next]));
	}

	function trackHasContent(t: OtoTrack, mi: number): boolean {
		const m = t.measures[mi];
		if (!m) return false;
		return m.beats.some((b) => b.notes.length > 0) || !!m.voice2?.some((b) => b.notes.length > 0);
	}

	// A bar whose notes exceed its capacity (the overflow won't play) — flagged
	// red here in the arrangement, mirroring the sticky over-full warning.
	function barOverflow(t: OtoTrack, mi: number): boolean {
		const m = t.measures[mi];
		if (!m) return false;
		return analyzeMeasure(m, store.score.timeSignature).overflow;
	}

	function addTrack() {
		store.addTrack();
		if (store.isDesktop) {
			store.tempoOpen = false;
			store.songModalOpen = false;
			store.addRemoveOpen = false;
			store.trackControlOpen = true;
			store.trackControlIndex = store.cursor.track;
		} else {
			editIndex = store.cursor.track;
			editOpen = true;
		}
	}

	function jumpTo(measure: number, track = store.cursor.track) {
		store.setCursor({ track, measure, beat: 0 });
	}

	// Double tap/click a colored (content-bearing) block in the arrangement to
	// jump there and scroll the main score view to that exact track.
	//
	// function gotoSection(i: number, measure: number) {
	// 	const t = tracks[i];
	// 	if (!t || !trackHasContent(t, measure)) return;
	// 	store.focusedTrackId = t.id;
	// 	jumpTo(measure, i);
	// 	store.mixerOpen = false;
	// 	store.scrollToTrack(t.id, measure);
	// }

	// Select all beats in one bar of a given track.
	function selectBar(trackIdx: number, measure: number) {
		const t = tracks[trackIdx];
		if (!t) return;
		const lastBeat = Math.max(0, (t.measures[measure]?.beats.length ?? 1) - 1);
		if (store.trackViewMode === 'single') store.focusedTrackId = t.id;
		store.setCursor({ track: trackIdx, measure, beat: 0 });
		store.setSelectionTo(measure, lastBeat);
	}

	// Native `dblclick` doesn't fire reliably from touch double-taps, so track
	// taps manually for touch pointers; mouse double-clicks use ondblclick below.
	let lastTap = { row: -1, time: 0 };
	function handleTrackbarTap(e: PointerEvent, i: number) {
		if (e.pointerType !== 'touch') return;
		const now = performance.now();
		const x = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left;
		const measure = Math.min(measureCount - 1, Math.floor(x / cell));
		if (lastTap.row === i && now - lastTap.time < 350) {
			selectBar(i, measure);
			lastTap = { row: -1, time: 0 };
		} else {
			lastTap = { row: i, time: now };
		}
	}

	// Mixer setters mirror the store, then push the change onto the live audio
	// chain so a fader/knob is audible mid-playback rather than on the next play.
	function setVolume(i: number, v: number) {
		store.setVolume(i, v);
		audio.syncTrack(tracks[i]);
	}
	function setPan(i: number, p: number) {
		store.setPan(i, p);
		audio.syncTrack(tracks[i]);
	}
	function setEqBand(i: number, band: 'low' | 'mid' | 'high', db: number) {
		store.setEqBand(i, band, db);
		audio.syncTrack(tracks[i]);
	}
	function resetEq(i: number) {
		store.resetEq(i);
		audio.syncTrack(tracks[i]);
	}
	function setMaster(v: number) {
		store.setMasterVolume(v);
		audio.setMasterVolume(v); // live while playing
	}
</script>

<div
	class={cn(
		'bg-background/70 flex flex-col border-t backdrop-blur-md',
		!store.isDesktop && 'max-h-[55vh]'
	)}
>
	<div class="flex flex-row items-center justify-between gap-2 border-b px-4 py-3">
		<div class="mr-1 flex shrink-0 items-stretch">
			<button
				class={cn(
					'text-muted-foreground flex size-7 items-center justify-center rounded-md rounded-r-none border [background-image:none!important]',
					cell <= MIN_CELL ? 'sunk' : 'hover:text-foreground'
				)}
				title="Zoom out timeline"
				aria-label="Zoom out timeline"
				disabled={cell <= MIN_CELL}
				onclick={() => zoom(-1)}
			>
				<MagnifyingGlassMinus class="size-4" />
			</button>
			<button
				class={cn(
					'text-muted-foreground flex size-7 items-center justify-center rounded-md rounded-l-none border border-l-0 [background-image:none!important]',
					cell >= MAX_CELL ? 'sunk' : 'hover:text-foreground'
				)}
				title="Zoom in timeline"
				aria-label="Zoom in timeline"
				disabled={cell >= MAX_CELL}
				onclick={() => zoom(1)}
			>
				<MagnifyingGlassPlus class="size-4" />
			</button>
		</div>
		<div class="flex items-center gap-1.5">
			<button
				class="text-muted-foreground hover:text-foreground [background-image:none!important] p-1"
				title="Close tracks panel"
				aria-label="Close tracks panel"
				onclick={() => (store.mixerOpen = false)}
			>
				<X class="size-5" />
			</button>
		</div>
	</div>

	<!-- Scrollable mixer body, both axes. Left column is sticky; timeline scrolls under it. -->
	<div class={cn('overflow-auto overscroll-contain', !store.isDesktop && 'min-h-0 flex-1')}>
		<div class="relative w-max min-w-full text-sm">
			<!-- Playback/cursor position. Sits above track content but below the
				     frozen controls column (z-10) so it tucks away when scrolled. -->
			<div
				class="bg-primary pointer-events-none absolute top-0 bottom-0 z-[5] w-px"
				style="left:{(store.isDesktop ? LEAD : LEAD_MOBILE) + playheadX}px"
			></div>

			<!-- Measure ruler -->
			<div class="bg-background sticky top-0 z-20 flex border-b">
				<div
					class="bg-background sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r px-3 py-1.5"
					style="width:{store.isDesktop ? LEAD : LEAD_MOBILE}px"
				>
					{#if !store.isDesktop}
						<button
							class="text-muted-foreground hover:text-foreground [background-image:none!important] flex shrink-0 items-center"
							title={allRowsOpen ? 'Collapse all tracks' : 'Expand all tracks'}
							aria-label={allRowsOpen ? 'Collapse all tracks' : 'Expand all tracks'}
							onclick={toggleAllRows}
						>
							<CaretDown class={cn('size-3.5 transition-transform', allRowsOpen && 'rotate-180')} />
						</button>
					{/if}
					<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
						>Track</span
					>
					<!-- Single / Multi track view toggle -->
					<div class="ml-auto flex shrink-0 items-stretch">
						<button
							class={cn(
								'flex h-6 w-6 items-center justify-center rounded-l-md rounded-r-none border text-[11px] [background-image:none!important]',
								store.trackViewMode === 'single'
									? 'sunk text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							)}
							title="Single track view"
							aria-label="Single track view"
							aria-pressed={store.trackViewMode === 'single'}
							onclick={() => store.setTrackViewMode('single')}
						>
							<Minus class="size-3.5" />
						</button>
						<button
							class={cn(
								'flex h-6 w-6 items-center justify-center rounded-l-none rounded-r-md border border-l-0 text-[11px] [background-image:none!important]',
								store.trackViewMode === 'multi'
									? 'sunk text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							)}
							title="Multi track view"
							aria-label="Multi track view"
							aria-pressed={store.trackViewMode === 'multi'}
							onclick={() => store.setTrackViewMode('multi')}
						>
							<List class="size-3.5" />
						</button>
					</div>
					<button
						class="text-muted-foreground hover:text-foreground hover:border-border [background-image:none!important] flex size-5 shrink-0 items-center justify-center rounded-sm border border-transparent"
						title="Add track"
						aria-label="Add track"
						onclick={addTrack}
					>
						<Plus class="size-3.5" />
					</button>
				</div>
				<div class="relative shrink-0" style="width:{timelineW}px">
					<div class="flex h-full">
						{#each Array.from({ length: measureCount }, (_, k) => k) as mi (mi)}
							<div
								class={cn(
									'text-muted-foreground flex items-center justify-start py-1.5 pl-1 text-[10px] tabular-nums',
									(mi + 1) % 4 === 0 ? 'border-r border-border' : 'border-r border-border/40'
								)}
								style="width:{cell}px"
							>
								{#if mi === 0 || (mi + 1) % 4 === 0}{mi + 1}{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- One row per track -->
			{#each tracks as track, i (track.id)}
				{@const active = store.cursor.track === i}
				<div class={cn('relative flex border-b', active && 'bg-muted/40')}>
					<!-- Frozen controls column -->
					<div
						class={cn(
							'bg-background sticky left-0 z-10 flex shrink-0 flex-col gap-1.5 border-r px-2.5 py-2',
							active && 'bg-muted/60'
						)}
						style="width:{store.isDesktop
							? LEAD
							: LEAD_MOBILE}px;border-left:3px solid {track.color}"
					>
						{#if store.isDesktop}
							<!-- Desktop: single row — Eye | Name | M | S · Vol · Pan · EQ -->
							<div class="flex items-center gap-2">
								<TrackIdentityRow
									{track}
									index={i}
									onNameClick={() => {
										store.tempoOpen = false;
										store.songModalOpen = false;
										store.addRemoveOpen = false;
										store.trackControlOpen = true;
										store.trackControlIndex = i;
									}}
								/>
								<!-- Mixer controls: Vol · Pan · EQ (with gap between each) -->
								<TrackMixerControls
									{track}
									eqOpen={!!eqOpen[track.id]}
									onEqOpenChange={(v) => (eqOpen = { ...eqOpen, [track.id]: v })}
									showVolumeReadout={false}
									onVolume={(v) => setVolume(i, v)}
									onPan={(v) => setPan(i, v)}
									onEqBand={(band, db) => setEqBand(i, band, db)}
									onEqReset={() => resetEq(i)}
								/>
							</div>
						{:else}
							<!-- Mobile: Eye | Name | M | S + expand chevron, then expandable vol/pan/EQ row -->
							<div class="flex items-center gap-1.5">
								<TrackIdentityRow
									{track}
									index={i}
									onNameClick={() => {
										editIndex = i;
										editOpen = true;
									}}
								/>
								<!-- Expand chevron (mobile only) -->
								<button
									class="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md [background-image:none!important]"
									title={rowOpen[track.id] ? 'Collapse track controls' : 'Expand track controls'}
									aria-label={rowOpen[track.id]
										? 'Collapse track controls'
										: 'Expand track controls'}
									aria-expanded={!!rowOpen[track.id]}
									onclick={() => toggleRow(track.id)}
								>
									<CaretDown
										class={cn('size-4 transition-transform', rowOpen[track.id] && 'rotate-180')}
									/>
								</button>
							</div>

							{#if rowOpen[track.id]}
								<div class="flex items-center gap-2">
									<TrackMixerControls
										{track}
										eqOpen={!!eqOpen[track.id]}
										onEqOpenChange={(v) => (eqOpen = { ...eqOpen, [track.id]: v })}
										showVolumeReadout={true}
										onVolume={(v) => setVolume(i, v)}
										onPan={(v) => setPan(i, v)}
										onEqBand={(band, db) => setEqBand(i, band, db)}
										onEqReset={() => resetEq(i)}
									/>
								</div>
							{/if}
						{/if}
					</div>

					<!-- Column resize handle (desktop only) — positioned at the column border -->
					{#if store.isDesktop}
						<div
							class="absolute inset-y-0 z-[15] w-2 cursor-col-resize bg-transparent hover:bg-[color-mix(in_srgb,var(--primary)_20%,transparent)]"
							style="left:{LEAD - 4}px"
							onpointerdown={startColumnResize}
							title="Drag to resize track controls"
						></div>
					{/if}

					<!-- Arrangement blocks -->
					<button
						class="relative flex shrink-0 cursor-pointer [background-image:none!important]"
						style="width:{timelineW}px"
						title="Click to focus track · Shift-click to select bar range · Double-click to select entire bar"
						onclick={(e) => {
							const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
							const measure = Math.min(measureCount - 1, Math.floor(x / cell));
							if (e.shiftKey && store.cursor.track === i) {
								// Extend bar selection from the current cursor measure to here.
								const anchor = store.cursor.measure;
								const [start, end] = anchor <= measure ? [anchor, measure] : [measure, anchor];
								const lastBeat = Math.max(0, (tracks[i].measures[end]?.beats.length ?? 1) - 1);
								if (store.trackViewMode === 'single') store.focusedTrackId = track.id;
								store.setCursor({ track: i, measure: start, beat: 0 });
								store.setSelectionTo(end, lastBeat);
							} else {
								if (store.trackViewMode === 'single') store.focusedTrackId = track.id;
								jumpTo(measure, i);
							}
						}}
						ondblclick={(e) => {
							const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
							selectBar(i, Math.min(measureCount - 1, Math.floor(x / cell)));
						}}
						onpointerup={(e) => handleTrackbarTap(e, i)}
					>
						{#each Array.from({ length: measureCount }, (_, k) => k) as mi (mi)}
							<div
								class={cn(
									'flex items-stretch py-1.5',
									(mi + 1) % 4 === 0 ? 'border-r border-border' : 'border-r border-border/40',
									store.cursor.measure === mi && active && 'bg-foreground/5'
								)}
								style="width:{cell}px"
							>
								{#if trackHasContent(track, mi)}
									<div
										class="m-px flex-1 rounded-sm"
										style="background:{barOverflow(track, mi) ? 'var(--brick)' : track.color}"
										title={barOverflow(track, mi)
											? 'Over-full bar — extra notes won’t play'
											: undefined}
									></div>
								{/if}
							</div>
						{/each}
					</button>
				</div>
			{/each}

			<!-- Master strip -->
			<div class="flex border-b bg-muted/30">
				<div
					class="bg-muted/40 sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r px-2.5 py-2.5"
					style="width:{store.isDesktop ? LEAD : LEAD_MOBILE}px"
				>
					<span class="text-foreground shrink-0 text-[13px] font-bold">Master</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						aria-label="Master volume"
						title="Master volume"
						class={cn(MIXER_FADER_CLASS, 'min-w-0 flex-1')}
						value={store.score.masterVolume}
						aria-valuetext={`${Math.round(store.score.masterVolume * 100)} percent`}
						onpointerdown={() => store.beginGesture()}
						onpointerup={() => store.endGesture()}
						onpointercancel={() => store.endGesture()}
						oninput={(e) => setMaster(e.currentTarget.valueAsNumber)}
					/>
					<span
						class="text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums"
						title="Master volume">{Math.round(store.score.masterVolume * 100)}%</span
					>
				</div>
				<div class="shrink-0" style="width:{timelineW}px"></div>
			</div>

			<!-- Section markers -->
			<div class="flex">
				<div
					class="bg-background sticky left-0 z-10 flex shrink-0 items-center justify-between gap-2 border-r px-2.5 py-2"
					style="width:{store.isDesktop ? LEAD : LEAD_MOBILE}px"
				>
					<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
						>Sections</span
					>
					<button
						class="text-muted-foreground hover:text-foreground [background-image:none!important] flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]"
						title="Add a section marker at the current bar"
						onclick={() => store.addSection(store.cursor.measure)}
					>
						<MapPin class="size-3.5" /> Add
					</button>
				</div>
				<div
					class="relative shrink-0 py-2"
					style="width:{timelineW}px;min-height:{markerRows * 30 + 8}px"
				>
					{#each laidOutSections as { sec, si, left, row } (sec.id)}
						<div
							class="absolute flex items-center gap-1 rounded-md border bg-card px-1 py-0.5 shadow-sm"
							style="left:{left}px;top:{row * 30 + 4}px"
						>
							<button
								class="bg-primary text-primary-foreground [background-image:none!important] flex size-4 items-center justify-center rounded text-[9px] font-bold"
								title="Jump to this section"
								onclick={() => jumpTo(sec.measure)}
							>
								{String.fromCharCode(65 + (si % 26))}
							</button>
							<input
								class="hover:bg-muted focus:bg-muted w-16 rounded-sm bg-transparent px-1 text-[11px] focus:outline-none"
								value={sec.label}
								onchange={(e) => store.updateSection(sec.id, { label: e.currentTarget.value })}
							/>
							<button
								class="text-muted-foreground hover:text-destructive [background-image:none!important]"
								title="Remove section"
								aria-label="Remove section"
								onclick={() => store.removeSection(sec.id)}
							>
								<X class="size-3" />
							</button>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

{#if !store.isDesktop}
	<TrackControlDrawer bind:open={editOpen} index={editIndex} />
{/if}
