<script lang="ts">
	// Name (focus) | [S | M (desktop)] | Controls button group, shared between
	// the desktop and mobile rows — only what happens on the controls click
	// differs per host. The name button toggles track focus (and sinks while
	// focused); its bottom edge doubles as a thin volume gauge in the track's
	// color (dimmed while muted). Desktop gets inline S/M toggle buttons; on
	// mobile those live in the mixer popover instead and tiny "S"/"M" badges on
	// the name button show the state. The sliders button opens the
	// track-control panel; volume is set from the mixer popover on the Master
	// strip.
	import { store } from '$lib/stores/score.svelte';
	import { cn } from '$lib/utils';
	import type { OtoTrack } from '$lib/oto/types';
	import SlidersHorizontal from 'phosphor-svelte/lib/SlidersHorizontal';

	let {
		track,
		index,
		onOpenControl,
		onToggleMute,
		onToggleSolo
	}: {
		track: OtoTrack;
		index: number;
		onOpenControl: () => void;
		onToggleMute: () => void;
		onToggleSolo: () => void;
	} = $props();
</script>

<div class="flex min-w-0 flex-1 items-stretch">
	<!-- Track name — rounded left, toggles focus (sinks while focused). Carries
	     the volume gauge (+ S/M badges on mobile) so the row stays compact. -->
	<button
		class={cn(
			'relative flex h-7 min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-l-md rounded-r-none border px-2 text-[13px] font-semibold',
			store.isTrackFocused(index)
				? 'sunk text-foreground'
				: 'text-foreground hover:bg-muted bg-transparent'
		)}
		title={store.isTrackFocused(index)
			? store.trackViewMode === 'multi'
				? 'Remove from view'
				: 'Viewing this track'
			: 'Focus this track'}
		aria-label={store.isTrackFocused(index)
			? store.trackViewMode === 'multi'
				? `Remove ${track.name} from view`
				: `Viewing ${track.name}`
			: `Focus ${track.name}`}
		aria-pressed={store.isTrackFocused(index)}
		onclick={() => store.toggleFocusTrack(index)}
	>
		<span class="truncate">{track.name}</span>
		{#if !store.isDesktop && (track.soloed || track.muted)}
			<span
				class="pointer-events-none ml-auto flex shrink-0 gap-0.5 text-[8px] leading-none font-bold"
			>
				{#if track.soloed}<span class="text-primary">S</span>{/if}
				{#if track.muted}<span class="text-destructive">M</span>{/if}
			</span>
		{/if}
		<!-- Volume gauge — thin strip along the bottom edge, width = volume % -->
		<span
			class={cn('pointer-events-none absolute bottom-0 left-0 h-0.5', track.muted && 'opacity-30')}
			style="width:{Math.round(track.volume * 100)}%;background:{track.color}"
		></span>
	</button>
	{#if store.isDesktop}
		<!-- Inline S/M toggles (desktop only) — sink while active -->
		<button
			class={cn(
				'flex h-7 w-6 shrink-0 items-center justify-center rounded-none border border-l-0 text-[10px] font-bold [background-image:none!important]',
				track.soloed ? 'sunk text-foreground' : 'text-muted-foreground hover:text-foreground'
			)}
			title="Solo"
			aria-label={`Solo ${track.name}`}
			aria-pressed={track.soloed}
			onclick={onToggleSolo}>S</button
		>
		<button
			class={cn(
				'flex h-7 w-6 shrink-0 items-center justify-center rounded-none border border-l-0 text-[10px] font-bold [background-image:none!important]',
				track.muted ? 'sunk text-foreground' : 'text-muted-foreground hover:text-foreground'
			)}
			title="Mute"
			aria-label={`Mute ${track.name}`}
			aria-pressed={track.muted}
			onclick={onToggleMute}>M</button
		>
	{/if}
	<!-- Track control panel — rounded right -->
	<button
		class="text-muted-foreground hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-l-none rounded-r-md border border-l-0"
		title="Track settings"
		aria-label={`${track.name} settings`}
		onclick={() => {
			store.setCursor({ track: index });
			onOpenControl();
		}}
	>
		<SlidersHorizontal class="size-3.5" />
	</button>
</div>
