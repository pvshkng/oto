<script lang="ts">
	// Virtual guitar/bass neck. Reflects the active track's tuning, highlights the
	// notes in the current beat, and lets you click a fret to enter a note at the
	// cursor (auditioning the pitch). Helps find notes & visualise positions.

	import { store } from '$lib/stores/score.svelte';
	import { audio } from '$lib/audio/engine';
	import { frettedMidi, midiToPitchClass } from '$lib/oto/pitch';

	const FRETS = 16;
	const track = $derived(store.track);
	const beat = $derived(track.measures[store.cursor.measure]?.beats[store.cursor.beat] ?? null);

	const INLAYS = [3, 5, 7, 9, 12, 15];

	function noteAt(stringIndex: number, fret: number) {
		return beat?.notes.find((n) => n.string === stringIndex && n.fret === fret) ?? null;
	}

	function place(stringIndex: number, fret: number) {
		store.setCursor({ string: stringIndex });
		store.setFretAtCursor(fret);
		audio.pluck(track, stringIndex, fret);
	}

	function label(stringIndex: number, fret: number) {
		return midiToPitchClass(frettedMidi(track.tuning, stringIndex, fret, { capo: track.capo }));
	}
</script>

<div class="fretboard" role="group" aria-label="Virtual fretboard">
	<div class="neck" style="grid-template-columns: 34px repeat({FRETS}, 1fr)">
		<!-- fret number header -->
		<div class="corner"></div>
		{#each Array(FRETS) as _, f (f)}
			<div class="fret-num" class:inlay={INLAYS.includes(f + 1)}>{f + 1}</div>
		{/each}

		{#each track.tuning as openNote, s (s)}
			<button
				class="open"
				class:cursor-string={store.cursor.string === s}
				onclick={() => place(s, 0)}
				title="Open {openNote}"
			>
				{openNote.replace(/\d/, '')}
			</button>
			{#each Array(FRETS) as _, fi (fi)}
				{@const fret = fi + 1}
				{@const active = noteAt(s, fret)}
				<button
					class="cell"
					class:active={!!active}
					class:cursor-string={store.cursor.string === s}
					onclick={() => place(s, fret)}
				>
					<span class="dot-bg" class:inlay-col={s === 0 && INLAYS.includes(fret)}></span>
					{#if active}
						<span class="note-dot" style="background:{track.color}">{fret}</span>
					{:else}
						<span class="ghost">{label(s, fret)}</span>
					{/if}
				</button>
			{/each}
		{/each}
	</div>
</div>

<style>
	.fretboard {
		overflow-x: auto;
		background: linear-gradient(#3a2a1c, #2a1d12);
		border-radius: 8px;
		padding: 8px;
	}
	.neck {
		display: grid;
		min-width: 640px;
		gap: 0;
	}
	.corner,
	.fret-num {
		font:
			600 10px ui-monospace,
			monospace;
		color: #c9b79c;
		text-align: center;
		padding-bottom: 4px;
	}
	.fret-num.inlay {
		color: #f0d9b5;
	}
	.open,
	.cell {
		position: relative;
		height: 30px;
		border: none;
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		border-right: 2px solid #5a4631;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}
	.open {
		background: #1c1209;
		color: #e7d3b3;
		font:
			700 11px ui-monospace,
			monospace;
		border-right: 4px solid #d8c7a8;
	}
	.cell:hover {
		background: rgba(255, 255, 255, 0.07);
	}
	.cell.cursor-string,
	.open.cursor-string {
		background: rgba(37, 99, 235, 0.18);
	}
	.ghost {
		font-size: 9px;
		color: rgba(231, 211, 179, 0.35);
	}
	.note-dot {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		color: #fff;
		font:
			700 10px ui-monospace,
			monospace;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
	}
	.dot-bg.inlay-col {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at center, rgba(240, 217, 181, 0.12) 30%, transparent 32%);
		pointer-events: none;
	}
</style>
