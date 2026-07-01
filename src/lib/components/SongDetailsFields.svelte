<script lang="ts">
	// Title/composer/tempo/time-sig/key-sig fields shared by SongModal (mobile
	// drawer) and RightPanel's "song" mode (desktop panel).
	import { store } from '$lib/stores/score.svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import { TIME_SIGS } from '$lib/commands';
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

	const currentTs = $derived(`${store.score.timeSignature[0]}/${store.score.timeSignature[1]}`);
	const currentKey = $derived(
		KEY_SIGS.find((k) => k.fifths === store.score.keySignature) ?? KEY_SIGS[7]
	);
	let tsOpen = $state(false);
	let keyOpen = $state(false);

	function setTs(v: string) {
		const [n, d] = v.split('/').map(Number);
		store.setTimeSignature(n, d);
	}

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
<div class={cn(sectioned ? sectionClass : '', 'grid grid-cols-2 gap-3')}>
	<div class="grid gap-2">
		<Label for="song-tempo">Tempo (BPM)</Label>
		<Input
			id="song-tempo"
			type="number"
			min="20"
			max="400"
			value={store.score.tempo}
			onfocus={() => store.beginGesture()}
			onblur={() => store.endGesture()}
			oninput={(e) => store.setTempoLive(+e.currentTarget.value)}
		/>
	</div>
	<div class="grid gap-2">
		<Label>Time signature</Label>
		<Popover.Root bind:open={tsOpen}>
			<Popover.Trigger
				class="border-input bg-background hover:bg-accent flex h-9 w-full items-center justify-center rounded-md border text-sm font-semibold tabular-nums"
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
								? 'bg-primary text-primary-foreground'
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
<p
	class={sectioned ? 'px-3.5 py-2 text-xs text-muted-foreground' : 'text-muted-foreground text-xs'}
>
	Tip: change the time signature of a single bar from the staff right-click menu.
</p>
