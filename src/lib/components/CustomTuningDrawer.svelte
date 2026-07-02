<script lang="ts">
	// Custom tuning editor: pick an exact pitch for every string, then choose
	// whether existing notes should keep their sound (frets shift to match) or
	// keep their fret numbers (so they sound different after retuning).

	import { store } from '$lib/stores/score.svelte';
	import { noteToMidi, NOTE_NAMES } from '$lib/oto/pitch';
	import * as Drawer from '$lib/components/ui/drawer';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	let { open = $bindable(false), index = -1 }: { open: boolean; index?: number } = $props();

	const PITCH_CLASSES = NOTE_NAMES;

	const track = $derived(store.score.tracks[index]);

	let pitches = $state<string[]>([]);
	let octaves = $state<number[]>([]);
	let confirmOpen = $state(false);

	// Reset the working copy from the track's current tuning each time the
	// drawer opens, so re-opening after Cancel doesn't carry over edits. Goes
	// through MIDI rather than parsing the note string directly so a flat
	// spelling (e.g. "Eb3") still lands on a valid PITCH_CLASSES option.
	$effect(() => {
		if (open && track) {
			const midis = track.tuning.map(noteToMidi);
			pitches = midis.map((m) => NOTE_NAMES[((m % 12) + 12) % 12]);
			octaves = midis.map((m) => Math.floor(m / 12) - 1);
		}
	});

	const newTuning = $derived(pitches.map((p, i) => `${p}${octaves[i] ?? 4}`));

	// Guard against the degenerate case of every string sharing the exact same
	// pitch — technically valid data but not a playable tuning (no distinct
	// strings left to sound).
	const allSamePitch = $derived(newTuning.length > 1 && newTuning.every((t) => t === newTuning[0]));

	function stringLabel(i: number, total: number): string {
		if (i === 0) return 'Highest string';
		if (i === total - 1) return 'Lowest string';
		return `String ${i + 1}`;
	}

	function stepOctave(i: number, delta: number) {
		octaves[i] = Math.max(0, Math.min(7, (octaves[i] ?? 4) + delta));
	}

	function apply() {
		confirmOpen = true;
	}

	function confirm(mode: 'transpose' | 'keep') {
		store.retune(index, newTuning, mode);
		confirmOpen = false;
		open = false;
	}
</script>

{#snippet tuningFields()}
	{#if track}
		<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
			{#each track.tuning as _, i (i)}
				<div class="flex items-center gap-3">
					<span class="text-muted-foreground w-28 shrink-0 text-sm font-medium">
						{stringLabel(i, track.tuning.length)}
					</span>
					<select
						class="border-input bg-background text-foreground h-9 flex-1 rounded-md border px-2 text-sm font-semibold"
						bind:value={pitches[i]}
						aria-label={`${stringLabel(i, track.tuning.length)} pitch`}
					>
						{#each PITCH_CLASSES as p (p)}
							<option value={p}>{p}</option>
						{/each}
					</select>
					<div class="flex items-stretch">
						<Button
							variant="outline"
							size="icon"
							class="size-9 rounded-r-none"
							aria-label="Lower octave"
							disabled={(octaves[i] ?? 4) <= 0}
							onclick={() => stepOctave(i, -1)}>−</Button
						>
						<span
							class="border-input bg-background flex h-9 w-9 items-center justify-center border-y text-sm font-bold tabular-nums"
						>
							{octaves[i] ?? 4}
						</span>
						<Button
							variant="outline"
							size="icon"
							class="size-9 rounded-l-none"
							aria-label="Raise octave"
							disabled={(octaves[i] ?? 4) >= 7}
							onclick={() => stepOctave(i, 1)}>+</Button
						>
					</div>
				</div>
			{/each}

			{#if allSamePitch}
				<p class="text-destructive text-sm">
					Every string is tuned to the same pitch — pick at least one different note.
				</p>
			{/if}
		</div>
	{/if}
{/snippet}

{#if store.isDesktop}
	<Dialog.Root bind:open>
		<Dialog.Content class="flex max-h-[85vh] flex-col sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>Custom tuning</Dialog.Title>
				<Dialog.Description>Set the exact pitch of every string.</Dialog.Description>
			</Dialog.Header>

			{@render tuningFields()}

			<Dialog.Footer>
				<Dialog.Close
					class="border-input bg-background hover:bg-accent inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium"
				>
					Cancel
				</Dialog.Close>
				<Button onclick={apply} disabled={allSamePitch}>Apply tuning</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open direction="bottom">
		<Drawer.Content class="mx-auto flex w-full max-w-md flex-col rounded-t-2xl outline-none">
			<Drawer.Header class="border-b">
				<Drawer.Title>Custom tuning</Drawer.Title>
				<Drawer.Description>Set the exact pitch of every string.</Drawer.Description>
			</Drawer.Header>

			{@render tuningFields()}

			<Drawer.Footer class="flex-row justify-end gap-2 border-t">
				<Drawer.Close
					class="border-input bg-background hover:bg-accent inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium"
				>
					Cancel
				</Drawer.Close>
				<Button onclick={apply} disabled={allSamePitch}>Apply tuning</Button>
			</Drawer.Footer>
		</Drawer.Content>
	</Drawer.Root>
{/if}

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Content showCloseButton={false} class="max-w-sm">
		<Dialog.Title>Transpose or keep the current notes?</Dialog.Title>
		<Dialog.Description>
			You're changing this track's tuning. Transpose shifts every fret so the existing notes still
			sound the same. Keep leaves the fret numbers untouched, so the same tab will sound different.
		</Dialog.Description>
		<div class="mt-2 flex flex-col gap-2">
			<Button onclick={() => confirm('transpose')}>Transpose (keep the sound)</Button>
			<Button variant="outline" onclick={() => confirm('keep')}>Keep frets (sound changes)</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
