// Canvas port of the per-system frame previously inlined in TrackStaff.svelte:
// staff/tab/rhythm bands, barlines (open/close/repeat/double/final), clef, key
// and time signatures, volta brackets, bar-attribute symbols, section labels
// and the left grouping bracket. Per-measure note content is delegated to
// drawStdVoice/drawTabVoice. Every coordinate/size/color mirrors the SVG 1:1.

import {
	METRICS,
	timeSigAllowance,
	type LaidMeasure,
	type LaidSystem,
	type TrackLayout
} from '$lib/notation/layout';
import { GLYPH, restGlyph, timeSigGlyphs } from '$lib/notation/glyphs';
import { beamGroups } from '../beam-geometry';
import { drawStdVoice } from './draw-std-voice';
import { drawTabVoice } from './draw-tab-voice';
import {
	INK,
	MUTED,
	BAR,
	STAFF,
	bravura,
	sans,
	line,
	text,
	fillRect,
	fillCircle,
	ellipse,
	noteheadPaint
} from './style';

export interface DrawSystemParams {
	layout: TrackLayout;
	system: LaidSystem;
	/** Absolute index of the track's final measure — gets the final double bar. */
	lastMeasureIndex: number;
	/** Widest the canvas is drawn to; the left bracket + measures use system.width,
	 *  but callers pad the backing canvas to at least the container width. */
	containerWidth: number;
	/** Section id currently being renamed via the HTML input overlay, so its
	 *  on-canvas label text is suppressed (the input shows it instead). */
	editingSectionId: string | null;
}

/** Left grouping bracket spanning this track's bands. Mirrors TrackStaff's
 *  `bracket` derived. Coordinates are in system space. */
function computeBracket(layout: TrackLayout): { top: number; bottom: number } | null {
	const b = layout.bands;
	const tops: number[] = [];
	const bottoms: number[] = [];
	if (b.standard) {
		tops.push(b.standard.offsetY + METRICS.stdTopPad + METRICS.staffLineGap);
		bottoms.push(b.standard.offsetY + METRICS.stdTopPad + 5 * METRICS.staffLineGap);
	}
	if (b.rhythm) {
		const mid = b.rhythm.offsetY + b.rhythm.height / 2;
		tops.push(mid - 8);
		bottoms.push(mid + 8);
	}
	if (b.tab) {
		tops.push(b.tab.offsetY + layout.tabTop);
		bottoms.push(b.tab.offsetY + layout.tabTop + (layout.stringCount - 1) * METRICS.tabLineGap);
	}
	if (!tops.length) return null;
	return { top: Math.min(...tops), bottom: Math.max(...bottoms) };
}

export function drawSystem(ctx: CanvasRenderingContext2D, params: DrawSystemParams): void {
	const { layout, system, lastMeasureIndex, editingSectionId } = params;

	// Left grouping bracket, drawn first (SVG drew it before the bands so their
	// hit rects stayed on top — on canvas z-order only affects overpaint).
	const bracket = computeBracket(layout);
	if (bracket && system.measures[0]) {
		const first = system.measures[0];
		const bx = first.x + (first.showHeader ? 4 : 0);
		line(ctx, bx, bracket.top, bx, bracket.bottom, BAR, 2.4, { cap: 'round' });
	}

	system.measures.forEach((measure, mIdx) => {
		const repeatX =
			measure.x +
			(measure.showHeader ? METRICS.headerWidth + layout.keySigWidth + 2 : 0) +
			timeSigAllowance(measure.timeSignature);
		const nextMeasure = system.measures[mIdx + 1] ?? null;

		if (layout.bands.standard) drawStandardBand(ctx, params, measure, repeatX);
		if (layout.bands.tab) drawTabBand(ctx, params, measure, repeatX);
		if (layout.bands.rhythm) drawRhythmBand(ctx, layout.bands.rhythm, measure);

		drawStripMarks(ctx, measure, nextMeasure, layout, editingSectionId, lastMeasureIndex);
	});
}

