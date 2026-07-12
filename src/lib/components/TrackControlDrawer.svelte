<script lang="ts">
	// Track control: instrument, tuning, notation and colour for one track. A
	// centered dialog (mobile) styled like the Song details dialog — the overlay
	// dimmer is suppressed and the panel is backdrop-blurred so the score stays
	// visible behind it. Changes apply instantly.
	import * as Dialog from '$lib/components/ui/dialog';
	import { buttonVariants } from '$lib/components/ui/button';
	import TrackControlForm from './TrackControlForm.svelte';

	let { open = $bindable(false), index = -1 }: { open: boolean; index?: number } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		floating
		class="grid max-h-[85vh] max-w-md grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0"
		onOpenAutoFocus={(e) => e.preventDefault()}
	>
		<Dialog.Header class="p-4 pb-0">
			<Dialog.Title>Track control</Dialog.Title>
			<Dialog.Description>
				Adjust this track instrument, tuning and notation. Changes apply instantly.
			</Dialog.Description>
		</Dialog.Header>

		<TrackControlForm {index} onClose={() => (open = false)} />

		<div class="flex flex-row justify-end border-t p-4">
			<Dialog.Close class={buttonVariants({ variant: 'outline' })}>Done</Dialog.Close>
		</div>
	</Dialog.Content>
</Dialog.Root>
