<script lang="ts">
	// Note properties panel for desktop mode. Unlike the mobile edit panel's
	// Note/Bar toggle, desktop shows everything at once, organised into three
	// labelled groups — Note (duration, tie, voice, techniques), Beat (beat
	// actions, tuplets/dynamics/marks) and Bar (time signature, structure
	// actions, barlines/repeats/navigation) — the same controls as EditPanel
	// but without the key-entry tools (keypad / fretboard / piano), which live
	// in the separate key-input pad.
	//
	// It can be docked to any edge or floated freely; `placement` (from +page)
	// says where it currently lives. Side/float use a vertical stack of grouped
	// sections; the bottom strip uses a responsive grid of three group cells
	// (Note / Beat / Bar), each led by a vertical group label with small
	// labelled control clusters wrapping beside it.

	import { store } from '$lib/stores/score.svelte';
	import { panelDrag } from '$lib/panel-drag';
	import { cn } from '$lib/utils';
	import DurationPicker from './note-edit/DurationPicker.svelte';
	import VoiceToggle from './note-edit/VoiceToggle.svelte';
	import BarTimeSigPicker from './note-edit/BarTimeSigPicker.svelte';
	import BeatActions from './note-edit/BeatActions.svelte';
	import NoteActions from './note-edit/NoteActions.svelte';
	import BarActions from './note-edit/BarActions.svelte';
	import EffectsGrid from './note-edit/EffectsGrid.svelte';
	import BeatMarksGrid from './note-edit/BeatMarksGrid.svelte';
	import BarMarksGrid from './note-edit/BarMarksGrid.svelte';
	import PanelHeader from './PanelHeader.svelte';

	let { placement = 'left' }: { placement?: 'left' | 'right' | 'bottom' | 'float' } = $props();

	const floating = $derived(placement === 'float');
	const horizontal = $derived(placement === 'bottom');
	const layout = $derived(store.panelLayout.note);

	const vSection = 'flex flex-col gap-1.5 border-b border-border px-3 py-2.5';
	const label = 'text-[10px] font-bold tracking-[0.4px] text-text-muted uppercase shrink-0';
	// Group band separating the Note / Beat / Bar clusters in the sidebar stack.
	const groupHead =
		'border-b border-border bg-foreground/[0.05] px-3 py-1.5 text-[10px] font-bold tracking-[0.6px] text-text-muted uppercase';
	// Bottom-strip group cell: a vertical group label on the left that spans
	// every wrapped row of controls (rotated so it stays narrow), and the
	// labelled clusters wrapping beside it. Controls wrap rather than scroll —
	// a horizontal scrollbar in the dock strip felt broken.
	const groupCell = 'flex items-stretch gap-2 rounded-md border border-border/60 p-2';
	const vLabel =
		'flex w-5 shrink-0 rotate-180 items-center justify-center rounded-sm bg-foreground/[0.05] py-1 text-[10px] font-bold tracking-[0.6px] text-text-muted uppercase [writing-mode:vertical-rl]';
	const clusterWrap = 'flex min-w-0 flex-1 flex-wrap content-start items-start gap-x-3 gap-y-1.5';
	// Matches the mini section labels EffectsGrid & friends use in `sectioned`
	// mode, so hand-labelled clusters and grid-provided ones read as one system.
	const clusterLabel = 'text-[9px] font-bold tracking-[0.4px] text-text-muted/80 uppercase';
</script>

