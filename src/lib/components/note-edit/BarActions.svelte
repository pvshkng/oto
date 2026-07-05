<script lang="ts">
	// Bar (measure) structure actions for the bar under the cursor: insert
	// before/after, duplicate, clear and delete — the same operations the omni
	// palette's Bar group offers. Shared by EditPanel (mobile bar scope) and
	// NotePropertiesPanel (desktop Bar section).
	import { store } from '$lib/stores/score.svelte';
	import { cn } from '$lib/utils';
	import { ctlStyle } from './control-styles';
	import RowsPlusTop from 'phosphor-svelte/lib/RowsPlusTop';
	import RowsPlusBottom from 'phosphor-svelte/lib/RowsPlusBottom';
	import Copy from 'phosphor-svelte/lib/Copy';
	import Eraser from 'phosphor-svelte/lib/Eraser';
	import Trash from 'phosphor-svelte/lib/Trash';

	let { dense = false }: { dense?: boolean } = $props();

	const mi = $derived(store.cursor.measure);
	const onlyOne = $derived(store.track.measures.length <= 1);
</script>

<button
	class={ctlStyle({ dense })}
	title="Insert bar before"
	aria-label="Insert bar before"
	onclick={() => store.insertMeasureAt(mi)}
>
	<RowsPlusTop class="size-5" />
</button>
<button
	class={ctlStyle({ dense })}
	title="Insert bar after"
	aria-label="Insert bar after"
	onclick={() => store.insertMeasureAt(mi + 1)}
>
	<RowsPlusBottom class="size-5" />
</button>
<button
	class={ctlStyle({ dense })}
	title="Duplicate bar"
	aria-label="Duplicate bar"
	onclick={() => store.duplicateMeasureAt(mi)}
>
	<Copy class="size-5" />
</button>
<button
	class={ctlStyle({ dense })}
	title="Clear bar"
	aria-label="Clear bar"
	onclick={() => store.clearMeasureAt(mi)}
>
	<Eraser class="size-5" />
</button>
<button
	class={cn(ctlStyle({ dense }), 'disabled:cursor-not-allowed disabled:opacity-40')}
	disabled={onlyOne}
	title="Delete bar"
	aria-label="Delete bar"
	onclick={() => store.removeMeasureFromAll(mi)}
>
	<Trash class="size-5" />
</button>
