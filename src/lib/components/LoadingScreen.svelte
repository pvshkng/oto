<script lang="ts">
	// Minimal, monochromatic loading overlay shown while instrument sounds (and
	// imported files) load. Matches the app's neutral palette: the app mark, a
	// spinning indicator, a short label, and a detail line with download
	// progress when the soundfont is being fetched.

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
			{#if loading.detail}
				<p class="detail">{loading.detail}</p>
			{/if}
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
	.detail {
		margin: -8px 0 0;
		font-size: 12px;
		color: var(--muted-foreground, #888);
		font-variant-numeric: tabular-nums;
	}
</style>
