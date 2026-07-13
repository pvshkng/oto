<script lang="ts">
	// Desktop chromatic tuner: a small, always-floating draggable window (its
	// only allowed dock is `float`, so the header shows just the close button).
	// Mobile shows TunerModal instead. The mic lifecycle lives in TunerDisplay.
	import { store } from '$lib/stores/score.svelte';
	import { panelDrag } from '$lib/panel-drag';
	import PanelHeader from './PanelHeader.svelte';
	import TunerDisplay from './TunerDisplay.svelte';

	const layout = $derived(store.panelLayout.tuner);
</script>

<aside
	use:panelDrag={{ id: 'tuner', floating: true }}
	style={`translate: ${layout.x}px ${layout.y}px; z-index: ${store.panelZ('tuner')}`}
	class="pointer-events-auto fixed top-4 left-4 flex w-72 max-w-[calc(100dvw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-background/50 shadow-[0_6px_24px_rgba(0,0,0,0.14)] backdrop-blur-md"
>
	<PanelHeader
		title="Tuner"
		panelId="tuner"
		onClose={() => store.closePanel('tuner')}
		closeLabel="Close tuner"
	/>
	<TunerDisplay />
</aside>
