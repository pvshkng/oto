<script lang="ts">
	// V1/V2 voice toggle, shared by EditPanel and NotePropertiesPanel.
	import { store } from '$lib/stores/score.svelte';
	import { cn } from '$lib/utils';
	import { ctlStyle } from './control-styles';
	import { rowSegmented } from './rowSegmented';

	let { dense = false }: { dense?: boolean } = $props();

	const groupClass = $derived(
		dense ? 'flex flex-wrap items-stretch gap-0' : 'inline-flex flex-none items-stretch'
	);
	// Anchor edge border/rounding via CSS so it survives class-attr rewrites on
	// toggle (see DurationPicker for the full rationale).
	const segEdges = 'first:border-l first:rounded-l-legacy-xs last:rounded-r-legacy-xs';
</script>

<div class={groupClass} use:rowSegmented={dense}>
	<button
		class={cn(ctlStyle({ dense }), 'rounded-none border-l-0', segEdges, {
			sunk: store.cursor.voice === 0
		})}
		onclick={() => store.setVoice(0)}>V1</button
	>
	<button
		class={cn(ctlStyle({ dense }), 'rounded-none border-l-0', segEdges, {
			sunk: store.cursor.voice === 1
		})}
		title="Second voice"
		onclick={() => store.setVoice(1)}>V2</button
	>
</div>
