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
		padding: 8px 14px;
		background: #0f172a;
		color: #e2e8f0;
		flex-wrap: wrap;
	}
	.logo {
		font-weight: 800;
		font-size: 20px;
		letter-spacing: -1px;
		color: #fff;
		background: linear-gradient(135deg, #2563eb, #06b6d4);
		padding: 2px 10px;
		border-radius: 7px;
	}
	.titles {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.title,
	.artist {
		background: transparent;
		border: 1px solid transparent;
		color: #fff;
		border-radius: 5px;
		padding: 2px 6px;
	}
	.title {
		font-size: 15px;
		font-weight: 700;
	}
	.artist {
		font-size: 11px;
		color: #94a3b8;
	}
	.title:hover,
	.artist:hover,
	.title:focus,
	.artist:focus {
		border-color: #334155;
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
		color: #94a3b8;
	}
	:global(.ts-trigger) {
		background: #1e293b !important;
		color: #fff !important;
		border-color: #334155 !important;
		width: auto !important;
		font-weight: 600;
	}
	.actions {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.actions button {
		border: 1px solid #334155;
		background: #1e293b;
		color: #e2e8f0;
		border-radius: 7px;
		padding: 7px 11px;
		font-size: 13px;
		cursor: pointer;
	}
	.actions button:hover {
		background: #334155;
	}
	.actions .primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.vsep {
		width: 1px;
		height: 20px;
		background: #334155;
		margin: 0 2px;
	}
</style>
