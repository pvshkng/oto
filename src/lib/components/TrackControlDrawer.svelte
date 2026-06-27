<script lang="ts">
	// Track control panel. A shadcn Drawer that encapsulates every per-track
	// setting; reused for both adding a new track (committed on confirm) and
	// editing an existing one. Instrument and tuning use a Popover + Command
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
	import Check from 'phosphor-svelte/lib/Check';
	import CaretUpDown from 'phosphor-svelte/lib/CaretUpDown';
	import Trash from 'phosphor-svelte/lib/Trash';

	let {
		open = $bindable(false),
		mode = 'add',
		index = -1
	}: { open: boolean; mode?: 'add' | 'edit'; index?: number } = $props();

	const PALETTE = ['#404040', '#525252', '#737373', '#a3a3a3', '#262626', '#8c8c8c', '#d4d4d4'];
	const TUNING_NAMES = Object.keys(TUNINGS);

	let name = $state('');
	let instrument = $state('electric');
	let tuningName = $state('Guitar Standard');
	let capo = $state(0);
	let transpose = $state(0);
	let color = $state(PALETTE[0]);
	let view = $state({ standard: true, tab: true, rhythm: false });

	let instOpen = $state(false);
	let tuneOpen = $state(false);

	function tuningNameFor(tuning: string[]): string {
		for (const [n, t] of Object.entries(TUNINGS)) {
			if (t.length === tuning.length && t.every((x, i) => x === tuning[i])) return n;
		}
		return TUNING_NAMES[0];
	}

	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			if (mode === 'edit' && store.score.tracks[index]) {
				const t = store.score.tracks[index];
				name = t.name;
				instrument = presetFor(t.instrument, t.tuning).value;
				tuningName = tuningNameFor(t.tuning);
				capo = t.capo;
				transpose = t.transpose;
				color = PALETTE.includes(t.color) ? t.color : PALETTE[0];
				view = { ...t.view };
			} else {
				const n = store.score.tracks.length + 1;
				const p = INSTRUMENTS[0];
				name = `Track ${n}`;
				instrument = p.value;
				tuningName = tuningNameFor(p.tuning);
				capo = 0;
				transpose = 0;
				color = PALETTE[(n - 1) % PALETTE.length];
				view = { standard: true, tab: true, rhythm: false };
			}
		}
		wasOpen = open;
	});

	const selectedPreset = $derived(
		INSTRUMENTS.find((p) => p.value === instrument) ?? INSTRUMENTS[0]
	);
	const instGroups = $derived([...new Set(INSTRUMENTS.map((p) => p.group))]);

	function pickInstrument(p: InstrumentPreset) {
		instrument = p.value;
		tuningName = tuningNameFor(p.tuning);
		instOpen = false;
	}
	function toggleView(key: 'standard' | 'tab' | 'rhythm') {
		const next = { ...view, [key]: !view[key] };
		if (!next.standard && !next.tab && !next.rhythm) return;
		view = next;
	}
	function confirm() {
		const tuning = [...(TUNINGS[tuningName] ?? selectedPreset.tuning)];
		const patch = {
			name: name.trim() || 'Untitled',
			instrument: selectedPreset.engine,
			kind: selectedPreset.kind,
			tuning,
			capo,
			transpose,
			color,
			view: { ...view }
		};
		if (mode === 'edit' && store.score.tracks[index]) store.updateTrack(index, patch);
		else store.addTrack(patch);
		open = false;
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
			<Drawer.Title>{mode === 'edit' ? 'Track control' : 'New track'}</Drawer.Title>
			<Drawer.Description>
				{mode === 'edit'
					? 'Adjust this track instrument, tuning and notation.'
					: 'Configure the instrument before adding it.'}
			</Drawer.Description>
		</Drawer.Header>

		<div class="flex flex-col gap-4 overflow-y-auto p-4">
			<div class="grid gap-2">
				<Label for="track-name">Name</Label>
				<Input id="track-name" bind:value={name} placeholder="Track name" />
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
													class={cn('size-4', instrument === p.value ? 'opacity-100' : 'opacity-0')}
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
										<Command.Item
											value={n}
											onSelect={() => {
												tuningName = n;
												tuneOpen = false;
											}}
										>
											<Check class={cn('size-4', tuningName === n ? 'opacity-100' : 'opacity-0')} />
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
					<Input id="capo" type="number" min="0" max="12" bind:value={capo} />
				</div>
				<div class="grid gap-2">
					<Label for="transpose">Transpose</Label>
					<Input id="transpose" type="number" min="-24" max="24" bind:value={transpose} />
				</div>
			</div>

			<div class="grid gap-2">
				<Label>Notation</Label>
				<div class="bg-muted flex gap-1 rounded-md p-1">
					{#each [['standard', 'Standard'], ['tab', 'Tab'], ['rhythm', 'Rhythm']] as [key, label] (key)}
						<button
							type="button"
							class={cn(
								'flex-1 rounded-sm px-2 py-1.5 text-sm font-medium transition-colors',
								view[key as 'standard' | 'tab' | 'rhythm']
									? 'bg-primary text-primary-foreground'
									: 'text-muted-foreground hover:text-foreground'
							)}
							onclick={() => toggleView(key as 'standard' | 'tab' | 'rhythm')}>{label}</button
						>
					{/each}
				</div>
			</div>

			<div class="grid gap-2">
				<Label>Colour</Label>
				<div class="flex flex-wrap gap-2">
					{#each PALETTE as c, ci (ci)}
						<button
							type="button"
							aria-label={`Colour ${c}`}
							class={cn(
								'size-7 rounded-full border-2 transition-all',
								color === c ? 'border-foreground scale-110' : 'border-border'
							)}
							style="background:{c}"
							onclick={() => (color = c)}
						></button>
					{/each}
				</div>
			</div>

			{#if mode === 'edit'}
				<Button
					variant="outline"
					class="text-destructive hover:bg-destructive/10 hover:text-destructive justify-start"
					disabled={store.score.tracks.length <= 1}
					onclick={removeTrack}
				>
					<Trash class="size-4" /> Delete track
				</Button>
			{/if}
		</div>

		<Drawer.Footer class="flex-row justify-end border-t">
			<Drawer.Close class={buttonVariants({ variant: 'outline' })}>Cancel</Drawer.Close>
			<Button onclick={confirm}>{mode === 'edit' ? 'Save changes' : 'Add track'}</Button>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
