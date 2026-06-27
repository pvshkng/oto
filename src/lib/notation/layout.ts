// Pure layout engine: turns a track into positioned "systems" (rows of measures)
// that the SVG component renders. Keeping geometry here keeps the component thin
// and makes hit-testing for the editor straightforward.

import { analyzeMeasure, beatFraction } from '$lib/oto/duration';
import { frettedMidi } from '$lib/oto/pitch';
import { beamCount, midiToStaffStep } from './glyphs';
import type { OtoScore, OtoTrack, DurationValue } from '$lib/oto/types';

export interface LayoutOptions {
	containerWidth: number;
	showStandard: boolean;
	showTab: boolean;
	showRhythm: boolean;
}

export const METRICS = {
	staffLineGap: 8, // standard staff line spacing
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
	sharp: boolean;
	techniques: string[];
	bend?: number;
	slideTo?: number;
	ledgerLines: number[]; // y positions of ledger lines
}

export interface LaidBeat {
	index: number;
	x: number;
	width: number;
	duration: DurationValue;
	dotted: boolean;
	rest: boolean;
	notes: LaidNote[];
	stemDir: 1 | -1; // 1 = up
	beams: number;
	beamGroup: number; // id of beam group, -1 if none
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
}

export interface Band {
	offsetY: number; // relative to top of a system
	height: number;
}

function intrinsicMeasureWidth(beatCount: number, showHeader: boolean): number {
	const w =
		METRICS.measurePadStart +
		Math.max(1, beatCount) * (METRICS.beatMinWidth + METRICS.beatPadding) +
		METRICS.measurePadEnd;
	return w + (showHeader ? METRICS.headerWidth : 0);
}

export function layoutTrack(score: OtoScore, track: OtoTrack, opts: LayoutOptions): TrackLayout {
	const stringCount = track.tuning.length;
	const standardHeight = METRICS.staffLineGap * 8 + 24; // 5 lines + ledger room
	const tabHeight = (stringCount - 1) * METRICS.tabLineGap + 28;
	const rhythmHeight = 30;

	// Vertical bands within a system.
	let y = 8;
	const bands: TrackLayout['bands'] = { standard: null, tab: null, rhythm: null };
	if (opts.showStandard) {
		bands.standard = { offsetY: y, height: standardHeight };
		y += standardHeight + 6;
	}
	if (opts.showRhythm && !opts.showStandard) {
		bands.rhythm = { offsetY: y, height: rhythmHeight };
		y += rhythmHeight + 6;
	}
	if (opts.showTab) {
		bands.tab = { offsetY: y, height: tabHeight };
		y += tabHeight + 6;
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
		const w = intrinsicMeasureWidth(beatCount, showHeader);
		if (row.length > 0 && rowWidth + w > avail) flush();
		row.push(mi);
		rowWidth += intrinsicMeasureWidth(beatCount, row.length === 1);
	}
	flush();

	// Build each system's geometry.
	function buildSystem(measureIndexes: number[], justify: boolean): LaidSystem {
		// First pass: intrinsic widths.
		const intrinsic = measureIndexes.map((mi, i) =>
			intrinsicMeasureWidth(track.measures[mi].beats.length, i === 0)
		);
		const totalIntrinsic = intrinsic.reduce((a, b) => a + b, 0);
		const scale = justify && totalIntrinsic > 0 ? Math.min(1.6, avail / totalIntrinsic) : 1;

		let mx = 0;
		let prevTimeSig: [number, number] = score.timeSignature;
		const measures: LaidMeasure[] = measureIndexes.map((mi, i) => {
			const measure = track.measures[mi];
			const showHeader = i === 0;
			const headerW = showHeader ? METRICS.headerWidth : 0;
			const width = intrinsic[i] * scale;
			const innerStart = mx + headerW + METRICS.measurePadStart;
			const innerWidth = width - headerW - METRICS.measurePadStart - METRICS.measurePadEnd;
			const fill = analyzeMeasure(measure, score.timeSignature);

			// Lay one voice's beats along the measure's inner width, positioned
			// proportionally to duration. `forcedDir` pins stem direction for the
			// two-voice case (voice 1 up, voice 2 down).
			const layVoice = (vbeats: typeof measure.beats, forcedDir: 1 | -1 | null): LaidBeat[] => {
				const totalFrac = vbeats.reduce((s, b) => s + beatFraction(b), 0) || 1;
				let acc = 0;
				const laid = vbeats.map((beat, bi): LaidBeat => {
					const frac = beatFraction(beat);
					const bx = innerStart + (acc / totalFrac) * innerWidth + 8;
					const bw = (frac / totalFrac) * innerWidth;
					acc += frac;

					const notes: LaidNote[] = beat.notes.map((n) => {
						const midi = frettedMidi(track.tuning, n.string, n.fret, {
							capo: track.capo,
							transpose: track.transpose
						});
						const { step, sharp } = midiToStaffStep(midi);
						const tabY = bands.tab ? n.string * METRICS.tabLineGap + 14 : 0;
						const stdY = standardNoteY(step);
						return {
							string: n.string,
							fret: n.fret,
							midi,
							x: bx,
							tabY,
							stdY,
							step,
							sharp,
							techniques: n.techniques ?? [],
							bend: n.bend,
							slideTo: n.slideTo,
							ledgerLines: ledgerLinesFor(step)
						};
					});

					const stemDir: 1 | -1 = forcedDir ?? (avgStep(notes) > 6 ? -1 : 1);
					const stdYs = notes.map((n) => n.stdY);
					const top = stdYs.length ? Math.min(...stdYs) : standardNoteY(6);
					const bottom = stdYs.length ? Math.max(...stdYs) : standardNoteY(6);
					const stemLen = 26;
					return {
						index: bi,
						x: bx,
						width: bw,
						duration: beat.duration,
						dotted: !!beat.dotted,
						rest: !!beat.rest || beat.notes.length === 0,
						notes,
						stemDir,
						beams: beamCount(beat.duration),
						beamGroup: -1,
						stdStemTop: stemDir === 1 ? top - stemLen : top,
						stdStemBottom: stemDir === 1 ? bottom : bottom + stemLen
					};
				});
				assignBeamGroups(laid);
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
		bands
	};
}

/** Standard-staff y for a diatonic step (C4 = 0). Top line F5 step=10. */
function standardNoteY(step: number): number {
	// Treble: bottom line E4 (step 2) … top line F5 (step 10). Each step = half gap.
	const topLineStep = 10; // F5
	const topLineY = 12 + METRICS.staffLineGap; // y of top staff line within band
	return topLineY + (topLineStep - step) * (METRICS.staffLineGap / 2);
}

function ledgerLinesFor(step: number): number[] {
	const lines: number[] = [];
	// staff lines at steps 2,4,6,8,10 (E4 G4 B4 D5 F5)
	if (step <= 0) {
		for (let s = 0; s >= step; s -= 2) lines.push(standardNoteY(s));
	}
	if (step >= 12) {
		for (let s = 12; s <= step; s += 2) lines.push(standardNoteY(s));
	}
	return lines;
}

function avgStep(notes: LaidNote[]): number {
	if (!notes.length) return 6;
	return notes.reduce((s, n) => s + n.step, 0) / notes.length;
}

/** Group consecutive non-rest eighth/sixteenth beats into beam groups. */
function assignBeamGroups(beats: LaidBeat[]) {
	let group = 0;
	let i = 0;
	while (i < beats.length) {
		if (beats[i].beams > 0 && !beats[i].rest) {
			let j = i;
			while (j < beats.length && beats[j].beams > 0 && !beats[j].rest) j++;
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
