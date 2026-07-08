<script lang="ts">
	// One voice of the standard staff: beams, then per-beat rests/noteheads/stems.
	import type { LaidBeat } from '$lib/notation/layout';
	import { METRICS } from '$lib/notation/layout';
	import {
		GLYPH,
		restGlyph,
		accidentalGlyph,
		dynamicGlyph,
		flagGlyph,
		tupletGlyphs
	} from '$lib/notation/glyphs';
	import { midiToNote } from '$lib/oto/pitch';
	import {
		beamGroups,
		beamLine,
		beamYAt,
		beatArticulations,
		ottavaSpans,
		stemX,
		tupletSpans,
		SEC_BEAM_GAP
	} from './beam-geometry';
	import { isCursorBeat, inSelection, isPlayingBeat } from './predicates';
	import { noteheadStyle, deadHeadStyle } from './note-styles';

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

	const BRAVURA = "[font-family:'Bravura',serif] fill-[#18181b]";
	const BG_CURSOR = 'fill-[rgba(24,24,27,0.16)] [rx:3]';
	const BG_SEL = 'fill-[rgba(24,24,27,0.07)] [rx:3]';
	const BG_PLAY = 'fill-[rgba(24,24,27,0.28)] [rx:3]';
	const MARK_LINE = 'stroke-[#52525b] [stroke-width:1.1] fill-none';

	// Below-staff line for dynamics; above-staff strip for fermata/tuplets/8va.
	const staffBottom = METRICS.stdTopPad + 5 * METRICS.staffLineGap;
</script>

