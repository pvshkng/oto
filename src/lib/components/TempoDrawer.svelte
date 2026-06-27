<script lang="ts">
	// BPM bottom drawer: a big tap-to-read number, +/- steppers and a slider
	// for fast scrubbing, replacing the old tempo popover.

	import { store } from '$lib/stores/score.svelte';
	import { audio, type MetronomeSound } from '$lib/audio/engine';
	import * as Drawer from '$lib/components/ui/drawer';
	import { Button } from '$lib/components/ui/button';
	import Minus from 'phosphor-svelte/lib/Minus';
	import Plus from 'phosphor-svelte/lib/Plus';

	let { open = $bindable(false) }: { open: boolean } = $props();

	const MIN = 20;
	const MAX = 400;

	const sounds: { id: MetronomeSound; label: string }[] = [
		{ id: 'click', label: 'Click' },
		{ id: 'beep', label: 'Beep' },
		{ id: 'wood', label: 'Wood' },
		{ id: 'bell', label: 'Bell' }
	];

	function step(delta: number) {
		store.setTempo(store.score.tempo + delta);
	}

	function pickSound(id: MetronomeSound) {
		store.metronomeSound = id;
		// Apply immediately, even mid-playback, instead of waiting for the next play().
		audio.setMetronomeSound(id);
		audio.previewMetronome();
	}
</script>

<Drawer.Root bind:open direction="bottom">
	<Drawer.Content class="mx-auto w-full max-w-md rounded-t-2xl border outline-none">
		<Drawer.Header>
			<Drawer.Title>Tempo</Drawer.Title>
			<Drawer.Description>Set the song's beats per minute.</Drawer.Description>
		</Drawer.Header>

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
					<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
						>BPM</span
					>
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
				oninput={(e) => store.setTempo(+e.currentTarget.value)}
				aria-label="Tempo slider"
			/>

			<div class="flex w-full flex-col items-center gap-2">
				<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
					Metronome sound
				</span>
				<div class="flex w-full gap-2" role="group" aria-label="Metronome sound">
					{#each sounds as s (s.id)}
						<Button
							variant={store.metronomeSound === s.id ? 'default' : 'outline'}
							size="sm"
							class="h-9 flex-1"
							aria-pressed={store.metronomeSound === s.id}
							onclick={() => pickSound(s.id)}
						>
							{s.label}
						</Button>
					{/each}
				</div>
			</div>
		</div>
	</Drawer.Content>
</Drawer.Root>
