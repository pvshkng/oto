// Score → MIDI compilation for the alphaSynth playback engine.
//
// The whole piece is compiled into a single multi-channel MIDI file that
// alphaTab's alphaSynth (a SoundFont synthesizer running in a Web Worker and
// feeding an AudioWorklet) plays back off the main thread. Alongside the MIDI
// we emit tick tables (measure starts + one entry per beat of the primary
// voice) so the UI playhead and loop windows can be mapped between
// (measure, beat) positions and MIDI ticks.
//
// Overflow handling matches the old Tone engine: beats whose start time
// exceeds the bar capacity are dropped from the schedule.

import type * as at from '@coderline/alphatab';
import { frettedMidi } from '$lib/oto/pitch';
import { beatFraction, beatsCutoff } from '$lib/oto/duration';
import {
	DYNAMIC_VELOCITY,
	measureVoices,
	type OtoMeasure,
	type OtoScore,
	type OtoTrack
} from '$lib/oto/types';

export type MetronomeSound = 'click' | 'beep' | 'wood' | 'bell';

export const METRONOME_SOUNDS: { id: MetronomeSound; label: string }[] = [
	{ id: 'click', label: 'Click' },
	{ id: 'beep', label: 'Beep' },
	{ id: 'wood', label: 'Wood' },
	{ id: 'bell', label: 'Bell' }
];

/** Lazily import alphaTab exactly once (it's a ~1MB module, loaded on demand
 *  the same way the Guitar Pro importer does). */
let alphaTabModule: Promise<typeof at> | null = null;
export function loadAlphaTab(): Promise<typeof at> {
	alphaTabModule ??= import('@coderline/alphatab');
	return alphaTabModule;
}

/** MIDI ticks per quarter note (alphaTab's MidiFile default division). */
export const TICKS_PER_QUARTER = 960;
const WHOLE_NOTE_TICKS = TICKS_PER_QUARTER * 4;

// Channel plan. MIDI has 16 channels; alphaSynth reserves 15 for its built-in
// count-in click and channel 9 is the General MIDI percussion channel.
// 13 is kept free for one-off note previews (fretboard plucks) so a preview's
// program change can never corrupt a channel the song is using, and 14 carries
// the app metronome clicks so their volume/mute is independent of any track.
const PERCUSSION_CHANNEL = 9;
export const PREVIEW_CHANNEL = 13;
export const METRONOME_CHANNEL = 14;
const TRACK_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12];

// Pitch-bend setup, mirroring alphaTab's own generator: bend range is set to
// 16 semitones via RPN 0, so one semitone = 8192/16 = 512 wheel units.
const PITCH_WHEEL_CENTER = 8192;
const PITCH_BEND_RANGE_SEMITONES = 16;
const WHEEL_PER_SEMITONE = PITCH_WHEEL_CENTER / PITCH_BEND_RANGE_SEMITONES;

/** General MIDI program per oto engine voice. */
const GM_PROGRAMS: Record<string, number> = {
	nylon: 24, // Acoustic Guitar (nylon)
	acoustic: 25, // Acoustic Guitar (steel)
	clean: 27, // Electric Guitar (clean)
	electric: 29, // Overdriven Guitar
	bass: 33, // Electric Bass (finger)
	piano: 0 // Acoustic Grand Piano
};

/** GM "Guitar Harmonics" — the timbre harmonic notes are voiced with, on a
 *  companion channel so the track's own program is never touched mid-song. */
const GM_GUITAR_HARMONICS = 31;

// Natural harmonics: the tabbed fret is the node the string is touched at, and
// the note that rings is a fixed interval above the OPEN string — not the
// fretted pitch. Node → semitones above open; unlisted nodes fall back to the
// octave harmonic.
const NATURAL_HARMONIC_SEMITONES: Record<number, number> = {
	12: 12, // octave
	7: 19, // octave + fifth
	19: 19,
	5: 24, // two octaves
	24: 24,
	4: 28, // two octaves + major third
	9: 28,
	16: 28,
	3: 31 // two octaves + fifth
};

