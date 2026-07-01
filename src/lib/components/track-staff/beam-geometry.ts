// Pure beam/stem geometry for the standard-staff and rhythm bands. No store
// access — every function here is a function of the LaidBeat data only.

import type { LaidBeat } from '$lib/notation/layout';

export const STEM = 26; // nominal stem length beyond the furthest notehead
export const MIN_STEM = 14; // never let a stem get shorter than this
export const MAX_SLOPE = 0.22; // cap beam slant so it stays legible
export const SEC_BEAM_GAP = 4.5; // vertical offset of secondary (16th) beams

export interface BeamGeom {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	dir: 1 | -1;
}

// Runs of consecutive beats that contain a let-ring note → drawn as a bracket.
export function letRingSpans(beats: LaidBeat[]): { x1: number; x2: number }[] {
	const spans: { x1: number; x2: number }[] = [];
	let start = -1;
	for (let i = 0; i < beats.length; i++) {
		const has = beats[i].notes.some((n) => n.techniques.includes('let-ring'));
		if (has && start < 0) start = i;
		if (!has && start >= 0) {
			spans.push({ x1: beats[start].x, x2: beats[i - 1].x });
			start = -1;
		}
	}
	if (start >= 0) spans.push({ x1: beats[start].x, x2: beats[beats.length - 1].x });
	return spans;
}

export function beamGroups(beats: LaidBeat[]): number[] {
	const groups: number[] = [];
	for (const b of beats)
		if (b.beamGroup >= 0 && !groups.includes(b.beamGroup)) groups.push(b.beamGroup);
	return groups.sort((a, b) => a - b);
}

// Stems attach to the side of the notehead column: right for up-stems, left
// for down-stems. Half a notehead width keeps them flush against the heads.
export function stemX(b: LaidBeat): number {
	return b.x + b.stemDir * 6.5;
}

// A slanted beam line for a group: follows the pitch contour of its first and
// last members, clamps the slope, then shifts so every stem clears its
// noteheads with at least MIN_STEM of length.
export function beamLine(members: LaidBeat[]): BeamGeom {
	const dir = members[0].stemDir;
	const x1 = stemX(members[0]);
	const x2 = stemX(members[members.length - 1]);
	const dx = x2 - x1 || 1;
	const edge = (b: LaidBeat) => (dir === 1 ? b.noteTop - STEM : b.noteBottom + STEM);
	let y1 = edge(members[0]);
	let y2 = edge(members[members.length - 1]);

	// Clamp slope around the midpoint.
	let slope = (y2 - y1) / dx;
	slope = Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, slope));
	const midX = (x1 + x2) / 2;
	const midY = (y1 + y2) / 2;
	y1 = midY - slope * (midX - x1);
	y2 = midY + slope * (x2 - midX);

	// Lift/lower the whole line until no stem is shorter than MIN_STEM.
	for (const m of members) {
		const yAt = y1 + (y2 - y1) * ((stemX(m) - x1) / dx);
		if (dir === 1) {
			const required = m.noteTop - MIN_STEM;
			if (yAt > required) {
				y1 -= yAt - required;
				y2 -= yAt - required;
			}
		} else {
			const required = m.noteBottom + MIN_STEM;
			if (yAt < required) {
				y1 += required - yAt;
				y2 += required - yAt;
			}
		}
	}
	return { x1, y1, x2, y2, dir };
}

export function beamYAt(bl: BeamGeom, x: number): number {
	return bl.y1 + (bl.y2 - bl.y1) * ((x - bl.x1) / (bl.x2 - bl.x1 || 1));
}