function drawStandardBand(
	ctx: CanvasRenderingContext2D,
	params: DrawSystemParams,
	measure: LaidMeasure,
	repeatX: number
): void {
	const { layout, lastMeasureIndex } = params;
	const band = layout.bands.standard!;
	const stdTop = METRICS.stdTopPad + METRICS.staffLineGap;
	const stdBottom = METRICS.stdTopPad + 5 * METRICS.staffLineGap;

	ctx.save();
	ctx.translate(0, band.offsetY);

	// 5 staff lines.
	for (let i = 0; i < 5; i++) {
		const y = METRICS.stdTopPad + METRICS.staffLineGap + i * METRICS.staffLineGap;
		line(ctx, measure.x + (measure.showHeader ? 4 : 0), y, measure.x + measure.width, y, STAFF, 1);
	}
	// Opening barline flush with the (inset) staff lines.
	line(
		ctx,
		measure.x + (measure.showHeader ? 4 : 0),
		stdTop,
		measure.x + (measure.showHeader ? 4 : 0),
		stdBottom,
		BAR,
		1.4
	);

	drawBarlines(ctx, measure, repeatX, stdTop, stdBottom, lastMeasureIndex, {
		dotHi: stdTop + 1.5 * METRICS.staffLineGap,
		dotLo: stdTop + 2.5 * METRICS.staffLineGap,
		countY: stdTop - 4
	});

	if (measure.simile) {
		text(
			ctx,
			GLYPH.repeat1Bar,
			measure.x +
				measure.width / 2 +
				(measure.showHeader ? (METRICS.headerWidth + layout.keySigWidth) / 2 : 0),
			stdTop + 2 * METRICS.staffLineGap + 6,
			bravura(26),
			INK,
			'center'
		);
	}

	if (measure.showHeader) {
		if (layout.clef === 'bass') {
			text(
				ctx,
				GLYPH.bassClef,
				measure.x + 8,
				METRICS.stdTopPad + 2.5 * METRICS.staffLineGap,
				bravura(40),
				INK
			);
		} else {
			text(
				ctx,
				GLYPH.trebleClef,
				measure.x + 8,
				METRICS.stdTopPad + 3.4 * METRICS.staffLineGap,
				bravura(40),
				INK
			);
		}
		for (const g of layout.keySigGlyphs) {
			text(ctx, g.glyph, measure.x + g.dx, g.y, bravura(24), INK);
		}
	}
	if (measure.timeSignature) {
		const tx = measure.x + (measure.showHeader ? 40 + layout.keySigWidth : 6);
		text(
			ctx,
			timeSigGlyphs(measure.timeSignature[0]),
			tx,
			METRICS.stdTopPad + 2 * METRICS.staffLineGap + 1,
			bravura(26),
			INK
		);
		text(
			ctx,
			timeSigGlyphs(measure.timeSignature[1]),
			tx,
			METRICS.stdTopPad + 4 * METRICS.staffLineGap + 1,
			bravura(26),
			INK
		);
	}

	drawStdVoice(ctx, measure.beats, 0, band.height);
	if (measure.voice2) drawStdVoice(ctx, measure.voice2, 1, band.height);

	ctx.restore();
}

