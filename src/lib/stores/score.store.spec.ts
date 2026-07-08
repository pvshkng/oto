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

	it('setCursor (as used by pause/stop) never pushes undo history or touches an active loop selection', () => {
		s.insertBeat();
		s.setCursor({ measure: 0, beat: 0 });
		s.extendSelection('right');
		const bounds = s.loopBounds;
		s.loopEnabled = true;
		const undoDepthBefore = s.canUndo;

		// Mimic pausePlayback()/stopPlayback() syncing the cursor mid-loop.
		s.setCursor({ measure: 0, beat: 1 });

		expect(s.canUndo).toBe(undoDepthBefore);
		expect(s.selection).not.toBeNull();
		expect(s.loopBounds).toEqual(bounds);
		expect(s.loopEnabled).toBe(true);
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

	it('loadScore re-anchors focus to the new score so tracks render immediately', () => {
		// Simulate a stale focus left over from the previous document (e.g. an
		// import replacing the score with tracks that have fresh IDs).
		s.focusedTrackId = 'stale-id-from-previous-score';
		const imported = makeScore({
			tracks: [makeTrack({ name: 'Imported Guitar' })]
		});
		s.loadScore(JSON.stringify(imported));
		expect(s.focusedTrackId).toBe(s.score.tracks[0].id);
		expect(s.isTrackVisible(s.score.tracks[0].id)).toBe(true);
	});

	it('newScore re-anchors focus to the fresh blank score', () => {
		s.focusedTrackId = 'stale-id-from-previous-score';
		s.newScore();
		expect(s.focusedTrackId).toBe(s.score.tracks[0].id);
		expect(s.isTrackVisible(s.score.tracks[0].id)).toBe(true);
	});
});

describe('ScoreStore mixer setters', () => {
	let s: ScoreStore;
	beforeEach(() => (s = freshStore()));

	it('clamps volume to 0..1', () => {
		s.setVolume(0, 1.5);
		expect(s.score.tracks[0].volume).toBe(1);
		s.setVolume(0, -0.2);
		expect(s.score.tracks[0].volume).toBe(0);
	});

	it('clamps pan to -1..1', () => {
		s.setPan(0, 2);
		expect(s.score.tracks[0].pan).toBe(1);
		s.setPan(0, -2);
		expect(s.score.tracks[0].pan).toBe(-1);
	});

	it('clamps EQ bands to -12..12 and updates a single band', () => {
		s.setEqBand(0, 'low', 20);
		s.setEqBand(0, 'mid', -20);
		s.setEqBand(0, 'high', 4);
		expect(s.score.tracks[0].eq).toEqual({ low: 12, mid: -12, high: 4 });
	});

	it('resets EQ to flat as a single undoable step', () => {
		s.setEqBand(0, 'low', 6);
		s.resetEq(0);
		expect(s.score.tracks[0].eq).toEqual({ low: 0, mid: 0, high: 0 });
		s.undo();
		expect(s.score.tracks[0].eq.low).toBe(6);
	});

	it('clamps master volume to 0..1', () => {
		s.setMasterVolume(5);
		expect(s.score.masterVolume).toBe(1);
		s.setMasterVolume(-1);
		expect(s.score.masterVolume).toBe(0);
	});

	it('collapses a fader drag into one undo entry via begin/endGesture', () => {
		expect(s.canUndo).toBe(false);
		s.beginGesture();
		s.setVolume(0, 0.6);
		s.setVolume(0, 0.5);
		s.setVolume(0, 0.4);
		s.endGesture();
		expect(s.score.tracks[0].volume).toBe(0.4);
		// One snapshot for the whole drag.
		s.undo();
		expect(s.score.tracks[0].volume).toBe(0.8); // default track volume
		expect(s.canUndo).toBe(false);
	});

	it('only snapshots once even if beginGesture is called repeatedly', () => {
		const before = s.score.tracks[0].volume;
		s.beginGesture();
		s.beginGesture();
		s.setVolume(0, 0.3);
		s.endGesture();
		s.undo();
		expect(s.score.tracks[0].volume).toBe(before);
		expect(s.canUndo).toBe(false);
	});
});

