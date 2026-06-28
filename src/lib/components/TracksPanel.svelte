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
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import Knob from './Knob.svelte';
	import TrackControlDrawer from './TrackControlDrawer.svelte';
	import type { OtoTrack } from '$lib/oto/types';

	import Plus from 'phosphor-svelte/lib/Plus';
	import Sliders from 'phosphor-svelte/lib/Sliders';
	import X from 'phosphor-svelte/lib/X';
	import MapPin from 'phosphor-svelte/lib/MapPin';
	import MagnifyingGlassPlus from 'phosphor-svelte/lib/MagnifyingGlassPlus';
	import MagnifyingGlassMinus from 'phosphor-svelte/lib/MagnifyingGlassMinus';
	import CaretDown from 'phosphor-svelte/lib/CaretDown';

	// Width of the frozen track-controls column (kept in sync with the markup so
	// the absolute playhead can offset past it).
	const LEAD = 184;

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
		editIndex = store.cursor.track;
		editOpen = true;
	}

	function jumpTo(measure: number, track = store.cursor.track) {
		store.setCursor({ track, measure, beat: 0 });
	}

	// Double tap/click a colored (content-bearing) block in the arrangement to
	// jump there and scroll the main score view to that exact track.
	function gotoSection(i: number, measure: number) {
		const t = tracks[i];
		if (!t || !trackHasContent(t, measure)) return;
		jumpTo(measure, i);
		store.mixerOpen = false;
		store.scrollToTrack(t.id, measure);
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
			gotoSection(i, measure);
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

	// Pan readout for the knob's drag tooltip.
	function panLabel(v: number): string {
		if (Math.abs(v) < 0.02) return 'C';
		const amt = Math.round(Math.abs(v) * 100);
		return `${v < 0 ? 'L' : 'R'}${amt}`;
	}

	function eqActive(t: OtoTrack): boolean {
		return t.eq.low !== 0 || t.eq.mid !== 0 || t.eq.high !== 0;
	}
</script>

<div class="bg-background flex max-h-[55vh] flex-col border-t">
	<div class="flex flex-row items-center justify-between gap-2 border-b px-4 py-3">
		<div class="flex items-center gap-2">
			<Sliders class="size-5" />
			<h2 class="text-foreground text-base font-semibold">Tracks</h2>
			<span class="sr-only">
				Mix levels, panning and EQ for each track, view the arrangement and manage section markers.
			</span>
		</div>
		<div class="flex items-center gap-1.5">
			<div class="mr-1 flex shrink-0 items-stretch">
				<button
					class="text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-md rounded-r-none border disabled:opacity-40"
					title="Zoom out timeline"
					aria-label="Zoom out timeline"
					disabled={cell <= MIN_CELL}
					onclick={() => zoom(-1)}
				>
					<MagnifyingGlassMinus class="size-4" />
				</button>
				<button
					class="text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-md rounded-l-none border border-l-0 disabled:opacity-40"
					title="Zoom in timeline"
					aria-label="Zoom in timeline"
					disabled={cell >= MAX_CELL}
					onclick={() => zoom(1)}
				>
					<MagnifyingGlassPlus class="size-4" />
				</button>
			</div>
			<button
				class="text-muted-foreground hover:text-foreground p-1"
				title="Close tracks panel"
				aria-label="Close tracks panel"
				onclick={() => (store.mixerOpen = false)}
			>
				<X class="size-5" />
			</button>
		</div>
	</div>

	<!-- Scrollable mixer body, both axes. Left column is sticky; timeline scrolls under it. -->
	<div class="min-h-0 flex-1 overflow-auto overscroll-contain">
		<div class="relative w-max min-w-full text-sm">
			<!-- Playback/cursor position. Sits above track content but below the
				     frozen controls column (z-10) so it tucks away when scrolled. -->
			<div
				class="bg-primary pointer-events-none absolute top-0 bottom-0 z-[5] w-px"
				style="left:{LEAD + playheadX}px"
			></div>

			<!-- Measure ruler -->
			<div class="bg-background sticky top-0 z-20 flex border-b">
				<div
					class="bg-background sticky left-0 z-10 flex w-[184px] shrink-0 items-center gap-1.5 border-r px-3 py-1.5"
				>
					<button
						class="text-muted-foreground hover:text-foreground flex shrink-0 items-center"
						title={allRowsOpen ? 'Collapse all tracks' : 'Expand all tracks'}
						aria-label={allRowsOpen ? 'Collapse all tracks' : 'Expand all tracks'}
						onclick={toggleAllRows}
					>
						<CaretDown class={cn('size-3.5 transition-transform', allRowsOpen && 'rotate-180')} />
					</button>
					<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
						>Track</span
					>
					<button
						class="text-muted-foreground hover:text-foreground hover:border-border ml-auto flex size-5 shrink-0 items-center justify-center rounded-sm border border-transparent"
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
				<div class={cn('flex border-b', active && 'bg-muted/40')}>
					<!-- Frozen controls column -->
					<div
						class={cn(
							'bg-background sticky left-0 z-10 flex w-[184px] shrink-0 flex-col gap-1.5 border-r px-2.5 py-2',
							active && 'bg-muted/60'
						)}
						style="border-left:3px solid {track.color}"
					>
						<div class="flex items-center gap-1.5">
							<!-- Name + Mute + Solo as one stuck-together control: the name opens
							     this track's control drawer, M/S sink in when active. -->
							<div class="flex min-w-0 flex-1 items-stretch">
								<button
									class="text-foreground hover:bg-muted flex h-7 min-w-0 flex-1 items-center rounded-md rounded-r-none border bg-transparent px-2 text-[13px] font-semibold"
									title="Track control"
									aria-label={`${track.name} track control`}
									onclick={() => {
										store.setCursor({ track: i });
										editIndex = i;
										editOpen = true;
									}}
								>
									<span class="truncate">{track.name}</span>
								</button>
								<button
									class={cn(
										'flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-l-0 text-[11px] font-bold',
										track.muted
											? 'sunk text-foreground'
											: 'text-muted-foreground hover:text-foreground'
									)}
									title="Mute"
									aria-pressed={track.muted}
									onclick={() => store.toggleMute(i)}>M</button
								>
								<button
									class={cn(
										'flex h-7 w-7 shrink-0 items-center justify-center rounded-md rounded-l-none border border-l-0 text-[11px] font-bold',
										track.soloed
											? 'sunk text-foreground'
											: 'text-muted-foreground hover:text-foreground'
									)}
									title="Solo"
									aria-pressed={track.soloed}
									onclick={() => store.toggleSolo(i)}>S</button
								>
							</div>
							<button
								class="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md"
								title={rowOpen[track.id] ? 'Collapse track controls' : 'Expand track controls'}
								aria-label={rowOpen[track.id] ? 'Collapse track controls' : 'Expand track controls'}
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
								<input
									type="range"
									min="0"
									max="1"
									step="0.01"
									aria-label={`${track.name} volume`}
									title="Volume"
									class="mixer-fader min-w-0 flex-1"
									value={track.volume}
									aria-valuetext={`${Math.round(track.volume * 100)} percent`}
									onpointerdown={() => store.beginGesture()}
									onpointerup={() => store.endGesture()}
									onpointercancel={() => store.endGesture()}
									oninput={(e) => setVolume(i, e.currentTarget.valueAsNumber)}
								/>
								<span
									class="text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums"
									title="Volume">{Math.round(track.volume * 100)}%</span
								>
								<Knob
									value={track.pan}
									min={-1}
									max={1}
									default={0}
									label={`${track.name} pan`}
									format={panLabel}
									onInput={(v) => setPan(i, v)}
									onDragStart={() => store.beginGesture()}
									onDragEnd={() => store.endGesture()}
								/>
								<Popover.Root
									open={!!eqOpen[track.id]}
									onOpenChange={(v) => (eqOpen = { ...eqOpen, [track.id]: v })}
								>
									<Popover.Trigger
										class={cn(
											'flex size-7 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold transition-colors',
											eqActive(track)
												? 'bg-primary text-primary-foreground border-primary'
												: 'text-muted-foreground hover:text-foreground'
										)}
										title="Equaliser"
										aria-label={`${track.name} equaliser`}>EQ</Popover.Trigger
									>
									<Popover.Content side="top" align="end" class="w-56 p-3">
										<div class="mb-2 flex items-center justify-between">
											<span class="text-xs font-semibold">Equaliser</span>
											<button
												class="text-muted-foreground hover:text-foreground text-[11px] underline"
												onclick={() => resetEq(i)}>Reset</button
											>
										</div>
										{#each [['low', 'Low'], ['mid', 'Mid'], ['high', 'High']] as [band, lbl] (band)}
											{@const key = band as 'low' | 'mid' | 'high'}
											<div class="mb-2 grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2">
												<span class="text-muted-foreground text-[11px]">{lbl}</span>
												<input
													type="range"
													min="-12"
													max="12"
													step="0.5"
													class="mixer-fader"
													value={track.eq[key]}
													onpointerdown={() => store.beginGesture()}
													onpointerup={() => store.endGesture()}
													onpointercancel={() => store.endGesture()}
													oninput={(e) => setEqBand(i, key, e.currentTarget.valueAsNumber)}
												/>
												<span class="text-right text-[11px] tabular-nums">
													{track.eq[key] > 0 ? '+' : ''}{track.eq[key]}
												</span>
											</div>
										{/each}
									</Popover.Content>
								</Popover.Root>
							</div>
						{/if}
					</div>

					<!-- Arrangement blocks -->
					<button
						class="relative flex shrink-0 cursor-pointer"
						style="width:{timelineW}px"
						title="Double-tap a section to jump to it in the score"
						onclick={(e) => {
							const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
							jumpTo(Math.min(measureCount - 1, Math.floor(x / cell)), i);
						}}
						ondblclick={(e) => {
							const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
							gotoSection(i, Math.min(measureCount - 1, Math.floor(x / cell)));
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
					class="bg-muted/40 sticky left-0 z-10 flex w-[184px] shrink-0 items-center gap-2 border-r px-2.5 py-2.5"
				>
					<span class="text-foreground shrink-0 text-[13px] font-bold">Master</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						aria-label="Master volume"
						title="Master volume"
						class="mixer-fader min-w-0 flex-1"
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
					class="bg-background sticky left-0 z-10 flex w-[184px] shrink-0 items-center justify-between gap-2 border-r px-2.5 py-2"
				>
					<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
						>Sections</span
					>
					<button
						class="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]"
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
								class="bg-primary text-primary-foreground flex size-4 items-center justify-center rounded text-[9px] font-bold"
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
								class="text-muted-foreground hover:text-destructive"
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

<TrackControlDrawer bind:open={editOpen} index={editIndex} />

<style>
	/* Minimal monochrome fader, consistent with the app's neutral palette. */
	.mixer-fader {
		-webkit-appearance: none;
		appearance: none;
		height: 4px;
		border-radius: 999px;
		background: var(--panel-2);
		cursor: pointer;
		/* Keep a drag on the fader from being stolen by the horizontally
		   scrolling mixer body on touch devices. */
		touch-action: none;
	}
	.mixer-fader::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--ink);
		border: 2px solid var(--paper);
		box-shadow: var(--shadow-1);
	}
	.mixer-fader::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--ink);
		border: 2px solid var(--paper);
	}
</style>
