<script lang="ts">
	// Per-bar time-signature popover, shared by EditPanel and
	// NotePropertiesPanel. `side` preserves each host's popover position
	// (EditPanel opens upward from the bottom toolbar; NotePropertiesPanel
	// opens rightward from the left sidebar). Numerator and denominator are
	// picked independently from two dropdowns, so any metre can be written —
	// not just the common preset combinations.
	import { store } from '$lib/stores/score.svelte';
	import * as Popover from '$lib/components/ui/popover';

	let { side }: { side: 'top' | 'right' } = $props();

	const NUMERATORS = Array.from({ length: 32 }, (_, i) => i + 1);
	const DENOMINATORS = [1, 2, 4, 8, 16, 32];

	const barTs = $derived(store.timeSignatureAt(store.cursor.measure));

	const selectStyle =
		'border-input bg-background text-foreground h-9 cursor-pointer rounded-md border px-2 text-sm font-bold tabular-nums';
</script>

<Popover.Root>
	<Popover.Trigger
		class="border-input bg-background hover:bg-accent text-foreground inline-flex h-9 items-center rounded-md border px-3 text-sm font-bold tabular-nums"
	>
		{barTs[0]}/{barTs[1]}
	</Popover.Trigger>
	<Popover.Content {side} class="w-auto p-3" sideOffset={6}>
		<div class="flex items-center gap-2">
			<select
				class={selectStyle}
				value={barTs[0]}
				aria-label="Beats per bar"
				onchange={(e) =>
					store.setMeasureTimeSignature(store.cursor.measure, +e.currentTarget.value, barTs[1])}
			>
				{#each NUMERATORS as n (n)}
					<option value={n}>{n}</option>
				{/each}
			</select>
			<span class="text-foreground text-lg font-bold">/</span>
			<select
				class={selectStyle}
				value={barTs[1]}
				aria-label="Beat unit"
				onchange={(e) =>
					store.setMeasureTimeSignature(store.cursor.measure, barTs[0], +e.currentTarget.value)}
			>
				{#each DENOMINATORS as d (d)}
					<option value={d}>{d}</option>
				{/each}
			</select>
		</div>
	</Popover.Content>
</Popover.Root>
