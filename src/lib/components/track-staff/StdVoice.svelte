<script lang="ts">
	// One voice of the standard staff: beams, then per-beat rests/noteheads/stems.
	import type { LaidBeat } from '$lib/notation/layout';
	import { METRICS } from '$lib/notation/layout';
	import { GLYPH, restGlyph, accidentalGlyph } from '$lib/notation/glyphs';
	import { midiToNote } from '$lib/oto/pitch';
	import { beamGroups, beamLine, beamYAt, stemX, SEC_BEAM_GAP } from './beam-geometry';
	import { isCursorBeat, inSelection, isPlayingBeat } from './predicates';

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
</script>

{#each beamGroups(beats) as group (group)}
	{@const members = beats.filter((b) => b.beamGroup === group)}
	{@const bl = beamLine(members)}
	<line x1={bl.x1} y1={bl.y1} x2={bl.x2} y2={bl.y2} class="beam" />
	{#each members as m, mi (m.index)}
		{@const sx = stemX(m)}
		{@const yb = beamYAt(bl, sx)}
		<!-- Stem runs from the notehead column straight to the beam, so heads,
		     stems and beam always meet. -->
		<line x1={sx} y1={m.stemDir === 1 ? m.noteBottom : m.noteTop} x2={sx} y2={yb} class="stem" />
		{#if m.beams >= 2}
			{#if mi < members.length - 1 && members[mi + 1].beams >= 2}
				<!-- Secondary (16th/32nd) beam fully connects neighbouring members. -->
				{@const sx2 = stemX(members[mi + 1])}
				<line
					x1={sx}
					y1={yb + bl.dir * SEC_BEAM_GAP}
					x2={sx2}
					y2={beamYAt(bl, sx2) + bl.dir * SEC_BEAM_GAP}
					class="beam"
				/>
			{:else if mi === 0 || members[mi - 1].beams < 2}
				<!-- Isolated short note: stub points back toward its group. -->
				{@const sxe = sx + (mi === members.length - 1 ? -7 : 7)}
				<line
					x1={sx}
					y1={yb + bl.dir * SEC_BEAM_GAP}
					x2={sxe}
					y2={beamYAt(bl, sxe) + bl.dir * SEC_BEAM_GAP}
					class="beam"
				/>
			{/if}
		{/if}
	{/each}
{/each}
{#each beats as beat (beat.index)}
	{#if vIdx === 0 && isPlayingBeat(measureIndex, beat.index)}
		<rect x={beat.x - 9} y="2" width="18" height={bandHeight - 4} class="bg-play" />
	{:else if isCursorBeat(measureIndex, beat.index, vIdx, isActiveTrack)}
		<rect x={beat.x - 9} y="2" width="18" height={bandHeight - 4} class="bg-cursor" />
	{:else if vIdx === 0 && inSelection(measureIndex, beat.index, trackIndex)}
		<rect x={beat.x - 9} y="2" width="18" height={bandHeight - 4} class="bg-sel" />
	{/if}
	{#if beat.rest}
		<text x={beat.x - 4} y={METRICS.stdTopPad + 3 * METRICS.staffLineGap} class="bravura rest"
			>{restGlyph(beat.duration)}</text
		>
		{#if beat.dotted}
			<circle
				cx={beat.x + 9}
				cy={METRICS.stdTopPad + 3 * METRICS.staffLineGap - 3}
				r="1.6"
				class="dot"
			/>
		{/if}
	{:else}
		{#each beat.notes as n (n.string)}
			{#each n.ledgerLines as ly (ly)}
				<line
					x1={n.x + n.headXOffset - 9}
					y1={ly}
					x2={n.x + n.headXOffset + 9}
					y2={ly}
					class="ledger"
				/>
			{/each}
		{/each}
		{#if beat.duration !== 1 && beat.beamGroup === -1}
			<line
				x1={stemX(beat)}
				y1={beat.stemDir === 1 ? beat.stdStemBottom : beat.stdStemTop}
				x2={stemX(beat)}
				y2={beat.stemDir === 1 ? beat.stdStemTop : beat.stdStemBottom}
				class="stem"
			/>
			{#if beat.beams > 0}
				<text
					x={stemX(beat)}
					y={beat.stemDir === 1 ? beat.stdStemTop : beat.stdStemBottom}
					class="bravura flag"
					>{beat.beams === 1
						? GLYPH.flag8thUp
						: beat.beams === 2
							? GLYPH.flag16thUp
							: GLYPH.flag32ndUp}</text
				>
			{/if}
		{/if}
		{#each beat.notes as n (n.string)}
			{#if n.accidental}
				<text x={n.x - 15} y={n.stdY + 4} class="bravura accidental"
					>{accidentalGlyph(n.accidental)}</text
				>
			{/if}
			{#if n.dead}
				<!-- Dead/muted note: an X notehead (no pitched ellipse), drawn at the
				     open-string staff position computed in layout. -->
				<text x={n.x + n.headXOffset} y={n.stdY + 4} class="dead-head" class:v2={vIdx === 1}>✕</text
				>
			{:else}
				<ellipse
					cx={n.x + n.headXOffset}
					cy={n.stdY}
					rx="6"
					ry="4.4"
					class="notehead"
					class:hollow={beat.duration <= 2}
					class:v2={vIdx === 1}
					class:ghost={n.techniques.includes('ghost')}
					transform="rotate(-20 {n.x + n.headXOffset} {n.stdY})"
					><title>{midiToNote(n.midi)}</title></ellipse
				>
			{/if}
			{#if beat.dotted}
				<circle cx={n.x + n.headXOffset + 11} cy={n.stdY} r="1.6" class="dot" />
			{/if}
			{@const markY = beat.stemDir === 1 ? n.stdY - 12 : n.stdY + 14}
			{#if n.techniques.includes('staccato')}
				<circle cx={n.x + n.headXOffset} cy={markY} r="1.8" class="dot" />
			{/if}
			{#if n.techniques.includes('accent')}
				<text x={n.x + n.headXOffset - 5} y={markY + 5} class="std-accent">›</text>
			{/if}
			{#if n.techniques.includes('artificial-harmonic')}
				<text x={n.x + n.headXOffset} y={markY - 2} class="fx std-fx">A.H.</text>
			{/if}
			{#if n.tie}
				{@const ud = beat.stemDir === 1 ? 1 : -1}
				<path
					d="M {n.x + n.headXOffset + 7} {n.stdY + ud * 3} Q {(n.x + n.headXOffset + n.tie.x2) /
						2} {n.stdY + ud * 11} {n.tie.x2 - 7} {n.tie.stdY2 + ud * 3}"
					class="tie"
				/>
			{/if}
		{/each}
	{/if}
{/each}

<style>
	.stem,
	.beam {
		stroke: #18181b;
	}
	.stem {
		stroke-width: 1.4;
	}
	.beam {
		stroke-width: 3.4;
		stroke-linecap: butt;
	}
	.dot {
		fill: #18181b;
	}
	.ledger {
		stroke: #a1a1aa;
		stroke-width: 1;
	}
	.notehead {
		fill: #18181b;
	}
	.notehead.hollow {
		fill: #fff;
		stroke: #18181b;
		stroke-width: 1.6;
	}
	.notehead.v2 {
		fill: #71717a;
	}
	.notehead.v2.hollow {
		fill: #fff;
		stroke: #71717a;
	}
	.dead-head {
		fill: #18181b;
		font-size: 13px;
		font-weight: 700;
		text-anchor: middle;
	}
	.dead-head.v2 {
		fill: #71717a;
	}
	.notehead.ghost {
		opacity: 0.35;
	}
	.std-accent {
		font-size: 13px;
		font-weight: 700;
		fill: #18181b;
		text-anchor: middle;
	}
	.std-fx {
		text-anchor: middle;
	}
	.accidental {
		font-size: 24px;
	}
	.tie {
		fill: none;
		stroke: #18181b;
		stroke-width: 1.3;
	}
	.bravura {
		font-family: 'Bravura', serif;
		fill: #18181b;
	}
	.rest {
		font-size: 26px;
	}
	.flag {
		font-size: 26px;
		dominant-baseline: middle;
	}
	.fx {
		font:
			600 8px ui-sans-serif,
			sans-serif;
		fill: #71717a;
		text-anchor: middle;
	}
	.bg-cursor {
		fill: rgba(24, 24, 27, 0.16);
		rx: 3;
	}
	.bg-sel {
		fill: rgba(24, 24, 27, 0.07);
		rx: 3;
	}
	.bg-play {
		fill: rgba(24, 24, 27, 0.28);
		rx: 3;
	}
</style>
