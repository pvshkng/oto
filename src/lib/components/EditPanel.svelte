<script lang="ts">
	// Bottom edit panel. Switches between the on-screen Keypad and the Fretboard
	// (never both), and exposes every note control: duration, dotted, voice,
	// per-bar time signature, insert/delete and effects, so you never have to
	// reach back up to a toolbar while entering music.

	import { store } from '$lib/stores/score.svelte';
	import { enterDigit } from '$lib/editing/entry';
	import { cn } from '$lib/utils';
	import DurationPicker from './note-edit/DurationPicker.svelte';
	import VoiceToggle from './note-edit/VoiceToggle.svelte';
	import BarTimeSigPicker from './note-edit/BarTimeSigPicker.svelte';
	import BeatActions from './note-edit/BeatActions.svelte';
	import EffectsGrid from './note-edit/EffectsGrid.svelte';
	import Fretboard from './Fretboard.svelte';
	import Piano from './Piano.svelte';
	import X from 'phosphor-svelte/lib/X';
	import Numpad from 'phosphor-svelte/lib/Numpad';
	import Guitar from 'phosphor-svelte/lib/Guitar';
	import PianoKeys from 'phosphor-svelte/lib/PianoKeys';

	const segBtnBase =
		'inline-flex h-8 w-[38px] cursor-pointer items-center justify-center border border-l-0 border-border-strong text-text-muted';
</script>

<div
	class="flex flex-col gap-[7px] border-t border-border-strong bg-panel/70 px-2.5 py-2 pb-1.5 backdrop-blur-md"
>
	<div class="flex items-center justify-between">
		<div class="inline-flex items-stretch">
			<button
				class={cn(
					segBtnBase,
					'rounded-l-legacy-xs rounded-r-none border-l',
					store.editTool === 'keypad' && 'sunk text-ink'
				)}
				title="Keypad"
				aria-label="Keypad"
				aria-pressed={store.editTool === 'keypad'}
				onclick={() => (store.editTool = 'keypad')}
			>
				<Numpad class="size-4" />
			</button>
			<button
				class={cn(segBtnBase, store.editTool === 'fretboard' && 'sunk text-ink')}
				title="Fretboard"
				aria-label="Fretboard"
				aria-pressed={store.editTool === 'fretboard'}
				onclick={() => (store.editTool = 'fretboard')}
			>
				<Guitar class="size-4" />
			</button>
			<button
				class={cn(segBtnBase, 'rounded-r-legacy-xs', store.editTool === 'piano' && 'sunk text-ink')}
				title="Piano"
				aria-label="Piano"
				aria-pressed={store.editTool === 'piano'}
				onclick={() => (store.editTool = 'piano')}
			>
				<PianoKeys class="size-4" />
			</button>
		</div>
		<button
			class="inline-flex size-8 cursor-pointer items-center justify-center border-none bg-transparent [background-image:none!important] text-text-muted hover:text-ink"
			onclick={() => (store.editMode = false)}
			title="Hide edit panel"
			aria-label="Hide edit panel"
		>
			<X class="size-5" />
		</button>
	</div>

	<!-- Note controls (apply to the selected beat / note) -->
	<div
		class="flex items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	>
		<div class="inline-flex flex-none items-center gap-[3px]">
			<DurationPicker />
		</div>

		<span class="mx-0.5 h-5 w-px flex-none bg-border-strong"></span>

		<div class="inline-flex flex-none items-center gap-[3px]">
			<VoiceToggle />
		</div>

		<span class="mx-0.5 h-5 w-px flex-none bg-border-strong"></span>

		<div class="inline-flex flex-none items-center gap-[5px]">
			<span class="text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase">Bar</span>
			<BarTimeSigPicker side="top" />
		</div>

		<span class="mx-0.5 h-5 w-px flex-none bg-border-strong"></span>

		<div class="inline-flex flex-none items-center gap-[3px]">
			<BeatActions />
		</div>
	</div>

	<!-- Effects -->
	<div
		class="flex items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	>
		<EffectsGrid />
	</div>

	<!-- Tool -->
	{#if store.editTool === 'keypad'}
		<div class="grid grid-cols-5 gap-[5px]">
			{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as d (d)}
				<button
					class="min-h-[46px] cursor-pointer rounded-legacy-sm border border-border-strong bg-paper [background-image:none!important] text-lg font-semibold text-ink active:bg-panel-2"
					onclick={() => enterDigit(d)}>{d}</button
				>
			{/each}
			<button
				class="min-h-[46px] cursor-pointer rounded-legacy-sm border border-ink bg-ink [background-image:none!important] text-lg font-semibold text-accent-ink"
				onclick={() => store.deleteNoteAtCursor()}>⌫</button
			>
			<button
				class="min-h-[46px] cursor-pointer rounded-legacy-sm border border-border-strong bg-paper [background-image:none!important] text-lg font-semibold text-ink active:bg-panel-2"
				onclick={() => store.moveCursor('up')}>▲</button
			>
			<button
				class="min-h-[46px] cursor-pointer rounded-legacy-sm border border-border-strong bg-paper [background-image:none!important] text-lg font-semibold text-ink active:bg-panel-2"
				onclick={() => store.moveCursor('down')}>▼</button
			>
			<button
				class="min-h-[46px] cursor-pointer rounded-legacy-sm border border-border-strong bg-paper [background-image:none!important] text-lg font-semibold text-ink active:bg-panel-2"
				onclick={() => store.moveCursor('left')}>◀</button
			>
			<button
				class="min-h-[46px] cursor-pointer rounded-legacy-sm border border-border-strong bg-paper [background-image:none!important] text-lg font-semibold text-ink active:bg-panel-2"
				onclick={() => store.moveCursor('right')}>▶</button
			>
		</div>
	{:else if store.editTool === 'fretboard'}
		<div class="fretboard-wrap">
			<Fretboard />
		</div>
	{:else}
		<div class="fretboard-wrap">
			<Piano />
		</div>
	{/if}
</div>
