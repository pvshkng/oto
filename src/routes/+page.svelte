<script lang="ts">
	import { onMount } from 'svelte';
	import { store } from '$lib/stores/score.svelte';
	import { stopPlayback } from '$lib/audio/playback';
	import { handleGlobalKeydown } from '$lib/keyboard-shortcuts';
	import Swap from 'phosphor-svelte/lib/Swap';
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
	import WelcomeScreen from '$lib/components/WelcomeScreen.svelte';
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

	// Gates the first paint of the real layout: stays false until the saved
	// score is restored, desktop/mobile is detected, and instrument samples
	// have warmed up — so the page goes straight from the loading screen to
	// the actual tab, with no flash of the empty default score in between.
	let ready = $state(false);

	// ── Desktop panel docking ────────────────────────────────────────────────
	// Every desktop panel — note editor, key-input pad, and the detail panels
	// (song / track / tempo / add-remove) — can be docked to an allowed edge or
	// floated freely, independently, each remembering where the user last put it.
	// The detail panels are no longer mutually exclusive: several can float at
	// once. Here we resolve *which* panel fills each edge slot (left/right are
	// single-occupancy, kept so by the store) and which ones float; the panels
	// render docked-vs-floating from `placement`.
	type PanelId = 'note' | 'keys' | 'song' | 'track' | 'tempo' | 'addRemove';
	const PANELS: PanelId[] = ['note', 'keys', 'song', 'track', 'tempo', 'addRemove'];

	const openPanels = $derived(PANELS.filter((id) => store.isPanelOpen(id)));
	function sideOccupant(side: 'left' | 'right'): PanelId | null {
		return openPanels.find((id) => store.panelDock(id) === side) ?? null;
	}
	const leftSlot = $derived(sideOccupant('left'));
	const rightSlot = $derived(sideOccupant('right'));
	const noteBottom = $derived(store.isPanelOpen('note') && store.panelDock('note') === 'bottom');
	const keysBottom = $derived(store.isPanelOpen('keys') && store.panelDock('keys') === 'bottom');
	const floatPanels = $derived(openPanels.filter((id) => store.panelDock(id) === 'float'));

	// Slot column width by occupant — the key-input pad (fretboard/piano) needs
	// far more room than the narrow note/detail forms.
	function slotWidth(id: PanelId | null): string {
		if (id === 'keys') return 'min(720px, 46vw)';
		if (id === 'note') return '19rem';
		return '21rem';
	}

	// Width of the left/right drop-zone preview while drag-to-docking — matches
	// the column the panel would land in (keys never docks to a side).
	function dropWidth(id: string | null): string {
		return id === 'note' ? '19rem' : '21rem';
	}

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
	{#if !store.documentOpen}
		<!-- No score open (first visit, or after Close): welcome / empty state. -->
		<WelcomeScreen />
	{:else if store.isDesktop}
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

		<!-- Renders whichever panel occupies a slot, at the given placement.
		     Each panel decides its own docked-vs-floating chrome from `placement`. -->
		{#snippet slotPanel(id: PanelId, placement: 'left' | 'right' | 'bottom' | 'float')}
			{#if id === 'note'}
				<NotePropertiesPanel {placement} />
			{:else if id === 'keys'}
				<KeyInput {placement} />
			{:else}
				<RightPanel which={id} {placement} />
			{/if}
		{/snippet}

		<!-- Divider between the two bottom-docked panels. Hovering it reveals a
		     swap button that flips which panel sits on the left. -->
		{#snippet splitSeparator()}
			<!-- z-40 lifts the separator (and its swap button) above the two
			     backdrop-blurred panels on either side — those establish their own
			     stacking contexts and would otherwise paint over the button. -->
			<div
				class="group/sep relative z-40 flex w-3 shrink-0 items-stretch justify-center self-stretch"
			>
				<div class="w-px bg-border transition-colors group-hover/sep:bg-foreground/30"></div>
				<button
					class="absolute top-1/2 left-1/2 z-40 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-text-muted opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-opacity duration-150 group-hover/sep:opacity-100 hover:text-ink focus-visible:opacity-100"
					title="Swap sides"
					aria-label="Swap note editor and key pad sides"
					onclick={() => store.toggleBottomSplit()}
				>
					<Swap class="size-4" />
				</button>
			</div>
		{/snippet}

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
						<ScoreArea onHeaderClick={() => store.togglePanel('song')} />
					</div>
				</main>

				<!-- Left edge slot: whichever panel is docked left (note editor, key
				     pad, or a right-detail mode), floated in front of the score. The
				     spacer div supplies the card's 16px margins (matching the dock)
				     plus a bottom pad equal to the dock height so it clears the
				     floating dock. It's pointer-events-none so its transparent
				     margin/buffer lets clicks fall through to the score and dock
				     beneath; only the card itself opts back into pointer events. -->
				{#if leftSlot}
					<div
						class="pointer-events-none absolute inset-y-0 left-0 z-30 p-4"
						style="width:{slotWidth(leftSlot)}; padding-bottom:{desktopDockHeight + 32}px"
					>
						{@render slotPanel(leftSlot, 'left')}
					</div>
				{/if}

				<!-- Right edge slot: same floating-overlay treatment (see left slot). -->
				{#if rightSlot}
					<div
						class="pointer-events-none absolute inset-y-0 right-0 z-30 p-4"
						style="width:{slotWidth(rightSlot)}; padding-bottom:{desktopDockHeight + 32}px"
					>
						{@render slotPanel(rightSlot, 'right')}
					</div>
				{/if}

				<!-- Drag-to-dock preview for the left/right edges: a dashed outline of
				     exactly the column the dragged panel would land in. Rendered here
				     (inside the score container) so its geometry matches the slots. -->
				{#if store.draggingPanel && (store.dropTarget === 'left' || store.dropTarget === 'right')}
					<div
						class="pointer-events-none absolute inset-y-0 z-40 p-4 {store.dropTarget === 'left'
							? 'left-0'
							: 'right-0'}"
						style="width:{dropWidth(store.draggingPanel)}; padding-bottom:{desktopDockHeight +
							32}px"
					>
						<div
							class="h-full w-full rounded-lg border-2 border-dashed border-foreground/40 bg-foreground/[0.06]"
						></div>
					</div>
				{/if}
			</div>

			<!-- Bottom dock: overlays the score area (see main's comment above).
			     Floated off the edges (inset margins) so it reads as a card and,
			     crucially, so the score's right-hand vertical scrollbar stays
			     uncovered — the dock used to span the full width and hide it. The
			     card carries its own translucent surface so any gap between stacked
			     panels reads as the dock, not see-through to the score. Capped in
			     height so a tall stack (tracks + note + keys) can't outgrow the
			     viewport — inner regions scroll instead. -->
			<div
				class="absolute inset-x-4 bottom-4 z-20 flex max-h-[calc(100dvh-5rem)] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-background/80 shadow-[0_6px_24px_rgba(0,0,0,0.14)] backdrop-blur-md print:hidden"
				bind:clientHeight={desktopDockHeight}
			>
				<!-- Tracks Panel (toggleable on desktop) -->
				{#if store.mixerOpen}
					<div class="shrink-0 overflow-hidden">
						<TracksPanel />
					</div>
				{/if}

				<!-- Bottom-docked panels. The note editor and key pad can each dock
				     here; when BOTH are here they share the strip side-by-side (with a
				     swappable divider) rather than stacking. -->
				{#if noteBottom && keysBottom}
					<div class="flex max-h-[46vh] min-h-0 shrink-0 items-stretch border-t border-border">
						{#if !store.bottomSplitSwap}
							<div class="min-w-0 flex-1">{@render slotPanel('note', 'bottom')}</div>
							{@render splitSeparator()}
							<div class="min-w-0 flex-1">{@render slotPanel('keys', 'bottom')}</div>
						{:else}
							<div class="min-w-0 flex-1">{@render slotPanel('keys', 'bottom')}</div>
							{@render splitSeparator()}
							<div class="min-w-0 flex-1">{@render slotPanel('note', 'bottom')}</div>
						{/if}
					</div>
				{:else if noteBottom}
					<div class="max-h-[46vh] shrink-0 border-t border-border">
						{@render slotPanel('note', 'bottom')}
					</div>
				{:else if keysBottom}
					<div class="max-h-[46vh] shrink-0 border-t border-border">
						{@render slotPanel('keys', 'bottom')}
					</div>
				{/if}

				<!-- Bottom bar -->
				<BottomBar />
			</div>

			<!-- Drag-to-dock preview for the bottom strip. -->
			{#if store.draggingPanel && store.dropTarget === 'bottom'}
				<div
					class="pointer-events-none absolute inset-x-4 bottom-4 z-40 rounded-lg border-2 border-dashed border-foreground/40 bg-foreground/[0.06]"
					style="height: min(42vh, 340px)"
				></div>
			{/if}

			<!-- Floating panels: free-floating, draggable windows outside every slot,
			     so any number of them can be open alongside the docked ones. -->
			{#each floatPanels as id (id)}
				{@render slotPanel(id, 'float')}
			{/each}
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
