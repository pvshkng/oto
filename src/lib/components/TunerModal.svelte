<script lang="ts">
	// Mobile chromatic tuner: a centered dialog with the shared floating look
	// (transparent dimmer + backdrop-blurred panel). Desktop uses TunerPanel —
	// a draggable floating window — instead. Closing the dialog unmounts
	// TunerDisplay, which releases the microphone.
	import { store } from '$lib/stores/score.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import TunerDisplay from './TunerDisplay.svelte';
</script>

<Dialog.Root bind:open={store.tunerOpen}>
	<Dialog.Content floating class="max-w-sm gap-2 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
		<Dialog.Header class="p-4 pb-0">
			<Dialog.Title>Tuner</Dialog.Title>
			<Dialog.Description class="sr-only">
				Chromatic tuner — plays nothing, listens through the microphone.
			</Dialog.Description>
		</Dialog.Header>
		<TunerDisplay />
	</Dialog.Content>
</Dialog.Root>
