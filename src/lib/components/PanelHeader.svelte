<script lang="ts">
	// Shared header for desktop side panels (RightPanel modes, NotePropertiesPanel):
	// an uppercase title left, a close button right. Kept tiny and prop-driven
	// rather than reused via slots/snippets since every caller just needs a
	// title string and a close handler.
	import X from 'phosphor-svelte/lib/X';

	let {
		title,
		onClose,
		closeLabel = 'Close'
	}: {
		title: string;
		onClose: () => void;
		closeLabel?: string;
	} = $props();
</script>

<div class="flex shrink-0 items-center justify-between border-b border-border px-3.5 py-2.5">
	<span class="text-[13px] font-bold tracking-[0.4px] text-ink uppercase">{title}</span>
	<button
		class="inline-flex size-7 cursor-pointer items-center justify-center rounded-legacy-xs border-none bg-transparent [background-image:none!important] text-text-muted hover:bg-panel-2 hover:text-ink"
		title={closeLabel}
		aria-label={closeLabel}
		onclick={onClose}
	>
		<X class="size-4" />
	</button>
</div>