{#snippet cluster(title: string, body: import('svelte').Snippet)}
	<div class="flex flex-col gap-1">
		<span class={clusterLabel}>{title}</span>
		<div class="flex flex-wrap items-center gap-[3px]" role="group" aria-label={title}>
			{@render body()}
		</div>
	</div>
{/snippet}

{#snippet durationBtns()}<DurationPicker />{/snippet}
{#snippet noteActionBtns()}<NoteActions />{/snippet}
{#snippet voiceBtns()}<VoiceToggle />{/snippet}
{#snippet beatActionBtns()}<BeatActions />{/snippet}
{#snippet timeSigBtns()}<BarTimeSigPicker side="top" />{/snippet}
{#snippet barActionBtns()}<BarActions />{/snippet}

<aside
	use:panelDrag={{ id: 'note', floating }}
	style={floating ? `translate: ${layout.x}px ${layout.y}px; z-index: ${store.panelZ('note')}` : ''}
	class={cn(
		'pointer-events-auto flex flex-col overflow-hidden bg-background/50 backdrop-blur-md',
		floating
			? 'fixed top-4 left-4 z-50 max-h-[min(60vh,560px)] w-72 rounded-lg border border-border shadow-[0_6px_24px_rgba(0,0,0,0.14)]'
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
		<!-- Bottom strip: a responsive grid of the three group cells. auto-fit
		     keeps them equal — three across when the strip has the dock to
		     itself, fewer columns when it shares the bottom with the keypad /
		     fretboard / piano pad, stacking when space gets tight. -->
		<div
			class="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-3 py-2.5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]"
		>
			<section class={groupCell} aria-label="Note">
				<span class={vLabel} aria-hidden="true">Note</span>
				<div class={clusterWrap}>
					{@render cluster('Duration', durationBtns)}
					{@render cluster('Actions', noteActionBtns)}
					{@render cluster('Voice', voiceBtns)}
					<EffectsGrid sectioned />
				</div>
			</section>
			<section class={groupCell} aria-label="Beat">
				<span class={vLabel} aria-hidden="true">Beat</span>
				<div class={clusterWrap}>
					{@render cluster('Beats', beatActionBtns)}
					<BeatMarksGrid sectioned />
				</div>
			</section>
			<section class={groupCell} aria-label="Bar">
				<span class={vLabel} aria-hidden="true">Bar</span>
				<div class={clusterWrap}>
					{@render cluster('Time signature', timeSigBtns)}
					{@render cluster('Bar actions', barActionBtns)}
					<BarMarksGrid sectioned />
				</div>
			</section>
		</div>
	{:else}
		<!-- Side/float panels scroll vertically when the stacked sections outgrow
		     the available height (a short viewport, or the note editor sharing the
		     column with the dock) so nothing gets clipped off the bottom. -->
		<div class="flex-1 overflow-x-hidden overflow-y-auto">
			<div class={groupHead}>Note</div>
			<div class={vSection}>
				<span class={label}>Duration</span>
				<div class="flex flex-wrap items-start gap-[5px]"><DurationPicker dense /></div>
			</div>
			<div class={vSection}>
				<span class={label}>Actions</span>
				<div class="flex gap-1"><NoteActions dense /></div>
			</div>
			<div class={vSection}>
				<span class={label}>Voice</span>
				<VoiceToggle dense />
			</div>
			<div class={vSection}>
				<span class={label}>Techniques</span>
				<div class="flex flex-col gap-2"><EffectsGrid dense sectioned /></div>
			</div>

			<div class={groupHead}>Beat</div>
			<div class={vSection}>
				<span class={label}>Beats</span>
				<div class="flex gap-1"><BeatActions dense /></div>
			</div>
			<div class={vSection}>
				<span class={label}>Beat marks</span>
				<div class="flex flex-col gap-2"><BeatMarksGrid dense sectioned /></div>
			</div>

			<div class={groupHead}>Bar</div>
			<div class={vSection}>
				<span class={label}>Time signature</span>
				<BarTimeSigPicker side="right" />
			</div>
			<div class={vSection}>
				<span class={label}>Bar actions</span>
				<div class="flex flex-wrap gap-1"><BarActions dense /></div>
			</div>
			<div class={vSection}>
				<span class={label}>Bar marks</span>
				<div class="flex flex-col gap-2"><BarMarksGrid dense sectioned /></div>
			</div>
		</div>
	{/if}
</aside>
