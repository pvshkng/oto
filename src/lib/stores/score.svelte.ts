// Central reactive application state, built on Svelte 5 runes.
//
// One singleton store holds the score, the edit cursor, the loop selection,
// the active duration/effects palette and playback state. Components read these
// directly (they're deep-reactive `$state`) and call methods to mutate.

import {
	makeScore,
	makeTrack,
	parse,
	serialize,
	restBeat,
	emptyMeasure,
	uid
} from '$lib/oto/format';
import { analyzeMeasure, beatsFilled, measureCapacity } from '$lib/oto/duration';
import { detuneTrack, transposeTrackFrets } from '$lib/oto/transpose';
import type {
	DurationValue,
	OtoBeat,
	OtoMeasure,
	OtoScore,
	OtoTrack,
	ScorePosition,
	Section,
	Technique
} from '$lib/oto/types';

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

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
	cursor = $state<ScorePosition>({ track: 0, measure: 0, beat: 0, string: 0, voice: 0 });
	selection = $state<Selection | null>(null);

	// Edit palette
	activeDuration = $state<DurationValue>(4);
	activeDotted = $state(false);
	/** Auto-advance the cursor to the next beat after a note is committed. */
	autoAdvance = $state(true);

	// Bottom edit panel UI
	editMode = $state(false);
	editTool = $state<'keypad' | 'fretboard'>('keypad');
	songModalOpen = $state(false);
	/** Track mixer drawer (the menubar "Tracks" panel). */
	mixerOpen = $state(false);

	// Track focus / fold state (UI-only, keyed by track id, not persisted).
	collapsed = $state<Record<string, boolean>>({});
	focusedTrackId = $state<string | null>(null);

	// Playback
	isPlaying = $state(false);
	playhead = $state<{ measure: number; beat: number } | null>(null);
	metronomeOn = $state(false);
	loopEnabled = $state(false);
	countInOn = $state(false);

	// History
	#undoStack = $state<string[]>([]);
	#redoStack = $state<string[]>([]);
	#loaded = false;
	/** Set while a continuous mixer drag is in flight (see beginGesture). */
	#gestureActive = false;

	get track(): OtoTrack {
		return this.score.tracks[this.cursor.track] ?? this.score.tracks[0];
	}

	get canUndo(): boolean {
		return this.#undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.#redoStack.length > 0;
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
		this.#pushUndo();
		mutate();
		this.persist();
	}

	#pushUndo() {
		this.#undoStack.push(JSON.stringify(this.score));
		if (this.#undoStack.length > 100) this.#undoStack.shift();
		this.#redoStack = [];
	}

	/**
	 * Begin a continuous mixer gesture (a fader/knob drag). We snapshot the score
	 * *once* on drag-start, then let the live setters mutate freely; endGesture()
	 * closes it. This makes volume/pan/EQ undoable without flooding the history
	 * with one entry per pointer tick. Safe to call repeatedly — only the first
	 * call in a gesture takes a snapshot.
	 */
	beginGesture() {
		if (this.#gestureActive) return;
		this.#gestureActive = true;
		this.#pushUndo();
	}

	endGesture() {
		this.#gestureActive = false;
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
			this.cursor = { track: 0, measure: 0, beat: 0, string: 0, voice: 0 };
			this.selection = null;
		});
	}

	loadScore(text: string) {
		const parsed = parse(text);
		this.commit(() => {
			this.score = parsed;
			this.cursor = { track: 0, measure: 0, beat: 0, string: 0, voice: 0 };
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
			this.cursor = {
				track: this.score.tracks.length - 1,
				measure: 0,
				beat: 0,
				string: 0,
				voice: 0
			};
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

	// ---- mixer (live, persisted) -------------------------------------------
	//
	// Faders and knobs fire continuously while dragging, so they mutate state
	// directly and persist rather than pushing an undo snapshot per pixel. Undo
	// is handled at the gesture level: callers wrap a drag in beginGesture() /
	// endGesture() so a whole drag collapses into a single history entry.

	setVolume(index: number, v: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		t.volume = clamp(v, 0, 1);
		this.persist();
	}
	setPan(index: number, p: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		t.pan = clamp(p, -1, 1);
		this.persist();
	}
	setEqBand(index: number, band: 'low' | 'mid' | 'high', db: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		t.eq = { ...t.eq, [band]: clamp(db, -12, 12) };
		this.persist();
	}
	resetEq(index: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		// A discrete click (not a drag) → make it a single undoable step.
		this.commit(() => {
			t.eq = { low: 0, mid: 0, high: 0 };
		});
	}
	setMasterVolume(v: number) {
		this.score.masterVolume = clamp(v, 0, 1);
		this.persist();
	}

	// ---- sections / markers ------------------------------------------------

	addSection(measure: number, label?: string) {
		this.commit(() => {
			const m = Math.max(0, Math.floor(measure));
			const auto = String.fromCharCode(65 + (this.score.sections.length % 26));
			this.score.sections.push({ id: uid('sec'), measure: m, label: label ?? `Section ${auto}` });
			this.score.sections.sort((a, b) => a.measure - b.measure);
		});
	}
	updateSection(id: string, patch: Partial<Section>) {
		this.commit(() => {
			const s = this.score.sections.find((x) => x.id === id);
			if (!s) return;
			Object.assign(s, patch);
			if (patch.measure !== undefined) s.measure = Math.max(0, Math.floor(s.measure));
			this.score.sections.sort((a, b) => a.measure - b.measure);
		});
	}
	removeSection(id: string) {
		this.commit(() => {
			this.score.sections = this.score.sections.filter((x) => x.id !== id);
		});
	}

	// ---- track fold / focus (UI only) -------------------------------------

	isCollapsed(index: number): boolean {
		const t = this.score.tracks[index];
		if (!t) return false;
		// When a track is focused, every other track is folded away.
		if (this.focusedTrackId && this.focusedTrackId !== t.id) return true;
		return !!this.collapsed[t.id];
	}

	toggleCollapsed(index: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		this.collapsed = { ...this.collapsed, [t.id]: !this.collapsed[t.id] };
	}

	setCollapsed(index: number, value: boolean) {
		const t = this.score.tracks[index];
		if (!t) return;
		this.collapsed = { ...this.collapsed, [t.id]: value };
	}

	get isFocusMode(): boolean {
		return this.focusedTrackId !== null;
	}

	get focusedTrackName(): string {
		const t = this.score.tracks.find((x) => x.id === this.focusedTrackId);
		return t?.name ?? '';
	}

	/** Focus a single track for distraction-free writing; all others fold away. */
	focusTrack(index: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		this.focusedTrackId = t.id;
		this.setCursor({ track: index, measure: 0, beat: 0 });
	}

	clearFocus() {
		this.focusedTrackId = null;
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

	/** Insert an empty bar at `measureIndex` (pushing later bars right) on every track. */
	insertMeasureAt(measureIndex: number) {
		this.commit(() => {
			for (const t of this.score.tracks) {
				const at = Math.max(0, Math.min(measureIndex, t.measures.length));
				t.measures.splice(at, 0, emptyMeasure());
			}
		});
	}

	/** Duplicate the bar at `measureIndex` on every track (a deep copy placed right after). */
	duplicateMeasureAt(measureIndex: number) {
		this.commit(() => {
			for (const t of this.score.tracks) {
				const src = t.measures[measureIndex];
				if (!src) continue;
				const copy: OtoMeasure = JSON.parse(JSON.stringify(src));
				t.measures.splice(measureIndex + 1, 0, copy);
			}
		});
	}

	/** Clear every note in a bar (back to a single rest) on every track. */
	clearMeasureAt(measureIndex: number) {
		this.commit(() => {
			for (const t of this.score.tracks) {
				const m = t.measures[measureIndex];
				if (!m) continue;
				m.beats = [restBeat(this.activeDuration)];
				m.voice2 = undefined;
			}
			this.clampCursor();
		});
	}

	/**
	 * Change the time signature of a single measure (and therefore every measure
	 * after it, until the next explicit change). Applied to every track so the
	 * grid stays aligned. This is how a real score changes metre mid-song.
	 */
	setMeasureTimeSignature(measureIndex: number, num: number, den: number) {
		this.commit(() => {
			for (const t of this.score.tracks) {
				const m = t.measures[measureIndex];
				if (m) m.timeSignature = [num, den];
			}
		});
	}

	/** Time signature in effect at a measure (nearest explicit one at or before it). */
	timeSignatureAt(measureIndex: number): [number, number] {
		const measures = this.track.measures;
		for (let i = Math.min(measureIndex, measures.length - 1); i >= 0; i--) {
			const ts = measures[i].timeSignature;
			if (ts) return ts;
		}
		return this.score.timeSignature;
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
		const maxVoice = measure.voice2 && measure.voice2.length ? 1 : 0;
		const voice = Math.max(0, Math.min(this.cursor.voice, maxVoice));
		const beats = voice === 1 ? measure.voice2! : measure.beats;
		const b = Math.max(0, Math.min(this.cursor.beat, beats.length - 1));
		const s = Math.max(0, Math.min(this.cursor.string, track.tuning.length - 1));
		this.cursor = { track: t, measure: m, beat: b, string: s, voice };
	}

	/** Beat list for a (measure, voice), read-only (no lazy creation). */
	private beatsAt(measure: OtoMeasure, voice: number): OtoBeat[] {
		return voice === 1 && measure.voice2 && measure.voice2.length ? measure.voice2 : measure.beats;
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
				c.beat = this.beatsAt(track.measures[c.measure], c.voice).length - 1;
			}
		} else if (dir === 'right') {
			const beats = this.beatsAt(track.measures[c.measure], c.voice).length;
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
		const m = this.track.measures[this.cursor.measure];
		if (!m) return null;
		const beats = this.cursor.voice === 1 ? m.voice2 : m.beats;
		return beats?.[this.cursor.beat] ?? null;
	}

	/** Active voice's beat array, lazily creating voice 2 (with a rest) if needed. */
	private editBeats(): OtoBeat[] {
		const m = this.track.measures[this.cursor.measure];
		if (this.cursor.voice === 1) {
			if (!m.voice2 || m.voice2.length === 0) {
				m.voice2 = [
					{ duration: this.activeDuration, dotted: this.activeDotted, notes: [], rest: true }
				];
				this.cursor = { ...this.cursor, beat: 0 };
			}
			return m.voice2;
		}
		return m.beats;
	}

	// ---- voices ------------------------------------------------------------

	setVoice(voice: number) {
		this.cursor = { ...this.cursor, voice: voice === 1 ? 1 : 0, beat: 0 };
		this.selection = null;
	}

	get hasVoice2(): boolean {
		const m = this.track.measures[this.cursor.measure];
		return !!(m?.voice2 && m.voice2.length);
	}

	/**
	 * Type a fret at the cursor. The first note dropped into an empty beat adopts
	 * the active duration. If this is the last beat of the bar and capacity
	 * remains, a fresh trailing beat is appended so entry can flow without the
	 * user manually inserting beats ("auto-grow").
	 */
	setFretAtCursor(fret: number) {
		this.commit(() => {
			const beats = this.editBeats();
			const beat = beats[this.cursor.beat];
			if (!beat) return;
			if (beat.notes.length === 0) {
				beat.duration = this.activeDuration;
				beat.dotted = this.activeDotted;
			}
			beat.rest = false;
			const existing = beat.notes.find((n) => n.string === this.cursor.string);
			if (existing) existing.fret = fret;
			else beat.notes.push({ string: this.cursor.string, fret });
			beat.notes.sort((a, b) => a.string - b.string);
			this.ensureTrailingBeat(beats);
		});
	}

	/** Append an empty beat at the end of a voice when bar capacity remains. */
	private ensureTrailingBeat(beats: OtoBeat[]) {
		if (this.cursor.beat !== beats.length - 1) return;
		const measure = this.track.measures[this.cursor.measure];
		const capacity = measureCapacity(measure.timeSignature ?? this.score.timeSignature);
		const remaining = capacity - beatsFilled(beats);
		const newFrac = (this.activeDotted ? 1.5 : 1) / this.activeDuration;
		if (remaining >= newFrac - 1e-9) {
			beats.push({
				duration: this.activeDuration,
				dotted: this.activeDotted,
				notes: [],
				rest: true
			});
		}
	}

	/** Move to the next beat for entry, crossing into the next measure if needed. */
	advanceForEntry() {
		const beats = this.beatsAt(this.track.measures[this.cursor.measure], this.cursor.voice);
		if (this.cursor.beat < beats.length - 1) {
			this.cursor = { ...this.cursor, beat: this.cursor.beat + 1 };
		} else if (this.cursor.measure < this.track.measures.length - 1) {
			this.cursor = { ...this.cursor, measure: this.cursor.measure + 1, beat: 0 };
		}
		this.selection = null;
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
			const beats = this.editBeats();
			beats.splice(this.cursor.beat + 1, 0, this.#newBeat());
			this.cursor = { ...this.cursor, beat: this.cursor.beat + 1 };
		});
	}

	/** Insert a new beat *before* the cursor, pushing the current beat right. */
	insertBeatBefore() {
		this.commit(() => {
			const beats = this.editBeats();
			beats.splice(this.cursor.beat, 0, this.#newBeat());
			// cursor stays on the same index, now the new empty beat
		});
	}

	#newBeat(): OtoBeat {
		return { duration: this.activeDuration, dotted: this.activeDotted, notes: [], rest: true };
	}

	deleteBeat() {
		this.commit(() => {
			const measure = this.track.measures[this.cursor.measure];
			if (this.cursor.voice === 1) {
				const v = measure.voice2;
				if (!v) return;
				v.splice(this.cursor.beat, 1);
				if (v.length === 0) {
					measure.voice2 = undefined;
					this.cursor = { ...this.cursor, voice: 0, beat: 0 };
				} else if (this.cursor.beat >= v.length) {
					this.cursor = { ...this.cursor, beat: v.length - 1 };
				}
				return;
			}
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
