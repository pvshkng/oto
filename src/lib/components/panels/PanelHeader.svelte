<script lang="ts">
	// Shared header for desktop side panels (RightPanel modes, NotePropertiesPanel):
	// an uppercase title on the left, the dock/undock controls + a close button on
	// the right. Kept tiny and prop-driven rather than reused via slots/snippets
	// since every caller just needs a title string, a panel id, and a close handler.
	//
	// The drag grip (`data-panel-grip`) on the left is the drag handle in every
	// placement — drag a docked panel by it to tear it out into a floating window,
	// or a floating one to move/redock it. Buttons opt out via `data-panel-cancel`.
	import X from 'phosphor-svelte/lib/X';
	import DotsSixVertical from 'phosphor-svelte/lib/DotsSixVertical';
	import DockControls from '$lib/components/panels/DockControls.svelte';
	import type { PanelId } from '$lib/stores/score.svelte';

	let {
		title,
		onClose,
		closeLabel = 'Close',
		panelId
	}: {
		title: string;
		onClose: () => void;
		closeLabel?: string;
		/** When provided, shows the dock/undock controls for this panel. */
		panelId?: PanelId;
	} = $props();

	const btnClass =
		'inline-flex size-7 cursor-pointer items-center justify-center rounded-legacy-xs border-none bg-transparent [background-image:none!important] text-text-muted hover:bg-panel-2 hover:text-ink';
</script>

<div
	data-panel-handle
	class="flex shrink-0 cursor-grab items-center justify-between border-b border-border px-2 py-2.5 active:cursor-grabbing"
>
	<div class="flex min-w-0 items-center gap-1">
		<span class="-ml-0.5 inline-flex items-center text-text-muted">
			<DotsSixVertical class="size-4" weight="bold" />
		</span>
		<span class="truncate text-[13px] font-bold tracking-[0.4px] text-ink uppercase">{title}</span>
	</div>
	<div class="flex items-center gap-0.5">
		{#if panelId}
			<DockControls id={panelId} />
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
