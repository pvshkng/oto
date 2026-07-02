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
	import PanelHeader from './PanelHeader.svelte';
</script>

<aside
	class="bg-panel/70 flex h-full w-full flex-col overflow-x-hidden border-r border-border backdrop-blur-md"
>
	<PanelHeader
		title="Note"
		onClose={() => (store.editMode = false)}
		closeLabel="Close note editor"
	/>

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
