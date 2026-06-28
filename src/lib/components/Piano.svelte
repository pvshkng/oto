<script lang="ts">
	// Virtual piano keyboard, an alternative to the fretboard for note entry.
	// The score model is fret-based (string + fret), so a key press here picks
	// whichever string on the current track can reach that pitch — preferring
	// the cursor's current string — rather than storing an absolute pitch.

	import { store } from '$lib/stores/score.svelte';
	import { audio } from '$lib/audio/engine';
	import { frettedMidi, noteToMidi, NOTE_NAMES } from '$lib/oto/pitch';

	const OCTAVES = 3;
	const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
	// Black key after this white key index (within an octave); E (idx 2) and B
	// (idx 6) have no black key following them.
	const BLACK_AFTER = [0, 1, 3, 4, 5];

	const track = $derived(store.track);
	const beat = $derived(track.measures[store.cursor.measure]?.beats[store.cursor.beat] ?? null);

	// Start the keyboard an octave below the lowest open string, rounded down
	// to a C, so the range always covers what the instrument can actually play.
	const baseMidi = $derived(Math.floor((Math.min(...track.tuning.map(noteToMidi)) - 12) / 12) * 12);

	const whiteKeys = $derived(
		Array.from({ length: OCTAVES * 7 }, (_, i) => {
			const octave = Math.floor(i / 7);
			const offset = WHITE_OFFSETS[i % 7];
			return { midi: baseMidi + octave * 12 + offset, isC: i % 7 === 0 };
		})
	);
	const blackKeys = $derived(
		Array.from({ length: OCTAVES * 5 }, (_, i) => {
			const octave = Math.floor(i / 5);
			const boundary = BLACK_AFTER[i % 5];
			return { midi: baseMidi + octave * 12 + boundary + 1, boundary: octave * 7 + boundary };
		})
	);

	function noteAtMidi(midi: number) {
		return (
			beat?.notes.find(
				(n) =>
					frettedMidi(track.tuning, n.string, n.fret, {
						capo: track.capo,
						transpose: track.transpose
					}) === midi
			) ?? null
		);
	}

	function place(midi: number) {
		const existing = noteAtMidi(midi);
		if (existing) {
			store.setCursor({ string: existing.string });
			store.deleteNoteAtCursor();
			return;
		}
		// Prefer the cursor's current string; fall back to whichever string can
		// reach this pitch with a playable fret (0..24).
		const order = [
			store.cursor.string,
			...track.tuning.map((_, i) => i).filter((i) => i !== store.cursor.string)
		];
		for (const s of order) {
			const open = noteToMidi(track.tuning[s] ?? 'E4');
			const fret = midi - open - track.capo - track.transpose;
			if (fret >= 0 && fret <= 24) {
				store.setCursor({ string: s });
				store.setFretAtCursor(fret);
				audio.pluck(track, s, fret);
				return;
			}
		}
	}

	function label(midi: number): string {
		const idx = ((midi % 12) + 12) % 12;
		const octave = Math.floor(midi / 12) - 1;
		return `${NOTE_NAMES[idx]}${octave}`;
	}
</script>

<div class="piano" role="group" aria-label="Virtual piano keyboard">
	<div class="keys" style="width:{OCTAVES * 7 * 40}px">
		{#each whiteKeys as k (k.midi)}
			{@const active = !!noteAtMidi(k.midi)}
			<button class="white" class:active onclick={() => place(k.midi)} title={label(k.midi)}>
				{#if active}
					<span class="note-dot" style="background:{track.color}">{label(k.midi)}</span>
				{:else if k.isC}
					<span class="ghost">{label(k.midi)}</span>
				{/if}
			</button>
		{/each}
		{#each blackKeys as k (k.midi)}
			{@const active = !!noteAtMidi(k.midi)}
			<button
				class="black"
				class:active
				style="left:{(k.boundary + 1) * 40 - 13}px"
				onclick={() => place(k.midi)}
				title={label(k.midi)}
			>
				{#if active}
					<span class="note-dot" style="background:{track.color}">{label(k.midi)}</span>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	.piano {
		overflow-x: auto;
		background: var(--panel);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		padding: 8px;
	}
	.keys {
		position: relative;
		display: flex;
		height: 120px;
	}
	.white {
		position: relative;
		width: 40px;
		height: 100%;
		border: none;
		border-right: 1px solid var(--border-strong);
		background: var(--paper);
		cursor: pointer;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 6px;
		border-radius: 0 0 4px 4px;
	}
	.white:first-child {
		border-left: 1px solid var(--border-strong);
	}
	.white:hover {
		background: var(--panel-2);
	}
	.white.active {
		background: var(--accent-soft);
	}
	.black {
		position: absolute;
		top: 0;
		width: 26px;
		height: 62%;
		z-index: 2;
		border: none;
		background: var(--ink);
		border-radius: 0 0 3px 3px;
		cursor: pointer;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 4px;
		box-shadow: 0 2px 3px rgba(0, 0, 0, 0.3);
	}
	.black:hover {
		background: var(--ink-soft);
	}
	.black.active {
		background: var(--accent-2);
	}
	.ghost {
		font-size: 9px;
		color: var(--faint);
	}
	.note-dot {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		color: var(--ink);
		font:
			700 9px ui-monospace,
			monospace;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-1);
	}
	.black .note-dot {
		color: var(--accent-ink);
	}
	@media (max-width: 720px) {
		.keys {
			height: 140px;
		}
	}
</style>
