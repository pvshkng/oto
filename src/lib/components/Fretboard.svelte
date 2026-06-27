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
		// Tapping the note that is already there removes it (toggle behaviour).
		if (noteAt(stringIndex, fret)) {
			store.deleteNoteAtCursor();
			return;
		}
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
		background: var(--panel);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
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
		color: var(--text-muted);
		text-align: center;
		padding-bottom: 4px;
	}
	.fret-num.inlay {
		color: var(--ink);
		font-weight: 700;
	}
	.open,
	.cell {
		position: relative;
		height: 34px;
		border: none;
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		border-right: 2px solid var(--border-strong);
		border-bottom: 1px solid var(--border);
	}
	.open {
		background: var(--panel-2);
		color: var(--ink);
		font:
			700 11px ui-monospace,
			monospace;
		border-right: 4px solid var(--faint);
	}
	.cell:hover {
		background: var(--panel-2);
	}
	.cell.cursor-string,
	.open.cursor-string {
		background: var(--accent-soft);
	}
	.ghost {
		font-size: 9px;
		color: var(--faint);
	}
	.note-dot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		color: var(--ink);
		font:
			700 10px ui-monospace,
			monospace;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-1);
	}
	.dot-bg.inlay-col {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at center, rgba(24, 24, 27, 0.12) 30%, transparent 32%);
		pointer-events: none;
	}
	@media (max-width: 720px) {
		.open,
		.cell {
			height: 40px;
		}
	}
</style>
