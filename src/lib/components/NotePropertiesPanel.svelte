<script lang="ts">
	// Note properties panel for desktop mode. Shows duration, voice, per-bar time
	// signature, beat insert/delete, and technique effects — the same controls as
	// EditPanel but without the key-entry tools (keypad / fretboard / piano),
	// which live in the separate key-input pad.
	//
	// It can be docked to any edge or floated freely; `placement` (from +page)
	// says where it currently lives. Side/float use a vertical stack of sections;
	// the bottom strip uses a wide, comfortably-sized toolbar (like EditPanel)
	// that spreads across the space instead of a cramped column.

	import { store } from '$lib/stores/score.svelte';
	import { panelDrag } from '$lib/panel-drag';
	import { cn } from '$lib/utils';
	import DurationPicker from './note-edit/DurationPicker.svelte';
	import VoiceToggle from './note-edit/VoiceToggle.svelte';
	import BarTimeSigPicker from './note-edit/BarTimeSigPicker.svelte';
	import BeatActions from './note-edit/BeatActions.svelte';
	import EffectsGrid from './note-edit/EffectsGrid.svelte';
	import PanelHeader from './PanelHeader.svelte';

	let { placement = 'left' }: { placement?: 'left' | 'right' | 'bottom' | 'float' } = $props();

	const floating = $derived(placement === 'float');
	const horizontal = $derived(placement === 'bottom');
	const layout = $derived(store.panelLayout.note);

	const vSection = 'flex flex-col gap-1.5 border-b border-border px-3 py-2.5';
	const label = 'text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase shrink-0';
	const divider = 'mx-1 h-6 w-px shrink-0 self-center bg-border-strong';
	// Bottom-strip rows wrap rather than scroll — a horizontal scrollbar in the
	// dock strip felt broken; wrapping keeps every control reachable.
	const wrapRow = 'flex flex-wrap items-center gap-x-2 gap-y-1.5';
</script>

<aside
	use:panelDrag={{ id: 'note', floating }}
	style={floating ? `translate: ${layout.x}px ${layout.y}px; z-index: ${store.panelZ('note')}` : ''}
	class={cn(
		'pointer-events-auto flex flex-col overflow-hidden bg-background/70 backdrop-blur-md',
		floating
			? 'fixed top-4 left-4 z-50 max-h-[calc(100dvh-2rem)] w-72 rounded-lg border border-border shadow-[0_6px_24px_rgba(0,0,0,0.14)]'
			: horizontal
				? 'h-full w-full'
				: 'h-full w-full rounded-lg border border-border shadow-[0_6px_24px_rgba(0,0,0,0.14)]'
	)}
>
	<PanelHeader
		title="Note"
		panelId="note"
		onClose={() => (store.editMode = false)}
		closeLabel="Close note editor"
	/>

	{#if horizontal}
		<!-- Bottom strip: everything inline like the mobile edit panel — no section
		     labels, just the controls separated by thin dividers, wrapping to the
		     next line when the strip runs out of width. -->
		<div class="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2.5">
			<div class={wrapRow}>
				<div class="inline-flex flex-none items-center gap-[3px]"><DurationPicker /></div>
				<span class={divider}></span>
				<div class="inline-flex flex-none items-center gap-[3px]"><VoiceToggle /></div>
				<span class={divider}></span>
				<div class="inline-flex flex-none items-center"><BarTimeSigPicker side="top" /></div>
				<span class={divider}></span>
				<div class="inline-flex flex-none items-center gap-[3px]"><BeatActions /></div>
			</div>
			<div class="flex flex-wrap content-start items-center gap-1.5"><EffectsGrid /></div>
		</div>
	{:else}
		<!-- Side/float panels scroll vertically when the stacked sections outgrow
		     the available height (a short viewport, or the note editor sharing the
		     column with the dock) so nothing gets clipped off the bottom. -->
		<div class="flex-1 overflow-x-hidden overflow-y-auto">
			<div class={vSection}>
				<span class={label}>Duration</span>
				<div class="flex flex-wrap items-start gap-[5px]"><DurationPicker dense /></div>
			</div>
			<div class={vSection}>
				<span class={label}>Voice</span>
				<VoiceToggle dense />
			</div>
			<div class={vSection}>
				<span class={label}>Bar time sig</span>
				<BarTimeSigPicker side="right" />
			</div>
			<div class={vSection}>
				<span class={label}>Beats</span>
				<div class="flex gap-1"><BeatActions dense /></div>
			</div>
			<div class={vSection}>
				<span class={label}>Techniques</span>
				<div class="flex flex-col gap-2"><EffectsGrid dense sectioned /></div>
			</div>
		</div>
	{/if}
</aside>
