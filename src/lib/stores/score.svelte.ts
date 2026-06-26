// Central reactive application state, built on Svelte 5 runes.
//
// One singleton store holds the score, the edit cursor, the loop selection,
// the active duration/effects palette and playback state. Components read these
// directly (they're deep-reactive `$state`) and call methods to mutate.

import { makeScore, makeTrack, parse, serialize, restBeat, emptyMeasure } from '$lib/oto/format';
import { analyzeMeasure } from '$lib/oto/duration';
import { detuneTrack, transposeTrackFrets } from '$lib/oto/transpose';
import type {
	DurationValue,
	OtoBeat,
	OtoScore,
	OtoTrack,
	ScorePosition,
	Technique
} from '$lib/oto/types';

const STORAGE_KEY = 'oto.score';
const AUTOSAVE = true;

export interface Selection {
	track: number;
	startMeasure: number;
	startBeat: number;
	endMeasure: number;
	endBeat: number;
}

export class ScoreStore {
	score = $state<OtoScore>(makeScore());
	cursor = $state<ScorePosition>({ track: 0, measure: 0, beat: 0, string: 0 });
	selection = $state<Selection | null>(null);

	// Edit palette
	activeDuration = $state<DurationValue>(4);
	activeDotted = $state(false);

	// Playback
	isPlaying = $state(false);
	playhead = $state<{ measure: number; beat: number } | null>(null);
	metronomeOn = $state(false);
	loopEnabled = $state(false);
	countInOn = $state(false);

	// History
	#undoStack: string[] = [];
	#redoStack: string[] = [];
	#loaded = false;

	get track(): OtoTrack {
		return this.score.tracks[this.cursor.track] ?? this.score.tracks[0];
	}

	get currentMeasureFill() {
		const m = this.track?.measures[this.cursor.measure];
		if (!m) return null;
		return analyzeMeasure(m, this.score.timeSignature);
	}

	// ---- persistence -------------------------------------------------------

	loadFromStorage() {
		if (this.#loaded || typeof localStorage === 'undefined') return;
		this.#loaded = true;
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			try {
				this.score = parse(raw);
			} catch {
				/* keep default */
			}
		}
	}

