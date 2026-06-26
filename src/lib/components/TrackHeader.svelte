<script lang="ts">
	import { store } from '$lib/stores/score.svelte';
	import { Popover, Select } from 'bits-ui';
	import { TUNINGS } from '$lib/oto/pitch';

	let { index }: { index: number } = $props();
	const track = $derived(store.score.tracks[index]);
	const isActive = $derived(store.cursor.track === index);

	const tuningNames = Object.keys(TUNINGS);
	function matchTuning(): string {
		for (const [name, t] of Object.entries(TUNINGS)) {
			if (t.length === track.tuning.length && t.every((n, i) => n === track.tuning[i])) return name;
		}
		return 'Custom';
	}

	const INSTRUMENTS = [
		{ value: 'electric', label: 'Electric Guitar' },
		{ value: 'acoustic', label: 'Acoustic Guitar' },
		{ value: 'clean', label: 'Clean / Nylon' },
		{ value: 'bass', label: 'Bass' }
	];

	function applyTuning(name: string) {
		if (name === 'Custom' || !TUNINGS[name]) return;
		store.updateTrack(index, { tuning: [...TUNINGS[name]] });
	}
</script>

<div class="header" class:active={isActive} style="--track-color:{track.color}">
	<button
		class="select-track"
		onclick={() => store.setCursor({ track: index, measure: 0, beat: 0 })}
		title="Select track"
	>
		<span class="swatch"></span>
		<span class="num">{index + 1}</span>
	</button>

	<input
		class="name"
		value={track.name}
		onchange={(e) => store.updateTrack(index, { name: e.currentTarget.value })}
	/>

	<div class="views">
		<button
			class="vtab"
			class:on={track.view.standard}
			onclick={() => store.toggleTrackView(index, 'standard')}
			title="Standard notation">𝄞</button
		>
		<button
			class="vtab"
			class:on={track.view.tab}
			onclick={() => store.toggleTrackView(index, 'tab')}
			title="Tablature">TAB</button
		>
		<button
			class="vtab"
			class:on={track.view.rhythm}
			onclick={() => store.toggleTrackView(index, 'rhythm')}
			title="Rhythm slashes">♪/</button
		>
	</div>

	<div class="ms">
		<button
			class="ms-btn"
			class:on={track.muted}
			onclick={() => store.toggleMute(index)}
			title="Mute">M</button
		>
		<button
			class="ms-btn solo"
			class:on={track.soloed}
			onclick={() => store.toggleSolo(index)}
			title="Solo">S</button
		>
	</div>

	<Popover.Root>
		<Popover.Trigger class="gear" title="Track settings">⚙</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content class="popover" sideOffset={6} align="end">
				<div class="pop">
					<h4>Track settings</h4>

					<label class="field">
						<span>Instrument</span>
						<Select.Root
							type="single"
							value={track.instrument}
							onValueChange={(v) => store.updateTrack(index, { instrument: v })}
						>
							<Select.Trigger class="sel-trigger">
								{INSTRUMENTS.find((i) => i.value === track.instrument)?.label ?? 'Instrument'}
							</Select.Trigger>
							<Select.Portal>
								<Select.Content class="sel-content" sideOffset={4}>
									{#each INSTRUMENTS as it (it.value)}
										<Select.Item class="sel-item" value={it.value} label={it.label}
											>{it.label}</Select.Item
										>
									{/each}
								</Select.Content>
							</Select.Portal>
						</Select.Root>
					</label>

					<label class="field">
						<span>Tuning</span>
						<Select.Root type="single" value={matchTuning()} onValueChange={applyTuning}>
							<Select.Trigger class="sel-trigger"
								>{matchTuning()} ({track.tuning
									.map((t) => t.replace(/\d/, ''))
									.join(' ')})</Select.Trigger
							>
							<Select.Portal>
								<Select.Content class="sel-content" sideOffset={4}>
									{#each tuningNames as name (name)}
										<Select.Item class="sel-item" value={name} label={name}>{name}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Portal>
						</Select.Root>
					</label>

					<div class="row3">
						<label class="field small">
							<span>Capo</span>
							<input
								type="number"
								min="0"
								max="12"
								value={track.capo}
								onchange={(e) => store.setCapo(index, +e.currentTarget.value)}
							/>
						</label>
						<label class="field small">
							<span>Transpose</span>
							<input
								type="number"
								min="-24"
								max="24"
								value={track.transpose}
								onchange={(e) => store.setDisplayTranspose(index, +e.currentTarget.value)}
							/>
						</label>
					</div>

					<div class="detune">
						<span>Detune frets (rewrites tuning)</span>
						<div class="detune-row">
							<button onclick={() => store.detune(index, -1)}>−½</button>
							<button onclick={() => store.detune(index, 1)}>+½</button>
							<button onclick={() => store.transpose(index, -12)}>Oct −</button>
							<button onclick={() => store.transpose(index, 12)}>Oct +</button>
						</div>
					</div>

					<button
						class="danger"
						onclick={() => store.removeTrack(index)}
						disabled={store.score.tracks.length <= 1}
					>
						Delete track
					</button>
				</div>
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
</div>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: var(--panel);
		border-radius: 8px 8px 0 0;
		border-left: 4px solid var(--track-color);
	}
	.header.active {
		background: #fff;
		box-shadow: inset 0 0 0 1px var(--accent-soft);
	}
	.select-track {
		display: flex;
		align-items: center;
		gap: 5px;
		border: none;
		background: transparent;
		cursor: pointer;
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--track-color);
	}
	.num {
		font-weight: 700;
		font-size: 12px;
		color: var(--muted);
	}
	.name {
		flex: 1;
		min-width: 60px;
		border: 1px solid transparent;
		background: transparent;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
		padding: 4px 6px;
		border-radius: 6px;
	}
	.name:hover,
	.name:focus {
		border-color: var(--border);
		background: #fff;
		outline: none;
	}
	.views,
	.ms {
		display: flex;
		gap: 3px;
	}
	.vtab,
	.ms-btn {
		min-width: 30px;
		height: 26px;
		border: 1px solid var(--border);
		background: #fff;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		color: var(--muted);
	}
	.vtab.on {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.ms-btn.on {
		background: #f59e0b;
		border-color: #f59e0b;
		color: #fff;
	}
	.ms-btn.solo.on {
		background: #22c55e;
		border-color: #22c55e;
	}
	:global(.gear) {
		width: 30px;
		height: 26px;
		border: 1px solid var(--border);
		background: #fff;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
	}
	:global(.popover) {
		z-index: 60;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
		padding: 12px;
		width: 260px;
	}
	.pop h4 {
		margin: 0 0 10px;
		font-size: 13px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin-bottom: 10px;
		font-size: 11px;
		color: var(--muted);
	}
	.row3 {
		display: flex;
		gap: 8px;
	}
	.field.small {
		flex: 1;
	}
	.field input {
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 5px 7px;
		font-size: 13px;
		color: var(--ink);
	}
	:global(.sel-trigger) {
		width: 100%;
		text-align: left;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 6px 8px;
		font-size: 12px;
		background: #fff;
		cursor: pointer;
		color: var(--ink);
	}
	:global(.sel-content) {
		z-index: 70;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
		padding: 4px;
		max-height: 240px;
		overflow-y: auto;
	}
	:global(.sel-item) {
		padding: 6px 8px;
		font-size: 12px;
		border-radius: 5px;
		cursor: pointer;
		color: var(--ink);
	}
	:global(.sel-item[data-highlighted]) {
		background: var(--accent-soft);
	}
	.detune {
		margin-bottom: 10px;
		font-size: 11px;
		color: var(--muted);
	}
	.detune-row {
		display: flex;
		gap: 4px;
		margin-top: 4px;
	}
	.detune-row button {
		flex: 1;
		border: 1px solid var(--border);
		background: #fff;
		border-radius: 6px;
		padding: 5px 0;
		font-size: 11px;
		cursor: pointer;
		color: var(--ink);
	}
	.danger {
		width: 100%;
		border: 1px solid #fecaca;
		background: #fef2f2;
		color: #dc2626;
		border-radius: 6px;
		padding: 7px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
