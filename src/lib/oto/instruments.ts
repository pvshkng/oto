// Instrument catalogue used by the track configuration combobox.
//
// Each preset maps a human-facing instrument to one of the audio engine's five
// synthesis voices (see audio/engine.ts) plus a sensible default tuning/kind so
// that picking, say, "Bass" also retunes the track. Grouped so the combobox can
// show headings and filter by name.

import { TUNINGS } from './pitch';
import type { TrackKind } from './types';

export interface InstrumentPreset {
	value: string; // unique id
	label: string;
	/** Audio engine voice: nylon | acoustic | electric | bass | clean. */
	engine: string;
	group: string;
	kind: TrackKind;
	tuning: string[];
}

export const INSTRUMENTS: InstrumentPreset[] = [
	{
		value: 'electric',
		label: 'Electric Guitar',
		engine: 'electric',
		group: 'Guitars',
		kind: 'guitar',
		tuning: TUNINGS['Guitar Standard']
	},
	{
		value: 'clean',
		label: 'Clean Electric',
		engine: 'clean',
		group: 'Guitars',
		kind: 'guitar',
		tuning: TUNINGS['Guitar Standard']
	},
	{
		value: 'acoustic',
		label: 'Acoustic Steel',
		engine: 'acoustic',
		group: 'Guitars',
		kind: 'guitar',
		tuning: TUNINGS['Guitar Standard']
	},
	{
		value: 'nylon',
		label: 'Nylon / Classical',
		engine: 'nylon',
		group: 'Guitars',
		kind: 'guitar',
		tuning: TUNINGS['Guitar Standard']
	},
	{
		value: 'electric-dropd',
		label: 'Electric (Drop D)',
		engine: 'electric',
		group: 'Guitars',
		kind: 'guitar',
		tuning: TUNINGS['Guitar Drop D']
	},
	{
		value: 'bass',
		label: 'Bass Guitar',
		engine: 'bass',
		group: 'Bass',
		kind: 'bass',
		tuning: TUNINGS['Bass Standard']
	},
	{
		value: 'bass-5',
		label: 'Bass (5-String)',
		engine: 'bass',
		group: 'Bass',
		kind: 'bass',
		tuning: TUNINGS['Bass 5-String']
	},
	{
		value: 'ukulele',
		label: 'Ukulele',
		engine: 'nylon',
		group: 'Other',
		kind: 'ukulele',
		tuning: TUNINGS['Ukulele']
	}
];

/** Best-matching preset for an existing track's engine + tuning. */
export function presetFor(engine: string, tuning: string[]): InstrumentPreset {
	const exact = INSTRUMENTS.find(
		(p) =>
			p.engine === engine &&
			p.tuning.length === tuning.length &&
			p.tuning.every((n, i) => n === tuning[i])
	);
	if (exact) return exact;
	return INSTRUMENTS.find((p) => p.engine === engine) ?? INSTRUMENTS[0];
}
