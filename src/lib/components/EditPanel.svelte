<script lang="ts">
	// Bottom edit panel. Switches between the on-screen Keypad and the Fretboard
	// (never both), and exposes every note control: duration, dotted, voice,
	// per-bar time signature, insert/delete and effects, so you never have to
	// reach back up to a toolbar while entering music.

	import { store } from '$lib/stores/score.svelte';
	import { enterDigit } from '$lib/editing/entry';
	import { DURATION_ORDER } from '$lib/oto/duration';
	import { DURATION_LABELS, type DurationValue, type Technique } from '$lib/oto/types';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import Fretboard from './Fretboard.svelte';
	import CaretLineDown from 'phosphor-svelte/lib/CaretLineDown';

	let tsOpen = $state(false);

	const GLYPHS: Record<DurationValue, string> = {
		1: '𝅝',
		2: '𝅗𝅥',
		4: '♩',
		8: '♪',
		16: '𝅘𝅥𝅯',
		32: '𝅘𝅥𝅰'
	};

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
			<button class:on={store.editTool === 'keypad'} onclick={() => (store.editTool = 'keypad')}>
				Keypad
			</button>
			<button
				class:on={store.editTool === 'fretboard'}
				onclick={() => (store.editTool = 'fretboard')}
			>
				Fretboard
			</button>
		</div>
		<button
			class="hide"
			onclick={() => (store.editMode = false)}
			title="Hide edit panel"
			aria-label="Hide edit panel"
		>
			<CaretLineDown class="size-4" weight="bold" />
		</button>
	</div>

	<!-- Note controls (apply to the selected beat / note) -->
	<div class="controls">
		<div class="grp">
			{#each DURATION_ORDER as d (d)}
				<button
					class="ctl gl"
					class:on={store.activeDuration === d}
					title={DURATION_LABELS[d]}
					onclick={() => pickDuration(d)}>{GLYPHS[d]}</button
				>
			{/each}
			<button class="ctl gl" class:on={store.activeDotted} title="Dotted" onclick={toggleDot}
				>♩<b>.</b></button
			>
		</div>

		<span class="div"></span>

		<div class="grp">
			<button class="ctl" class:on={store.cursor.voice === 0} onclick={() => store.setVoice(0)}
				>V1</button
			>
			<button
				class="ctl v2"
				class:on={store.cursor.voice === 1}
				title="Second voice"
				onclick={() => store.setVoice(1)}>V2</button
			>
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
			<button class="ctl" title="Insert beat before" onclick={() => store.insertBeatBefore()}
				>⇤+</button
			>
			<button class="ctl" title="Insert beat after" onclick={() => store.insertBeat()}>+⇥</button>
			<button class="ctl" title="Delete beat" onclick={() => store.deleteBeat()}>⌦</button>
		</div>
	</div>

	<!-- Effects -->
	<div class="effects">
		{#each EFFECTS as e (e.tech)}
			<button
				class="fx"
				class:on={hasTech(e.tech)}
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
	{:else}
		<div class="fretboard-wrap">
			<Fretboard />
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
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		padding: 2px;
		gap: 2px;
	}
	.seg button {
		border: none;
		background: transparent;
		padding: 5px 14px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
		border-radius: var(--r-xs);
		cursor: pointer;
	}
	.seg button.on {
		background: var(--ink);
		color: var(--accent-ink);
	}
	.hide {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border-strong);
		background: var(--bg);
		border-radius: var(--r-xs);
		width: 32px;
		height: 32px;
		color: var(--text-muted);
		cursor: pointer;
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
		background: var(--paper);
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
	.ctl.gl {
		font-size: 19px;
		line-height: 1;
	}
	.ctl.on,
	.fx.on {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--accent-ink);
	}
	.ctl.v2.on {
		background: var(--accent-2);
		border-color: var(--accent-2);
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
