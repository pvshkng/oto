// Shared look for every range-input fader in the mixer (track volume, EQ
// bands, master volume): a thin monochrome track with a circular thumb,
// consistent with the app's neutral palette.
export const MIXER_FADER_CLASS =
	'appearance-none [-webkit-appearance:none] h-1 rounded-[999px] bg-panel-2 cursor-pointer touch-none ' +
	'[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:[-webkit-appearance:none] [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-paper [&::-webkit-slider-thumb]:shadow-[var(--shadow-1)] ' +
	'[&::-moz-range-thumb]:w-[14px] [&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ink [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-paper';
