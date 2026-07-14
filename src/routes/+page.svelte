<script lang="ts">
	import { onMount, untrack, flushSync } from 'svelte';
	import { fade } from 'svelte/transition';
	import { store } from '$lib/stores/score.svelte';
	import { scoreViewport } from '$lib/stores/viewport.svelte';
	import { stopPlayback } from '$lib/audio/playback';
	import { audioTrack } from '$lib/audio/audio-track.svelte';
	import { handleGlobalKeydown } from '$lib/keyboard-shortcuts';
	import { initLongPressTooltips } from '$lib/long-press-tooltip';
	import { initButtonHaptics } from '$lib/haptics';
	import Swap from 'phosphor-svelte/lib/Swap';
	import ScoreArea from '$lib/components/ScoreArea.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import EditPanel from '$lib/components/EditPanel.svelte';
	import NotePropertiesPanel from '$lib/components/NotePropertiesPanel.svelte';
	import KeyInput from '$lib/components/KeyInput.svelte';
	import SongModal from '$lib/components/SongModal.svelte';
	import OpenFileModal from '$lib/components/OpenFileModal.svelte';
	import FileDropZone from '$lib/components/FileDropZone.svelte';
	import PdfExportModal from '$lib/components/PdfExportModal.svelte';
	import TracksPanel from '$lib/components/TracksPanel.svelte';
	import RightPanel from '$lib/components/RightPanel.svelte';
	import TunerPanel from '$lib/components/TunerPanel.svelte';
	import TunerModal from '$lib/components/TunerModal.svelte';
	import StatusBanner from '$lib/components/StatusBanner.svelte';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
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
	// score is restored, desktop/mobile is detected, and the audio engine
	// has warmed up — so the page goes straight from the loading screen to
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
	type PanelId = 'note' | 'keys' | 'song' | 'track' | 'tempo' | 'addRemove' | 'tuner';
	const PANELS: PanelId[] = ['note', 'keys', 'song', 'track', 'tempo', 'addRemove', 'tuner'];

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

	// Multi-track view splits a track's systems across several sections
	// (interleaved with other tracks' matching systems), so a track can have
	// more than one section — gather them all and search across. Shared by the
	// explicit "scroll to track" requests below and the playback auto-follow
	// effect further down.
	function findSystemFor(trackId: string, measure?: number): Element | null {
		const trackEls = [...document.querySelectorAll(`[data-track-id="${CSS.escape(trackId)}"]`)];
		if (!trackEls.length) return null;
		if (measure == null) return trackEls[0];
		for (const trackEl of trackEls) {
			for (const el of trackEl.querySelectorAll('.system')) {
				const first = Number(el.getAttribute('data-first-measure'));
				const last = Number(el.getAttribute('data-last-measure'));
				if (measure >= first && measure <= last) return el;
			}
		}
		return trackEls[0];
	}

	// Keep the loaded audio in step with the open document (page load / New /
	// Open / Close): drop bytes the document doesn't reference so they can't
	// keep playing, and auto-restore the file it *does* reference from the
	// local IndexedDB cache so a reload doesn't require a manual re-import.
	// reconcile() is untracked: it reads (and its async restore toggles) the
	// controller's own reactive flags, and tracking those here would re-trigger
	// this effect from every failed lookup — an infinite retry loop on a cache
	// miss. Only the document's audio file name should re-run this.
	$effect(() => {
		void store.audio?.fileName;
		untrack(() => audioTrack.reconcile());
	});

	$effect(() => {
		const req = store.scrollRequest;
		if (!req || !scoreAreaEl) return;
		if (req.kind === 'start') {
			scoreAreaEl.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
		} else if (req.kind === 'track' && req.trackId) {
			const target = findSystemFor(req.trackId, req.measure);
			target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	});

	// Playback auto-scroll: keep the system (staff line) under the playhead
	// pinned to the top of the score view, so the bar being played is always
	// the first thing on screen and upcoming bars fill the space below it.
	// Re-checked once per measure (not per beat) since a system can only
	// change on a measure boundary; while playback stays within the same
	// system the scroll position is already right and nothing moves.
	let followedMeasure = -1;
	$effect(() => {
		if (!store.isPlaying) {
			// Reset so replaying from the same measure re-pins after a manual scroll.
			followedMeasure = -1;
			return;
		}
		const measure = store.playhead?.measure;
		if (measure == null || !scoreAreaEl) return;
		if (measure === followedMeasure) return;
		followedMeasure = measure;
		const trackId = store.score.tracks.find((t) => store.isTrackVisible(t.id))?.id;
		if (!trackId) return;
		const target = findSystemFor(trackId, measure);
		if (!target) return;
		const view = scoreAreaEl.getBoundingClientRect();
		const rect = target.getBoundingClientRect();
		// Scroll the container directly (not scrollIntoView) so only the score
		// area moves — never the page/visual viewport on mobile.
		const desired = 12; // breathing room above the focused system
		const delta = rect.top - view.top - desired;
		if (Math.abs(delta) > 4) {
			scoreAreaEl.scrollTo({ top: scoreAreaEl.scrollTop + delta, behavior: 'smooth' });
		}
	});

	// The right-click track-staff context menu doesn't track the page under
	// it as it scrolls, so it visually detaches from the note it was opened
	// on. Closing it the moment the score area scrolls avoids that.
	function closeContextMenuOnScroll() {
		if (store.contextMenuOpen) store.contextMenuOpen = false;
	}

	// Publish the score-area scroll container's geometry so the continuous
	// notation view can virtualize systems outside the viewport. Reads are cheap
	// (one getBoundingClientRect), but scroll fires fast, so the scroll path is
	// coalesced to one measurement per animation frame.
	function syncViewport() {
		const el = scoreAreaEl;
		if (!el) return;
		scoreViewport.sync(el.scrollTop, el.getBoundingClientRect().top, el.clientHeight);
	}
	let scrollRaf = 0;
	function onScoreScroll() {
		closeContextMenuOnScroll();
		if (scrollRaf) return;
		scrollRaf = requestAnimationFrame(() => {
			scrollRaf = 0;
			syncViewport();
		});
	}

	// Keep the published geometry in step with the container: initial measurement
	// plus any size change (panels opening, window resize, the desktop⇄mobile
	// swap that rebinds scoreAreaEl). The effect re-runs when scoreAreaEl changes.
	// The measurement is deferred to a frame (rAF / the ResizeObserver's own
	// initial callback) so it writes viewport state outside the current reactive
	// flush rather than synchronously within it.
	$effect(() => {
		const el = scoreAreaEl;
		if (!el) return;
		const raf = requestAnimationFrame(syncViewport);
		const ro = new ResizeObserver(() => syncViewport());
		ro.observe(el);
		window.addEventListener('resize', syncViewport);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			window.removeEventListener('resize', syncViewport);
		};
	});

	onMount(() => {
		store.loadFromStorage();
		store.initLayout();
		window.addEventListener('keydown', handleGlobalKeydown);
		// Touch-only (guards on pointerType internally): long-press any titled
		// button to see what it does, since touch has no hover for `title`.
		const disposeLongPress = initLongPressTooltips();
		const disposeHaptics = initButtonHaptics();
		// Reveal the real layout as soon as the document + desktop/mobile detection
		// are ready — the score itself needs none of the audio assets to render, so
		// gating first paint on the soundfont fetch only adds its (cold-cache)
		// network time to the perceived load. Prefetch the heavy audio assets
		// (module + soundfont) in the background instead; the synth still boots on
		// the first user interaction below (an AudioContext created before a gesture
		// would be suspended by the browser autoplay policy).
		ready = true;
		audio.preload();
		const warm = () => audio.warmup();
		window.addEventListener('pointerdown', warm, { once: true });
		window.addEventListener('keydown', warm, { once: true });
		// Suspend system virtualization while the browser captures the page, so a
		// direct Ctrl+P from the continuous view prints every system, not just the
		// ones near the viewport. flushSync forces the full DOM to materialize
		// synchronously before the (blocking) print snapshot is taken.
		const onBeforePrint = () => {
			scoreViewport.printing = true;
			flushSync();
		};
		const onAfterPrint = () => {
			scoreViewport.printing = false;
		};
		window.addEventListener('beforeprint', onBeforePrint);
		window.addEventListener('afterprint', onAfterPrint);
		return () => {
			window.removeEventListener('keydown', handleGlobalKeydown);
			window.removeEventListener('pointerdown', warm);
			window.removeEventListener('keydown', warm);
			window.removeEventListener('beforeprint', onBeforePrint);
			window.removeEventListener('afterprint', onAfterPrint);
			disposeLongPress();
			disposeHaptics();
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
	<!-- Spinner shown while a viewport/width change (or a desktop⇄mobile switch)
	     re-lays-out the score — on a long song that relayout blocks the main
	     thread for a noticeable beat. Rendered ONCE here, outside the layout
	     branches below, so it stays mounted (and its CSS spin keeps running on
	     the compositor) even while the branch swap rebuilds the whole score. It
	     masks the jank without touching the session. pointer-events-none while
	     fading, but it does sit above the app so a mid-relayout tap doesn't hit a
	     half-built layout. -->
	{#snippet resizeOverlay()}
		{#if store.scoreResizing}
			<!-- Appears INSTANTLY (no in-transition): a Svelte fade-in animates
			     opacity on the main thread, so if the relayout freeze starts right
			     after the overlay mounts, the fade would stall at ~0 opacity for the
			     whole freeze — the overlay would be in the DOM but invisible (this is
			     exactly why big→small used to show nothing). Only the fade-OUT is
			     kept; it runs after the freeze, when the main thread is free. The
			     spinner itself is a compositor CSS animation, so it keeps turning
			     even while the main thread is blocked. -->
			<!-- print:hidden: fixed overlays repeat on every printed sheet, so a
			     relayout that's still settling when the print dialog snapshots the
			     page would stamp a spinner onto each PDF page. -->
			<div
				class="fixed inset-0 z-[150] flex items-center justify-center bg-bg/60 backdrop-blur-[1px] print:hidden"
				out:fade={{ duration: 140 }}
			>
				<Spinner size={30} />
			</div>
		{/if}
	{/snippet}

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

		<!-- Renders whichever panel occupies a slot, at the given placement.
		     Each panel decides its own docked-vs-floating chrome from `placement`. -->
		{#snippet slotPanel(id: PanelId, placement: 'left' | 'right' | 'bottom' | 'float')}
			{#if id === 'note'}
				<NotePropertiesPanel {placement} />
			{:else if id === 'keys'}
				<KeyInput {placement} />
			{:else if id === 'tuner'}
				<!-- float-only, so `placement` is always 'float' here -->
				<TunerPanel />
			{:else}
				<RightPanel which={id} {placement} />
			{/if}
		{/snippet}

		<!-- Divider between the two bottom-docked panels. Hovering it reveals a
		     swap button that flips which panel sits on the left. -->
		{#snippet splitSeparator()}
			<!-- z-40 lifts the separator (and its swap button) above the two
			     backdrop-blurred panels on either side — those establish their own
			     stacking contexts and would otherwise paint over the button. Carries
			     the same single translucent+blur surface as the panels it sits
			     between, so the sliver of dock between them reads as the card (the
			     dock wrapper itself is transparent now) rather than see-through. -->
			<div
				class="group/sep relative z-40 flex w-3 shrink-0 items-stretch justify-center self-stretch bg-background/50 backdrop-blur-md"
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

		<div
			class="print-unclip relative flex h-screen h-dvh flex-col overflow-hidden bg-bg print:bg-white"
		>
			<StatusBanner />

			<!-- Score area with the left/right panels floated on top of it.
			     The panels are NOT flow siblings of the score anymore — they're
			     absolute overlays, so opening one no longer shrinks the staff; it
			     just floats in front of it. -->
			<div class="print-unclip relative flex min-h-0 flex-1 flex-row overflow-hidden">
				<!-- Score area. The bottom dock (tracks/key-input/bottom bar) is an
				     absolutely-positioned overlay, not a flow sibling — so the score
				     keeps scrolling underneath it and shows through its backdrop
				     blur, the same as the mobile dock. The padding-bottom below just
				     keeps content clear of the dock by default.

				     Vertical scroll lives on <main> so tall scores pass behind the
				     dock; HORIZONTAL scroll lives on the inner wrapper instead, so its
				     scrollbar renders there (above the dock) rather than at <main>'s
				     bottom edge, which sits hidden behind the dock overlay.

				     scrollbar-gutter is pinned stable because the padding below tracks
				     the dock height: toggling a bottom panel (tracks / note / keys)
				     would otherwise flip the scrollbar in or out, changing the score's
				     width and retriggering a full relayout — and with it the resize
				     spinner — for a mere panel toggle. The +40 keeps the sheet's bottom
				     edge scrollable clear of the dock (which floats 16px off the
				     viewport bottom), so the page background stays visible below it. -->
				<main
					class="print-unclip min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] [padding:20px_18px_24px] max-[720px]:[padding:12px_8px_0] print:overflow-visible print:bg-white print:p-0"
					bind:this={scoreAreaEl}
					style="padding-bottom: {desktopDockHeight + 40}px"
					onscroll={onScoreScroll}
				>
					<div
						class="print-unclip flex [justify-content:safe_center] overflow-x-auto"
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
						class="pointer-events-none absolute inset-y-0 left-0 z-30 p-4 print:hidden"
						style="width:{slotWidth(leftSlot)}; padding-bottom:{desktopDockHeight + 32}px"
					>
						{@render slotPanel(leftSlot, 'left')}
					</div>
				{/if}

				<!-- Right edge slot: same floating-overlay treatment (see left slot). -->
				{#if rightSlot}
					<div
						class="pointer-events-none absolute inset-y-0 right-0 z-30 p-4 print:hidden"
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
			     wrapper itself is transparent — every docked panel (tracks / note /
			     keys / bottom bar) carries its own single translucent+blur surface,
			     exactly like the mobile dock, so the dock isn't double-tinted (a
			     second 50% layer under the panels made it read opaque on desktop
			     while mobile stayed properly see-through). Capped in height so a tall
			     stack (tracks + note + keys) can't outgrow the viewport — inner
			     regions scroll instead. -->
			<div
				class="absolute inset-x-4 bottom-4 z-20 flex max-h-[calc(100dvh-5rem)] shrink-0 flex-col overflow-hidden rounded-lg border border-border shadow-[0_6px_24px_rgba(0,0,0,0.14)] print:hidden"
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
				<div class="contents print:hidden">
					{@render slotPanel(id, 'float')}
				</div>
			{/each}
		</div>
	{:else}
		<!-- ═══════════════════════════════════════════════════════════════
	     MOBILE LAYOUT  (< 1024 px)
	     Fixed-bottom dock with slide-up note editor or tracks panel.
	     ═══════════════════════════════════════════════════════════════ -->
		<div class="print-unclip flex h-screen h-dvh flex-col overflow-hidden bg-bg print:bg-white">
			<StatusBanner />
			<!-- scrollbar-gutter stable for the same reason as desktop: the padding
			     below tracks the dock height, and letting the scrollbar toggle with
			     it would change the score width and retrigger a relayout (plus the
			     resize spinner) whenever the edit/mixer panel opens. The +48 keeps
			     the sheet's bottom edge scrollable clear of the fixed dock card. -->
			<!-- safe center + overflow-x-auto: page view's fixed-width A4 sheets can
			     be wider than a phone screen; plain justify-center would clip their
			     left edge unreachably, safe center + scroll keeps it reachable. -->
			<main
				class="print-unclip flex min-h-0 flex-1 [justify-content:safe_center] overflow-x-auto overflow-y-auto [scrollbar-gutter:stable] [padding:20px_18px_0] max-[720px]:[padding:12px_8px_0] print:overflow-visible print:bg-white print:p-0"
				bind:this={scoreAreaEl}
				style="padding-bottom: {bottomBarHeight + (dockPanel ? dockPanelHeight : 0) + 48}px"
				onscroll={onScoreScroll}
			>
				<ScoreArea onHeaderClick={() => (store.songModalOpen = true)} />
			</main>

			<!-- Bottom dock floated off the edges so it reads as a card and leaves
			     the score's vertical scrollbar visible on the right. The safe-area
			     inset is absorbed by the card's bottom OFFSET (not padding inside
			     the bar), so when the browser chrome collapses and the inset
			     appears, the whole card lifts — the bar itself never stretches. -->
			<div
				class="fixed inset-x-3 z-50 overflow-hidden rounded-lg border border-border shadow-[0_6px_24px_rgba(0,0,0,0.18)] print:hidden"
				style="bottom: max(0.75rem, env(safe-area-inset-bottom, 0px))"
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
			<TunerModal />
		</div>
	{/if}

	{@render resizeOverlay()}
{/if}

<OpenFileModal />

<FileDropZone />

<PdfExportModal />

<LoadingScreen forceActive={!ready} />
