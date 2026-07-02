<script lang="ts">
	// Desktop right panel. Surfaces Tempo, Song Details, and Add/Remove content
	// inline (no drawer wrapper) based on which store flag is set. Clicking a
	// button in BottomBar sets the flag; the X button here clears it.

	import { onDestroy } from 'svelte';
	import { store } from '$lib/stores/score.svelte';
	import { draggable } from '@neodrag/svelte';
	import { panelDragOptions } from '$lib/floating-panel';
	import { cn } from '$lib/utils';
	import TrackControlDrawer from './TrackControlDrawer.svelte';
	import TrackControlForm from './TrackControlForm.svelte';
	import TempoControls from './TempoControls.svelte';
	import SongDetailsFields from './SongDetailsFields.svelte';
	import AddRemoveActions from './AddRemoveActions.svelte';
	import PanelHeader from './PanelHeader.svelte';

	const popped = $derived(store.rightPanelPopped);

	// Always re-dock when the panel is closed, so it reopens in its docked spot.
	onDestroy(() => (store.rightPanelPopped = false));

	const mode = $derived(
		store.trackControlOpen
			? 'track-control'
			: store.tempoOpen
				? 'tempo'
				: store.songModalOpen
					? 'song'
					: store.addRemoveOpen
						? 'add-remove'
						: null
	);
	const title = $derived(
		mode === 'track-control'
			? 'Track control'
			: mode === 'tempo'
				? 'Tempo'
				: mode === 'song'
					? 'Song details'
					: 'Add or remove'
	);

	function closePanel() {
		store.tempoOpen = false;
		store.songModalOpen = false;
		store.addRemoveOpen = false;
		store.trackControlOpen = false;
	}

	// Add / remove helpers
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

{#if mode}
	<!-- Keyed on `popped` so toggling remounts the card, clearing any drag
	     transform left over from the floating window before it re-docks. -->
	{#key popped}
		<aside
			use:draggable={panelDragOptions(popped)}
			class={cn(
				'pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-border bg-background/70 shadow-[0_6px_24px_rgba(0,0,0,0.14)] backdrop-blur-md',
				popped ? 'fixed top-4 right-4 z-50 w-80 max-h-[calc(100dvh-2rem)]' : 'h-full w-full'
			)}
		>
			<PanelHeader
				{title}
				onClose={closePanel}
				closeLabel="Close panel"
				onPopOut={() => (store.rightPanelPopped = !store.rightPanelPopped)}
				{popped}
			/>

			<div class="flex-1 overflow-y-auto pb-3">
				{#if mode === 'track-control'}
					<TrackControlForm index={store.trackControlIndex} onClose={closePanel} />
				{:else if mode === 'tempo'}
					<TempoControls variant="panel" />
				{:else if mode === 'song'}
					<SongDetailsFields sectioned compact />
				{:else if mode === 'add-remove'}
					<AddRemoveActions sectioned onAddTrack={addTrack} onEditTrack={editCurrentTrack} />
				{/if}
			</div>
		</aside>
	{/key}
{/if}

<TrackControlDrawer bind:open={trackEditOpen} index={trackEditIndex} />
