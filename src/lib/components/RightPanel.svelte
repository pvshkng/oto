<script lang="ts">
	// A single desktop "detail" panel — Tempo, Song details, Track control, or
	// Add/Remove — chosen by `which`. Each is independent (its own open flag and
	// remembered dock), so several can be open and float side-by-side. The content
	// is surfaced inline (no drawer wrapper); the header's close button clears just
	// this panel's flag.

	import { store, type PanelId } from '$lib/stores/score.svelte';
	import { panelDrag } from '$lib/panel-drag';
	import { cn } from '$lib/utils';
	import TrackControlDrawer from './TrackControlDrawer.svelte';
	import TrackControlForm from './TrackControlForm.svelte';
	import TempoControls from './TempoControls.svelte';
	import SongDetailsFields from './SongDetailsFields.svelte';
	import AddRemoveActions from './AddRemoveActions.svelte';
	import PanelHeader from './PanelHeader.svelte';

	let {
		which,
		placement = 'right'
	}: {
		which: Exclude<PanelId, 'note' | 'keys'>;
		placement?: 'left' | 'right' | 'bottom' | 'float';
	} = $props();

	const floating = $derived(placement === 'float');
	const layout = $derived(store.panelLayout[which]);
	const title = $derived(
		which === 'track'
			? 'Track control'
			: which === 'tempo'
				? 'Tempo'
				: which === 'song'
					? 'Song details'
					: 'Add or remove'
	);

	// Add / remove helpers (only used by the add-remove panel)
	let trackEditOpen = $state(false);
	let trackEditIndex = $state(-1);

	function addTrack() {
		store.addTrack();
		trackEditIndex = store.cursor.track;
		trackEditOpen = true;
	}
	function editCurrentTrack() {
		trackEditIndex = store.cursor.track;
		trackEditOpen = true;
	}
</script>

<aside
	use:panelDrag={{ id: which, floating }}
	style={floating ? `translate: ${layout.x}px ${layout.y}px; z-index: ${store.panelZ(which)}` : ''}
	class={cn(
		'pointer-events-auto flex flex-col overflow-hidden bg-background/70 backdrop-blur-md',
		floating
			? 'fixed top-4 left-4 z-50 max-h-[calc(100dvh-2rem)] w-80 rounded-lg border border-border shadow-[0_6px_24px_rgba(0,0,0,0.14)]'
			: 'h-full w-full rounded-lg border border-border shadow-[0_6px_24px_rgba(0,0,0,0.14)]'
	)}
>
	<PanelHeader
		{title}
		panelId={which}
		onClose={() => store.closePanel(which)}
		closeLabel="Close panel"
	/>

	<div class="flex-1 overflow-y-auto pb-3">
		{#if which === 'track'}
			<TrackControlForm index={store.trackControlIndex} onClose={() => store.closePanel('track')} />
		{:else if which === 'tempo'}
			<TempoControls variant="panel" />
		{:else if which === 'song'}
			<SongDetailsFields sectioned compact />
		{:else if which === 'addRemove'}
			<AddRemoveActions sectioned onAddTrack={addTrack} onEditTrack={editCurrentTrack} />
		{/if}
	</div>
</aside>

{#if which === 'addRemove'}
	<TrackControlDrawer bind:open={trackEditOpen} index={trackEditIndex} />
{/if}
