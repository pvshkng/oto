<script lang="ts">
	import * as Drawer from '$lib/components/ui/drawer';
	import { buttonVariants } from '$lib/components/ui/button';
	import TrackControlForm from './TrackControlForm.svelte';

	let { open = $bindable(false), index = -1 }: { open: boolean; index?: number } = $props();
</script>

<Drawer.Root bind:open direction="bottom">
	<Drawer.Content class="mx-auto flex w-full max-w-md flex-col rounded-t-2xl border-t outline-none">
		<Drawer.Header class="border-b">
			<Drawer.Title>Track control</Drawer.Title>
			<Drawer.Description>
				Adjust this track instrument, tuning and notation. Changes apply instantly.
			</Drawer.Description>
		</Drawer.Header>

		<TrackControlForm {index} onClose={() => (open = false)} />

		<Drawer.Footer class="flex-row justify-end border-t">
			<Drawer.Close class={buttonVariants({ variant: 'outline' })}>Done</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