/** Timbre of each metronome click variant: a GM program + the key to strike. */
const METRONOME_VOICES: Record<MetronomeSound, { program: number; key: number }> = {
	click: { program: 115, key: 88 }, // Woodblock, high — classic click
	beep: { program: 80, key: 93 }, // Square lead, short high beep
	wood: { program: 115, key: 64 }, // Woodblock, low — rounder knock
	bell: { program: 112, key: 84 } // Tinkle Bell
};
const METRONOME_VELOCITY = 76; // ≈0.6, matching the old engine's click level
const VIBRATO_RATE = 5.5; // Hz — a natural guitar/voice wobble speed
const VIBRATO_DEPTH_SEMITONES = 0.18;

export interface BeatTick {
	tick: number;
	measure: number;
	beat: number;
}

export interface CompiledSong {
	midi: at.midi.MidiFile;
	/** Track id → MIDI channel the track's notes were written to. */
	channels: Map<string, number>;
	/** Track id → companion channel carrying the GM Guitar Harmonics program,
	 *  for tracks that contain harmonic notes. The engine mirrors the track's
	 *  volume/mute/solo onto it. */
	harmonicChannels: Map<string, number>;
	/** One entry per played beat of the primary track/voice (repeat passes
	 *  included), sorted by tick — drives the moving playhead. */
	beatTicks: BeatTick[];
	/** Start tick of each measure's first playthrough. */
	measureTicks: number[];
	/** Per measure: start tick of each primary-voice beat (first playthrough). */
	measureBeatTicks: number[][];
	totalTicks: number;
	/** Which click timbre was baked into the metronome channel. */
	metronomeSound: MetronomeSound;
}

function secondsToTicks(seconds: number, tempo: number): number {
	// 1 quarter = 60/tempo seconds = TICKS_PER_QUARTER ticks.
	return (seconds * tempo * TICKS_PER_QUARTER) / 60;
}

/** Structural flags (repeats/voltas) of a measure — they're kept in sync
 *  across tracks, so read from the first track that has the measure. */
function structuralMeasure(score: OtoScore, mi: number): OtoMeasure | undefined {
	for (const t of score.tracks) {
		const m = t.measures[mi];
		if (m) return m;
	}
	return undefined;
}

/**
 * Expand repeat barlines and volta brackets into the linear order the
 * measures actually play in. Pass 1 plays volta-1 bars and jumps back at an
 * end-repeat; pass 2 skips volta-1 bars and plays volta-2 bars, and so on
 * (repeatCount passes total, default 2). An end-repeat with no begin-repeat
 * rewinds to the bar after the previous repeated section (or bar 1).
 */
export function expandRepeats(score: OtoScore, measureCount: number): number[] {
	const order: number[] = [];
	// Runaway guard: malformed structure can't loop forever.
	const limit = Math.max(measureCount * 32, 1024);
	let i = 0;
	let repeatStartIdx = 0;
	let pass = 1;
	while (i < measureCount && order.length < limit) {
		const m = structuralMeasure(score, i);
		if (m?.repeatStart && i !== repeatStartIdx) {
			// Entering a new repeated section for the first time.
			repeatStartIdx = i;
			pass = 1;
		}
		if (m?.volta && m.volta !== pass) {
			i++;
			continue;
		}
		order.push(i);
		if (m?.repeatEnd) {
			const count = m.repeatCount ?? 2;
			if (pass < count) {
				pass++;
				i = repeatStartIdx;
				continue;
			}
			// Section finished — a later bare end-repeat rewinds to after it.
			pass = 1;
			repeatStartIdx = i + 1;
		} else if (m?.volta && !structuralMeasure(score, i + 1)?.volta) {
			// Walked off the end of the volta group (the final ending played
			// through) — the repeated section is finished.
			pass = 1;
			repeatStartIdx = i + 1;
		}
		i++;
	}
	return order;
}

/** The measure whose content a (possibly simile-marked) bar actually sounds:
 *  walk back past consecutive simile marks to the bar they all echo. */
function simileSource(track: OtoTrack, mi: number): OtoMeasure | undefined {
	let idx = mi;
	while (idx > 0 && track.measures[idx]?.simile) idx--;
	return track.measures[idx];
}

