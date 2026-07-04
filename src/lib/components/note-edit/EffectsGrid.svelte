<script lang="ts">
	// Technique-effect toggle grid, shared by EditPanel and NotePropertiesPanel.
	// Effects come pre-grouped (EFFECT_SECTIONS) the way Guitar Pro organises
	// them; inline hosts get the groups separated by thin dividers, while
	// `sectioned` (the side/float note panel) stacks them under small labels.
	import { store } from '$lib/stores/score.svelte';
	import { EFFECT_SECTIONS, type EffectUi } from '$lib/commands';
	import type { Technique } from '$lib/oto/types';
	import { cn } from '$lib/utils';
	import { fxStyle } from './control-styles';

	let { dense = false, sectioned = false }: { dense?: boolean; sectioned?: boolean } = $props();

	const note = $derived(store.currentNote);

	function hasTech(t: Technique) {
		return note?.techniques?.includes(t) ?? false;
	}
</script>

{#snippet fxButtons(items: EffectUi[])}
	{#each items as e (e.tech)}
		<button
			class={cn(fxStyle({ dense }), { sunk: hasTech(e.tech) })}
			disabled={!note && !e.alwaysOn}
			title={e.label}
			aria-pressed={hasTech(e.tech)}
			onclick={() => store.toggleTechnique(e.tech)}>{e.sym}</button
		>
	{/each}
{/snippet}

{#each EFFECT_SECTIONS as sec, i (sec.title)}
	{#if sectioned}
		<div class="flex flex-col gap-1">
			<span class="text-[9px] font-bold tracking-[0.4px] text-text-muted/80 uppercase">
				{sec.title}
			</span>
			<div class="flex flex-wrap items-center gap-[3px]" role="group" aria-label={sec.title}>
				{@render fxButtons(sec.items)}
			</div>
		</div>
	{:else}
		{#if i > 0}
			<span class="mx-0.5 h-5 w-px flex-none self-center bg-border-strong"></span>
		{/if}
		<div class="inline-flex flex-none items-center gap-[3px]" role="group" aria-label={sec.title}>
			{@render fxButtons(sec.items)}
		</div>
	{/if}
{/each}
