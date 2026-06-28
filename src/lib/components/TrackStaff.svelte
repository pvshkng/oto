<script lang="ts">
	// Renders one track as crisp SVG: standard staff, tablature and/or rhythm.
	// Click anywhere to move the edit cursor; shift-click extends the loop
	// selection. Layout geometry comes from notation/layout.ts.

	import { store } from '$lib/stores/score.svelte';
	import { layoutTrack, METRICS, type LaidBeat, type LaidMeasure } from '$lib/notation/layout';
	import { GLYPH, restGlyph, timeSigGlyphs, accidentalGlyph } from '$lib/notation/glyphs';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { DURATION_ORDER } from '$lib/oto/duration';
	import { DURATION_LABELS, TECHNIQUE_LABELS, type DurationValue } from '$lib/oto/types';
	import {
		EFFECT_LIST,
		TIME_SIGS,
		setDuration,
		toggleDotted,
		setBarTimeSig,
		hasTech
	} from '$lib/commands';

	let { trackIndex }: { trackIndex: number } = $props();

	const DUR_GLYPHS: Record<DurationValue, string> = {
		1: '𝅝',
		2: '𝅗𝅥',
		4: '♩',
		8: '♪',
		16: '𝅘𝅥𝅯',
		32: '𝅘𝅥𝅰'
	};

	const ctxNote = $derived(store.currentNote);

	let containerWidth = $state(800);
	let container: HTMLDivElement;

	const track = $derived(store.score.tracks[trackIndex]);
	const layout = $derived(
		layoutTrack(store.score, track, {
			containerWidth: containerWidth - 8,
			showStandard: track.view.standard,
			showTab: track.view.tab,
			showRhythm: track.view.rhythm
		})
	);

	const isActiveTrack = $derived(store.cursor.track === trackIndex);

	// Runs of consecutive beats that contain a let-ring note → drawn as a bracket.
	function letRingSpans(beats: LaidBeat[]): { x1: number; x2: number }[] {
		const spans: { x1: number; x2: number }[] = [];
		let start = -1;
		for (let i = 0; i < beats.length; i++) {
			const has = beats[i].notes.some((n) => n.techniques.includes('let-ring'));
			if (has && start < 0) start = i;
			if (!has && start >= 0) {
				spans.push({ x1: beats[start].x, x2: beats[i - 1].x });
				start = -1;
			}
		}
		if (start >= 0) spans.push({ x1: beats[start].x, x2: beats[beats.length - 1].x });
		return spans;
	}

	function beamGroups(beats: LaidBeat[]): number[] {
		const groups: number[] = [];
		for (const b of beats)
			if (b.beamGroup >= 0 && !groups.includes(b.beamGroup)) groups.push(b.beamGroup);
		return groups.sort((a, b) => a - b);
	}

	// Stems attach to the side of the notehead column: right for up-stems, left
	// for down-stems. Half a notehead width keeps them flush against the heads.
	function stemX(b: LaidBeat): number {
		return b.x + b.stemDir * 6.5;
	}

	const STEM = 26; // nominal stem length beyond the furthest notehead
	const MIN_STEM = 14; // never let a stem get shorter than this
	const MAX_SLOPE = 0.22; // cap beam slant so it stays legible
	const SEC_BEAM_GAP = 4.5; // vertical offset of secondary (16th) beams

	interface BeamGeom {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		dir: 1 | -1;
	}

	// A slanted beam line for a group: follows the pitch contour of its first and
	// last members, clamps the slope, then shifts so every stem clears its
	// noteheads with at least MIN_STEM of length.
	function beamLine(members: LaidBeat[]): BeamGeom {
		const dir = members[0].stemDir;
		const x1 = stemX(members[0]);
		const x2 = stemX(members[members.length - 1]);
		const dx = x2 - x1 || 1;
		const edge = (b: LaidBeat) => (dir === 1 ? b.noteTop - STEM : b.noteBottom + STEM);
		let y1 = edge(members[0]);
		let y2 = edge(members[members.length - 1]);

		// Clamp slope around the midpoint.
		let slope = (y2 - y1) / dx;
		slope = Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, slope));
		const midX = (x1 + x2) / 2;
		const midY = (y1 + y2) / 2;
		y1 = midY - slope * (midX - x1);
		y2 = midY + slope * (x2 - midX);

		// Lift/lower the whole line until no stem is shorter than MIN_STEM.
		for (const m of members) {
			const yAt = y1 + (y2 - y1) * ((stemX(m) - x1) / dx);
			if (dir === 1) {
				const required = m.noteTop - MIN_STEM;
				if (yAt > required) {
					y1 -= yAt - required;
					y2 -= yAt - required;
				}
			} else {
				const required = m.noteBottom + MIN_STEM;
				if (yAt < required) {
					y1 += required - yAt;
					y2 += required - yAt;
				}
			}
		}
		return { x1, y1, x2, y2, dir };
	}

	function beamYAt(bl: BeamGeom, x: number): number {
		return bl.y1 + (bl.y2 - bl.y1) * ((x - bl.x1) / (bl.x2 - bl.x1 || 1));
	}

	/** Nearest (beat, string) for a pointer event within a band's <g>. */
	function locate(
		e: MouseEvent | PointerEvent,
		measure: LaidMeasure,
		band: 'tab' | 'standard' | 'rhythm'
	): { beat: number; string: number } {
		const svg = (e.currentTarget as SVGGElement).ownerSVGElement!;
		const rect = svg.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

		let best = 0;
		let bestD = Infinity;
		measure.beats.forEach((b, i) => {
			const d = Math.abs(b.x - px);
			if (d < bestD) {
				bestD = d;
				best = i;
			}
		});

		let string = store.cursor.string;
		if (band === 'tab' && layout.bands.tab) {
			const localY = py - sysOffsetFor(measure) - layout.bands.tab.offsetY - 14;
			string = Math.max(
				0,
				Math.min(track.tuning.length - 1, Math.round(localY / METRICS.tabLineGap))
			);
		}
		return { beat: best, string };
	}

	function handleClick(e: MouseEvent, measure: LaidMeasure, band: 'tab' | 'standard' | 'rhythm') {
		const { beat, string } = locate(e, measure, band);
		if (e.shiftKey) {
			store.setCursor({ track: trackIndex });
			store.setSelectionTo(measure.index, beat);
		} else {
			store.setCursor({ track: trackIndex, measure: measure.index, beat, string });
			store.clearSelection();
		}
	}

	// Double tap/click on a note or the tab band toggles the note editor open
	// (pulling up the keypad), so touch users get in and out of edit mode
	// without reaching for the bottom bar.
	function handleDoubleClick(
		e: MouseEvent,
		measure: LaidMeasure,
		band: 'tab' | 'standard' | 'rhythm'
	) {
		handleClick(e, measure, band);
		if (store.editMode) {
			store.editMode = false;
		} else {
			store.editTool = 'keypad';
			store.editMode = true;
		}
	}

	// Prime the cursor on press so a long-press / right-click context menu acts on
	// the beat and string under the finger, not wherever the cursor happened to be.
	function primeContext(
		e: PointerEvent,
		measure: LaidMeasure,
		band: 'tab' | 'standard' | 'rhythm'
	) {
		if (e.shiftKey) return;
		const { beat, string } = locate(e, measure, band);
		store.setCursor({ track: trackIndex, measure: measure.index, beat, string });
	}

	// We render each system in its own translated <g>; track its y offset.
	function sysOffsetFor(measure: LaidMeasure): number {
		for (const s of layout.systems) {
			if (s.measures.includes(measure)) return s.y;
		}
		return 0;
	}

	function isCursorBeat(measureIndex: number, beatIndex: number, voice = 0): boolean {
		return (
			isActiveTrack &&
			store.cursor.voice === voice &&
			store.cursor.measure === measureIndex &&
			store.cursor.beat === beatIndex
		);
	}

	function inSelection(measureIndex: number, beatIndex: number): boolean {
		const b = store.loopBounds;
		if (!b || store.selection?.track !== trackIndex) return false;
		const key = measureIndex * 1000 + beatIndex;
		return key >= b.startMeasure * 1000 + b.startBeat && key <= b.endMeasure * 1000 + b.endBeat;
	}

	function isPlayingBeat(measureIndex: number, beatIndex: number): boolean {
		return store.playhead?.measure === measureIndex && store.playhead?.beat === beatIndex;
	}

	$effect(() => {
		if (!container) return;
		const ro = new ResizeObserver((entries) => {
			containerWidth = entries[0].contentRect.width;
		});
		ro.observe(container);
		return () => ro.disconnect();
	});
