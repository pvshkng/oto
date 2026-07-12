<script lang="ts">
	// Song configuration: title, composer, tempo and the starting time signature.
	// A centered dialog (mobile only) opened from the bottom bar cog or the score
	// title. The overlay dimmer is suppressed and the panel is backdrop-blurred so
	// the score stays visible behind it. Desktop shows the same fields inline in
	// RightPanel's "song" mode instead (see RightPanel.svelte).
	import { store } from '$lib/stores/score.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { buttonVariants } from '$lib/components/ui/button';
	import SongDetailsFields from './SongDetailsFields.svelte';
</script>

<Dialog.Root bind:open={store.songModalOpen}>
	<Dialog.Content floating class="max-w-md gap-4 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
		<Dialog.Header class="p-4 pb-0">
			<Dialog.Title>Song details</Dialog.Title>
			<Dialog.Description>Title, composer, tempo and starting time signature.</Dialog.Description>
		</Dialog.Header>

		<div class="grid max-h-[70vh] gap-4 overflow-y-auto p-4 pt-0">
			<SongDetailsFields />
		</div>

		<div class="flex flex-row justify-end p-4">
			<Dialog.Close class={buttonVariants({ variant: 'outline' })}>Done</Dialog.Close>
		</div>
	</Dialog.Content>
</Dialog.Root>
