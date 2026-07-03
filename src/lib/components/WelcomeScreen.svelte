<script lang="ts">
	// Empty state / welcome screen, shown when no score is open (a first-ever
	// visit, or after Close). Deliberately minimal and monochromatic — the same
	// ink-on-paper palette as the loading overlay — offering just the two ways in:
	// start a New score, or Open / Import an existing file.

	import { store } from '$lib/stores/score.svelte';
	import FilePlus from 'phosphor-svelte/lib/FilePlus';
	import FolderOpen from 'phosphor-svelte/lib/FolderOpen';

	function newScore() {
		store.newScore();
	}
	function openFile() {
		void import('$lib/io/files').then((m) => m.openFile());
	}
</script>

<div class="welcome">
	<div class="panel">
		<div class="mark">音</div>
		<div class="wordmark">oto</div>
		<div class="tagline">tablature studio</div>

		<div class="actions">
			<button type="button" class="action primary" onclick={newScore}>
				<FilePlus class="size-4" weight="bold" />
				New score
			</button>
			<button type="button" class="action" onclick={openFile}>
				<FolderOpen class="size-4" weight="bold" />
				Open / Import
			</button>
		</div>
	</div>
</div>

<style>
	.welcome {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
		padding: 24px;
	}
	.panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		width: 100%;
		max-width: 320px;
		text-align: center;
	}
	.mark {
		font-family: var(--serif);
		font-size: 56px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: 0.04em;
		color: var(--ink);
	}
	.wordmark {
		margin-top: 10px;
		font-family: var(--serif);
		font-size: 22px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--ink);
	}
	.tagline {
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.actions {
		margin-top: 28px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 100%;
	}
	.action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		height: 42px;
		padding: 0 16px;
		border: 1px solid var(--border-strong);
		border-radius: var(--r-md, 8px);
		background: linear-gradient(to bottom, #ffffff, #f5f5f4);
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
		cursor: pointer;
	}
	.action.primary {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--bg);
	}
	.action.primary:hover {
		filter: brightness(1.1);
	}
	.action:not(.primary):hover {
		background: var(--panel-2);
	}
</style>
