<script lang="ts">
	// The dock/undock toggle row shown in a desktop panel's header. Offers every
	// dock the panel is allowed to use EXCEPT its current one (you can't dock to
	// where you already are), so the buttons always read as "move me elsewhere":
	//   • float  — detach into a free-floating, draggable window (ArrowSquareOut)
	//   • left   — dock to the left edge   (mirrored SquareHalf)
	//   • right  — dock to the right edge  (SquareHalf)
	//   • bottom — dock to the bottom strip (SquareHalfBottom)
	import { store, type PanelId, type Dock } from '$lib/stores/score.svelte';
	import SquareHalf from 'phosphor-svelte/lib/SquareHalf';
	import SquareHalfBottom from 'phosphor-svelte/lib/SquareHalfBottom';
	import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';

	let { id }: { id: PanelId } = $props();

	const dock = $derived(store.panelDock(id));
	const allowed = $derived(store.panelAllowed(id));

	function show(target: Dock): boolean {
		return allowed.includes(target) && dock !== target;
	}

	const btnClass =
		'inline-flex size-7 cursor-pointer items-center justify-center rounded-legacy-xs border-none bg-transparent [background-image:none!important] text-text-muted hover:bg-panel-2 hover:text-ink';
</script>

{#if show('float')}
	<button
		data-panel-cancel
		class={btnClass}
		title="Float window"
		aria-label="Float window"
		onclick={() => store.setPanelDock(id, 'float')}
	>
		<ArrowSquareOut class="size-4" />
	</button>
{/if}
{#if show('left')}
	<button
		data-panel-cancel
		class={btnClass}
		title="Dock left"
		aria-label="Dock left"
		onclick={() => store.setPanelDock(id, 'left')}
	>
		<SquareHalf class="size-4 -scale-x-100" />
	</button>
{/if}
{#if show('right')}
	<button
		data-panel-cancel
		class={btnClass}
		title="Dock right"
		aria-label="Dock right"
		onclick={() => store.setPanelDock(id, 'right')}
	>
		<SquareHalf class="size-4" />
	</button>
{/if}
{#if show('bottom')}
	<button
		data-panel-cancel
		class={btnClass}
		title="Dock bottom"
		aria-label="Dock bottom"
		onclick={() => store.setPanelDock(id, 'bottom')}
	>
		<SquareHalfBottom class="size-4" />
	</button>
{/if}
