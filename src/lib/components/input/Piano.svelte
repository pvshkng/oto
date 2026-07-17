<script lang="ts">
	// Virtual piano keyboard, an alternative to the fretboard for note entry.
	// The score model is fret-based (string + fret), so a key press here picks
	// whichever string on the current track can reach that pitch — preferring
	// the cursor's current string — rather than storing an absolute pitch.
	// Covers the full 88-key standard range: A0 (MIDI 21) → C8 (MIDI 108).

	import { store } from '$lib/stores/score.svelte';
	import { audio } from '$lib/audio/engine';
	import { frettedMidi, noteToMidi, NOTE_NAMES } from '$lib/oto/pitch';

	// Standard 88-key piano range
	const PIANO_START = 21; // A0
	const PIANO_END = 108; // C8
	const WHITE_KEY_W = 36; // px per white key (slightly narrower for 52 keys)
	const WHITE_SET = new Set([0, 2, 4, 5, 7, 9, 11]); // semitones that are white

	interface WhiteKey {
		midi: number;
		isC: boolean;
		idx: number; // 0-based index among white keys
	}
	interface BlackKey {
		midi: number;
		leftWhiteIdx: number; // white key to the left of this black key
	}

	function buildKeys(): { whites: WhiteKey[]; blacks: BlackKey[] } {
		const whites: WhiteKey[] = [];
		const blacks: BlackKey[] = [];
		let wi = 0;
		for (let m = PIANO_START; m <= PIANO_END; m++) {
			const sem = m % 12;
			if (WHITE_SET.has(sem)) {
				whites.push({ midi: m, isC: sem === 0, idx: wi++ });
			} else {
				blacks.push({ midi: m, leftWhiteIdx: wi - 1 });
			}
		}
		return { whites, blacks };
	}

	const { whites: WHITE_KEYS, blacks: BLACK_KEYS } = buildKeys();
	const PIANO_W = WHITE_KEYS.length * WHITE_KEY_W;

	const track = $derived(store.track);
	const beat = $derived(track.measures[store.cursor.measure]?.beats[store.cursor.beat] ?? null);

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
	<div class="keys" style="width:{PIANO_W}px">
		{#each WHITE_KEYS as k (k.midi)}
			{@const active = !!noteAtMidi(k.midi)}
			<button
				class="white"
				class:active
				style="width:{WHITE_KEY_W}px"
				onclick={() => place(k.midi)}
				title={label(k.midi)}
			>
				{#if active}
					<span class="note-dot" style="background:{track.color}">{label(k.midi)}</span>
				{:else if k.isC}
					<span class="ghost">{label(k.midi)}</span>
				{/if}
			</button>
		{/each}
		{#each BLACK_KEYS as k (k.midi)}
			{@const active = !!noteAtMidi(k.midi)}
			<button
				class="black"
				class:active
				style="left:{(k.leftWhiteIdx + 1) * WHITE_KEY_W - 11}px"
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
		background: color-mix(in srgb, var(--background) 70%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--border-strong);
	}
	.keys {
		position: relative;
		display: flex;
		height: 110px;
	}
	.white {
		position: relative;
		height: 100%;
		border: none;
		border-right: 1px solid var(--border-strong);
		background: var(--paper);
		cursor: pointer;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 4px;

		flex-shrink: 0;
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
		width: 22px;
		height: 62%;
		z-index: 2;
		border: none;
		background: var(--ink);
		border-radius: 0 0 3px 3px;
		cursor: pointer;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 3px;
		box-shadow: 0 2px 3px rgba(0, 0, 0, 0.3);
	}
	.black:hover {
		background: var(--ink-soft);
	}
	.black.active {
		background: var(--accent-2);
	}
	.ghost {
		font-size: 8px;
		color: var(--faint);
	}
	.note-dot {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		color: var(--ink);
		font:
			700 8px ui-monospace,
			monospace;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-1);
	}
	.black .note-dot {
		color: var(--accent-ink);
	}
	/* Taller (but not wider) keys on small screens for easier tapping. Width
	   must stay driven only by `WHITE_KEY_W` in the script — the black keys'
	   `left` offsets are computed from that same constant, so overriding
	   white-key width here without updating the black-key math would throw
	   every black key out of alignment with its neighbouring white keys. */
	@media (max-width: 720px) {
		.keys {
			height: 130px;
		}
	}
</style>
