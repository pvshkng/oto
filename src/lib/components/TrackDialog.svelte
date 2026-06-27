<script lang="ts">
	// Configure a track before it is added, and the very same dialog is reused to
	// edit an existing track. Built on bits-ui AlertDialog so the choices are
	// confirmed deliberately (Add / Save) rather than applied on every keystroke.
	// Instrument selection uses the bits-ui Combobox for type-ahead filtering.

	import { store } from '$lib/stores/score.svelte';
	import { AlertDialog, Combobox, Select, ToggleGroup } from 'bits-ui';
	import { INSTRUMENTS, presetFor, type InstrumentPreset } from '$lib/oto/instruments';
	import { TUNINGS } from '$lib/oto/pitch';

	let {
		open = $bindable(false),
		mode = 'add',
		index = -1
	}: { open: boolean; mode?: 'add' | 'edit'; index?: number } = $props();

	const PALETTE = ['#18181b', '#52525b', '#71717a', '#a1a1aa', '#3f3f46', '#27272a', '#d4d4d8'];
	const TUNING_NAMES = Object.keys(TUNINGS);

	// Working draft, committed only on confirm.
	let name = $state('');
	let instrument = $state('electric');
	let tuningName = $state('Guitar Standard');
	let capo = $state(0);
	let transpose = $state(0);
	let color = $state(PALETTE[0]);
	let view = $state({ standard: true, tab: true, rhythm: false });
	let query = $state('');

	function tuningNameFor(tuning: string[]): string {
		for (const [n, t] of Object.entries(TUNINGS)) {
			if (t.length === tuning.length && t.every((x, i) => x === tuning[i])) return n;
		}
		return TUNING_NAMES[0];
	}

	// Seed the draft whenever the dialog opens.
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			query = '';
			if (mode === 'edit' && store.score.tracks[index]) {
				const t = store.score.tracks[index];
				name = t.name;
				instrument = presetFor(t.instrument, t.tuning).value;
				tuningName = tuningNameFor(t.tuning);
				capo = t.capo;
				transpose = t.transpose;
				color = PALETTE.includes(t.color) ? t.color : PALETTE[0];
				view = { ...t.view };
			} else {
				const n = store.score.tracks.length + 1;
				const p = INSTRUMENTS[0];
				name = `Track ${n}`;
				instrument = p.value;
				tuningName = tuningNameFor(p.tuning);
				capo = 0;
				transpose = 0;
				color = PALETTE[(n - 1) % PALETTE.length];
				view = { standard: true, tab: true, rhythm: false };
			}
		}
		wasOpen = open;
	});

	const selectedPreset = $derived(
		INSTRUMENTS.find((p) => p.value === instrument) ?? INSTRUMENTS[0]
	);
	const filtered = $derived(
		query.trim()
			? INSTRUMENTS.filter((p) => p.label.toLowerCase().includes(query.trim().toLowerCase()))
			: INSTRUMENTS
	);
	const groups = $derived([...new Set(filtered.map((p) => p.group))]);

	function pickInstrument(p: InstrumentPreset) {
		instrument = p.value;
		tuningName = tuningNameFor(p.tuning);
	}

	function ensureView(key: 'standard' | 'tab' | 'rhythm') {
		const next = { ...view, [key]: !view[key] };
		if (!next.standard && !next.tab && !next.rhythm) return; // keep at least one
		view = next;
	}

	function confirm() {
		const tuning = [...(TUNINGS[tuningName] ?? selectedPreset.tuning)];
		const patch = {
			name: name.trim() || 'Untitled',
			instrument: selectedPreset.engine,
			kind: selectedPreset.kind,
			tuning,
			capo,
			transpose,
			color,
			view: { ...view }
		};
		if (mode === 'edit' && store.score.tracks[index]) {
			store.updateTrack(index, patch);
		} else {
			store.addTrack(patch);
		}
		open = false;
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Portal>
		<AlertDialog.Overlay class="td-overlay" />
		<AlertDialog.Content class="td">
			<AlertDialog.Title class="td-title">
				{mode === 'edit' ? 'Edit track' : 'New track'}
			</AlertDialog.Title>
			<AlertDialog.Description class="td-desc">
				{mode === 'edit'
					? 'Adjust the instrument, tuning and notation for this track.'
					: 'Configure the instrument before adding it to your score.'}
			</AlertDialog.Description>

			<div class="td-body">
				<label class="fld">
					<span>Name</span>
					<input class="inp" bind:value={name} placeholder="Track name" />
				</label>

				<label class="fld">
					<span>Instrument</span>
					<Combobox.Root
						type="single"
						value={instrument}
						onValueChange={(v) => {
							const p = INSTRUMENTS.find((x) => x.value === v);
							if (p) pickInstrument(p);
						}}
					>
						<div class="cb-input-wrap">
							<Combobox.Input
								class="inp cb-input"
								placeholder="Search instruments..."
								defaultValue={selectedPreset.label}
								oninput={(e) => (query = e.currentTarget.value)}
							/>
							<Combobox.Trigger class="cb-trigger" aria-label="Open instruments">
								<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
									><path
										d="M7 10l5 5 5-5"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									/></svg
								>
							</Combobox.Trigger>
						</div>
						<Combobox.Portal>
							<Combobox.Content class="cb-content" sideOffset={6}>
								<Combobox.Viewport>
									{#each groups as g (g)}
										<Combobox.Group>
											<Combobox.GroupHeading class="cb-heading">{g}</Combobox.GroupHeading>
											{#each filtered.filter((p) => p.group === g) as p (p.value)}
												<Combobox.Item class="cb-item" value={p.value} label={p.label}>
													{#snippet children({ selected })}
														{p.label}
														{#if selected}<span class="cb-check">✓</span>{/if}
													{/snippet}
												</Combobox.Item>
											{/each}
										</Combobox.Group>
									{/each}
									{#if filtered.length === 0}
										<div class="cb-empty">No instruments found</div>
									{/if}
								</Combobox.Viewport>
							</Combobox.Content>
						</Combobox.Portal>
					</Combobox.Root>
				</label>

				<label class="fld">
					<span>Tuning</span>
					<Select.Root type="single" value={tuningName} onValueChange={(v) => (tuningName = v)}>
						<Select.Trigger class="inp sel">
							{tuningName} · {(TUNINGS[tuningName] ?? []).map((t) => t.replace(/\d/, '')).join(' ')}
						</Select.Trigger>
						<Select.Portal>
							<Select.Content class="cb-content" sideOffset={6}>
								<Select.Viewport>
									{#each TUNING_NAMES as n (n)}
										<Select.Item class="cb-item" value={n} label={n}>{n}</Select.Item>
									{/each}
								</Select.Viewport>
							</Select.Content>
						</Select.Portal>
					</Select.Root>
				</label>

				<div class="grid2">
					<label class="fld">
						<span>Capo</span>
						<input class="inp" type="number" min="0" max="12" bind:value={capo} />
					</label>
					<label class="fld">
						<span>Transpose</span>
						<input class="inp" type="number" min="-24" max="24" bind:value={transpose} />
					</label>
				</div>

				<div class="fld">
					<span>Notation</span>
					<ToggleGroup.Root
						type="multiple"
						value={Object.entries(view)
							.filter(([, v]) => v)
							.map(([k]) => k)}
						class="tg"
					>
						<ToggleGroup.Item
							class="tg-item"
							value="standard"
							onclick={() => ensureView('standard')}>Standard</ToggleGroup.Item
						>
						<ToggleGroup.Item class="tg-item" value="tab" onclick={() => ensureView('tab')}
							>Tab</ToggleGroup.Item
						>
						<ToggleGroup.Item class="tg-item" value="rhythm" onclick={() => ensureView('rhythm')}
							>Rhythm</ToggleGroup.Item
						>
					</ToggleGroup.Root>
				</div>

				<div class="fld">
					<span>Colour</span>
					<div class="swatches">
						{#each PALETTE as c (c)}
							<button
								type="button"
								class="swatch"
								class:on={color === c}
								style="background:{c}"
								aria-label="Colour {c}"
								onclick={() => (color = c)}
							></button>
						{/each}
					</div>
				</div>
			</div>

			<div class="td-actions">
				<AlertDialog.Cancel class="btn ghost">Cancel</AlertDialog.Cancel>
				<AlertDialog.Action class="btn primary" onclick={confirm}>
					{mode === 'edit' ? 'Save changes' : 'Add track'}
				</AlertDialog.Action>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>

<style>
	:global(.td-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(24, 24, 27, 0.4);
		backdrop-filter: blur(2px);
		z-index: 90;
	}
	:global(.td) {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(440px, calc(100vw - 28px));
		max-height: calc(100dvh - 40px);
		overflow-y: auto;
		background: var(--paper);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-lg);
		box-shadow: var(--shadow-2);
		padding: 20px;
		z-index: 91;
	}
	:global(.td-title) {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: var(--ink);
		letter-spacing: -0.01em;
	}
	:global(.td-desc) {
		margin: 4px 0 16px;
		font-size: 13px;
		color: var(--muted);
	}
	.td-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.fld {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	:global(.inp) {
		width: 100%;
		border: 1px solid var(--border-strong);
		border-radius: var(--r-xs);
		padding: 10px 11px;
		font-size: 14px;
		font-weight: 500;
		color: var(--ink);
		background: var(--paper);
		box-sizing: border-box;
	}
	:global(.inp:focus) {
		outline: none;
		border-color: var(--ink);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}
	:global(.sel) {
		text-align: left;
		cursor: pointer;
	}
	.cb-input-wrap {
		position: relative;
	}
	:global(.cb-input) {
		padding-right: 38px;
	}
	:global(.cb-trigger) {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: none;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	:global(.cb-content) {
		z-index: 95;
		background: var(--paper);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		box-shadow: var(--shadow-2);
		padding: 5px;
		max-height: 280px;
		overflow-y: auto;
		width: var(--bits-combobox-anchor-width, var(--bits-select-anchor-width, 260px));
		min-width: 220px;
	}
	:global(.cb-heading) {
		padding: 8px 8px 4px;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--faint);
	}
	:global(.cb-item) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 9px 9px;
		font-size: 14px;
		font-weight: 500;
		border-radius: var(--r-xs);
		cursor: pointer;
		color: var(--ink);
	}
	:global(.cb-item[data-highlighted]) {
		background: var(--panel);
		outline: none;
	}
	:global(.cb-item[data-selected]) {
		background: var(--panel-2);
	}
	.cb-check {
		color: var(--ink);
	}
	.cb-empty {
		padding: 12px;
		text-align: center;
		font-size: 13px;
		color: var(--muted);
	}
	:global(.tg) {
		display: inline-flex;
		gap: 4px;
		background: var(--panel);
		border-radius: var(--r-sm);
		padding: 4px;
	}
	:global(.tg-item) {
		flex: 1;
		border: none;
		background: transparent;
		padding: 8px 12px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
		border-radius: var(--r-xs);
		cursor: pointer;
	}
	:global(.tg-item[data-state='on']) {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.swatches {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.swatch {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid var(--border);
		cursor: pointer;
		padding: 0;
	}
	.swatch.on {
		box-shadow:
			0 0 0 2px var(--paper),
			0 0 0 4px var(--ink);
		border-color: var(--paper);
	}
	.td-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 20px;
	}
	:global(.btn) {
		border-radius: var(--r-xs);
		padding: 10px 16px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid var(--border-strong);
	}
	:global(.btn.ghost) {
		background: var(--paper);
		color: var(--ink);
	}
	:global(.btn.ghost:hover) {
		background: var(--panel);
	}
	:global(.btn.primary) {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	:global(.btn.primary:hover) {
		background: var(--ink-soft);
	}
</style>
