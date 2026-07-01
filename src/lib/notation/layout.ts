// Pure layout engine: turns a track into positioned "systems" (rows of measures)
// that the SVG component renders. Keeping geometry here keeps the component thin
// and makes hit-testing for the editor straightforward.

import { analyzeMeasure, beatFraction } from '$lib/oto/duration';
import { frettedMidi } from '$lib/oto/pitch';
import { accidentalGlyph, beamCount, midiToStaffStep } from './glyphs';
import type { OtoScore, OtoTrack, DurationValue, TrackKind } from '$lib/oto/types';

export interface LayoutOptions {
	containerWidth: number;
	showStandard: boolean;
	showTab: boolean;
	showRhythm: boolean;
}

export const METRICS = {
	staffLineGap: 8, // standard staff line spacing
	stdTopPad: 24, // vertical padding above the top staff line within the standard band
	tabLineGap: 11, // tab string spacing
	beatMinWidth: 30,
	beatPadding: 22,
	measurePadStart: 14,
	measurePadEnd: 10,
	headerWidth: 56, // clef + tuning column on first measure of a row
	systemGap: 26,
	standardHeight: 0, // computed
	tabHeight: 0,
	rhythmHeight: 18 * 2
};

export interface LaidNote {
	string: number;
	fret: number;
	midi: number;
	x: number;
	tabY: number;
	stdY: number; // y of notehead on standard staff
	step: number;
	/** Accidental to draw before the notehead, after per-measure cancellation. */
	accidental: 'sharp' | 'flat' | 'natural' | null;
	/** Horizontal notehead displacement (px) so clustered seconds don't overlap. */
	headXOffset: number;
	techniques: string[];
	/** Dead/muted note (x). Drawn as an X notehead at the open-string position. */
	dead: boolean;
	bend?: number;
	slideTo?: number;
	tied?: boolean;
	/** When this note ties forward, the target notehead's coordinates. */
	tie: { x2: number; stdY2: number; tabY2: number } | null;
	ledgerLines: number[]; // y positions of ledger lines
}

export interface LaidBeat {
	index: number;
	x: number;
	width: number;
	/** Onset within the measure, in whole-note fractions (for beam grouping). */
	startFrac: number;
	duration: DurationValue;
	dotted: boolean;
	rest: boolean;
	notes: LaidNote[];
	stemDir: 1 | -1; // 1 = up
	beams: number;
	beamGroup: number; // id of beam group, -1 if none
	/** Highest notehead y (smallest value) and lowest notehead y on the staff. */
	noteTop: number;
	noteBottom: number;
	stdStemTop: number;
	stdStemBottom: number;
}

export interface LaidMeasure {
	index: number;
	x: number;
	width: number;
	beats: LaidBeat[];
	/** Optional second voice (stems down), laid on the same timeline. */
	voice2?: LaidBeat[];
	overflow: boolean;
	showHeader: boolean;
	timeSignature: [number, number] | null; // shown when it changes
}

export interface LaidSystem {
	y: number;
	height: number;
	measures: LaidMeasure[];
	width: number;
}

export interface TrackLayout {
	systems: LaidSystem[];
	totalHeight: number;
	stringCount: number;
	bands: { standard: Band | null; tab: Band | null; rhythm: Band | null };
	/** Which clef the standard staff is drawn in for this track. */
	clef: Clef;
	/** Key-signature accidental glyphs to draw after the clef, at the start of
	 *  each system (empty for the key of C / A minor). `dx` is relative to the
	 *  measure's x. */
	keySigGlyphs: { glyph: string; dx: number; y: number }[];
	/** Extra header width (px) consumed by `keySigGlyphs`, for positioning whatever comes after them. */
	keySigWidth: number;
}

/** The two clefs the standard staff can render in. */
export type Clef = 'treble' | 'bass';

/** Bass is notated in bass clef; every other kind uses treble. */
export function clefForKind(kind: TrackKind): Clef {
	return kind === 'bass' ? 'bass' : 'treble';
}

/**
 * Diatonic staff steps (relative to middle C = 0, see `midiToStaffStep`) for
 * each clef's bottom line, top line and middle line.
 *  - Treble: lines E4 G4 B4 D5 F5 → bottom 2, middle 6, top 10.
 *  - Bass: lines G2 B2 D3 F3 A3 → bottom -10, middle -6, top -2.
 */
const CLEF_LINES: Record<Clef, { top: number; bottom: number; middle: number }> = {
	treble: { top: 10, bottom: 2, middle: 6 },
	bass: { top: -2, bottom: -10, middle: -6 }
};