function drawTabBand(
	ctx: CanvasRenderingContext2D,
	params: DrawSystemParams,
	measure: LaidMeasure,
	repeatX: number
): void {
	const { layout, lastMeasureIndex } = params;
	const band = layout.bands.tab!;
	const tabTop = layout.tabTop;
	const tabBottom = layout.tabTop + (layout.stringCount - 1) * METRICS.tabLineGap;
	const tabMid = (tabTop + tabBottom) / 2;

	ctx.save();
	ctx.translate(0, band.offsetY);

	if (measure.overflow) {
		fillRect(ctx, measure.x, 0, measure.width, band.height, 'rgba(185,28,28,0.1)');
	}
	// String lines.
	for (let i = 0; i < layout.stringCount; i++) {
		const y = tabTop + i * METRICS.tabLineGap;
		line(ctx, measure.x + (measure.showHeader ? 4 : 0), y, measure.x + measure.width, y, STAFF, 1);
	}
	// Opening barline flush with the (inset) string lines.
	line(
		ctx,
		measure.x + (measure.showHeader ? 4 : 0),
		tabTop,
		measure.x + (measure.showHeader ? 4 : 0),
		tabBottom,
		BAR,
		1.4
	);

	drawBarlines(ctx, measure, repeatX, tabTop, tabBottom, lastMeasureIndex, {
		dotHi: tabMid - 5.5,
		dotLo: tabMid + 5.5,
		countY: tabTop - 3
	});

	if (measure.simile) {
		text(
			ctx,
			GLYPH.repeat1Bar,
			measure.x +
				measure.width / 2 +
				(measure.showHeader ? (METRICS.headerWidth + layout.keySigWidth) / 2 : 0),
			tabMid + 7,
			bravura(24),
			INK,
			'center'
		);
	}

	if (measure.showHeader) {
		text(
			ctx,
			'TAB',
			measure.x + 8,
			tabTop + ((layout.stringCount - 1) * METRICS.tabLineGap) / 2 + 4,
			// tracking-[1px] is not expressible via ctx.font; the label is short
			// enough that the ~3px total drift is invisible against the SVG.
			sans(700, 9),
			'#a1a1aa'
		);
	}

	drawTabVoice(ctx, measure.beats, 0, band.height, !layout.bands.standard);
	if (measure.voice2) drawTabVoice(ctx, measure.voice2, 1, band.height, !layout.bands.standard);

	ctx.restore();
}

function drawRhythmBand(
	ctx: CanvasRenderingContext2D,
	band: NonNullable<TrackLayout['bands']['rhythm']>,
	measure: LaidMeasure
): void {
	const stemTop = band.height / 2 - 18;
	const mid = band.height / 2;

	ctx.save();
	ctx.translate(0, band.offsetY);

	line(ctx, measure.x, mid, measure.x + measure.width, mid, STAFF, 1);
	line(ctx, measure.x, mid - 8, measure.x, mid + 8, BAR, 1.4);

	// Beams first: consecutive same-rhythm beats connect into a group.
	for (const group of beamGroups(measure.beats)) {
		const members = measure.beats.filter((b) => b.beamGroup === group);
		line(ctx, members[0].x, stemTop, members[members.length - 1].x, stemTop, INK, 3.4);
		for (const m of members) {
			line(ctx, m.x, mid, m.x, stemTop, INK, 1.4);
			if (m.beams >= 2) line(ctx, m.x, stemTop + 4, m.x + 8, stemTop + 4, INK, 3.4);
		}
	}
	for (const beat of measure.beats) {
		if (beat.rest) {
			text(ctx, restGlyph(beat.duration), beat.x - 3, mid + 4, bravura(26), INK);
		} else {
			if (beat.beamGroup === -1) {
				line(ctx, beat.x, mid, beat.x, stemTop, INK, 1.4);
				if (beat.beams > 0) {
					text(
						ctx,
						beat.beams === 1 ? GLYPH.flag8thUp : GLYPH.flag16thUp,
						beat.x,
						stemTop,
						bravura(26),
						INK
					);
				}
			}
			ellipse(
				ctx,
				beat.x,
				mid,
				4.5,
				3.4,
				0,
				noteheadPaint({ hollow: beat.duration <= 2, v2: false, ghost: false })
			);
		}
	}

	ctx.restore();
}

/** Closing-barline family shared by the standard and tab bands: repeat end,
 *  final double bar, section double bar, or a plain barline; plus the begin
 *  repeat after the header. `dot*`/`countY` are band-specific y positions. */
