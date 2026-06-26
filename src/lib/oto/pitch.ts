// Pitch helpers: convert between scientific pitch notation, MIDI numbers and
// (string, fret) positions on a fretted instrument.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_INDEX: Record<string, number> = {
	C: 0,
	'C#': 1,
	DB: 1,
	D: 2,
	'D#': 3,
	EB: 3,
	E: 4,
	F: 5,
	'F#': 6,
	GB: 6,
	G: 7,
	'G#': 8,
	AB: 8,
	A: 9,
	'A#': 10,
	BB: 10,
	B: 11
};

/** "E4" / "Eb3" / "F#2" → MIDI number (E4 = 64). */
export function noteToMidi(note: string): number {
	const m = note.trim().match(/^([A-Ga-g][#b]?)(-?\d+)$/);
	if (!m) return 64;
	const idx = NOTE_INDEX[m[1].toUpperCase()] ?? 0;
	const octave = parseInt(m[2], 10);
	return (octave + 1) * 12 + idx;
}

/** MIDI number → "E4" style name. */
export function midiToNote(midi: number): string {
	const idx = ((midi % 12) + 12) % 12;
	const octave = Math.floor(midi / 12) - 1;
	return `${NOTE_NAMES[idx]}${octave}`;
}

/** Just the pitch class letter(s), e.g. 64 → "E". */
export function midiToPitchClass(midi: number): string {
	const idx = ((midi % 12) + 12) % 12;
	return NOTE_NAMES[idx];
}

/** MIDI for a fretted note, including capo, transpose and detune (semitones). */
export function frettedMidi(
	tuning: string[],
	stringIndex: number,
	fret: number,
	opts: { capo?: number; transpose?: number } = {}
): number {
	const open = noteToMidi(tuning[stringIndex] ?? 'E4');
	return open + fret + (opts.capo ?? 0) + (opts.transpose ?? 0);
}

/** Frequency in Hz from a MIDI number (A4 = 440). */
export function midiToFreq(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Convenience: (string,fret) → frequency. */
export function frettedFreq(
	tuning: string[],
	stringIndex: number,
	fret: number,
	opts: { capo?: number; transpose?: number } = {}
): number {
	return midiToFreq(frettedMidi(tuning, stringIndex, fret, opts));
}

/** Common preset tunings, high string first. */
export const TUNINGS: Record<string, string[]> = {
	'Guitar Standard': ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'],
	'Guitar Drop D': ['E4', 'B3', 'G3', 'D3', 'A2', 'D2'],
	'Guitar Half-Step Down': ['D#4', 'A#3', 'F#3', 'C#3', 'G#2', 'D#2'],
	'Guitar DADGAD': ['D4', 'A3', 'G3', 'D3', 'A2', 'D2'],
	'Bass Standard': ['G2', 'D2', 'A1', 'E1'],
	'Bass 5-String': ['G2', 'D2', 'A1', 'E1', 'B0'],
	Ukulele: ['A4', 'E4', 'C4', 'G4']
};

/** Standard pitch-class names for the note name labels. */
export { NOTE_NAMES };
