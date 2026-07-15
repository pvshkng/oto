// Instrument catalogue used by the track configuration combobox.
//
// Each preset maps a human-facing instrument to one of the audio engine's
// voice names plus a sensible default tuning/kind so that picking, say,
// "Bass" also retunes the track. Grouped so the combobox can show headings
// and filter by name.

import { TUNINGS } from './pitch';
import type { TrackKind } from './types';

/** General MIDI program per engine voice. All of these are well covered by
 *  the MuseScore General soundfont the app plays through. */
export const ENGINE_PROGRAMS: Record<string, number> = {
	piano: 0, // Acoustic Grand Piano
	epiano: 4, // Electric Piano 1
	organ: 16, // Drawbar Organ
	nylon: 24, // Acoustic Guitar (nylon)
	acoustic: 25, // Acoustic Guitar (steel)
	jazz: 26, // Electric Guitar (jazz)
	clean: 27, // Electric Guitar (clean)
	muted: 28, // Electric Guitar (muted)
	electric: 29, // Overdriven Guitar
	distortion: 30, // Distortion Guitar
	'acoustic-bass': 32, // Acoustic Bass
	bass: 33, // Electric Bass (finger)
	'pick-bass': 34, // Electric Bass (pick)
	fretless: 35, // Fretless Bass
	slap: 36, // Slap Bass 1
	'synth-bass': 38, // Synth Bass 1
	banjo: 105, // Banjo
	synth: 81 // Lead 2 (sawtooth), the generic fallback voice
};

/**
 * Closest engine voice for a GM program (used by the Guitar Pro importer).
 * Exact matches win; otherwise the program's GM family picks a neighbour,
 * and anything without a usable neighbour falls back to the generic synth.
 */
export function voiceForProgram(program: number, kind?: TrackKind): string {
	for (const [voice, p] of Object.entries(ENGINE_PROGRAMS)) {
		if (p === program) return voice;
	}
	if (program <= 7) return 'piano';
	if (program <= 15) return 'piano'; // chromatic percussion
	if (program <= 23) return 'organ'; // organs, accordion, harmonica
	if (program <= 31) return 'clean'; // remaining guitars (31 = harmonics)
	if (program <= 39) {
		if (program === 37) return 'slap';
		if (program === 39) return 'synth-bass';
		return 'bass';
	}
	if (kind === 'bass') return 'bass';
	// Plucked strings: harp, sitar, shamisen, koto, kalimba.
	if (program === 46 || program === 104 || (program >= 106 && program <= 108)) return 'nylon';
	return 'synth';
}

/** Program a voice's harmonic notes are voiced with. Electric guitars get GM
 *  "Guitar Harmonics" (an electric sample); everything else keeps its own
 *  program so acoustic harmonics don't chime like an electric. */
export function harmonicProgram(voice: string): number {
	const program = ENGINE_PROGRAMS[voice] ?? 27;
	return program >= 26 && program <= 30 ? 31 : program;
}

export interface InstrumentPreset {
	value: string; // unique id
	label: string;
	/** Audio engine voice, a key of ENGINE_PROGRAMS ('drums' uses the GM kit). */
	engine: string;
	group: string;
	kind: TrackKind;
	tuning: string[];
}

const GUITAR = TUNINGS['Guitar Standard'];
const BASS = TUNINGS['Bass Standard'];

export const INSTRUMENTS: InstrumentPreset[] = [
	{
		value: 'electric',
		label: 'Electric Guitar',
		engine: 'electric',
		group: 'Guitars',
		kind: 'guitar',
		tuning: GUITAR
	},
	{
		value: 'distortion',
		label: 'Distortion Guitar',
		engine: 'distortion',
		group: 'Guitars',
		kind: 'guitar',
		tuning: GUITAR
	},
	{
		value: 'clean',
		label: 'Clean Electric',
		engine: 'clean',
		group: 'Guitars',
		kind: 'guitar',
		tuning: GUITAR
	},
	{
		value: 'jazz',
		label: 'Jazz Electric',
		engine: 'jazz',
		group: 'Guitars',
		kind: 'guitar',
		tuning: GUITAR
	},
	{
		value: 'muted',
		label: 'Muted Electric',
		engine: 'muted',
		group: 'Guitars',
		kind: 'guitar',
		tuning: GUITAR
	},
	{
		value: 'acoustic',
		label: 'Acoustic Steel',
		engine: 'acoustic',
		group: 'Guitars',
		kind: 'guitar',
		tuning: GUITAR
	},
	{
		value: 'nylon',
		label: 'Nylon / Classical',
		engine: 'nylon',
		group: 'Guitars',
		kind: 'guitar',
		tuning: GUITAR
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
		tuning: BASS
	},
	{
		value: 'pick-bass',
		label: 'Picked Bass',
		engine: 'pick-bass',
		group: 'Bass',
		kind: 'bass',
		tuning: BASS
	},
	{
		value: 'fretless',
		label: 'Fretless Bass',
		engine: 'fretless',
		group: 'Bass',
		kind: 'bass',
		tuning: BASS
	},
	{
		value: 'slap',
		label: 'Slap Bass',
		engine: 'slap',
		group: 'Bass',
		kind: 'bass',
		tuning: BASS
	},
	{
		value: 'acoustic-bass',
		label: 'Upright Bass',
		engine: 'acoustic-bass',
		group: 'Bass',
		kind: 'bass',
		tuning: BASS
	},
	{
		value: 'synth-bass',
		label: 'Synth Bass',
		engine: 'synth-bass',
		group: 'Bass',
		kind: 'bass',
		tuning: BASS
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
		value: 'piano',
		label: 'Piano',
		engine: 'piano',
		group: 'Keys',
		kind: 'guitar',
		tuning: GUITAR
	},
	{
		value: 'epiano',
		label: 'Electric Piano',
		engine: 'epiano',
		group: 'Keys',
		kind: 'guitar',
		tuning: GUITAR
	},
	{
		value: 'organ',
		label: 'Organ',
		engine: 'organ',
		group: 'Keys',
		kind: 'guitar',
		tuning: GUITAR
	},
	{
		value: 'ukulele',
		label: 'Ukulele',
		engine: 'nylon',
		group: 'Other',
		kind: 'ukulele',
		tuning: TUNINGS['Ukulele']
	},
	{
		value: 'banjo',
		label: 'Banjo',
		engine: 'banjo',
		group: 'Other',
		kind: 'custom',
		tuning: TUNINGS['Banjo (Open G)']
	},
	{
		value: 'synth',
		label: 'Synth Lead',
		engine: 'synth',
		group: 'Other',
		kind: 'guitar',
		tuning: GUITAR
	},
	{
		value: 'drums',
		label: 'Drum Kit',
		engine: 'drums',
		group: 'Drums',
		kind: 'custom',
		tuning: TUNINGS['Drum Kit']
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
