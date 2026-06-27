<script lang="ts">
	import { store } from '$lib/stores/score.svelte';
	import { togglePlayback, stopPlayback } from '$lib/audio/playback';
</script>

<div class="transport">
	<button
		class="play"
		class:playing={store.isPlaying}
		onclick={togglePlayback}
		title="Play / Stop (Space)"
	>
		{#if store.isPlaying}
			<svg viewBox="0 0 24 24" width="20" height="20"
				><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg
			>
		{:else}
			<svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 4l13 8-13 8z" /></svg>
		{/if}
	</button>
	<button class="icon" onclick={stopPlayback} title="Stop">
		<svg viewBox="0 0 24 24" width="18" height="18"
			><rect x="5" y="5" width="14" height="14" rx="2" /></svg
		>
	</button>

	<div class="divider"></div>

	<button
		class="toggle"
		class:on={store.metronomeOn}
		onclick={() => (store.metronomeOn = !store.metronomeOn)}
		title="Metronome"
	>
		<svg viewBox="0 0 24 24" width="18" height="18"
			><path d="M8 3h8l3 18H5L8 3z" fill="none" stroke="currentColor" stroke-width="1.6" /><line
				x1="12"
				y1="20"
				x2="15"
				y2="6"
				stroke="currentColor"
				stroke-width="1.6"
			/></svg
		>
		<span>Metro</span>
	</button>

	<button
		class="toggle"
		class:on={store.loopEnabled}
		class:armed={store.selection}
		onclick={() => (store.loopEnabled = !store.loopEnabled)}
		title="Loop selection (select notes in the staff first)"
	>
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 22l-4-4 4-4" /><path
				d="M21 13v2a4 4 0 01-4 4H3"
			/></svg
		>
		<span>Loop</span>
	</button>

	<div class="divider"></div>

	<label class="tempo">
		<span class="bpm">{store.score.tempo}</span>
		<span class="unit">BPM</span>
		<input
			type="range"
			min="40"
			max="240"
			value={store.score.tempo}
			oninput={(e) => store.setTempo(+e.currentTarget.value)}
		/>
	</label>
</div>

<style>
	.transport {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 1px solid var(--border);
		background: #fff;
		border-radius: 8px;
		cursor: pointer;
		color: var(--ink);
		fill: currentColor;
	}
	.play {
		width: 42px;
		height: 38px;
		justify-content: center;
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
		fill: #fff;
	}
	.play.playing {
		background: #ef4444;
		border-color: #ef4444;
	}
	.icon {
		width: 36px;
		height: 38px;
		justify-content: center;
	}
	.toggle {
		height: 38px;
		padding: 0 10px;
		font-size: 12px;
		font-weight: 600;
	}
	.toggle.on {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.toggle.armed:not(.on) {
		border-color: var(--accent);
	}
	.divider {
		width: 1px;
		height: 26px;
		background: var(--border);
	}
	.tempo {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--muted);
	}
	.bpm {
		font-size: 15px;
		font-weight: 700;
		color: var(--ink);
	}
	.tempo input {
		width: 120px;
		accent-color: var(--accent);
	}
</style>
