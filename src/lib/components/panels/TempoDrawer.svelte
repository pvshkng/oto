<script lang="ts">
	// BPM dialog: a big tap-to-read number, +/- steppers and a slider for fast
	// scrubbing. Rendered as a centered dialog (mobile only) with the overlay
	// dimmer suppressed and a backdrop blur, so the score stays visible behind it.
	import { store } from '$lib/stores/score.svelte';
	// open prop is kept for API compatibility but store.tempoOpen drives the dialog
	import * as Dialog from '$lib/components/ui/dialog';
	import TempoControls from '$lib/components/panels/TempoControls.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog.Root bind:open={store.tempoOpen}>
	<Dialog.Content floating class="max-w-md gap-4 p-0">
		<Dialog.Header class="p-4 pb-0">
			<Dialog.Title>Tempo</Dialog.Title>
			<Dialog.Description>Set the song's beats per minute.</Dialog.Description>
		</Dialog.Header>

		<TempoControls variant="drawer" />
	</Dialog.Content>
</Dialog.Root>
