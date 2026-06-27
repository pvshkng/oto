<script lang="ts">
	// Note-duration picker + effects toggles. Editing the active palette changes
	// what new notes use; with a note selected, the buttons apply to that note.

	import { store } from '$lib/stores/score.svelte';
	import { DURATION_LABELS, type DurationValue, type Technique } from '$lib/oto/types';
	import { DURATION_ORDER } from '$lib/oto/duration';

	const GLYPHS: Record<DurationValue, string> = {
		1: '𝅝',
		2: '𝅗𝅥',
		4: '♩',
		8: '♪',
		16: '𝅘𝅥𝅯',
		32: '𝅘𝅥𝅰'
	};

	const EFFECTS: { tech: Technique; label: string; sym: string }[] = [
		{ tech: 'hammer', label: 'Hammer-on / Pull-off', sym: 'H/P' },
		{ tech: 'slide', label: 'Slide', sym: '/' },
		{ tech: 'bend', label: 'Bend', sym: '⤴' },
		{ tech: 'vibrato', label: 'Vibrato', sym: '∿' },
		{ tech: 'palm-mute', label: 'Palm mute', sym: 'P.M' },
		{ tech: 'let-ring', label: 'Let ring', sym: 'L.R' },
		{ tech: 'harmonic', label: 'Harmonic', sym: '◇' },
		{ tech: 'dead', label: 'Dead note', sym: 'x' },
		{ tech: 'staccato', label: 'Staccato', sym: '·' },
		{ tech: 'ghost', label: 'Ghost note', sym: '( )' }
	];

	const note = $derived(store.currentNote);

	function pickDuration(d: DurationValue) {
		store.activeDuration = d;
		// If the current beat has content, change its duration too.
		store.setBeatDuration(d, store.activeDotted);
	}

	function toggleDot() {
		store.activeDotted = !store.activeDotted;
		store.setBeatDuration(store.activeDuration, store.activeDotted);
	}

	function hasTech(t: Technique) {
		return note?.techniques?.includes(t) ?? false;
	}
</script>

<div class="palette">
	<div class="group">
		<span class="lbl">Voice</span>
		<div class="btns">
			<button class="vbtn" class:on={store.cursor.voice === 0} onclick={() => store.setVoice(0)}
				>1</button
			>
			<button
				class="vbtn v2"
				class:on={store.cursor.voice === 1}
				title="Second voice — for notes of a different duration sounding at the same time"
				onclick={() => store.setVoice(1)}>2</button
			>
		</div>
	</div>

	<div class="group">
		<span class="lbl">Duration</span>
		<div class="btns">
			{#each DURATION_ORDER as d (d)}
				<button
					class="dbtn"
					class:on={store.activeDuration === d}
					title={DURATION_LABELS[d]}
					onclick={() => pickDuration(d)}
				>
					<span class="glyph">{GLYPHS[d]}</span>
				</button>
			{/each}
			<button class="dbtn" class:on={store.activeDotted} title="Dotted" onclick={toggleDot}>
				<span class="glyph">♩<b>.</b></span>
			</button>
		</div>
	</div>

	<div class="group">
		<span class="lbl">Effects</span>
		<div class="btns wrap">
			{#each EFFECTS as e (e.tech)}
				<button
					class="ebtn"
					class:on={hasTech(e.tech)}
					class:disabled={!note}
					disabled={!note}
					title={e.label}
					onclick={() => store.toggleTechnique(e.tech)}
				>
					{e.sym}
				</button>
			{/each}
		</div>
	</div>

	{#if note && hasTech('bend')}
		<div class="group">
			<span class="lbl">Bend</span>
			<div class="btns">
				{#each [0.5, 1, 1.5, 2] as amt (amt)}
					<button class="ebtn" class:on={note.bend === amt} onclick={() => store.setBend(amt)}>
						{amt === 0.5 ? '½' : amt === 1.5 ? '1½' : amt}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.palette {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
		padding: 8px 10px;
		background: var(--panel);
		border-radius: 8px;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.lbl {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--muted);
		font-weight: 600;
	}
	.btns {
		display: flex;
		gap: 3px;
	}
	.btns.wrap {
		flex-wrap: wrap;
		max-width: 320px;
	}
	.dbtn,
	.ebtn,
	.vbtn {
		min-width: 30px;
		height: 30px;
		padding: 0 6px;
		border: 1px solid var(--border);
		background: #fff;
		border-radius: 6px;
		cursor: pointer;
		font-size: 12px;
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.vbtn {
		font-weight: 700;
		min-width: 34px;
	}
	.vbtn.on {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.vbtn.v2.on {
		background: #1f6f6b;
		border-color: #1f6f6b;
	}
	.dbtn .glyph {
		font-size: 16px;
		line-height: 1;
	}
	.dbtn.on,
	.ebtn.on {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.ebtn.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.dbtn:hover:not(.on),
	.ebtn:hover:not(.on):not(.disabled) {
		background: var(--panel-2);
	}
	@media (max-width: 720px) {
		.palette {
			gap: 12px;
		}
		.dbtn,
		.ebtn,
		.vbtn {
			min-width: 40px;
			height: 42px;
		}
		.btns.wrap {
			max-width: none;
		}
	}
</style>
