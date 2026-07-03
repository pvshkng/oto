// General MIDI percussion map — the "Drum Kit" instrument's note vocabulary.
//
// Mirrors the drum panel in the reference chart: every kit piece is keyed by its
// GM percussion MIDI note and carries the label, the notehead used in drum
// notation, a synthesis `voice` (how the built-in kit approximates it until real
// audio is dropped in), and the sample file it plays. Real one-shot samples go in
// `static/samples/drums/<sample>`; while a file is missing the audio engine falls
// back to the synthesised `voice`.

export type DrumNotehead = 'normal' | 'x' | 'circle-x' | 'diamond' | 'triangle';

/** Synthesised approximation category, used when a piece's sample isn't present. */
export type DrumVoice =
	| 'kick'
	| 'snare'
	| 'tom'
	| 'hihat-closed'
	| 'hihat-open'
	| 'cymbal'
	| 'perc';

export interface DrumPiece {
	/** GM percussion MIDI note number. */
	midi: number;
	label: string;
	voice: DrumVoice;
	notehead: DrumNotehead;
	/** File under static/samples/drums/ (convention: `<midi>.mp3`). */
	sample: string;
}

function piece(
	midi: number,
	label: string,
	voice: DrumVoice,
	notehead: DrumNotehead = 'normal'
): DrumPiece {
	return { midi, label, voice, notehead, sample: `${midi}.mp3` };
}

/** Every kit piece from the reference chart, ordered by MIDI. */
export const DRUM_PIECES: DrumPiece[] = [
	piece(29, 'Ride (choke)', 'cymbal', 'x'),
	piece(30, 'Reverse Cymbal', 'cymbal', 'x'),
	piece(31, 'Snare (side stick)', 'snare', 'x'),
	piece(33, 'Metronome (hit)', 'perc'),
	piece(34, 'Metronome (bell)', 'perc', 'diamond'),
	piece(35, 'Kick', 'kick'),
	piece(36, 'Kick', 'kick'),
	piece(37, 'Snare (side stick)', 'snare', 'x'),
	piece(38, 'Snare (hit)', 'snare'),
	piece(39, 'Hand Clap', 'perc', 'x'),
	piece(40, 'Electric Snare', 'snare'),
	piece(41, 'Low Floor Tom', 'tom'),
	piece(42, 'Hi-Hat (closed)', 'hihat-closed', 'x'),
	piece(43, 'Very Low Tom', 'tom'),
	piece(44, 'Pedal Hi-Hat', 'hihat-closed', 'x'),
	piece(45, 'Low Tom', 'tom'),
	piece(46, 'Hi-Hat (open)', 'hihat-open', 'circle-x'),
	piece(47, 'Mid Tom', 'tom'),
	piece(48, 'High Tom', 'tom'),
	piece(49, 'Crash high', 'cymbal', 'x'),
	piece(50, 'High Floor Tom', 'tom'),
	piece(51, 'Ride (edge)', 'cymbal', 'x'),
	piece(52, 'China', 'cymbal', 'x'),
	piece(53, 'Ride (bell)', 'cymbal', 'diamond'),
	piece(55, 'Splash', 'cymbal', 'x'),
	piece(56, 'Cowbell medium', 'perc', 'triangle'),
	piece(57, 'Crash medium', 'cymbal', 'x'),
	piece(58, 'Vibraslap', 'perc', 'x'),
	piece(59, 'Ride (edge)', 'cymbal', 'x'),
	piece(60, 'Bongo high', 'perc'),
	piece(61, 'Bongo Low', 'perc'),
	piece(62, 'Conga high (mute)', 'perc'),
	piece(63, 'Conga high', 'perc'),
	piece(64, 'Conga low', 'perc'),
	piece(65, 'Timbale high', 'perc'),
	piece(66, 'Timbale low', 'perc'),
	piece(67, 'Agogo high', 'perc', 'triangle'),
	piece(68, 'Agogo low', 'perc', 'triangle'),
	piece(69, 'Cabasa', 'perc', 'x'),
	piece(70, 'Left Maraca', 'perc', 'x'),
	piece(71, 'Whistle high', 'perc', 'diamond'),
	piece(72, 'Whistle low', 'perc', 'diamond'),
	piece(73, 'Guiro', 'perc', 'x'),
	piece(74, 'Guiro scrap-return', 'perc', 'x'),
	piece(75, 'Claves', 'perc'),
	piece(76, 'Woodblock high', 'perc'),
	piece(77, 'Woodblock low', 'perc'),
	piece(78, 'Cuica (mute)', 'perc'),
	piece(79, 'Cuica (open)', 'perc'),
	piece(80, 'Triangle (mute)', 'perc', 'triangle'),
	piece(81, 'Tinkle Bell', 'perc', 'diamond'),
	piece(82, 'Shaker', 'perc', 'x'),
	piece(83, 'Jingle Bell', 'perc', 'diamond'),
	piece(84, 'Bell Tree', 'perc', 'diamond'),
	piece(85, 'Castanets', 'perc'),
	piece(86, 'Surdo', 'perc'),
	piece(87, 'Surdo (mute)', 'perc'),
	piece(91, 'Snare (rim shot)', 'snare', 'x'),
	piece(92, 'Hi-Hat (half)', 'hihat-open', 'x'),
	piece(93, 'Ride (edge)', 'cymbal', 'x'),
	piece(94, 'Ride (choke)', 'cymbal', 'x'),
	piece(95, 'Splash (choke)', 'cymbal', 'x'),
	piece(96, 'China (choke)', 'cymbal', 'x'),
	piece(98, 'Crash high (choke)', 'cymbal', 'x'),
	piece(99, 'Cowbell low', 'perc', 'triangle'),
	piece(100, 'Cowbell low (tip)', 'perc', 'triangle'),
	piece(101, 'Cowbell medium (tip)', 'perc', 'triangle'),
	piece(102, 'Cowbell high', 'perc', 'triangle'),
	piece(103, 'Cowbell high (tip)', 'perc', 'triangle'),
	piece(104, 'Bongo High (mute)', 'perc'),
	piece(105, 'Bongo Low (mute)', 'perc'),
	piece(106, 'Bongo High (slap)', 'perc'),
	piece(107, 'Bongo Low (slap)', 'perc'),
	piece(108, 'Conga high (slap)', 'perc'),
	piece(109, 'Conga low (mute)', 'perc'),
	piece(110, 'Conga low (slap)', 'perc'),
	piece(111, 'Tambourine (return)', 'perc', 'x'),
	piece(112, 'Tambourine (roll)', 'perc', 'x'),
	piece(113, 'Tambourine (hand)', 'perc', 'x'),
	piece(114, 'Grancassa', 'kick'),
	piece(115, 'Piatti', 'cymbal', 'x')
];

export const DRUM_BY_MIDI: Map<number, DrumPiece> = new Map(DRUM_PIECES.map((p) => [p.midi, p]));

/** Look up a kit piece by (rounded) MIDI note. */
export function drumForMidi(midi: number): DrumPiece | undefined {
	return DRUM_BY_MIDI.get(Math.round(midi));
}

/**
 * The lines of a default drum-kit track, ordered high → low to match a `tuning`
 * array (index 0 = top staff line). Each line is one GM piece; the track's tuning
 * uses these pieces' MIDI notes so entering a note on a line sounds that piece.
 */
export const DEFAULT_DRUM_KIT: DrumPiece[] = [49, 57, 42, 46, 38, 48, 45, 43, 36]
	.map((m) => DRUM_BY_MIDI.get(m))
	.filter((p): p is DrumPiece => p !== undefined);
