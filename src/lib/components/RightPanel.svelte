<script lang="ts">
	// Desktop right panel. Surfaces Tempo, Song Details, and Add/Remove content
	// inline (no drawer wrapper) based on which store flag is set. Clicking a
	// button in BottomBar sets the flag; the X button here clears it.

	import { store } from '$lib/stores/score.svelte';
	import { audio, type MetronomeSound } from '$lib/audio/engine';
	import * as Popover from '$lib/components/ui/popover';
	import { buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import TrackControlDrawer from './TrackControlDrawer.svelte';
	import TrackControlForm from './TrackControlForm.svelte';
	import X from 'phosphor-svelte/lib/X';
	import Plus from 'phosphor-svelte/lib/Plus';
	import Minus from 'phosphor-svelte/lib/Minus';
	import SpeakerSimpleHigh from 'phosphor-svelte/lib/SpeakerSimpleHigh';
	import Rows from 'phosphor-svelte/lib/Rows';
	import Copy from 'phosphor-svelte/lib/Copy';
	import Trash from 'phosphor-svelte/lib/Trash';
	import MusicNotesPlus from 'phosphor-svelte/lib/MusicNotesPlus';

	const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'];
	const KEY_SIGS: { fifths: number; major: string; minor: string }[] = [
		{ fifths: -7, major: 'Cb', minor: 'Ab' },
		{ fifths: -6, major: 'Gb', minor: 'Eb' },
		{ fifths: -5, major: 'Db', minor: 'Bb' },
		{ fifths: -4, major: 'Ab', minor: 'F' },
		{ fifths: -3, major: 'Eb', minor: 'C' },
		{ fifths: -2, major: 'Bb', minor: 'G' },
		{ fifths: -1, major: 'F', minor: 'D' },
		{ fifths: 0, major: 'C', minor: 'A' },
		{ fifths: 1, major: 'G', minor: 'E' },
		{ fifths: 2, major: 'D', minor: 'B' },
		{ fifths: 3, major: 'A', minor: 'F#' },
		{ fifths: 4, major: 'E', minor: 'C#' },
		{ fifths: 5, major: 'B', minor: 'G#' },
		{ fifths: 6, major: 'F#', minor: 'D#' },
		{ fifths: 7, major: 'C#', minor: 'A#' }
	];
	const METRONOME_SOUNDS: { id: MetronomeSound; label: string }[] = [
		{ id: 'click', label: 'Click' },
		{ id: 'beep', label: 'Beep' },
		{ id: 'wood', label: 'Wood' },
		{ id: 'bell', label: 'Bell' }
	];

	const currentTs = $derived(`${store.score.timeSignature[0]}/${store.score.timeSignature[1]}`);
	const currentKey = $derived(
		KEY_SIGS.find((k) => k.fifths === store.score.keySignature) ?? KEY_SIGS[7]
	);

	const mode = $derived(
		store.trackControlOpen
			? 'track-control'
			: store.tempoOpen
				? 'tempo'
				: store.songModalOpen
					? 'song'
					: store.addRemoveOpen
						? 'add-remove'
						: null
	);
	const title = $derived(
		mode === 'track-control'
			? 'Track control'
			: mode === 'tempo'
				? 'Tempo'
				: mode === 'song'
					? 'Song details'
					: 'Add or remove'
	);

	let tsOpen = $state(false);
	let keyOpen = $state(false);
	const MIN_TEMPO = 20;
	const MAX_TEMPO = 400;

	function closePanel() {
		store.tempoOpen = false;
		store.songModalOpen = false;
		store.addRemoveOpen = false;
		store.trackControlOpen = false;
	}

	function setTs(v: string) {
		const [n, d] = v.split('/').map(Number);
		store.setTimeSignature(n, d);
	}

	function stepTempo(delta: number) {
		store.setTempo(store.score.tempo + delta);
	}

	function pickMetronomeSound(id: MetronomeSound) {
		store.metronomeSound = id;
		audio.setMetronomeSound(id);
		audio.previewMetronome();
	}

	function setMetronomeVolume(v: number) {
		store.metronomeVolume = v;
		audio.setMetronomeVolume(v);
	}

	// Add / remove helpers
	let trackEditOpen = $state(false);
	let trackEditIndex = $state(-1);
	const onlyOneBar = $derived(store.track.measures.length <= 1);
	const onlyOneTrack = $derived(store.score.tracks.length <= 1);

	function addTrack() {
		store.addTrack();
		trackEditIndex = store.cursor.track;
		trackEditOpen = true;
	}
	function editCurrentTrack() {
		trackEditIndex = store.cursor.track;
		trackEditOpen = true;
	}
</script>

{#if mode}
	<aside class="right-panel">
		<div class="rp-header">
			<span class="rp-title">{title}</span>
			<button class="close-btn" title="Close" aria-label="Close panel" onclick={closePanel}>
				<X class="size-4" />
			</button>
		</div>

		<div class="rp-body">
			{#if mode === 'track-control'}
				<TrackControlForm index={store.trackControlIndex} onClose={closePanel} />
			{:else if mode === 'tempo'}
				<!-- Tempo content -->
				<div class="rp-section center-col">
					<div class="tempo-display">
						<button
							class="step-btn"
							aria-label="Decrease tempo"
							disabled={store.score.tempo <= MIN_TEMPO}
							onclick={() => stepTempo(-1)}
						>
							<Minus class="size-4" />
						</button>
						<div class="tempo-num">
							<span class="bpm-val">{store.score.tempo}</span>
							<span class="bpm-lbl">BPM</span>
						</div>
						<button
							class="step-btn"
							aria-label="Increase tempo"
							disabled={store.score.tempo >= MAX_TEMPO}
							onclick={() => stepTempo(1)}
						>
							<Plus class="size-4" />
						</button>
					</div>
					<input
						type="range"
						min={MIN_TEMPO}
						max={MAX_TEMPO}
						class="accent-primary w-full"
						value={store.score.tempo}
						onpointerdown={() => store.beginGesture()}
						onpointerup={() => store.endGesture()}
						onpointercancel={() => store.endGesture()}
						oninput={(e) => store.setTempoLive(+e.currentTarget.value)}
						aria-label="Tempo slider"
					/>
				</div>
				<div class="rp-section">
					<span class="field-label">Metronome sound</span>
					<div class="seg-full" role="group" aria-label="Metronome sound">
						{#each METRONOME_SOUNDS as s, i (s.id)}
							<button
								class={cn(
									'seg-item-btn flex-1',
									i === 0 && 'rounded-l-md',
									i === METRONOME_SOUNDS.length - 1 && 'rounded-r-md',
									i > 0 && 'border-l-0',
									store.metronomeSound === s.id && 'sunk'
								)}
								aria-pressed={store.metronomeSound === s.id}
								onclick={() => pickMetronomeSound(s.id)}>{s.label}</button
							>
						{/each}
					</div>
				</div>
				<div class="rp-section">
					<div class="row-between">
						<span class="field-label">Metronome volume</span>
						<span class="text-foreground text-xs font-semibold tabular-nums"
							>{Math.round(store.metronomeVolume * 100)}%</span
						>
					</div>
					<div class="vol-row">
						<SpeakerSimpleHigh class="text-muted-foreground size-4 shrink-0" />
						<input
							type="range"
							min="0"
							max="1"
							step="0.01"
							class="accent-primary w-full"
							value={store.metronomeVolume}
							oninput={(e) => setMetronomeVolume(+e.currentTarget.value)}
							aria-label="Metronome volume"
						/>
					</div>
				</div>
			{:else if mode === 'song'}
				<!-- Song details content -->
				<div class="rp-section">
					<Label for="rp-title">Title</Label>
					<Input
						id="rp-title"
						value={store.score.title}
						placeholder="Untitled Score"
						onfocus={() => store.beginGesture()}
						onblur={() => store.endGesture()}
						oninput={(e) => store.setTitleLive(e.currentTarget.value)}
					/>
				</div>
				<div class="rp-section">
					<Label for="rp-artist">Composer / artist</Label>
					<Input
						id="rp-artist"
						value={store.score.artist}
						placeholder="Unknown"
						onfocus={() => store.beginGesture()}
						onblur={() => store.endGesture()}
						oninput={(e) => store.setArtistLive(e.currentTarget.value)}
					/>
				</div>
				<div class="rp-section two-col">
					<div class="field-col">
						<Label for="rp-tempo">Tempo (BPM)</Label>
						<Input
							id="rp-tempo"
							type="number"
							min="20"
							max="400"
							value={store.score.tempo}
							onfocus={() => store.beginGesture()}
							onblur={() => store.endGesture()}
							oninput={(e) => store.setTempoLive(+e.currentTarget.value)}
						/>
					</div>
					<div class="field-col">
						<Label>Time sig</Label>
						<Popover.Root bind:open={tsOpen}>
							<Popover.Trigger
								class="border-input bg-background hover:bg-accent flex h-9 items-center justify-center rounded-md border text-sm font-semibold tabular-nums w-full"
							>
								{currentTs}
							</Popover.Trigger>
							<Popover.Content class="w-32 p-1">
								<div class="grid grid-cols-2 gap-1">
									{#each TIME_SIGS as t (t)}
										<button
											class={cn(
												'rounded-sm px-2 py-1.5 text-sm font-semibold tabular-nums',
												currentTs === t
													? 'bg-primary text-primary-foreground'
													: 'hover:bg-accent text-foreground'
											)}
											onclick={() => {
												setTs(t);
												tsOpen = false;
											}}>{t}</button
										>
									{/each}
								</div>
							</Popover.Content>
						</Popover.Root>
					</div>
				</div>
				<div class="rp-section">
					<Label>Key signature</Label>
					<Popover.Root bind:open={keyOpen}>
						<Popover.Trigger
							class="border-input bg-background hover:bg-accent flex h-9 w-full items-center justify-center rounded-md border text-sm font-semibold"
						>
							{currentKey.major} / {currentKey.minor}m
						</Popover.Trigger>
						<Popover.Content class="w-56 p-1">
							<div class="grid grid-cols-3 gap-1">
								{#each KEY_SIGS as k (k.fifths)}
									<button
										class={cn(
											'rounded-sm px-2 py-1.5 text-sm font-semibold',
											currentKey.fifths === k.fifths
												? 'bg-primary text-primary-foreground'
												: 'hover:bg-accent text-foreground'
										)}
										onclick={() => {
											store.setKeySignature(k.fifths);
											keyOpen = false;
										}}>{k.major}</button
									>
								{/each}
							</div>
						</Popover.Content>
					</Popover.Root>
				</div>
				<p class="rp-tip">
					Tip: change the time signature of a single bar from the staff right-click menu.
				</p>
			{:else if mode === 'add-remove'}
				<!-- Add / remove content -->
				<div class="rp-section">
					<span class="group-label">Bars</span>
					<div class="action-list">
						<button
							class={cn(buttonVariants({ variant: 'outline' }), 'justify-start')}
							onclick={() => store.addMeasureToAll()}
						>
							<Rows class="size-4" /> Add bar at end
						</button>
						<button
							class={cn(buttonVariants({ variant: 'outline' }), 'justify-start')}
							onclick={() => store.insertMeasureAt(store.cursor.measure)}
						>
							<Rows class="size-4" /> Insert bar at cursor
						</button>
						<button
							class={cn(buttonVariants({ variant: 'outline' }), 'justify-start')}
							onclick={() => store.duplicateMeasureAt(store.cursor.measure)}
						>
							<Copy class="size-4" /> Duplicate current bar
						</button>
						<button
							class={cn(
								buttonVariants({ variant: 'outline' }),
								'text-destructive hover:bg-destructive/10 hover:text-destructive justify-start'
							)}
							disabled={onlyOneBar}
							onclick={() => store.removeMeasureFromAll(store.track.measures.length - 1)}
						>
							<Trash class="size-4" /> Remove last bar
						</button>
					</div>
				</div>
				<div class="rp-section">
					<span class="group-label">Tracks</span>
					<div class="action-list">
						<button
							class={cn(buttonVariants({ variant: 'outline' }), 'justify-start')}
							onclick={addTrack}
						>
							<MusicNotesPlus class="size-4" /> Add track
						</button>
						<button
							class={cn(
								buttonVariants({ variant: 'outline' }),
								'text-destructive hover:bg-destructive/10 hover:text-destructive justify-start'
							)}
							disabled={onlyOneTrack}
							onclick={editCurrentTrack}
						>
							<Trash class="size-4" /> Remove current track…
						</button>
					</div>
				</div>
			{/if}
		</div>
	</aside>
{/if}

<TrackControlDrawer bind:open={trackEditOpen} index={trackEditIndex} />

<style>
	.right-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		overflow-x: hidden;
		background: var(--panel);
		border-left: 1px solid var(--border);
	}
	.rp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.rp-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--ink);
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}
	.close-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: var(--r-xs);
	}
	.close-btn:hover {
		color: var(--ink);
		background: var(--panel-2);
	}
	.rp-body {
		flex: 1;
		overflow-y: auto;
		padding-bottom: 12px;
	}
	.rp-section {
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.center-col {
		align-items: center;
	}
	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.two-col > * {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field-col {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.tempo-display {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.tempo-num {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.bpm-val {
		font-size: 52px;
		font-weight: 700;
		line-height: 1;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.bpm-lbl {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		font-weight: 600;
		color: var(--text-muted);
	}
	.step-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: 1px solid var(--border-strong);
		background: var(--paper);
		border-radius: 50%;
		cursor: pointer;
		color: var(--ink);
	}
	.step-btn:hover:not(:disabled) {
		background: var(--panel-2);
	}
	.step-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.seg-full {
		display: flex;
		width: 100%;
	}
	.seg-item-btn {
		height: 36px;
		border: 1px solid var(--border-strong);
		border-left-width: 0;
		background: var(--paper);
		color: var(--ink);
		cursor: pointer;
		font-size: 13px;
		font-weight: 500;
	}
	.seg-item-btn:first-child {
		border-left-width: 1px;
	}
	.field-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		font-weight: 700;
	}
	.row-between {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.vol-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.rp-tip {
		padding: 8px 14px;
		font-size: 11px;
		color: var(--text-muted);
	}
	.group-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		font-weight: 700;
	}
	.action-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
</style>
