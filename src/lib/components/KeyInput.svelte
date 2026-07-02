<script lang="ts">
	// Standalone key-entry strip for desktop mode. Contains only the
	// keypad/fretboard/piano tab selector and the active input tool.
	// Note properties (duration, effects, etc.) live in NotePropertiesPanel.

	import { store } from '$lib/stores/score.svelte';
	import { enterDigit } from '$lib/editing/entry';
	import { draggable } from '@neodrag/svelte';
	import { panelDragOptions } from '$lib/floating-panel';
	import Fretboard from './Fretboard.svelte';
	import Piano from './Piano.svelte';
	import X from 'phosphor-svelte/lib/X';
	import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';
	import ArrowSquareIn from 'phosphor-svelte/lib/ArrowSquareIn';

	const popped = $derived(store.keyInputPopped);
</script>

<div class="key-input {popped ? 'key-input--popped' : ''}" use:draggable={panelDragOptions(popped)}>
	<div class="key-input-header" data-panel-handle class:handle={popped}>
		<span class="tool-name">
			{store.editTool === 'keypad'
				? 'Keypad'
				: store.editTool === 'fretboard'
					? 'Fretboard'
					: 'Piano'}
		</span>
		<div class="header-actions">
			<button
				class="hide-btn"
				data-panel-cancel
				onclick={() => (store.keyInputPopped = !store.keyInputPopped)}
				title={popped ? 'Dock key input' : 'Pop out key input'}
				aria-label={popped ? 'Dock key input' : 'Pop out key input'}
			>
				{#if popped}
					<ArrowSquareIn class="size-4" />
				{:else}
					<ArrowSquareOut class="size-4" />
				{/if}
			</button>
			<button
				class="hide-btn"
				data-panel-cancel
				onclick={() => (store.keyInputOpen = false)}
				title="Close key input"
				aria-label="Close key input"
			>
				<X class="size-4" />
			</button>
		</div>
	</div>

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
	/* Detached, free-floating window (draggable, constrained to the viewport). */
	.key-input--popped {
		position: fixed;
		left: 1rem;
		bottom: 6rem;
		z-index: 50;
		width: min(640px, 92vw);
		max-height: 70vh;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.14);
	}
	.key-input-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px;
		border-bottom: 1px solid var(--border);
	}
	.key-input-header.handle {
		cursor: move;
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.tool-name {
		font-size: 12px;
		font-weight: 700;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}
	.hide-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		width: 30px;
		height: 30px;
		color: var(--text-muted);
		cursor: pointer;
	}
	.hide-btn:hover {
		color: var(--ink);
	}
	.key-input-body {
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