/** Identity of one scheduled note, for the tie tables below. */
function tieKey(ti: number, mi: number, vi: number, bi: number, string: number): string {
	return `${ti}:${mi}:${vi}:${bi}:${string}`;
}

interface TieInfo {
	/** Tied continuation notes — never scheduled (the origin rings through). */
	skip: Set<string>;
	/** Tie-chain origin → total sounding length from its onset, in whole-note
	 *  fractions (through every continuation, gaps included). */
	sustain: Map<string, number>;
}

/**
 * Precompute tie sustains: a note marked `tied` continues the most recent
 * note on the same string instead of restriking, so that origin must sound
 * until the last note of the tie chain ends. Walked in score order on a
 * linear timeline where each measure spans its time-signature capacity —
 * a tie stretching across a repeat jump keeps its score-order length.
 */
function computeTieSustains(score: OtoScore): TieInfo {
	const skip = new Set<string>();
	const sustain = new Map<string, number>();
	const measureCount = Math.max(...score.tracks.map((t) => t.measures.length), 0);
	const linStart: number[] = [];
	{
		let acc = 0;
		for (let mi = 0; mi < measureCount; mi++) {
			linStart.push(acc);
			const ts = score.tracks[0]?.measures[mi]?.timeSignature ?? score.timeSignature;
			acc += ts[0] / ts[1];
		}
	}
	score.tracks.forEach((track, ti) => {
		for (const vi of [0, 1]) {
			// Latest struck (non-tied) note per string — the chain's origin.
			const chain = new Map<number, { key: string; start: number }>();
			for (let mi = 0; mi < track.measures.length; mi++) {
				const measure = track.measures[mi];
				const content = measure.simile ? (simileSource(track, mi) ?? measure) : measure;
				const voice = vi === 0 ? content.beats : content.voice2;
				if (!voice) continue;
				let local = 0;
				for (let bi = 0; bi < voice.length; bi++) {
					const beat = voice[bi];
					const start = linStart[mi] + local;
					const frac = beatFraction(beat);
					for (const note of beat.notes) {
						const origin = note.tied ? chain.get(note.string) : undefined;
						if (origin) {
							skip.add(tieKey(ti, mi, vi, bi, note.string));
							sustain.set(origin.key, start + frac - origin.start);
						} else {
							// A dangling tied note (no earlier note on its string)
							// schedules like a normal strike.
							chain.set(note.string, { key: tieKey(ti, mi, vi, bi, note.string), start });
						}
					}
					local += frac;
				}
			}
		}
	});
	return { skip, sustain };
}

/** Channel for each track: drums share the GM percussion channel, pitched
 *  tracks get their own channel until the pool runs out (then they wrap). */
export function allocateChannels(tracks: OtoTrack[]): Map<string, number> {
	const channels = new Map<string, number>();
	let next = 0;
	for (const track of tracks) {
		if (track.instrument === 'drums') {
			channels.set(track.id, PERCUSSION_CHANNEL);
		} else {
			channels.set(track.id, TRACK_CHANNELS[next % TRACK_CHANNELS.length]);
			next++;
		}
	}
	return channels;
}

/** Companion Guitar-Harmonics channel for each pitched track that plays any
 *  harmonic note, drawn from the channels the main allocation left unused.
 *  When the pool is exhausted a track falls back to its own channel — the
 *  harmonic still sounds at the right pitch, just in the track's timbre. */
export function allocateHarmonicChannels(
	tracks: OtoTrack[],
	channels: Map<string, number>
): Map<string, number> {
	const used = new Set(channels.values());
	const free = TRACK_CHANNELS.filter((c) => !used.has(c));
	const harmonicChannels = new Map<string, number>();
	for (const track of tracks) {
		if (track.instrument === 'drums') continue;
		const hasHarmonic = track.measures.some((m) =>
			[...m.beats, ...(m.voice2 ?? [])].some((b) =>
				b.notes.some(
					(n) => n.techniques?.includes('harmonic') || n.techniques?.includes('artificial-harmonic')
				)
			)
		);
		if (!hasHarmonic) continue;
		harmonicChannels.set(track.id, free.shift() ?? channels.get(track.id)!);
	}
	return harmonicChannels;
}

