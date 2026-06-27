<script lang="ts">
	import { store } from '$lib/stores/score.svelte';
	import { ToggleGroup } from 'bits-ui';
	import TrackDialog from './TrackDialog.svelte';

	let { index }: { index: number } = $props();
	const track = $derived(store.score.tracks[index]);
	const isActive = $derived(store.cursor.track === index);
	const collapsed = $derived(store.isCollapsed(index));
	const focused = $derived(store.focusedTrackId === track.id);

	let editOpen = $state(false);

	const activeViews = $derived(
		(['standard', 'tab', 'rhythm'] as const).filter((k) => track.view[k])
	);
	const muteSolo = $derived([...(track.muted ? ['mute'] : []), ...(track.soloed ? ['solo'] : [])]);
</script>

<div class="header" class:active={isActive} class:collapsed style="--track-color:{track.color}">
	<button
		class="chev"
		onclick={() => store.toggleCollapsed(index)}
		title={collapsed ? 'Expand track' : 'Collapse track'}
		aria-label={collapsed ? 'Expand track' : 'Collapse track'}
	>
		<svg viewBox="0 0 24 24" width="18" height="18" class:rot={collapsed} aria-hidden="true">
			<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" />
		</svg>
	</button>

	<button
		class="select-track"
		onclick={() => store.setCursor({ track: index, measure: 0, beat: 0 })}
		title="Select track"
	>
		<span class="swatch"></span>
		<span class="num">{index + 1}</span>
	</button>

	<input
		class="name"
		value={track.name}
		onchange={(e) => store.updateTrack(index, { name: e.currentTarget.value })}
	/>

	{#if !collapsed}
		<ToggleGroup.Root type="multiple" value={activeViews} class="views">
			<ToggleGroup.Item
				class="vtab"
				value="standard"
				title="Standard notation"
				onclick={() => store.toggleTrackView(index, 'standard')}
			>
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
					><path
						d="M9 18V5l9-2v13"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/><circle cx="6" cy="18" r="3" fill="currentColor" /><circle
						cx="15"
						cy="16"
						r="3"
						fill="currentColor"
					/></svg
				>
			</ToggleGroup.Item>
			<ToggleGroup.Item
				class="vtab txt"
				value="tab"
				title="Tablature"
				onclick={() => store.toggleTrackView(index, 'tab')}>TAB</ToggleGroup.Item
			>
			<ToggleGroup.Item
				class="vtab"
				value="rhythm"
				title="Rhythm slashes"
				onclick={() => store.toggleTrackView(index, 'rhythm')}
			>
				<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
					><path
						d="M6 19L18 5"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
					/><path
						d="M10 19L22 5"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
					/></svg
				>
			</ToggleGroup.Item>
		</ToggleGroup.Root>
	{/if}

	<ToggleGroup.Root type="multiple" value={muteSolo} class="ms">
		<ToggleGroup.Item
			class="ms-btn"
			value="mute"
			title="Mute"
			onclick={() => store.toggleMute(index)}>M</ToggleGroup.Item
		>
		<ToggleGroup.Item
			class="ms-btn solo"
			value="solo"
			title="Solo"
			onclick={() => store.toggleSolo(index)}>S</ToggleGroup.Item
		>
	</ToggleGroup.Root>

	<button
		class="icon-btn"
		class:on={focused}
		title={focused ? 'Exit focus' : 'Focus this track'}
		aria-label={focused ? 'Exit focus' : 'Focus this track'}
		onclick={() => (focused ? store.clearFocus() : store.focusTrack(index))}
	>
		{#if focused}
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
				><path
					d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.4 5.2A9 9 0 0112 5c5 0 9 7 9 7a14 14 0 01-2 2.8M6 6a14 14 0 00-3 6s4 7 9 7a8 8 0 003-.6"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/></svg
			>
		{:else}
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
				><path
					d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				/><circle cx="12" cy="12" r="3" fill="currentColor" /></svg
			>
		{/if}
	</button>

	<button
		class="icon-btn"
		title="Track settings"
		aria-label="Track settings"
		onclick={() => (editOpen = true)}
	>
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
			><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" /><path
				d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			/></svg
		>
	</button>
</div>

<TrackDialog bind:open={editOpen} mode="edit" {index} />

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-left: 3px solid var(--track-color);
		border-radius: var(--r-sm) var(--r-sm) 0 0;
		flex-wrap: wrap;
	}
	.header.collapsed {
		border-radius: var(--r-sm);
	}
	.header.active {
		background: var(--paper);
		box-shadow: inset 0 0 0 1px var(--border-strong);
	}
	.chev,
	.select-track {
		border: none;
		background: transparent;
		cursor: pointer;
		color: var(--muted);
		display: inline-flex;
		align-items: center;
		padding: 0;
	}
	.chev svg {
		transition: transform 0.15s ease;
	}
	.chev svg.rot {
		transform: rotate(-90deg);
	}
	.select-track {
		gap: 6px;
	}
	.swatch {
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: var(--track-color);
	}
	.num {
		font-weight: 700;
		font-size: 12px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.name {
		flex: 1;
		min-width: 60px;
		border: 1px solid transparent;
		background: transparent;
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
		padding: 5px 7px;
		border-radius: var(--r-xs);
	}
	.name:hover,
	.name:focus {
		border-color: var(--border-strong);
		background: var(--paper);
		outline: none;
	}
	:global(.views),
	:global(.ms) {
		display: inline-flex;
		gap: 3px;
	}
	:global(.vtab),
	:global(.ms-btn),
	.icon-btn {
		min-width: 36px;
		height: 34px;
		border: 1px solid var(--border-strong);
		background: var(--paper);
		border-radius: var(--r-xs);
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		color: var(--muted);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 6px;
	}
	.icon-btn {
		min-width: 34px;
	}
	.icon-btn:hover,
	:global(.vtab:hover),
	:global(.ms-btn:hover) {
		background: var(--panel-2);
		color: var(--ink);
	}
	:global(.vtab[data-state='on']) {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	:global(.ms-btn[data-state='on']) {
		background: var(--ink-soft);
		border-color: var(--ink-soft);
		color: var(--accent-ink);
	}
	:global(.ms-btn.solo[data-state='on']) {
		background: var(--accent);
		border-color: var(--accent);
	}
	.icon-btn.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	@media (max-width: 720px) {
		:global(.vtab),
		:global(.ms-btn),
		.icon-btn {
			height: 40px;
			min-width: 40px;
		}
		.name {
			flex-basis: 100%;
			order: 1;
		}
	}
</style>
