<script lang="ts">
	// The tracks panel's bottom strip. The frozen left cell holds the mixer
	// popover (per-track faders + master), the hidden-track counter and the
	// add-marker button; the timeline side shows the section markers, each a
	// small letter chip opening a rename/remove popover.

	import { store } from '$lib/stores/score.svelte';
	import { sectionLetterAt } from '$lib/oto/sections';
	import { cn } from '$lib/utils';
	import * as Popover from '$lib/components/ui/popover';
	import { MIXER_FADER_CLASS } from './mixer-fader';
	import {
		setTrackVolume,
		setMasterVolume,
		toggleMute,
		toggleSolo,
		jumpToBar
	} from './mixer-actions';

	import X from 'phosphor-svelte/lib/X';
	import MapPin from 'phosphor-svelte/lib/MapPin';
	import SpeakerSimpleHigh from 'phosphor-svelte/lib/SpeakerSimpleHigh';
	import EyeClosed from 'phosphor-svelte/lib/EyeClosed';

	let {
		lead,
		timelineW,
		cell,
		measureCount
	}: {
		/** Width of the frozen track-controls column. */
		lead: number;
		timelineW: number;
		/** Pixels per measure in the timeline. */
		cell: number;
		measureCount: number;
	} = $props();

	const tracks = $derived(store.score.tracks);
	const hiddenTracks = $derived(tracks.filter((t) => store.isTrackHidden(t.id)));
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

	// Deleting a section is cheap to undo (Ctrl+Z), but a stray tap on the tiny
	// X next to the letter chip is easy to fire by accident, so confirm first.
	function confirmRemoveSection(sec: { id: string; label: string }) {
		const name = sec.label ? `"${sec.label}"` : 'this section';
		if (confirm(`Remove ${name}?`)) store.removeSection(sec.id);
	}
</script>

<div class="flex">
	<div
		class="bg-background/50 sticky left-0 z-10 flex shrink-0 items-center justify-between gap-2 border-r px-2.5 py-1 backdrop-blur-md"
		style="width:{lead}px"
	>
		<!-- Mixer: compact speaker button + master readout, opens a popover with
		     one fader + M/S row per track (scrollable) and the master fader
		     pinned at the bottom. Per-row volume shows in the identity row as a
		     thin gauge, so no numeric % per track here. -->
		<div class="flex min-w-0 items-center gap-1.5">
			<Popover.Root>
				<Popover.Trigger
					class="text-muted-foreground hover:text-foreground [background-image:none!important] flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums"
					title="Mixer & master volume"
					aria-label="Mixer & master volume"
				>
					<SpeakerSimpleHigh class="size-3.5" />
					{Math.round(store.score.masterVolume * 100)}%
				</Popover.Trigger>
				<Popover.Content side="top" align="start" class="w-72 p-1.5">
					<div class="max-h-56 space-y-1.5 overflow-y-auto py-0.5">
						{#each tracks as t, i (t.id)}
							<div class="flex items-center gap-1.5 px-1">
								<span class="size-2.5 shrink-0 rounded-full" style="background:{t.color}"></span>
								<span
									class="text-muted-foreground w-16 shrink-0 truncate text-[11px]"
									title={t.name}>{t.name}</span
								>
								<input
									type="range"
									min="0"
									max="1"
									step="0.01"
									aria-label={`${t.name} volume`}
									title={`Volume: ${Math.round(t.volume * 100)}%`}
									class={cn(MIXER_FADER_CLASS, 'min-w-0 flex-1')}
									value={t.volume}
									aria-valuetext={`${Math.round(t.volume * 100)} percent`}
									onpointerdown={() => store.beginGesture()}
									onpointerup={() => store.endGesture()}
									onpointercancel={() => store.endGesture()}
									oninput={(e) => setTrackVolume(i, e.currentTarget.valueAsNumber)}
								/>
								<div class="flex shrink-0 items-stretch">
									<button
										class={cn(
											'flex h-5 w-5 items-center justify-center rounded-l-md rounded-r-none border text-[10px] font-bold [background-image:none!important]',
											t.muted
												? 'sunk text-foreground'
												: 'text-muted-foreground hover:text-foreground'
										)}
										title="Mute"
										aria-label={`Mute ${t.name}`}
										aria-pressed={t.muted}
										onclick={() => toggleMute(i)}>M</button
									>
									<button
										class={cn(
											'flex h-5 w-5 items-center justify-center rounded-l-none rounded-r-md border border-l-0 text-[10px] font-bold [background-image:none!important]',
											t.soloed
												? 'sunk text-foreground'
												: 'text-muted-foreground hover:text-foreground'
										)}
										title="Solo"
										aria-label={`Solo ${t.name}`}
										aria-pressed={t.soloed}
										onclick={() => toggleSolo(i)}>S</button
									>
								</div>
							</div>
						{/each}
					</div>
					<div class="mt-1.5 flex items-center gap-1.5 border-t px-1 pt-1.5">
						<SpeakerSimpleHigh class="text-muted-foreground size-3.5 shrink-0" />
						<span class="text-muted-foreground w-16 shrink-0 truncate text-[11px]">Master</span>
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
							oninput={(e) => setMasterVolume(e.currentTarget.valueAsNumber)}
						/>
						<span class="text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums"
							>{Math.round(store.score.masterVolume * 100)}%</span
						>
					</div>
				</Popover.Content>
			</Popover.Root>
			<!-- Hidden-track counter: only shown when tracks are hidden. Opens a
			     popover listing them so they can be shown again (the rows
			     themselves are gone from the panel while hidden). -->
			{#if hiddenTracks.length > 0}
				<Popover.Root>
					<Popover.Trigger
						class="text-muted-foreground hover:text-foreground [background-image:none!important] flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums"
						title={`${hiddenTracks.length} hidden track${hiddenTracks.length === 1 ? '' : 's'}`}
						aria-label={`${hiddenTracks.length} hidden track${hiddenTracks.length === 1 ? '' : 's'}`}
					>
						<EyeClosed class="size-3.5" />
						{hiddenTracks.length}
					</Popover.Trigger>
					<Popover.Content side="top" align="start" class="w-56 p-1.5">
						<p
							class="text-muted-foreground px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-wide uppercase"
						>
							Hidden tracks
						</p>
						<div class="max-h-56 overflow-y-auto">
							{#each hiddenTracks as t (t.id)}
								<button
									class="hover:bg-muted [background-image:none!important] flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]"
									title={`Show ${t.name}`}
									onclick={() => store.setTrackVisible(t.id, true)}
								>
									<span class="size-2.5 shrink-0 rounded-full" style="background:{t.color}"></span>
									<span class="text-muted-foreground min-w-0 flex-1 truncate">{t.name}</span>
									<EyeClosed class="size-3.5 shrink-0" />
								</button>
							{/each}
						</div>
					</Popover.Content>
				</Popover.Root>
			{/if}
		</div>
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
								onclick={() => jumpToBar(store.cursor.track, sec.measure)}
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
								onchange={(e) => store.updateSection(sec.id, { label: e.currentTarget.value })}
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
