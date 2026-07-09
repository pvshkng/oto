<script lang="ts">
	// Minimal, monochromatic loading overlay shown while instrument sounds (and
	// imported files) load. Matches the app's neutral palette — no colour, just
	// the app mark, a spinning indicator and a short label — so it reads as part
	// of the same surface rather than a separate splash. No progress bar: the
	// work is quick enough that a spinner reads cleaner than a jumpy determinate
	// bar.

	import { loading } from '$lib/stores/loading.svelte';
	import { fade } from 'svelte/transition';
	import { base } from '$app/paths';
	import Spinner from './Spinner.svelte';

	// `forceActive` keeps the overlay up before the app has finished its
	// initial load (score restore + layout detection + sample warm-up), even
	// if `loading.active` hasn't flipped on yet — so the very first paint is
	// the loading screen, not a flash of an empty/default score.
	let { forceActive = false }: { forceActive?: boolean } = $props();
</script>

{#if loading.active || forceActive}
	<div class="overlay" role="status" aria-live="polite" transition:fade={{ duration: 200 }}>
		<div class="panel">
			<img class="mark" src="{base}/images/android-chrome-512x512-transparent.png" alt="oto" />
			<Spinner size={26} label={loading.label} />
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
		padding: 24px;
	}
	.panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
		width: 100%;
		max-width: 280px;
	}
	.mark {
		width: 150px;
		height: 150px;
	}
</style>
