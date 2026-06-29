<script lang="ts">
	// Left-panel note properties for desktop mode. Shows duration, voice,
	// per-bar time signature, beat insert/delete, and technique effects —
	// the same controls as EditPanel but without the key-entry tools
	// (keypad / fretboard / piano), which live in the bottom key-input strip.

	import { store } from '$lib/stores/score.svelte';
	import { DURATION_ORDER } from '$lib/oto/duration';
	import { durationGlyph, AUGMENTATION_DOT } from '$lib/notation/glyphs';
	import { DURATION_LABELS, type DurationValue, type Technique } from '$lib/oto/types';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import X from 'phosphor-svelte/lib/X';
	import ColumnsPlusLeft from 'phosphor-svelte/lib/ColumnsPlusLeft';
	import ColumnsPlusRight from 'phosphor-svelte/lib/ColumnsPlusRight';
	import Eraser from 'phosphor-svelte/lib/Eraser';

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

	let tsOpen = $state(false);

	function rowSegmented(node: HTMLElement) {
		function update() {
			const items = [...node.children] as HTMLElement[];
			items.forEach((el) => el.classList.remove('row-first', 'row-last'));
			let prevTop = -1;
			for (let i = 0; i < items.length; i++) {
				const top = items[i].offsetTop;
				if (top !== prevTop) {
					if (prevTop !== -1) items[i - 1].classList.add('row-last');
					items[i].classList.add('row-first');
					prevTop = top;
				}
			}
			if (items.length > 0) items[items.length - 1].classList.add('row-last');
		}
		const ro = new ResizeObserver(update);
		ro.observe(node);
		update();
		return { destroy() { ro.disconnect(); } };
	}

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

<aside class="props-panel">
	<div class="panel-header">
		<span class="panel-title">Note</span>
		<button
			class="close-btn"
			title="Close note editor"
			aria-label="Close note editor"
			onclick={() => (store.editMode = false)}
		>
			<X class="size-4" />
		</button>
	</div>

	<div class="section">
		<span class="section-label">Duration</span>
		<div class="dur-row">
			<div class="seg-group" use:rowSegmented>
				{#each DURATION_ORDER as d (d)}
					<button
						class="ctl gl seg-item"
						class:sunk={store.activeDuration === d}
						title={DURATION_LABELS[d]}
						aria-label={DURATION_LABELS[d]}
						aria-pressed={store.activeDuration === d}
						onclick={() => pickDuration(d)}
					>
						<span class="bravura">{durationGlyph(d)}</span>
					</button>
				{/each}
			</div>
			<button
				class="ctl gl dotted-btn"
				class:sunk={store.activeDotted}
				title="Dotted"
				aria-label="Dotted"
				aria-pressed={store.activeDotted}
				onclick={toggleDot}
			>
				<span class="bravura">{durationGlyph(4)}{AUGMENTATION_DOT}</span>
			</button>
		</div>
	</div>

	<div class="section">
		<span class="section-label">Voice</span>
		<div class="seg-group" use:rowSegmented>
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

	<div class="section">
		<span class="section-label">Bar time sig</span>
		<Popover.Root bind:open={tsOpen}>
			<Popover.Trigger
				class="border-input bg-background hover:bg-accent text-foreground inline-flex h-9 items-center rounded-md border px-3 text-sm font-bold tabular-nums"
			>
				{barTsLabel}
			</Popover.Trigger>
			<Popover.Content side="right" class="w-28 p-1" sideOffset={6}>
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

	<div class="section">
		<span class="section-label">Beats</span>
		<div class="btn-row">
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

	<div class="section">
		<span class="section-label">Techniques</span>
		<div class="effects-grid">
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
	</div>
</aside>

<style>
	.props-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		overflow-x: hidden;
		background: var(--panel);
		border-right: 1px solid var(--border);
	}
	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.panel-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--ink);
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}
	.close-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: var(--r-xs);
	}
	.close-btn:hover {
		color: var(--ink);
		background: var(--panel-2);
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--border);
	}
	.section-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		font-weight: 700;
	}
	.btn-row {
		display: flex;
		gap: 4px;
	}
	.dur-row {
		display: flex;
		align-items: flex-start;
		gap: 5px;
		flex-wrap: wrap;
	}
	.dotted-btn {
		border-radius: var(--r-xs);
		flex-shrink: 0;
	}
	.seg-group {
		display: flex;
		align-items: stretch;
		flex-wrap: wrap;
		gap: 0;
	}
	.ctl {
		min-width: 34px;
		height: 34px;
		padding: 0 8px;
		border: 1px solid var(--border-strong);
		background: linear-gradient(to bottom, #ffffff, #f5f5f4);
		border-radius: var(--r-xs);
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.ctl.gl {
		padding: 0 5px;
	}
	.ctl.gl .bravura {
		font-family: 'Bravura', serif;
		font-size: 17px;
		line-height: 1;
		width: 18px;
		padding-top: 11px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.dotted-btn .bravura {
		width: auto;
		gap: 1px;
	}
	.ctl.icon {
		color: var(--ink);
	}
	.seg-item {
		border-radius: 0;
		border-left-width: 0;
	}
	.seg-item.row-first {
		border-left-width: 1px;
		border-radius: var(--r-xs) 0 0 var(--r-xs);
	}
	.seg-item.row-last {
		border-radius: 0 var(--r-xs) var(--r-xs) 0;
	}
	.seg-item.row-first.row-last {
		border-left-width: 1px;
		border-radius: var(--r-xs);
	}
	.effects-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 3px;
	}
	.fx {
		height: 34px;
		border: 1px solid var(--border-strong);
		background: linear-gradient(to bottom, #ffffff, #f5f5f4);
		border-radius: var(--r-xs);
		font-size: 12px;
		font-weight: 600;
		color: var(--ink);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.fx:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
