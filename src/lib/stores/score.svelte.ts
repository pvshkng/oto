// Central reactive application state, built on Svelte 5 runes.
//
// One singleton store holds the score, the edit cursor, the loop selection,
// the active duration/effects palette and playback state. Components read these
// directly (they're deep-reactive `$state`) and call methods to mutate.

import { SvelteSet } from 'svelte/reactivity';
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
import { detuneTrack, transposeTrackFrets, retuneTrack } from '$lib/oto/transpose';
import { MAX_SECTIONS } from '$lib/oto/sections';
import type { MetronomeSound } from '$lib/audio/engine';
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
const PREFS_KEY = 'oto.prefs';
const AUTOSAVE = true;

const METRONOME_SOUNDS: MetronomeSound[] = ['click', 'beep', 'wood', 'bell'];

/** Persisted user-preference shape (a subset of the store's session fields). */
interface StoredPrefs {
	metronomeOn?: boolean;
	metronomeSound?: MetronomeSound;
	metronomeVolume?: number;
	loopEnabled?: boolean;
	countInOn?: boolean;
}

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
	/** Sub-beat note selection: a set of string indices within a single beat. */
	noteSelection = $state<{
		measure: number;
		beat: number;
		voice: number;
		strings: SvelteSet<number>;
	} | null>(null);

	// Edit palette
	activeDuration = $state<DurationValue>(4);
	activeDotted = $state(false);
	/** Auto-advance the cursor to the next beat after a note is committed. */
	autoAdvance = $state(true);
	/** Clipboard for cut/copy/paste operations. Outer array = bar groups, inner = beats per bar. */
	clipboard = $state<OtoBeat[][] | null>(null);

	// Bottom edit panel UI. The note editor (keypad/fretboard) and the tracks
	// panel share the same dock and are mutually exclusive — opening one closes
	// the other.
	#editModeState = $state(false);
	#mixerOpenState = $state(false);
	editTool = $state<'keypad' | 'fretboard' | 'piano'>('keypad');
	songModalOpen = $state(false);
	/** Track-staff right-click menu (any track). Closed on outer scroll. */
	contextMenuOpen = $state(false);

	// Desktop-only UI state. keyInputOpen controls the bottom key-entry panel
	// (keypad/fretboard/piano) independently of the left note-properties panel.
	// tempoOpen and addRemoveOpen lift those formerly-local BottomBar states into
	// the store so the desktop right panel can read them.
	isDesktop = $state(false);
	keyInputOpen = $state(false);
	tempoOpen = $state(false);
	addRemoveOpen = $state(false);
	trackControlOpen = $state(false);
	trackControlIndex = $state(-1);

	/** Call once from onMount after browser APIs are available. */
	initLayout() {
		const mq = window.matchMedia('(min-width: 1024px)');
		this.isDesktop = mq.matches;
		if (mq.matches) this.#mixerOpenState = true;
		mq.addEventListener('change', (e) => {
			this.isDesktop = e.matches;
			if (e.matches) {
				this.#mixerOpenState = true;
			} else {
				this.keyInputOpen = false;
				this.tempoOpen = false;
				this.addRemoveOpen = false;
			}
		});
	}

	get editMode(): boolean {
		return this.#editModeState;
	}
	set editMode(v: boolean) {
		this.#editModeState = v;
		if (v && !this.isDesktop) this.#mixerOpenState = false;
	}

	/** Tracks panel (the menubar "Tracks" panel). */
	get mixerOpen(): boolean {
		return this.#mixerOpenState;
	}
	set mixerOpen(v: boolean) {
		this.#mixerOpenState = v;
		if (v) this.#editModeState = false;
	}

	// Track focus / fold state (UI-only, keyed by track id, not persisted).
	collapsed = $state<Record<string, boolean>>({});
	// Always initialized to the first track so the sheet never shows "all tracks"
	focusedTrackId = $state<string | null>(this.score.tracks[0]?.id ?? null);
	// Multi-track view: set of focused track IDs (empty = show all)
	focusedTrackIds = $state(new SvelteSet<string>());
	// 'single': only one track focused at a time; 'multi': toggle multiple tracks
	trackViewMode = $state<'single' | 'multi'>('single');

	// Playback
	isPlaying = $state(false);
	/** True after Pause — distinct from a full Stop. The cursor is synced to
	 *  the paused position, so the next Play resumes from `cursor`. */
	isPaused = $state(false);
	playhead = $state<{ measure: number; beat: number } | null>(null);

	// User preferences (persisted to localStorage, see loadPrefs/#persistPrefs).
	// These are device/session settings rather than document data, so they live
	// apart from the .oto score and survive a page reload.
	#metronomeOn = $state(false);
	#metronomeSound = $state<MetronomeSound>('click');
	#metronomeVolume = $state(1);
	#loopEnabled = $state(false);
	#countInOn = $state(false);

	get metronomeOn(): boolean {
		return this.#metronomeOn;
	}
	set metronomeOn(v: boolean) {
		this.#metronomeOn = v;
		this.#persistPrefs();
	}
	get metronomeSound(): MetronomeSound {
		return this.#metronomeSound;
	}
	set metronomeSound(v: MetronomeSound) {
		this.#metronomeSound = v;
		this.#persistPrefs();
	}
	get metronomeVolume(): number {
		return this.#metronomeVolume;
	}
	set metronomeVolume(v: number) {
		this.#metronomeVolume = clamp(v, 0, 1);
		this.#persistPrefs();
	}
	get loopEnabled(): boolean {
		return this.#loopEnabled;
	}
	set loopEnabled(v: boolean) {
		this.#loopEnabled = v;
		this.#persistPrefs();
	}
	get countInOn(): boolean {
		return this.#countInOn;
	}
	set countInOn(v: boolean) {
		this.#countInOn = v;
		this.#persistPrefs();
	}
	/** Set when the audio engine failed to start (e.g. blocked autoplay), so the
	 *  UI can surface a clear, actionable message instead of silent no-sound. */
	audioError = $state<string | null>(null);
	/** Set when a recorded sample set fails to download/decode (e.g. offline), so
	 *  the UI can be honest that playback fell back to the synthesised voice
	 *  instead of silently sounding different from what was expected. */
	sampleWarning = $state<string | null>(null);

	// Score-area scroll requests (UI only). The main view listens for these to
	// scroll itself back to the top of the song or to a specific track/measure;
	// each request carries a token so the same target can be re-requested.
	scrollRequest = $state<{
		kind: 'start' | 'track';
		trackId?: string;
		measure?: number;
		token: number;
	} | null>(null);
	#scrollToken = 0;

	scrollToStart() {
		this.scrollRequest = { kind: 'start', token: ++this.#scrollToken };
	}

	scrollToTrack(trackId: string, measure?: number) {
		this.scrollRequest = { kind: 'track', trackId, measure, token: ++this.#scrollToken };
	}

	// History
	#undoStack = $state<string[]>([]);
	#redoStack = $state<string[]>([]);
	#loaded = false;
	/** Set while a continuous mixer drag is in flight (see beginGesture). */
	#gestureActive = false;

	/** Bumped whenever the score's *compiled* content changes (notes, tempo,
	 *  tuning, mute/solo, …) — anything that goes through commit()/commitLive()
	 *  or undo/redo. Live mixer setters (volume/pan/EQ) deliberately don't bump
	 *  this: they're applied to audio nodes directly and never baked into the
	 *  compiled schedule, so the playback engine can cache its compiled score
	 *  keyed on this number instead of recompiling on every Play press. */
	#scoreVersion = $state(0);
	get scoreVersion(): number {
		return this.#scoreVersion;
	}

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
		// Ensure at least one track exists and focus is on a valid track
		if (this.score.tracks.length === 0) {
			this.score.tracks.push(makeTrack());
		}
		const focusValid = this.score.tracks.some((t) => t.id === this.focusedTrackId);
		if (!focusValid) {
			this.focusedTrackId = this.score.tracks[0]?.id ?? null;
		}
		this.loadPrefs();
	}

	/** Restore persisted user preferences (metronome/loop/count-in). Safe to call
	 *  once on startup; missing or malformed values keep their defaults. */
	loadPrefs() {
		if (typeof localStorage === 'undefined') return;
		const raw = localStorage.getItem(PREFS_KEY);
		if (!raw) return;
		try {
			const p = JSON.parse(raw) as StoredPrefs;
			if (typeof p.metronomeOn === 'boolean') this.#metronomeOn = p.metronomeOn;
			if (p.metronomeSound && METRONOME_SOUNDS.includes(p.metronomeSound))
				this.#metronomeSound = p.metronomeSound;
			if (typeof p.metronomeVolume === 'number')
				this.#metronomeVolume = clamp(p.metronomeVolume, 0, 1);
			if (typeof p.loopEnabled === 'boolean') this.#loopEnabled = p.loopEnabled;
			if (typeof p.countInOn === 'boolean') this.#countInOn = p.countInOn;
		} catch {
			/* keep defaults */
		}
	}

	#persistPrefs() {
		if (typeof localStorage === 'undefined') return;
		try {
			const prefs: StoredPrefs = {
				metronomeOn: this.#metronomeOn,
				metronomeSound: this.#metronomeSound,
				metronomeVolume: this.#metronomeVolume,
				loopEnabled: this.#loopEnabled,
				countInOn: this.#countInOn
			};
			localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
		} catch {
			/* quota / private mode */
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
		this.#scoreVersion++;
		this.persist();
	}

	/** Mutate and persist without snapshotting — for use inside a gesture
	 *  (see beginGesture) where the snapshot was already taken once up front. */
	commitLive(mutate: () => void) {
		mutate();
		this.#scoreVersion++;
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
		this.#scoreVersion++;
		this.persist();
	}

	redo() {
		const next = this.#redoStack.pop();
		if (!next) return;
		this.#undoStack.push(JSON.stringify(this.score));
		this.score = JSON.parse(next);
		this.clampCursor();
		this.#scoreVersion++;
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
	/** Live variant for the title input — pair with beginGesture()/endGesture()
	 *  on focus/blur so a whole typing session is one undo step. */
	setTitleLive(title: string) {
		this.commitLive(() => (this.score.title = title));
	}
	setArtist(artist: string) {
		this.commit(() => (this.score.artist = artist));
	}
	setArtistLive(artist: string) {
		this.commitLive(() => (this.score.artist = artist));
	}
	setTempo(tempo: number) {
		this.commit(() => (this.score.tempo = Math.max(20, Math.min(400, tempo))));
	}
	setTempoLive(tempo: number) {
		this.commitLive(() => (this.score.tempo = Math.max(20, Math.min(400, tempo))));
	}
	setTimeSignature(num: number, den: number) {
		this.commit(() => (this.score.timeSignature = [num, den]));
	}
	setKeySignature(fifths: number) {
		this.commit(() => (this.score.keySignature = Math.max(-7, Math.min(7, fifths))));
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
		// Focus the newly added track
		const newTrack = this.score.tracks[this.score.tracks.length - 1];
		if (newTrack) {
			if (this.trackViewMode === 'single') {
				this.focusedTrackId = newTrack.id;
			} else {
				this.focusedTrackIds = new SvelteSet([...this.focusedTrackIds, newTrack.id]);
			}
		}
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
		// Re-anchor focus to a valid track if the removed track was focused
		const focusValid = this.score.tracks.some((t) => t.id === this.focusedTrackId);
		if (!focusValid) {
			this.focusedTrackId = this.score.tracks[this.cursor.track]?.id ?? null;
		}
		// Clean up multi-mode focused set
		if (this.trackViewMode === 'multi') {
			const trackIds = this.score.tracks.map((t) => t.id);
			this.focusedTrackIds = new SvelteSet(
				[...this.focusedTrackIds].filter((id) => trackIds.includes(id))
			);
		}
	}

	updateTrack(index: number, patch: Partial<OtoTrack>) {
		this.commit(() => {
			Object.assign(this.score.tracks[index], patch);
		});
	}
	updateTrackLive(index: number, patch: Partial<OtoTrack>) {
		this.commitLive(() => {
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

	/** Sections are lettered A–Z by position (see `$lib/oto/sections`); once 26 exist, no more can be added. */
	get canAddSection(): boolean {
		return this.score.sections.length < MAX_SECTIONS;
	}

	addSection(measure: number, label?: string) {
		if (!this.canAddSection) return;
		const m = Math.max(0, Math.floor(measure));
		if (this.score.sections.some((s) => s.measure === m)) return;
		this.commit(() => {
			this.score.sections.push({ id: uid('sec'), measure: m, label: label ?? '' });
			this.score.sections.sort((a, b) => a.measure - b.measure);
		});
	}
	updateSection(id: string, patch: Partial<Section>) {
		if (patch.measure !== undefined) {
			const m = Math.max(0, Math.floor(patch.measure));
			if (this.score.sections.some((s) => s.id !== id && s.measure === m)) return;
		}
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
		if (this.trackViewMode === 'single') {
			if (this.focusedTrackId && this.focusedTrackId !== t.id) return true;
		} else {
			if (this.focusedTrackIds.size > 0 && !this.focusedTrackIds.has(t.id)) return true;
		}
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
		if (this.trackViewMode === 'single') return this.focusedTrackId !== null;
		return this.focusedTrackIds.size > 0;
	}

	/** True if the given track ID should be visible in the score area. */
	isTrackVisible(id: string): boolean {
		if (this.trackViewMode === 'single') {
			return !this.focusedTrackId || this.focusedTrackId === id;
		}
		return this.focusedTrackIds.size === 0 || this.focusedTrackIds.has(id);
	}

	/** True if the given track index is currently focused (Eye button pressed). */
	isTrackFocused(index: number): boolean {
		const t = this.score.tracks[index];
		if (!t) return false;
		if (this.trackViewMode === 'single') return this.focusedTrackId === t.id;
		return this.focusedTrackIds.has(t.id);
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
		this.focusedTrackId = this.score.tracks[0]?.id ?? null;
	}

	/** Toggle focus for the given track, respecting the current view mode. */
	toggleFocusTrack(index: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		if (this.trackViewMode === 'single') {
			if (this.focusedTrackId === t.id) {
				this.clearFocus();
			} else {
				this.focusTrack(index);
			}
		} else {
			const next = new SvelteSet(this.focusedTrackIds);
			if (next.has(t.id)) {
				next.delete(t.id);
			} else {
				next.add(t.id);
				this.setCursor({ track: index });
			}
			this.focusedTrackIds = next;
		}
	}

	/** Switch track view mode. Clears the focused set when switching. */
	setTrackViewMode(mode: 'single' | 'multi') {
		if (mode === this.trackViewMode) return;
		this.trackViewMode = mode;
		if (mode === 'multi') {
			this.focusedTrackIds = new SvelteSet();
		} else {
			this.focusedTrackId =
				this.score.tracks[this.cursor.track]?.id ?? this.score.tracks[0]?.id ?? null;
		}
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
	setDisplayTransposeLive(index: number, semitones: number) {
		this.commitLive(() => (this.score.tracks[index].transpose = semitones));
	}

	setCapo(index: number, capo: number) {
		this.commit(() => (this.score.tracks[index].capo = Math.max(0, capo)));
	}
	setCapoLive(index: number, capo: number) {
		this.commitLive(() => (this.score.tracks[index].capo = Math.max(0, capo)));
	}

	/** Apply a custom tuning. `mode: 'transpose'` shifts frets so existing notes
	 *  keep the same sound; `mode: 'keep'` leaves frets as-is so the sound
	 *  changes on playback instead. */
	retune(index: number, newTuning: string[], mode: 'transpose' | 'keep') {
		this.commit(() => {
			this.score.tracks[index] = retuneTrack(this.score.tracks[index], newTuning, mode);
		});
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
			const measure = track.measures[c.measure];
			const beats = this.beatsAt(measure, c.voice);
			if (c.beat < beats.length - 1) {
				c.beat += 1;
			} else {
				const capacity = measureCapacity(measure.timeSignature ?? this.score.timeSignature);
				const remaining = capacity - beatsFilled(beats);
				const newFrac = (this.activeDotted ? 1.5 : 1) / this.activeDuration;
				if (remaining >= newFrac - 1e-9) {
					if (!keepSelection) this.selection = null;
					this.insertBeat();
					return;
				} else if (c.measure < track.measures.length - 1) {
					c.measure += 1;
					c.beat = 0;
				} else {
					if (!keepSelection) this.selection = null;
					this.addMeasureToAll();
					c.measure += 1;
					c.beat = 0;
					this.cursor = c;
					this.clampCursor();
					return;
				}
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
		this.noteSelection = null;
		this.markStartPending = false;
		this.markStartPos = null;
	}

	setNoteSelection(sel: {
		measure: number;
		beat: number;
		voice: number;
		strings: SvelteSet<number>;
	}) {
		this.noteSelection = sel;
		this.selection = null;
	}

	clearNoteSelection() {
		this.noteSelection = null;
	}

	get hasNoteSelection(): boolean {
		return (this.noteSelection?.strings.size ?? 0) > 0;
	}

	// ---- two-step mark-start / mark-end flow --------------------------------

	/** Pending anchor for the two-step mark-start → mark-end selection flow. */
	markStartPending = $state(false);
	markStartPos = $state<{ track: number; measure: number; beat: number } | null>(null);

	/** Step 1: anchor the selection start at the cursor. Shows a pending indicator
	 *  in the staff until the user completes the selection with completeMarkEnd(). */
	beginMarkStart() {
		const c = this.cursor;
		this.markStartPending = true;
		this.markStartPos = { track: c.track, measure: c.measure, beat: c.beat };
		this.selection = null;
		this.loopEnabled = false;
	}

	/** Step 2: complete the selection from the stored start to the current cursor.
	 *  No-op if beginMarkStart() hasn't been called. */
	completeMarkEnd() {
		if (!this.markStartPending || !this.markStartPos) return;
		const c = this.cursor;
		const start = this.markStartPos;
		this.selection = {
			track: c.track,
			startMeasure: start.measure,
			startBeat: start.beat,
			endMeasure: c.measure,
			endBeat: c.beat
		};
		this.loopEnabled = true;
		this.markStartPending = false;
		this.markStartPos = null;
	}

	cancelMarkStart() {
		this.markStartPending = false;
		this.markStartPos = null;
	}

	/** @deprecated Use beginMarkStart() instead. */
	setLoopStartAtCursor() {
		this.beginMarkStart();
	}

	/** @deprecated Use completeMarkEnd() instead. */
	setLoopEndAtCursor() {
		this.completeMarkEnd();
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
		this.noteSelection = null;
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
			const measure = this.track.measures[this.cursor.measure];
			if (!measure) return;
			const isV2 = this.cursor.voice === 1;
			const beats = isV2 ? measure.voice2 : measure.beats;
			if (!beats) return;
			const beat = beats[this.cursor.beat];
			if (!beat) return;
			const ns = this.noteSelection;
			const isNoteSel =
				ns !== null &&
				ns.measure === this.cursor.measure &&
				ns.beat === this.cursor.beat &&
				ns.voice === this.cursor.voice &&
				ns.strings.size > 0;
			if (isNoteSel) {
				beat.notes = beat.notes.filter((n) => !ns!.strings.has(n.string));
			} else {
				beat.notes = beat.notes.filter((n) => n.string !== this.cursor.string);
			}
			this.noteSelection = null;
			if (beat.notes.length > 0) return;
			// Beat is now empty — remove it rather than leaving a rest.
			if (isV2) {
				beats.splice(this.cursor.beat, 1);
				if (beats.length === 0) {
					measure.voice2 = undefined;
					this.cursor = { ...this.cursor, voice: 0, beat: 0 };
				} else if (this.cursor.beat >= beats.length) {
					this.cursor = { ...this.cursor, beat: beats.length - 1 };
				}
			} else {
				if (beats.length <= 1) {
					beats[0] = restBeat(this.activeDuration);
				} else {
					beats.splice(this.cursor.beat, 1);
					if (this.cursor.beat >= beats.length) {
						this.cursor = { ...this.cursor, beat: beats.length - 1 };
					}
				}
			}
		});
	}

	deleteNotesInSelection() {
		const b = this.loopBounds;
		if (!b) {
			this.deleteNoteAtCursor();
			return;
		}
		const t = this.selection?.track ?? this.cursor.track;
		this.commit(() => {
			const track = this.score.tracks[t];
			if (!track) return;
			for (let mi = b.startMeasure; mi <= b.endMeasure; mi++) {
				const measure = track.measures[mi];
				if (!measure) continue;
				const firstBeat = mi === b.startMeasure ? b.startBeat : 0;
				const lastBeat = mi === b.endMeasure ? b.endBeat : measure.beats.length - 1;
				// Splice from end → start so indices stay valid.
				for (let bi = lastBeat; bi >= firstBeat; bi--) {
					if (measure.beats.length <= 1) {
						measure.beats[0] = restBeat(this.activeDuration);
						break;
					}
					measure.beats.splice(bi, 1);
				}
			}
			this.clampCursor();
		});
	}

	copySelection() {
		const b = this.loopBounds;
		if (!b) {
			const beat = this.currentBeatRef();
			if (!beat) return;
			const ns = this.noteSelection;
			const isNoteSel =
				ns !== null &&
				ns.measure === this.cursor.measure &&
				ns.beat === this.cursor.beat &&
				ns.strings.size > 0;
			if (isNoteSel) {
				const filtered = { ...beat, notes: beat.notes.filter((n) => ns!.strings.has(n.string)) };
				this.clipboard = [[JSON.parse(JSON.stringify(filtered))]];
			} else {
				this.clipboard = [[JSON.parse(JSON.stringify(beat))]];
			}
			return;
		}
		const t = this.selection?.track ?? this.cursor.track;
		const track = this.score.tracks[t];
		if (!track) return;
		const barGroups: OtoBeat[][] = [];
		for (let mi = b.startMeasure; mi <= b.endMeasure; mi++) {
			const measure = track.measures[mi];
			if (!measure) continue;
			const firstBeat = mi === b.startMeasure ? b.startBeat : 0;
			const lastBeat = mi === b.endMeasure ? b.endBeat : measure.beats.length - 1;
			const group: OtoBeat[] = [];
			for (let bi = firstBeat; bi <= lastBeat; bi++) {
				const beat = measure.beats[bi];
				if (beat) group.push(JSON.parse(JSON.stringify(beat)));
			}
			if (group.length > 0) barGroups.push(group);
		}
		if (barGroups.length > 0) this.clipboard = barGroups;
	}

	cutSelection() {
		const b = this.loopBounds;
		this.copySelection();
		if (b) {
			this.deleteNotesInSelection();
		} else {
			// No beat-range selection: cut the entire beat (all notes), not just cursor string
			this.commit(() => {
				const measure = this.track.measures[this.cursor.measure];
				if (!measure) return;
				const beats = measure.beats;
				if (beats.length <= 1) {
					beats[0] = restBeat(this.activeDuration);
				} else {
					beats.splice(this.cursor.beat, 1);
					if (this.cursor.beat >= beats.length) {
						this.cursor = { ...this.cursor, beat: beats.length - 1 };
					}
				}
			});
			this.noteSelection = null;
		}
	}

	pasteClipboard() {
		if (!this.clipboard || this.clipboard.length === 0) return;
		const barGroups = this.clipboard;
		// Guard: first group must have at least one beat
		if (!barGroups[0] || barGroups[0].length === 0) return;
		this.commit(() => {
			const startMeasure = this.cursor.measure;
			const insertAt = this.cursor.beat + 1;

			// First bar group → insert into the active voice at cursor position
			const currentBeats = this.editBeats();
			const firstGroup = barGroups[0];
			for (let i = 0; i < firstGroup.length; i++) {
				currentBeats.splice(insertAt + i, 0, JSON.parse(JSON.stringify(firstGroup[i])));
			}

			// Subsequent bar groups → insert into successive measures (voice 1 only)
			for (let gi = 1; gi < barGroups.length; gi++) {
				const group = barGroups[gi];
				if (!group || group.length === 0) continue;
				const targetIndex = startMeasure + gi;
				// Extend every track so measure counts stay in sync across tracks
				if (this.score.tracks.length > 0) {
					while ((this.score.tracks[0].measures.length ?? 0) <= targetIndex) {
						for (const t of this.score.tracks) {
							t.measures.push(emptyMeasure());
						}
					}
				}
				const targetMeasure = this.track.measures[targetIndex];
				if (!targetMeasure) continue;
				for (let i = 0; i < group.length; i++) {
					targetMeasure.beats.splice(i, 0, JSON.parse(JSON.stringify(group[i])));
				}
			}

			this.cursor = { ...this.cursor, beat: insertAt };
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
			let note = beat.notes.find((n) => n.string === this.cursor.string);
			if (!note) {
				// Dead notes can be added to an empty beat/string directly
				if (tech !== 'dead') return;
				if (beat.notes.length === 0) {
					beat.duration = this.activeDuration;
					beat.dotted = this.activeDotted;
				}
				beat.rest = false;
				note = { string: this.cursor.string, fret: 0 };
				beat.notes.push(note);
				beat.notes.sort((a, b) => a.string - b.string);
			}
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
