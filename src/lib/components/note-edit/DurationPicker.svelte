<script lang="ts">
	// Duration + dotted-note buttons, shared by EditPanel's toolbar strip and
	// NotePropertiesPanel's sidebar section. `dense` picks the sizing to match
	// each host; NotePropertiesPanel's row can wrap (rowSegmented keeps the
	// segmented look contiguous per visual row), EditPanel's never does.
	import { store } from '$lib/stores/score.svelte';
	import { DURATION_ORDER } from '$lib/oto/duration';
	import { durationGlyph, AUGMENTATION_DOT } from '$lib/notation/glyphs';
	import { DURATION_LABELS, type DurationValue } from '$lib/oto/types';
	import { cn } from '$lib/utils';
	import { ctlStyle } from './control-styles';
	import { rowSegmented } from './rowSegmented';

	let { dense = false }: { dense?: boolean } = $props();

	function pickDuration(d: DurationValue) {
		store.activeDuration = d;
		store.setBeatDuration(d, store.activeDotted);
	}
	function toggleDot() {
		store.activeDotted = !store.activeDotted;
		store.setBeatDuration(store.activeDuration, store.activeDotted);
	}

	const groupClass = $derived(
		dense ? 'flex flex-wrap items-stretch gap-0' : 'inline-flex flex-none items-stretch'
	);
	// The true first/last buttons carry their edge border+rounding via CSS `first:`/
	// `last:` so they survive Svelte rewriting the class attr on every `sunk` toggle
	// (which would otherwise wipe the `rowSegmented` JS classes and leave the
	// leftmost button borderless — reading as if it were cropped). `rowSegmented`
	// still handles the interior row edges when the dense row wraps.
	const segEdges = 'first:border-l first:rounded-l-legacy-xs last:rounded-r-legacy-xs';
	// The .gl (glyph) variant overrides the base .ctl padding to a tighter
	// value so the fixed-width Bravura glyph box sits centered without extra
	// side padding.
	const glPadding = $derived(dense ? 'px-[5px]' : 'px-[6px]');
	const glyphBoxClass = $derived(
		dense
			? "[font-family:'Bravura',serif] inline-flex w-[18px] items-center justify-center pt-[11px] text-[17px] leading-none"
			: "[font-family:'Bravura',serif] inline-flex w-5 items-center justify-center pt-3 text-[18px] leading-none"
	);
	const dottedGlyphBoxClass = $derived(
		dense
			? "[font-family:'Bravura',serif] inline-flex w-auto items-center justify-center gap-px pt-[11px] text-[17px] leading-none"
			: "[font-family:'Bravura',serif] inline-flex w-auto items-center justify-center gap-px pt-3 text-[18px] leading-none"
	);
</script>

<div class={groupClass} use:rowSegmented={dense}>
	{#each DURATION_ORDER as d (d)}
		<button
			class={cn(ctlStyle({ dense }), glPadding, 'rounded-none border-l-0', segEdges, {
				sunk: store.activeDuration === d
			})}
			title={DURATION_LABELS[d]}
			aria-label={DURATION_LABELS[d]}
			aria-pressed={store.activeDuration === d}
			onclick={() => pickDuration(d)}
		>
			<span class={glyphBoxClass}>{durationGlyph(d)}</span>
		</button>
	{/each}
</div>
<button
	class={cn(ctlStyle({ dense }), glPadding, 'shrink-0', { sunk: store.activeDotted })}
	title="Dotted"
	aria-label="Dotted"
	aria-pressed={store.activeDotted}
	onclick={toggleDot}
>
	<span class={dottedGlyphBoxClass}>{durationGlyph(4)}{AUGMENTATION_DOT}</span>
</button>
