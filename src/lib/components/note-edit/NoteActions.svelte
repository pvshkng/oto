<script lang="ts">
	// Note-level actions beyond techniques: tie and delete, shared by EditPanel
	// and NotePropertiesPanel. Tie is pressable on the beat AFTER an earlier
	// note on the cursor's string (even bars back) — it drops a continuation
	// that sustains that note. Delete needs a note under the cursor.
	// The tie symbol is the Unicode undertie (‿) — SMuFL/Bravura has no
	// standalone tie glyph since engraved ties are drawn curves.
	import { store } from '$lib/stores/score.svelte';
	import { cn } from '$lib/utils';
	import { fxStyle } from './control-styles';
	import Trash from 'phosphor-svelte/lib/Trash';

	let { dense = false }: { dense?: boolean } = $props();

	const note = $derived(store.currentNote);
</script>

<button
	class={cn(fxStyle({ dense }), { sunk: !!note?.tied })}
	disabled={!store.canTie}
	title="Tie note"
	aria-label="Tie note"
	aria-pressed={!!note?.tied}
	onclick={() => store.toggleNoteTie()}
>
	<span class="pb-1.5 text-[15px] leading-none">‿</span>
</button>
<button
	class={fxStyle({ dense })}
	disabled={!note}
	title="Delete note"
	aria-label="Delete note"
	onclick={() => store.deleteNoteAtCursor()}
>
	<Trash class="size-4" />
</button>
