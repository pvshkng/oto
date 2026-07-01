<script lang="ts">
	// Insert-before/insert-after/delete-beat icon buttons, shared by EditPanel
	// and NotePropertiesPanel.
	import { store } from '$lib/stores/score.svelte';
	import { ctlStyle } from './control-styles';
	import ColumnsPlusLeft from 'phosphor-svelte/lib/ColumnsPlusLeft';
	import ColumnsPlusRight from 'phosphor-svelte/lib/ColumnsPlusRight';
	import Eraser from 'phosphor-svelte/lib/Eraser';

	let { dense = false }: { dense?: boolean } = $props();
</script>

<button
	class={ctlStyle({ dense })}
	title="Insert beat before"
	aria-label="Insert beat before"
	onclick={() => store.insertBeatBefore()}
>
	<ColumnsPlusLeft class="size-5" />
</button>
<button
	class={ctlStyle({ dense })}
	title="Insert beat after"
	aria-label="Insert beat after"
	onclick={() => store.insertBeat()}
>
	<ColumnsPlusRight class="size-5" />
</button>
<button
	class={ctlStyle({ dense })}
	title="Delete beat"
	aria-label="Delete beat"
	onclick={() => store.deleteBeat()}
>
	<Eraser class="size-5" />
</button>
