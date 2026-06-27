<script lang="ts">
	// Sticky top banner that surfaces "hidden" playback state: muted/soloed
	// tracks and focus mode are easy to forget about once set. Dismissible, but
	// reappears the moment the underlying mute/solo/focus state changes again.

	import { store } from '$lib/stores/score.svelte';
	import X from 'phosphor-svelte/lib/X';

	const mutedNames = $derived(store.score.tracks.filter((t) => t.muted).map((t) => t.name));
	const soloedNames = $derived(store.score.tracks.filter((t) => t.soloed).map((t) => t.name));
	const focusedName = $derived(store.isFocusMode ? store.focusedTrackName : null);

	const signature = $derived(JSON.stringify({ m: mutedNames, s: soloedNames, f: focusedName }));
	const isActive = $derived(
		mutedNames.length > 0 || soloedNames.length > 0 || focusedName !== null
	);

	let dismissedSignature = $state<string | null>(null);
	const visible = $derived(isActive && signature !== dismissedSignature);

	function dismiss() {
		dismissedSignature = signature;
	}
</script>

{#if visible}
	<div class="banner no-print" role="status">
		<div class="text">
			{#if mutedNames.length}
				<span class="chip">{mutedNames.length} muted</span>
			{/if}
			{#if soloedNames.length}
				<span class="chip">{soloedNames.length} soloed</span>
			{/if}
			{#if focusedName}
				<span class="chip">Focusing “{focusedName}”</span>
			{/if}
		</div>
		<button class="close" onclick={dismiss} title="Hide" aria-label="Hide banner">
			<X class="size-3.5" weight="bold" />
		</button>
	</div>
{/if}

<style>
	.banner {
		position: sticky;
		top: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 6px 12px;
		background: var(--ink);
		color: var(--accent-ink);
		font-size: 12px;
		font-weight: 600;
	}
	.text {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.chip {
		white-space: nowrap;
	}
	.close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--accent-ink);
		opacity: 0.75;
		cursor: pointer;
		padding: 2px;
		flex: none;
	}
	.close:hover {
		opacity: 1;
	}
</style>