describe('ScoreStore sections', () => {
	let s: ScoreStore;
	beforeEach(() => (s = freshStore()));

	it('adds a section with no label by default and keeps them sorted by measure', () => {
		s.addSection(8);
		s.addSection(2);
		expect(s.score.sections.map((x) => x.measure)).toEqual([2, 8]);
		expect(s.score.sections[1].label).toBe('');
	});

	it('stops adding sections once the 26-letter (A–Z) limit is reached', () => {
		for (let i = 0; i < 26; i++) s.addSection(i);
		expect(s.score.sections).toHaveLength(26);
		expect(s.canAddSection).toBe(false);
		s.addSection(26);
		expect(s.score.sections).toHaveLength(26);
	});

	it('updates a section label and re-sorts when the measure changes', () => {
		s.addSection(0, 'Intro');
		s.addSection(4, 'Verse');
		const intro = s.score.sections.find((x) => x.label === 'Intro')!;
		s.updateSection(intro.id, { label: 'Opening', measure: 10 });
		const moved = s.score.sections.find((x) => x.id === intro.id)!;
		expect(moved.label).toBe('Opening');
		expect(moved.measure).toBe(10);
		// "Verse" (measure 4) now sorts before the moved section.
		expect(s.score.sections[0].label).toBe('Verse');
	});

	it('removes a section and supports undo', () => {
		s.addSection(0, 'Intro');
		const id = s.score.sections[0].id;
		s.removeSection(id);
		expect(s.score.sections).toHaveLength(0);
		s.undo();
		expect(s.score.sections).toHaveLength(1);
	});
});

describe('ScoreStore bar lock & line break', () => {
	let s: ScoreStore;
	beforeEach(() => (s = freshStore()));

	it('toggles the lock on the same bar of every track', () => {
		s.addTrack();
		s.setCursor({ track: 0, measure: 1 });
		s.toggleMeasureLocked(1);
		expect(s.score.tracks[0].measures[1].locked).toBe(true);
		expect(s.score.tracks[1].measures[1].locked).toBe(true);
		s.toggleMeasureLocked(1);
		expect(s.score.tracks[0].measures[1].locked).toBeUndefined();
	});

	it('rejects note entry, technique and beat edits on a locked bar', () => {
		s.setCursor({ measure: 0, beat: 0, string: 0 });
		s.setFretAtCursor(5);
		s.toggleMeasureLocked(0);
		s.setFretAtCursor(9);
		expect(s.track.measures[0].beats[0].notes).toEqual([{ string: 0, fret: 5 }]);
		s.toggleTechnique('palm-mute');
		expect(s.currentNote?.techniques ?? []).not.toContain('palm-mute');
		const beatCount = s.track.measures[0].beats.length;
		s.insertBeat();
		expect(s.track.measures[0].beats.length).toBe(beatCount);
		s.deleteNoteAtCursor();
		expect(s.track.measures[0].beats[0].notes).toEqual([{ string: 0, fret: 5 }]);
	});

	it('rejects clearing and deleting a locked bar, and edits again after unlock', () => {
		s.setCursor({ measure: 0, beat: 0, string: 0 });
		s.setFretAtCursor(5);
		s.toggleMeasureLocked(0);
		s.clearMeasureAt(0);
		expect(s.track.measures[0].beats[0].notes).toHaveLength(1);
		const measureCount = s.track.measures.length;
		s.removeMeasureFromAll(0);
		expect(s.track.measures.length).toBe(measureCount);
		s.toggleMeasureLocked(0);
		s.clearMeasureAt(0);
		expect(s.track.measures[0].beats[0].rest).toBe(true);
	});

	it('skips locked bars when deleting a multi-bar selection', () => {
		s.setCursor({ track: 0, measure: 0, beat: 0, string: 0 });
		s.setFretAtCursor(3);
		s.setCursor({ measure: 1, beat: 0, string: 0 });
		s.setFretAtCursor(4);
		s.toggleMeasureLocked(1);
		s.setCursor({ measure: 0, beat: 0 });
		s.setSelectionTo(1, 0);
		s.deleteNotesInSelection();
		expect(s.track.measures[0].beats[0].rest).toBe(true);
		expect(s.track.measures[1].beats[0].notes).toEqual([{ string: 0, fret: 4 }]);
	});

	it('toggles a forced line break on the same bar of every track', () => {
		s.addTrack();
		s.setCursor({ track: 0, measure: 2 });
		s.toggleMeasureLineBreak(2);
		expect(s.score.tracks[0].measures[2].lineBreak).toBe(true);
		expect(s.score.tracks[1].measures[2].lineBreak).toBe(true);
		s.toggleMeasureLineBreak(2);
		expect(s.score.tracks[0].measures[2].lineBreak).toBeUndefined();
	});
});

