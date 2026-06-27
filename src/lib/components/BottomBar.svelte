<script lang="ts">
	// The single, always-visible control bar pinned to the bottom of the screen.
	// File / Edit / Insert live in a bits-ui Menubar; transport is a pair of large
	// icon buttons; metronome and loop are a bits-ui ToggleGroup; tempo is a popover.

	import { store } from '$lib/stores/score.svelte';
	import { togglePlayback, stopPlayback } from '$lib/audio/playback';
	import { downloadOto, openFile, exportPdf } from '$lib/io/files';
	import { Menubar, Popover, ToggleGroup } from 'bits-ui';
	import TrackDialog from './TrackDialog.svelte';

	let importing = $state(false);
	let addTrackOpen = $state(false);

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

	const transport = $derived([
		...(store.metronomeOn ? ['metronome'] : []),
		...(store.loopEnabled ? ['loop'] : [])
	]);
</script>

<div class="bar">
	<Menubar.Root class="menubar">
		<Menubar.Menu>
			<Menubar.Trigger class="mb-trigger">{importing ? 'Opening…' : 'File'}</Menubar.Trigger>
			<Menubar.Portal>
				<Menubar.Content class="mb-content" side="top" align="start" sideOffset={8}>
					<Menubar.Item class="mb-item" onSelect={confirmNew}>New</Menubar.Item>
					<Menubar.Item class="mb-item" onSelect={open}>Open / Import…</Menubar.Item>
					<Menubar.Separator class="mb-sep" />
					<Menubar.Item class="mb-item" onSelect={downloadOto}>Save .oto</Menubar.Item>
					<Menubar.Item class="mb-item" onSelect={exportPdf}>Export PDF</Menubar.Item>
				</Menubar.Content>
			</Menubar.Portal>
		</Menubar.Menu>

		<Menubar.Menu>
			<Menubar.Trigger class="mb-trigger">Edit</Menubar.Trigger>
			<Menubar.Portal>
				<Menubar.Content class="mb-content" side="top" align="start" sideOffset={8}>
					<Menubar.Item class="mb-item" onSelect={() => store.undo()}>Undo</Menubar.Item>
					<Menubar.Item class="mb-item" onSelect={() => store.redo()}>Redo</Menubar.Item>
					<Menubar.Separator class="mb-sep" />
					<Menubar.Item class="mb-item" onSelect={() => (store.editMode = !store.editMode)}>
						{store.editMode ? 'Hide note editor' : 'Show note editor'}
					</Menubar.Item>
				</Menubar.Content>
			</Menubar.Portal>
		</Menubar.Menu>

		<Menubar.Menu>
			<Menubar.Trigger class="mb-trigger">Insert</Menubar.Trigger>
			<Menubar.Portal>
				<Menubar.Content class="mb-content" side="top" align="start" sideOffset={8}>
					<Menubar.Item class="mb-item" onSelect={() => store.addMeasureToAll()}
						>Add bar</Menubar.Item
					>
					<Menubar.Item
						class="mb-item"
						onSelect={() => store.insertMeasureAt(store.cursor.measure)}
					>
						Insert bar at cursor
					</Menubar.Item>
					<Menubar.Item
						class="mb-item"
						onSelect={() => store.duplicateMeasureAt(store.cursor.measure)}
					>
						Duplicate current bar
					</Menubar.Item>
					<Menubar.Separator class="mb-sep" />
					<Menubar.Item class="mb-item" onSelect={() => (addTrackOpen = true)}
						>Add track…</Menubar.Item
					>
				</Menubar.Content>
			</Menubar.Portal>
		</Menubar.Menu>
	</Menubar.Root>

	<span class="div"></span>

	<!-- Transport -->
	<button
		class="play"
		class:playing={store.isPlaying}
		onclick={togglePlayback}
		title="Play / Stop (Space)"
		aria-label="Play or stop"
	>
		{#if store.isPlaying}
			<svg viewBox="0 0 24 24" width="22" height="22"
				><rect x="6" y="5" width="4" height="14" rx="1" /><rect
					x="14"
					y="5"
					width="4"
					height="14"
					rx="1"
				/></svg
			>
		{:else}
			<svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 4l13 8-13 8z" /></svg>
		{/if}
	</button>
	<button class="icon-btn" onclick={stopPlayback} title="Stop" aria-label="Stop">
		<svg viewBox="0 0 24 24" width="20" height="20"
			><rect x="5" y="5" width="14" height="14" rx="2" /></svg
		>
	</button>

	<ToggleGroup.Root type="multiple" value={transport} class="transport-tg">
		<ToggleGroup.Item
			class="tg-icon"
			value="metronome"
			title="Metronome"
			onclick={() => (store.metronomeOn = !store.metronomeOn)}
		>
			<svg
				viewBox="0 0 24 24"
				width="20"
				height="20"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				><path d="M8 3h8l3 18H5L8 3z" /><line x1="12" y1="20" x2="15" y2="6" /></svg
			>
		</ToggleGroup.Item>
		<ToggleGroup.Item
			class={store.selection ? 'tg-icon armed' : 'tg-icon'}
			value="loop"
			title="Loop selection"
			onclick={() => (store.loopEnabled = !store.loopEnabled)}
		>
			<svg
				viewBox="0 0 24 24"
				width="20"
				height="20"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path
					d="M7 22l-4-4 4-4"
				/><path d="M21 13v2a4 4 0 01-4 4H3" /></svg
			>
		</ToggleGroup.Item>
	</ToggleGroup.Root>

	<!-- Tempo -->
	<Popover.Root>
		<Popover.Trigger class="tempo">{store.score.tempo}<small>bpm</small></Popover.Trigger>
		<Popover.Portal>
			<Popover.Content class="tempo-pop" side="top" sideOffset={8} align="center">
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

	<button
		class="icon-btn"
		onclick={() => (store.songModalOpen = true)}
		title="Song settings"
		aria-label="Song settings"
	>
		<svg
			viewBox="0 0 24 24"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			stroke-width="1.9"
			><circle cx="12" cy="12" r="3" /><path
				d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 01-4 0v-.1A1.6 1.6 0 005 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7H1a2 2 0 010-4h.1A1.6 1.6 0 004.6 5l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-1.1V1a2 2 0 014 0v.1A1.6 1.6 0 0019 4.6l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H23a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z"
			/></svg
		>
	</button>
	<button
		class="edit-btn"
		class:on={store.editMode}
		onclick={() => (store.editMode = !store.editMode)}
		title="Note editor"
	>
		{store.editMode ? 'Done' : 'Edit'}
	</button>
</div>

<TrackDialog bind:open={addTrackOpen} mode="add" />

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
		background: var(--panel);
		border-top: 1px solid var(--border-strong);
	}
	:global(.menubar) {
		display: inline-flex;
		gap: 2px;
	}
	:global(.mb-trigger) {
		display: inline-flex;
		align-items: center;
		border: 1px solid transparent;
		background: transparent;
		color: var(--ink);
		border-radius: var(--r-xs);
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		height: 40px;
		padding: 0 12px;
	}
	:global(.mb-trigger:hover),
	:global(.mb-trigger[data-state='open']) {
		background: var(--panel-2);
	}
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 42px;
		height: 40px;
		border: 1px solid var(--border-strong);
		background: var(--paper);
		color: var(--ink);
		fill: currentColor;
		border-radius: var(--r-xs);
		cursor: pointer;
		padding: 0;
	}
	.icon-btn:hover {
		background: var(--panel-2);
	}
	:global(.transport-tg) {
		display: inline-flex;
		gap: 4px;
	}
	:global(.tg-icon) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 42px;
		height: 40px;
		border: 1px solid var(--border-strong);
		background: var(--paper);
		color: var(--ink);
		border-radius: var(--r-xs);
		cursor: pointer;
		padding: 0;
	}
	:global(.tg-icon:hover) {
		background: var(--panel-2);
	}
	:global(.tg-icon.armed:not([data-state='on'])) {
		border-color: var(--ink);
	}
	:global(.tg-icon[data-state='on']) {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.play {
		width: 50px;
		height: 40px;
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
		background: var(--ink-soft);
		border-color: var(--ink-soft);
	}
	:global(.tempo) {
		display: inline-flex;
		align-items: baseline;
		gap: 3px;
		border: 1px solid var(--border-strong);
		background: var(--paper);
		color: var(--ink);
		border-radius: var(--r-xs);
		cursor: pointer;
		font-size: 15px;
		font-weight: 700;
		height: 40px;
		padding: 0 12px;
		font-variant-numeric: tabular-nums;
	}
	:global(.tempo small) {
		font-size: 10px;
		color: var(--muted);
		font-weight: 600;
	}
	.div {
		width: 1px;
		height: 24px;
		background: var(--border-strong);
		margin: 0 2px;
	}
	.spacer {
		flex: 1;
	}
	.edit-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border-strong);
		background: var(--paper);
		color: var(--ink);
		border-radius: var(--r-xs);
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		height: 40px;
		padding: 0 16px;
	}
	.edit-btn.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	:global(.mb-content) {
		z-index: 70;
		background: var(--paper);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		box-shadow: var(--shadow-2);
		padding: 5px;
		min-width: 200px;
	}
	:global(.mb-item) {
		padding: 10px 11px;
		font-size: 14px;
		font-weight: 500;
		border-radius: var(--r-xs);
		cursor: pointer;
		color: var(--ink);
	}
	:global(.mb-item[data-highlighted]) {
		background: var(--panel-2);
		outline: none;
	}
	:global(.mb-sep) {
		height: 1px;
		background: var(--border);
		margin: 5px 3px;
	}
	:global(.tempo-pop) {
		z-index: 70;
		background: var(--paper);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		box-shadow: var(--shadow-2);
		padding: 14px 16px;
	}
	.tempo-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
		width: 210px;
	}
	.tempo-row input {
		accent-color: var(--accent);
		width: 100%;
	}
	@media (max-width: 720px) {
		.icon-btn,
		:global(.tg-icon),
		.play,
		.edit-btn,
		:global(.tempo),
		:global(.mb-trigger) {
			height: 46px;
		}
		.icon-btn,
		:global(.tg-icon) {
			width: 46px;
		}
		.play {
			width: 54px;
		}
		:global(.mb-trigger) {
			padding: 0 10px;
		}
	}
</style>
