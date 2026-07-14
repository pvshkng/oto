// Canvas port of StdVoice.svelte — one voice of the standard staff: tuplet
// brackets, ottava spans, beams, then per-beat rests/noteheads/stems/marks.
// Draw order and every coordinate/size/color mirror the SVG original 1:1.

import type { LaidBeat } from '$lib/notation/layout';
import { METRICS } from '$lib/notation/layout';
import {
	GLYPH,
	restGlyph,
	accidentalGlyph,
	dynamicGlyph,
	flagGlyph,
	tupletGlyphs
} from '$lib/notation/glyphs';
import {
	beamGroups,
	beamLine,
	beamYAt,
	beatArticulations,
	ottavaSpans,
	stemX,
	tupletSpans,
	SEC_BEAM_GAP
} from '../beam-geometry';
import {
	INK,
	MUTED,
	MARK,
	LEDGER,
	PAPER,
	bravura,
	sans,
	line,
	text,
	fillRect,
	fillCircle,
	ellipse,
	noteheadPaint
} from './style';

export function drawStdVoice(
	ctx: CanvasRenderingContext2D,
	beats: LaidBeat[],
	vIdx: number,
	bandHeight: number
): void {
	// Below-staff line for dynamics; above-staff strip for fermata/tuplets/8va.
	const staffBottom = METRICS.stdTopPad + 5 * METRICS.staffLineGap;

	// Tuplet brackets: one per run of same-size tuplet beats, above the staff.
	for (const span of tupletSpans(beats)) {
		const y = Math.min(10, span.top - 8);
		ctx.beginPath();
		ctx.moveTo(span.x1 - 5, y + 4);
		ctx.lineTo(span.x1 - 5, y);
		ctx.lineTo(span.x2 + 5, y);
		ctx.lineTo(span.x2 + 5, y + 4);
		ctx.strokeStyle = MARK;
		ctx.lineWidth = 1.1;
		ctx.stroke();
		fillRect(ctx, (span.x1 + span.x2) / 2 - 5, y - 5, 10, 9, PAPER);
		text(ctx, tupletGlyphs(span.n), (span.x1 + span.x2) / 2, y + 4, bravura(13), INK, 'center');
	}

	// Octave signs: italic label + dashed extent over (8va/15ma) or under.
	for (const span of ottavaSpans(beats)) {
		const above = span.ottava === '8va' || span.ottava === '15ma';
		const y = above ? Math.min(5, span.top - 7) : Math.max(bandHeight - 6, span.bottom + 9);
		text(ctx, span.ottava, span.x1 - 8, y + 3, sans(700, 9, true), MARK);
		line(ctx, span.x1 + 14, y, span.x2 + 8, y, MARK, 1, { dash: [3, 2] });
		line(ctx, span.x2 + 8, y, span.x2 + 8, above ? y + 5 : y - 5, MARK, 1);
	}

	for (const group of beamGroups(beats)) {
		const members = beats.filter((b) => b.beamGroup === group);
		const bl = beamLine(members);
		line(ctx, bl.x1, bl.y1, bl.x2, bl.y2, INK, 3.4);
		members.forEach((m, mi) => {
			const sx = stemX(m);
			const yb = beamYAt(bl, sx);
			// Stem runs from the notehead column straight to the beam.
			line(ctx, sx, m.stemDir === 1 ? m.noteBottom : m.noteTop, sx, yb, INK, 1.4);
			if (m.beams >= 2) {
				if (mi < members.length - 1 && members[mi + 1].beams >= 2) {
					// Secondary (16th/32nd) beam fully connects neighbouring members.
					const sx2 = stemX(members[mi + 1]);
					line(
						ctx,
						sx,
						yb + bl.dir * SEC_BEAM_GAP,
						sx2,
						beamYAt(bl, sx2) + bl.dir * SEC_BEAM_GAP,
						INK,
						3.4
					);
				} else if (mi === 0 || members[mi - 1].beams < 2) {
					// Isolated short note: stub points back toward its group.
					const sxe = sx + (mi === members.length - 1 ? -7 : 7);
					line(
						ctx,
						sx,
						yb + bl.dir * SEC_BEAM_GAP,
						sxe,
						beamYAt(bl, sxe) + bl.dir * SEC_BEAM_GAP,
						INK,
						3.4
					);
				}
			}
		});
	}

	for (const beat of beats) {
		if (beat.fermata) {
			text(
				ctx,
				GLYPH.fermataAbove,
				beat.x - 6,
				beat.rest ? 13 : Math.min(13, beat.stdStemTop - 4),
				bravura(20),
				INK
			);
		}
		if (beat.dynamic) {
			text(
				ctx,
				dynamicGlyph(beat.dynamic),
				beat.x,
				beat.rest ? staffBottom + 22 : Math.max(staffBottom + 22, beat.stdStemBottom + 16),
				bravura(18),
				INK,
				'center'
			);
		}
		if (beat.rest) {
			text(
				ctx,
				restGlyph(beat.duration),
				beat.x - 4,
				METRICS.stdTopPad + 3 * METRICS.staffLineGap,
				bravura(26),
				INK
			);
			if (beat.dotted) {
				fillCircle(ctx, beat.x + 9, METRICS.stdTopPad + 3 * METRICS.staffLineGap - 3, 1.6, INK);
			}
			continue;
		}

		for (const n of beat.notes) {
			for (const ly of n.ledgerLines) {
				line(ctx, n.x + n.headXOffset - 9, ly, n.x + n.headXOffset + 9, ly, LEDGER, 1);
			}
		}
		if (beat.notes.some((n) => n.techniques.includes('tremolo'))) {
			// Tremolo picking: three slashes across the stem (or above a whole note).
			const tx = beat.duration === 1 ? beat.x + 12 : stemX(beat);
			const ty = beat.stemDir === 1 ? beat.stdStemTop + 7 : beat.stdStemBottom - 15;
			for (const dy of [0, 4, 8]) {
				line(ctx, tx - 4, ty + dy + 2, tx + 4, ty + dy - 2, INK, 1.6);
			}
		}
		if (beat.duration !== 1 && beat.beamGroup === -1) {
			line(
				ctx,
				stemX(beat),
				beat.stemDir === 1 ? beat.stdStemBottom : beat.stdStemTop,
				stemX(beat),
				beat.stemDir === 1 ? beat.stdStemTop : beat.stdStemBottom,
				INK,
				1.4
			);
			if (beat.beams > 0) {
				// Flag baseline sits exactly at the stem tip (SMuFL flags anchor there).
				text(
					ctx,
					flagGlyph(beat.beams, beat.stemDir),
					stemX(beat),
					beat.stemDir === 1 ? beat.stdStemTop : beat.stdStemBottom,
					bravura(26),
					INK
				);
			}
		}
		for (const n of beat.notes) {
			if (n.accidental) {
				text(ctx, accidentalGlyph(n.accidental), n.x - 15, n.stdY + 4, bravura(24), INK);
			}
			if (n.dead) {
				// Dead/muted note: an X notehead at the open-string staff position.
				text(
					ctx,
					'✕',
					n.x + n.headXOffset,
					n.stdY + 4,
					sans(700, 13),
					vIdx === 1 ? MUTED : INK,
					'center'
				);
			} else {
				ellipse(
					ctx,
					n.x + n.headXOffset,
					n.stdY,
					6,
					4.4,
					-20,
					noteheadPaint({
						hollow: beat.duration <= 2,
						v2: vIdx === 1,
						ghost: n.techniques.includes('ghost')
					})
				);
			}
			if (beat.dotted) {
				fillCircle(ctx, n.x + n.headXOffset + 11, n.stdY, 1.6, INK);
			}
			const markY = beat.stemDir === 1 ? n.stdY - 12 : n.stdY + 14;
			if (n.techniques.includes('trill')) {
				text(ctx, 'tr', n.x + n.headXOffset, markY + 2, sans(600, 9, true), MUTED, 'center');
			}
			if (n.techniques.includes('artificial-harmonic')) {
				text(ctx, 'A.H.', n.x + n.headXOffset, markY - 2, sans(600, 8), MUTED, 'center');
			}
			if (n.tie) {
				const ud = beat.stemDir === 1 ? 1 : -1;
				ctx.beginPath();
				ctx.moveTo(n.x + n.headXOffset + 7, n.stdY + ud * 3);
				ctx.quadraticCurveTo(
					(n.x + n.headXOffset + n.tie.x2) / 2,
					n.stdY + ud * 11,
					n.tie.x2 - 7,
					n.tie.stdY2 + ud * 3
				);
				ctx.strokeStyle = INK;
				ctx.lineWidth = 1.3;
				ctx.stroke();
			}
			if (n.tieIn) {
				// Tie whose origin sits on the previous system: short incoming stub.
				const ud = beat.stemDir === 1 ? 1 : -1;
				ctx.beginPath();
				ctx.moveTo(n.x + n.headXOffset - 20, n.stdY + ud * 9);
				ctx.quadraticCurveTo(
					n.x + n.headXOffset - 13,
					n.stdY + ud * 11,
					n.x + n.headXOffset - 7,
					n.stdY + ud * 3
				);
				ctx.strokeStyle = INK;
				ctx.lineWidth = 1.3;
				ctx.stroke();
			}
		}
		// Articulations: one mark per beat, centred over the chord on the side
		// away from the beam, stacked outward when a beat carries more than one.
		if (beat.notes.length) {
			const up = beat.stemDir === 1;
			const ys = beat.notes.map((n) => n.stdY);
			const anchorY = up ? Math.min(...ys) - 12 : Math.max(...ys) + 14;
			beatArticulations(beat).forEach((art, ai) => {
				const ay = anchorY + (up ? -ai * 8 : ai * 8);
				if (art === 'staccato') {
					fillCircle(ctx, beat.x, ay, 1.8, INK);
				} else if (art === 'tenuto') {
					line(ctx, beat.x - 4, ay, beat.x + 4, ay, INK, 1.6);
				} else if (art === 'accent') {
					text(ctx, '›', beat.x, ay + 4, sans(700, 13), INK, 'center');
				} else if (art === 'heavy-accent') {
					text(ctx, '^', beat.x, ay + 4, sans(700, 11), INK, 'center');
				}
			});
		}
	}
}
