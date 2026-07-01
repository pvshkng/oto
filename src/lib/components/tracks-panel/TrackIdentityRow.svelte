<script lang="ts">
	// Eye (focus) | Name | Mute | Solo button group, identical between the
	// desktop single-row layout and the mobile expandable row — only what
	// happens on the name click differs per host.
	import { store } from '$lib/stores/score.svelte';
	import { cn } from '$lib/utils';
	import type { OtoTrack } from '$lib/oto/types';
	import Eye from 'phosphor-svelte/lib/Eye';

	let {
		track,
		index,
		onNameClick
	}: {
		track: OtoTrack;
		index: number;
		onNameClick: () => void;
	} = $props();
</script>

<div class="flex min-w-0 flex-1 items-stretch">
	<!-- Focus (eye) button — rounded left -->
	<button
		class={cn(
			'flex h-7 w-7 shrink-0 items-center justify-center rounded-l-md rounded-r-none border text-[11px]',
			store.isTrackFocused(index)
				? 'sunk text-foreground'
				: 'text-muted-foreground hover:text-foreground'
		)}
		title={store.isTrackFocused(index)
			? store.trackViewMode === 'multi'
				? 'Remove from view'
				: 'Viewing this track'
			: 'Focus this track'}
		aria-label={store.isTrackFocused(index)
			? store.trackViewMode === 'multi'
				? 'Remove from view'
				: 'Viewing this track'
			: 'Focus this track'}
		aria-pressed={store.isTrackFocused(index)}
		onclick={() => store.toggleFocusTrack(index)}
	>
		<Eye class="size-3.5" weight={store.isTrackFocused(index) ? 'fill' : 'regular'} />
	</button>
	<!-- Track name — no rounding, opens control panel + sets focus -->
	<button
		class="text-foreground hover:bg-muted flex h-7 min-w-0 flex-1 items-center rounded-none border border-l-0 bg-transparent px-2 text-[13px] font-semibold"
		title="Track settings"
		aria-label={`${track.name} settings`}
		onclick={() => {
			if (store.trackViewMode === 'single') store.focusedTrackId = track.id;
			store.setCursor({ track: index });
			onNameClick();
		}}
	>
		<span class="truncate">{track.name}</span>
	</button>
	<!-- Mute -->
	<button
		class={cn(
			'flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-l-0 text-[11px] font-bold',
			track.muted ? 'sunk text-foreground' : 'text-muted-foreground hover:text-foreground'
		)}
		title="Mute"
		aria-pressed={track.muted}
		onclick={() => store.toggleMute(index)}>M</button
	>
	<!-- Solo -->
	<button
		class={cn(
			'flex h-7 w-7 shrink-0 items-center justify-center rounded-r-md rounded-l-none border border-l-0 text-[11px] font-bold',
			track.soloed ? 'sunk text-foreground' : 'text-muted-foreground hover:text-foreground'
		)}
		title="Solo"
		aria-pressed={track.soloed}
		onclick={() => store.toggleSolo(index)}>S</button
	>
</div>
