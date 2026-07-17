<script lang="ts">
	// App settings, opened from the bottom bar cog. Currently just the playback
	// sound quality: which MuseScore General soundfont the engine plays through.
	// Picking a quality downloads it (with the loading overlay showing progress)
	// and swaps the synth presets; the file is then cached locally.
	import { store } from '$lib/stores/score.svelte';
	import { audio } from '$lib/audio/engine';
	import { stopPlayback } from '$lib/audio/playback';
	import { SOUNDFONTS, type SoundFontQuality } from '$lib/audio/soundfont';
	import * as Dialog from '$lib/components/ui/dialog';
	import { buttonVariants } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import Check from 'phosphor-svelte/lib/Check';

	let switching = $state(false);

	const OPTIONS: { id: SoundFontQuality; title: string }[] = [
		{ id: 'standard', title: 'Standard' },
		{ id: 'high', title: 'High quality' }
	];

	async function pick(q: SoundFontQuality) {
		if (switching || q === store.soundFontQuality) return;
		switching = true;
		if (store.isPlaying || store.isPaused) stopPlayback();
		store.soundFontQuality = q;
		await audio.switchSoundFont();
		switching = false;
	}
</script>

<Dialog.Root bind:open={store.settingsOpen}>
	<Dialog.Content floating class="max-w-md gap-4 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
		<Dialog.Header class="p-4 pb-0">
			<Dialog.Title>Settings</Dialog.Title>
			<Dialog.Description>App-wide preferences.</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-2 p-4 pt-0">
			<Label>Sound quality</Label>
			{#each OPTIONS as o (o.id)}
				<button
					type="button"
					class={cn(
						'border-input hover:bg-accent flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
						store.soundFontQuality === o.id && 'border-foreground/40',
						switching && 'pointer-events-none opacity-60'
					)}
					aria-pressed={store.soundFontQuality === o.id}
					onclick={() => pick(o.id)}
				>
					<span class="grid gap-0.5">
						<span>{o.title}</span>
						<span class="text-muted-foreground text-xs">
							{SOUNDFONTS[o.id].label} &middot; {SOUNDFONTS[o.id].sizeMB} MB download
						</span>
					</span>
					<Check class={cn('size-4 shrink-0', store.soundFontQuality === o.id || 'opacity-0')} />
				</button>
			{/each}
			<p class="text-muted-foreground text-xs">
				Downloaded once, then stored in this browser for offline reuse.
			</p>
		</div>

		<div class="flex flex-row justify-end p-4">
			<Dialog.Close class={buttonVariants({ variant: 'outline' })}>Done</Dialog.Close>
		</div>
	</Dialog.Content>
</Dialog.Root>
