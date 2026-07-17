<script lang="ts">
	// Bottom edit panel (mobile). The header carries two segmented groups: a
	// Note/Bar scope toggle that switches which attribute strip shows, and the
	// key-entry tool picker (keypad / fretboard / piano — never more than one).
	//
	// Note scope: two rows of note/beat attributes — rhythm & voice & beat
	// actions on the first, techniques / tuplets / dynamics / marks on the
	// second. Bar scope: two rows of measure editing — time signature & bar
	// actions, then barlines / repeats / endings / navigation. Everything the
	// omni palette offers for notes, beats and bars is reachable here without
	// leaving the panel.

	import { store } from '$lib/stores/score.svelte';
	import { enterDigit } from '$lib/editing/entry';
	import { cn } from '$lib/utils';
	import DurationPicker from '$lib/components/note-edit/DurationPicker.svelte';
	import VoiceToggle from '$lib/components/note-edit/VoiceToggle.svelte';
	import BarTimeSigPicker from '$lib/components/note-edit/BarTimeSigPicker.svelte';
	import BarTempoPicker from '$lib/components/note-edit/BarTempoPicker.svelte';
	import BeatActions from '$lib/components/note-edit/BeatActions.svelte';
	import NoteActions from '$lib/components/note-edit/NoteActions.svelte';
	import BarActions from '$lib/components/note-edit/BarActions.svelte';
	import EffectsGrid from '$lib/components/note-edit/EffectsGrid.svelte';
	import BeatMarksGrid from '$lib/components/note-edit/BeatMarksGrid.svelte';
	import BarMarksGrid from '$lib/components/note-edit/BarMarksGrid.svelte';
	import Fretboard from '$lib/components/input/Fretboard.svelte';
	import Piano from '$lib/components/input/Piano.svelte';
	import X from 'phosphor-svelte/lib/X';
	import Numpad from 'phosphor-svelte/lib/Numpad';
	import Guitar from 'phosphor-svelte/lib/Guitar';
	import PianoKeys from 'phosphor-svelte/lib/PianoKeys';
	import MusicNotes from 'phosphor-svelte/lib/MusicNotes';
	import Rows from 'phosphor-svelte/lib/Rows';

	const segBtnBase =
		'inline-flex h-8 w-[38px] cursor-pointer items-center justify-center border border-l-0 border-border-strong text-text-muted';
	const scrollRow =
		'flex items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
	const rowDivider = 'mx-0.5 h-5 w-px flex-none bg-border-strong';
</script>

<div
	class="flex flex-col gap-[7px] border-border-strong bg-background/50 px-2.5 py-2 pb-1.5 backdrop-blur-md"
>
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<!-- Note/Bar scope toggle: which attribute strip is shown below. -->
			<div class="inline-flex items-stretch">
				<button
					class={cn(
						segBtnBase,
						'rounded-l-legacy-xs rounded-r-none border-l',
						store.editScope === 'note' && 'sunk text-ink'
					)}
					title="Note options"
					aria-label="Note options"
					aria-pressed={store.editScope === 'note'}
					onclick={() => (store.editScope = 'note')}
				>
					<MusicNotes class="size-4" />
				</button>
				<button
					class={cn(
						segBtnBase,
						'rounded-r-legacy-xs',
						store.editScope === 'bar' && 'sunk text-ink'
					)}
					title="Bar options"
					aria-label="Bar options"
					aria-pressed={store.editScope === 'bar'}
					onclick={() => (store.editScope = 'bar')}
				>
					<Rows class="size-4" />
				</button>
			</div>

			<!-- Key-entry tool picker. -->
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
					class={cn(
						segBtnBase,
						'rounded-r-legacy-xs',
						store.editTool === 'piano' && 'sunk text-ink'
					)}
					title="Piano"
					aria-label="Piano"
					aria-pressed={store.editTool === 'piano'}
					onclick={() => (store.editTool = 'piano')}
				>
					<PianoKeys class="size-4" />
				</button>
			</div>
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

	{#if store.editScope === 'note'}
		<!-- Row 1: rhythm (duration/dotted), note actions, voice, beat actions. -->
		<div class={scrollRow}>
			<div class="inline-flex flex-none items-center gap-[3px]">
				<DurationPicker />
			</div>

			<span class={rowDivider}></span>

			<div class="inline-flex flex-none items-center gap-[3px]">
				<NoteActions />
			</div>

			<span class={rowDivider}></span>

			<div class="inline-flex flex-none items-center gap-[3px]">
				<VoiceToggle />
			</div>

			<span class={rowDivider}></span>

			<div class="inline-flex flex-none items-center gap-[3px]">
				<BeatActions />
			</div>
		</div>

		<!-- Row 2: techniques, then tuplets / dynamics / marks / strums. -->
		<div class={scrollRow}>
			<EffectsGrid />
			<span class={rowDivider}></span>
			<BeatMarksGrid />
		</div>
	{:else}
		<!-- Row 1: time signature + bar structure actions. -->
		<div class={scrollRow}>
			<div class="inline-flex flex-none items-center gap-[5px]">
				<span class="text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase">
					Bar {store.cursor.measure + 1}
				</span>
				<BarTimeSigPicker side="top" />
				<BarTempoPicker side="top" />
			</div>

			<span class={rowDivider}></span>

			<div class="inline-flex flex-none items-center gap-[3px]">
				<BarActions />
			</div>
		</div>

		<!-- Row 2: barlines & repeats, endings, navigation marks. -->
		<div class={scrollRow}>
			<BarMarksGrid />
		</div>
	{/if}

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
