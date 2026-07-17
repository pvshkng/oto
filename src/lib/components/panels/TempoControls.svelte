<script lang="ts">
	// Tempo display + steppers + slider + metronome sound/volume, shared by
	// TempoDrawer (mobile) and RightPanel's "tempo" mode (desktop). The two
	// hosts render this content quite differently in scale/density (a
	// full-width drawer sheet vs. a narrow sidebar), so `variant` switches
	// between the two markups — all state/behavior below is unified.
	import { store } from '$lib/stores/score.svelte';
	import { audio, METRONOME_SOUNDS, type MetronomeSound } from '$lib/audio/engine';
	import { reflectTempoChange } from '$lib/audio/playback';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import Minus from 'phosphor-svelte/lib/Minus';
	import Plus from 'phosphor-svelte/lib/Plus';
	import SpeakerSimpleHigh from 'phosphor-svelte/lib/SpeakerSimpleHigh';

	let { variant }: { variant: 'drawer' | 'panel' } = $props();

	const MIN = 20;
	const MAX = 400;

	function step(delta: number) {
		store.setTempo(store.score.tempo + delta);
		// Apply immediately, even mid-playback, instead of waiting for the next play().
		reflectTempoChange();
	}

	function setTempoLive(tempo: number) {
		store.setTempoLive(tempo);
		reflectTempoChange();
	}

	function pickSound(id: MetronomeSound) {
		store.metronomeSound = id;
		// Apply immediately, even mid-playback, instead of waiting for the next play().
		audio.setMetronomeSound(id);
		audio.previewMetronome();
	}

	function setMetronomeVolume(v: number) {
		store.metronomeVolume = v;
		// Apply live so the change is audible mid-playback.
		audio.setMetronomeVolume(v);
	}
</script>

