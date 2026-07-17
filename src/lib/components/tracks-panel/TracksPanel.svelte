<script lang="ts">
	// Tracks panel. A bottom-docked panel (toggled from the menubar, mutually
	// exclusive with the note editor's keypad/fretboard dock) that gathers every
	// per-track mixing control in one place: a frozen track-list column on the
	// left (name, mute/solo, volume) and a scrollable arrangement timeline on
	// the right, with a Master strip and section markers underneath. All edits
	// apply immediately.
	//
	// This file owns the track rows (reorder drag, arrangement blocks, column
	// resize); the sticky ruler/toolbar row lives in TimelineHeader and the
	// bottom mixer + section-marker strip in SectionMarkerStrip.

	import { store } from '$lib/stores/score.svelte';
	import { analyzeMeasure } from '$lib/oto/duration';
	import { cn } from '$lib/utils';
	import { windowPointerDrag } from '$lib/pointer-drag';
	import TrackControlDrawer from '$lib/components/panels/TrackControlDrawer.svelte';
	import TrackIdentityRow from './TrackIdentityRow.svelte';
	import AudioTrackRow from './AudioTrackRow.svelte';
	import TimelineHeader from './TimelineHeader.svelte';
	import SectionMarkerStrip from './SectionMarkerStrip.svelte';
	import { toggleMute, toggleSolo, jumpToBar } from './mixer-actions';
	import type { OtoTrack } from '$lib/oto/types';

	import DotsSixVertical from 'phosphor-svelte/lib/DotsSixVertical';

	// Width of the frozen track-controls column. Desktop: draggable 350–520 px.
	// Mobile: fixed, narrow enough to leave more room for the timeline.
	const LEAD_MOBILE = 180;
	const MIN_DESKTOP_LEAD = 230;
	let LEAD = $state(MIN_DESKTOP_LEAD);
	const lead = $derived(store.isDesktop ? LEAD : LEAD_MOBILE);

	function startColumnResize(e: PointerEvent) {
		if (!store.isDesktop) return;
		e.preventDefault();
		const startX = e.clientX;
		const startW = LEAD;
		windowPointerDrag((ev) => {
			LEAD = Math.max(MIN_DESKTOP_LEAD, Math.min(520, startW + ev.clientX - startX));
		});
	}

	// Pixels per measure in the timeline (zoomed via TimelineHeader's control).
	let cell = $state(30);

	const tracks = $derived(store.score.tracks);
	const measureCount = $derived(Math.max(1, ...tracks.map((t) => t.measures.length)));
	const timelineW = $derived(measureCount * cell);

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
			store.trackControlIndex = store.cursor.track;
			store.openPanel('track');
		} else {
			editIndex = store.cursor.track;
			editOpen = true;
		}
	}

	// Select all beats in one bar of a given track, revealing it first so the
	// selection is somewhere the user can actually see.
	function selectBar(trackIdx: number, measure: number) {
		const t = tracks[trackIdx];
		if (!t) return;
		const lastBeat = Math.max(0, (t.measures[measure]?.beats.length ?? 1) - 1);
		store.goToBar(trackIdx, measure);
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

	// Drag-to-reorder tracks via the dots handle at the head of each row. While
	// dragging, `dropAt` is the insertion index in the full track array (hidden
	// tracks keep their slots); a primary-coloured line marks the gap it maps to.
	let rowEls: Record<number, HTMLDivElement | null> = {};
	let dragFrom = $state(-1);
	let dropAt = $state(-1);
	const dropIndicatorAt = $derived(
		dragFrom !== -1 && dropAt !== dragFrom && dropAt !== dragFrom + 1 ? dropAt : -1
	);
	const lastVisibleIndex = $derived.by(() => {
		let last = -1;
		tracks.forEach((t, i) => {
			if (!store.isTrackHidden(t.id)) last = i;
		});
		return last;
	});

	function startRowDrag(e: PointerEvent, from: number) {
		e.preventDefault();
		dragFrom = from;
		dropAt = from;
		windowPointerDrag(
			(ev) => {
				const rows = Object.entries(rowEls)
					.filter(([, el]) => el?.isConnected)
					.map(([k, el]) => ({ index: +k, rect: el!.getBoundingClientRect() }))
					.sort((a, b) => a.rect.top - b.rect.top);
				if (!rows.length) return;
				// Insert before the first visible row whose midpoint the pointer is
				// above; past the last row means "after the end".
				let target = rows[rows.length - 1].index + 1;
				for (const r of rows) {
					if (ev.clientY < r.rect.top + r.rect.height / 2) {
						target = r.index;
						break;
					}
				}
				dropAt = target;
			},
			() => {
				if (dropAt !== -1 && dropAt !== dragFrom && dropAt !== dragFrom + 1) {
					store.moveTrack(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt);
				}
				dragFrom = -1;
				dropAt = -1;
			}
		);
	}
</script>

<div
	class={cn(
		'bg-background/50 flex flex-col backdrop-blur-md',
		store.isDesktop ? 'max-h-[300px]' : 'max-h-[55vh]'
	)}
>
	<!-- Scrollable mixer body, both axes. Left column is sticky; timeline scrolls
	     under it. Header removed — close via the menubar Tracks button. Capped at
	     300px (desktop), scrolls vertically beyond that. -->
	<div class="min-h-0 flex-1 overflow-auto overscroll-contain">
		<div class="relative w-max min-w-full text-sm">
			<!-- Playback/cursor position. Sits above track content but below the
				     frozen controls column (z-10) so it tucks away when scrolled. -->
			<div
				class="bg-primary pointer-events-none absolute top-0 bottom-0 z-[5] w-px"
				style="left:{lead + playheadX}px"
			></div>

			<TimelineHeader bind:cell {lead} {timelineW} {measureCount} onAddTrack={addTrack} />

			<!-- Audio backing track — pinned above every MIDI track -->
			{#if store.hasAudio}
				<AudioTrackRow {lead} {timelineW} {cell} />
			{/if}

			<!-- One row per track. Hidden tracks are removed from the panel entirely;
			     the eye-closed counter next to the Master volume lists them so they
			     can be brought back. -->
			{#each tracks as track, i (track.id)}
				{#if !store.isTrackHidden(track.id)}
					{@const active = store.cursor.track === i}
					<div
						bind:this={rowEls[i]}
						class={cn(
							'relative flex border-b',
							active && 'bg-muted/40',
							dragFrom === i && 'opacity-50',
							dropIndicatorAt === i && 'shadow-[inset_0_2px_0_0_var(--primary)]',
							i === lastVisibleIndex &&
								dropIndicatorAt > i &&
								'shadow-[inset_0_-2px_0_0_var(--primary)]'
						)}
					>
						<!-- Frozen controls column -->
						<div
							class="bg-background/50 sticky left-0 z-10 flex shrink-0 flex-col gap-1.5 border-r py-2 pr-2.5 pl-1 backdrop-blur-md"
							style="width:{lead}px;"
						>
							<!-- Single row — Drag | Name | Controls | Mute | Vol -->
							<div class="flex items-center gap-1">
								<button
									class="text-muted-foreground hover:text-foreground flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center [background-image:none!important]"
									title="Drag to reorder"
									aria-label={`Reorder ${track.name}`}
									onpointerdown={(e) => startRowDrag(e, i)}
								>
									<DotsSixVertical class="size-3.5" />
								</button>
								<TrackIdentityRow
									{track}
									index={i}
									onOpenControl={() => {
										if (store.isDesktop) {
											store.trackControlIndex = i;
											store.openPanel('track');
										} else {
											editIndex = i;
											editOpen = true;
										}
									}}
									onToggleMute={() => toggleMute(i)}
									onToggleSolo={() => toggleSolo(i)}
								/>
							</div>
						</div>

						<!-- Column resize handle (desktop only) — positioned at the column border -->
						{#if store.isDesktop}
							<div
								class="absolute inset-y-0 z-[15] w-2 cursor-col-resize bg-transparent hover:bg-[color-mix(in_srgb,var(--primary)_20%,transparent)]"
								style="left:{LEAD - 4}px"
								onpointerdown={startColumnResize}
								title="Drag to resize track controls"
								role="separator"
								aria-orientation="vertical"
								aria-label="Resize track controls column"
							></div>
						{/if}

						<!-- Arrangement blocks -->
						<button
							class="relative flex shrink-0 cursor-pointer [background-image:none!important]"
							style="width:{timelineW}px"
							title="Click to jump to this bar · Shift-click to select bar range · Double-click to select entire bar"
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
									// Clicking any track's bar switches the score view to that
									// track and scrolls it to the bar — including a track that
									// wasn't the focused one. Mid-playback it also moves the
									// playback there.
									jumpToBar(i, measure);
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
				{/if}
			{/each}

			<SectionMarkerStrip {lead} {timelineW} {cell} {measureCount} />
		</div>
	</div>
</div>

{#if !store.isDesktop}
	<TrackControlDrawer bind:open={editOpen} index={editIndex} />
{/if}
