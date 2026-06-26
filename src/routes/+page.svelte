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

	function enterDigit(d: string) {
		const next = digitBuffer + d;
		const fret = parseInt(next, 10);
		// frets above 24 are unrealistic — restart the buffer with the new digit.
		if (fret > 24) {
			digitBuffer = d;
		} else {
			digitBuffer = next;
		}
		store.setFretAtCursor(parseInt(digitBuffer, 10));
		auditionCursor();
		if (digitTimer) clearTimeout(digitTimer);
		digitTimer = setTimeout(() => (digitBuffer = ''), 900);
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
		display: flex;
		flex-direction: column;
		background: #0b1220;
	}
	.control-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 14px;
		background: #f8fafc;
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
		background: #fff;
		border: 1px solid var(--border);
		padding: 4px 8px;
		border-radius: 6px;
	}
	.bar-meter.over {
		color: #dc2626;
		border-color: #fecaca;
		background: #fef2f2;
		font-weight: 600;
	}
	.chip {
		border: 1px solid var(--border);
		background: #fff;
		border-radius: 999px;
		padding: 5px 12px;
		font-size: 12px;
		cursor: pointer;
		color: var(--ink);
	}
	.chip.on {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
	.palette-strip {
		padding: 8px 14px;
		background: #f8fafc;
		border-bottom: 1px solid var(--border);
	}
	.score-area {
		flex: 1;
		overflow-y: auto;
		padding: 18px;
		display: flex;
		justify-content: center;
	}
	.paper {
		width: 100%;
		max-width: 1100px;
		background: #fff;
		border-radius: 10px;
		padding: 26px 28px 40px;
		box-shadow: 0 6px 30px rgba(0, 0, 0, 0.25);
	}
	.score-head {
		text-align: center;
		margin-bottom: 18px;
	}
	.score-head h1 {
		margin: 0;
		font-size: 26px;
		font-weight: 800;
		color: var(--ink);
	}
	.score-head p {
		margin: 2px 0 0;
		color: var(--muted);
	}
	.track-block {
		margin-bottom: 16px;
	}
	.add-row {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.add-row button {
		border: 1px dashed var(--border);
		background: #f8fafc;
		border-radius: 7px;
		padding: 8px 14px;
		font-size: 13px;
		cursor: pointer;
		color: var(--accent);
		font-weight: 600;
	}
	.add-row .ghost {
		color: var(--muted);
	}
	.dock {
		position: sticky;
		bottom: 0;
		background: #1a120b;
		padding: 8px 14px;
		border-top: 1px solid #000;
		z-index: 30;
	}
	.keypad {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 4px;
		padding: 8px;
		background: #0f172a;
		z-index: 50;
	}
	.keypad button {
		padding: 14px 0;
		font-size: 17px;
		border: none;
		border-radius: 8px;
		background: #1e293b;
		color: #fff;
		cursor: pointer;
	}
	.keypad .k-wide {
		grid-column: span 1;
		background: #2563eb;
	}
	.mobile-only {
		display: none;
	}
	@media (max-width: 720px) {
		.mobile-only {
			display: inline-flex;
		}
		.paper {
			padding: 16px 12px 28px;
		}
		.score-head h1 {
			font-size: 20px;
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
			max-width: none;
		}
	}
</style>
