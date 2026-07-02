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

	// Mobile dock panel — mutually exclusive (editMode vs mixerOpen)
	const dockPanel = $derived(store.editMode ? 'edit' : store.mixerOpen ? 'mixer' : null);

	// Height of the persistent bottom bar and the optional dock panel above it
	// (mobile only) — the score area reserves clearance for both so an open
	// panel never covers real score content.
	let bottomBarHeight = $state(56);
	let dockPanelHeight = $state(0);

	// Height of the desktop bottom dock (tracks panel + key input + bottom
	// bar) — it's an absolutely-positioned overlay so the score area can
	// scroll its content underneath (visible through the dock's blur), the
	// same way the mobile dock overlaps the score. This padding just keeps
	// score content clear of the dock by default.
	let desktopDockHeight = $state(0);

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
		<div class="relative flex h-screen h-dvh flex-col overflow-hidden bg-bg print:bg-white">
			<StatusBanner />

			<!-- Score area with the left/right panels floated on top of it.
			     The panels are NOT flow siblings of the score anymore — they're
			     absolute overlays, so opening one no longer shrinks the staff; it
			     just floats in front of it. -->
			<div class="relative flex min-h-0 flex-1 flex-row overflow-hidden">
				<!-- Score area. The bottom dock (tracks/key-input/bottom bar) is an
				     absolutely-positioned overlay, not a flow sibling — so the score
				     keeps scrolling underneath it and shows through its backdrop
				     blur, the same as the mobile dock. The padding-bottom below just
				     keeps content clear of the dock by default.

				     Vertical scroll lives on <main> so tall scores pass behind the
				     dock; HORIZONTAL scroll lives on the inner wrapper instead, so its
				     scrollbar renders there (above the dock) rather than at <main>'s
				     bottom edge, which sits hidden behind the dock overlay. -->
				<main
					class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [padding:20px_18px_24px] max-[720px]:[padding:12px_8px_0] print:overflow-visible print:bg-white print:p-0"
					bind:this={scoreAreaEl}
					style="padding-bottom: {desktopDockHeight}px"
					onscroll={closeContextMenuOnScroll}
				>
					<div
						class="flex [justify-content:safe_center] overflow-x-auto"
						onscroll={closeContextMenuOnScroll}
					>
						<ScoreArea
							onHeaderClick={() => {
								store.tempoOpen = false;
								store.addRemoveOpen = false;
								store.songModalOpen = !store.songModalOpen;
							}}
						/>
					</div>
				</main>

				<!-- Left panel: note properties (when editMode is on), floated in
				     front of the score at the left edge. The spacer div only supplies
				     the floating card's 16px margins (matching the dock) plus a bottom
				     pad equal to the dock height so the card clears the floating dock.
				     It's pointer-events-none so its transparent margin/buffer lets
				     clicks fall through to the score and dock beneath; only the card
				     and the resize handle opt back into pointer events. -->
				{#if store.editMode}
					<div
						class="pointer-events-none absolute inset-y-0 left-0 z-30 p-4"
						style="width:{leftPanelW}px; padding-bottom:{desktopDockHeight + 32}px"
					>
						<NotePropertiesPanel />
						<!-- Resize handle only makes sense while docked — a popped-out
						     panel is a free-floating window, not a column. -->
						{#if !store.leftPanelPopped}
							<div
								class="pointer-events-auto absolute right-3 z-20 w-2 cursor-col-resize"
								style="top:1rem; bottom:{desktopDockHeight + 32}px"
								onpointerdown={startLeftResize}
							></div>
						{/if}
					</div>
				{/if}

				<!-- Right panel: tempo / song details / add-remove. Same floating
				     overlay treatment as the left panel (see comment above). -->
				{#if showRightPanel}
					<div
						class="pointer-events-none absolute inset-y-0 right-0 z-30 p-4"
						style="width:{rightPanelW}px; padding-bottom:{desktopDockHeight + 32}px"
					>
						{#if !store.rightPanelPopped}
							<div
								class="pointer-events-auto absolute left-3 z-20 w-2 cursor-col-resize"
								style="top:1rem; bottom:{desktopDockHeight + 32}px"
								onpointerdown={startRightResize}
							></div>
						{/if}
						<RightPanel />
					</div>
				{/if}
			</div>

			<!-- Bottom dock: overlays the score area (see main's comment above).
			     Floated off the edges (inset margins) so it reads as a card and,
			     crucially, so the score's right-hand vertical scrollbar stays
			     uncovered — the dock used to span the full width and hide it. -->
			<div
				class="absolute inset-x-4 bottom-4 z-20 flex shrink-0 flex-col overflow-hidden rounded-lg border border-border shadow-[0_6px_24px_rgba(0,0,0,0.14)] print:hidden"
				bind:clientHeight={desktopDockHeight}
			>
				<!-- Tracks Panel (toggleable on desktop, vertically resizable) -->
				{#if store.mixerOpen}
					<div class="shrink-0 overflow-hidden">
						<TracksPanel />
					</div>
				{/if}

				<!-- Key input strip — docked here only while attached; when popped
				     out it renders as a floating window below (and may sit alongside
				     the tracks panel). -->
				{#if store.keyInputOpen && !store.keyInputPopped}
					<KeyInput />
				{/if}

				<!-- Bottom bar -->
				<BottomBar />
			</div>

			<!-- Detached key input: a free-floating, draggable window outside the
			     dock, so it can be open together with the tracks panel. -->
			{#if store.keyInputOpen && store.keyInputPopped}
				<KeyInput />
			{/if}
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
				style="padding-bottom: {bottomBarHeight + (dockPanel ? dockPanelHeight : 0) + 16}px"
				onscroll={closeContextMenuOnScroll}
			>
				<ScoreArea onHeaderClick={() => (store.songModalOpen = true)} />
			</main>

			<!-- Bottom dock floated off the edges so it reads as a card and leaves
			     the score's vertical scrollbar visible on the right. -->
			<div
				class="fixed inset-x-3 bottom-3 z-50 overflow-hidden rounded-lg border border-border shadow-[0_6px_24px_rgba(0,0,0,0.18)] print:hidden"
			>
				{#if dockPanel}
					<div class="relative z-[1] shadow-[var(--shadow-3)]" bind:clientHeight={dockPanelHeight}>
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
