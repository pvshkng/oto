<script lang="ts">
	// Title/composer/key-sig fields shared by SongModal (mobile drawer) and
	// RightPanel's "song" mode (desktop panel).
	import { store } from '$lib/stores/score.svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import { KEY_SIGS } from '$lib/oto/types';

	let {
		// RightPanel divides each field group with a bordered, padded section
		// (matching its other modes); SongModal just stacks them with gaps.
		sectioned = false,
		// RightPanel's tighter "C / Am" vs SongModal's "C major / A minor" — a
		// pre-existing wording difference between the two hosts, kept as-is.
		compact = false
	}: {
		sectioned?: boolean;
		compact?: boolean;
	} = $props();

	const currentKey = $derived(
		KEY_SIGS.find((k) => k.fifths === store.score.keySignature) ?? KEY_SIGS[7]
	);
	let keyOpen = $state(false);

	const sectionClass = 'flex flex-col gap-2 border-b border-border px-3.5 py-3 last:border-b-0';
</script>

<div class={sectioned ? sectionClass : 'grid gap-2'}>
	<Label for="song-title">Title</Label>
	<Input
		id="song-title"
		value={store.score.title}
		placeholder="Untitled Score"
		onfocus={() => store.beginGesture()}
		onblur={() => store.endGesture()}
		oninput={(e) => store.setTitleLive(e.currentTarget.value)}
	/>
</div>
<div class={sectioned ? sectionClass : 'grid gap-2'}>
	<Label for="song-artist">Composer / artist</Label>
	<Input
		id="song-artist"
		value={store.score.artist}
		placeholder="Unknown"
		onfocus={() => store.beginGesture()}
		onblur={() => store.endGesture()}
		oninput={(e) => store.setArtistLive(e.currentTarget.value)}
	/>
</div>
<div class={sectioned ? sectionClass : 'grid gap-2'}>
	<Label>Key signature</Label>
	<Popover.Root bind:open={keyOpen}>
		<Popover.Trigger
			class="border-input bg-background hover:bg-accent flex h-9 w-full items-center justify-center rounded-md border text-sm font-semibold"
		>
			{#if compact}
				{currentKey.major} / {currentKey.minor}m
			{:else}
				{currentKey.major} major / {currentKey.minor} minor
			{/if}
		</Popover.Trigger>
		<Popover.Content class="w-56 p-1">
			<div class="grid grid-cols-3 gap-1">
				{#each KEY_SIGS as k (k.fifths)}
					<button
						class={cn(
							'rounded-sm px-2 py-1.5 text-sm font-semibold',
							currentKey.fifths === k.fifths
								? 'bg-primary text-primary-foreground [background-image:none!important]'
								: 'hover:bg-accent text-foreground'
						)}
						onclick={() => {
							store.setKeySignature(k.fifths);
							keyOpen = false;
						}}>{k.major}</button
					>
				{/each}
			</div>
		</Popover.Content>
	</Popover.Root>
</div>
<div class={sectioned ? sectionClass : 'grid gap-2'}>
	<Label for="song-page-view">Display</Label>
	<label
		class="border-none bg-none flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border px-3 text-sm"
		for="song-page-view"
	>
		<input
			id="song-page-view"
			type="checkbox"
			checked={store.pageView}
			onchange={(e) => (store.pageView = e.currentTarget.checked)}
		/>
		Page view
	</label>
</div>
