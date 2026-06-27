<script lang="ts">
	// Song configuration: title, composer, tempo and the starting time signature.
	// Title/composer live only here (not duplicated in the header) — you open this
	// by tapping the score title or the gear in the bottom bar.

	import { store } from '$lib/stores/score.svelte';
	import { Dialog, Select } from 'bits-ui';

	const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'];
	const currentTs = $derived(`${store.score.timeSignature[0]}/${store.score.timeSignature[1]}`);
	function setTs(v: string) {
		const [n, d] = v.split('/').map(Number);
		store.setTimeSignature(n, d);
	}
</script>

<Dialog.Root bind:open={store.songModalOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="dlg-overlay" />
		<Dialog.Content class="dlg" interactOutsideBehavior="close">
			<div class="head">
				<Dialog.Title class="dlg-title">Song details</Dialog.Title>
				<Dialog.Close class="dlg-x" aria-label="Close">✕</Dialog.Close>
			</div>

			<label class="field">
				<span>Title</span>
				<input
					value={store.score.title}
					oninput={(e) => store.setTitle(e.currentTarget.value)}
					placeholder="Untitled Score"
				/>
			</label>

			<label class="field">
				<span>Composer / artist</span>
				<input
					value={store.score.artist}
					oninput={(e) => store.setArtist(e.currentTarget.value)}
					placeholder="Unknown"
				/>
			</label>

			<div class="row">
				<label class="field">
					<span>Tempo</span>
					<div class="tempo">
						<input
							type="number"
							min="20"
							max="400"
							value={store.score.tempo}
							oninput={(e) => store.setTempo(+e.currentTarget.value)}
						/>
						<span class="unit">BPM</span>
					</div>
				</label>

				<label class="field">
					<span>Time signature</span>
					<Select.Root type="single" value={currentTs} onValueChange={setTs}>
						<Select.Trigger class="sel-trigger">{currentTs}</Select.Trigger>
						<Select.Portal>
							<Select.Content class="sel-content" sideOffset={4}>
								{#each TIME_SIGS as t (t)}
									<Select.Item class="sel-item" value={t} label={t}>{t}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Portal>
					</Select.Root>
				</label>
			</div>

			<p class="hint">Tip: change the time signature of a single bar from the Edit panel.</p>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.dlg-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(24, 24, 27, 0.4);
		backdrop-filter: blur(2px);
		z-index: 80;
	}
	:global(.dlg) {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(420px, calc(100vw - 32px));
		background: var(--paper);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-lg);
		box-shadow: var(--shadow-2);
		padding: 18px;
		z-index: 81;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 14px;
	}
	:global(.dlg-title) {
		font-family: var(--serif);
		font-size: 19px;
		font-weight: 600;
		margin: 0;
	}
	:global(.dlg-x) {
		border: 1px solid var(--border-strong);
		background: var(--bg);
		border-radius: var(--r-xs);
		width: 30px;
		height: 30px;
		cursor: pointer;
		color: var(--muted);
		font-size: 13px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin-bottom: 14px;
		font-size: 12px;
		color: var(--muted);
		flex: 1;
	}
	.field input {
		border: 1px solid var(--border-strong);
		border-radius: var(--r-xs);
		padding: 9px 10px;
		font-size: 14px;
		color: var(--ink);
		background: var(--bg);
	}
	.field input:focus {
		outline: none;
		border-color: var(--ink);
		background: var(--paper);
	}
	.row {
		display: flex;
		gap: 12px;
	}
	.tempo {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.tempo input {
		width: 88px;
	}
	.unit {
		font-size: 12px;
		color: var(--muted);
	}
	.hint {
		margin: 4px 0 0;
		font-size: 11px;
		color: var(--muted);
	}
	:global(.dlg .sel-trigger) {
		width: 100%;
		text-align: left;
		border: 1px solid var(--border-strong);
		border-radius: var(--r-xs);
		padding: 9px 10px;
		font-size: 14px;
		background: var(--bg);
		cursor: pointer;
		color: var(--ink);
	}
</style>
