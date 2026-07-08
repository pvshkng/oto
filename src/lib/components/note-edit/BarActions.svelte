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
	import LockKey from 'phosphor-svelte/lib/LockKey';
	import LockKeyOpen from 'phosphor-svelte/lib/LockKeyOpen';
	import ArrowBendDownLeft from 'phosphor-svelte/lib/ArrowBendDownLeft';

	let { dense = false }: { dense?: boolean } = $props();

	const mi = $derived(store.cursor.measure);
	const onlyOne = $derived(store.track.measures.length <= 1);
	const locked = $derived(store.isMeasureLocked(mi));
	const lineBreak = $derived(!!store.currentMeasure?.lineBreak);
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
	class={cn(ctlStyle({ dense }), 'disabled:cursor-not-allowed disabled:opacity-40')}
	disabled={locked}
	title="Clear bar"
	aria-label="Clear bar"
	onclick={() => store.clearMeasureAt(mi)}
>
	<Eraser class="size-5" />
</button>
<button
	class={cn(ctlStyle({ dense }), 'disabled:cursor-not-allowed disabled:opacity-40')}
	disabled={onlyOne || locked}
	title="Delete bar"
	aria-label="Delete bar"
	onclick={() => store.removeMeasureFromAll(mi)}
>
	<Trash class="size-5" />
</button>
<button
	class={cn(ctlStyle({ dense }), { sunk: locked })}
	title={locked ? 'Unlock bar' : 'Lock bar (reject edits)'}
	aria-label={locked ? 'Unlock bar' : 'Lock bar'}
	aria-pressed={locked}
	onclick={() => store.toggleMeasureLocked(mi)}
>
	{#if locked}
		<LockKey class="size-5" />
	{:else}
		<LockKeyOpen class="size-5" />
	{/if}
</button>
<button
	class={cn(ctlStyle({ dense }), { sunk: lineBreak })}
	title="Force line break (this bar starts a new line)"
	aria-label="Force line break"
	aria-pressed={lineBreak}
	onclick={() => store.toggleMeasureLineBreak(mi)}
>
	<ArrowBendDownLeft class="size-5" />
</button>