/** Standard per-channel setup: pan, pitch-bend range (RPN 0 → 16 semitones)
 *  and the instrument program. Volume is intentionally NOT baked in — the
 *  engine drives it live via alphaSynth's channel mix API so faders stay
 *  audible mid-playback. */
function setupChannel(
	alphaTab: typeof at,
	handler: at.midi.AlphaSynthMidiFileHandler,
	channel: number,
	program: number,
	pan: number
) {
	const CC = alphaTab.midi.ControllerType;
	const panValue = Math.round(((Math.max(-1, Math.min(1, pan)) + 1) / 2) * 127);
	handler.addControlChange(0, 0, channel, CC.PanCoarse, panValue);
	handler.addControlChange(0, 0, channel, CC.RegisteredParameterFine, 0);
	handler.addControlChange(0, 0, channel, CC.RegisteredParameterCourse, 0);
	handler.addControlChange(0, 0, channel, CC.DataEntryFine, 0);
	handler.addControlChange(0, 0, channel, CC.DataEntryCoarse, PITCH_BEND_RANGE_SEMITONES);
	handler.addProgramChange(0, 0, channel, program);
}

/**
 * Compile the whole score into a playable MIDI file plus the tick lookup
 * tables used for the playhead and loop windows.
 */
export async function compileSong(
	score: OtoScore,
	metronomeSound: MetronomeSound
): Promise<CompiledSong> {
	const alphaTab = await loadAlphaTab();
	const midi = new alphaTab.midi.MidiFile();
	const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true);

	const channels = allocateChannels(score.tracks);
	// Set up each distinct channel once (tracks can share a channel — all drum
	// tracks live on the GM percussion channel). Every playing channel MUST get
	// a program change: alphaTab's synth produces NaN samples for a channel
	// whose preset was never selected, and one NaN channel silences the whole
	// mix. On channel 9 the program picks the drum kit (0 = standard GM kit).
	const configured = new Set<number>();
	for (const track of score.tracks) {
		const channel = channels.get(track.id)!;
		if (configured.has(channel)) continue;
		configured.add(channel);
		const program = channel === PERCUSSION_CHANNEL ? 0 : (GM_PROGRAMS[track.instrument] ?? 27);
		setupChannel(alphaTab, handler, channel, program, track.pan ?? 0);
	}
	const harmonicChannels = allocateHarmonicChannels(score.tracks, channels);
	for (const track of score.tracks) {
		const channel = harmonicChannels.get(track.id);
		// A pool-exhausted fallback maps to the track's own (already configured)
		// channel — leave its program alone.
		if (channel === undefined || configured.has(channel)) continue;
		configured.add(channel);
		setupChannel(alphaTab, handler, channel, GM_GUITAR_HARMONICS, track.pan ?? 0);
	}
	{
		const voice = METRONOME_VOICES[metronomeSound];
		setupChannel(alphaTab, handler, METRONOME_CHANNEL, voice.program, 0);
	}

	const measureCount = Math.max(...score.tracks.map((t) => t.measures.length), 0);
	// Repeats/voltas replay measures, so the playback timeline is the expanded
	// order — a measure can own several tick windows. The per-measure tables
	// keep only the first playthrough (loop windows and play-from-cursor are
	// expressed in measure indices); beatTicks covers every pass so the moving
	// playhead follows the jumps.
	const playOrder = expandRepeats(score, measureCount);
	const measureTicks: number[] = new Array(measureCount).fill(-1);
	const measureBeatTicks: number[][] = Array.from({ length: measureCount }, () => []);
	const beatTicks: BeatTick[] = [];

	// Effective tempo per measure index: a mid-song tempo change stays in effect
	// until the next one. Precomputed by index (not along the play order) so a
	// repeat jump lands on the right tempo for the measure it jumps to.
	const effectiveTempo: number[] = [];
	{
		let current = score.tempo;
		for (let mi = 0; mi < measureCount; mi++) {
			current = score.tracks[0]?.measures[mi]?.tempo ?? current;
			effectiveTempo.push(current);
		}
	}

	const ties = computeTieSustains(score);

	let cursorTick = 0;
	let lastTempo = -1;
	let lastTimeSig = '';

	for (const mi of playOrder) {
		const tempo = effectiveTempo[mi] ?? score.tempo;
		const timeSig = score.tracks[0]?.measures[mi]?.timeSignature ?? score.timeSignature;
		const measureStart = Math.round(cursorTick);
		const firstPass = measureTicks[mi] < 0;
		if (firstPass) measureTicks[mi] = measureStart;

		if (tempo !== lastTempo) {
			handler.addTempo(measureStart, tempo);
			lastTempo = tempo;
		}
		const sigKey = `${timeSig[0]}/${timeSig[1]}`;
		if (sigKey !== lastTimeSig) {
			// Also drives alphaSynth's built-in count-in click generation.
			handler.addTimeSignature(measureStart, timeSig[0], timeSig[1]);
			lastTimeSig = sigKey;
		}

		const measureLenTicks = (timeSig[0] / timeSig[1]) * WHOLE_NOTE_TICKS;

		// Metronome clicks: one per beat of the time signature, on the dedicated
		// metronome channel (its volume/mute is driven live by the engine).
		const clickVoice = METRONOME_VOICES[metronomeSound];
		for (let b = 0; b < timeSig[0]; b++) {
			const clickTick = Math.round(measureStart + (b * measureLenTicks) / timeSig[0]);
			handler.addNote(
				0,
				clickTick,
				Math.round(secondsToTicks(0.05, tempo)),
				clickVoice.key,
				METRONOME_VELOCITY,
				METRONOME_CHANNEL
			);
		}

		// Schedule each track's voices within this measure independently. A
		// simile bar sounds the content of the bar it echoes instead of its own.
		const capacity = timeSig[0] / timeSig[1];
		for (const [ti, track] of score.tracks.entries()) {
			const measure = track.measures[mi];
			if (!measure) continue;
			const content = measure.simile ? (simileSource(track, mi) ?? measure) : measure;
			const channel = channels.get(track.id)!;
			const voices = measureVoices(content);
			const isPrimary = track === score.tracks[0];
			for (const [vi, voice] of voices.entries()) {
				const cutoff = beatsCutoff(voice, capacity);
				const isPrimaryVoice = isPrimary && vi === 0;
				let localTicks = 0;
				for (let bi = 0; bi < voice.length; bi++) {
					if (bi >= cutoff) break; // skip overflow
					const beat = voice[bi];
					const durTicks = beatFraction(beat) * WHOLE_NOTE_TICKS;
					const startTick = Math.round(measureStart + localTicks);
					if (isPrimaryVoice) {
						if (firstPass) measureBeatTicks[mi].push(startTick);
						// Simile content may have more beats than the bar's own
						// notation — clamp so the playhead stays inside the bar.
						beatTicks.push({
							tick: startTick,
							measure: mi,
							beat: content === measure ? bi : Math.min(bi, measure.beats.length - 1)
						});
					}
					if (!beat.rest) {
						const palm = beat.notes.some((n) => n.techniques?.includes('palm-mute'));
						// Dynamic marking scales the whole beat's attack strength.
						const dynVel = beat.dynamic ? DYNAMIC_VELOCITY[beat.dynamic] : 1;
						// Strum: stagger the chord's notes slightly. A down-strum hits the
						// low-pitched strings first (largest string index — index 0 is the
						// highest string); an up-strum is the reverse.
						const strumOrder = beat.strum
							? [...beat.notes].sort((a, b) =>
									beat.strum === 'down' ? b.string - a.string : a.string - b.string
								)
							: null;
						const strumStep = Math.round(secondsToTicks(0.014, tempo));
						for (const note of beat.notes) {
							if (note.techniques?.includes('dead')) continue;
							const noteId = tieKey(ti, mi, vi, bi, note.string);
							// Tied continuations never restrike — their origin's note-on
							// below is stretched to ring through them instead.
							if (ties.skip.has(noteId)) continue;
							const sustainFrac = ties.sustain.get(noteId);
							const soundTicks =
								sustainFrac !== undefined ? sustainFrac * WHOLE_NOTE_TICKS : durTicks;
							const strumDelay = strumOrder ? strumOrder.indexOf(note) * strumStep : 0;
							let key = frettedMidi(track.tuning, note.string, note.fret, {
								capo: track.capo,
								transpose: track.transpose
							});
							// Harmonics ring at their true sounding pitch, voiced on the
							// track's Guitar-Harmonics companion channel: a natural harmonic
							// sounds a node interval above the open string (the tab fret is
							// the touch point, not a stopped note); an artificial harmonic
							// chimes an octave above the fretted pitch.
							let noteChannel = channel;
							if (note.techniques?.includes('harmonic')) {
								key =
									frettedMidi(track.tuning, note.string, 0, {
										capo: track.capo,
										transpose: track.transpose
									}) + (NATURAL_HARMONIC_SEMITONES[note.fret] ?? 12);
								noteChannel = harmonicChannels.get(track.id) ?? channel;
							} else if (note.techniques?.includes('artificial-harmonic')) {
								key += 12;
								noteChannel = harmonicChannels.get(track.id) ?? channel;
							}
							const noteStart = startTick + strumDelay;
							let noteLen = Math.round(
								soundTicks * (note.techniques?.includes('staccato') ? 0.4 : 0.95)
							);
							if (palm) {
								noteLen = Math.min(noteLen, Math.round(secondsToTicks(0.12, tempo)));
							}
							const velocity = Math.max(
								1,
								Math.min(
									127,
									Math.round(
										127 *
											dynVel *
											(note.techniques?.includes('ghost')
												? 0.4
												: note.techniques?.includes('fade-in')
													? 0.5
													: 1)
									)
								)
							);
							handler.addNote(0, noteStart, noteLen, key, velocity, noteChannel);

							// Pitch effects, expressed as channel pitch-bend automation. One
							// channel per track means a bend rides the whole channel — same
							// trade-off as SMF1-mode alphaTab files.
							const slideToKey =
								note.slideTo !== undefined
									? frettedMidi(track.tuning, note.string, note.slideTo, {
											capo: track.capo,
											transpose: track.transpose
										})
									: undefined;
							const bendSemis = note.techniques?.includes('bend') ? (note.bend ?? 1) : 0;
							const vibrato =
								note.techniques?.includes('vibrato') ||
								note.techniques?.includes('wide-vibrato') ||
								note.techniques?.includes('trill');
							if (slideToKey !== undefined || bendSemis || vibrato) {
								writePitchAutomation(handler, noteChannel, {
									startTick: noteStart,
									durTicks: noteLen,
									tempo,
									slideSemis: slideToKey !== undefined ? slideToKey - key : undefined,
									bendSemis: bendSemis || undefined,
									vibrato: !!vibrato
								});
							}
						}
					}
					localTicks += durTicks;
				}
			}
		}

		cursorTick += measureLenTicks;
	}

	const totalTicks = Math.round(cursorTick);
	// Measures that never play (e.g. a volta ending beyond the repeat count)
	// still need a tick so cursor/loop lookups resolve: map them to wherever
	// the next played measure starts (or the end of the piece).
	for (let mi = measureCount - 1; mi >= 0; mi--) {
		if (measureTicks[mi] < 0) measureTicks[mi] = measureTicks[mi + 1] ?? totalTicks;
	}
	handler.finishTrack(0, totalTicks);

	return {
		midi,
		channels,
		harmonicChannels,
		beatTicks,
		measureTicks,
		measureBeatTicks,
		totalTicks,
		metronomeSound
	};
}

