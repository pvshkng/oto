<script lang="ts">
	import { onMount } from 'svelte';
	import { store } from '$lib/stores/score.svelte';
	import { togglePlayback, stopPlayback } from '$lib/audio/playback';
	import { audio } from '$lib/audio/engine';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import TransportBar from '$lib/components/TransportBar.svelte';
	import TrackHeader from '$lib/components/TrackHeader.svelte';
	import TrackStaff from '$lib/components/TrackStaff.svelte';
	import EditPalette from '$lib/components/EditPalette.svelte';
	import Fretboard from '$lib/components/Fretboard.svelte';

	let showFretboard = $state(true);
	let showKeypad = $state(false);

	// Multi-digit fret entry buffer.
	let digitBuffer = '';
	let digitTimer: ReturnType<typeof setTimeout> | null = null;

	function commitDigits(reset = true) {
		if (digitTimer) {
			clearTimeout(digitTimer);
			digitTimer = null;
		}
		if (reset) digitBuffer = '';
	}

	/** Advance once the current fret can't grow into a longer valid number. */
	function finishEntry() {
		commitDigits();
		if (store.autoAdvance) store.advanceForEntry();
	}

	function enterDigit(d: string) {
		const next = digitBuffer + d;
		const fret = parseInt(next, 10);
		// frets above 24 are unrealistic — restart the buffer with the new digit.
		digitBuffer = fret > 24 ? d : next;
		const value = parseInt(digitBuffer, 10);
		store.setFretAtCursor(value);
		auditionCursor();
		if (digitTimer) clearTimeout(digitTimer);

		// A fret is "complete" (can't extend to another valid fret) when it has two
		// digits, or a single digit that can't start a 2-digit fret (only 1x / 2x
		// exist). Complete frets advance instantly; 1 and 2 wait briefly for a
		// possible second digit. This keeps fast single-digit entry snappy while
		// still allowing 10–24.
		const complete = digitBuffer.length === 2 || !['1', '2'].includes(digitBuffer);
		if (complete) finishEntry();
		else digitTimer = setTimeout(finishEntry, 650);
	}

	function auditionCursor() {
		const n = store.currentNote;
		if (n) audio.pluck(store.track, n.string, n.fret);
	}

	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			return; // don't hijack typing in fields
		}

		if (e.code === 'Space') {
			e.preventDefault();
			togglePlayback();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey) store.redo();
			else store.undo();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			store.redo();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
			e.preventDefault();
			import('$lib/io/files').then((m) => m.downloadOto());
			return;
		}
		if (store.isPlaying) return;

		if (/^[0-9]$/.test(e.key)) {
			e.preventDefault();
			enterDigit(e.key);
			return;
		}
		commitDigits();

		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				if (e.shiftKey) extendSelection('left');
				else store.moveCursor('left');
				break;
			case 'ArrowRight':
				e.preventDefault();
				if (e.shiftKey) extendSelection('right');
				else store.moveCursor('right');
				break;
			case 'ArrowUp':
				e.preventDefault();
				store.moveCursor('up');
				break;
			case 'ArrowDown':
				e.preventDefault();
				store.moveCursor('down');
				break;
			case 'Backspace':
			case 'Delete':
				e.preventDefault();
				store.deleteNoteAtCursor();
				break;
			case 'Enter':
				e.preventDefault();
				store.insertBeat();
				break;
			case '-':
				store.deleteBeat();
				break;
			// duration shortcuts (Guitar Pro style: 1..6 with no note in buffer)
			case 'w':
				store.setBeatDuration(1, false);
				store.activeDuration = 1;
				break;
			case 'h':
				store.setBeatDuration(2, false);
				store.activeDuration = 2;
				break;
			case 'q':
				store.setBeatDuration(4, false);
				store.activeDuration = 4;
				break;
			case 'e':
				store.setBeatDuration(8, false);
				store.activeDuration = 8;
				break;
			case 's':
				store.setBeatDuration(16, false);
				store.activeDuration = 16;
				break;
			case '.':
				store.activeDotted = !store.activeDotted;
				store.setBeatDuration(store.activeDuration, store.activeDotted);
				break;
		}
	}

	function extendSelection(dir: 'left' | 'right') {
		store.extendSelection(dir);
	}

	onMount(() => {
		store.loadFromStorage();
		window.addEventListener('keydown', onKeydown);
		return () => {
			window.removeEventListener('keydown', onKeydown);
			stopPlayback();
		};
	});

	const fill = $derived(store.currentMeasureFill);
</script>

<svelte:head>
	<title>oto — tablature studio</title>
	<meta
		name="description"
		content="Lightweight web app for creating guitar tablature and music notation."
	/>
</svelte:head>