<!-- Tuplet brackets: one per run of same-size tuplet beats, above the staff. -->
{#each tupletSpans(beats) as span (span.x1)}
	{@const y = 10}
	<path d="M {span.x1 - 5} {y + 4} V {y} H {span.x2 + 5} V {y + 4}" class={MARK_LINE} />
	<rect x={(span.x1 + span.x2) / 2 - 5} y={y - 5} width="10" height="9" class="fill-paper" />
	<text x={(span.x1 + span.x2) / 2} y={y + 4} class="{BRAVURA} text-[13px] [text-anchor:middle]"
		>{tupletGlyphs(span.n)}</text
	>
{/each}
<!-- Octave signs: italic label + dashed extent over (8va/15ma) or under (8vb/15mb). -->
{#each ottavaSpans(beats) as span (span.x1)}
	{@const above = span.ottava === '8va' || span.ottava === '15ma'}
	{@const y = above ? 5 : bandHeight - 6}
	<text
		x={span.x1 - 8}
		y={y + 3}
		class="[font:italic_700_9px_ui-sans-serif,sans-serif] fill-[#52525b]">{span.ottava}</text
	>
	<line
		x1={span.x1 + 14}
		y1={y}
		x2={span.x2 + 8}
		y2={y}
		class="stroke-[#52525b] [stroke-width:1] [stroke-dasharray:3_2]"
	/>
	<line
		x1={span.x2 + 8}
		y1={y}
		x2={span.x2 + 8}
		y2={above ? y + 5 : y - 5}
		class="stroke-[#52525b] [stroke-width:1]"
	/>
{/each}

{#each beamGroups(beats) as group (group)}
	{@const members = beats.filter((b) => b.beamGroup === group)}
	{@const bl = beamLine(members)}
	<line
		x1={bl.x1}
		y1={bl.y1}
		x2={bl.x2}
		y2={bl.y2}
		class="stroke-[#18181b] [stroke-width:3.4] [stroke-linecap:butt]"
	/>
	{#each members as m, mi (m.index)}
		{@const sx = stemX(m)}
		{@const yb = beamYAt(bl, sx)}
		<!-- Stem runs from the notehead column straight to the beam, so heads,
		     stems and beam always meet. -->
		<line
			x1={sx}
			y1={m.stemDir === 1 ? m.noteBottom : m.noteTop}
			x2={sx}
			y2={yb}
			class="stroke-[#18181b] [stroke-width:1.4]"
		/>
		{#if m.beams >= 2}
			{#if mi < members.length - 1 && members[mi + 1].beams >= 2}
				<!-- Secondary (16th/32nd) beam fully connects neighbouring members. -->
				{@const sx2 = stemX(members[mi + 1])}
				<line
					x1={sx}
					y1={yb + bl.dir * SEC_BEAM_GAP}
					x2={sx2}
					y2={beamYAt(bl, sx2) + bl.dir * SEC_BEAM_GAP}
					class="stroke-[#18181b] [stroke-width:3.4] [stroke-linecap:butt]"
				/>
			{:else if mi === 0 || members[mi - 1].beams < 2}
				<!-- Isolated short note: stub points back toward its group. -->
				{@const sxe = sx + (mi === members.length - 1 ? -7 : 7)}
				<line
					x1={sx}
					y1={yb + bl.dir * SEC_BEAM_GAP}
					x2={sxe}
					y2={beamYAt(bl, sxe) + bl.dir * SEC_BEAM_GAP}
					class="stroke-[#18181b] [stroke-width:3.4] [stroke-linecap:butt]"
				/>
			{/if}
		{/if}
	{/each}
{/each}
{#each beats as beat (beat.index)}
	{#if vIdx === 0 && isPlayingBeat(measureIndex, beat.index)}
		<rect x={beat.x - 9} y="2" width="18" height={bandHeight - 4} class={BG_PLAY} />
	{:else if isCursorBeat(measureIndex, beat.index, vIdx, isActiveTrack)}
		<rect x={beat.x - 9} y="2" width="18" height={bandHeight - 4} class={BG_CURSOR} />
	{:else if vIdx === 0 && inSelection(measureIndex, beat.index, trackIndex)}
		<rect x={beat.x - 9} y="2" width="18" height={bandHeight - 4} class={BG_SEL} />
	{/if}
	{#if beat.fermata}
		<text x={beat.x - 6} y={13} class="{BRAVURA} text-[20px]">{GLYPH.fermataAbove}</text>
	{/if}
	{#if beat.dynamic}
		<text x={beat.x} y={staffBottom + 22} class="{BRAVURA} text-[18px] [text-anchor:middle]"
			>{dynamicGlyph(beat.dynamic)}</text
		>
	{/if}
	{#if beat.rest}
		<text
			x={beat.x - 4}
			y={METRICS.stdTopPad + 3 * METRICS.staffLineGap}
			class="{BRAVURA} text-[26px]">{restGlyph(beat.duration)}</text
		>
		{#if beat.dotted}
			<circle
				cx={beat.x + 9}
				cy={METRICS.stdTopPad + 3 * METRICS.staffLineGap - 3}
				r="1.6"
				class="fill-[#18181b]"
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
					class="stroke-[#a1a1aa] [stroke-width:1]"
				/>
			{/each}
		{/each}
		{#if beat.notes.some((n) => n.techniques.includes('tremolo'))}
			<!-- Tremolo picking: three slashes across the stem (or above a whole note). -->
			{@const tx = beat.duration === 1 ? beat.x + 12 : stemX(beat)}
			{@const ty = beat.stemDir === 1 ? beat.stdStemTop + 7 : beat.stdStemBottom - 15}
			{#each [0, 4, 8] as dy (dy)}
				<line
					x1={tx - 4}
					y1={ty + dy + 2}
					x2={tx + 4}
					y2={ty + dy - 2}
					class="stroke-[#18181b] [stroke-width:1.6]"
				/>
			{/each}
		{/if}
		{#if beat.duration !== 1 && beat.beamGroup === -1}
			<line
				x1={stemX(beat)}
				y1={beat.stemDir === 1 ? beat.stdStemBottom : beat.stdStemTop}
				x2={stemX(beat)}
				y2={beat.stemDir === 1 ? beat.stdStemTop : beat.stdStemBottom}
				class="stroke-[#18181b] [stroke-width:1.4]"
			/>
			{#if beat.beams > 0}
				<!-- Flag baseline sits exactly at the stem tip (SMuFL flags anchor
				     there), with the direction-matched glyph — an up flag hung on a
				     down stem (or a baseline shift) leaves the flag floating off the
				     stem. -->
				<text
					x={stemX(beat)}
					y={beat.stemDir === 1 ? beat.stdStemTop : beat.stdStemBottom}
					class="{BRAVURA} text-[26px]">{flagGlyph(beat.beams, beat.stemDir)}</text
				>
			{/if}
		{/if}
		{#each beat.notes as n (n.string)}
			{#if n.accidental}
				<text x={n.x - 15} y={n.stdY + 4} class="{BRAVURA} text-[24px]"
					>{accidentalGlyph(n.accidental)}</text
				>
			{/if}
			{#if n.dead}
				<!-- Dead/muted note: an X notehead (no pitched ellipse), drawn at the
				     open-string staff position computed in layout. -->
				<text x={n.x + n.headXOffset} y={n.stdY + 4} class={deadHeadStyle({ v2: vIdx === 1 })}
					>✕</text
				>
			{:else}
				<ellipse
					cx={n.x + n.headXOffset}
					cy={n.stdY}
					rx="6"
					ry="4.4"
					class={noteheadStyle({
						hollow: beat.duration <= 2,
						v2: vIdx === 1,
						ghost: n.techniques.includes('ghost')
					})}
					transform="rotate(-20 {n.x + n.headXOffset} {n.stdY})"
					><title>{midiToNote(n.midi)}</title></ellipse
				>
			{/if}
			{#if beat.dotted}
				<circle cx={n.x + n.headXOffset + 11} cy={n.stdY} r="1.6" class="fill-[#18181b]" />
			{/if}
			{@const markY = beat.stemDir === 1 ? n.stdY - 12 : n.stdY + 14}
			{#if n.techniques.includes('trill')}
				<text
					x={n.x + n.headXOffset}
					y={markY + 2}
					class="[font:italic_600_9px_ui-sans-serif,sans-serif] fill-[#71717a] [text-anchor:middle]"
					>tr</text
				>
			{/if}
			{#if n.techniques.includes('artificial-harmonic')}
				<text
					x={n.x + n.headXOffset}
					y={markY - 2}
					class="[font:600_8px_ui-sans-serif,sans-serif] fill-[#71717a] [text-anchor:middle]"
					>A.H.</text
				>
			{/if}
			{#if n.tie}
				{@const ud = beat.stemDir === 1 ? 1 : -1}
				<path
					d="M {n.x + n.headXOffset + 7} {n.stdY + ud * 3} Q {(n.x + n.headXOffset + n.tie.x2) /
						2} {n.stdY + ud * 11} {n.tie.x2 - 7} {n.tie.stdY2 + ud * 3}"
					class="fill-none stroke-[#18181b] [stroke-width:1.3]"
				/>
			{/if}
		{/each}
		<!-- Articulations (accent / marcato / tenuto / staccato): one mark per
		     beat, centred over the chord on the side away from the beam — never
		     one symbol per notehead. Stacked outward when a beat carries more
		     than one. -->
		{#if beat.notes.length}
			{@const up = beat.stemDir === 1}
			{@const ys = beat.notes.map((n) => n.stdY)}
			{@const anchorY = up ? Math.min(...ys) - 12 : Math.max(...ys) + 14}
			{#each beatArticulations(beat) as art, ai (art)}
				{@const ay = anchorY + (up ? -ai * 8 : ai * 8)}
				{#if art === 'staccato'}
					<circle cx={beat.x} cy={ay} r="1.8" class="fill-[#18181b]" />
				{:else if art === 'tenuto'}
					<line
						x1={beat.x - 4}
						y1={ay}
						x2={beat.x + 4}
						y2={ay}
						class="stroke-[#18181b] [stroke-width:1.6]"
					/>
				{:else if art === 'accent'}
					<text
						x={beat.x}
						y={ay + 4}
						class="text-[13px] font-bold fill-[#18181b] [text-anchor:middle]">›</text
					>
				{:else if art === 'heavy-accent'}
					<text
						x={beat.x}
						y={ay + 4}
						class="text-[11px] font-bold fill-[#18181b] [text-anchor:middle]">^</text
					>
				{/if}
			{/each}
		{/if}
	{/if}
{/each}
