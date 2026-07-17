<script lang="ts">
	// The tracks panel's sticky top row: the toolbar in the frozen left column
	// (add track, add/remove audio backing track, single/multi view toggle), the
	// measure-number ruler along the timeline, and the zoom magnifiers pinned to
	// the visible right edge.

	import { store } from '$lib/stores/score.svelte';
	import { audioTrack } from '$lib/audio/audio-track.svelte';
	import { cn } from '$lib/utils';
	import * as Popover from '$lib/components/ui/popover';

	import Plus from 'phosphor-svelte/lib/Plus';
	import MusicNotesPlus from 'phosphor-svelte/lib/MusicNotesPlus';
	import MusicNotesMinus from 'phosphor-svelte/lib/MusicNotesMinus';
	import MagnifyingGlassPlus from 'phosphor-svelte/lib/MagnifyingGlassPlus';
	import MagnifyingGlassMinus from 'phosphor-svelte/lib/MagnifyingGlassMinus';
	import Minus from 'phosphor-svelte/lib/Minus';
	import List from 'phosphor-svelte/lib/List';

	// Pixels per measure in the timeline. Adjustable via the zoom control so long
	// songs don't sprawl; the strip scrolls horizontally beyond the panel width.
	const MIN_CELL = 16;
	const MAX_CELL = 96;

	let {
		cell = $bindable(),
		lead,
		timelineW,
		measureCount,
		onAddTrack
	}: {
		/** Pixels per measure — owned by the panel (rows share it), zoomed here. */
		cell: number;
		/** Width of the frozen track-controls column. */
		lead: number;
		timelineW: number;
		measureCount: number;
		onAddTrack: () => void;
	} = $props();

	function zoom(dir: 1 | -1) {
		cell = Math.max(MIN_CELL, Math.min(MAX_CELL, cell + dir * 14));
	}
</script>

<div class="bg-background/50 sticky top-0 z-20 flex border-b backdrop-blur-md">
	<div
		class="bg-background/50 sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r px-3 py-1.5 backdrop-blur-md"
		style="width:{lead}px"
	>
		<!-- Add track (leftmost) -->
		<button
			class="text-muted-foreground hover:text-foreground hover:border-border [background-image:none!important] flex size-6 shrink-0 items-center justify-center rounded-md border"
			title="Add track"
			aria-label="Add track"
			onclick={onAddTrack}
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
	</div>
	<div class="relative shrink-0" style="width:{timelineW}px">
		<div class="flex h-full">
			{#each Array.from({ length: measureCount }, (_, k) => k) as mi (mi)}
				<div
					class="text-muted-foreground flex items-center justify-start py-1.5 pl-1 text-[10px] tabular-nums"
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
		<div class="bg-transparent absolute top-0 right-0 flex h-full items-center px-2 pl-0">
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
