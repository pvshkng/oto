<script lang="ts">
	// Song configuration: title, composer, tempo and the starting time signature.
	// Opened from the bottom bar cog or the score title.

	import { store } from '$lib/stores/score.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Popover from '$lib/components/ui/popover';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';

	const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'];
	const currentTs = $derived(`${store.score.timeSignature[0]}/${store.score.timeSignature[1]}`);
	let tsOpen = $state(false);
	function setTs(v: string) {
		const [n, d] = v.split('/').map(Number);
		store.setTimeSignature(n, d);
	}
</script>

<Dialog.Root bind:open={store.songModalOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Title>Song details</Dialog.Title>
		<Dialog.Description>Title, composer, tempo and starting time signature.</Dialog.Description>

		<div class="grid gap-4 py-2">
			<div class="grid gap-2">
				<Label for="song-title">Title</Label>
				<Input
					id="song-title"
					value={store.score.title}
					placeholder="Untitled Score"
					oninput={(e) => store.setTitle(e.currentTarget.value)}
				/>
			</div>
			<div class="grid gap-2">
				<Label for="song-artist">Composer / artist</Label>
				<Input
					id="song-artist"
					value={store.score.artist}
					placeholder="Unknown"
					oninput={(e) => store.setArtist(e.currentTarget.value)}
				/>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-2">
					<Label for="song-tempo">Tempo (BPM)</Label>
					<Input
						id="song-tempo"
						type="number"
						min="20"
						max="400"
						value={store.score.tempo}
						oninput={(e) => store.setTempo(+e.currentTarget.value)}
					/>
				</div>
				<div class="grid gap-2">
					<Label>Time signature</Label>
					<Popover.Root bind:open={tsOpen}>
						<Popover.Trigger
							class="border-input bg-background hover:bg-accent flex h-9 items-center justify-center rounded-md border text-sm font-semibold tabular-nums"
						>
							{currentTs}
						</Popover.Trigger>
						<Popover.Content class="w-32 p-1">
							<div class="grid grid-cols-2 gap-1">
								{#each TIME_SIGS as t (t)}
									<button
										class={cn(
											'rounded-sm px-2 py-1.5 text-sm font-semibold tabular-nums',
											currentTs === t
												? 'bg-primary text-primary-foreground'
												: 'hover:bg-accent text-foreground'
										)}
										onclick={() => {
											setTs(t);
											tsOpen = false;
										}}>{t}</button
									>
								{/each}
							</div>
						</Popover.Content>
					</Popover.Root>
				</div>
			</div>
			<p class="text-muted-foreground text-xs">
				Tip: change the time signature of a single bar from the staff right-click menu.
			</p>
		</div>
	</Dialog.Content>
</Dialog.Root>
