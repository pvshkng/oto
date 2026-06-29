<script lang="ts">
	// Bottom edit panel. Switches between the on-screen Keypad and the Fretboard
	// (never both), and exposes every note control: duration, dotted, voice,
	// per-bar time signature, insert/delete and effects, so you never have to
	// reach back up to a toolbar while entering music.

	import { store } from '$lib/stores/score.svelte';
	import { enterDigit } from '$lib/editing/entry';
	import { DURATION_ORDER } from '$lib/oto/duration';
	import { durationGlyph, AUGMENTATION_DOT } from '$lib/notation/glyphs';
	import { DURATION_LABELS, type DurationValue, type Technique } from '$lib/oto/types';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import X from 'phosphor-svelte/lib/X';
	import Numpad from 'phosphor-svelte/lib/Numpad';
	import Guitar from 'phosphor-svelte/lib/Guitar';
	import PianoKeys from 'phosphor-svelte/lib/PianoKeys';
	import ColumnsPlusLeft from 'phosphor-svelte/lib/ColumnsPlusLeft';
	import ColumnsPlusRight from 'phosphor-svelte/lib/ColumnsPlusRight';
	import Eraser from 'phosphor-svelte/lib/Eraser';

	let tsOpen = $state(false);

	const EFFECTS: { tech: Technique; label: string; sym: string }[] = [
		{ tech: 'hammer', label: 'Hammer / Pull', sym: 'H/P' },
		{ tech: 'slide', label: 'Slide', sym: '/' },
		{ tech: 'bend', label: 'Bend', sym: '⤴' },
		{ tech: 'vibrato', label: 'Vibrato', sym: '∿' },
		{ tech: 'palm-mute', label: 'Palm mute', sym: 'P.M' },
		{ tech: 'let-ring', label: 'Let ring', sym: 'L.R' },
		{ tech: 'harmonic', label: 'Harmonic', sym: '◇' },
		{ tech: 'dead', label: 'Dead', sym: '✕' },
		{ tech: 'staccato', label: 'Staccato', sym: '·' },
		{ tech: 'ghost', label: 'Ghost', sym: '( )' }
	];

	const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'];

	const note = $derived(store.currentNote);
	const barTs = $derived(store.timeSignatureAt(store.cursor.measure));
	const barTsLabel = $derived(`${barTs[0]}/${barTs[1]}`);

	function pickDuration(d: DurationValue) {
		store.activeDuration = d;
		store.setBeatDuration(d, store.activeDotted);
	}
	function toggleDot() {
		store.activeDotted = !store.activeDotted;
		store.setBeatDuration(store.activeDuration, store.activeDotted);
	}
	function setBarTs(v: string) {
		const [n, d] = v.split('/').map(Number);
		store.setMeasureTimeSignature(store.cursor.measure, n, d);
	}
	function hasTech(t: Technique) {
		return note?.techniques?.includes(t) ?? false;
	}
</script>

