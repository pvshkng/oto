<script lang="ts">
	// Mobile layout (< 1024 px): a fixed-bottom dock with a slide-up note
	// editor or tracks panel above the persistent bottom bar; song details and
	// the tuner render as modals instead of dockable panels.

	import { store } from '$lib/stores/score.svelte';
	import ScoreArea from '$lib/components/score/ScoreArea.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import EditPanel from '$lib/components/panels/EditPanel.svelte';
	import TracksPanel from '$lib/components/tracks-panel/TracksPanel.svelte';
	import SongModal from '$lib/components/modals/SongModal.svelte';
	import TunerModal from '$lib/components/tuner/TunerModal.svelte';
	import StatusBanner from '$lib/components/StatusBanner.svelte';

	let {
		scoreAreaEl = $bindable(),
		onScoreScroll
	}: {
		/** The score-scroll container — the page binds it to drive its
		 *  scroll/viewport effects. */
		scoreAreaEl: HTMLElement | undefined;
		onScoreScroll: () => void;
	} = $props();

	// Mobile dock panel — mutually exclusive (editMode vs mixerOpen)
	const dockPanel = $derived(store.editMode ? 'edit' : store.mixerOpen ? 'mixer' : null);

	// Height of the persistent bottom bar and the optional dock panel above it —
	// the score area reserves clearance for both so an open panel never covers
	// real score content.
	let bottomBarHeight = $state(56);
	let dockPanelHeight = $state(0);
</script>

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
