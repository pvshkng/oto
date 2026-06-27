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
	s.cursor = { track: 0, measure: 0, beat: 0, string: 0, voice: 0 };
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

describe('ScoreStore voices (mixed durations)', () => {
	let s: ScoreStore;
	beforeEach(() => (s = freshStore()));

	it('creates a second voice on demand and keeps voice 1 intact', () => {
		s.setCursor({ measure: 0, beat: 0, string: 0, voice: 0 });
		s.setFretAtCursor(3); // voice 1
		s.setVoice(1);
		s.setFretAtCursor(7); // voice 2
		const m = s.track.measures[0];
		expect(m.beats[0].notes[0].fret).toBe(3);
		expect(m.voice2).toBeDefined();
		expect(m.voice2![0].notes[0].fret).toBe(7);
	});

	it('lets the two voices hold different durations at the same time', () => {
		s.activeDuration = 2; // half note
		s.setCursor({ voice: 0, beat: 0, string: 0 });
		s.setFretAtCursor(0);
		s.setVoice(1);
		s.activeDuration = 8; // eighth note
		s.setFretAtCursor(5);
		const m = s.track.measures[0];
		expect(m.beats[0].duration).toBe(2);
		expect(m.voice2![0].duration).toBe(8);
	});

	it('removes voice 2 when all its beats are deleted', () => {
		s.setVoice(1);
		s.setFretAtCursor(4);
		expect(s.track.measures[0].voice2).toBeDefined();
		// delete every beat of voice 2 (the entered note + any auto-grown rest)
		s.setCursor({ voice: 1, beat: 0 });
		let guard = 10;
		while (s.track.measures[0].voice2 && guard-- > 0) {
			s.setCursor({ voice: 1, beat: 0 });
			s.deleteBeat();
		}
		expect(s.track.measures[0].voice2).toBeUndefined();
		expect(s.cursor.voice).toBe(0);
	});
});

describe('ScoreStore auto-grow entry', () => {
	let s: ScoreStore;
	beforeEach(() => (s = freshStore()));

	it('appends a trailing beat while the bar has room', () => {
		s.activeDuration = 4; // quarter; a 4/4 bar holds four
		s.setCursor({ measure: 0, beat: 0, string: 0 });
		s.setFretAtCursor(0);
		expect(s.track.measures[0].beats.length).toBeGreaterThanOrEqual(2);
	});

	it('stops growing once the bar is full', () => {
		s.activeDuration = 1; // a whole note fills 4/4 entirely
		s.setCursor({ measure: 0, beat: 0, string: 0 });
		s.setFretAtCursor(0);
		expect(s.track.measures[0].beats.length).toBe(1);
	});
});

describe('ScoreStore time signature & beat insertion', () => {
	let s: ScoreStore;
	beforeEach(() => (s = freshStore()));

	it('changes a single bar time signature across all tracks', () => {
		s.addTrack();
		s.setMeasureTimeSignature(1, 3, 4);
		expect(s.score.tracks[0].measures[1].timeSignature).toEqual([3, 4]);
		expect(s.score.tracks[1].measures[1].timeSignature).toEqual([3, 4]);
		// bar 0 keeps the score default
		expect(s.score.tracks[0].measures[0].timeSignature).toBeUndefined();
	});

	it('reports the effective time signature, carrying a change forward', () => {
		s.setMeasureTimeSignature(1, 6, 8);
		expect(s.timeSignatureAt(0)).toEqual([4, 4]); // score default
		expect(s.timeSignatureAt(1)).toEqual([6, 8]);
		expect(s.timeSignatureAt(2)).toEqual([6, 8]); // carried forward
	});

	it('inserts a beat before the cursor, pushing the current beat right', () => {
		s.setCursor({ measure: 0, beat: 0, string: 0 });
		s.setFretAtCursor(7); // beat 0 now has fret 7
		s.insertBeatBefore();
		// the new empty beat sits at index 0; the fret-7 beat moved to index 1
		expect(s.track.measures[0].beats[0].rest).toBe(true);
		expect(s.track.measures[0].beats[1].notes[0].fret).toBe(7);
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
