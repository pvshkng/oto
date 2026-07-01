<script lang="ts">
	// Left-panel note properties for desktop mode. Shows duration, voice,
	// per-bar time signature, beat insert/delete, and technique effects —
	// the same controls as EditPanel but without the key-entry tools
	// (keypad / fretboard / piano), which live in the bottom key-input strip.

	import { store } from '$lib/stores/score.svelte';
	import DurationPicker from './note-edit/DurationPicker.svelte';
	import VoiceToggle from './note-edit/VoiceToggle.svelte';
	import BarTimeSigPicker from './note-edit/BarTimeSigPicker.svelte';
	import BeatActions from './note-edit/BeatActions.svelte';
	import EffectsGrid from './note-edit/EffectsGrid.svelte';
	import X from 'phosphor-svelte/lib/X';
</script>

<aside class="flex h-full w-full flex-col overflow-x-hidden border-r border-border bg-panel">
	<div class="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
		<span class="text-[13px] font-bold tracking-[0.4px] text-ink uppercase">Note</span>
		<button
			class="inline-flex size-7 cursor-pointer items-center justify-center rounded-legacy-xs border-none bg-transparent [background-image:none!important] text-text-muted hover:bg-panel-2 hover:text-ink"
			title="Close note editor"
			aria-label="Close note editor"
			onclick={() => (store.editMode = false)}
		>
			<X class="size-4" />
		</button>
	</div>

	<div class="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
		<span class="text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase">Duration</span>
		<div class="flex flex-wrap items-start gap-[5px]">
			<DurationPicker dense />
		</div>
	</div>

	<div class="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
		<span class="text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase">Voice</span>
		<VoiceToggle dense />
	</div>

	<div class="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
		<span class="text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase"
			>Bar time sig</span
		>
		<BarTimeSigPicker side="right" />
	</div>

	<div class="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
		<span class="text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase">Beats</span>
		<div class="flex gap-1">
			<BeatActions dense />
		</div>
	</div>

	<div class="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
		<span class="text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase">Techniques</span>
		<div class="grid grid-cols-5 gap-[3px]">
			<EffectsGrid dense />
		</div>
	</div>
</aside>
