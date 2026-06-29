<script lang="ts">
	// Minimal one-line track header for the score view: a collapse caret, the
	// track colour + name, and a focus toggle. All mixing (mute/solo, volume,
	// pan, EQ) and instrument settings now live in the track mixer drawer,
	// reachable from the menubar — the score stays about the music.

	import { store } from '$lib/stores/score.svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import CaretDown from 'phosphor-svelte/lib/CaretDown';
	import Eye from 'phosphor-svelte/lib/Eye';

	let { index }: { index: number } = $props();
	const track = $derived(store.score.tracks[index]);
	const isActive = $derived(store.cursor.track === index);
	const collapsed = $derived(store.isCollapsed(index));
	const focused = $derived(store.focusedTrackId === track.id);
</script>

<div
	class={cn(
		'flex items-center gap-1.5 border bg-card px-2 py-1.5',
		collapsed ? 'rounded-lg' : 'rounded-t-lg border-b-0',
		isActive && 'ring-1 ring-inset ring-foreground/20'
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
		onfocus={() => {
			store.setCursor({ track: index });
			store.beginGesture();
		}}
		onblur={() => store.endGesture()}
		oninput={(e) => store.updateTrackLive(index, { name: e.currentTarget.value })}
	/>

	<Button
		variant="outline"
		size="icon"
		class={cn('size-7 shrink-0', focused && 'sunk')}
		title={focused ? 'Exit focus' : 'Focus this track'}
		aria-label={focused ? 'Exit focus' : 'Focus this track'}
		aria-pressed={focused}
		onclick={() => (focused ? store.clearFocus() : store.focusTrack(index))}
	>
		<Eye class="size-4" weight={focused ? 'fill' : 'regular'} />
	</Button>
</div>