<div class="app">
	<Toolbar />

	<div class="control-strip no-print">
		<TransportBar />
		<div class="strip-right">
			{#if fill}
				<span class="bar-meter" class:over={fill.overflow}>
					Bar {store.cursor.measure + 1}: {Math.round(fill.filled * 100) / 100}/{fill.capacity}
					{#if fill.overflow}· overflow{/if}
				</span>
			{/if}
			<button class="chip" class:on={showFretboard} onclick={() => (showFretboard = !showFretboard)}
				>Fretboard</button
			>
			<button
				class="chip mobile-only"
				class:on={showKeypad}
				onclick={() => (showKeypad = !showKeypad)}>Keypad</button
			>
		</div>
	</div>

	<div class="palette-strip no-print">
		<EditPalette />
	</div>

	<main class="score-area">
		<div class="paper">
			<div class="score-head">
				<h1>{store.score.title}</h1>
				<p>{store.score.artist}</p>
			</div>

			{#each store.score.tracks as track, i (track.id)}
				<section class="track-block">
					<div class="no-print"><TrackHeader index={i} /></div>
					<TrackStaff trackIndex={i} />
				</section>
			{/each}

			<div class="add-row no-print">
				<button onclick={() => store.addMeasureToAll()}>+ Measure</button>
				<button onclick={() => store.addTrack()}>+ Track</button>
				{#if store.score.tracks[0].measures.length > 1}
					<button
						class="ghost"
						onclick={() => store.removeMeasureFromAll(store.score.tracks[0].measures.length - 1)}
						>− Measure</button
					>
				{/if}
			</div>
		</div>
	</main>

	{#if showFretboard}
		<div class="dock no-print">
			<Fretboard />
		</div>
	{/if}

	{#if showKeypad}
		<div class="keypad no-print">
			{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as d (d)}
				<button onclick={() => enterDigit(d)}>{d}</button>
			{/each}
			<button class="k-wide" onclick={() => store.deleteNoteAtCursor()}>⌫</button>
			<button onclick={() => store.moveCursor('up')}>▲</button>
			<button onclick={() => store.moveCursor('down')}>▼</button>
			<button onclick={() => store.moveCursor('left')}>◀</button>
			<button onclick={() => store.moveCursor('right')}>▶</button>
			<button class="k-wide" onclick={() => store.insertBeat()}>+ Beat</button>
		</div>
	{/if}
</div>

<style>
	.app {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}
	.control-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 16px;
		background: var(--panel);
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
		position: sticky;
		top: 0;
		z-index: 40;
	}
	.strip-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.bar-meter {
		font-size: 11px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		background: var(--paper);
		border: 1px solid var(--border);
		padding: 5px 9px;
		border-radius: 7px;
	}
	.bar-meter.over {
		color: var(--brick);
		border-color: #e7b9ad;
		background: #fbeae6;
		font-weight: 600;
	}
	.chip {
		border: 1px solid var(--border-strong);
		background: var(--paper);
		border-radius: 999px;
		padding: 7px 14px;
		font-size: 12px;
		cursor: pointer;
		color: var(--ink);
		min-height: 34px;
	}
	.chip.on {
		background: var(--accent);
		color: var(--accent-ink);
		border-color: var(--accent);
	}
	.palette-strip {
		padding: 8px 16px;
		background: var(--panel);
		border-bottom: 1px solid var(--border);
		overflow-x: auto;
	}
	.score-area {
		flex: 1;
		overflow-y: auto;
		padding: 22px 18px 64px;
		display: flex;
		justify-content: center;
	}
	.paper {
		width: 100%;
		max-width: 1080px;
		background: var(--paper);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 32px 34px 44px;
		box-shadow:
			0 1px 2px rgba(74, 56, 30, 0.06),
			0 18px 40px rgba(74, 56, 30, 0.1);
	}
	.score-head {
		text-align: center;
		margin-bottom: 22px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--border);
	}
	.score-head h1 {
		margin: 0;
		font-family: var(--serif);
		font-size: 28px;
		font-weight: 600;
		letter-spacing: 0.2px;
		color: var(--ink);
	}
	.score-head p {
		margin: 4px 0 0;
		font-family: var(--serif);
		font-style: italic;
		color: var(--muted);
	}
	.track-block {
		margin-bottom: 20px;
	}
	.add-row {
		display: flex;
		gap: 8px;
		margin-top: 10px;
		flex-wrap: wrap;
	}
	.add-row button {
		border: 1px dashed var(--border-strong);
		background: var(--bg);
		border-radius: 8px;
		padding: 10px 16px;
		font-size: 13px;
		cursor: pointer;
		color: var(--ink);
		font-weight: 600;
		min-height: 42px;
	}
	.add-row button:hover {
		background: var(--panel-2);
	}
	.add-row .ghost {
		color: var(--muted);
	}
	.dock {
		position: sticky;
		bottom: 0;
		background: var(--panel);
		padding: 8px 14px;
		border-top: 1px solid var(--border);
		z-index: 30;
	}
	.keypad {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 6px;
		padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
		background: var(--panel);
		border-top: 1px solid var(--border-strong);
		z-index: 50;
	}
	.keypad button {
		padding: 0;
		min-height: 52px;
		font-size: 19px;
		font-weight: 600;
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		background: var(--paper);
		color: var(--ink);
		cursor: pointer;
	}
	.keypad button:active {
		background: var(--panel-2);
	}
	.keypad .k-wide {
		background: var(--accent);
		color: var(--accent-ink);
		border-color: var(--accent);
	}
	.mobile-only {
		display: none;
	}
	@media (max-width: 720px) {
		.mobile-only {
			display: inline-flex;
		}
		.score-area {
			padding: 14px 8px 64px;
		}
		.paper {
			padding: 18px 12px 30px;
		}
		.score-head h1 {
			font-size: 22px;
		}
		.chip {
			min-height: 40px;
		}
	}
	@media print {
		.no-print {
			display: none !important;
		}
		.app,
		.score-area {
			background: #fff !important;
			padding: 0;
		}
		.paper {
			box-shadow: none;
			border: none;
			max-width: none;
		}
	}
</style>