function drawBarlines(
	ctx: CanvasRenderingContext2D,
	measure: LaidMeasure,
	repeatX: number,
	top: number,
	bottom: number,
	lastMeasureIndex: number,
	yy: { dotHi: number; dotLo: number; countY: number }
): void {
	if (measure.repeatStart) {
		line(ctx, repeatX + 2, top, repeatX + 2, bottom, BAR, 4);
		line(ctx, repeatX + 6.5, top, repeatX + 6.5, bottom, BAR, 1.4);
		fillCircle(ctx, repeatX + 11.5, yy.dotHi, 2, BAR);
		fillCircle(ctx, repeatX + 11.5, yy.dotLo, 2, BAR);
	}

	if (measure.repeatEnd) {
		fillCircle(ctx, measure.x + measure.width - 11.5, yy.dotHi, 2, BAR);
		fillCircle(ctx, measure.x + measure.width - 11.5, yy.dotLo, 2, BAR);
		line(
			ctx,
			measure.x + measure.width - 6.5,
			top,
			measure.x + measure.width - 6.5,
			bottom,
			BAR,
			1.4
		);
		line(ctx, measure.x + measure.width - 2, top, measure.x + measure.width - 2, bottom, BAR, 4);
		if (measure.repeatCount && measure.repeatCount > 2) {
			text(
				ctx,
				`x${measure.repeatCount}`,
				measure.x + measure.width - 8,
				yy.countY,
				sans(700, 9),
				BAR,
				'right'
			);
		}
	} else if (measure.index === lastMeasureIndex) {
		line(ctx, measure.x + measure.width - 5, top, measure.x + measure.width - 5, bottom, BAR, 1.4);
		line(
			ctx,
			measure.x + measure.width - 1.5,
			top,
			measure.x + measure.width - 1.5,
			bottom,
			BAR,
			4
		);
	} else if (measure.barline === 'double') {
		line(ctx, measure.x + measure.width - 4, top, measure.x + measure.width - 4, bottom, BAR, 1.4);
		line(ctx, measure.x + measure.width, top, measure.x + measure.width, bottom, BAR, 1.4);
	} else {
		line(ctx, measure.x + measure.width, top, measure.x + measure.width, bottom, BAR, 1.4);
	}
}

/** The reserved strip above the bands: volta bracket, segno/coda/tempo/lock
 *  symbols, and the section label. Drawn in system (untranslated) space. */
function drawStripMarks(
	ctx: CanvasRenderingContext2D,
	measure: LaidMeasure,
	nextMeasure: LaidMeasure | null,
	layout: TrackLayout,
	editingSectionId: string | null,
	_lastMeasureIndex: number
): void {
	if (measure.volta) {
		const voltaEnds = !nextMeasure || nextMeasure.volta !== measure.volta;
		if (measure.voltaStart) line(ctx, measure.x + 1, 13, measure.x + 1, 3, BAR, 1.4);
		line(ctx, measure.x + 1, 3, measure.x + measure.width - 1, 3, BAR, 1.4);
		if (voltaEnds)
			line(ctx, measure.x + measure.width - 1, 3, measure.x + measure.width - 1, 13, BAR, 1.4);
		if (measure.voltaStart) text(ctx, `${measure.volta}.`, measure.x + 5, 13, sans(700, 9), BAR);
	}

	for (const sym of measure.symbols) {
		if (sym.kind === 'segno') {
			text(ctx, GLYPH.segno, sym.x, 15, bravura(15), INK);
		} else if (sym.kind === 'coda') {
			text(ctx, GLYPH.coda, sym.x, 15, bravura(15), INK);
		} else if (sym.kind === 'tempo') {
			text(ctx, GLYPH.metNoteQuarterUp, sym.x, 14, bravura(13), INK);
			text(ctx, `= ${sym.tempo}`, sym.x + 7, 14, sans(700, 10), INK);
		} else if (sym.kind === 'lock') {
			// Padlock: shackle arc + body.
			ctx.beginPath();
			ctx.moveTo(sym.x + 2.2, 9.5);
			ctx.lineTo(sym.x + 2.2, 7.6);
			ctx.arc(sym.x + 4.4, 7.6, 2.2, Math.PI, 0);
			ctx.lineTo(sym.x + 6.6, 9.5);
			ctx.strokeStyle = MUTED;
			ctx.lineWidth = 1.2;
			ctx.stroke();
			fillRect(ctx, sym.x, 9.5, 8.8, 5.8, MUTED);
		}
	}

	if (measure.sectionLetter && editingSectionId !== measure.sectionId) {
		text(
			ctx,
			`${measure.sectionLetter}${measure.sectionName ? ' ' + measure.sectionName : ''}`,
			measure.x + (measure.showHeader ? 4 : 2),
			12,
			sans(700, 10),
			MUTED
		);
	}
}
