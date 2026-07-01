<script lang="ts">
	// Per-bar time-signature popover, shared by EditPanel and
	// NotePropertiesPanel. `side` preserves each host's popover position
	// (EditPanel opens upward from the bottom toolbar; NotePropertiesPanel
	// opens rightward from the left sidebar).
	import { store } from '$lib/stores/score.svelte';
	import { TIME_SIGS } from '$lib/commands';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';

	let { side }: { side: 'top' | 'right' } = $props();

	const barTs = $derived(store.timeSignatureAt(store.cursor.measure));
	const barTsLabel = $derived(`${barTs[0]}/${barTs[1]}`);

	let tsOpen = $state(false);

	function setBarTs(v: string) {
		const [n, d] = v.split('/').map(Number);
		store.setMeasureTimeSignature(store.cursor.measure, n, d);
	}
</script>

<Popover.Root bind:open={tsOpen}>
	<Popover.Trigger
		class="border-input bg-background hover:bg-accent text-foreground inline-flex h-9 items-center rounded-md border px-3 text-sm font-bold tabular-nums"
	>
		{barTsLabel}
	</Popover.Trigger>
	<Popover.Content {side} class="w-28 p-1" sideOffset={6}>
		<div class="grid grid-cols-2 gap-1">
			{#each TIME_SIGS as t (t)}
				<button
					class={cn(
						'rounded-sm px-2 py-1.5 text-sm font-semibold tabular-nums',
						barTsLabel === t
							? 'bg-primary text-primary-foreground'
							: 'hover:bg-accent text-foreground'
					)}
					onclick={() => {
						setBarTs(t);
						tsOpen = false;
					}}>{t}</button
				>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
