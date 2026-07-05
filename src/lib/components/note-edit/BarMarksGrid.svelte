<script lang="ts">
	// Measure-level structure-mark toggles for the bar under the cursor:
	// double barline, begin/end repeat, volta brackets, simile, segno and coda.
	// Same hosting contract as EffectsGrid/BeatMarksGrid (`dense`/`sectioned`).
	// Structural marks apply to this measure on every track (like a time-sig
	// change); simile only marks the active track's bar.
	import { store } from '$lib/stores/score.svelte';
	import { GLYPH } from '$lib/notation/glyphs';
	import { cn } from '$lib/utils';
	import { fxStyle } from './control-styles';

	let { dense = false, sectioned = false }: { dense?: boolean; sectioned?: boolean } = $props();

	const measure = $derived(store.currentMeasure);
	const mi = $derived(store.cursor.measure);

	const bravuraBox =
		"[font-family:'Bravura',serif] inline-flex items-center justify-center pt-2.5 text-[15px] leading-none";
</script>

{#snippet section(title: string, body: import('svelte').Snippet)}
	{#if sectioned}
		<div class="flex flex-col gap-1">
			<span class="text-[9px] font-bold tracking-[0.4px] text-text-muted/80 uppercase">
				{title}
			</span>
			<div class="flex flex-wrap items-center gap-[3px]" role="group" aria-label={title}>
				{@render body()}
			</div>
		</div>
	{:else}
		<div
			class="inline-flex flex-none flex-wrap items-center gap-[3px]"
			role="group"
			aria-label={title}
		>
			{@render body()}
		</div>
	{/if}
{/snippet}

{#snippet divider()}
	{#if !sectioned}
		<span class="mx-0.5 h-5 w-px flex-none self-center bg-border-strong"></span>
	{/if}
{/snippet}

{#snippet barlines()}
	<button
		class={cn(fxStyle({ dense }), { sunk: measure?.barline === 'double' })}
		title="Double barline"
		aria-pressed={measure?.barline === 'double'}
		onclick={() => store.toggleMeasureDoubleBarline(mi)}>‖</button
	>
	<button
		class={cn(fxStyle({ dense }), { sunk: !!measure?.repeatStart })}
		title="Begin repeat"
		aria-pressed={!!measure?.repeatStart}
		onclick={() => store.toggleMeasureRepeatStart(mi)}>|:</button
	>
	<button
		class={cn(fxStyle({ dense }), { sunk: !!measure?.repeatEnd })}
		title="End repeat"
		aria-pressed={!!measure?.repeatEnd}
		onclick={() => store.toggleMeasureRepeatEnd(mi)}>:|</button
	>
{/snippet}

{#snippet voltas()}
	{#each [1, 2, 3] as n (n)}
		<button
			class={cn(fxStyle({ dense }), { sunk: measure?.volta === n })}
			title={`Volta bracket ${n}. (alternate ending)`}
			aria-pressed={measure?.volta === n}
			onclick={() => store.setMeasureVolta(mi, n)}>{n}.</button
		>
	{/each}
{/snippet}

{#snippet navigation()}
	<button
		class={cn(fxStyle({ dense }), { sunk: !!measure?.simile })}
		title="Simile mark (repeat previous bar)"
		aria-label="Simile mark"
		aria-pressed={!!measure?.simile}
		onclick={() => store.toggleMeasureSimile(mi)}
	>
		<span class={bravuraBox}>{GLYPH.repeat1Bar}</span>
	</button>
	<button
		class={cn(fxStyle({ dense }), { sunk: !!measure?.segno })}
		title="Segno"
		aria-label="Segno"
		aria-pressed={!!measure?.segno}
		onclick={() => store.toggleMeasureSegno(mi)}
	>
		<span class={bravuraBox}>{GLYPH.segno}</span>
	</button>
	<button
		class={cn(fxStyle({ dense }), { sunk: !!measure?.coda })}
		title="Coda"
		aria-label="Coda"
		aria-pressed={!!measure?.coda}
		onclick={() => store.toggleMeasureCoda(mi)}
	>
		<span class={bravuraBox}>{GLYPH.coda}</span>
	</button>
{/snippet}

{@render section('Barlines & repeats', barlines)}
{@render divider()}
{@render section('Endings', voltas)}
{@render divider()}
{@render section('Navigation', navigation)}
