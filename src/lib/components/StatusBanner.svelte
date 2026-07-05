<script lang="ts">
	// Surfaces "hidden" playback state as toasts: muted/soloed tracks and focus
	// mode are easy to forget about once set, and a heavy arrangement or an
	// over-full bar are worth flagging before anything actually glitches. Each
	// toast is keyed by a stable id so re-triggering the same condition updates
	// it in place instead of stacking duplicates, and the underlying state
	// (audioError, sampleWarning) is cleared on dismiss so it doesn't reappear
	// until the condition happens again.

	import { store } from '$lib/stores/score.svelte';
	import { toast } from 'svelte-sonner';

	const mutedNames = $derived(store.score.tracks.filter((t) => t.muted).map((t) => t.name));
	const soloedNames = $derived(store.score.tracks.filter((t) => t.soloed).map((t) => t.name));

	// Many simultaneously-audible tracks compound CPU load (each has its own
	// always-running EQ/pan/gain chain, on top of whatever instrument it
	// plays), which is the kind of thing that turns into choppy audio on
	// slower devices. Flagging it before that happens, not after, is the point.
	const anySolo = $derived(store.score.tracks.some((t) => t.soloed));
	const activeTrackCount = $derived(
		store.score.tracks.filter((t) => !t.muted && (!anySolo || t.soloed)).length
	);
	const HEAVY_TRACK_THRESHOLD = 7;
	const heavyLoad = $derived(activeTrackCount >= HEAVY_TRACK_THRESHOLD);

	// Over-full bar warning: the "extra notes won't play" hazard. Tracks the
	// cursor's bar.
	const overflowBar = $derived(
		store.currentMeasureFill?.overflow ? store.cursor.measure + 1 : null
	);

	$effect(() => {
		if (store.markStartPending) {
			const message = store.isDesktop
				? 'Start marked. Right-click the end note, or press ] to finish.'
				: 'Start marked. Long-press the end note, then tap Mark end.';
			toast(message, {
				id: 'mark-start',
				duration: Infinity,
				action: { label: 'Cancel', onClick: () => store.cancelMarkStart() }
			});
		} else {
			toast.dismiss('mark-start');
		}
	});

	$effect(() => {
		if (overflowBar) {
			toast.warning(`Bar ${overflowBar} is over-full. Extra notes will not play.`, {
				id: 'overflow-bar',
				duration: Infinity
			});
		} else {
			toast.dismiss('overflow-bar');
		}
	});

	$effect(() => {
		if (store.audioError) {
			const message = store.audioError;
			toast.error(message, {
				id: 'audio-error',
				duration: Infinity,
				onDismiss: () => {
					if (store.audioError === message) store.audioError = null;
				}
			});
		} else {
			toast.dismiss('audio-error');
		}
	});

	$effect(() => {
		if (store.sampleWarning) {
			const message = store.sampleWarning;
			toast.warning(message, {
				id: 'sample-warning',
				duration: Infinity,
				onDismiss: () => {
					if (store.sampleWarning === message) store.sampleWarning = null;
				}
			});
		} else {
			toast.dismiss('sample-warning');
		}
	});

	$effect(() => {
		const parts: string[] = [];
		if (mutedNames.length) parts.push(`${mutedNames.length} muted`);
		if (soloedNames.length) parts.push(`${soloedNames.length} soloed`);
		if (heavyLoad) parts.push(`${activeTrackCount} tracks playing. May stutter on slower devices.`);

		if (parts.length) {
			toast.info(parts.join('. '), { id: 'playback-status', duration: Infinity });
		} else {
			toast.dismiss('playback-status');
		}
	});
</script>
