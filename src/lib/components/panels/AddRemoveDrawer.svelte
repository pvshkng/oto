<script lang="ts">
	// "Add or remove" bottom drawer: every bar/track insertion and deletion
	// action that used to live in the Edit dropdown. A drawer (not a dropdown)
	// so it stays usable on touch/narrow screens.
	import { store } from '$lib/stores/score.svelte';
	import * as Drawer from '$lib/components/ui/drawer';
	import TrackControlDrawer from '$lib/components/panels/TrackControlDrawer.svelte';
	import AddRemoveActions from '$lib/components/panels/AddRemoveActions.svelte';

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
</script>

<Drawer.Root bind:open={store.addRemoveOpen} direction="bottom">
	<Drawer.Content class="mx-auto w-full max-w-md rounded-t-2xl border outline-none">
		<Drawer.Header>
			<Drawer.Title>Add or remove</Drawer.Title>
			<Drawer.Description>Insert or delete bars and tracks.</Drawer.Description>
		</Drawer.Header>

		<div class="flex flex-col gap-4 overflow-y-auto p-4 pt-0">
			<AddRemoveActions
				onAfterAction={() => (store.addRemoveOpen = false)}
				onAddTrack={addTrack}
				onEditTrack={editCurrentTrack}
			/>
		</div>
	</Drawer.Content>
</Drawer.Root>

<TrackControlDrawer bind:open={trackEditOpen} index={trackEditIndex} />