describe('ScoreStore mid-song tempo change', () => {
	let s: ScoreStore;
	beforeEach(() => (s = freshStore()));

	it('sets the change on the same bar of every track and clamps the BPM', () => {
		s.addTrack();
		s.setMeasureTempo(1, 150);
		expect(s.score.tracks[0].measures[1].tempo).toBe(150);
		expect(s.score.tracks[1].measures[1].tempo).toBe(150);
		s.setMeasureTempo(2, 9999);
		expect(s.score.tracks[0].measures[2].tempo).toBe(400);
	});

	it('keeps a change in effect until the next one', () => {
		s.setMeasureTempo(1, 90);
		expect(s.tempoAt(0)).toBe(s.score.tempo);
		expect(s.tempoAt(1)).toBe(90);
		expect(s.tempoAt(3)).toBe(90);
	});

	it('clearing a change falls back to the tempo already in effect', () => {
		s.setMeasureTempo(1, 90);
		s.setMeasureTempo(2, 200);
		s.clearMeasureTempo(2);
		expect(s.score.tracks[0].measures[2].tempo).toBeUndefined();
		expect(s.tempoAt(2)).toBe(90);
	});
});

describe('ScoreStore explicit track visibility', () => {
	let s: ScoreStore;
	beforeEach(() => {
		s = freshStore();
		s.addTrack();
		s.addTrack();
		s.setTrackViewMode('multi');
	});

	it('hides one track from the all-visible state and shows it again', () => {
		const [a, b, c] = s.score.tracks.map((t) => t.id);
		expect(s.isTrackVisible(b)).toBe(true);
		s.setTrackVisible(b, false);
		expect(s.isTrackVisible(b)).toBe(false);
		expect(s.isTrackVisible(a)).toBe(true);
		expect(s.isTrackVisible(c)).toBe(true);
		s.setTrackVisible(b, true);
		expect(s.isTrackVisible(b)).toBe(true);
	});

	it('never hides the last visible track', () => {
		const ids = s.score.tracks.map((t) => t.id);
		s.setTrackVisible(ids[0], false);
		s.setTrackVisible(ids[1], false);
		s.setTrackVisible(ids[2], false);
		expect(ids.some((id) => s.isTrackVisible(id))).toBe(true);
	});

	it('hides a track without changing focus in single view', () => {
		s.setTrackViewMode('single');
		const before = s.focusedTrackId;
		const target = s.score.tracks[1].id;
		s.setTrackVisible(target, false);
		expect(s.isTrackHidden(target)).toBe(true);
		expect(s.isTrackVisible(target)).toBe(false);
		// Visibility toggling must NOT focus/refocus any track.
		expect(s.focusedTrackId).toBe(before);
		s.setTrackVisible(target, true);
		expect(s.isTrackHidden(target)).toBe(false);
	});
});
