<script lang="ts">
	// Technique-effect toggle grid, shared by EditPanel and NotePropertiesPanel.
	import { store } from '$lib/stores/score.svelte';
	import { EFFECT_UI as EFFECTS } from '$lib/commands';
	import type { Technique } from '$lib/oto/types';
	import { cn } from '$lib/utils';
	import { fxStyle } from './control-styles';

	let { dense = false }: { dense?: boolean } = $props();

	const note = $derived(store.currentNote);

	function hasTech(t: Technique) {
		return note?.techniques?.includes(t) ?? false;
	}
</script>

{#each EFFECTS as e (e.tech)}
	<button
		class={cn(fxStyle({ dense }), { sunk: hasTech(e.tech) })}
		disabled={!note && !e.alwaysOn}
		title={e.label}
		onclick={() => store.toggleTechnique(e.tech)}>{e.sym}</button
	>
{/each}
