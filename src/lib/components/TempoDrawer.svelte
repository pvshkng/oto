<script lang="ts">
	// BPM bottom drawer: a big tap-to-read number, +/- steppers and a slider
	// for fast scrubbing, replacing the old tempo popover.
	import { store } from '$lib/stores/score.svelte';
	// open prop is kept for API compatibility but store.tempoOpen drives the drawer
	import * as Drawer from '$lib/components/ui/drawer';
	import TempoControls from './TempoControls.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Drawer.Root bind:open={store.tempoOpen} direction="bottom">
	<Drawer.Content class="mx-auto w-full max-w-md rounded-t-2xl border outline-none">
		<Drawer.Header>
			<Drawer.Title>Tempo</Drawer.Title>
			<Drawer.Description>Set the song's beats per minute.</Drawer.Description>
		</Drawer.Header>

		<TempoControls variant="drawer" />
	</Drawer.Content>
</Drawer.Root>