// Circle-of-fifths order in which sharps/flats are added to a key signature,
// expressed as diatonic letter classes (C=0 D=1 E=2 F=3 G=4 A=5 B=6).
const SHARP_LETTER_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_LETTER_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

// Standard engraving staff steps for each sharp/flat, in the same circle-of-
// fifths order as above, per clef.
const KEY_SIG_STEPS: Record<Clef, { sharp: number[]; flat: number[] }> = {
	treble: { sharp: [10, 7, 11, 8, 5, 9, 6], flat: [6, 9, 5, 8, 4, 7, 3] },
	bass: { sharp: [-4, -7, -3, -6, -9, -5, -8], flat: [-8, -5, -9, -6, -10, -7, -4] }
};

/** Letter classes (mod-7 diatonic step) altered by a key signature, with their
 *  alteration — e.g. G major (fifths=1) maps F's letter class to 'sharp'. */
function keySignatureLetterDefaults(fifths: number): Map<number, 'sharp' | 'flat'> {
	const map = new Map<number, 'sharp' | 'flat'>();
	if (fifths > 0) {
		for (let i = 0; i < Math.min(fifths, 7); i++) map.set(SHARP_LETTER_ORDER[i], 'sharp');
	} else if (fifths < 0) {
		for (let i = 0; i < Math.min(-fifths, 7); i++) map.set(FLAT_LETTER_ORDER[i], 'flat');
	}
	return map;
}

function letterClassOf(step: number): number {
	return ((step % 7) + 7) % 7;
}

const KEY_SIG_GLYPH_GAP = 7;
const KEY_SIG_START_DX = 26; // right after the clef glyph

/** Accidental glyphs to render for a key signature in a given clef, positioned
 *  left to right starting just after the clef. */
function keySignatureGlyphs(
	fifths: number,
	clef: Clef
): { glyph: string; dx: number; y: number }[] {
	if (fifths === 0) return [];
	const type = fifths > 0 ? 'sharp' : 'flat';
	const steps = KEY_SIG_STEPS[clef][type].slice(0, Math.min(Math.abs(fifths), 7));
	const glyph = accidentalGlyph(type);
	return steps.map((step, i) => ({
		glyph,
		dx: KEY_SIG_START_DX + i * KEY_SIG_GLYPH_GAP,
		y: standardNoteY(step, clef) + 4
	}));
}

/** Extra header width needed to fit a key signature's accidentals. */
function keySignatureWidth(fifths: number): number {
	if (fifths === 0) return 0;
	return Math.min(Math.abs(fifths), 7) * KEY_SIG_GLYPH_GAP + 6;
}

export interface Band {
	offsetY: number; // relative to top of a system
	height: number;
}

function intrinsicMeasureWidth(
	beatCount: number,
	showHeader: boolean,
	headerWidth: number
): number {
	const w =
		METRICS.measurePadStart +
		Math.max(1, beatCount) * (METRICS.beatMinWidth + METRICS.beatPadding) +
		METRICS.measurePadEnd;
	return w + (showHeader ? headerWidth : 0);
}