/** Bend/slide/vibrato as a series of pitch-wheel events, reset at note end. */
function writePitchAutomation(
	handler: at.midi.AlphaSynthMidiFileHandler,
	channel: number,
	opts: {
		startTick: number;
		durTicks: number;
		tempo: number;
		slideSemis?: number;
		bendSemis?: number;
		vibrato: boolean;
	}
) {
	const { startTick, durTicks, tempo } = opts;
	const endTick = startTick + durTicks;
	const wheel = (semis: number) =>
		Math.max(0, Math.min(16383, Math.round(PITCH_WHEEL_CENTER + semis * WHEEL_PER_SEMITONE)));

	let holdSemis = 0;
	let settleTicks = Math.round(secondsToTicks(0.1, tempo));
	if (opts.slideSemis !== undefined) {
		// Ramp to the destination across the note's full duration.
		const steps = 8;
		handler.addBend(0, startTick, channel, wheel(0));
		for (let i = 1; i <= steps; i++) {
			const t = Math.round(startTick + (durTicks * i) / steps);
			handler.addBend(0, t, channel, wheel((opts.slideSemis * i) / steps));
		}
		holdSemis = opts.slideSemis;
		settleTicks = Math.round(durTicks * 0.5);
	} else if (opts.bendSemis) {
		// Quick pull-up that is then sustained, not a slow glide.
		const attackTicks = Math.min(durTicks * 0.4, secondsToTicks(0.18, tempo));
		const steps = 6;
		handler.addBend(0, startTick, channel, wheel(0));
		for (let i = 1; i <= steps; i++) {
			const t = Math.round(startTick + (attackTicks * i) / steps);
			handler.addBend(0, t, channel, wheel((opts.bendSemis * i) / steps));
		}
		holdSemis = opts.bendSemis;
		settleTicks = Math.round(durTicks * 0.5);
	}

	if (opts.vibrato) {
		// Wobble around whatever pitch the note holds once any bend has settled.
		const halfCycleTicks = Math.max(1, Math.round(secondsToTicks(1 / (VIBRATO_RATE * 2), tempo)));
		let t = startTick + Math.min(settleTicks, Math.round(durTicks * 0.5));
		let up = true;
		while (t < endTick) {
			handler.addBend(
				0,
				Math.round(t),
				channel,
				wheel(holdSemis + (up ? 1 : -1) * VIBRATO_DEPTH_SEMITONES)
			);
			up = !up;
			t += halfCycleTicks;
		}
	}

	// Return the channel to center right after the note so following notes on
	// this track start unbent.
	handler.addBend(0, endTick, channel, wheel(0));
}