{#if variant === 'drawer'}
	<div class="flex flex-col items-center gap-5 p-4 pt-0 pb-8">
		<div class="flex items-center gap-5">
			<Button
				variant="outline"
				size="icon"
				class="size-11 shrink-0 rounded-full"
				aria-label="Decrease tempo"
				disabled={store.score.tempo <= MIN}
				onclick={() => step(-1)}
			>
				<Minus class="size-5" />
			</Button>

			<div class="flex flex-col items-center">
				<span class="text-foreground text-6xl font-bold tabular-nums">{store.score.tempo}</span>
				<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">BPM</span>
			</div>

			<Button
				variant="outline"
				size="icon"
				class="size-11 shrink-0 rounded-full"
				aria-label="Increase tempo"
				disabled={store.score.tempo >= MAX}
				onclick={() => step(1)}
			>
				<Plus class="size-5" />
			</Button>
		</div>

		<input
			type="range"
			min={MIN}
			max={MAX}
			class="accent-primary w-full"
			value={store.score.tempo}
			onpointerdown={() => store.beginGesture()}
			onpointerup={() => store.endGesture()}
			onpointercancel={() => store.endGesture()}
			oninput={(e) => setTempoLive(+e.currentTarget.value)}
			aria-label="Tempo slider"
		/>

		<div class="flex w-full flex-col items-center gap-2">
			<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
				Metronome sound
			</span>
			<div class="flex w-full items-stretch" role="group" aria-label="Metronome sound">
				{#each METRONOME_SOUNDS as s, i (s.id)}
					<Button
						variant="outline"
						size="sm"
						class={cn(
							'h-9 flex-1 rounded-none',
							i === 0 && 'rounded-l-md',
							i === METRONOME_SOUNDS.length - 1 && 'rounded-r-md',
							i > 0 && 'border-l-0',
							store.metronomeSound === s.id && 'sunk'
						)}
						aria-pressed={store.metronomeSound === s.id}
						onclick={() => pickSound(s.id)}
					>
						{s.label}
					</Button>
				{/each}
			</div>
		</div>

		<div class="flex w-full flex-col items-center gap-2">
			<div class="flex w-full items-baseline justify-between">
				<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
					Metronome volume
				</span>
				<span class="text-foreground text-xs font-semibold tabular-nums">
					{Math.round(store.metronomeVolume * 100)}%
				</span>
			</div>
			<div class="flex w-full items-center gap-3">
				<SpeakerSimpleHigh class="text-muted-foreground size-5 shrink-0" />
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					class="accent-primary w-full"
					value={store.metronomeVolume}
					oninput={(e) => setMetronomeVolume(+e.currentTarget.value)}
					aria-label="Metronome volume"
					aria-valuetext={`${Math.round(store.metronomeVolume * 100)} percent`}
				/>
			</div>
		</div>
	</div>
{:else}
	<div class="flex flex-col items-center gap-2 border-b border-border px-3.5 py-3">
		<div class="flex items-center gap-4">
			<button
				class="flex size-9 items-center justify-center rounded-full border border-border-strong bg-paper [background-image:none!important] text-ink hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40"
				aria-label="Decrease tempo"
				disabled={store.score.tempo <= MIN}
				onclick={() => step(-1)}
			>
				<Minus class="size-4" />
			</button>
			<div class="flex flex-col items-center">
				<span
					class="text-ink text-[52px] leading-none font-bold [font-variant-numeric:tabular-nums]"
					>{store.score.tempo}</span
				>
				<span class="text-text-muted text-[10px] font-semibold tracking-[0.4px] uppercase">BPM</span
				>
			</div>
			<button
				class="flex size-9 items-center justify-center rounded-full border border-border-strong bg-paper [background-image:none!important] text-ink hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40"
				aria-label="Increase tempo"
				disabled={store.score.tempo >= MAX}
				onclick={() => step(1)}
			>
				<Plus class="size-4" />
			</button>
		</div>
		<input
			type="range"
			min={MIN}
			max={MAX}
			class="accent-primary w-full"
			value={store.score.tempo}
			onpointerdown={() => store.beginGesture()}
			onpointerup={() => store.endGesture()}
			onpointercancel={() => store.endGesture()}
			oninput={(e) => setTempoLive(+e.currentTarget.value)}
			aria-label="Tempo slider"
		/>
	</div>
	<div class="flex flex-col gap-2 border-b border-border px-3.5 py-3">
		<span class="text-text-muted text-[10px] font-bold tracking-[0.4px] uppercase"
			>Metronome sound</span
		>
		<div class="flex w-full" role="group" aria-label="Metronome sound">
			{#each METRONOME_SOUNDS as s, i (s.id)}
				<button
					class={cn(
						'h-9 flex-1 border border-border-strong bg-paper [background-image:none!important] text-[13px] font-medium text-ink',
						i === 0 && 'rounded-l-md',
						i === METRONOME_SOUNDS.length - 1 && 'rounded-r-md',
						i > 0 && 'border-l-0',
						store.metronomeSound === s.id && 'sunk'
					)}
					aria-pressed={store.metronomeSound === s.id}
					onclick={() => pickSound(s.id)}>{s.label}</button
				>
			{/each}
		</div>
	</div>
	<div class="flex flex-col gap-2 border-b border-border px-3.5 py-3">
		<div class="flex items-baseline justify-between">
			<span class="text-text-muted text-[10px] font-bold tracking-[0.4px] uppercase"
				>Metronome volume</span
			>
			<span class="text-foreground text-xs font-semibold tabular-nums"
				>{Math.round(store.metronomeVolume * 100)}%</span
			>
		</div>
		<div class="flex items-center gap-2">
			<SpeakerSimpleHigh class="text-muted-foreground size-4 shrink-0" />
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				class="accent-primary w-full"
				value={store.metronomeVolume}
				oninput={(e) => setMetronomeVolume(+e.currentTarget.value)}
				aria-label="Metronome volume"
			/>
		</div>
	</div>
{/if}
