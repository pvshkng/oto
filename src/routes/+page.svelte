<script lang="ts">
	import { onMount } from 'svelte';
	import { store } from '$lib/stores/score.svelte';
	import { togglePlayback, stopPlayback } from '$lib/audio/playback';
	import { enterDigit, resetEntry } from '$lib/editing/entry';
	import TrackHeader from '$lib/components/TrackHeader.svelte';
	import TrackStaff from '$lib/components/TrackStaff.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import EditPanel from '$lib/components/EditPanel.svelte';
	import SongModal from '$lib/components/SongModal.svelte';

	// Height of the fixed bottom dock, so the sheet can scroll clear of it.
	let dockHeight = $state(56);

	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			return; // don't hijack typing in fields
		}

		if (e.code === 'Space') {
			e.preventDefault();
			togglePlayback();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey) store.redo();
			else store.undo();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			store.redo();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
			e.preventDefault();
			import('$lib/io/files').then((m) => m.downloadOto());
			return;
		}
		if (store.isPlaying) return;

		if (/^[0-9]$/.test(e.key)) {
			e.preventDefault();
			enterDigit(e.key);
			return;
		}
		resetEntry();

		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				if (e.shiftKey) store.extendSelection('left');
				else store.moveCursor('left');
				break;
			case 'ArrowRight':
				e.preventDefault();
				if (e.shiftKey) store.extendSelection('right');
				else store.moveCursor('right');
				break;
			case 'ArrowUp':
				e.preventDefault();
				store.moveCursor('up');
				break;
			case 'ArrowDown':
				e.preventDefault();
				store.moveCursor('down');
				break;
			case 'Backspace':
			case 'Delete':
				e.preventDefault();
				store.deleteNoteAtCursor();
				break;
			case 'Enter':
				e.preventDefault();
				store.insertBeat();
				break;
			case '-':
				store.deleteBeat();
				break;
			case 'w':
				store.setBeatDuration(1, false);
				store.activeDuration = 1;
				break;
			case 'h':
				store.setBeatDuration(2, false);
				store.activeDuration = 2;
				break;
			case 'q':
				store.setBeatDuration(4, false);
				store.activeDuration = 4;
				break;
			case 'e':
				store.setBeatDuration(8, false);
				store.activeDuration = 8;
				break;
			case 's':
				store.setBeatDuration(16, false);
				store.activeDuration = 16;
				break;
			case '.':
				store.activeDotted = !store.activeDotted;
				store.setBeatDuration(store.activeDuration, store.activeDotted);
				break;
		}
	}

	const fill = $derived(store.currentMeasureFill);

	onMount(() => {
		store.loadFromStorage();
		window.addEventListener('keydown', onKeydown);
		return () => {
			window.removeEventListener('keydown', onKeydown);
			stopPlayback();
		};
	});
</script>

<svelte:head>
	<title>oto — tablature studio</title>
	<meta
		name="description"
		content="Lightweight web app for creating guitar tablature and music notation."
	/>
</svelte:head>

<div class="app">
	<main class="score-area" style="padding-bottom: {dockHeight + 28}px">
		<div class="paper">
			<button
				class="score-head"
				onclick={() => (store.songModalOpen = true)}
				title="Edit song details"
			>
				<h1>{store.score.title || 'Untitled Score'}</h1>
				<p>{store.score.artist || 'Unknown'}</p>
				<span class="edit-hint">edit ✎</span>
			</button>

			{#if fill?.overflow}
				<div class="overflow-note">
					Bar {store.cursor.measure + 1} is over-full — extra notes won't play.
				</div>
			{/if}

			{#each store.score.tracks as track, i (track.id)}
				<section class="track-block">
					<div class="no-print"><TrackHeader index={i} /></div>
					<TrackStaff trackIndex={i} />
				</section>
			{/each}

			<div class="add-row no-print">
				<button onclick={() => store.addMeasureToAll()}>+ Bar</button>
				<button onclick={() => store.addTrack()}>+ Track</button>
				{#if store.score.tracks[0].measures.length > 1}
					<button
						class="ghost"
						onclick={() => store.removeMeasureFromAll(store.score.tracks[0].measures.length - 1)}
						>− Bar</button
					>
				{/if}
			</div>
		</div>
	</main>

	<div class="bottom-dock no-print" bind:clientHeight={dockHeight}>
		{#if store.editMode}
			<EditPanel />
		{/if}
		<BottomBar />
	</div>

	<SongModal />
</div>

<style>
	.app {
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}
	.score-area {
		flex: 1 1 0;
		min-height: 0;
		overflow-y: auto;
		padding: 20px 18px 0;
		display: flex;
		justify-content: center;
	}
	.paper {
		width: 100%;
		max-width: 1080px;
		height: fit-content;
		background: var(--paper);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		padding: 28px 30px 36px;
		box-shadow: var(--shadow-1), var(--shadow-2);
	}
	.score-head {
		position: relative;
		display: block;
		width: 100%;
		text-align: center;
		margin: 0 0 22px;
		padding: 0 0 16px;
		border: none;
		border-bottom: 1px solid var(--border);
		background: transparent;
		cursor: pointer;
	}
	.score-head h1 {
		margin: 0;
		font-family: var(--serif);
		font-size: 27px;
		font-weight: 600;
		color: var(--ink);
	}
	.score-head p {
		margin: 4px 0 0;
		font-family: var(--serif);
		font-style: italic;
		color: var(--muted);
	}
	.edit-hint {
		position: absolute;
		top: 0;
		right: 0;
		font-size: 10px;
		color: var(--muted);
		opacity: 0;
		transition: opacity 0.15s;
		border: 1px solid var(--border-strong);
		border-radius: var(--r-xs);
		padding: 2px 6px;
	}
	.score-head:hover .edit-hint {
		opacity: 1;
	}
	.overflow-note {
		margin: 0 0 14px;
		font-size: 12px;
		color: var(--brick);
		background: #fbeae6;
		border: 1px solid #e7b9ad;
		border-radius: var(--r-xs);
		padding: 7px 10px;
		text-align: center;
	}
	.track-block {
		margin-bottom: 18px;
	}
	.add-row {
		display: flex;
		gap: 7px;
		margin-top: 8px;
		flex-wrap: wrap;
	}
	.add-row button {
		border: 1px dashed var(--border-strong);
		background: var(--bg);
		border-radius: var(--r-xs);
		padding: 7px 13px;
		font-size: 12px;
		cursor: pointer;
		color: var(--ink);
		font-weight: 600;
	}
	.add-row button:hover {
		background: var(--panel-2);
	}
	.add-row .ghost {
		color: var(--muted);
	}
	.bottom-dock {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
		box-shadow: var(--shadow-3);
	}
	@media (max-width: 720px) {
		.score-area {
			padding: 12px 8px 0;
		}
		.paper {
			padding: 18px 12px 26px;
		}
		.score-head h1 {
			font-size: 22px;
		}
		.edit-hint {
			opacity: 1;
		}
	}
	@media print {
		.no-print {
			display: none !important;
		}
		.app,
		.score-area {
			background: #fff !important;
			padding: 0;
			overflow: visible;
		}
		.paper {
			box-shadow: none;
			border: none;
			max-width: none;
		}
	}
</style>
