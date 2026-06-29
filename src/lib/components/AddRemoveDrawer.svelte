<script lang="ts">
	// "Add or remove" bottom drawer: every bar/track insertion and deletion
	// action that used to live in the Edit dropdown. A drawer (not a dropdown)
	// so it stays usable on touch/narrow screens.

	import { store } from '$lib/stores/score.svelte';
	import * as Drawer from '$lib/components/ui/drawer';
	import { buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import TrackControlDrawer from './TrackControlDrawer.svelte';

	import Rows from 'phosphor-svelte/lib/Rows';
	import Copy from 'phosphor-svelte/lib/Copy';
	import Trash from 'phosphor-svelte/lib/Trash';
	import MusicNotesPlus from 'phosphor-svelte/lib/MusicNotesPlus';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let trackEditOpen = $state(false);
	let trackEditIndex = $state(-1);

	function addTrack() {
		store.addRemoveOpen = false;
		store.addTrack();
		trackEditIndex = store.cursor.track;
		trackEditOpen = true;
	}
	function editCurrentTrack() {
		store.addRemoveOpen = false;
		trackEditIndex = store.cursor.track;
		trackEditOpen = true;
	}

	const onlyOneBar = $derived(store.track.measures.length <= 1);
	const onlyOneTrack = $derived(store.score.tracks.length <= 1);

	function run(fn: () => void) {
		fn();
		store.addRemoveOpen = false;
	}
</script>

<Drawer.Root bind:open={store.addRemoveOpen} direction="bottom">
	<Drawer.Content class="mx-auto w-full max-w-md rounded-t-2xl border outline-none">
		<Drawer.Header>
			<Drawer.Title>Add or remove</Drawer.Title>
			<Drawer.Description>Insert or delete bars and tracks.</Drawer.Description>
		</Drawer.Header>

		<div class="flex flex-col gap-4 overflow-y-auto p-4 pt-0">
			<div class="grid gap-1.5">
				<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Bars</span
				>
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

			<div class="grid gap-1.5">
				<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
					>Tracks</span
				>
				<button
					class={cn(buttonVariants({ variant: 'outline' }), 'justify-start')}
					onclick={addTrack}
				>
					<MusicNotesPlus class="size-4" /> Add track
				</button>
				<button
					class={cn(
						buttonVariants({ variant: 'outline' }),
						'text-destructive hover:bg-destructive/10 hover:text-destructive justify-start'
					)}
					disabled={onlyOneTrack}
					onclick={editCurrentTrack}
				>
					<Trash class="size-4" /> Remove current track…
				</button>
			</div>
		</div>
	</Drawer.Content>
</Drawer.Root>

<TrackControlDrawer bind:open={trackEditOpen} index={trackEditIndex} />
