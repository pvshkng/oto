<script lang="ts">
	// Bars/tracks action list shared by the mobile AddRemoveDrawer and the
	// desktop RightPanel "add-remove" mode. onAfterAction lets the drawer
	// close itself after every action, which the panel doesn't need to do.
	import { store } from '$lib/stores/score.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import Rows from 'phosphor-svelte/lib/Rows';
	import Copy from 'phosphor-svelte/lib/Copy';
	import Trash from 'phosphor-svelte/lib/Trash';
	import MusicNotesPlus from 'phosphor-svelte/lib/MusicNotesPlus';

	let {
		// RightPanel divides the Bars/Tracks groups with a bordered, padded
		// section each (matching its other modes); AddRemoveDrawer just stacks
		// them with a gap.
		sectioned = false,
		onAfterAction,
		onAddTrack,
		onEditTrack
	}: {
		sectioned?: boolean;
		onAfterAction?: () => void;
		onAddTrack: () => void;
		onEditTrack: () => void;
	} = $props();

	const onlyOneBar = $derived(store.track.measures.length <= 1);
	const onlyOneTrack = $derived(store.score.tracks.length <= 1);

	function run(fn: () => void) {
		fn();
		onAfterAction?.();
	}

	const groupClass = 'grid gap-1.5';
	const sectionClass = 'grid gap-1.5 border-b border-border px-3.5 py-3 last:border-b-0';
</script>

<div class={sectioned ? sectionClass : groupClass}>
	<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Bars</span>
	<button
		class={cn(buttonVariants({ variant: 'outline' }), 'justify-start')}
		onclick={() => run(() => store.addMeasureToAll())}
	>
		<Rows class="size-4" /> Add bar at end
	</button>
	<button
		class={cn(buttonVariants({ variant: 'outline' }), 'justify-start')}
		onclick={() => run(() => store.insertMeasureAt(store.cursor.measure))}
	>
		<Rows class="size-4" /> Insert bar at cursor
	</button>
	<button
		class={cn(buttonVariants({ variant: 'outline' }), 'justify-start')}
		onclick={() => run(() => store.duplicateMeasureAt(store.cursor.measure))}
	>
		<Copy class="size-4" /> Duplicate current bar
	</button>
	<button
		class={cn(
			buttonVariants({ variant: 'outline' }),
			'text-destructive hover:bg-destructive/10 hover:text-destructive justify-start'
		)}
		disabled={onlyOneBar}
		onclick={() => run(() => store.removeMeasureFromAll(store.track.measures.length - 1))}
	>
		<Trash class="size-4" /> Remove last bar
	</button>
</div>

<div class={sectioned ? sectionClass : groupClass}>
	<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Tracks</span>
	<button class={cn(buttonVariants({ variant: 'outline' }), 'justify-start')} onclick={onAddTrack}>
		<MusicNotesPlus class="size-4" /> Add track
	</button>
	<button
		class={cn(
			buttonVariants({ variant: 'outline' }),
			'text-destructive hover:bg-destructive/10 hover:text-destructive justify-start'
		)}
		disabled={onlyOneTrack}
		onclick={onEditTrack}
	>
		<Trash class="size-4" /> Remove current track…
	</button>
</div>
