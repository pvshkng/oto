<script lang="ts">
	// Eye (focus) | Name | Mute | Solo | Volume button group, identical between
	// the desktop and mobile rows — only what happens on the name click differs
	// per host. Volume is a compact popover fader joined to the right of Solo.
	import { store } from '$lib/stores/score.svelte';
	import { cn } from '$lib/utils';
	import * as Popover from '$lib/components/ui/popover';
	import { MIXER_FADER_CLASS } from './mixer-fader';
	import type { OtoTrack } from '$lib/oto/types';
	import Eye from 'phosphor-svelte/lib/Eye';
	import SpeakerSimpleHigh from 'phosphor-svelte/lib/SpeakerSimpleHigh';

	let {
		track,
		index,
		onNameClick,
		onToggleMute,
		onToggleSolo,
		onVolume
	}: {
		track: OtoTrack;
		index: number;
		onNameClick: () => void;
		onToggleMute: () => void;
		onToggleSolo: () => void;
		onVolume: (v: number) => void;
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
		onclick={onToggleMute}>M</button
	>
	<!-- Solo -->
	<button
		class={cn(
			'flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-l-0 text-[11px] font-bold',
			track.soloed ? 'sunk text-foreground' : 'text-muted-foreground hover:text-foreground'
		)}
		title="Solo"
		aria-pressed={track.soloed}
		onclick={onToggleSolo}>S</button
	>
	<!-- Volume — rounded right, opens a small popover fader -->
	<Popover.Root>
		<Popover.Trigger
			class="text-muted-foreground hover:text-foreground flex h-7 shrink-0 items-center gap-1 rounded-l-none rounded-r-md border border-l-0 px-1.5 text-[11px] tabular-nums"
			title={`Volume: ${Math.round(track.volume * 100)}%`}
			aria-label={`${track.name} volume`}
		>
			<SpeakerSimpleHigh class="size-3.5" />
			{Math.round(track.volume * 100)}%
		</Popover.Trigger>
		<Popover.Content side="top" align="end" class="w-44 p-1.5">
			<div class="flex items-center gap-2">
				<SpeakerSimpleHigh class="text-muted-foreground size-3.5 shrink-0" />
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					aria-label={`${track.name} volume`}
					title="Volume"
					class={cn(MIXER_FADER_CLASS, 'min-w-0 flex-1')}
					value={track.volume}
					aria-valuetext={`${Math.round(track.volume * 100)} percent`}
					onpointerdown={() => store.beginGesture()}
					onpointerup={() => store.endGesture()}
					onpointercancel={() => store.endGesture()}
					oninput={(e) => onVolume(e.currentTarget.valueAsNumber)}
				/>
				<span class="text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums"
					>{Math.round(track.volume * 100)}%</span
				>
			</div>
		</Popover.Content>
	</Popover.Root>
</div>