</script>

<!-- One voice of the standard staff: beams, then per-beat rests/noteheads/stems. -->
{#snippet stdVoice(beats: LaidBeat[], measureIndex: number, vIdx: number, bandHeight: number)}
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
		{:else if isCursorBeat(measureIndex, beat.index, vIdx)}
			<rect x={beat.x - 9} y="2" width="18" height={bandHeight - 4} class="bg-cursor" />
		{:else if vIdx === 0 && inSelection(measureIndex, beat.index)}
			<rect x={beat.x - 9} y="2" width="18" height={bandHeight - 4} class="bg-sel" />
		{/if}
		{#if beat.rest}
			<text x={beat.x - 4} y={12 + 3 * METRICS.staffLineGap} class="bravura rest"
				>{restGlyph(beat.duration)}</text
			>
			{#if beat.dotted}
				<circle cx={beat.x + 9} cy={12 + 3 * METRICS.staffLineGap - 3} r="1.6" class="dot" />
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
				<ellipse
					cx={n.x + n.headXOffset}
					cy={n.stdY}
					rx="6"
					ry="4.4"
					class="notehead"
					class:hollow={beat.duration <= 2}
					class:v2={vIdx === 1}
					transform="rotate(-20 {n.x + n.headXOffset} {n.stdY})"
				/>
				{#if beat.dotted}
					<circle cx={n.x + n.headXOffset + 11} cy={n.stdY} r="1.6" class="dot" />
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
{/snippet}

<!-- One voice of the tab band: frets + effect markers. -->
{#snippet tabVoice(beats: LaidBeat[], measureIndex: number, vIdx: number, bandHeight: number)}
	{#each letRingSpans(beats) as span (span.x1)}
		<text x={span.x1 - 7} y={9} class="lr-label">let ring</text>
		<line x1={span.x1 + 33} y1={6} x2={span.x2 + 7} y2={6} class="lr-line" />
		<line x1={span.x2 + 7} y1={6} x2={span.x2 + 7} y2={12} class="lr-line" />
	{/each}
	{#each beats as beat (beat.index)}
		{#if vIdx === 0 && isPlayingBeat(measureIndex, beat.index)}
			<rect x={beat.x - 9} y="6" width="18" height={bandHeight - 12} class="bg-play" />
		{:else if isCursorBeat(measureIndex, beat.index, vIdx)}
			<rect x={beat.x - 9} y="6" width="18" height={bandHeight - 12} class="bg-cursor" />
			{#if isActiveTrack}
				<rect
					x={beat.x - 9}
					y={14 + store.cursor.string * METRICS.tabLineGap - 6}
					width="18"
					height="12"
					class="bg-string"
				/>
			{/if}
		{:else if vIdx === 0 && inSelection(measureIndex, beat.index)}
			<rect x={beat.x - 9} y="6" width="18" height={bandHeight - 12} class="bg-sel" />
		{/if}
		{#each beat.notes as n (n.string)}
			{@const isDead = n.techniques.includes('dead')}
			<rect x={n.x - 7} y={n.tabY - 6} width="14" height="12" class="fret-bg" />
			<text x={n.x} y={n.tabY + 4} class="fret" class:muted-note={isDead} class:v2={vIdx === 1}
				>{isDead ? 'x' : n.fret}</text
			>
			{#if n.techniques.includes('palm-mute')}
				<text x={n.x} y={n.tabY - 9} class="fx">P.M.</text>
			{/if}
			{#if n.techniques.includes('vibrato')}
				<text x={n.x + 10} y={n.tabY + 4} class="fx-sym">∿</text>
			{/if}
			{#if n.techniques.includes('bend')}
				<path d="M {n.x + 8} {n.tabY} q 10 -2 12 -14" class="bend-arrow" />
				<text x={n.x + 20} y={n.tabY - 12} class="fx"
					>{n.bend === 0.5 ? '½' : n.bend === 1 ? 'full' : (n.bend ?? 'full')}</text
				>
			{/if}
			{#if n.techniques.includes('slide') && n.slideTo !== undefined}
				<line
					x1={n.x + 8}
					y1={n.tabY + (n.slideTo > n.fret ? 3 : -3)}
					x2={n.x + 24}
					y2={n.tabY + (n.slideTo > n.fret ? -3 : 3)}
					class="slide-line"
				/>
			{/if}
			{#if n.techniques.includes('hammer') || n.techniques.includes('pull')}
				<path d="M {n.x + 8} {n.tabY - 4} q 8 -8 16 0" class="legato" />
			{/if}
			{#if n.techniques.includes('harmonic')}
				<text x={n.x} y={n.tabY - 9} class="fx">◇</text>
			{/if}
			{#if n.tie}
				<path
					d="M {n.x + 7} {n.tabY - 5} Q {(n.x + n.tie.x2) / 2} {n.tabY - 13} {n.tie.x2 - 7} {n.tie
						.tabY2 - 5}"
					class="tie"
				/>
			{/if}
		{/each}
	{/each}
{/snippet}

<ContextMenu.Root>
	<ContextMenu.Trigger class="ctx-anchor">
		<div class="track-staff" bind:this={container} class:active={isActiveTrack}>
			{#each layout.systems as system (system.y)}
				<svg
					class="system"
					width={Math.max(system.width, containerWidth - 8)}
					height={system.height}
					role="presentation"
				>
					{#each system.measures as measure (measure.index)}
						<!-- ===== Standard staff band ===== -->
						{#if layout.bands.standard}
							{@const band = layout.bands.standard}
							<g
								transform="translate(0,{band.offsetY})"
								onclick={(e) => handleClick(e, measure, 'standard')}
								ondblclick={(e) => handleDoubleClick(e, measure, 'standard')}
								onpointerdown={(e) => primeContext(e, measure, 'standard')}
								role="presentation"
							>
								<!-- 5 staff lines -->
								{#each [0, 1, 2, 3, 4] as i (i)}
									<line
										x1={measure.x + (measure.showHeader ? 4 : 0)}
										y1={12 + METRICS.staffLineGap + i * METRICS.staffLineGap}
										x2={measure.x + measure.width}
										y2={12 + METRICS.staffLineGap + i * METRICS.staffLineGap}
										class="staff-line"
									/>
								{/each}
								<!-- barlines -->
								<line
									x1={measure.x}
									y1={12 + METRICS.staffLineGap}
									x2={measure.x}
									y2={12 + 5 * METRICS.staffLineGap}
									class="barline"
								/>
								<line
									x1={measure.x + measure.width}
									y1={12 + METRICS.staffLineGap}
									x2={measure.x + measure.width}
									y2={12 + 5 * METRICS.staffLineGap}
									class="barline"
								/>

								{#if measure.showHeader}
									<text x={measure.x + 8} y={12 + 3.4 * METRICS.staffLineGap} class="bravura clef"
										>{GLYPH.trebleClef}</text
									>
								{/if}
								{#if measure.timeSignature}
									<text
										x={measure.x + (measure.showHeader ? 34 : 6)}
										y={12 + 2 * METRICS.staffLineGap + 1}
										class="bravura tsig">{timeSigGlyphs(measure.timeSignature[0])}</text
									>
									<text
										x={measure.x + (measure.showHeader ? 34 : 6)}
										y={12 + 4 * METRICS.staffLineGap + 1}
										class="bravura tsig">{timeSigGlyphs(measure.timeSignature[1])}</text
									>
								{/if}

								{@render stdVoice(measure.beats, measure.index, 0, band.height)}
								{#if measure.voice2}
									{@render stdVoice(measure.voice2, measure.index, 1, band.height)}
								{/if}
							</g>
						{/if}

						<!-- ===== Tablature band ===== -->
						{#if layout.bands.tab}
							{@const band = layout.bands.tab}
							<g
								transform="translate(0,{band.offsetY})"
								onclick={(e) => handleClick(e, measure, 'tab')}
								ondblclick={(e) => handleDoubleClick(e, measure, 'tab')}
								onpointerdown={(e) => primeContext(e, measure, 'tab')}
								role="presentation"
							>
								{#if measure.overflow}
									<rect
										x={measure.x}
										y="0"
										width={measure.width}
										height={band.height}
										class="bg-overflow"
									/>
								{/if}
								<!-- string lines -->
								{#each track.tuning as _, i (i)}
									<line
										x1={measure.x + (measure.showHeader ? 4 : 0)}
										y1={14 + i * METRICS.tabLineGap}
										x2={measure.x + measure.width}
										y2={14 + i * METRICS.tabLineGap}
										class="staff-line"
									/>
								{/each}
								<line
									x1={measure.x}
									y1={14}
									x2={measure.x}
									y2={14 + (track.tuning.length - 1) * METRICS.tabLineGap}
									class="barline"
								/>
								<line
									x1={measure.x + measure.width}
									y1={14}
									x2={measure.x + measure.width}
									y2={14 + (track.tuning.length - 1) * METRICS.tabLineGap}
									class="barline"
								/>

								{#if measure.showHeader}
									<text
										x={measure.x + 8}
										y={14 + ((track.tuning.length - 1) * METRICS.tabLineGap) / 2 + 4}
										class="tab-label">TAB</text
									>
								{/if}

								{@render tabVoice(measure.beats, measure.index, 0, band.height)}
								{#if measure.voice2}
									{@render tabVoice(measure.voice2, measure.index, 1, band.height)}
								{/if}
							</g>
						{/if}

						<!-- ===== Rhythm-only band ===== -->
						{#if layout.bands.rhythm}
							{@const band = layout.bands.rhythm}
							{@const stemTop = band.height / 2 - 18}
							<g
								transform="translate(0,{band.offsetY})"
								onclick={(e) => handleClick(e, measure, 'rhythm')}
								onpointerdown={(e) => primeContext(e, measure, 'rhythm')}
								role="presentation"
							>
								<line
									x1={measure.x}
									y1={band.height / 2}
									x2={measure.x + measure.width}
									y2={band.height / 2}
									class="staff-line"
								/>
								<line
									x1={measure.x}
									y1={band.height / 2 - 8}
									x2={measure.x}
									y2={band.height / 2 + 8}
									class="barline"
								/>
								<!-- Beams first: consecutive same-rhythm beats connect into a group. -->
								{#each beamGroups(measure.beats) as group (group)}
									{@const members = measure.beats.filter((b) => b.beamGroup === group)}
									<line
										x1={members[0].x}
										y1={stemTop}
										x2={members[members.length - 1].x}
										y2={stemTop}
										class="beam"
									/>
									{#each members as m (m.index)}
										<line x1={m.x} y1={band.height / 2} x2={m.x} y2={stemTop} class="stem" />
										{#if m.beams >= 2}
											<line x1={m.x} y1={stemTop + 4} x2={m.x + 8} y2={stemTop + 4} class="beam" />
										{/if}
									{/each}
								{/each}
								{#each measure.beats as beat (beat.index)}
									{#if beat.rest}
										<text x={beat.x - 3} y={band.height / 2 + 4} class="bravura rest"
											>{restGlyph(beat.duration)}</text
										>
									{:else}
										{#if beat.beamGroup === -1}
											<line
												x1={beat.x}
												y1={band.height / 2}
												x2={beat.x}
												y2={stemTop}
												class="stem"
											/>
											{#if beat.beams > 0}
												<text x={beat.x} y={stemTop} class="bravura flag"
													>{beat.beams === 1 ? GLYPH.flag8thUp : GLYPH.flag16thUp}</text
												>
											{/if}
										{/if}
										<ellipse
											cx={beat.x}
											cy={band.height / 2}
											rx="4.5"
											ry="3.4"
											class="notehead"
											class:hollow={beat.duration <= 2}
										/>
									{/if}
								{/each}
							</g>
						{/if}
					{/each}
				</svg>
			{/each}
		</div>
	</ContextMenu.Trigger>
	<ContextMenu.Content class="w-56">
		<div class="text-muted-foreground px-2 py-1.5 text-xs font-medium">Note</div>
		<ContextMenu.Sub>
			<ContextMenu.SubTrigger>Duration</ContextMenu.SubTrigger>
			<ContextMenu.SubContent class="w-44">
				{#each DURATION_ORDER as d (d)}
					<ContextMenu.Item onSelect={() => setDuration(d)}>
						<span class="w-4 text-center text-base leading-none">{DUR_GLYPHS[d]}</span>
						<span>{DURATION_LABELS[d]}</span>
						{#if store.activeDuration === d}<span class="ml-auto">●</span>{/if}
					</ContextMenu.Item>
				{/each}
				<ContextMenu.Separator />
				<ContextMenu.Item onSelect={toggleDotted}>
					<span>Dotted</span>
					{#if store.activeDotted}<span class="ml-auto">●</span>{/if}
				</ContextMenu.Item>
			</ContextMenu.SubContent>
		</ContextMenu.Sub>

		<ContextMenu.Sub>
			<ContextMenu.SubTrigger disabled={!ctxNote}>Effects</ContextMenu.SubTrigger>
			<ContextMenu.SubContent class="w-44">
				{#each EFFECT_LIST as t (t)}
					<ContextMenu.Item onSelect={() => store.toggleTechnique(t)}>
						<span>{TECHNIQUE_LABELS[t]}</span>
						{#if hasTech(t)}<span class="ml-auto">●</span>{/if}
					</ContextMenu.Item>
				{/each}
			</ContextMenu.SubContent>
		</ContextMenu.Sub>

		<ContextMenu.Item
			disabled={!ctxNote}
			variant="destructive"
			onSelect={() => store.deleteNoteAtCursor()}
		>
			Delete note
		</ContextMenu.Item>

		<ContextMenu.Separator />
		<div class="text-muted-foreground px-2 py-1.5 text-xs font-medium">
			Bar {store.cursor.measure + 1}
		</div>

		<ContextMenu.Item onSelect={() => store.insertMeasureAt(store.cursor.measure)}>
			Insert bar before
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => store.insertMeasureAt(store.cursor.measure + 1)}>
			Insert bar after
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => store.duplicateMeasureAt(store.cursor.measure)}>
			Duplicate bar
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => store.clearMeasureAt(store.cursor.measure)}>
			Clear bar
		</ContextMenu.Item>

		<ContextMenu.Sub>
			<ContextMenu.SubTrigger>Time signature</ContextMenu.SubTrigger>
			<ContextMenu.SubContent class="w-32">
				{#each TIME_SIGS as ts (ts)}
					<ContextMenu.Item onSelect={() => setBarTimeSig(ts)}>{ts}</ContextMenu.Item>
				{/each}
			</ContextMenu.SubContent>
		</ContextMenu.Sub>

		<ContextMenu.Separator />
		<ContextMenu.Item
			variant="destructive"
			disabled={track.measures.length <= 1}
			onSelect={() => store.removeMeasureFromAll(store.cursor.measure)}
		>
			Delete bar
		</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>

<style>
	:global(.ctx-anchor) {
		display: block;
	}
	.track-staff {
		width: 100%;
		overflow-x: auto;
		background: var(--paper, #fff);
	}
	.track-staff.active {
		box-shadow: inset 0 0 0 2px var(--accent-soft, #e4e4e7);
	}
	.system {
		display: block;
	}
	.staff-line {
		stroke: #d4d4d8;
		stroke-width: 1;
	}
	.barline {
		stroke: #3f3f46;
		stroke-width: 1.4;
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
	.clef {
		font-size: 40px;
	}
	.tsig {
		font-size: 26px;
	}
	.rest {
		font-size: 26px;
	}
	.flag {
		font-size: 26px;
		dominant-baseline: middle;
	}
	.tab-label {
		font:
			700 9px ui-sans-serif,
			sans-serif;
		fill: #a1a1aa;
		letter-spacing: 1px;
	}
	.fret-bg {
		fill: var(--paper, #fff);
	}
	.fret {
		font:
			600 12px ui-monospace,
			monospace;
		fill: #18181b;
		text-anchor: middle;
	}
	.fret.muted-note {
		fill: #a1a1aa;
	}
	.fret.v2 {
		fill: #71717a;
	}
	.fx {
		font:
			600 8px ui-sans-serif,
			sans-serif;
		fill: #71717a;
		text-anchor: middle;
	}
	.fx-sym {
		font-size: 12px;
		fill: #71717a;
	}
	.lr-label {
		font:
			italic 600 8px ui-sans-serif,
			sans-serif;
		fill: #71717a;
	}
	.lr-line {
		stroke: #a1a1aa;
		stroke-width: 1;
		stroke-dasharray: 3 2;
	}
	.bend-arrow {
		fill: none;
		stroke: #52525b;
		stroke-width: 1.3;
		marker-end: none;
	}
	.slide-line {
		stroke: #52525b;
		stroke-width: 1.6;
	}
	.legato {
		fill: none;
		stroke: #52525b;
		stroke-width: 1.3;
	}
	.bg-cursor {
		fill: rgba(24, 24, 27, 0.16);
		rx: 3;
	}
	.bg-sel {
		fill: rgba(24, 24, 27, 0.07);
		rx: 3;
	}
	.bg-string {
		fill: rgba(24, 24, 27, 0.14);
		rx: 2;
	}
	.bg-play {
		fill: rgba(24, 24, 27, 0.28);
		rx: 3;
	}
	.bg-overflow {
		fill: rgba(185, 28, 28, 0.1);
	}
</style>
