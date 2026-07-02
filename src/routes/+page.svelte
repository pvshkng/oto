<script lang="ts">
	import { onMount } from 'svelte';
	import { store } from '$lib/stores/score.svelte';
	import { stopPlayback } from '$lib/audio/playback';
	import { handleGlobalKeydown } from '$lib/keyboard-shortcuts';
	import { createColumnResize } from '$lib/panel-resize';
	import ScoreArea from '$lib/components/ScoreArea.svelte';
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

	// Height of just the persistent bottom bar (mobile only) — the score area
	// only reserves clearance for this, not for the optional sliding panel
	// above it, so an open panel overlaps real score content (blurred through
	// it) instead of blank reserved padding.
	let bottomBarHeight = $state(56);

	let scoreAreaEl = $state<HTMLElement | undefined>(undefined);
	let leftPanelW = $state(260);
	let rightPanelW = $state(280);

	// Gates the first paint of the real layout: stays false until the saved
	// score is restored, desktop/mobile is detected, and instrument samples
	// have warmed up — so the page goes straight from the loading screen to
	// the actual tab, with no flash of the empty default score in between.
	let ready = $state(false);

	const showRightPanel = $derived(
		store.tempoOpen || store.songModalOpen || store.addRemoveOpen || store.trackControlOpen
	);

	const startLeftResize = createColumnResize({
		getWidth: () => leftPanelW,
		setWidth: (w) => (leftPanelW = w),
		min: 250,
		max: 500,
		direction: 1
	});
	const startRightResize = createColumnResize({
		getWidth: () => rightPanelW,
		setWidth: (w) => (rightPanelW = w),
		min: 250,
		max: 500,
		direction: -1
	});

	$effect(() => {
		const req = store.scrollRequest;
		if (!req || !scoreAreaEl) return;
		if (req.kind === 'start') {
			scoreAreaEl.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
		} else if (req.kind === 'track' && req.trackId) {
			// Multi-track view splits a track's systems across several sections
			// (interleaved with other tracks' matching systems), so a track can
			// have more than one section — gather them all and search across.
			const trackEls = [
				...document.querySelectorAll(`[data-track-id="${CSS.escape(req.trackId)}"]`)
			];
			if (!trackEls.length) return;
			let target: Element = trackEls[0];
			if (req.measure != null) {
				outer: for (const trackEl of trackEls) {
					for (const el of trackEl.querySelectorAll('svg.system')) {
						const first = Number(el.getAttribute('data-first-measure'));
						const last = Number(el.getAttribute('data-last-measure'));
						if (req.measure! >= first && req.measure! <= last) {
							target = el;
							break outer;
						}
					}
				}
			}
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	});

	// The right-click track-staff context menu doesn't track the page under
	// it as it scrolls, so it visually detaches from the note it was opened
	// on. Closing it the moment the score area scrolls avoids that.
	function closeContextMenuOnScroll() {
		if (store.contextMenuOpen) store.contextMenuOpen = false;
	}

	onMount(() => {
		store.loadFromStorage();
		store.initLayout();
		window.addEventListener('keydown', handleGlobalKeydown);
		audio.ensureSamples(store.score.tracks.map((t) => t.instrument)).finally(() => {
			ready = true;
		});
		return () => {
			window.removeEventListener('keydown', handleGlobalKeydown);
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

{#if ready}
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
		<div class="flex h-screen h-dvh flex-col overflow-hidden bg-bg print:bg-white">
			<StatusBanner />

			<!-- Main 3-column area: left panel | score | right panel -->
			<div class="flex min-h-0 flex-1 flex-row overflow-hidden">
				<!-- Left panel: note properties (when editMode is on) -->
				{#if store.editMode}
					<div
						class="relative shrink-0 overflow-x-hidden overflow-y-auto border-r border-border"
						style="width:{leftPanelW}px"
					>
						<NotePropertiesPanel />
						<div
							class="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize"
							onpointerdown={startLeftResize}
						></div>
					</div>
				{/if}

				<!-- Score area. The bottom dock (tracks/key-input/bottom bar) is a
				     normal flex sibling below the row, not an overlay — so this
				     box's own bottom edge (and its horizontal scrollbar, when the
				     sheet is wider than the squeezed space between open side
				     panels) always lands just above the dock, fully visible and
				     usable instead of hidden underneath it. -->
				<main
					class="flex min-h-0 flex-1 [justify-content:safe_center] overflow-auto [padding:20px_18px_24px] max-[720px]:[padding:12px_8px_0] print:overflow-visible print:bg-white print:p-0"
					bind:this={scoreAreaEl}
					onscroll={closeContextMenuOnScroll}
				>
					<ScoreArea
						onHeaderClick={() => {
							store.tempoOpen = false;
							store.addRemoveOpen = false;
							store.songModalOpen = !store.songModalOpen;
						}}
					/>
				</main>

				<!-- Right panel: tempo / song details / add-remove -->
				{#if showRightPanel}
					<div
						class="relative flex shrink-0 flex-col overflow-hidden"
						style="width:{rightPanelW}px"
					>
						<div
							class="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize"
							onpointerdown={startRightResize}
						></div>
						<RightPanel />
					</div>
				{/if}
			</div>

			<!-- Bottom dock -->
			<div class="flex shrink-0 flex-col print:hidden">
				<!-- Tracks Panel (toggleable on desktop, vertically resizable) -->
				{#if store.mixerOpen}
					<div class="shrink-0 overflow-hidden">
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
		<div class="flex h-screen h-dvh flex-col overflow-hidden bg-bg print:bg-white">
			<StatusBanner />
			<main
				class="flex min-h-0 flex-1 justify-center overflow-y-auto [padding:20px_18px_0] max-[720px]:[padding:12px_8px_0] print:overflow-visible print:bg-white print:p-0"
				bind:this={scoreAreaEl}
				style="padding-bottom: {bottomBarHeight + 16}px"
				onscroll={closeContextMenuOnScroll}
			>
				<ScoreArea onHeaderClick={() => (store.songModalOpen = true)} />
			</main>

			<div class="fixed inset-x-0 bottom-0 z-50 print:hidden">
				{#if dockPanel}
					<div class="relative z-[1] shadow-[var(--shadow-3)]" transition:fly={dockTransition}>
						{#if dockPanel === 'edit'}
							<EditPanel />
						{:else}
							<TracksPanel />
						{/if}
					</div>
				{/if}
				<div bind:clientHeight={bottomBarHeight}>
					<BottomBar />
				</div>
			</div>

			<SongModal />
		</div>
	{/if}
{/if}

<LoadingScreen forceActive={!ready} />
