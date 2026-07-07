<script lang="ts">
	import { store } from '$lib/stores/score.svelte';
	import { audio } from '$lib/audio/engine';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import { INSTRUMENTS, presetFor, type InstrumentPreset } from '$lib/oto/instruments';
	import { TUNINGS } from '$lib/oto/pitch';
	import { TRACK_COLOR_SWATCHES } from '$lib/oto/format';
	import CustomTuningDrawer from './CustomTuningDrawer.svelte';
	import Check from 'phosphor-svelte/lib/Check';
	import CaretUpDown from 'phosphor-svelte/lib/CaretUpDown';
	import Trash from 'phosphor-svelte/lib/Trash';
	import SlidersHorizontal from 'phosphor-svelte/lib/SlidersHorizontal';

	let { index, onClose = () => {} }: { index: number; onClose?: () => void } = $props();

	const TUNING_NAMES = Object.keys(TUNINGS);

	let instOpen = $state(false);
	let tuneOpen = $state(false);
	let customTuningOpen = $state(false);

	const track = $derived(store.score.tracks[index]);
	const selectedPreset = $derived(
		track ? presetFor(track.instrument, track.tuning) : INSTRUMENTS[0]
	);
	const tuningName = $derived(track ? tuningNameFor(track.tuning) : TUNING_NAMES[0]);
	const tuningLabel = $derived(tuningName ?? 'Custom');
	const tuningNotes = $derived(track ? track.tuning.map((t) => t.replace(/\d/, '')).join(' ') : '');
	const instGroups = $derived([...new Set(INSTRUMENTS.map((p) => p.group))]);

	function tuningNameFor(tuning: string[]): string | null {
		for (const [n, t] of Object.entries(TUNINGS)) {
			if (t.length === tuning.length && t.every((x, i) => x === tuning[i])) return n;
		}
		return null;
	}

	function pickInstrument(p: InstrumentPreset) {
		const patch: Partial<typeof track> = {
			instrument: p.engine,
			kind: p.kind,
			tuning: [...p.tuning]
		};
		// Standard notation of drum MIDIs is meaningless, so a drum kit shows just
		// the tab (one line per kit piece). Restore the normal staff+tab when
		// switching a drum track back to a pitched instrument.
		if (p.engine === 'drums') patch.view = { standard: false, tab: true, rhythm: false };
		else if (track?.instrument === 'drums')
			patch.view = { standard: true, tab: true, rhythm: false };
		store.updateTrack(index, patch);
		// Inside a user interaction → full engine boot is allowed here.
		audio.warmup();
		instOpen = false;
	}
	function pickTuning(n: string) {
		store.updateTrack(index, { tuning: [...(TUNINGS[n] ?? selectedPreset.tuning)] });
		tuneOpen = false;
	}
	function removeTrack() {
		if (store.score.tracks.length <= 1) return;
		store.removeTrack(index);
		onClose();
	}
</script>

{#if track}
	<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
		<div class="grid gap-2">
			<Label for="track-name-{index}">Name</Label>
			<Input
				id="track-name-{index}"
				value={track.name}
				placeholder="Track name"
				onfocus={() => store.beginGesture()}
				onblur={() => store.endGesture()}
				oninput={(e) => store.updateTrackLive(index, { name: e.currentTarget.value })}
			/>
		</div>

		<div class="grid gap-2">
			<Label>Instrument</Label>
			<Popover.Root bind:open={instOpen}>
				<Popover.Trigger
					class={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-between font-normal')}
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
					class={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-between font-normal')}
				>
					<span>{tuningLabel}</span>
					<span class="text-muted-foreground ml-2 truncate text-xs">
						{tuningNotes}
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
										<Check class={cn('size-4', tuningName === n ? 'opacity-100' : 'opacity-0')} />
										{n}
									</Command.Item>
								{/each}
							</Command.Group>
							<Command.Separator />
							<Command.Group>
								<Command.Item
									value="Custom"
									onSelect={() => {
										tuneOpen = false;
										customTuningOpen = true;
									}}
								>
									<SlidersHorizontal class="size-4" />
									Custom tuning…
								</Command.Item>
							</Command.Group>
						</Command.List>
					</Command.Root>
				</Popover.Content>
			</Popover.Root>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div class="grid gap-2">
				<Label for="capo-{index}">Capo</Label>
				<Input
					id="capo-{index}"
					type="number"
					min="0"
					max="12"
					value={track.capo}
					onfocus={() => store.beginGesture()}
					onblur={() => store.endGesture()}
					oninput={(e) => store.setCapoLive(index, e.currentTarget.valueAsNumber || 0)}
				/>
			</div>
			<div class="grid gap-2">
				<Label for="transpose-{index}">Transpose</Label>
				<Input
					id="transpose-{index}"
					type="number"
					min="-24"
					max="24"
					value={track.transpose}
					onfocus={() => store.beginGesture()}
					onblur={() => store.endGesture()}
					oninput={(e) => store.setDisplayTransposeLive(index, e.currentTarget.valueAsNumber || 0)}
				/>
			</div>
		</div>

		<div class="grid gap-2">
			<Label>Notation</Label>
			<div class="flex items-stretch">
				{#each [['standard', 'Standard'], ['tab', 'Tab'], ['rhythm', 'Rhythm']] as [key, label], i (key)}
					{@const k = key as 'standard' | 'tab' | 'rhythm'}
					<button
						type="button"
						class={cn(
							'border-input bg-background hover:bg-accent hover:text-accent-foreground flex-1 border px-2 py-1.5 text-sm font-medium transition-colors',
							i > 0 && 'border-l-0',
							i === 0 && 'rounded-l-md',
							i === 2 && 'rounded-r-md',
							track.view[k] ? 'sunk' : 'text-muted-foreground'
						)}
						aria-pressed={track.view[k]}
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

<CustomTuningDrawer bind:open={customTuningOpen} {index} />
