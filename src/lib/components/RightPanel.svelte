<script lang="ts">
	// Desktop right panel. Surfaces Tempo, Song Details, and Add/Remove content
	// inline (no drawer wrapper) based on which store flag is set. Clicking a
	// button in BottomBar sets the flag; the X button here clears it.

	import { store } from '$lib/stores/score.svelte';
	import TrackControlDrawer from './TrackControlDrawer.svelte';
	import TrackControlForm from './TrackControlForm.svelte';
	import TempoControls from './TempoControls.svelte';
	import SongDetailsFields from './SongDetailsFields.svelte';
	import AddRemoveActions from './AddRemoveActions.svelte';
	import PanelHeader from './PanelHeader.svelte';

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
	<aside
		class="bg-panel/70 flex h-full w-full flex-col overflow-x-hidden border-l border-border backdrop-blur-md"
	>
		<PanelHeader {title} onClose={closePanel} closeLabel="Close panel" />

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
{/if}

<TrackControlDrawer bind:open={trackEditOpen} index={trackEditIndex} />
