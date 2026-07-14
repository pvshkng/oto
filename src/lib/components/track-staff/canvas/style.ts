// Canvas paint constants + tiny draw helpers for the notation renderer.
// Every value is lifted verbatim from the Tailwind classes the SVG renderer
// used (see git history of TrackStaff/StdVoice/TabVoice), so the canvas output
// is pixel-identical to the old SVG.

export const INK = '#18181b';
export const MUTED = '#71717a';
export const BAR = '#3f3f46';
export const STAFF = '#d4d4d8';
export const LEDGER = '#a1a1aa';
export const MARK = '#52525b';
export const PAPER = '#ffffff';

/** Bravura (SMuFL) font string at a given px size. */
export const bravura = (px: number) => `${px}px Bravura, serif`;

/** UI sans font string mirroring the `ui-sans-serif,sans-serif` classes. */
export const sans = (weight: number, px: number, italic = false) =>
	`${italic ? 'italic ' : ''}${weight} ${px}px ui-sans-serif, sans-serif`;

/** Fret-number font — `[font:600_12px_ui-monospace,monospace]`. */
export const FRET_FONT = '600 12px ui-monospace, monospace';

/** Stroke a straight line. Dash state is always reset afterwards. */
export function line(
	ctx: CanvasRenderingContext2D,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	color: string,
	width: number,
	opts?: { cap?: CanvasLineCap; dash?: number[] }
): void {
	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(x2, y2);
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.lineCap = opts?.cap ?? 'butt';
	if (opts?.dash) ctx.setLineDash(opts.dash);
	ctx.stroke();
	if (opts?.dash) ctx.setLineDash([]);
	ctx.lineCap = 'butt';
}

/** Fill a text run. SVG `<text>` y is the baseline, which matches canvas's
 *  default 'alphabetic' baseline — coordinates port 1:1. */
export function text(
	ctx: CanvasRenderingContext2D,
	s: string,
	x: number,
	y: number,
	font: string,
	color: string,
	align: CanvasTextAlign = 'left'
): void {
	ctx.font = font;
	ctx.fillStyle = color;
	ctx.textAlign = align;
	ctx.textBaseline = 'alphabetic';
	ctx.fillText(s, x, y);
	ctx.textAlign = 'left';
}

export function fillRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	color: string
): void {
	ctx.fillStyle = color;
	ctx.fillRect(x, y, w, h);
}

export function fillCircle(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	r: number,
	color: string
): void {
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fillStyle = color;
	ctx.fill();
}

export interface ShapePaint {
	fill: string;
	stroke?: string;
	lineWidth?: number;
	/** globalAlpha for the whole shape (ghost notes). */
	alpha?: number;
}

/** Exact port of `noteheadStyle` (note-styles.ts tailwind-variants cascade). */
export function noteheadPaint(v: { hollow: boolean; v2: boolean; ghost: boolean }): ShapePaint {
	const inkColor = v.v2 ? MUTED : INK;
	const alpha = v.ghost ? 0.35 : undefined;
	if (v.hollow) return { fill: PAPER, stroke: inkColor, lineWidth: 1.6, alpha };
	return { fill: inkColor, alpha };
}

/** Exact port of `fretStyle`'s fill cascade. */
export function fretColor(v: { mutedNote: boolean; v2: boolean }): string {
	if (v.v2) return MUTED;
	return v.mutedNote ? LEDGER : INK;
}

/** Fill (and optionally stroke) an ellipse, with optional rotation in degrees. */
export function ellipse(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	rotateDeg: number,
	paint: ShapePaint
): void {
	ctx.save();
	if (paint.alpha !== undefined) ctx.globalAlpha = paint.alpha;
	ctx.beginPath();
	ctx.ellipse(cx, cy, rx, ry, (rotateDeg * Math.PI) / 180, 0, Math.PI * 2);
	ctx.fillStyle = paint.fill;
	ctx.fill();
	if (paint.stroke) {
		ctx.strokeStyle = paint.stroke;
		ctx.lineWidth = paint.lineWidth ?? 1;
		ctx.stroke();
	}
	ctx.restore();
}
