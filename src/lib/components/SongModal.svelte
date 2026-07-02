<script lang="ts">
	// Song configuration: title, composer, tempo and the starting time signature.
	// A bottom drawer (consistent with the rest of the app's mobile-first sheets),
	// opened from the bottom bar cog or the score title. Desktop shows the same
	// fields inline in RightPanel's "song" mode instead (see RightPanel.svelte);
	// this component is only mounted on mobile.
	import { store } from '$lib/stores/score.svelte';
	import * as Drawer from '$lib/components/ui/drawer';
	import { buttonVariants } from '$lib/components/ui/button';
	import SongDetailsFields from './SongDetailsFields.svelte';
</script>

<Drawer.Root bind:open={store.songModalOpen} direction="bottom">
	<Drawer.Content class="mx-auto w-full max-w-md rounded-t-2xl border outline-none">
		<Drawer.Header>
			<Drawer.Title>Song details</Drawer.Title>
			<Drawer.Description>Title, composer, tempo and starting time signature.</Drawer.Description>
		</Drawer.Header>

		<div class="grid gap-4 overflow-y-auto p-4 pt-0">
			<SongDetailsFields />
		</div>

		<Drawer.Footer class="flex-row justify-end border-t">
			<Drawer.Close class={buttonVariants({ variant: 'outline' })}>Done</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
