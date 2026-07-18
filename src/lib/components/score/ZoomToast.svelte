<script lang="ts">
	// Body of the score-zoom toast (see zoom-toast.ts). Reads the store directly
	// so the percentage and button states track live while the toast is open —
	// its buttons re-enter the same store methods that raised the toast.

	import { store } from '$lib/stores/score.svelte';
	import { MIN_ZOOM, MAX_ZOOM } from '$lib/stores/prefs.svelte';
	import MagnifyingGlassMinus from 'phosphor-svelte/lib/MagnifyingGlassMinus';
	import MagnifyingGlassPlus from 'phosphor-svelte/lib/MagnifyingGlassPlus';

	const pct = $derived(Math.round(store.scoreZoom * 100));

	// bg-none! beats the unlayered global button gradient in layout.css, which
	// otherwise outranks layered Tailwind utilities.
	const btn =
		'bg-none! p-1 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40';
</script>

<div class="flex w-full items-center justify-between gap-3 text-sm">
	<span class="whitespace-nowrap font-medium tabular-nums">Zoom {pct}%</span>
	<div class="flex items-center gap-1">
		<button
			type="button"
			class={btn}
			aria-label="Zoom out"
			disabled={store.scoreZoom <= MIN_ZOOM}
			onclick={() => store.zoomOut()}
		>
			<MagnifyingGlassMinus class="size-4" />
		</button>
		<button
			type="button"
			class={btn}
			aria-label="Zoom in"
			disabled={store.scoreZoom >= MAX_ZOOM}
			onclick={() => store.zoomIn()}
		>
			<MagnifyingGlassPlus class="size-4" />
		</button>
		<button
			type="button"
			class="{btn} px-1.5 text-xs"
			disabled={store.scoreZoom === 1}
			onclick={() => store.resetZoom()}
		>
			Reset
		</button>
	</div>
</div>
