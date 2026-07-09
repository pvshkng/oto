<script lang="ts">
	// Neutral spinning indicator — a rotating SpinnerGap glyph in the app's ink
	// tone. Shared by the initial LoadingScreen and the resize overlay so both
	// read as the same "working…" affordance.
	import SpinnerGap from 'phosphor-svelte/lib/SpinnerGap';

	let { size = 28, label = '' }: { size?: number; label?: string } = $props();
</script>

<div class="wrap">
	<span class="icon" style="width:{size}px;height:{size}px">
		<SpinnerGap {size} weight="bold" />
	</span>
	{#if label}<div class="label">{label}</div>{/if}
</div>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		color: var(--ink-soft, var(--ink));
	}
	.icon {
		display: inline-flex;
		animation: spin 0.8s linear infinite;
	}
	.label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
		letter-spacing: 0.02em;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.icon {
			animation-duration: 1.6s;
		}
	}
</style>
