<script lang="ts">
	// The playback line: a thin vertical bar that sits in front of the beat
	// being played, one segment per visible track's current system row. It
	// steps from beat onset to beat onset — deliberately not a smooth glide,
	// so it can never drift away from the note that is actually sounding.
	//
	// It replaces the old per-beat grey "play" highlight, which repainted every
	// mounted overlay canvas on every beat tick and drowned big multi-track
	// scores. This component instead runs a requestAnimationFrame loop that
	// writes `transform` on a handful of fixed-position divs — no canvas work,
	// and no reactive store writes, so a frame costs a few rect reads no matter
	// how large the score is. (The rAF loop is still needed even though the
	// position only changes per beat: scrolling moves the fixed-position line's
	// target rects every frame.)
	//
	// Coordinates: the engine reports (measure, tick-within-measure) — see
	// AudioEngine.displayPosition(). Each track maps that to an x via its own
	// laid beats' onsets (LaidBeat.startFrac is the onset in whole-note
	// fractions, and ticks are musical time at 960/quarter), so tracks with
	// different rhythms each get a musically-correct position.
	import { store } from '$lib/stores/score.svelte';
	import { audio } from '$lib/audio/engine';
	import { TICKS_PER_QUARTER } from '$lib/audio/midi';
	import { getTrackLayout } from '$lib/notation/layout-registry';
	import type { LaidMeasure } from '$lib/notation/layout';

	const WHOLE_NOTE_TICKS = TICKS_PER_QUARTER * 4;

	const visibleTracks = $derived(store.score.tracks.filter((t) => store.isTrackVisible(t.id)));

	// One line segment per visible track: the `.system` placeholder div holding
	// the current measure (its rect gives the segment's top/height and x origin)
	// plus that track's laid measure (beat geometry for the x within the row).
	// Resolved only when the playhead enters a new measure or the DOM/layout
	// shifts under us — per frame we just read rects and write transforms.
	interface Segment {
		systemEl: HTMLElement;
		measure: LaidMeasure;
	}
	let segments: (Segment | null)[] = [];
	let segMeasure = -1;
	let clipEl: HTMLElement | null = null;
	// $state so `bind:this={lineEls[i]}` binds into reactive state (a plain
	// array triggers Svelte's binding_property_non_reactive warning). The rAF
	// loop reads it outside any reactive context, so no effect re-runs per frame.
	let lineEls: (HTMLDivElement | undefined)[] = $state([]);

	function resolveSegments(mi: number) {
		segments = visibleTracks.map((t) => {
			const layout = getTrackLayout(t.id);
			if (!layout) return null;
			let measure: LaidMeasure | null = null;
			for (const s of layout.systems) {
				for (const m of s.measures) {
					if (m.index === mi) {
						measure = m;
						break;
					}
				}
				if (measure) break;
			}
			if (!measure) return null;
			// The .system placeholder divs always exist (virtualization only skips
			// the canvas inside), and carry the measure range as data attributes.
			for (const trackEl of document.querySelectorAll(
				`section[data-track-id="${CSS.escape(t.id)}"]`
			)) {
				for (const el of trackEl.querySelectorAll<HTMLElement>('.system')) {
					const first = Number(el.dataset.firstMeasure);
					const last = Number(el.dataset.lastMeasure);
					if (mi >= first && mi <= last) return { systemEl: el, measure };
				}
			}
			return null;
		});
		// Clip to the score scroll container so the line never floats over the
		// surrounding UI when its system is (partly) scrolled out of view.
		clipEl = segments.find(Boolean)?.systemEl.closest('main') ?? null;
	}

	/** X of the playhead within a laid measure, in system coordinates. */
	function xInMeasure(m: LaidMeasure, tickIn: number, measureTicks: number): number {
		const beats = m.beats;
		if (!beats.length) {
			// Simile bars carry no laid beats — sweep the bar width proportionally.
			return m.x + (tickIn / measureTicks) * m.width;
		}
		let k = 0;
		while (k + 1 < beats.length && beats[k + 1].startFrac * WHOLE_NOTE_TICKS <= tickIn) k++;
		const t0 = beats[k].startFrac * WHOLE_NOTE_TICKS;
		const x0 = beats[k].x;
		const last = k + 1 >= beats.length;
		const t1 = last ? measureTicks : beats[k + 1].startFrac * WHOLE_NOTE_TICKS;
		const x1 = last ? m.x + m.width : beats[k + 1].x;
		const f = t1 > t0 ? Math.min(1, Math.max(0, (tickIn - t0) / (t1 - t0))) : 0;
		return x0 + (x1 - x0) * f;
	}

	function hideAll() {
		for (const el of lineEls) if (el) el.style.display = 'none';
	}

	function frame() {
		const pos = audio.displayPosition();
		if (!pos) {
			hideAll();
			return;
		}
		// Re-resolve on measure change, and when a view-mode/page toggle rebuilt
		// the DOM under us (detached elements keep working but report empty rects).
		if (pos.measure !== segMeasure || segments.some((s) => s && !s.systemEl.isConnected)) {
			resolveSegments(pos.measure);
			segMeasure = pos.measure;
		}
		const clip = clipEl?.getBoundingClientRect();
		for (let i = 0; i < lineEls.length; i++) {
			const el = lineEls[i];
			if (!el) continue;
			const seg = segments[i];
			if (!seg) {
				el.style.display = 'none';
				continue;
			}
			const rect = seg.systemEl.getBoundingClientRect();
			const x = rect.left + xInMeasure(seg.measure, pos.tickIn, pos.measureTicks);
			let top = rect.top;
			let bottom = rect.bottom;
			if (clip) {
				top = Math.max(top, clip.top);
				bottom = Math.min(bottom, clip.bottom);
				if (x < clip.left || x > clip.right) {
					el.style.display = 'none';
					continue;
				}
			}
			if (bottom - top < 2) {
				el.style.display = 'none';
				continue;
			}
			el.style.display = 'block';
			el.style.transform = `translate3d(${x}px, ${top}px, 0)`;
			el.style.height = `${bottom - top}px`;
		}
	}

	$effect(() => {
		if (!store.isPlaying) return;
		// Force a re-resolve when an edit rebuilds the layout mid-playback or the
		// set of visible tracks changes (the segment pool is parallel to it).
		void store.scoreVersion;
		void visibleTracks;
		segMeasure = -1;
		let raf = requestAnimationFrame(function step() {
			frame();
			raf = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(raf);
	});
</script>

{#if store.isPlaying}
	{#each visibleTracks as t, i (t.id)}
		<div
			bind:this={lineEls[i]}
			class="pointer-events-none fixed top-0 left-0 w-[1.5px] rounded-full bg-stone-500 opacity-50 print:hidden"
			style="display:none"
		></div>
	{/each}
{/if}
