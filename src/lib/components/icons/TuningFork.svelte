<script lang="ts">
	// Custom tuning-fork glyph for the chromatic tuner — phosphor has no fork, so
	// this is drawn to match the set: 256 viewBox, currentColor, ~16-unit strokes.
	// Two prongs joined by a U into a stem, a ball foot, and a small vibration
	// arc either side of the prongs so it still reads as "tuner" at 20 px.
	let { class: className = '', size = '1em' }: { class?: string; size?: number | string } =
		$props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 256 256"
	width={size}
	height={size}
	class={className}
	fill="none"
	stroke="currentColor"
	stroke-width="18"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<!-- prongs + connecting U -->
	<path d="M90 28v72a38 38 0 0 0 76 0V28" />
	<!-- stem -->
	<path d="M128 138v56" />
	<!-- ball foot -->
	<circle cx="128" cy="216" r="13" fill="currentColor" stroke="none" />
	<!-- vibration arcs -->
	<path d="M48 52c-8 14-8 34 0 48" />
	<path d="M208 52c8 14 8 34 0 48" />
</svg>
