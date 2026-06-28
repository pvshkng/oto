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
	import TrackControlDrawer from '$lib/components/TrackControlDrawer.svelte';
	import TracksPanel from '$lib/components/TracksPanel.svelte';
	import StatusBanner from '$lib/components/StatusBanner.svelte';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import { audio } from '$lib/audio/engine';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	// Drawer-like slide/fade for the bottom dock's note editor and tracks
	// panel — they're not modal (the score below stays editable), so unlike a
	// real Drawer there's no overlay/blur, just the entrance/exit motion.
	const dockTransition = { y: '100%', opacity: 0.5, duration: 260, easing: cubicOut };

	// The note editor and tracks panel are mutually exclusive and share one docked
	// slot. Driving them through a single value means the slide only runs when
	// opening from closed or closing to nothing — switching from one panel to the
	// other swaps the contents in place (no overlapping enter/exit), which is what
	// kept the old two-`{#if}` version glitchy. The slide-up shadow lives on the
	// panel itself (see .dock-panel) so it travels with the motion instead of
	// snapping to the final position before the panel arrives.
	const dockPanel = $derived(store.editMode ? 'edit' : store.mixerOpen ? 'mixer' : null);

	// Height of the fixed bottom dock, so the sheet can scroll clear of it.
	let dockHeight = $state(56);
	let trackEditIndex = $state(-1);
	let trackEditOpen = $state(false);
	let scoreAreaEl: HTMLElement;

	function addTrack() {
		store.addTrack();
		trackEditIndex = store.cursor.track;
		trackEditOpen = true;
	}

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

	// React to scroll requests (back-to-start, jump to a track section) raised
	// from the bottom bar / tracks panel.
	$effect(() => {
		const req = store.scrollRequest;
		if (!req || !scoreAreaEl) return;
		if (req.kind === 'start') {
			scoreAreaEl.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
		} else if (req.kind === 'track' && req.trackId) {
			document
				.getElementById(`track-${req.trackId}`)
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	});

	onMount(() => {
		store.loadFromStorage();
		// Decode the recorded samples for whatever instruments this score uses up
		// front, behind the loading screen, so the first play/audition is instant
		// and glitch-free rather than waiting on a download mid-bar.
		audio.ensureSamples(store.score.tracks.map((t) => t.instrument));
		window.addEventListener('keydown', onKeydown);
		return () => {
			window.removeEventListener('keydown', onKeydown);
			stopPlayback();
		};
	});
</script>

<svelte:head>
	<title>oto · tablature studio</title>
	<meta
		name="description"
		content="Lightweight web app for creating guitar tablature and music notation."
	/>
</svelte:head>

<div class="app">
	<StatusBanner />
	<main class="score-area" bind:this={scoreAreaEl} style="padding-bottom: {dockHeight + 28}px">
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

			{#if store.isFocusMode}
				<div class="focus-bar no-print">
					<span>Focusing <strong>{store.focusedTrackName}</strong></span>
					<button onclick={() => store.clearFocus()}>Show all tracks</button>
				</div>
			{/if}

			{#each store.score.tracks as track, i (track.id)}
				<section class="track-block" id="track-{track.id}">
					<div class="no-print"><TrackHeader index={i} /></div>
					{#if !store.isCollapsed(i)}
						<div class="sheet">
							<TrackStaff trackIndex={i} />
						</div>
					{/if}
				</section>
			{/each}

			<div class="add-row no-print">
				<button onclick={() => store.addMeasureToAll()}>+ Bar</button>
				<button onclick={addTrack}>+ Track</button>
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
		{#if dockPanel}
			<div class="dock-panel" transition:fly={dockTransition}>
				{#if dockPanel === 'edit'}
					<EditPanel />
				{:else}
					<TracksPanel />
				{/if}
			</div>
		{/if}
		<BottomBar />
	</div>

	<SongModal />
	<TrackControlDrawer bind:open={trackEditOpen} index={trackEditIndex} />
</div>

<LoadingScreen />

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
		color: var(--text-muted);
	}
	.edit-hint {
		position: absolute;
		top: 0;
		right: 0;
		font-size: 10px;
		color: var(--text-muted);
		opacity: 0;
		transition: opacity 0.15s;
		border: 1px solid var(--border-strong);
		border-radius: var(--r-xs);
		padding: 2px 6px;
	}
	.score-head:hover .edit-hint {
		opacity: 1;
	}
	.focus-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin: 0 0 16px;
		padding: 8px 12px;
		font-size: 13px;
		color: var(--ink);
		background: var(--panel);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
	}
	.focus-bar strong {
		font-weight: 700;
	}
	.focus-bar button {
		border: 1px solid var(--border-strong);
		background: var(--paper);
		color: var(--ink);
		border-radius: var(--r-xs);
		padding: 6px 12px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.focus-bar button:hover {
		background: var(--panel-2);
	}
	.track-block {
		margin-bottom: 18px;
	}
	.sheet {
		border: 1px solid var(--border);
		border-top: 0;
		border-radius: 0 0 var(--r-md) var(--r-md);
		overflow: hidden;
		background: var(--paper);
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
		color: var(--text-muted);
	}
	.bottom-dock {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
	}
	/* The lift shadow rides on the sliding panel (not the static dock) so it
	   animates in with the panel rather than snapping to the open position while
	   the panel is still travelling. The bottom bar keeps its own top border for
	   separation when no panel is open.
	   Both children get an explicit stacking position: the panel sits in a
	   higher layer than the bar so that while it's sliding up from below (its
	   `fly` transition translates it downward past its own resting spot) it
	   passes *over* the bar instead of being painted under it. At rest the two
	   never overlap — the panel occupies the flow space directly above the bar
	   — so the raised z-index only ever matters mid-animation. */
	.dock-panel {
		position: relative;
		z-index: 2;
		box-shadow: var(--shadow-3);
	}
	.bottom-dock > :global(.bottom-bar) {
		position: relative;
		z-index: 1;
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