/** One-off MIDI for auditioning a single fretted note (fretboard/note entry). */
export async function buildPluckMidi(
	track: OtoTrack,
	stringIndex: number,
	fret: number
): Promise<{ midi: at.midi.MidiFile; channel: number }> {
	const alphaTab = await loadAlphaTab();
	const midi = new alphaTab.midi.MidiFile();
	const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true);
	const isDrum = track.instrument === 'drums';
	const channel = isDrum ? PERCUSSION_CHANNEL : PREVIEW_CHANNEL;
	const key = frettedMidi(track.tuning, stringIndex, fret, {
		capo: track.capo,
		transpose: track.transpose
	});
	handler.addTimeSignature(0, 4, 4);
	handler.addTempo(0, 120);
	// Even the percussion channel needs a program selected (0 = GM kit) — a
	// preset-less channel makes the synth emit NaN samples.
	handler.addProgramChange(0, 0, channel, isDrum ? 0 : (GM_PROGRAMS[track.instrument] ?? 27));
	// 0.6s at 120bpm = 1152 ticks, with a little tail so the release can ring.
	handler.addNote(0, 0, 1152, key, 102, channel);
	handler.finishTrack(0, 1152 + 480);
	return { midi, channel };
}

/** One-off MIDI for previewing a metronome click variant. */
export async function buildMetronomePreviewMidi(sound: MetronomeSound): Promise<at.midi.MidiFile> {
	const alphaTab = await loadAlphaTab();
	const midi = new alphaTab.midi.MidiFile();
	const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true);
	const voice = METRONOME_VOICES[sound];
	handler.addTimeSignature(0, 4, 4);
	handler.addTempo(0, 120);
	handler.addProgramChange(0, 0, METRONOME_CHANNEL, voice.program);
	handler.addNote(0, 0, 96, voice.key, METRONOME_VELOCITY, METRONOME_CHANNEL);
	handler.finishTrack(0, 96 + 240);
	return midi;
}
