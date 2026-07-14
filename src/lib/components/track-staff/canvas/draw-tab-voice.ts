// Canvas port of TabVoice.svelte — one voice of the tab band: string-line
// masks, fret labels and every technique marker. Draw order and every
// coordinate/size/color mirror the SVG original 1:1.

import type { LaidBeat } from '$lib/notation/layout';
import { METRICS } from '$lib/notation/layout';
import { dynamicGlyph, GLYPH, tupletGlyphs } from '$lib/notation/glyphs';
import { beatArticulations, letRingSpans, tupletSpans } from '../beam-geometry';
import { fretText } from '../fret-label';
import {
	INK,
	MUTED,
	MARK,
	LEDGER,
	BAR,
	PAPER,
	FRET_FONT,
	bravura,
	sans,
	line,
	text,
	fillRect,
	fillCircle,
	fretColor
} from './style';

export function drawTabVoice(
	ctx: CanvasRenderingContext2D,
	beats: LaidBeat[],
	vIdx: number,
	bandHeight: number,
	// Draw fermata/dynamics/tuplet marks here — only when the standard band
	// (their usual home) is hidden, so they aren't drawn twice.
	showMarks = false
): void {
	// String-line masks under the fret numbers, drawn FIRST so everything else
	// renders over the number instead of being punched through by a white box.
	for (const beat of beats) {
		for (const n of beat.notes) {
			const label = fretText(n);
			const maskW = label.length * 6.5 + 3;
			fillRect(ctx, n.x - maskW / 2, n.tabY - 4.5, maskW, 9, PAPER);
		}
	}

	if (showMarks) {
		// Tuplet brackets over the tab (only when the standard staff is hidden).
		for (const span of tupletSpans(beats)) {
			const y = 6;
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
	}

	// "let ring" label + dashed extent in the reserved headroom above the strings.
	for (const span of letRingSpans(beats)) {
		const lineStart = span.x1 + 34;
		const lineEnd = Math.max(lineStart + 6, span.x2 + 7);
		text(ctx, 'let ring', span.x1 - 7, 9, sans(600, 8, true), MUTED);
		line(ctx, lineStart, 6, lineEnd, 6, LEDGER, 1, { dash: [3, 2] });
		line(ctx, lineEnd, 6, lineEnd, 12, LEDGER, 1, { dash: [3, 2] });
	}

	beats.forEach((beat, bi) => {
		if (beat.strum && beat.notes.length) {
			// Strum arrow beside the chord: down-strum arrowhead points up.
			const ys = beat.notes.map((n) => n.tabY);
			const yTop = Math.min(...ys) - 5;
			const yBot = Math.max(...ys, Math.min(...ys) + METRICS.tabLineGap) + 5;
			const sx = beat.x - 13;
			line(ctx, sx, yTop, sx, yBot, BAR, 1.5);
			ctx.beginPath();
			if (beat.strum === 'down') {
				ctx.moveTo(sx - 3, yTop + 5);
				ctx.lineTo(sx, yTop);
				ctx.lineTo(sx + 3, yTop + 5);
			} else {
				ctx.moveTo(sx - 3, yBot - 5);
				ctx.lineTo(sx, yBot);
				ctx.lineTo(sx + 3, yBot - 5);
			}
			ctx.strokeStyle = BAR;
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
		if (showMarks && beat.fermata) {
			text(ctx, GLYPH.fermataAbove, beat.x - 6, 10, bravura(18), INK);
		}
		if (showMarks && beat.dynamic) {
			text(ctx, dynamicGlyph(beat.dynamic), beat.x, bandHeight - 2, bravura(16), INK, 'center');
		}
		// Articulations: one mark per beat, centred above the whole chord and
		// clear of every fret number, stacked upward when more than one.
		if (beat.notes.length) {
			const topY = Math.min(...beat.notes.map((n) => n.tabY));
			beatArticulations(beat).forEach((art, ai) => {
				const ay = topY - 10 - ai * 8;
				if (art === 'staccato') {
					fillCircle(ctx, beat.x, ay, 1.8, INK);
				} else if (art === 'tenuto') {
					line(ctx, beat.x - 4, ay, beat.x + 4, ay, INK, 1.6);
				} else if (art === 'accent') {
					text(ctx, '›', beat.x, ay + 4, sans(700, 13), MUTED, 'center');
				} else if (art === 'heavy-accent') {
					text(ctx, '^', beat.x, ay + 4, sans(700, 11), MUTED, 'center');
				}
			});
		}
		for (const n of beat.notes) {
			const isDead = n.techniques.includes('dead');
			const fretLabel = fretText(n);
			text(
				ctx,
				fretLabel,
				n.x,
				n.tabY + 4,
				FRET_FONT,
				fretColor({ mutedNote: isDead, v2: vIdx === 1 }),
				'center'
			);
			if (n.techniques.includes('palm-mute')) {
				text(ctx, 'P.M.', n.x, n.tabY - 9, sans(600, 8), MUTED, 'center');
			}
			if (n.techniques.includes('artificial-harmonic')) {
				text(ctx, 'A.H.', n.x, n.tabY - 18, sans(600, 8), MUTED, 'center');
			}
			if (n.techniques.includes('tap')) {
				text(ctx, 'T', n.x, n.tabY - 9, sans(600, 8), MUTED, 'center');
			}
			if (n.techniques.includes('slap')) {
				text(ctx, 'S', n.x, n.tabY - 9, sans(600, 8), MUTED, 'center');
			}
			if (n.techniques.includes('pop')) {
				text(ctx, 'P', n.x, n.tabY - 9, sans(600, 8), MUTED, 'center');
			}
			if (n.techniques.includes('trill')) {
				text(ctx, 'tr', n.x + 10, n.tabY - 9, sans(600, 9, true), MUTED, 'center');
			}
			if (n.techniques.includes('tremolo')) {
				// Tremolo picking: three short slashes beside the fret number.
				for (const dy of [0, 3, 6]) {
					line(ctx, n.x + 9, n.tabY - 6 + dy, n.x + 15, n.tabY - 9 + dy, MARK, 1.3);
				}
			}
			if (n.techniques.includes('fade-in')) {
				// Fade in: small crescendo hairpin under the fret number.
				ctx.beginPath();
				ctx.moveTo(n.x + 16, n.tabY + 9);
				ctx.lineTo(n.x + 6, n.tabY + 6);
				ctx.lineTo(n.x + 16, n.tabY + 3);
				ctx.strokeStyle = MARK;
				ctx.lineWidth = 1.1;
				ctx.stroke();
			}
			if (n.techniques.includes('grace')) {
				text(ctx, '𝆔', n.x - 9, n.tabY, sans(600, 10), MUTED, 'center');
			}
			if (n.techniques.includes('vibrato')) {
				text(ctx, '∿', n.x + 10, n.tabY + 4, sans(400, 12), MUTED);
			}
			if (n.techniques.includes('wide-vibrato')) {
				text(ctx, '∿∿', n.x + 10, n.tabY + 4, sans(700, 12), MUTED);
			}
			if (n.techniques.includes('bend')) {
				// `M x+8,y q 10 -2 12 -14` — bend arc up from the fret number.
				ctx.beginPath();
				ctx.moveTo(n.x + 8, n.tabY);
				ctx.quadraticCurveTo(n.x + 18, n.tabY - 2, n.x + 20, n.tabY - 14);
				ctx.strokeStyle = MARK;
				ctx.lineWidth = 1.3;
				ctx.stroke();
				// Arrowhead at the top of the bend, value label to its right.
				ctx.beginPath();
				ctx.moveTo(n.x + 16.5, n.tabY - 11);
				ctx.lineTo(n.x + 20, n.tabY - 15.5);
				ctx.lineTo(n.x + 23, n.tabY - 10.5);
				ctx.lineJoin = 'round';
				ctx.stroke();
				ctx.lineJoin = 'miter';
				text(
					ctx,
					n.bend === 0.5 ? '½' : n.bend === 1 ? 'full' : String(n.bend ?? 'full'),
					n.x + 25,
					n.tabY - 11,
					sans(600, 8),
					MUTED
				);
			}
			if (n.techniques.includes('release')) {
				// `M x+8,y-16 q 10 2 12 16`
				ctx.beginPath();
				ctx.moveTo(n.x + 8, n.tabY - 16);
				ctx.quadraticCurveTo(n.x + 18, n.tabY - 14, n.x + 20, n.tabY);
				ctx.strokeStyle = MARK;
				ctx.lineWidth = 1.3;
				ctx.stroke();
				text(ctx, '↓', n.x + 24, n.tabY - 13, sans(600, 8), MUTED);
			}
			if (n.techniques.includes('bend-release')) {
				// `M x+8,y q 5 -2 6 -12 q 4 10 8 12`
				ctx.beginPath();
				ctx.moveTo(n.x + 8, n.tabY);
				ctx.quadraticCurveTo(n.x + 13, n.tabY - 2, n.x + 14, n.tabY - 12);
				ctx.quadraticCurveTo(n.x + 18, n.tabY - 2, n.x + 22, n.tabY);
				ctx.strokeStyle = MARK;
				ctx.lineWidth = 1.3;
				ctx.stroke();
				text(ctx, 'br', n.x + 24, n.tabY - 13, sans(600, 8), MUTED);
			}
			if (n.techniques.includes('slide') && n.slideTo !== undefined) {
				// Slide stroke ends short of the next beat's fret label so it never
				// strikes through the destination number.
				const nextBeat = beats[bi + 1];
				const nextNote = nextBeat?.notes.find((m) => m.string === n.string);
				const nextLabel = nextNote ? fretText(nextNote) : null;
				const nextClear = nextBeat
					? nextBeat.x - (nextLabel ? (nextLabel.length * 6.5 + 3) / 2 + 2 : 9)
					: Infinity;
				const slideEnd = Math.max(n.x + 13, Math.min(n.x + 24, nextClear));
				line(
					ctx,
					n.x + 8,
					n.tabY + (n.slideTo > n.fret ? 3 : -3),
					slideEnd,
					n.tabY + (n.slideTo > n.fret ? -3 : 3),
					MARK,
					1.6
				);
			}
			if (n.techniques.includes('hammer') || n.techniques.includes('pull')) {
				// `M x+8,y-4 q 8 -8 16 0`
				ctx.beginPath();
				ctx.moveTo(n.x + 8, n.tabY - 4);
				ctx.quadraticCurveTo(n.x + 16, n.tabY - 12, n.x + 24, n.tabY - 4);
				ctx.strokeStyle = MARK;
				ctx.lineWidth = 1.3;
				ctx.stroke();
			}
			if (n.tie) {
				ctx.beginPath();
				ctx.moveTo(n.x + 7, n.tabY - 5);
				ctx.quadraticCurveTo((n.x + n.tie.x2) / 2, n.tabY - 13, n.tie.x2 - 7, n.tie.tabY2 - 5);
				ctx.strokeStyle = INK;
				ctx.lineWidth = 1.3;
				ctx.stroke();
			}
			if (n.tieIn) {
				// Tie whose origin sits on the previous system: short incoming stub.
				ctx.beginPath();
				ctx.moveTo(n.x - 20, n.tabY - 11);
				ctx.quadraticCurveTo(n.x - 13, n.tabY - 12, n.x - 8, n.tabY - 6);
				ctx.strokeStyle = INK;
				ctx.lineWidth = 1.3;
				ctx.stroke();
			}
		}
	});
}
