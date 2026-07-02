<script lang="ts">
	// The "paper" content shared by +page.svelte's desktop and mobile layouts:
	// the score title/artist header button and the track loop. Byte-identical
	// between the two hosts except what happens when the header is clicked
	// (desktop closes the other right-panel modes first; mobile doesn't).
	import { store } from '$lib/stores/score.svelte';
	import { computeSharedSystems } from '$lib/notation/layout';
	import TrackStaff from './TrackStaff.svelte';

	let { onHeaderClick }: { onHeaderClick: () => void } = $props();

	// Width available to each track's staff, measured once here so every
	// track's shared system breakdown (below) agrees on the same value.
	let tracksWidth = $state(1000);
	let tracksWrapperEl: HTMLDivElement | undefined;
	$effect(() => {
		if (!tracksWrapperEl) return;
		const ro = new ResizeObserver((entries) => {
			tracksWidth = entries[0].contentRect.width;
		});
		ro.observe(tracksWrapperEl);
		return () => ro.disconnect();
	});

	const visibleTracks = $derived(store.score.tracks.filter((t) => store.isTrackVisible(t.id)));

	// Multi-track view: every visible track's systems must break at the same
	// measures and share the same computed system count, so a shared system
	// index N groups track 1's Nth system with track 2's Nth system etc. —
	// bars read top-to-bottom in parallel instead of one track's whole staff
	// followed by the next track's whole staff.
	const shared = $derived(
		store.trackViewMode === 'multi' && visibleTracks.length > 1
			? computeSharedSystems(store.score, visibleTracks, tracksWidth - 8)
			: undefined
	);
</script>

<div
	class="[padding:28px_30px_36px] h-fit w-full max-w-[1080px] rounded-legacy-md border border-border bg-paper shadow-[var(--shadow-1),var(--shadow-2)] max-[720px]:[padding:18px_12px_26px] lg:min-w-[860px] print:max-w-none print:min-w-0 print:border-none print:shadow-none"
>
	<button
		class="group relative mb-[22px] block w-full cursor-pointer border-none bg-transparent [background-image:none!important] [padding:0_0_16px] text-center [border-bottom:1px_solid_var(--border)]"
		onclick={onHeaderClick}
		title="Edit song details"
	>
		<h1
			class="m-0 [font-family:var(--serif)] text-[27px] font-semibold text-ink max-[720px]:text-[22px]"
		>
			{store.score.title || 'Untitled Score'}
		</h1>
		<p class="[margin:4px_0_0] [font-family:var(--serif)] text-text-muted italic">
			{store.score.artist || 'Unknown'}
		</p>
		<span
			class="absolute top-0 right-0 rounded-legacy-xs border border-border-strong px-1.5 py-0.5 text-[10px] text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-[720px]:opacity-100"
			>edit ✎</span
		>
	</button>

	<div bind:this={tracksWrapperEl}>
		{#if shared}
			{#each shared.systems as _, si (si)}
				{#each store.score.tracks as track, i (track.id)}
					{#if store.isTrackVisible(track.id)}
						<section class="mb-1" data-track-id={track.id}>
							<TrackStaff trackIndex={i} onlySystemIndex={si} sharedOverride={shared} />
						</section>
					{/if}
				{/each}
			{/each}
		{:else}
			{#each store.score.tracks as track, i (track.id)}
				{#if store.isTrackVisible(track.id)}
					<section class="mb-3" data-track-id={track.id}>
						<TrackStaff trackIndex={i} />
					</section>
				{/if}
			{/each}
		{/if}
	</div>
</div>