	persist() {
		if (!AUTOSAVE || typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, serialize(this.score));
		} catch {
			/* quota / private mode */
		}
	}

	/** Snapshot for undo, then run a mutation and persist. */
	commit(mutate: () => void) {
		this.#undoStack.push(JSON.stringify(this.score));
		if (this.#undoStack.length > 100) this.#undoStack.shift();
		this.#redoStack = [];
		mutate();
		this.persist();
	}

	undo() {
		const prev = this.#undoStack.pop();
		if (!prev) return;
		this.#redoStack.push(JSON.stringify(this.score));
		this.score = JSON.parse(prev);
		this.clampCursor();
		this.persist();
	}

	redo() {
		const next = this.#redoStack.pop();
		if (!next) return;
		this.#undoStack.push(JSON.stringify(this.score));
		this.score = JSON.parse(next);
		this.clampCursor();
		this.persist();
	}

	// ---- document ops ------------------------------------------------------

	newScore() {
		this.commit(() => {
			this.score = makeScore();
			this.cursor = { track: 0, measure: 0, beat: 0, string: 0 };
			this.selection = null;
		});
	}

	loadScore(text: string) {
		const parsed = parse(text);
		this.commit(() => {
			this.score = parsed;
			this.cursor = { track: 0, measure: 0, beat: 0, string: 0 };
			this.selection = null;
		});
	}

	toJSON(): string {
		return serialize(this.score);
	}

	setTitle(title: string) {
		this.commit(() => (this.score.title = title));
	}
	setArtist(artist: string) {
		this.commit(() => (this.score.artist = artist));
	}
	setTempo(tempo: number) {
		this.commit(() => (this.score.tempo = Math.max(20, Math.min(400, tempo))));
	}
	setTimeSignature(num: number, den: number) {
		this.commit(() => (this.score.timeSignature = [num, den]));
	}

	// ---- tracks ------------------------------------------------------------

	addTrack(partial?: Partial<OtoTrack>) {
		this.commit(() => {
			const measureCount = this.score.tracks[0]?.measures.length ?? 4;
			const t = makeTrack({
				name: `Track ${this.score.tracks.length + 1}`,
				measures: Array.from({ length: measureCount }, () => emptyMeasure()),
				...partial
			});
			this.score.tracks.push(t);
			this.cursor = { track: this.score.tracks.length - 1, measure: 0, beat: 0, string: 0 };
		});
	}

	removeTrack(index: number) {
		if (this.score.tracks.length <= 1) return;
		this.commit(() => {
			this.score.tracks.splice(index, 1);
			if (this.cursor.track >= this.score.tracks.length) {
				this.cursor.track = this.score.tracks.length - 1;
			}
			this.clampCursor();
		});
	}

	updateTrack(index: number, patch: Partial<OtoTrack>) {
		this.commit(() => {
			Object.assign(this.score.tracks[index], patch);
		});
	}

	toggleTrackView(index: number, key: 'standard' | 'tab' | 'rhythm') {
		this.commit(() => {
			const v = this.score.tracks[index].view;
			v[key] = !v[key];
			// Always keep at least one view on.
			if (!v.standard && !v.tab && !v.rhythm) v[key] = true;
		});
	}

	toggleMute(index: number) {
		this.commit(() => (this.score.tracks[index].muted = !this.score.tracks[index].muted));
	}
	toggleSolo(index: number) {
		this.commit(() => (this.score.tracks[index].soloed = !this.score.tracks[index].soloed));
	}

	detune(index: number, semitones: number) {
		this.commit(() => {
			this.score.tracks[index] = detuneTrack(this.score.tracks[index], semitones);
		});
	}

	transpose(index: number, semitones: number) {
		this.commit(() => {
			this.score.tracks[index] = transposeTrackFrets(this.score.tracks[index], semitones);
		});
	}

	setDisplayTranspose(index: number, semitones: number) {
		this.commit(() => (this.score.tracks[index].transpose = semitones));
	}

	setCapo(index: number, capo: number) {
		this.commit(() => (this.score.tracks[index].capo = Math.max(0, capo)));
	}

	// ---- measures ----------------------------------------------------------

	addMeasureToAll() {
		this.commit(() => {
			for (const t of this.score.tracks) t.measures.push(emptyMeasure());
		});
	}

	removeMeasureFromAll(measureIndex: number) {
		this.commit(() => {
			for (const t of this.score.tracks) {
				if (t.measures.length > 1) t.measures.splice(measureIndex, 1);
			}
			this.clampCursor();
		});
	}

	// ---- cursor / selection -----------------------------------------------

	setCursor(pos: Partial<ScorePosition>) {
		this.cursor = { ...this.cursor, ...pos };
		this.clampCursor();
	}

	clampCursor() {
		const t = Math.max(0, Math.min(this.cursor.track, this.score.tracks.length - 1));
		const track = this.score.tracks[t];
		const m = Math.max(0, Math.min(this.cursor.measure, track.measures.length - 1));
		const measure = track.measures[m];
		const b = Math.max(0, Math.min(this.cursor.beat, measure.beats.length - 1));
		const s = Math.max(0, Math.min(this.cursor.string, track.tuning.length - 1));
		this.cursor = { track: t, measure: m, beat: b, string: s };
	}

	moveCursor(dir: 'left' | 'right' | 'up' | 'down', keepSelection = false) {
		const track = this.track;
		const c = { ...this.cursor };
		if (dir === 'up') c.string = Math.max(0, c.string - 1);
		else if (dir === 'down') c.string = Math.min(track.tuning.length - 1, c.string + 1);
		else if (dir === 'left') {
			if (c.beat > 0) c.beat -= 1;
			else if (c.measure > 0) {
				c.measure -= 1;
				c.beat = track.measures[c.measure].beats.length - 1;
			}
		} else if (dir === 'right') {
			const beats = track.measures[c.measure].beats.length;
			if (c.beat < beats - 1) c.beat += 1;
			else if (c.measure < track.measures.length - 1) {
				c.measure += 1;
				c.beat = 0;
			}
		}
		this.cursor = c;
		if (!keepSelection) this.selection = null;
	}

	/** Grow/shrink the loop selection by moving the cursor, keeping a fixed anchor. */
	extendSelection(dir: 'left' | 'right') {
		const anchor = this.selection
			? { measure: this.selection.startMeasure, beat: this.selection.startBeat }
			: { measure: this.cursor.measure, beat: this.cursor.beat };
		this.moveCursor(dir, true);
		this.selection = {
			track: this.cursor.track,
			startMeasure: anchor.measure,
			startBeat: anchor.beat,
			endMeasure: this.cursor.measure,
			endBeat: this.cursor.beat
		};
		this.loopEnabled = true;
	}

	clearSelection() {
		this.selection = null;
	}

	/** Anchor the selection at the current cursor and extend its end to (measure, beat). */
	setSelectionTo(measure: number, beat: number) {
		const c = this.cursor;
		this.selection = {
			track: c.track,
			startMeasure: c.measure,
			startBeat: c.beat,
			endMeasure: measure,
			endBeat: beat
		};
	}

	/** Normalised loop bounds (start <= end). */
	get loopBounds(): {
		startMeasure: number;
		startBeat: number;
		endMeasure: number;
		endBeat: number;
	} | null {
		const s = this.selection;
		if (!s) return null;
		const startKey = s.startMeasure * 1000 + s.startBeat;
		const endKey = s.endMeasure * 1000 + s.endBeat;
		const [a, b] =
			startKey <= endKey
				? [
						{ m: s.startMeasure, b: s.startBeat },
						{ m: s.endMeasure, b: s.endBeat }
					]
				: [
						{ m: s.endMeasure, b: s.endBeat },
						{ m: s.startMeasure, b: s.startBeat }
					];
		return { startMeasure: a.m, startBeat: a.b, endMeasure: b.m, endBeat: b.b };
	}

	// ---- note entry --------------------------------------------------------

	private currentBeatRef(): OtoBeat | null {
		return this.track.measures[this.cursor.measure]?.beats[this.cursor.beat] ?? null;
	}

	/**
	 * Type a fret digit at the cursor. Multi-digit entry is supported by passing
	 * the full intended number; the editor accumulates digits and calls this.
	 */
	setFretAtCursor(fret: number) {
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			beat.rest = false;
			const existing = beat.notes.find((n) => n.string === this.cursor.string);
			if (existing) existing.fret = fret;
			else beat.notes.push({ string: this.cursor.string, fret });
			beat.notes.sort((a, b) => a.string - b.string);
		});
	}

	deleteNoteAtCursor() {
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			beat.notes = beat.notes.filter((n) => n.string !== this.cursor.string);
			if (beat.notes.length === 0) beat.rest = true;
		});
	}

	setBeatDuration(duration: DurationValue, dotted: boolean) {
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			beat.duration = duration;
			beat.dotted = dotted;
		});
	}

	/** Insert a new beat after the cursor with the active duration, move into it. */
	insertBeat() {
		this.commit(() => {
			const measure = this.track.measures[this.cursor.measure];
			const nb: OtoBeat = {
				duration: this.activeDuration,
				dotted: this.activeDotted,
				notes: [],
				rest: true
			};
			measure.beats.splice(this.cursor.beat + 1, 0, nb);
			this.cursor.beat += 1;
		});
	}

	deleteBeat() {
		this.commit(() => {
			const measure = this.track.measures[this.cursor.measure];
			if (measure.beats.length <= 1) {
				measure.beats[0] = restBeat(this.activeDuration);
			} else {
				measure.beats.splice(this.cursor.beat, 1);
				if (this.cursor.beat >= measure.beats.length) this.cursor.beat = measure.beats.length - 1;
			}
		});
	}

	toggleTechnique(tech: Technique) {
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			const note = beat.notes.find((n) => n.string === this.cursor.string);
			if (!note) return;
			const list = note.techniques ?? [];
			note.techniques = list.includes(tech) ? list.filter((t) => t !== tech) : [...list, tech];
		});
	}

	setBend(semitones: number) {
		this.commit(() => {
			const beat = this.currentBeatRef();
			const note = beat?.notes.find((n) => n.string === this.cursor.string);
			if (!note) return;
			note.bend = semitones;
			note.techniques = addTechnique(note.techniques, 'bend');
		});
	}

	setSlideTarget(fret: number) {
		this.commit(() => {
			const beat = this.currentBeatRef();
			const note = beat?.notes.find((n) => n.string === this.cursor.string);
			if (!note) return;
			note.slideTo = fret;
			note.techniques = addTechnique(note.techniques, 'slide');
		});
	}

	get currentNote() {
		const beat = this.currentBeatRef();
		return beat?.notes.find((n) => n.string === this.cursor.string) ?? null;
	}
}

function addTechnique(list: Technique[] | undefined, tech: Technique): Technique[] {
	const arr = list ?? [];
	return arr.includes(tech) ? arr : [...arr, tech];
}

export const store = new ScoreStore();