export function layoutTrack(score: OtoScore, track: OtoTrack, opts: LayoutOptions): TrackLayout {
	const stringCount = track.tuning.length;
	const clef = clefForKind(track.kind);
	const middleStep = CLEF_LINES[clef].middle;
	const keyFifths = score.keySignature ?? 0;
	const keyLetterDefaults = keySignatureLetterDefaults(keyFifths);
	const preferFlat = keyFifths < 0;
	const keySigGlyphs = keySignatureGlyphs(keyFifths, clef);
	const keySigWidth = keySignatureWidth(keyFifths);
	const headerWidth = METRICS.headerWidth + keySigWidth;
	// top pad + 5 line-gaps (top line to bottom line) + bottom ledger room
	const standardHeight = METRICS.stdTopPad + METRICS.staffLineGap * 5 + 36;
	const tabHeight = (stringCount - 1) * METRICS.tabLineGap + 28;
	const rhythmHeight = 30;

	// Vertical bands within a system.
	let y = 8;
	const bands: TrackLayout['bands'] = { standard: null, tab: null, rhythm: null };
	if (opts.showStandard) {
		bands.standard = { offsetY: y, height: standardHeight };
		y += standardHeight + 24;
	}
	if (opts.showRhythm && !opts.showStandard) {
		bands.rhythm = { offsetY: y, height: rhythmHeight };
		y += rhythmHeight + 12;
	}
	if (opts.showTab) {
		bands.tab = { offsetY: y, height: tabHeight };
		y += tabHeight + 12;
	}
	const systemHeight = y + METRICS.systemGap;

	// Pack measures into systems greedily by width.
	const avail = Math.max(360, opts.containerWidth);
	const systems: LaidSystem[] = [];
	let row: number[] = [];
	let rowWidth = 0;
	const flush = () => {
		if (row.length) systems.push(buildSystem(row, true));
		row = [];
		rowWidth = 0;
	};
	for (let mi = 0; mi < track.measures.length; mi++) {
		const beatCount = track.measures[mi].beats.length;
		const showHeader = row.length === 0;
		const w = intrinsicMeasureWidth(beatCount, showHeader, headerWidth);
		if (row.length > 0 && rowWidth + w > avail) flush();
		row.push(mi);
		rowWidth += intrinsicMeasureWidth(beatCount, row.length === 1, headerWidth);
	}
	flush();

	// Build each system's geometry.
	function buildSystem(measureIndexes: number[], justify: boolean): LaidSystem {
		// First pass: intrinsic widths.
		const intrinsic = measureIndexes.map((mi, i) =>
			intrinsicMeasureWidth(track.measures[mi].beats.length, i === 0, headerWidth)
		);
		const totalIntrinsic = intrinsic.reduce((a, b) => a + b, 0);
		const scale = justify && totalIntrinsic > 0 ? Math.min(1.6, avail / totalIntrinsic) : 1;

		let mx = 0;
		let prevTimeSig: [number, number] = score.timeSignature;
		const measures: LaidMeasure[] = measureIndexes.map((mi, i) => {
			const measure = track.measures[mi];
			const showHeader = i === 0;
			const headerW = showHeader ? headerWidth : 0;
			const width = intrinsic[i] * scale;
			const innerStart = mx + headerW + METRICS.measurePadStart;
			const innerWidth = width - headerW - METRICS.measurePadStart - METRICS.measurePadEnd;
			const fill = analyzeMeasure(measure, score.timeSignature);

			// Beat-unit (whole-note fraction) for beam grouping: beam runs break at
			// each notated beat, e.g. per quarter note in 4/4 or 5/4.
			const ts = measure.timeSignature ?? score.timeSignature;
			const beatUnit = 1 / ts[1];

			// Lay one voice's beats along the measure's inner width, positioned
			// proportionally to duration. `forcedDir` pins stem direction for the
			// two-voice case (voice 1 up, voice 2 down).
			const layVoice = (vbeats: typeof measure.beats, forcedDir: 1 | -1 | null): LaidBeat[] => {
				const totalFrac = vbeats.reduce((s, b) => s + beatFraction(b), 0) || 1;
				// Per-voice, per-measure accidental memory so a sharped/flatted pitch
				// isn't re-marked and a later natural cancels it. Falls back to the
				// key signature's own alteration (by letter, across all octaves) when
				// nothing has overridden a given staff position yet this measure.
				const accMap = new Map<number, 'sharp' | 'flat' | null>();
				let acc = 0;
				const laid = vbeats.map((beat, bi): LaidBeat => {
					const frac = beatFraction(beat);
					const bx = innerStart + (acc / totalFrac) * innerWidth + 8;
					const bw = (frac / totalFrac) * innerWidth;
					const startFrac = acc;
					acc += frac;

					const notes: LaidNote[] = beat.notes.map((n) => {
						const dead = !!n.techniques?.includes('dead');
						// A dead note has no real pitch — it's an X. Place it on the staff
						// at the open string's position (fret 0) so it reads as "this
						// string, muted", and never draw an accidental for it.
						const midi = frettedMidi(track.tuning, n.string, dead ? 0 : n.fret, {
							capo: track.capo,
							transpose: track.transpose
						});
						// Guitar/bass standard notation is conventionally written one
						// octave above the instrument's actual sounding pitch (like the
						// double bass) so the staff doesn't need a thicket of ledger
						// lines; the tab/audio paths keep using the real `midi` above.
						const { step, accidentalHint } = midiToStaffStep(
							midi + notationOctaveShift(track.kind),
							preferFlat
						);
						const tabY = bands.tab ? n.string * METRICS.tabLineGap + 14 : 0;
						const stdY = standardNoteY(step, clef);
						const keyDefault = keyLetterDefaults.get(letterClassOf(step)) ?? null;
						return {
							string: n.string,
							fret: n.fret,
							midi,
							x: bx,
							tabY,
							stdY,
							step,
							accidental: dead ? null : accidentalFor(step, accidentalHint, keyDefault, accMap),
							headXOffset: 0,
							techniques: n.techniques ?? [],
							dead,
							bend: n.bend,
							slideTo: n.slideTo,
							tied: n.tied,
							tie: null,
							ledgerLines: ledgerLinesFor(step, clef)
						};
					});

					const stdYs = notes.map((n) => n.stdY);
					const noteTop = stdYs.length ? Math.min(...stdYs) : standardNoteY(middleStep, clef);
					const noteBottom = stdYs.length ? Math.max(...stdYs) : standardNoteY(middleStep, clef);
					return {
						index: bi,
						x: bx,
						width: bw,
						startFrac,
						duration: beat.duration,
						dotted: !!beat.dotted,
						rest: !!beat.rest || beat.notes.length === 0,
						notes,
						stemDir: forcedDir ?? 1,
						beams: beamCount(beat.duration),
						beamGroup: -1,
						noteTop,
						noteBottom,
						stdStemTop: noteTop,
						stdStemBottom: noteBottom
					};
				});
				assignBeamGroups(laid, beatUnit);
				assignStemDirections(laid, forcedDir, middleStep);
				offsetSecondClusters(laid);
				assignTies(laid);
				return laid;
			};

			const hasV2 = !!(measure.voice2 && measure.voice2.length);
			const beats = layVoice(measure.beats, hasV2 ? 1 : null);
			const voice2 = hasV2 ? layVoice(measure.voice2!, -1) : undefined;

			const showTs =
				mi === 0 ||
				(measure.timeSignature &&
					(measure.timeSignature[0] !== prevTimeSig[0] ||
						measure.timeSignature[1] !== prevTimeSig[1]));
			if (measure.timeSignature) prevTimeSig = measure.timeSignature;

			const laid: LaidMeasure = {
				index: mi,
				x: mx,
				width,
				beats,
				voice2,
				overflow: fill.overflow,
				showHeader,
				timeSignature: showTs ? (measure.timeSignature ?? score.timeSignature) : null
			};
			mx += width;
			return laid;
		});

		// Ties that cross a barline: link a measure's last beat to the next
		// measure's first beat. Measures in a system share absolute x, so the
		// tie path renders correctly. (Ties across a system break are dropped.)
		for (let i = 0; i < measures.length - 1; i++) {
			linkCrossMeasureTies(measures[i].beats, measures[i + 1].beats);
			if (measures[i].voice2 && measures[i + 1].voice2)
				linkCrossMeasureTies(measures[i].voice2!, measures[i + 1].voice2!);
		}

		return { y: 0, height: systemHeight, measures, width: mx };
	}

	// Assign y to each system.
	let yy = 0;
	for (const s of systems) {
		s.y = yy;
		yy += systemHeight;
	}

	return {
		systems,
		totalHeight: yy + 8,
		stringCount,
		bands,
		clef,
		keySigGlyphs,
		keySigWidth
	};
}

