<script lang="ts">
	// One voice of the tab band: frets + effect markers.
	import type { LaidBeat } from '$lib/notation/layout';
	import { METRICS } from '$lib/notation/layout';
	import { store } from '$lib/stores/score.svelte';
	import { letRingSpans } from './beam-geometry';
	import { isCursorBeat, inSelection, isPlayingBeat } from './predicates';
	import { fretStyle } from './note-styles';

	let {
		beats,
		measureIndex,
		vIdx,
		bandHeight,
		isActiveTrack,
		trackIndex
	}: {
		beats: LaidBeat[];
		measureIndex: number;
		vIdx: number;
		bandHeight: number;
		isActiveTrack: boolean;
		trackIndex: number;
	} = $props();

	const FX = '[font:600_8px_ui-sans-serif,sans-serif] fill-[#71717a] [text-anchor:middle]';
	const BEND_ARROW = 'fill-none stroke-[#52525b] [stroke-width:1.3] [marker-end:none]';
	const BG_CURSOR = 'fill-[rgba(24,24,27,0.16)] [rx:3]';
	const BG_SEL = 'fill-[rgba(24,24,27,0.07)] [rx:3]';
	const BG_PLAY = 'fill-[rgba(24,24,27,0.28)] [rx:3]';
</script>

{#each letRingSpans(beats) as span (span.x1)}
	<text x={span.x1 - 7} y={9} class="[font:italic_600_8px_ui-sans-serif,sans-serif] fill-[#71717a]"
		>let ring</text
	>
	<line
		x1={span.x1 + 33}
		y1={6}
		x2={span.x2 + 7}
		y2={6}
		class="stroke-[#a1a1aa] [stroke-width:1] [stroke-dasharray:3_2]"
	/>
	<line
		x1={span.x2 + 7}
		y1={6}
		x2={span.x2 + 7}
		y2={12}
		class="stroke-[#a1a1aa] [stroke-width:1] [stroke-dasharray:3_2]"
	/>
{/each}
{#each beats as beat (beat.index)}
	{#if vIdx === 0 && isPlayingBeat(measureIndex, beat.index)}
		<rect x={beat.x - 9} y="6" width="18" height={bandHeight - 12} class={BG_PLAY} />
	{:else if isCursorBeat(measureIndex, beat.index, vIdx, isActiveTrack)}
		<rect x={beat.x - 9} y="6" width="18" height={bandHeight - 12} class={BG_CURSOR} />
		{#if isActiveTrack}
			<rect
				x={beat.x - 9}
				y={14 + store.cursor.string * METRICS.tabLineGap - 6}
				width="18"
				height="12"
				class="fill-[rgba(24,24,27,0.14)] [rx:2]"
			/>
		{/if}
	{:else if vIdx === 0 && inSelection(measureIndex, beat.index, trackIndex)}
		<rect x={beat.x - 9} y="6" width="18" height={bandHeight - 12} class={BG_SEL} />
	{/if}
	{#each beat.notes as n (n.string)}
		{@const isDead = n.techniques.includes('dead')}
		{@const isGhost = n.techniques.includes('ghost')}
		{@const fretLabel = isDead ? 'x' : isGhost ? `(${n.fret})` : String(n.fret)}
		{@const isNoteSelected =
			store.noteSelection !== null &&
			store.noteSelection.measure === measureIndex &&
			store.noteSelection.beat === beat.index &&
			store.noteSelection.voice === vIdx &&
			store.noteSelection.strings.has(n.string)}
		{#if isNoteSelected}
			<rect
				x={n.x - (isGhost ? 10 : 6) - 1}
				y={n.tabY - 5}
				width={isGhost ? 22 : 15}
				height="12"
				class="fill-[rgba(24,24,27,0.22)] [rx:3]"
			/>
		{/if}
		<rect
			x={n.x - (isGhost ? 10 : 6)}
			y={n.tabY - 4}
			width={isGhost ? 20 : 13}
			height="10"
			class="fill-paper"
		/>
		<text x={n.x} y={n.tabY + 4} class={fretStyle({ mutedNote: isDead, v2: vIdx === 1 })}
			>{fretLabel}</text
		>
		{#if n.techniques.includes('palm-mute')}
			<text x={n.x} y={n.tabY - 9} class={FX}>P.M.</text>
		{/if}
		{#if n.techniques.includes('harmonic')}
			<text x={n.x} y={n.tabY - 9} class={FX}>◇</text>
		{/if}
		{#if n.techniques.includes('artificial-harmonic')}
			<text x={n.x} y={n.tabY - 18} class={FX}>A.H.</text>
		{/if}
		{#if n.techniques.includes('staccato')}
			<circle cx={n.x} cy={n.tabY - 9} r="1.8" class="fill-[#18181b]" />
		{/if}
		{#if n.techniques.includes('accent')}
			<text
				x={n.x}
				y={n.tabY - 9}
				class="[font-family:ui-sans-serif,sans-serif] text-[13px] font-bold fill-[#71717a] [text-anchor:middle]"
				>›</text
			>
		{/if}
		{#if n.techniques.includes('grace')}
			<text
				x={n.x - 9}
				y={n.tabY}
				class="[font-family:ui-sans-serif,sans-serif] text-[10px] font-semibold fill-[#71717a] [text-anchor:middle]"
				>𝆔</text
			>
		{/if}
		{#if n.techniques.includes('vibrato')}
			<text x={n.x + 10} y={n.tabY + 4} class="text-[12px] fill-[#71717a]">∿</text>
		{/if}
		{#if n.techniques.includes('bend')}
			<path d="M {n.x + 8} {n.tabY} q 10 -2 12 -14" class={BEND_ARROW} />
			<text x={n.x + 20} y={n.tabY - 12} class={FX}
				>{n.bend === 0.5 ? '½' : n.bend === 1 ? 'full' : (n.bend ?? 'full')}</text
			>
		{/if}
		{#if n.techniques.includes('release')}
			<path d="M {n.x + 8} {n.tabY - 16} q 10 2 12 16" class={BEND_ARROW} />
			<text x={n.x + 20} y={n.tabY - 12} class={FX}>↓</text>
		{/if}
		{#if n.techniques.includes('bend-release')}
			<path d="M {n.x + 8} {n.tabY} q 5 -2 6 -12 q 4 10 8 12" class={BEND_ARROW} />
			<text x={n.x + 22} y={n.tabY - 12} class={FX}>br</text>
		{/if}
		{#if n.techniques.includes('slide') && n.slideTo !== undefined}
			<line
				x1={n.x + 8}
				y1={n.tabY + (n.slideTo > n.fret ? 3 : -3)}
				x2={n.x + 24}
				y2={n.tabY + (n.slideTo > n.fret ? -3 : 3)}
				class="stroke-[#52525b] [stroke-width:1.6]"
			/>
		{/if}
		{#if n.techniques.includes('hammer') || n.techniques.includes('pull')}
			<path
				d="M {n.x + 8} {n.tabY - 4} q 8 -8 16 0"
				class="fill-none stroke-[#52525b] [stroke-width:1.3]"
			/>
		{/if}
		{#if n.tie}
			<path
				d="M {n.x + 7} {n.tabY - 5} Q {(n.x + n.tie.x2) / 2} {n.tabY - 13} {n.tie.x2 - 7} {n.tie
					.tabY2 - 5}"
				class="fill-none stroke-[#18181b] [stroke-width:1.3]"
			/>
		{/if}
	{/each}
{/each}
