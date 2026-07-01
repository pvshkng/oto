<script lang="ts">
	// Sticky top banner that surfaces "hidden" playback state: muted/soloed
	// tracks and focus mode are easy to forget about once set. Dismissible, but
	// reappears the moment the underlying mute/solo/focus state changes again.
	//
	// Also doubles as the app's audio-health surface: a heavy-arrangement
	// caution (shown *before* anything has actually glitched, so it's a real
	// preventative measure) and an actual audio-start failure (shown reactively
	// if the engine couldn't start, e.g. a blocked autoplay policy).

	import { store } from '$lib/stores/score.svelte';
	import X from 'phosphor-svelte/lib/X';

	const mutedNames = $derived(store.score.tracks.filter((t) => t.muted).map((t) => t.name));
	const soloedNames = $derived(store.score.tracks.filter((t) => t.soloed).map((t) => t.name));

	// Over-full bar warning, promoted from the score sheet into this sticky banner
	// so it's always visible. Reserved red — the only thing in the app that uses it
	// — marks the "extra notes won't play" hazard. Tracks the cursor's bar.
	const overflowBar = $derived(
		store.currentMeasureFill?.overflow ? store.cursor.measure + 1 : null
	);

	// Many simultaneously-audible tracks compound CPU load (each has its own
	// always-running EQ/pan/gain chain, on top of whatever instrument it plays),
	// which is the kind of thing that turns into "choppy" audio on slower
	// devices. Flagging it before that happens — not after — is the point.
	const anySolo = $derived(store.score.tracks.some((t) => t.soloed));
	const activeTrackCount = $derived(
		store.score.tracks.filter((t) => !t.muted && (!anySolo || t.soloed)).length
	);
	const HEAVY_TRACK_THRESHOLD = 7;
	const heavyLoad = $derived(activeTrackCount >= HEAVY_TRACK_THRESHOLD);

	const signature = $derived(JSON.stringify({ m: mutedNames, s: soloedNames, h: heavyLoad }));
	const isActive = $derived(mutedNames.length > 0 || soloedNames.length > 0 || heavyLoad);

	let dismissedSignature = $state<string | null>(null);
	const visible = $derived(isActive && signature !== dismissedSignature);

	function dismiss() {
		dismissedSignature = signature;
	}
</script>

{#if store.markStartPending}
	<div class="banner mark no-print" role="status">
		<div class="text">
			<span class="chip mark-chip">
				<span class="mark-flag-icon">[</span>
				{#if store.isDesktop}
					Start marked — right-click the end note, or press&nbsp;<kbd>]</kbd>
				{:else}
					Start marked — long-press the end note, tap Mark end
				{/if}
			</span>
		</div>
		<button
			class="close"
			onclick={() => store.cancelMarkStart()}
			title="Cancel"
			aria-label="Cancel selection start"
		>
			<X class="size-3.5" weight="bold" />
		</button>
	</div>
{/if}

{#if overflowBar}
	<div class="banner warn no-print" role="alert">
		<div class="text">
			<span class="chip">Bar {overflowBar} is over-full — extra notes won't play</span>
		</div>
	</div>
{/if}

{#if store.audioError}
	<div class="banner error no-print" role="alert">
		<div class="text">
			<span class="chip">{store.audioError}</span>
		</div>
		<button
			class="close"
			onclick={() => (store.audioError = null)}
			title="Dismiss"
			aria-label="Dismiss audio error"
		>
			<X class="size-3.5" weight="bold" />
		</button>
	</div>
{/if}

{#if store.sampleWarning}
	<div class="banner warn no-print" role="status">
		<div class="text">
			<span class="chip">{store.sampleWarning}</span>
		</div>
		<button
			class="close"
			onclick={() => (store.sampleWarning = null)}
			title="Dismiss"
			aria-label="Dismiss sample warning"
		>
			<X class="size-3.5" weight="bold" />
		</button>
	</div>
{/if}

{#if visible}
	<div class="banner no-print" role="status">
		<div class="text">
			{#if mutedNames.length}
				<span class="chip">{mutedNames.length} muted</span>
			{/if}
			{#if soloedNames.length}
				<span class="”chip”">{soloedNames.length} soloed</span>
			{/if}
			{#if heavyLoad}
				<span class="chip">{activeTrackCount} tracks playing — may stutter on slower devices</span>
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
	.banner.error,
	.banner.warn {
		background: var(--brick);
	}
	.banner.mark {
		background: color-mix(in srgb, var(--primary) 85%, transparent);
	}
	.mark-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.mark-flag-icon {
		font-size: 15px;
		font-weight: 900;
		line-height: 1;
		opacity: 0.8;
	}
	kbd {
		background: color-mix(in srgb, var(--accent-ink) 20%, transparent);
		border-radius: 3px;
		padding: 0 4px;
		font-family: inherit;
		font-size: 11px;
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
