<script lang="ts">
	// Shared header for desktop side panels (RightPanel modes, NotePropertiesPanel):
	// an uppercase title left, a pop-out + close button right. Kept tiny and
	// prop-driven rather than reused via slots/snippets since every caller just
	// needs a title string and a few handlers.
	//
	// When the panel is popped out into a floating window, this header doubles as
	// the drag handle (`data-panel-handle`); the buttons opt out via
	// `data-panel-cancel` so clicking them never starts a drag.
	import X from 'phosphor-svelte/lib/X';
	import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';
	import ArrowSquareIn from 'phosphor-svelte/lib/ArrowSquareIn';

	let {
		title,
		onClose,
		closeLabel = 'Close',
		onPopOut,
		popped = false
	}: {
		title: string;
		onClose: () => void;
		closeLabel?: string;
		/** When provided, shows a pop-out/dock toggle button. */
		onPopOut?: () => void;
		popped?: boolean;
	} = $props();

	const btnClass =
		'inline-flex size-7 cursor-pointer items-center justify-center rounded-legacy-xs border-none bg-transparent [background-image:none!important] text-text-muted hover:bg-panel-2 hover:text-ink';
</script>

<div
	data-panel-handle
	class="flex shrink-0 items-center justify-between border-b border-border px-3.5 py-2.5 {popped
		? 'cursor-move'
		: ''}"
>
	<span class="text-[13px] font-bold tracking-[0.4px] text-ink uppercase">{title}</span>
	<div class="flex items-center gap-0.5">
		{#if onPopOut}
			<button
				data-panel-cancel
				class={btnClass}
				title={popped ? 'Dock panel' : 'Pop out panel'}
				aria-label={popped ? 'Dock panel' : 'Pop out panel'}
				onclick={onPopOut}
			>
				{#if popped}
					<ArrowSquareIn class="size-4" />
				{:else}
					<ArrowSquareOut class="size-4" />
				{/if}
			</button>
		{/if}
		<button
			data-panel-cancel
			class={btnClass}
			title={closeLabel}
			aria-label={closeLabel}
			onclick={onClose}
		>
			<X class="size-4" />
		</button>
	</div>
</div>
