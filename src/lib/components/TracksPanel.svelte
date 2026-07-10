<script lang="ts">
	// Tracks panel. A bottom-docked panel (toggled from the menubar, mutually
	// exclusive with the note editor's keypad/fretboard dock) that gathers every
	// per-track mixing control in one place: a frozen track-list column on the
	// left (name, mute/solo, volume) and a scrollable arrangement timeline on
	// the right, with a Master strip and section markers underneath. All edits
	// apply immediately.

	import { store } from '$lib/stores/score.svelte';
	import { audio } from '$lib/audio/engine';
	import { audioTrack } from '$lib/audio/audio-track.svelte';
	import { analyzeMeasure } from '$lib/oto/duration';
	import { sectionLetterAt } from '$lib/oto/sections';
	import { cn } from '$lib/utils';
	import TrackControlDrawer from './TrackControlDrawer.svelte';
	import TrackIdentityRow from './tracks-panel/TrackIdentityRow.svelte';
	import AudioTrackRow from './tracks-panel/AudioTrackRow.svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { MIXER_FADER_CLASS } from './tracks-panel/mixer-fader';
	import type { OtoTrack } from '$lib/oto/types';

	import Plus from 'phosphor-svelte/lib/Plus';
	import MusicNotesPlus from 'phosphor-svelte/lib/MusicNotesPlus';
	import MusicNotesMinus from 'phosphor-svelte/lib/MusicNotesMinus';
	import X from 'phosphor-svelte/lib/X';
	import MapPin from 'phosphor-svelte/lib/MapPin';
	import MagnifyingGlassPlus from 'phosphor-svelte/lib/MagnifyingGlassPlus';
	import MagnifyingGlassMinus from 'phosphor-svelte/lib/MagnifyingGlassMinus';
	import Minus from 'phosphor-svelte/lib/Minus';
	import List from 'phosphor-svelte/lib/List';
	import ListStar from 'phosphor-svelte/lib/ListStar';
	import Check from 'phosphor-svelte/lib/Check';
	import SpeakerSimpleHigh from 'phosphor-svelte/lib/SpeakerSimpleHigh';

	// Width of the frozen track-controls column. Desktop: draggable 350–520 px.
	// Mobile: fixed, narrow enough to leave more room for the timeline.
	const LEAD_MOBILE = 230;
	let MIN_DESKTOP_LEAD = 280;
	let LEAD = $state(MIN_DESKTOP_LEAD);

	function startColumnResize(e: PointerEvent) {
		if (!store.isDesktop) return;
		e.preventDefault();
		const startX = e.clientX;
		const startW = LEAD;
		function onMove(ev: PointerEvent) {
			LEAD = Math.max(MIN_DESKTOP_LEAD, Math.min(520, startW + ev.clientX - startX));
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

	// Section markers are absolutely positioned by measure and always stay on a
	// single row (never stack). Each marker is a small letter chip — click it to
	// open a popover with the (optional) name — so neighbors never overlap or
	// wrap to a new row regardless of how close together sections are.
	const MARKER_COMPACT_W = 26;
	const MARKER_GAP = 4;
	const laidOutSections = $derived.by(() => {
		let cursor = -Infinity;
		return sections.map((sec, si) => {
			const preferredLeft = Math.min(sec.measure, measureCount - 1) * cell;
			const left = Math.max(preferredLeft, cursor);
			cursor = left + MARKER_COMPACT_W + MARKER_GAP;
			return { sec, si, left };
		});
	});

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

	function jumpTo(measure: number, track = store.cursor.track) {
		store.setCursor({ track, measure, beat: 0 });
	}

	// Deleting a section is cheap to undo (Ctrl+Z), but a stray tap on the tiny
	// X next to the letter chip is easy to fire by accident, so confirm first.
	function confirmRemoveSection(sec: { id: string; label: string }) {
		const name = sec.label ? `"${sec.label}"` : 'this section';
		if (confirm(`Remove ${name}?`)) store.removeSection(sec.id);
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
	function setMaster(v: number) {
		store.setMasterVolume(v);
		audio.setMasterVolume(v); // live while playing
	}
	function toggleMute(i: number) {
		store.toggleMute(i);
		// Solo/mute change every track's effective gain, so re-sync all of them.
		audio.syncAllTracks(tracks);
		audioTrack.applyGain();
	}
	function toggleSolo(i: number) {
		store.toggleSolo(i);
		audio.syncAllTracks(tracks);
		// A MIDI solo also silences the audio track (unless it too is soloed).
		audioTrack.applyGain();
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
				style="left:{(store.isDesktop ? LEAD : LEAD_MOBILE) + playheadX}px"
			></div>

			<!-- Measure ruler -->
			<div class="bg-background/50 sticky top-0 z-20 flex border-b backdrop-blur-md">
				<div
					class="bg-background/50 sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r px-3 py-1.5 backdrop-blur-md"
					style="width:{store.isDesktop ? LEAD : LEAD_MOBILE}px"
				>
					<!-- Add track (leftmost) -->
					<button
						class="text-muted-foreground hover:text-foreground hover:border-border [background-image:none!important] flex size-6 shrink-0 items-center justify-center rounded-md border"
						title="Add track"
						aria-label="Add track"
						onclick={addTrack}
					>
						<Plus class="size-3.5" />
					</button>
					<!-- Add / remove audio backing track. Only ever one; when present the
					     button flips to a remove action guarded by a confirm popover. -->
					{#if store.hasAudio}
						<Popover.Root>
							<Popover.Trigger
								class="text-muted-foreground hover:text-foreground hover:border-border [background-image:none!important] flex size-6 shrink-0 items-center justify-center rounded-md border"
								title="Remove audio backing track"
								aria-label="Remove audio backing track"
							>
								<MusicNotesMinus class="size-3.5" />
							</Popover.Trigger>
							<Popover.Content side="top" align="start" class="w-56 space-y-2 p-3 text-[12px]">
								<p class="font-medium">Remove the audio backing track?</p>
								<p class="text-muted-foreground text-[11px] leading-snug">
									The saved tempo, position and pitch settings are cleared too.
								</p>
								<div class="flex justify-end gap-2 pt-1">
									<Popover.Close
										class="hover:bg-muted rounded-md border px-2 py-1 [background-image:none!important]"
										>Cancel</Popover.Close
									>
									<Popover.Close
										class="bg-destructive text-destructive-foreground rounded-md px-2 py-1 [background-image:none!important]"
										onclick={() => audioTrack.remove()}>Remove</Popover.Close
									>
								</div>
							</Popover.Content>
						</Popover.Root>
					{:else}
						<button
							class="text-muted-foreground hover:text-foreground hover:border-border [background-image:none!important] flex size-6 shrink-0 items-center justify-center rounded-md border"
							title="Add audio backing track"
							aria-label="Add audio backing track"
							onclick={() => audioTrack.promptImport()}
						>
							<MusicNotesPlus class="size-3.5" />
						</button>
					{/if}
					<!-- Single / Multi track view toggle -->
					<div class="flex shrink-0 items-stretch">
						<button
							class={cn(
								'flex size-6 items-center justify-center rounded-l-md rounded-r-none border text-[11px] [background-image:none!important]',
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
								'flex size-6 items-center justify-center rounded-l-none rounded-r-md border border-l-0 text-[11px] [background-image:none!important]',
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
					<!-- Show/hide tracks: popover listing every track with a visibility
					     toggle, so a busy song can be narrowed to just the tracks being
					     worked on. Scrolls vertically when the track list is long. -->
					<Popover.Root>
						<Popover.Trigger
							class="text-muted-foreground hover:text-foreground hover:border-border [background-image:none!important] flex size-6 shrink-0 items-center justify-center rounded-md border"
							title="Show / hide tracks"
							aria-label="Show or hide tracks"
						>
							<ListStar class="size-3.5" />
						</Popover.Trigger>
						<Popover.Content side="bottom" align="start" class="w-56 p-1.5">
							<p
								class="text-muted-foreground px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-wide uppercase"
							>
								Visible tracks
							</p>
							<div class="max-h-56 overflow-y-auto">
								{#each tracks as t (t.id)}
									{@const visible = !store.isTrackHidden(t.id)}
									<button
										class="hover:bg-muted [background-image:none!important] flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]"
										aria-pressed={visible}
										title={visible ? `Hide ${t.name}` : `Show ${t.name}`}
										onclick={() => store.setTrackVisible(t.id, !visible)}
									>
										<span class="size-2.5 shrink-0 rounded-full" style="background:{t.color}"
										></span>
										<span class={cn('min-w-0 flex-1 truncate', !visible && 'text-muted-foreground')}
											>{t.name}</span
										>
										{#if visible}
											<Check class="size-3.5 shrink-0" />
										{:else}
											<span class="size-3.5 shrink-0"></span>
										{/if}
									</button>
								{/each}
							</div>
						</Popover.Content>
					</Popover.Root>
				</div>
				<div class="relative shrink-0" style="width:{timelineW}px">
					<div class="flex h-full">
						{#each Array.from({ length: measureCount }, (_, k) => k) as mi (mi)}
							<div
								class={cn(
									'text-muted-foreground flex items-center justify-start py-1.5 pl-1 text-[10px] tabular-nums',
									(mi + 1) % 4 === 0 ? '' : ''
								)}
								style="width:{cell}px"
							>
								{#if mi === 0 || mi % 4 === 0}{mi + 1}{/if}
							</div>
						{/each}
					</div>
				</div>
				<!-- Timeline zoom (magnifiers): a zero-width anchor with the controls
				     overlaid leftward from it. `ml-auto` pushes it to the end of the bar
				     section when the timeline is narrower than the panel; `sticky right-0`
				     keeps it pinned to the visible right edge once the timeline overflows
				     and scrolls. Either way the magnifiers stay at the end, and being
				     zero-width they never widen the timeline (track rows stay aligned). -->
				<div class="sticky right-0 z-20 ml-auto w-0 shrink-0 self-stretch">
					<div class="bg-transparent absolute top-0 right-0 flex h-full items-center pl-0 px-2">
						<div class="flex shrink-0 items-stretch">
							<button
								class={cn(
									'bg-background flex size-6 items-center justify-center rounded-l-md rounded-r-none border [background-image:none!important]',
									cell <= MIN_CELL ? 'sunk' : 'text-muted-foreground hover:text-foreground'
								)}
								title="Zoom out timeline"
								aria-label="Zoom out timeline"
								disabled={cell <= MIN_CELL}
								onclick={() => zoom(-1)}
							>
								<MagnifyingGlassMinus class="size-3.5" />
							</button>
							<button
								class={cn(
									'bg-background flex size-6 items-center justify-center rounded-l-none rounded-r-md border border-l-0 [background-image:none!important]',
									cell >= MAX_CELL ? 'sunk' : 'text-muted-foreground hover:text-foreground'
								)}
								title="Zoom in timeline"
								aria-label="Zoom in timeline"
								disabled={cell >= MAX_CELL}
								onclick={() => zoom(1)}
							>
								<MagnifyingGlassPlus class="size-3.5" />
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- Audio backing track — pinned above every MIDI track -->
			{#if store.hasAudio}
				<AudioTrackRow lead={store.isDesktop ? LEAD : LEAD_MOBILE} {timelineW} {cell} />
			{/if}

			<!-- One row per track. Tracks hidden via the visibility popover are
			     removed from the panel entirely (toggle them back from that popover). -->
			{#each tracks as track, i (track.id)}
				{#if !store.isTrackHidden(track.id)}
					{@const active = store.cursor.track === i}
					<div class={cn('relative flex border-b', active && 'bg-muted/40')}>
						<!-- Frozen controls column -->
						<div
							class="bg-background/50 sticky left-0 z-10 flex shrink-0 flex-col gap-1.5 border-r px-2.5 py-2 backdrop-blur-md"
							style="width:{store.isDesktop
								? LEAD
								: LEAD_MOBILE}px;border-left:3px solid {track.color}"
						>
							<!-- Single row — Eye | Name | M | S | Vol -->
							<div class="flex items-center gap-2">
								<TrackIdentityRow
									{track}
									index={i}
									onNameClick={() => {
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
									onVolume={(v) => setVolume(i, v)}
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
				{/if}
			{/each}

			<!-- Section markers -->
			<div class="flex">
				<div
					class="bg-background/50 sticky left-0 z-10 flex shrink-0 items-center justify-between gap-2 border-r px-2.5 py-1 backdrop-blur-md"
					style="width:{store.isDesktop ? LEAD : LEAD_MOBILE}px"
				>
					<!-- Master volume: compact speaker button + readout, opens a small
					     popover fader (mirrors the section-marker popover style). -->
					<Popover.Root>
						<Popover.Trigger
							class="text-muted-foreground hover:text-foreground [background-image:none!important] flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums"
							title="Master volume"
							aria-label="Master volume"
						>
							<SpeakerSimpleHigh class="size-3.5" />
							{Math.round(store.score.masterVolume * 100)}%
						</Popover.Trigger>
						<Popover.Content side="top" align="start" class="w-44 p-1.5">
							<div class="flex items-center gap-2">
								<SpeakerSimpleHigh class="text-muted-foreground size-3.5 shrink-0" />
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
								<span class="text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums"
									>{Math.round(store.score.masterVolume * 100)}%</span
								>
							</div>
						</Popover.Content>
					</Popover.Root>
					<button
						class="text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [background-image:none!important] flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
						title={store.canAddSection
							? 'Add a section marker at the current bar'
							: 'Section limit reached (A–Z, 26 max)'}
						disabled={!store.canAddSection}
						onclick={() => store.addSection(store.cursor.measure)}
					>
						<MapPin class="size-3.5" /> Marker
					</button>
				</div>
				<div class="relative shrink-0 py-2" style="width:{timelineW}px;min-height:34px">
					{#each laidOutSections as { sec, si, left } (sec.id)}
						{@const letter = sectionLetterAt(si)}
						<div class="absolute top-1/2 -translate-y-1/2" style="left:{left}px">
							<Popover.Root>
								<Popover.Trigger
									class="bg-primary text-primary-foreground [background-image:none!important] flex size-5 items-center justify-center rounded text-[9px] font-bold shadow-sm"
									title={sec.label ? `Edit "${sec.label}"` : 'Edit section name'}
									aria-label={`Edit section ${letter}${sec.label ? ': ' + sec.label : ''}`}
								>
									{letter}
								</Popover.Trigger>
								<Popover.Content side="top" align="start" class="w-44 p-1.5">
									<div class="flex items-center gap-1">
										<button
											class="bg-primary text-primary-foreground [background-image:none!important] flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold"
											title="Jump to this section"
											onclick={() => jumpTo(sec.measure)}
										>
											{letter}
										</button>
										<input
											class="hover:bg-muted focus:bg-muted w-full min-w-0 flex-1 rounded-sm bg-transparent px-1 text-[11px] focus:outline-none"
											value={sec.label}
											placeholder=""
											onfocus={(e) => e.currentTarget.select()}
											onkeydown={(e) => {
												if (e.key === 'Enter') e.currentTarget.blur();
											}}
											onchange={(e) =>
												store.updateSection(sec.id, { label: e.currentTarget.value })}
										/>
										<button
											class="text-muted-foreground hover:text-destructive [background-image:none!important] shrink-0"
											title="Remove section"
											aria-label="Remove section"
											onclick={() => confirmRemoveSection(sec)}
										>
											<X class="size-3" />
										</button>
									</div>
								</Popover.Content>
							</Popover.Root>
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
