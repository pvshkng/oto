<script lang="ts">
	// Chromatic tuner readout, shared by the desktop floating window and the
	// mobile modal. Owns the mic lifecycle: mounting starts the tuner (which
	// triggers the permission prompt on first use) and unmounting releases the
	// microphone, so the mic is only live while the tuner is on screen.
	import { onMount } from 'svelte';
	import { tuner } from '$lib/audio/tuner.svelte';
	import { midiToPitchClass } from '$lib/oto/pitch';
	import Spinner from './Spinner.svelte';
	import MicrophoneSlash from 'phosphor-svelte/lib/MicrophoneSlash';
	import Warning from 'phosphor-svelte/lib/Warning';

	onMount(() => {
		void tuner.start();
		return () => tuner.stop();
	});

	const hasPitch = $derived(tuner.status === 'listening' && tuner.midi >= 0);
	const pitchClass = $derived(hasPitch ? midiToPitchClass(tuner.midi) : '');
	const octave = $derived(hasPitch ? Math.floor(tuner.midi / 12) - 1 : 0);
	const cents = $derived(Math.max(-50, Math.min(50, tuner.cents)));
	const inTune = $derived(hasPitch && Math.abs(cents) <= 5);
	/** Needle position across the meter: −50…+50 cents → 0…100%. */
	const needlePct = $derived(50 + cents);

	const TICKS = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
</script>

<div class="flex flex-col gap-3 p-4">
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
