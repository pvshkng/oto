<script lang="ts">
	// Beat-level notation-mark toggles: tuplets, dynamics, fermata/octave signs
	// and tab strum arrows. Mirrors EffectsGrid's hosting contract — inline rows
	// separated by thin dividers, or labelled stacked sections (`sectioned`) for
	// the side/float note panel. Every control toggles: tapping the active value
	// clears it from the beat.
	import { store } from '$lib/stores/score.svelte';
	import { DYNAMIC_LABELS, TUPLET_LABELS, OTTAVA_LABELS, STRUM_LABELS } from '$lib/commands';
	import { dynamicGlyph, GLYPH } from '$lib/notation/glyphs';
	import { DYNAMICS, OTTAVAS, TUPLET_VALUES } from '$lib/oto/types';
	import { cn } from '$lib/utils';
	import { fxStyle } from './control-styles';

	let { dense = false, sectioned = false }: { dense?: boolean; sectioned?: boolean } = $props();

	const beat = $derived(store.currentBeat);

	// Bravura dynamics glyphs sit on the text baseline with deep descenders, so
	// the glyph box pushes them down into optical centre like DurationPicker does
	// for its note glyphs.
	const dynGlyphBox =
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

{#snippet tuplets()}
	{#each TUPLET_VALUES as n (n)}
		<button
			class={cn(fxStyle({ dense }), { sunk: beat?.tuplet === n })}
			title={TUPLET_LABELS[n]}
			aria-pressed={beat?.tuplet === n}
			onclick={() => store.setBeatTuplet(n)}>{n}:{n === 3 ? 2 : n === 9 ? 8 : 4}</button
		>
	{/each}
{/snippet}

{#snippet dynamics()}
	{#each DYNAMICS as d (d)}
		<button
			class={cn(fxStyle({ dense }), { sunk: beat?.dynamic === d })}
			title={DYNAMIC_LABELS[d]}
			aria-label={`Dynamic ${d}`}
			aria-pressed={beat?.dynamic === d}
			onclick={() => store.setBeatDynamic(d)}
		>
			<span class={dynGlyphBox}>{dynamicGlyph(d)}</span>
		</button>
	{/each}
{/snippet}

{#snippet marks()}
	<button
		class={cn(fxStyle({ dense }), { sunk: !!beat?.fermata })}
		title="Fermata"
		aria-label="Fermata"
		aria-pressed={!!beat?.fermata}
		onclick={() => store.toggleBeatFermata()}
	>
		<span class={dynGlyphBox}>{GLYPH.fermataAbove}</span>
	</button>
	{#each OTTAVAS as o (o)}
		<button
			class={cn(fxStyle({ dense }), 'italic', { sunk: beat?.ottava === o })}
			title={OTTAVA_LABELS[o]}
			aria-pressed={beat?.ottava === o}
			onclick={() => store.setBeatOttava(o)}>{o}</button
		>
	{/each}
{/snippet}

{#snippet strums()}
	{#each ['down', 'up'] as const as dir (dir)}
		<button
			class={cn(fxStyle({ dense }), { sunk: beat?.strum === dir })}
			title={STRUM_LABELS[dir]}
			aria-pressed={beat?.strum === dir}
			onclick={() => store.setBeatStrum(dir)}>{dir === 'down' ? '↓' : '↑'}</button
		>
	{/each}
{/snippet}

{@render section('Tuplets', tuplets)}
{@render divider()}
{@render section('Dynamics', dynamics)}
{@render divider()}
{@render section('Octave & hold', marks)}
{@render divider()}
{@render section('Strum', strums)}
