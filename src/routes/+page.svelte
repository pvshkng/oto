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
	import DesktopLayout from './DesktopLayout.svelte';
	import MobileLayout from './MobileLayout.svelte';
	import OpenFileModal from '$lib/components/modals/OpenFileModal.svelte';
	import FileDropZone from '$lib/components/FileDropZone.svelte';
	import PdfExportModal from '$lib/components/modals/PdfExportModal.svelte';
	import SettingsModal from '$lib/components/modals/SettingsModal.svelte';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { audio } from '$lib/audio/engine';

	// The score-scroll container of whichever layout (desktop/mobile) is
	// mounted — bound out of the layout component so the scroll, auto-follow
	// and viewport effects below survive the breakpoint swap.
	let scoreAreaEl = $state<HTMLElement | undefined>(undefined);

	// Gates the first paint of the real layout: stays false until the saved
	// score is restored, desktop/mobile is detected, and the audio engine
	// has warmed up — so the page goes straight from the loading screen to
	// the actual tab, with no flash of the empty default score in between.
	let ready = $state(false);

	// Multi-track view splits a track's systems across several sections
	// (interleaved with other tracks' matching systems), so a track can have
	// more than one section — gather them all and search across. Every system is
	// in the DOM whether or not its canvas is mounted (TrackStaff virtualizes
	// only the canvas, not the sized placeholder), so a system far off-screen is
	// still findable. Null means the track — or that bar of it — isn't rendered.
	// Shared by the explicit "scroll to track" requests below and the playback
	// auto-follow effect further down.
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
		return null;
	}

	// Pin a system to the top of the score view. Scrolls the container directly
	// (not scrollIntoView) so only the score area moves — never the page/visual
	// viewport on mobile. `minDelta` skips moves too small to be worth animating.
	const SYSTEM_TOP_GAP = 12; // breathing room above the focused system
	function pinSystemToTop(target: Element, minDelta = 0) {
		if (!scoreAreaEl) return;
		const view = scoreAreaEl.getBoundingClientRect();
		const rect = target.getBoundingClientRect();
		const delta = rect.top - view.top - SYSTEM_TOP_GAP;
		if (Math.abs(delta) <= minDelta) return;
		scoreAreaEl.scrollTo({ top: scoreAreaEl.scrollTop + delta, behavior: 'smooth' });
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
			return;
		}
		const trackId = req.trackId;
		if (req.kind !== 'track' || !trackId) return;
		// A request usually arrives in the same tick the track was revealed (e.g.
		// clicking another instrument's bar in the tracks panel), and its staff
		// only builds systems once it has measured its own width — a frame or two
		// later. So retry until the target bar exists rather than scrolling to
		// whatever is there now. Capped so a request for a bar that never renders
		// gives up instead of spinning.
		let frames = 0;
		let raf = 0;
		const attempt = () => {
			const target = findSystemFor(trackId, req.measure);
			if (target) pinSystemToTop(target);
			else if (++frames < 30) raf = requestAnimationFrame(attempt);
		};
		attempt();
		return () => cancelAnimationFrame(raf);
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
		pinSystemToTop(target, 4);
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
		<DesktopLayout bind:scoreAreaEl {onScoreScroll} onInnerScroll={closeContextMenuOnScroll} />
	{:else}
		<MobileLayout bind:scoreAreaEl {onScoreScroll} />
	{/if}

	{@render resizeOverlay()}
{/if}

<OpenFileModal />

<FileDropZone />

<PdfExportModal />

<SettingsModal />

<LoadingScreen forceActive={!ready} />
