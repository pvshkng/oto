<script lang="ts">
	// Chromatic tuner readout, shared by the desktop floating window and the
	// mobile modal. Owns the mic lifecycle: mounting starts the tuner (which
	// triggers the permission prompt on first use) and unmounting releases the
	// microphone, so the mic is only live while the tuner is on screen.
	import { onMount } from 'svelte';
	import { tuner, NOISE_FLOOR } from '$lib/audio/tuner.svelte';
	import { midiToPitchClass } from '$lib/oto/pitch';
	import * as Popover from '$lib/components/ui/popover';
	import { MIXER_FADER_CLASS } from './tracks-panel/mixer-fader';
	import Spinner from './Spinner.svelte';
	import Faders from 'phosphor-svelte/lib/Faders';
	import MicrophoneSlash from 'phosphor-svelte/lib/MicrophoneSlash';
	import Warning from 'phosphor-svelte/lib/Warning';

	onMount(() => {
		void tuner.start();
		return () => tuner.stop();
	});

	let micOpen = $state(false);
	/** Input level on a dB scale for the meter: −60 dB…0 dB → 0…100%. */
	const levelPct = $derived(
		tuner.level > 0 ? Math.max(0, Math.min(100, (20 * Math.log10(tuner.level) + 60) / 0.6)) : 0
	);
	const hasSignal = $derived(tuner.level >= NOISE_FLOOR);

	const hasPitch = $derived(tuner.status === 'listening' && tuner.midi >= 0);
	const pitchClass = $derived(hasPitch ? midiToPitchClass(tuner.midi) : '');
	const octave = $derived(hasPitch ? Math.floor(tuner.midi / 12) - 1 : 0);
	const cents = $derived(Math.max(-50, Math.min(50, tuner.cents)));
	const inTune = $derived(hasPitch && Math.abs(cents) <= 5);
	/** Needle position across the meter: −50…+50 cents → 0…100%. */
	const needlePct = $derived(50 + cents);

	const TICKS = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
</script>

<div class="relative flex flex-col gap-3 p-4">
	{#if tuner.status === 'denied'}
		<div class="flex flex-col items-center gap-2 py-4 text-center">
			<MicrophoneSlash class="size-6 text-text-muted" />
			<p class="text-sm font-semibold text-ink">Microphone access is blocked</p>
			<p class="text-xs text-text-muted">
				The tuner needs the microphone to hear your instrument. Allow microphone access for this
				site in your browser settings, then try again.
			</p>
			<button
				class="mt-1 cursor-pointer rounded-legacy-xs border border-border bg-transparent [background-image:none!important] px-3 py-1.5 text-xs font-semibold text-ink hover:bg-panel-2"
				onclick={() => void tuner.start()}
			>
				Try again
			</button>
		</div>
	{:else if tuner.status === 'unavailable'}
		<div class="flex flex-col items-center gap-2 py-4 text-center">
			<MicrophoneSlash class="size-6 text-text-muted" />
			<p class="text-sm font-semibold text-ink">No microphone available</p>
			<p class="text-xs text-text-muted">Connect a microphone to use the tuner.</p>
		</div>
	{:else if tuner.status === 'error'}
		<div class="flex flex-col items-center gap-2 py-4 text-center">
			<Warning class="size-6 text-brick" />
			<p class="text-sm font-semibold text-ink">Couldn't open the microphone</p>
			{#if tuner.errorMessage}
				<p class="text-xs text-text-muted">{tuner.errorMessage}</p>
			{/if}
			<button
				class="mt-1 cursor-pointer rounded-legacy-xs border border-border bg-transparent [background-image:none!important] px-3 py-1.5 text-xs font-semibold text-ink hover:bg-panel-2"
				onclick={() => void tuner.start()}
			>
				Try again
			</button>
		</div>
	{:else if tuner.status === 'requesting'}
		<div class="flex flex-col items-center gap-3 py-6 text-center">
			<Spinner size={22} />
			<p class="text-xs text-text-muted">Waiting for microphone access…</p>
		</div>
	{:else}
		<!-- listening (or the brief idle before start settles) -->
		<Popover.Root bind:open={micOpen}>
			<Popover.Trigger
				class="absolute top-1.5 right-1.5 cursor-pointer rounded-md bg-transparent [background-image:none!important] p-1.5 text-text-muted hover:bg-panel-2 hover:text-ink"
				title="Mic volume"
				aria-label="Mic volume"
			>
				<Faders class="size-4" />
			</Popover.Trigger>
			<!-- z-[70]: must clear the floating tuner window itself (panels stack at 10–30, see store.panelZ). -->
			<Popover.Content side="bottom" align="end" class="z-[70] w-56 p-3">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-xs font-semibold">Mic volume</span>
					<span class="text-[11px] text-text-muted tabular-nums"
						>{Math.round(tuner.gain * 100)}%</span
					>
				</div>
				<input
					type="range"
					min="-2"
					max="3"
					step="0.05"
					aria-label="Mic volume"
					class="{MIXER_FADER_CLASS} w-full"
					value={Math.log2(tuner.gain)}
					aria-valuetext={`${Math.round(tuner.gain * 100)} percent`}
					oninput={(e) => tuner.setGain(2 ** e.currentTarget.valueAsNumber)}
				/>
				<div class="mt-3 flex items-center gap-2">
					<span class="text-[11px] text-text-muted">Level</span>
					<div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-panel-2">
						<div
							class="h-full rounded-full transition-[width] duration-75 {hasSignal
								? 'bg-emerald-600'
								: 'bg-border-strong'}"
							style="width: {levelPct}%"
						></div>
					</div>
				</div>
			</Popover.Content>
		</Popover.Root>
		<div class="flex h-20 items-end justify-center">
			{#if hasPitch}
				<span
					class="text-6xl leading-none font-bold tabular-nums {inTune
						? 'text-emerald-600'
						: 'text-ink'}"
				>
					{pitchClass}<span class="text-2xl font-semibold text-text-muted">{octave}</span>
				</span>
			{:else}
				<span class="pb-2 text-sm text-text-muted">Play a note…</span>
			{/if}
		</div>

		<!-- Cents meter: ±50¢ scale with a centre target zone and a needle. -->
		<div class="relative h-10">
			<!-- in-tune zone (±5¢) -->
			<div
				class="absolute inset-y-1 left-1/2 w-[10%] -translate-x-1/2 rounded-sm {inTune
					? 'bg-emerald-600/15'
					: 'bg-panel-2/60'}"
			></div>
			<!-- ticks -->
			{#each TICKS as t (t)}
				<div
					class="absolute bottom-1 w-px {t === 0
						? 'top-1 bg-ink-soft'
						: t % 20 === 0
							? 'top-3 bg-border-strong'
							: 'top-4 bg-border'}"
					style="left: {50 + t}%"
				></div>
			{/each}
			<!-- needle -->
			{#if hasPitch}
				<div
					class="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full transition-[left] duration-100 ease-out {inTune
						? 'bg-emerald-600'
						: 'bg-ink'}"
					style="left: {needlePct}%"
				></div>
			{/if}
		</div>
		<div class="flex items-baseline justify-between text-[11px] text-text-muted tabular-nums">
			<span>♭</span>
			<span class="min-w-0 truncate">
				{#if hasPitch}
					{tuner.freq.toFixed(1)} Hz · {cents >= 0 ? '+' : ''}{Math.round(cents)}¢
				{:else}
					Listening
				{/if}
			</span>
			<span>♯</span>
		</div>
	{/if}
</div>
