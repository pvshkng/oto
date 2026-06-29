<script lang="ts">
	// Standalone key-entry strip for desktop mode. Contains only the
	// keypad/fretboard/piano tab selector and the active input tool.
	// Note properties (duration, effects, etc.) live in NotePropertiesPanel.

	import { store } from '$lib/stores/score.svelte';
	import { enterDigit } from '$lib/editing/entry';
	import X from 'phosphor-svelte/lib/X';
</script>

<div class="key-input">
	<div class="key-input-header">
		<span class="tool-name">
			{store.editTool === 'keypad'
				? 'Keypad'
				: store.editTool === 'fretboard'
					? 'Fretboard'
					: 'Piano'}
		</span>
		<button
			class="hide-btn"
			onclick={() => (store.keyInputOpen = false)}
			title="Close key input"
			aria-label="Close key input"
		>
			<X class="size-4" />
		</button>
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
				{#await import('./Fretboard.svelte') then { default: Fretboard }}
					<Fretboard />
				{/await}
			</div>
		{:else}
			<div class="tool-wrap">
				{#await import('./Piano.svelte') then { default: Piano }}
					<Piano />
				{/await}
			</div>
		{/if}
	</div>
</div>

<style>
	.key-input {
		background: var(--panel);
		border-top: 1px solid var(--border-strong);
	}
	.key-input-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px;
		border-bottom: 1px solid var(--border);
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
