<script lang="ts">
	// Left-panel note properties for desktop mode. Shows duration, voice,
	// per-bar time signature, beat insert/delete, and technique effects —
	// the same controls as EditPanel but without the key-entry tools
	// (keypad / fretboard / piano), which live in the bottom key-input strip.

	import { onDestroy } from 'svelte';
	import { store } from '$lib/stores/score.svelte';
	import { draggable } from '@neodrag/svelte';
	import { panelDragOptions } from '$lib/floating-panel';
	import { cn } from '$lib/utils';
	import DurationPicker from './note-edit/DurationPicker.svelte';
	import VoiceToggle from './note-edit/VoiceToggle.svelte';
	import BarTimeSigPicker from './note-edit/BarTimeSigPicker.svelte';
	import BeatActions from './note-edit/BeatActions.svelte';
	import EffectsGrid from './note-edit/EffectsGrid.svelte';
	import PanelHeader from './PanelHeader.svelte';

	const popped = $derived(store.leftPanelPopped);

	// Always re-dock when the panel is closed, so it reopens in its docked spot.
	onDestroy(() => (store.leftPanelPopped = false));
</script>

<!-- Keyed on `popped` so toggling remounts the card, clearing any drag transform
     left over from the floating window before it re-docks. -->
{#key popped}
	<aside
		use:draggable={panelDragOptions(popped)}
		class={cn(
			'pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-border bg-background/70 shadow-[0_6px_24px_rgba(0,0,0,0.14)] backdrop-blur-md',
			popped ? 'fixed top-4 left-4 z-50 w-72 max-h-[calc(100dvh-2rem)]' : 'h-full w-full'
		)}
	>
		<PanelHeader
			title="Note"
			onClose={() => (store.editMode = false)}
			closeLabel="Close note editor"
			onPopOut={() => (store.leftPanelPopped = !store.leftPanelPopped)}
			{popped}
		/>

		<div class="flex-1 overflow-x-hidden overflow-y-auto">
			<div class="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
				<span class="text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase"
					>Duration</span
				>
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
				<span class="text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase"
					>Techniques</span
				>
				<div class="grid grid-cols-5 gap-[3px]">
					<EffectsGrid dense />
				</div>
			</div>
		</div>
	</aside>
{/key}
