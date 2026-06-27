<script lang="ts">
	// Minimal one-line track header: a collapse caret + name, then mute, solo,
	// focus and the track-control cog. Everything else (notation views, tuning,
	// instrument) lives in the track-control drawer behind the cog.

	import { store } from '$lib/stores/score.svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import TrackControlDrawer from './TrackControlDrawer.svelte';
	import CaretDown from 'phosphor-svelte/lib/CaretDown';
	import Eye from 'phosphor-svelte/lib/Eye';
	import GearSix from 'phosphor-svelte/lib/GearSix';

	let { index }: { index: number } = $props();
	const track = $derived(store.score.tracks[index]);
	const isActive = $derived(store.cursor.track === index);
	const collapsed = $derived(store.isCollapsed(index));
	const focused = $derived(store.focusedTrackId === track.id);

	let editOpen = $state(false);
</script>

<div
	class={cn(
		'flex items-center gap-1.5 border bg-card px-2 py-1.5',
		collapsed ? 'rounded-lg' : 'rounded-t-lg border-b-0',
		isActive && 'ring-1 ring-foreground/15'
	)}
	style="border-left: 3px solid {track.color}"
>
	<button
		class="text-muted-foreground hover:text-foreground flex shrink-0 cursor-pointer items-center"
		title={collapsed ? 'Expand track' : 'Collapse track'}
		aria-label={collapsed ? 'Expand track' : 'Collapse track'}
		onclick={() => store.toggleCollapsed(index)}
	>
		<CaretDown class={cn('size-4 transition-transform', collapsed && '-rotate-90')} />
	</button>

	<span class="size-2.5 shrink-0 rounded-full" style="background:{track.color}"></span>

	<input
		class="text-foreground min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold hover:border-border focus:border-border focus:bg-background focus:outline-none"
		value={track.name}
		onfocus={() => store.setCursor({ track: index })}
		onchange={(e) => store.updateTrack(index, { name: e.currentTarget.value })}
	/>

	<Button
		variant={track.muted ? 'default' : 'outline'}
		size="icon"
		class="size-7 shrink-0 text-xs font-bold"
		title="Mute"
		onclick={() => store.toggleMute(index)}>M</Button
	>
	<Button
		variant={track.soloed ? 'default' : 'outline'}
		size="icon"
		class="size-7 shrink-0 text-xs font-bold"
		title="Solo"
		onclick={() => store.toggleSolo(index)}>S</Button
	>
	<Button
		variant={focused ? 'default' : 'outline'}
		size="icon"
		class="size-7 shrink-0"
		title={focused ? 'Exit focus' : 'Focus this track'}
		aria-label={focused ? 'Exit focus' : 'Focus this track'}
		onclick={() => (focused ? store.clearFocus() : store.focusTrack(index))}
	>
		<Eye class="size-4" weight={focused ? 'fill' : 'regular'} />
	</Button>
	<Button
		variant="ghost"
		size="icon"
		class="size-7 shrink-0"
		title="Track control"
		aria-label="Track control"
		onclick={() => (editOpen = true)}
	>
		<GearSix class="size-4" />
	</Button>
</div>

<TrackControlDrawer bind:open={editOpen} mode="edit" {index} />
