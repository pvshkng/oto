<script lang="ts">
	import { store } from '$lib/stores/score.svelte';
	import { downloadOto, openFile, exportPdf } from '$lib/io/files';
	import { Select } from 'bits-ui';

	const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'];
	const currentTs = $derived(`${store.score.timeSignature[0]}/${store.score.timeSignature[1]}`);
	function setTs(v: string) {
		const [n, d] = v.split('/').map(Number);
		store.setTimeSignature(n, d);
	}

	let importing = $state(false);
	async function open() {
		importing = true;
		try {
			await openFile();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Could not read that file.');
		} finally {
			importing = false;
		}
	}
</script>

<header class="toolbar">
	<div class="brand">
		<span class="logo">oto</span>
	</div>

	<div class="titles">
		<input
			class="title"
			value={store.score.title}
			onchange={(e) => store.setTitle(e.currentTarget.value)}
		/>
		<input
			class="artist"
			value={store.score.artist}
			onchange={(e) => store.setArtist(e.currentTarget.value)}
		/>
	</div>

	<div class="spacer"></div>

	<label class="ts">
		<span>Time</span>
		<Select.Root type="single" value={currentTs} onValueChange={setTs}>
			<Select.Trigger class="sel-trigger ts-trigger">{currentTs}</Select.Trigger>
			<Select.Portal>
				<Select.Content class="sel-content" sideOffset={4}>
					{#each TIME_SIGS as t (t)}
						<Select.Item class="sel-item" value={t} label={t}>{t}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Portal>
		</Select.Root>
	</label>

	<div class="actions">
		<button onclick={() => store.undo()} title="Undo (Ctrl+Z)">↶</button>
		<button onclick={() => store.redo()} title="Redo (Ctrl+Y)">↷</button>
		<span class="vsep"></span>
		<button
			onclick={() =>
				confirm('Start a new score? Unsaved changes are kept in your last save.') &&
				store.newScore()}
			title="New">New</button
		>
		<button
			onclick={open}
			disabled={importing}
			title="Open .oto or import Guitar Pro (gp3/4/5/gpx/gp)">{importing ? '…' : 'Open'}</button
		>
		<button class="primary" onclick={downloadOto} title="Save .oto">Save</button>
		<button onclick={exportPdf} title="Export PDF">PDF</button>
	</div>
</header>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		background: var(--panel);
		color: var(--ink);
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.logo {
		font-family: var(--serif);
		font-weight: 700;
		font-size: 22px;
		letter-spacing: 0.5px;
		color: var(--ink);
		padding: 0 4px 0 0;
	}
	.titles {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-width: 0;
	}
	.title,
	.artist {
		background: transparent;
		border: 1px solid transparent;
		color: var(--ink);
		border-radius: 6px;
		padding: 2px 6px;
	}
	.title {
		font-family: var(--serif);
		font-size: 16px;
		font-weight: 600;
	}
	.artist {
		font-size: 11px;
		color: var(--muted);
	}
	.title:hover,
	.artist:hover,
	.title:focus,
	.artist:focus {
		border-color: var(--border-strong);
		background: var(--paper);
		outline: none;
	}
	.spacer {
		flex: 1;
	}
	.ts {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--muted);
	}
	:global(.ts-trigger) {
		background: var(--paper) !important;
		color: var(--ink) !important;
		border-color: var(--border-strong) !important;
		width: auto !important;
		font-weight: 600;
	}
	.actions {
		display: flex;
		gap: 5px;
		align-items: center;
	}
	.actions button {
		border: 1px solid var(--border-strong);
		background: var(--paper);
		color: var(--ink);
		border-radius: 8px;
		padding: 8px 12px;
		font-size: 13px;
		cursor: pointer;
		min-height: 38px;
	}
	.actions button:hover {
		background: var(--panel-2);
	}
	.actions .primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.actions .primary:hover {
		background: #3a2c20;
	}
	.vsep {
		width: 1px;
		height: 22px;
		background: var(--border-strong);
		margin: 0 3px;
	}
	@media (max-width: 720px) {
		.toolbar {
			gap: 8px;
			padding: 8px 12px;
		}
		.actions button {
			padding: 9px 12px;
			min-height: 44px;
		}
		.title {
			font-size: 15px;
		}
	}
</style>
