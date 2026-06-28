<script lang="ts">
	// Minimal, monochromatic loading overlay shown while instrument samples (and
	// imported files) load. Matches the app's neutral palette — no colour, just
	// ink-on-paper and a thin determinate progress bar — so it reads as part of
	// the same surface rather than a separate splash.

	import { loading } from '$lib/stores/loading.svelte';
	import { fade } from 'svelte/transition';

	const pct = $derived(Math.round(loading.progress * 100));
</script>

{#if loading.active}
	<div class="overlay" role="status" aria-live="polite" transition:fade={{ duration: 200 }}>
		<div class="panel">
			<div class="mark">oto</div>
			<div class="label">{loading.label}</div>
			<div class="track">
				<div class="bar" style="width:{pct}%"></div>
			</div>
			<div class="meta">
				<span class="tabular">{pct}%</span>
				<span class="dim">{loading.done} / {loading.total}</span>
			</div>
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
		gap: 14px;
		width: 100%;
		max-width: 280px;
	}
	.mark {
		font-family: var(--serif);
		font-size: 30px;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--ink);
	}
	.label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
		letter-spacing: 0.02em;
	}
	.track {
		position: relative;
		width: 100%;
		height: 3px;
		border-radius: var(--r-pill);
		background: var(--panel-2);
		overflow: hidden;
	}
	.bar {
		position: absolute;
		inset: 0 auto 0 0;
		height: 100%;
		border-radius: var(--r-pill);
		background: var(--ink);
		transition: width 0.18s ease-out;
	}
	.meta {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 11px;
		color: var(--text-muted);
	}
	.tabular {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		color: var(--ink-soft);
	}
	.dim {
		font-variant-numeric: tabular-nums;
		color: var(--faint);
	}
</style>
