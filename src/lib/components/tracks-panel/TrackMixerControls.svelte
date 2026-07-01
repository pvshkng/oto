<script lang="ts">
	// Volume fader + pan knob + EQ popover — identical between the desktop
	// always-visible row and the mobile row revealed by the expand chevron.
	// The only real difference is mobile also shows a numeric volume readout
	// next to the fader (desktop shows the same number only in the title).
	import { store } from '$lib/stores/score.svelte';
	import { cn } from '$lib/utils';
	import * as Popover from '$lib/components/ui/popover';
	import Knob from '../Knob.svelte';
	import { MIXER_FADER_CLASS } from './mixer-fader';
	import type { OtoTrack } from '$lib/oto/types';

	let {
		track,
		eqOpen,
		onEqOpenChange,
		showVolumeReadout,
		onVolume,
		onPan,
		onEqBand,
		onEqReset
	}: {
		track: OtoTrack;
		eqOpen: boolean;
		onEqOpenChange: (v: boolean) => void;
		showVolumeReadout: boolean;
		onVolume: (v: number) => void;
		onPan: (v: number) => void;
		onEqBand: (band: 'low' | 'mid' | 'high', db: number) => void;
		onEqReset: () => void;
	} = $props();

	// Pan readout for the knob's drag tooltip.
	function panLabel(v: number): string {
		if (Math.abs(v) < 0.02) return 'C';
		const amt = Math.round(Math.abs(v) * 100);
		return `${v < 0 ? 'L' : 'R'}${amt}`;
	}

	function eqActive(t: OtoTrack): boolean {
		return t.eq.low !== 0 || t.eq.mid !== 0 || t.eq.high !== 0;
	}
</script>

<input
	type="range"
	min="0"
	max="1"
	step="0.01"
	aria-label={`${track.name} volume`}
	title={showVolumeReadout ? 'Volume' : `Volume: ${Math.round(track.volume * 100)}%`}
	class={cn(MIXER_FADER_CLASS, showVolumeReadout ? 'min-w-0 flex-1' : 'w-20 shrink-0')}
	value={track.volume}
	aria-valuetext={`${Math.round(track.volume * 100)} percent`}
	onpointerdown={() => store.beginGesture()}
	onpointerup={() => store.endGesture()}
	onpointercancel={() => store.endGesture()}
	oninput={(e) => onVolume(e.currentTarget.valueAsNumber)}
/>
{#if showVolumeReadout}
	<span
		class="text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums"
		title="Volume">{Math.round(track.volume * 100)}%</span
	>
{/if}
<Knob
	value={track.pan}
	min={-1}
	max={1}
	default={0}
	label={`${track.name} pan`}
	format={panLabel}
	onInput={onPan}
	onDragStart={() => store.beginGesture()}
	onDragEnd={() => store.endGesture()}
/>
<Popover.Root open={eqOpen} onOpenChange={onEqOpenChange}>
	<Popover.Trigger
		class={cn(
			'flex size-7 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold transition-colors [background-image:none!important]',
			eqActive(track)
				? 'bg-primary text-primary-foreground border-primary'
				: 'text-muted-foreground hover:text-foreground'
		)}
		title="Equaliser"
		aria-label={`${track.name} equaliser`}>EQ</Popover.Trigger
	>
	<Popover.Content side="top" align="end" class="w-56 p-3">
		<div class="mb-2 flex items-center justify-between">
			<span class="text-xs font-semibold">Equaliser</span>
			<button
				class="text-muted-foreground hover:text-foreground [background-image:none!important] text-[11px] underline"
				onclick={onEqReset}>Reset</button
			>
		</div>
		{#each [['low', 'Low'], ['mid', 'Mid'], ['high', 'High']] as [band, lbl] (band)}
			{@const key = band as 'low' | 'mid' | 'high'}
			<div class="mb-2 grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2">
				<span class="text-muted-foreground text-[11px]">{lbl}</span>
				<input
					type="range"
					min="-12"
					max="12"
					step="0.5"
					class={MIXER_FADER_CLASS}
					value={track.eq[key]}
					onpointerdown={() => store.beginGesture()}
					onpointerup={() => store.endGesture()}
					onpointercancel={() => store.endGesture()}
					oninput={(e) => onEqBand(key, e.currentTarget.valueAsNumber)}
				/>
				<span class="text-right text-[11px] tabular-nums">
					{track.eq[key] > 0 ? '+' : ''}{track.eq[key]}
				</span>
			</div>
		{/each}
	</Popover.Content>
</Popover.Root>
