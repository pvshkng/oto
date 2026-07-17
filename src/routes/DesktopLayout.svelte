<script lang="ts">
	// Desktop layout (≥ 1024 px):
	//
	//   ┌──────────┬─────────────────────────────────┬───────────┐
	//   │ Note     │         Score area              │  Right    │
	//   │ Props    │         (scrollable)            │  Panel    │
	//   │ (left)   │                                 │ (details) │
	//   ├──────────┴─────────────────────────────────┴───────────┤
	//   │              Tracks Panel (always visible)             │
	//   ├────────────────────────────────────────────────────────┤
	//   │          Key Input (keypad / fretboard / piano)        │
	//   ├────────────────────────────────────────────────────────┤
	//   │                     Bottom Bar                         │
	//   └────────────────────────────────────────────────────────┘
	//
	// Every desktop panel — note editor, key-input pad, and the detail panels
	// (song / track / tempo / add-remove) — can be docked to an allowed edge or
	// floated freely, independently, each remembering where the user last put it.
	// The detail panels are no longer mutually exclusive: several can float at
	// once. Here we resolve *which* panel fills each edge slot (left/right are
	// single-occupancy, kept so by the store) and which ones float; the panels
	// render docked-vs-floating from `placement`.

	import { store, type PanelId } from '$lib/stores/score.svelte';
	import Swap from 'phosphor-svelte/lib/Swap';
	import ScoreArea from '$lib/components/score/ScoreArea.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import NotePropertiesPanel from '$lib/components/panels/NotePropertiesPanel.svelte';
	import KeyInput from '$lib/components/input/KeyInput.svelte';
	import TracksPanel from '$lib/components/tracks-panel/TracksPanel.svelte';
	import RightPanel from '$lib/components/panels/RightPanel.svelte';
	import TunerPanel from '$lib/components/tuner/TunerPanel.svelte';
	import StatusBanner from '$lib/components/StatusBanner.svelte';

	let {
		scoreAreaEl = $bindable(),
		onScoreScroll,
		onInnerScroll
	}: {
		/** The vertical score-scroll container — the page binds it to drive its
		 *  scroll/viewport effects. */
		scoreAreaEl: HTMLElement | undefined;
		onScoreScroll: () => void;
		/** Fired by the inner horizontal-scroll wrapper (closes the staff context
		 *  menu, which doesn't track the page under it). */
		onInnerScroll: () => void;
	} = $props();

	// Height of the desktop bottom dock (tracks panel + key input + bottom
	// bar) — it's an absolutely-positioned overlay so the score area can
	// scroll its content underneath (visible through the dock's blur), the
	// same way the mobile dock overlaps the score. This padding just keeps
	// score content clear of the dock by default.
	let desktopDockHeight = $state(0);

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
</script>

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
				onscroll={onInnerScroll}
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
				style="width:{dropWidth(store.draggingPanel)}; padding-bottom:{desktopDockHeight + 32}px"
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
