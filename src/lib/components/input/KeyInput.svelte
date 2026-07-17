<script lang="ts">
	// Standalone key-entry pad for desktop mode. Contains only the
	// keypad/fretboard/piano selector and the active input tool. Note properties
	// (duration, effects, etc.) live in NotePropertiesPanel.
	//
	// Freely dockable: `placement` (from +page) says where it currently lives.
	// While docked to the bottom strip it sits flush inside the dock card; docked
	// to a side or floated it renders as its own card/window. It shares the common
	// PanelHeader so its title/dock controls/close match every other panel.

	import { store } from '$lib/stores/score.svelte';
	import { enterDigit } from '$lib/editing/entry';
	import { panelDrag } from '$lib/panel-drag';
	import { cn } from '$lib/utils';
	import Fretboard from '$lib/components/input/Fretboard.svelte';
	import Piano from '$lib/components/input/Piano.svelte';
	import PanelHeader from '$lib/components/panels/PanelHeader.svelte';

	let { placement = 'bottom' }: { placement?: 'left' | 'right' | 'bottom' | 'float' } = $props();

	const floating = $derived(placement === 'float');
	const bottom = $derived(placement === 'bottom');
	const layout = $derived(store.panelLayout.keys);
	const title = $derived(
		store.editTool === 'keypad' ? 'Keypad' : store.editTool === 'fretboard' ? 'Fretboard' : 'Piano'
	);
</script>

<div
	class={cn(
		'key-input flex flex-col overflow-hidden',
		floating && 'key-input--floating',
		bottom && 'h-full w-full',
		!bottom &&
			!floating &&
			'h-full w-full rounded-lg border border-border shadow-[0_6px_24px_rgba(0,0,0,0.14)]'
	)}
	style={floating ? `translate: ${layout.x}px ${layout.y}px; z-index: ${store.panelZ('keys')}` : ''}
	use:panelDrag={{ id: 'keys', floating }}
>
	<PanelHeader
		{title}
		panelId="keys"
		onClose={() => (store.keyInputOpen = false)}
		closeLabel="Close key input"
	/>

	<div class="key-input-body">
		{#if store.editTool === 'keypad'}
			<div class="keypad">
				{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as d (d)}
					<button class="key" onclick={() => enterDigit(d)}>{d}</button>
				{/each}
				<button class="key wide" onclick={() => store.deleteNoteAtCursor()}>⌫</button>
				<button class="key" onclick={() => store.moveCursor('up')}>▲</button>
				<button class="key" onclick={() => store.moveCursor('down')}>▼</button>
				<button class="key" onclick={() => store.moveCursor('left')}>◀</button>
				<button class="key" onclick={() => store.moveCursor('right')}>▶</button>
			</div>
		{:else if store.editTool === 'fretboard'}
			<div class="tool-wrap">
				<Fretboard />
			</div>
		{:else}
			<div class="tool-wrap">
				<Piano />
			</div>
		{/if}
	</div>
</div>

<style>
	.key-input {
		background: color-mix(in srgb, var(--background) 70%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}
	/* Detached, free-floating window (draggable, constrained to the viewport).
	   Anchored top-left like the other floating panels; the drag translate offsets
	   it from there. */
	.key-input--floating {
		position: fixed;
		left: 1rem;
		top: 1rem;
		z-index: 50;
		width: min(640px, 92vw);
		max-height: calc(100dvh - 2rem);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.14);
	}
	.key-input-body {
		flex: 1;
		overflow: auto;
		padding: 8px 10px;
	}
	.keypad {
		max-width: 600px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 5px;
	}
	.key {
		min-height: 44px;
		font-size: 17px;
		font-weight: 600;
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		background: linear-gradient(to bottom, #ffffff, #f5f5f4);
		color: var(--ink);
		cursor: pointer;
	}
	.key:active {
		background: var(--panel-2);
	}
	.key.wide {
		background: var(--ink);
		color: var(--accent-ink);
		border-color: var(--ink);
	}
</style>
