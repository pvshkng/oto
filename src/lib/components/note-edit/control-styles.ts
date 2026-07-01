// Shared button looks for the note-edit controls (duration/voice/beat/
// effects). EditPanel (mobile toolbar, "loose") and NotePropertiesPanel
// (desktop sidebar, "dense") use slightly different sizing — encoded here as
// a `dense` variant so both hosts share one definition instead of two nearly
// -identical hand-written CSS blocks.
import { tv } from 'tailwind-variants';

const GRADIENT = '[background:linear-gradient(to_bottom,#ffffff,#f5f5f4)]';

export const ctlStyle = tv({
	base: `inline-flex items-center justify-center border border-border-strong ${GRADIENT} rounded-legacy-xs font-semibold text-ink cursor-pointer`,
	variants: {
		dense: {
			true: 'h-[34px] min-w-[34px] px-2 text-[13px]',
			false: 'h-9 min-w-[34px] flex-none px-[9px] text-sm max-[720px]:h-10 max-[720px]:min-w-[38px]'
		}
	}
});

export const fxStyle = tv({
	base: `inline-flex items-center justify-center border border-border-strong ${GRADIENT} rounded-legacy-xs font-semibold text-ink cursor-pointer disabled:cursor-not-allowed disabled:opacity-40`,
	variants: {
		dense: {
			true: 'h-[34px] text-[12px]',
			false: 'h-9 min-w-[34px] flex-none px-[9px] text-sm max-[720px]:h-10 max-[720px]:min-w-[38px]'
		}
	}
});
