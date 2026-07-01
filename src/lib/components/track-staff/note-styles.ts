// Shared Tailwind variant maps for the notehead/dead-head/fret-label looks
// that depend on multiple independent flags (voice 2, hollow duration,
// ghost note, muted). Values mirror the exact CSS cascade result of the
// pre-Tailwind rules 1:1 (verified combination by combination), not just
// each rule in isolation.
import { tv } from 'tailwind-variants';

export const noteheadStyle = tv({
	base: 'fill-[#18181b]',
	variants: {
		v2: { true: '', false: '' },
		hollow: { true: '[stroke-width:1.6]', false: '' },
		ghost: { true: 'opacity-[0.35]', false: '' }
	},
	compoundVariants: [
		{ v2: true, hollow: false, class: 'fill-[#71717a]' },
		{ v2: false, hollow: true, class: 'fill-white stroke-[#18181b]' },
		{ v2: true, hollow: true, class: 'fill-white stroke-[#71717a]' }
	]
});

export const deadHeadStyle = tv({
	base: 'fill-[#18181b] text-[13px] font-bold [text-anchor:middle]',
	variants: {
		v2: { true: 'fill-[#71717a]' }
	}
});

export const fretStyle = tv({
	base: '[font:600_12px_ui-monospace,monospace] [text-anchor:middle]',
	variants: {
		mutedNote: { true: '' },
		v2: { true: '' }
	},
	compoundVariants: [
		{ mutedNote: false, v2: false, class: 'fill-[#18181b]' },
		{ mutedNote: true, v2: false, class: 'fill-[#a1a1aa]' },
		{ mutedNote: false, v2: true, class: 'fill-[#71717a]' },
		{ mutedNote: true, v2: true, class: 'fill-[#71717a]' }
	]
});