/**
 * Semitones added to the sounding pitch before placing a notehead on the
 * standard staff. Guitar and bass are transposing instruments in standard
 * notation — written one octave higher than they actually sound — the same
 * convention used by double bass, to avoid stacking ledger lines below the
 * staff. Open B (2nd string) therefore sits on the middle staff line, not
 * a ledger line and a half below it.
 */
function notationOctaveShift(kind: TrackKind): number {
	return kind === 'guitar' || kind === 'bass' ? 12 : 0;
}

/** Standard-staff y for a diatonic step (C4 = 0), in the given clef. */
function standardNoteY(step: number, clef: Clef): number {
	// Each step = half a staff-line gap, measured down from the clef's top line.
	const topLineStep = CLEF_LINES[clef].top;
	const topLineY = METRICS.stdTopPad + METRICS.staffLineGap; // y of top staff line within band
	return topLineY + (topLineStep - step) * (METRICS.staffLineGap / 2);
}

function ledgerLinesFor(step: number, clef: Clef): number[] {
	const lines: number[] = [];
	const { top, bottom } = CLEF_LINES[clef];
	if (step <= bottom - 2) {
		for (let s = bottom - 2; s >= step; s -= 2) lines.push(standardNoteY(s, clef));
	}
	if (step >= top + 2) {
		for (let s = top + 2; s <= step; s += 2) lines.push(standardNoteY(s, clef));
	}
	return lines;
}

const STEM_LEN = 26;

function avgStep(notes: LaidNote[], middleStep: number): number {
	if (!notes.length) return middleStep;
	return notes.reduce((s, n) => s + n.step, 0) / notes.length;
}

/**
 * Per-measure accidental resolution. `keyDefault` is the alteration the key
 * signature already applies to this staff position (by letter, every
 * octave); `accMap` overrides it for the rest of the bar once an explicit
 * accidental appears at this exact octave. Returns the accidental to draw, or
 * null when the pitch already matches the current effective state.
 */
