<script lang="ts">
	// Per-track instrument & notation settings. A right-hand Drawer that edits an
	// existing track live: every change (name, instrument, tuning, capo,
	// transpose, notation views, colour) is applied to the store immediately —
	// there is no save/cancel step. Instrument and tuning use a Popover + Command
	// combobox (the shadcn combobox pattern).

	import { store } from '$lib/stores/score.svelte';
	import * as Drawer from '$lib/components/ui/drawer';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import { INSTRUMENTS, presetFor, type InstrumentPreset } from '$lib/oto/instruments';
	import { TUNINGS } from '$lib/oto/pitch';
	import { TRACK_COLOR_SWATCHES } from '$lib/oto/format';
	import Check from 'phosphor-svelte/lib/Check';
	import CaretUpDown from 'phosphor-svelte/lib/CaretUpDown';
	import Trash from 'phosphor-svelte/lib/Trash';

	let { open = $bindable(false), index = -1 }: { open: boolean; index?: number } = $props();

	const TUNING_NAMES = Object.keys(TUNINGS);

	let instOpen = $state(false);
	let tuneOpen = $state(false);

	const track = $derived(store.score.tracks[index]);
	const selectedPreset = $derived(
		track ? presetFor(track.instrument, track.tuning) : INSTRUMENTS[0]
	);
	const tuningName = $derived(track ? tuningNameFor(track.tuning) : TUNING_NAMES[0]);
	const instGroups = $derived([...new Set(INSTRUMENTS.map((p) => p.group))]);

	function tuningNameFor(tuning: string[]): string {
		for (const [n, t] of Object.entries(TUNINGS)) {
			if (t.length === tuning.length && t.every((x, i) => x === tuning[i])) return n;
		}
		return TUNING_NAMES[0];
	}

	function pickInstrument(p: InstrumentPreset) {
		store.updateTrack(index, { instrument: p.engine, kind: p.kind, tuning: [...p.tuning] });
		instOpen = false;
	}
	function pickTuning(n: string) {
		store.updateTrack(index, { tuning: [...(TUNINGS[n] ?? selectedPreset.tuning)] });
		tuneOpen = false;
	}
	function removeTrack() {
		if (store.score.tracks.length <= 1) return;
		store.removeTrack(index);
		open = false;
	}
</script>

<Drawer.Root bind:open direction="right">
	<Drawer.Content class="right-2 top-2 bottom-2 w-[92vw] max-w-sm rounded-2xl border outline-none">
		<Drawer.Header class="border-b">
			<Drawer.Title>Track control</Drawer.Title>
			<Drawer.Description>
				Adjust this track instrument, tuning and notation. Changes apply instantly.
			</Drawer.Description>
		</Drawer.Header>

		{#if track}
			<div class="flex flex-col gap-4 overflow-y-auto p-4">
				<div class="grid gap-2">
					<Label for="track-name">Name</Label>
					<Input
						id="track-name"
						value={track.name}
						placeholder="Track name"
						onchange={(e) => store.updateTrack(index, { name: e.currentTarget.value })}
					/>
				</div>

				<div class="grid gap-2">
					<Label>Instrument</Label>
					<Popover.Root bind:open={instOpen}>
						<Popover.Trigger
							class={cn(
								buttonVariants({ variant: 'outline' }),
								'w-full justify-between font-normal'
							)}
						>
							{selectedPreset.label}
							<CaretUpDown class="size-4 opacity-50" />
						</Popover.Trigger>
						<Popover.Content class="w-(--bits-popover-anchor-width) p-0">
							<Command.Root>
								<Command.Input placeholder="Search instruments..." />
								<Command.List>
									<Command.Empty>No instrument found.</Command.Empty>
									{#each instGroups as g (g)}
										<Command.Group heading={g}>
											{#each INSTRUMENTS.filter((p) => p.group === g) as p (p.value)}
												<Command.Item value={p.label} onSelect={() => pickInstrument(p)}>
													<Check
														class={cn(
															'size-4',
															selectedPreset.value === p.value ? 'opacity-100' : 'opacity-0'
														)}
													/>
													{p.label}
												</Command.Item>
											{/each}
										</Command.Group>
									{/each}
								</Command.List>
							</Command.Root>
						</Popover.Content>
					</Popover.Root>
				</div>

				<div class="grid gap-2">
					<Label>Tuning</Label>
					<Popover.Root bind:open={tuneOpen}>
						<Popover.Trigger
							class={cn(
								buttonVariants({ variant: 'outline' }),
								'w-full justify-between font-normal'
							)}
						>
							<span>{tuningName}</span>
							<span class="text-muted-foreground ml-2 truncate text-xs">
								{(TUNINGS[tuningName] ?? []).map((t) => t.replace(/\d/, '')).join(' ')}
							</span>
						</Popover.Trigger>
						<Popover.Content class="w-(--bits-popover-anchor-width) p-0">
							<Command.Root>
								<Command.Input placeholder="Search tunings..." />
								<Command.List>
									<Command.Empty>No tuning found.</Command.Empty>
									<Command.Group>
										{#each TUNING_NAMES as n (n)}
											<Command.Item value={n} onSelect={() => pickTuning(n)}>
												<Check
													class={cn('size-4', tuningName === n ? 'opacity-100' : 'opacity-0')}
												/>
												{n}
											</Command.Item>
										{/each}
									</Command.Group>
								</Command.List>
							</Command.Root>
						</Popover.Content>
					</Popover.Root>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-2">
						<Label for="capo">Capo</Label>
						<Input
							id="capo"
							type="number"
							min="0"
							max="12"
							value={track.capo}
							onchange={(e) => store.setCapo(index, e.currentTarget.valueAsNumber || 0)}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="transpose">Transpose</Label>
						<Input
							id="transpose"
							type="number"
							min="-24"
							max="24"
							value={track.transpose}
							onchange={(e) => store.setDisplayTranspose(index, e.currentTarget.valueAsNumber || 0)}
						/>
					</div>
				</div>

				<div class="grid gap-2">
					<Label>Notation</Label>
					<div class="bg-muted flex gap-1 rounded-md p-1">
						{#each [['standard', 'Standard'], ['tab', 'Tab'], ['rhythm', 'Rhythm']] as [key, label] (key)}
							{@const k = key as 'standard' | 'tab' | 'rhythm'}
							<button
								type="button"
								class={cn(
									'flex-1 rounded-sm px-2 py-1.5 text-sm font-medium transition-colors',
									track.view[k]
										? 'bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:text-foreground'
								)}
								onclick={() => store.toggleTrackView(index, k)}>{label}</button
							>
						{/each}
					</div>
				</div>

				<div class="grid gap-2">
					<Label>Colour</Label>
					<div class="flex flex-wrap gap-2">
						{#each TRACK_COLOR_SWATCHES as c (c.hex)}
							<button
								type="button"
								aria-label={`Colour ${c.name}`}
								title={c.name}
								class={cn(
									'size-7 rounded-full border-2 transition-all',
									track.color === c.hex ? 'border-foreground scale-110' : 'border-border'
								)}
								style="background:{c.hex}"
								onclick={() => store.updateTrack(index, { color: c.hex })}
							></button>
						{/each}
					</div>
				</div>

				<Button
					variant="outline"
					class="text-destructive hover:bg-destructive/10 hover:text-destructive justify-start"
					disabled={store.score.tracks.length <= 1}
					onclick={removeTrack}
				>
					<Trash class="size-4" /> Delete track
				</Button>
			</div>
		{/if}

		<Drawer.Footer class="flex-row justify-end border-t">
			<Drawer.Close class={buttonVariants({ variant: 'outline' })}>Done</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
