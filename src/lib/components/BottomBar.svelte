<script lang="ts">
	// The single, always-visible control bar pinned to the bottom of the screen.
	// Everything lives here so the score has the whole viewport: file actions,
	// transport, metronome, loop, tempo, song settings and the edit toggle.

	import { store } from '$lib/stores/score.svelte';
	import { togglePlayback, stopPlayback } from '$lib/audio/playback';
	import { downloadOto, openFile, exportPdf } from '$lib/io/files';
	import { DropdownMenu, Popover } from 'bits-ui';

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
	function confirmNew() {
		if (confirm('Start a new score? Your current one stays in the last save.')) store.newScore();
	}
</script>

<div class="bar">
	<!-- File -->
	<DropdownMenu.Root>
		<DropdownMenu.Trigger class="btn file">{importing ? '…' : 'File'} ▾</DropdownMenu.Trigger>
		<DropdownMenu.Portal>
			<DropdownMenu.Content class="menu" sideOffset={8} align="start">
				<DropdownMenu.Item class="menu-item" onSelect={confirmNew}>New</DropdownMenu.Item>
				<DropdownMenu.Item class="menu-item" onSelect={open}>Open / Import…</DropdownMenu.Item>
				<DropdownMenu.Separator class="menu-sep" />
				<DropdownMenu.Item class="menu-item" onSelect={downloadOto}>Save .oto</DropdownMenu.Item>
				<DropdownMenu.Item class="menu-item" onSelect={exportPdf}>Export PDF</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	</DropdownMenu.Root>

	<span class="div"></span>

	<!-- Transport -->
	<button
		class="play"
		class:playing={store.isPlaying}
		onclick={togglePlayback}
		title="Play / Stop (Space)"
	>
		{#if store.isPlaying}
			<svg viewBox="0 0 24 24" width="18" height="18"
				><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg
			>
		{:else}
			<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 4l13 8-13 8z" /></svg>
		{/if}
	</button>
	<button class="btn icon" onclick={stopPlayback} title="Stop">
		<svg viewBox="0 0 24 24" width="15" height="15"
			><rect x="5" y="5" width="14" height="14" rx="2" /></svg
		>
	</button>
	<button
		class="btn icon"
		class:on={store.metronomeOn}
		onclick={() => (store.metronomeOn = !store.metronomeOn)}
		title="Metronome"
	>
		<svg
			viewBox="0 0 24 24"
			width="15"
			height="15"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"><path d="M8 3h8l3 18H5L8 3z" /><line x1="12" y1="20" x2="15" y2="6" /></svg
		>
	</button>
	<button
		class="btn icon"
		class:on={store.loopEnabled}
		class:armed={store.selection}
		onclick={() => (store.loopEnabled = !store.loopEnabled)}
		title="Loop selection"
	>
		<svg
			viewBox="0 0 24 24"
			width="15"
			height="15"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 22l-4-4 4-4" /><path
				d="M21 13v2a4 4 0 01-4 4H3"
			/></svg
		>
	</button>

	<!-- Tempo -->
	<Popover.Root>
		<Popover.Trigger class="btn tempo">{store.score.tempo}<small>bpm</small></Popover.Trigger>
		<Popover.Portal>
			<Popover.Content class="tempo-pop" sideOffset={8} align="center">
				<div class="tempo-row">
					<span>{store.score.tempo} BPM</span>
					<input
						type="range"
						min="40"
						max="240"
						value={store.score.tempo}
						oninput={(e) => store.setTempo(+e.currentTarget.value)}
					/>
				</div>
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>

	<span class="spacer"></span>

	<button class="btn icon" onclick={() => (store.songModalOpen = true)} title="Song settings"
		>⚙</button
	>
	<button
		class="btn edit"
		class:on={store.editMode}
		onclick={() => (store.editMode = !store.editMode)}
		title="Edit"
	>
		{store.editMode ? 'Done' : 'Edit'}
	</button>
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 10px calc(7px + env(safe-area-inset-bottom));
		background: var(--panel);
		border-top: 1px solid var(--border-strong);
	}
	.btn,
	:global(.file) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		border: 1px solid var(--border-strong);
		background: var(--paper);
		color: var(--ink);
		border-radius: var(--r-xs);
		cursor: pointer;
		fill: currentColor;
		font-size: 13px;
		font-weight: 600;
		height: 38px;
		padding: 0 11px;
	}
	.icon {
		width: 38px;
		padding: 0;
	}
	.icon.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.icon.armed:not(.on) {
		border-color: var(--ink);
	}
	.play {
		width: 44px;
		height: 38px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--accent-ink);
		fill: var(--accent-ink);
		border-radius: var(--r-xs);
		cursor: pointer;
	}
	.play.playing {
		background: var(--sage);
		border-color: var(--sage);
	}
	:global(.tempo) {
		gap: 3px;
		font-variant-numeric: tabular-nums;
	}
	:global(.tempo small) {
		font-size: 9px;
		color: var(--muted);
		font-weight: 600;
	}
	.div {
		width: 1px;
		height: 22px;
		background: var(--border-strong);
	}
	.spacer {
		flex: 1;
	}
	.edit.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	:global(.menu) {
		z-index: 70;
		background: var(--paper);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		box-shadow: var(--shadow-2);
		padding: 4px;
		min-width: 180px;
	}
	:global(.menu-item) {
		padding: 9px 10px;
		font-size: 13px;
		border-radius: var(--r-xs);
		cursor: pointer;
		color: var(--ink);
	}
	:global(.menu-item[data-highlighted]) {
		background: var(--panel-2);
		outline: none;
	}
	:global(.menu-sep) {
		height: 1px;
		background: var(--border);
		margin: 4px 2px;
	}
	:global(.tempo-pop) {
		z-index: 70;
		background: var(--paper);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		box-shadow: var(--shadow-2);
		padding: 12px 14px;
	}
	.tempo-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 12px;
		color: var(--muted);
		width: 200px;
	}
	.tempo-row input {
		accent-color: var(--accent);
		width: 100%;
	}
	@media (max-width: 720px) {
		.btn,
		.icon,
		.play,
		:global(.file) {
			height: 44px;
		}
		.icon {
			width: 44px;
		}
		.play {
			width: 50px;
		}
	}
</style>