function accidentalFor(
	step: number,
	desired: 'sharp' | 'flat' | null,
	keyDefault: 'sharp' | 'flat' | null,
	accMap: Map<number, 'sharp' | 'flat' | null>
): 'sharp' | 'flat' | 'natural' | null {
	const current = accMap.has(step) ? accMap.get(step)! : keyDefault;
	if (desired === current) return null;
	accMap.set(step, desired);
	return desired ?? 'natural';
}

/**
 * Group consecutive non-rest eighth/sixteenth beats into beam groups, breaking
 * the run whenever it crosses a notated beat boundary (every `beatUnit` of a
 * whole note) so beaming follows the metre instead of running edge to edge.
 */
function assignBeamGroups(beats: LaidBeat[], beatUnit: number) {
	const cellOf = (b: LaidBeat) => Math.floor(b.startFrac / beatUnit + 1e-9);
	let group = 0;
	let i = 0;
	while (i < beats.length) {
		if (beats[i].beams > 0 && !beats[i].rest) {
			const cell = cellOf(beats[i]);
			let j = i + 1;
			while (j < beats.length && beats[j].beams > 0 && !beats[j].rest && cellOf(beats[j]) === cell)
				j++;
			if (j - i >= 2) {
				for (let k = i; k < j; k++) beats[k].beamGroup = group;
				group++;
			}
			i = j;
		} else {
			i++;
		}
	}
}

/**
 * Decide one stem direction per beam group (so a beam never asks neighbouring
 * stems to point opposite ways) and per standalone beat, then set the stem
 * extents accordingly. `forcedDir` pins direction for multi-voice staves.
 */
function assignStemDirections(beats: LaidBeat[], forcedDir: 1 | -1 | null, middleStep: number) {
	const seen = new Set<number>();
	for (const b of beats) {
		if (b.beamGroup >= 0) {
			if (seen.has(b.beamGroup)) continue;
			seen.add(b.beamGroup);
			const members = beats.filter((m) => m.beamGroup === b.beamGroup);
			const all = members.flatMap((m) => m.notes);
			const dir: 1 | -1 = forcedDir ?? (avgStep(all, middleStep) > middleStep ? -1 : 1);
			for (const m of members) {
				m.stemDir = dir;
				setStemExtents(m);
			}
		} else {
			b.stemDir = forcedDir ?? (avgStep(b.notes, middleStep) > middleStep ? -1 : 1);
			setStemExtents(b);
		}
	}
}

function setStemExtents(b: LaidBeat) {
	if (b.stemDir === 1) {
		b.stdStemTop = b.noteTop - STEM_LEN;
		b.stdStemBottom = b.noteBottom;
	} else {
		b.stdStemTop = b.noteTop;
		b.stdStemBottom = b.noteBottom + STEM_LEN;
	}
}

/**
 * Within a chord, noteheads a second apart (adjacent staff positions) collide.
 * Displace every other clustered head to the far side of the stem so both read.
 */
function offsetSecondClusters(beats: LaidBeat[]) {
	const HEAD_W = 11;
	for (const b of beats) {
		if (b.notes.length < 2) continue;
		const sorted = [...b.notes].sort((a, c) => a.step - c.step);
		const off = b.stemDir === 1 ? HEAD_W : -HEAD_W;
		for (let k = 1; k < sorted.length; k++) {
			if (Math.abs(sorted[k].step - sorted[k - 1].step) <= 1 && sorted[k - 1].headXOffset === 0) {
				sorted[k].headXOffset = off;
			}
		}
	}
}

/** Link each tied note to the matching-string notehead in the next beat. */
function assignTies(beats: LaidBeat[]) {
	for (let i = 0; i < beats.length - 1; i++) {
		for (const n of beats[i].notes) {
			if (!n.tied) continue;
			const next = beats[i + 1].notes.find((m) => m.string === n.string);
			if (next) n.tie = { x2: next.x + next.headXOffset, stdY2: next.stdY, tabY2: next.tabY };
		}
	}
}

/** Link tied notes in `cur`'s last beat to the matching note in `next`'s first. */
function linkCrossMeasureTies(cur: LaidBeat[], next: LaidBeat[]) {
	if (!cur.length || !next.length) return;
	const last = cur[cur.length - 1];
	for (const n of last.notes) {
		if (!n.tied || n.tie) continue;
		const target = next[0].notes.find((m) => m.string === n.string);
		if (target)
			n.tie = { x2: target.x + target.headXOffset, stdY2: target.stdY, tabY2: target.tabY };
	}
}
