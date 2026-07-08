<script lang="ts">
	// Per-bar mid-song tempo change popover, shared by EditPanel and
	// NotePropertiesPanel (same hosting contract as BarTimeSigPicker). The
	// content is a compact version of the master tempo dialog: − stepper, the
	// bar's BPM (falling back to the base tempo when the bar has no change) and
	// a + stepper, plus a small reset that removes the change again.
	import { store } from '$lib/stores/score.svelte';
	import { reflectTempoChange } from '$lib/audio/playback';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { GLYPH } from '$lib/notation/glyphs';
	import { cn } from '$lib/utils';
	import Minus from 'phosphor-svelte/lib/Minus';
	import Plus from 'phosphor-svelte/lib/Plus';
	import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';

	let { side }: { side: 'top' | 'right' } = $props();

	const MIN = 20;
	const MAX = 400;

	const mi = $derived(store.cursor.measure);
	const hasChange = $derived(store.currentMeasure?.tempo != null);
	/** BPM shown/edited: this bar's tempo change, or the base tempo when none. */
	const shown = $derived(store.currentMeasure?.tempo ?? store.score.tempo);

	function step(delta: number) {
		store.setMeasureTempo(mi, shown + delta);
		// Apply immediately, even mid-playback, instead of waiting for the next play().
		reflectTempoChange();
	}

	function reset() {
		store.clearMeasureTempo(mi);
		reflectTempoChange();
	}
</script>

<Popover.Root>
	<Popover.Trigger
		class={cn(
			'border-input bg-background hover:bg-accent text-foreground inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-bold tabular-nums',
			hasChange && 'sunk'
		)}
		title="Tempo change on this bar"
		aria-label="Tempo change on this bar"
	>
		<span class="[font-family:'Bravura',serif] text-[15px] leading-none"
			>{GLYPH.metNoteQuarterUp}</span
		>
		{shown}
	</Popover.Trigger>
	<Popover.Content {side} class="w-auto p-3" sideOffset={6}>
		<div class="flex flex-col items-center gap-2">
			<div class="flex items-center gap-3">
				<Button
					variant="outline"
					size="icon"
					class="size-8 shrink-0 rounded-full"
					aria-label="Decrease bar tempo"
					disabled={shown <= MIN}
					onclick={() => step(-1)}
				>
					<Minus class="size-4" />
				</Button>

				<div class="flex flex-col items-center">
					<span class="text-foreground text-3xl leading-none font-bold tabular-nums">{shown}</span>
					<span class="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase"
						>BPM</span
					>
				</div>

				<Button
					variant="outline"
					size="icon"
					class="size-8 shrink-0 rounded-full"
					aria-label="Increase bar tempo"
					disabled={shown >= MAX}
					onclick={() => step(1)}
				>
					<Plus class="size-4" />
				</Button>
			</div>

			<button
				class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
				disabled={!hasChange}
				onclick={reset}
			>
				<ArrowCounterClockwise class="size-3.5" />
				Reset to base tempo
			</button>
		</div>
	</Popover.Content>
</Popover.Root>
