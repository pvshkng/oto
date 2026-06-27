import { describe, it, expect, beforeEach } from 'vitest';
import { ScoreStore } from './score.svelte';
import { makeScore, makeTrack, emptyMeasure } from '$lib/oto/format';

function freshStore(): ScoreStore {
	const s = new ScoreStore();
	s.score = makeScore({
		tracks: [
			makeTrack({ measures: [emptyMeasure(), emptyMeasure(), emptyMeasure(), emptyMeasure()] })
		]
	});
	s.cursor = { track: 0, measure: 0, beat: 0, string: 0 };
	return s;
}

describe('ScoreStore note entry', () => {
	let s: ScoreStore;
	beforeEach(() => (s = freshStore()));

	it('places a fret at the cursor string', () => {
		s.setCursor({ measure: 0, beat: 0, string: 2 });
		s.setFretAtCursor(5);
		const beat = s.track.measures[0].beats[0];
		expect(beat.rest).toBe(false);
		expect(beat.notes).toEqual([{ string: 2, fret: 5 }]);
	});

	it('replaces the fret when typing again on the same string', () => {
		s.setCursor({ string: 0 });
		s.setFretAtCursor(3);
		s.setFretAtCursor(7);
		expect(s.track.measures[0].beats[0].notes).toEqual([{ string: 0, fret: 7 }]);
	});

	it('keeps chords sorted by string', () => {
		s.setCursor({ string: 3 });
		s.setFretAtCursor(2);
		s.setCursor({ string: 1 });
		s.setFretAtCursor(0);
		const strings = s.track.measures[0].beats[0].notes.map((n) => n.string);
		expect(strings).toEqual([1, 3]);
	});

	it('deletes a note and reverts the beat to a rest when empty', () => {
		s.setCursor({ string: 0 });
		s.setFretAtCursor(4);
		s.deleteNoteAtCursor();
		expect(s.track.measures[0].beats[0].rest).toBe(true);
		expect(s.track.measures[0].beats[0].notes.length).toBe(0);
	});

	it('toggles techniques on the current note', () => {
		s.setCursor({ string: 0 });
		s.setFretAtCursor(5);
		s.toggleTechnique('palm-mute');
		expect(s.currentNote?.techniques).toContain('palm-mute');
		s.toggleTechnique('palm-mute');
		expect(s.currentNote?.techniques).not.toContain('palm-mute');
	});
});

describe('ScoreStore selection & loop', () => {
	let s: ScoreStore;
	beforeEach(() => (s = freshStore()));

	it('extends the selection across beats with a fixed anchor', () => {
		// give measure 0 three beats
		s.insertBeat();
		s.insertBeat();
		s.setCursor({ measure: 0, beat: 0 });
		s.extendSelection('right');
		s.extendSelection('right');
		const bounds = s.loopBounds!;
		expect(bounds.startBeat).toBe(0);
		expect(bounds.endBeat).toBe(2);
		expect(s.loopEnabled).toBe(true);
	});

	it('normalises loop bounds regardless of direction', () => {
		s.insertBeat();
		s.insertBeat();
		s.setCursor({ measure: 0, beat: 2 });
		s.extendSelection('left');
		const bounds = s.loopBounds!;
		expect(bounds.startBeat).toBe(1);
		expect(bounds.endBeat).toBe(2);
	});

	it('clears the selection on a plain cursor move', () => {
		s.insertBeat();
		s.setCursor({ measure: 0, beat: 0 });
		s.extendSelection('right');
		expect(s.selection).not.toBeNull();
		s.moveCursor('right');
		expect(s.selection).toBeNull();
	});
});

describe('ScoreStore transpose & tracks', () => {
	let s: ScoreStore;
	beforeEach(() => (s = freshStore()));

	it('adds and removes tracks but keeps at least one', () => {
		s.addTrack();
		expect(s.score.tracks.length).toBe(2);
		s.removeTrack(1);
		expect(s.score.tracks.length).toBe(1);
		s.removeTrack(0); // refuses to drop the last track
		expect(s.score.tracks.length).toBe(1);
	});

	it('detune rewrites the active track tuning', () => {
		const before = s.score.tracks[0].tuning[0];
		s.detune(0, -2);
		expect(s.score.tracks[0].tuning[0]).not.toBe(before);
	});

	it('always keeps one notation view enabled', () => {
		s.toggleTrackView(0, 'standard');
		s.toggleTrackView(0, 'tab');
		const v = s.score.tracks[0].view;
		expect(v.standard || v.tab || v.rhythm).toBe(true);
	});
});