<div class="edit-panel">
	<div class="tabs">
		<div class="seg">
			<button
				class="seg-btn"
				class:sunk={store.editTool === 'keypad'}
				title="Keypad"
				aria-label="Keypad"
				aria-pressed={store.editTool === 'keypad'}
				onclick={() => (store.editTool = 'keypad')}
			>
				<Numpad class="size-4" />
			</button>
			<button
				class="seg-btn"
				class:sunk={store.editTool === 'fretboard'}
				title="Fretboard"
				aria-label="Fretboard"
				aria-pressed={store.editTool === 'fretboard'}
				onclick={() => (store.editTool = 'fretboard')}
			>
				<Guitar class="size-4" />
			</button>
			<button
				class="seg-btn"
				class:sunk={store.editTool === 'piano'}
				title="Piano"
				aria-label="Piano"
				aria-pressed={store.editTool === 'piano'}
				onclick={() => (store.editTool = 'piano')}
			>
				<PianoKeys class="size-4" />
			</button>
		</div>
		<button
			class="hide"
			onclick={() => (store.editMode = false)}
			title="Hide edit panel"
			aria-label="Hide edit panel"
		>
			<X class="size-5" />
		</button>
	</div>

	<!-- Note controls (apply to the selected beat / note) -->
	<div class="controls">
		<div class="grp">
			<div class="seg-group">
				{#each DURATION_ORDER as d (d)}
					<button
						class="ctl gl seg-item"
						class:sunk={store.activeDuration === d}
						title={DURATION_LABELS[d]}
						aria-label={DURATION_LABELS[d]}
						aria-pressed={store.activeDuration === d}
						onclick={() => pickDuration(d)}><span class="bravura">{durationGlyph(d)}</span></button
					>
				{/each}
			</div>
			<button
				class="ctl gl dotted"
				class:sunk={store.activeDotted}
				title="Dotted"
				aria-label="Dotted"
				aria-pressed={store.activeDotted}
				onclick={toggleDot}
				><span class="bravura">{durationGlyph(4)}{AUGMENTATION_DOT}</span></button
			>
		</div>

		<span class="div"></span>

		<div class="grp">
			<div class="seg-group">
				<button
					class="ctl seg-item"
					class:sunk={store.cursor.voice === 0}
					onclick={() => store.setVoice(0)}>V1</button
				>
				<button
					class="ctl seg-item v2"
					class:sunk={store.cursor.voice === 1}
					title="Second voice"
					onclick={() => store.setVoice(1)}>V2</button
				>
			</div>
		</div>

		<span class="div"></span>

		<div class="grp ts">
			<span class="lbl">Bar</span>
			<Popover.Root bind:open={tsOpen}>
				<Popover.Trigger
					class="border-input bg-background hover:bg-accent text-foreground inline-flex h-9 items-center rounded-md border px-3 text-sm font-bold tabular-nums"
					>{barTsLabel}</Popover.Trigger
				>
				<Popover.Content side="top" class="w-28 p-1" sideOffset={6}>
					<div class="grid grid-cols-2 gap-1">
						{#each TIME_SIGS as t (t)}
							<button
								class={cn(
									'rounded-sm px-2 py-1.5 text-sm font-semibold tabular-nums',
									barTsLabel === t
										? 'bg-primary text-primary-foreground'
										: 'hover:bg-accent text-foreground'
								)}
								onclick={() => {
									setBarTs(t);
									tsOpen = false;
								}}>{t}</button
							>
						{/each}
					</div>
				</Popover.Content>
			</Popover.Root>
		</div>

		<span class="div"></span>

		<div class="grp">
			<button
				class="ctl icon"
				title="Insert beat before"
				aria-label="Insert beat before"
				onclick={() => store.insertBeatBefore()}
			>
				<ColumnsPlusLeft class="size-5" />
			</button>
			<button
				class="ctl icon"
				title="Insert beat after"
				aria-label="Insert beat after"
				onclick={() => store.insertBeat()}
			>
				<ColumnsPlusRight class="size-5" />
			</button>
			<button
				class="ctl icon"
				title="Delete beat"
				aria-label="Delete beat"
				onclick={() => store.deleteBeat()}
			>
				<Eraser class="size-5" />
			</button>
		</div>
	</div>

	<!-- Effects -->
	<div class="effects">
		{#each EFFECTS as e (e.tech)}
			<button
				class="fx"
				class:sunk={hasTech(e.tech)}
				disabled={!note}
				title={e.label}
				onclick={() => store.toggleTechnique(e.tech)}>{e.sym}</button
			>
		{/each}
	</div>

	<!-- Tool -->
	{#if store.editTool === 'keypad'}
		<div class="keypad">
			{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as d (d)}
				<button class="key" onclick={() => enterDigit(d)}>{d}</button>
			{/each}
			<button class="key wide" onclick={() => store.deleteNoteAtCursor()}>⌫</button>
			<button class="key" onclick={() => store.moveCursor('up')}>▲</button>
			<button class="key" onclick={() => store.moveCursor('down')}>▼</button>
			<button class="key" onclick={() => store.moveCursor('left')}>◀</button>
			<button class="key" onclick={() => store.moveCursor('right')}>▶</button>
		</div>
	{:else if store.editTool === 'fretboard'}
		<div class="fretboard-wrap">
			{#await import('./Fretboard.svelte') then { default: Fretboard }}
				<Fretboard />
			{/await}
		</div>
	{:else}
		<div class="fretboard-wrap">
			{#await import('./Piano.svelte') then { default: Piano }}
				<Piano />
			{/await}
		</div>
	{/if}
</div>

<style>
	.edit-panel {
		background: var(--panel);
		border-top: 1px solid var(--border-strong);
		padding: 8px 10px 6px;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.tabs {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.seg {
		display: inline-flex;
		align-items: stretch;
	}
	.seg-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 32px;
		border: 1px solid var(--border-strong);
		border-left-width: 0;
		background: linear-gradient(to bottom, #ffffff, #f5f5f4);
		color: var(--text-muted);
		cursor: pointer;
	}
	.seg-btn:first-child {
		border-left-width: 1px;
		border-radius: var(--r-xs) 0 0 var(--r-xs);
	}
	.seg-btn:last-child {
		border-radius: 0 var(--r-xs) var(--r-xs) 0;
	}
	.seg-btn.sunk {
		color: var(--ink);
	}
	.hide {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		width: 32px;
		height: 32px;
		color: var(--text-muted);
		cursor: pointer;
	}
	.hide:hover {
		color: var(--ink);
	}
	.controls,
	.effects {
		display: flex;
		align-items: center;
		gap: 4px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.controls::-webkit-scrollbar,
	.effects::-webkit-scrollbar {
		display: none;
	}
	.grp {
		display: inline-flex;
		gap: 3px;
		align-items: center;
		flex: none;
	}
	.div {
		width: 1px;
		height: 20px;
		background: var(--border-strong);
		flex: none;
		margin: 0 2px;
	}
	.ctl,
	.fx {
		min-width: 34px;
		height: 36px;
		padding: 0 9px;
		border: 1px solid var(--border-strong);
		background: linear-gradient(to bottom, #ffffff, #f5f5f4);
		border-radius: var(--r-xs);
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
		cursor: pointer;
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	/* Duration glyphs are drawn from Bravura (see notation/glyphs.ts) so every
	   note value renders at one consistent size across platforms, instead of the
	   system font's Musical-Symbol code points which sized inconsistently. Each
	   glyph has a different natural width (whole vs. 32nd note), so the glyph
	   sits in a fixed-width, centered box rather than sizing to its own content —
	   that's what keeps every duration button the same small footprint. */
	.ctl.gl {
		padding: 0 6px;
	}
	.ctl.gl .bravura {
		font-family: 'Bravura', serif;
		font-size: 18px;
		line-height: 1;
		width: 20px;
		padding-top: 12px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	/* The dotted button packs two glyphs (note + augmentation dot) into one
	   span, so it needs its own width instead of the single-glyph fixed box. */
	.ctl.gl.dotted .bravura {
		width: auto;
		gap: 1px;
	}
	.ctl.icon {
		color: var(--ink);
	}
	/* Segmented controls (durations, voices): buttons butt together sharing a
	   border, only the outer ends rounded — like the keypad/fretboard/piano tabs. */
	.seg-group {
		display: inline-flex;
		align-items: stretch;
		flex: none;
	}
	.seg-group .seg-item {
		border-radius: 0;
		border-left-width: 0;
	}
	.seg-group .seg-item:first-child {
		border-left-width: 1px;
		border-radius: var(--r-xs) 0 0 var(--r-xs);
	}
	.seg-group .seg-item:last-child {
		border-radius: 0 var(--r-xs) var(--r-xs) 0;
	}
	.fx:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.ts {
		gap: 5px;
	}
	.lbl {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		font-weight: 700;
	}
	:global(.ts-trig) {
		height: 36px;
		padding: 0 12px !important;
		width: auto !important;
		font-weight: 700 !important;
		border-radius: var(--r-xs) !important;
	}
	.keypad {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 5px;
	}
	.key {
		min-height: 46px;
		font-size: 18px;
		font-weight: 600;
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		background: var(--paper);
		color: var(--ink);
		cursor: pointer;
	}
	.key:active {
		background: var(--panel-2);
	}
	.key.wide {
		background: var(--ink);
		color: var(--accent-ink);
		border-color: var(--ink);
	}
	@media (max-width: 720px) {
		.ctl,
		.fx {
			height: 40px;
			min-width: 38px;
		}
		.key {
			min-height: 52px;
		}
	}
</style>
