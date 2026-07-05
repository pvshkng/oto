<script lang="ts">
	// Note-level actions beyond techniques: tie-to-next and delete, shared by
	// EditPanel and NotePropertiesPanel. Both need a note under the cursor.
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
	disabled={!note}
	title="Tie to next note"
	aria-label="Tie to next note"
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
