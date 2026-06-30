<script lang="ts">
	import { onMount } from 'svelte';
	import { store } from '$lib/stores/score.svelte';
	import { togglePlayback, stopPlayback } from '$lib/audio/playback';
	import { enterDigit, resetEntry } from '$lib/editing/entry';
	import TrackStaff from '$lib/components/TrackStaff.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import EditPanel from '$lib/components/EditPanel.svelte';
	import NotePropertiesPanel from '$lib/components/NotePropertiesPanel.svelte';
	import KeyInput from '$lib/components/KeyInput.svelte';
	import SongModal from '$lib/components/SongModal.svelte';
	import TracksPanel from '$lib/components/TracksPanel.svelte';
	import RightPanel from '$lib/components/RightPanel.svelte';
	import StatusBanner from '$lib/components/StatusBanner.svelte';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import { audio } from '$lib/audio/engine';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	// Mobile-only: slide transition for the bottom dock note editor / tracks panel
	const dockTransition = { y: '100%', opacity: 0.5, duration: 260, easing: cubicOut };

	// Mobile dock panel — mutually exclusive (editMode vs mixerOpen)
	const dockPanel = $derived(store.editMode ? 'edit' : store.mixerOpen ? 'mixer' : null);

	// Height of the fixed bottom dock (mobile only), so the sheet can scroll clear.
	let dockHeight = $state(56);

	let scoreAreaEl = $state<HTMLElement | undefined>(undefined);
	let leftPanelW = $state(260);
	let rightPanelW = $state(280);

	const showRightPanel = $derived(
		store.tempoOpen || store.songModalOpen || store.addRemoveOpen || store.trackControlOpen
	);

	function startLeftResize(e: PointerEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startW = leftPanelW;
		function onMove(ev: PointerEvent) {
			leftPanelW = Math.max(250, Math.min(500, startW + ev.clientX - startX));
		}
		function onUp() {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		}
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}

	function startRightResize(e: PointerEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startW = rightPanelW;
		function onMove(ev: PointerEvent) {
			rightPanelW = Math.max(250, Math.min(500, startW - (ev.clientX - startX)));
		}
		function onUp() {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		}
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}

	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			return;
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
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
			e.preventDefault();
			store.cutSelection();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
			e.preventDefault();
			store.copySelection();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
			e.preventDefault();
			store.pasteClipboard();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
			e.preventDefault();
			if (e.shiftKey) store.duplicateMeasureAt(store.cursor.measure);
			else store.clearSelection();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			e.preventDefault();
			if (e.shiftKey) store.insertMeasureAt(store.cursor.measure);
			else store.insertMeasureAt(store.cursor.measure + 1);
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
				if (store.selection) store.deleteNotesInSelection();
				else store.deleteNoteAtCursor();
				break;
			case 'Enter':
				e.preventDefault();
				if (e.shiftKey) store.insertBeatBefore();
				else store.insertBeat();
				break;
			case '[':
				store.setLoopStartAtCursor();
				break;
			case ']':
				store.setLoopEndAtCursor();
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
			case 'x':
				store.toggleTechnique('dead');
				break;
		}
	}

	$effect(() => {
		const req = store.scrollRequest;
		if (!req || !scoreAreaEl) return;
		if (req.kind === 'start') {
			scoreAreaEl.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
		} else if (req.kind === 'track' && req.trackId) {
			const trackEl = document.getElementById(`track-${req.trackId}`);
			if (!trackEl) return;
			let target: Element = trackEl;
			if (req.measure != null) {
				const system = [...trackEl.querySelectorAll('svg.system')].find((el) => {
					const first = Number(el.getAttribute('data-first-measure'));
					const last = Number(el.getAttribute('data-last-measure'));
					return req.measure! >= first && req.measure! <= last;
				});
				if (system) target = system;
			}
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	});

	onMount(() => {
		store.loadFromStorage();
		store.initLayout();
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

{#if store.isDesktop}
	<!-- ═══════════════════════════════════════════════════════════════
	     DESKTOP LAYOUT  (≥ 1024 px)
	     ┌──────────┬─────────────────────────────────┬───────────┐
	     │ Note     │         Score area               │  Right    │
	     │ Props    │         (scrollable)             │  Panel    │
	     │ (left)   │                                  │ (details) │
	     ├──────────┴─────────────────────────────────┴───────────┤
	     │              Tracks Panel (always visible)              │
	     ├─────────────────────────────────────────────────────────┤
	     │          Key Input (keypad / fretboard / piano)         │
	     ├─────────────────────────────────────────────────────────┤
	     │                     Bottom Bar                          │
	     └─────────────────────────────────────────────────────────┘
	     ═══════════════════════════════════════════════════════════ -->
	<div class="desktop-app">
		<StatusBanner />

		<!-- Main 3-column area: left panel | score | right panel -->
		<div class="desktop-main">
			<!-- Left panel: note properties (when editMode is on) -->
			{#if store.editMode}
				<div class="desktop-left-panel" style="width:{leftPanelW}px">
					<NotePropertiesPanel />
					<div class="panel-resize-right" onpointerdown={startLeftResize}></div>
				</div>
			{/if}

			<!-- Score area -->
			<main class="score-area" bind:this={scoreAreaEl}>
				<div class="paper">
					<button
						class="score-head"
						onclick={() => {
							store.tempoOpen = false;
							store.addRemoveOpen = false;
							store.songModalOpen = !store.songModalOpen;
						}}
						title="Edit song details"
					>
						<h1>{store.score.title || 'Untitled Score'}</h1>
						<p>{store.score.artist || 'Unknown'}</p>
						<span class="edit-hint">edit ✎</span>
					</button>

					{#each store.score.tracks as track, i (track.id)}
						{#if !store.isFocusMode || store.focusedTrackId === track.id}
							<section class="track-block" id="track-{track.id}">
								<TrackStaff trackIndex={i} />
							</section>
						{/if}
					{/each}
				</div>
			</main>

			<!-- Right panel: tempo / song details / add-remove -->
			{#if showRightPanel}
				<div class="desktop-right-wrapper" style="width:{rightPanelW}px">
					<div class="panel-resize-left" onpointerdown={startRightResize}></div>
					<RightPanel />
				</div>
			{/if}
		</div>

		<!-- Bottom panels -->
		<div class="desktop-bottom no-print">
			<!-- Tracks Panel (toggleable on desktop, vertically resizable) -->
			{#if store.mixerOpen}
				<div class="tracks-panel-dock">
					<TracksPanel />
				</div>
			{/if}

			<!-- Key input strip (when open) -->
			{#if store.keyInputOpen}
				<KeyInput />
			{/if}

			<!-- Bottom bar -->
			<BottomBar />
		</div>
	</div>
{:else}
	<!-- ═══════════════════════════════════════════════════════════════
	     MOBILE LAYOUT  (< 1024 px)
	     Fixed-bottom dock with slide-up note editor or tracks panel.
	     ═══════════════════════════════════════════════════════════════ -->
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

				{#each store.score.tracks as track, i (track.id)}
					{#if !store.isFocusMode || store.focusedTrackId === track.id}
						<section class="track-block" id="track-{track.id}">
							<TrackStaff trackIndex={i} />
						</section>
					{/if}
				{/each}
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
	</div>
{/if}

<LoadingScreen />

<style>
	/* ── SHARED ───────────────────────────────────────────────── */
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
	.track-block {
		margin-bottom: 12px;
	}

	/* ── DESKTOP ──────────────────────────────────────────────── */
	.desktop-app {
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}
	/* 3-column row: left panel (optional) | score | right panel (optional) */
	.desktop-main {
		flex: 1 1 0;
		min-height: 0;
		display: flex;
		flex-direction: row;
		overflow: hidden;
	}
	.desktop-left-panel {
		flex-shrink: 0;
		overflow-y: auto;
		overflow-x: hidden;
		border-right: 1px solid var(--border);
		position: relative;
	}
	.desktop-right-wrapper {
		flex-shrink: 0;
		position: relative;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.panel-resize-right {
		position: absolute;
		right: -4px;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: col-resize;
		z-index: 20;
	}
	.panel-resize-left {
		position: absolute;
		left: -4px;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: col-resize;
		z-index: 20;
	}
	/* Bottom strip: TracksPanel + optional KeyInput + BottomBar */
	.desktop-bottom {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
	}
	.tracks-panel-dock {
		flex-shrink: 0;
		overflow: hidden;
	}

	/* ── MOBILE ───────────────────────────────────────────────── */
	.app {
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}
	.bottom-dock {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
	}
	.dock-panel {
		position: relative;
		z-index: 1;
		box-shadow: var(--shadow-3);
	}
	.bottom-dock > :global(.bottom-bar) {
		position: relative;
		z-index: 2;
	}

	/* ── RESPONSIVE ───────────────────────────────────────────── */
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
		.desktop-app,
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
