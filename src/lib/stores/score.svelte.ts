// Central reactive application state, built on Svelte 5 runes.
//
// One singleton store holds the score, the edit cursor, the loop selection,
// the active duration/effects palette and playback state. Components read these
// directly (they're deep-reactive `$state`) and call methods to mutate.
//
// Three cohesive domains live in sibling modules and are composed here behind
// a stable `store.x` facade: desktop panel docking (panels.svelte.ts),
// persisted user preferences (prefs.svelte.ts), and undo history + autosave
// (history.svelte.ts).

import { SvelteSet } from 'svelte/reactivity';
import { toast } from 'svelte-sonner';
import { showZoomToast } from '$lib/components/score/zoom-toast';
import { PanelController, type Dock, type PanelId } from './panels.svelte';
import { PrefsController } from './prefs.svelte';
import { ScoreHistory } from './history.svelte';
import {
	makeScore,
	makeTrack,
	makeAudioConfig,
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
import type { SoundFontQuality } from '$lib/audio/soundfont';
import type {
	AudioTrackConfig,
	Dynamic,
	DurationValue,
	OtoBeat,
	OtoMeasure,
	OtoNote,
	OtoScore,
	OtoTrack,
	Ottava,
	ScorePosition,
	Section,
	StrumDirection,
	Technique,
	TupletValue
} from '$lib/oto/types';

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

// Panel types re-exported so existing `$lib/stores/score.svelte` imports keep
// working; the definitions (and the docking logic) live in panels.svelte.ts.
export type { Dock, PanelId };

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

	// Bottom edit panel UI. On mobile, the note editor and tracks panel share
	// the same dock and are mutually exclusive. On desktop, the tracks panel
	// and the key-input strip share the dock instead — see mixerOpen/keyInputOpen.
	#editModeState = $state(false);
	#mixerOpenState = $state(false);
	editTool = $state<'keypad' | 'fretboard' | 'piano'>('keypad');
	/** Which attribute strip the mobile edit panel shows: note/beat controls or
	 *  bar (measure) controls. Desktop shows both at once and ignores this. */
	editScope = $state<'note' | 'bar'>('note');
	songModalOpen = $state(false);
	settingsOpen = $state(false);
	openFileModalOpen = $state(false);
	/** Mobile-only prompt shown when exporting a PDF from continuous view: it
	 *  asks the user to switch to page view first, since mobile can't flip and
	 *  print in the same tick (see exportPdf). */
	pdfExportModalOpen = $state(false);
	/** Track-staff right-click menu (any track). Closed on outer scroll. */
	contextMenuOpen = $state(false);

	// Desktop-only UI state. keyInputOpen controls the bottom key-entry panel
	// (keypad/fretboard/piano) independently of the left note-properties panel.
	// tempoOpen and addRemoveOpen lift those formerly-local BottomBar states into
	// the store so the desktop right panel can read them.
	isDesktop = $state(false);
	// True while the score is being re-laid-out after a viewport/width change.
	// Relaying out a large score is a synchronous, main-thread cost, so a
	// spinner overlay (see +page) covers the brief jank rather than letting the
	// stale staff sit frozen until the new layout paints. Driven by the width
	// observer's onBusy signal in ScoreArea.
	scoreResizing = $state(false);
	// Whether a score is currently open. When false the welcome/empty state is
	// shown in place of the editor. Not persisted directly — it's inferred on
	// load from whether an autosaved score exists, set true by New/Open, and
	// cleared by closeDocument() (which also drops the autosave so a reload lands
	// back on the welcome screen).
	documentOpen = $state(true);
	#keyInputOpenState = $state(false);
	tempoOpen = $state(false);
	addRemoveOpen = $state(false);
	trackControlOpen = $state(false);
	trackControlIndex = $state(-1);
	/** Chromatic tuner — a floating window on desktop, a modal on mobile (so it
	 *  survives the breakpoint switch open, just changing its clothes). */
	tunerOpen = $state(false);

	// Composed domain controllers. The store stays the single entry point —
	// components keep calling `store.x` — and these own the mechanics: panel
	// placement/docking, persisted prefs, and undo history + autosave. The host
	// callbacks are the few store-owned bits each domain needs (open flags live
	// here because they're entangled with mobile modal exclusivity; the score
	// itself stays here as document state).
	#panels = new PanelController({
		isDesktop: () => this.isDesktop,
		isOpen: (id) => this.isPanelOpen(id),
		setOpen: (id, v) => this.#setPanelOpen(id, v),
		persistPrefs: () => this.#prefs.persist()
	});
	#prefs = new PrefsController(this.#panels);
	#history = new ScoreHistory({
		getScore: () => this.score,
		setScore: (s) => (this.score = s),
		afterRestore: () => this.clampCursor()
	});

	/** Desktop panel placement (dock/floating offset per panel), owned by the
	 *  panel controller; exposed for deep reads/writes (e.g. panel-drag.ts). */
	get panelLayout() {
		return this.#panels.panelLayout;
	}
	get bottomSplitSwap() {
		return this.#panels.bottomSplitSwap;
	}
	/** Live drag-to-dock session (see PanelController). */
	get draggingPanel() {
		return this.#panels.draggingPanel;
	}
	get dropTarget() {
		return this.#panels.dropTarget;
	}
	get frontPanel() {
		return this.#panels.frontPanel;
	}

	/** Call once from onMount after browser APIs are available. */
	initLayout() {
		// Flush a pending debounced autosave before the page goes away —
		// pagehide covers navigation/close, visibilitychange covers mobile
		// backgrounding (where pagehide may never fire before the tab is killed).
		window.addEventListener('pagehide', () => this.flushPersist());
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') this.flushPersist();
		});
		const mq = window.matchMedia('(min-width: 1024px)');
		this.isDesktop = mq.matches;
		if (mq.matches) {
			this.#mixerOpenState = true;
			this.clampFloatingPanels();
		}
		mq.addEventListener('change', (e) => {
			// Crossing the breakpoint swaps the entire desktop⇄mobile layout, which
			// re-lays-out the whole score — on a long song that's a multi-second,
			// main-thread-blocking rebuild. Show the spinner FIRST and let it paint
			// (two frames) before flipping, so the overlay is on screen (and its CSS
			// spin keeps running on the compositor) throughout the freeze instead of
			// only appearing after it. The overlay lives outside the layout branches
			// (see +page) so it survives the swap.
			this.showRelayout();
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					this.isDesktop = e.matches;
					if (e.matches) {
						this.#mixerOpenState = true;
						this.clampFloatingPanels();
					} else {
						this.keyInputOpen = false;
						this.tempoOpen = false;
						this.addRemoveOpen = false;
					}
					// Hide once the new layout has rendered and painted.
					requestAnimationFrame(() => requestAnimationFrame(() => this.hideRelayoutSoon()));
				})
			);
		});
	}

	// ---- relayout spinner ---------------------------------------------------
	// A single flag drives the score-area spinner (see +page). Any source that is
	// about to trigger a heavy relayout — the width observer or the breakpoint
	// switch — calls showRelayout(); each calls hideRelayoutSoon() when its work
	// settles. hideRelayoutSoon is debounced and cancelled by any newer show, so
	// overlapping sources coalesce into one continuous overlay, and a safety timer
	// guarantees it never sticks if a hide is somehow missed.
	#relayoutHideTimer: ReturnType<typeof setTimeout> | undefined;
	#relayoutSafetyTimer: ReturnType<typeof setTimeout> | undefined;

	showRelayout() {
		clearTimeout(this.#relayoutHideTimer);
		clearTimeout(this.#relayoutSafetyTimer);
		this.scoreResizing = true;
		this.#relayoutSafetyTimer = setTimeout(() => (this.scoreResizing = false), 6000);
	}

	hideRelayoutSoon() {
		clearTimeout(this.#relayoutHideTimer);
		this.#relayoutHideTimer = setTimeout(() => {
			clearTimeout(this.#relayoutSafetyTimer);
			this.scoreResizing = false;
		}, 80);
	}

	// ---- desktop panel docking ---------------------------------------------

	/** The docks a given panel is allowed to occupy. */
	panelAllowed(id: PanelId): Dock[] {
		return this.#panels.panelAllowed(id);
	}

	panelDock(id: PanelId): Dock {
		return this.#panels.panelDock(id);
	}

	/** Whether a panel's content is currently showing (drives which slot it fills). */
	isPanelOpen(id: PanelId): boolean {
		switch (id) {
			case 'note':
				return this.editMode;
			case 'keys':
				return this.keyInputOpen;
			case 'song':
				return this.songModalOpen;
			case 'track':
				return this.trackControlOpen;
			case 'tempo':
				return this.tempoOpen;
			case 'addRemove':
				return this.addRemoveOpen;
			case 'tuner':
				return this.tunerOpen;
		}
	}

	#setPanelOpen(id: PanelId, v: boolean) {
		switch (id) {
			case 'note':
				this.editMode = v;
				break;
			case 'keys':
				this.keyInputOpen = v;
				break;
			case 'song':
				this.songModalOpen = v;
				break;
			case 'track':
				this.trackControlOpen = v;
				break;
			case 'tempo':
				this.tempoOpen = v;
				break;
			case 'addRemove':
				this.addRemoveOpen = v;
				break;
			case 'tuner':
				this.tunerOpen = v;
				break;
		}
	}

	openPanel(id: PanelId) {
		this.#panels.openPanel(id);
	}

	closePanel(id: PanelId) {
		this.#panels.closePanel(id);
	}

	togglePanel(id: PanelId) {
		this.#panels.togglePanel(id);
	}

	/** Raise a panel above its peers (last grabbed wins). */
	bringToFront(id: PanelId) {
		this.#panels.bringToFront(id);
	}

	/** Stacking order for a floating panel (see PanelController.panelZ). */
	panelZ(id: PanelId): number {
		return this.#panels.panelZ(id);
	}

	setPanelDock(id: PanelId, dock: Dock) {
		this.#panels.setPanelDock(id, dock);
	}

	setPanelFloatPos(id: PanelId, x: number, y: number) {
		this.#panels.setPanelFloatPos(id, x, y);
	}

	toggleBottomSplit() {
		this.#panels.toggleBottomSplit();
	}

	beginPanelDrag(id: PanelId) {
		this.#panels.beginPanelDrag(id);
	}

	updatePanelDrag(id: PanelId, clientX: number, clientY: number) {
		this.#panels.updatePanelDrag(id, clientX, clientY);
	}

	endPanelDrag(id: PanelId, offsetX: number, offsetY: number) {
		this.#panels.endPanelDrag(id, offsetX, offsetY);
	}

	clampFloatingPanels() {
		this.#panels.clampFloatingPanels();
	}

	get editMode(): boolean {
		return this.#editModeState;
	}
	set editMode(v: boolean) {
		this.#editModeState = v;
		if (v && !this.isDesktop) this.#mixerOpenState = false;
	}

	/** Tracks panel (the menubar "Tracks" panel). On mobile it shares the bottom
	 *  dock with the note editor, so the two stay mutually exclusive there; on
	 *  desktop every panel docks freely, so no exclusivity is needed. */
	get mixerOpen(): boolean {
		return this.#mixerOpenState;
	}
	set mixerOpen(v: boolean) {
		this.#mixerOpenState = v;
		if (v && !this.isDesktop) this.#editModeState = false;
	}

	/** Bottom key-input pad (keypad/fretboard/piano). Desktop-only; freely
	 *  dockable, so it can coexist with the tracks panel and note editor. */
	get keyInputOpen(): boolean {
		return this.#keyInputOpenState;
	}
	set keyInputOpen(v: boolean) {
		this.#keyInputOpenState = v;
	}

	// Track focus / fold state (UI-only, keyed by track id, not persisted).
	collapsed = $state<Record<string, boolean>>({});
	// Always initialized to the first track so the sheet never shows "all tracks"
	focusedTrackId = $state<string | null>(this.score.tracks[0]?.id ?? null);
	// Multi-track view: set of focused track IDs (empty = show all)
	focusedTrackIds = $state(new SvelteSet<string>());
	// Tracks explicitly hidden via the visibility popover. Independent of focus:
	// a hidden track is removed from the score AND the tracks panel entirely,
	// regardless of view mode, and never merely "focused".
	hiddenTrackIds = $state(new SvelteSet<string>());
	// 'single': only one track focused at a time; 'multi': toggle multiple tracks
	trackViewMode = $state<'single' | 'multi'>('single');

	// Playback
	isPlaying = $state(false);
	/** True after Pause — distinct from a full Stop. The cursor is synced to
	 *  the paused position, so the next Play resumes from `cursor`. */
	isPaused = $state(false);
	playhead = $state<{ measure: number; beat: number } | null>(null);

	// User preferences (persisted to localStorage) — owned by PrefsController;
	// these are device/session settings rather than document data. Delegated
	// getter/setter pairs keep the `store.metronomeOn = …` call sites working.
	get metronomeOn(): boolean {
		return this.#prefs.metronomeOn;
	}
	set metronomeOn(v: boolean) {
		this.#prefs.metronomeOn = v;
	}
	get metronomeSound(): MetronomeSound {
		return this.#prefs.metronomeSound;
	}
	set metronomeSound(v: MetronomeSound) {
		this.#prefs.metronomeSound = v;
	}
	get metronomeVolume(): number {
		return this.#prefs.metronomeVolume;
	}
	set metronomeVolume(v: number) {
		this.#prefs.metronomeVolume = v;
	}
	get loopEnabled(): boolean {
		return this.#prefs.loopEnabled;
	}
	set loopEnabled(v: boolean) {
		this.#prefs.loopEnabled = v;
	}
	get countInOn(): boolean {
		return this.#prefs.countInOn;
	}
	set countInOn(v: boolean) {
		this.#prefs.countInOn = v;
	}
	get playbackSpeedOn(): boolean {
		return this.#prefs.playbackSpeedOn;
	}
	set playbackSpeedOn(v: boolean) {
		this.#prefs.playbackSpeedOn = v;
	}
	/** Playback speed multiplier (0.5..1.5) applied only while speed is on. */
	get playbackSpeed(): number {
		return this.#prefs.playbackSpeed;
	}
	set playbackSpeed(v: number) {
		this.#prefs.playbackSpeed = v;
	}
	/** The speed the engine should actually play at (1 while speed is off). */
	get effectivePlaybackSpeed(): number {
		return this.#prefs.effectivePlaybackSpeed;
	}
	/** Page view: lay the score out as A4 pages (with page breaks and numbered
	 *  footers) instead of one continuous sheet. Also what PDF export prints. */
	get pageView(): boolean {
		return this.#prefs.pageView;
	}
	set pageView(v: boolean) {
		this.#prefs.pageView = v;
	}
	/** Soundfont quality: standard (SF3) or high (SF2). The engine applies a
	 *  change via audio.switchSoundFont(), see SettingsModal. */
	get soundFontQuality(): SoundFontQuality {
		return this.#prefs.soundFontQuality;
	}
	set soundFontQuality(v: SoundFontQuality) {
		this.#prefs.soundFontQuality = v;
	}
	/** Score-view zoom factor (0.5..2, 1 = 100%). ScoreArea applies it as CSS
	 *  zoom on the paper, so only the score scales — never the panels/chrome. */
	get scoreZoom(): number {
		return this.#prefs.scoreZoom;
	}
	set scoreZoom(v: number) {
		this.#prefs.scoreZoom = v;
	}
	zoomIn() {
		this.#prefs.zoomIn();
		showZoomToast();
	}
	zoomOut() {
		this.#prefs.zoomOut();
		showZoomToast();
	}
	resetZoom() {
		this.#prefs.scoreZoom = 1;
		showZoomToast();
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

	#loaded = false;

	/** Bumped whenever the score's *compiled* content changes — see ScoreHistory,
	 *  which owns the undo/redo stacks, the settled baseline and the autosave. */
	get scoreVersion(): number {
		return this.#history.scoreVersion;
	}

	get track(): OtoTrack {
		return this.score.tracks[this.cursor.track] ?? this.score.tracks[0];
	}

	get canUndo(): boolean {
		return this.#history.canUndo;
	}

	get canRedo(): boolean {
		return this.#history.canRedo;
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
		const raw = this.#history.readAutosave();
		if (raw) {
			try {
				this.score = parse(raw);
				// A restored autosave means the user had a document open — go straight
				// to the editor. A first-ever visit (no autosave) opens on the welcome
				// screen instead.
				this.documentOpen = true;
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
		// Warm the history baseline during idle so the *first* edit doesn't pay the
		// whole-score snapshot on its keystroke (the document was assigned directly
		// here, not through commit()).
		this.#history.scheduleSettle();
	}

	/** Restore persisted user preferences (metronome/loop/panel placement/…).
	 *  Safe to call once on startup; missing or malformed values keep defaults. */
	loadPrefs() {
		this.#prefs.load();
	}

	/** Schedule a debounced autosave (see ScoreHistory for the mechanics). */
	persist() {
		this.#history.persist();
	}

	/** Write any pending autosave immediately (page is being hidden/unloaded). */
	flushPersist() {
		this.#history.flushPersist();
	}

	/** Open an undoable edit, run a mutation and persist (see ScoreHistory.commit
	 *  for the baseline mechanics and when to pass `coalesceKey`). */
	commit(mutate: () => void, coalesceKey?: string) {
		this.#history.commit(mutate, coalesceKey);
	}

	/** Mutate and persist without opening a new undo entry — for use inside a
	 *  gesture (see beginGesture) where the entry was already opened up front. */
	commitLive(mutate: () => void) {
		this.#history.commitLive(mutate);
	}

	/** Begin a continuous mixer gesture (a fader/knob drag): one undo entry for
	 *  the whole drag. Pair with endGesture(). */
	beginGesture() {
		this.#history.beginGesture();
	}

	endGesture() {
		this.#history.endGesture();
	}

	undo() {
		this.#history.undo();
	}

	redo() {
		this.#history.redo();
	}

	// ---- document ops ------------------------------------------------------

	newScore() {
		this.documentOpen = true;
		this.commit(() => {
			this.score = makeScore();
			this.cursor = { track: 0, measure: 0, beat: 0, string: 0, voice: 0 };
			this.selection = null;
		});
		this.#refocusAfterLoad();
	}

	loadScore(text: string) {
		const parsed = parse(text);
		this.documentOpen = true;
		this.commit(() => {
			this.score = parsed;
			this.cursor = { track: 0, measure: 0, beat: 0, string: 0, voice: 0 };
			this.selection = null;
		});
		this.#refocusAfterLoad();
	}

	/** Re-anchor track focus/fold state to the freshly loaded score. Without
	 *  this, focusedTrackId keeps pointing at a track ID from the previous
	 *  score (tracks get fresh IDs on import), so isTrackVisible() matches
	 *  nothing and the score area renders blank until a track is clicked. */
	#refocusAfterLoad() {
		this.collapsed = {};
		this.focusedTrackIds = new SvelteSet();
		this.hiddenTrackIds = new SvelteSet();
		this.focusedTrackId = this.score.tracks[0]?.id ?? null;
	}

	/** Close the current score by resetting to a fresh blank one (one track, four
	 *  empty bars). There's no welcome/empty state anymore, so the editor stays
	 *  open on the blank score. Drops the autosave. Callers confirm unsaved-change
	 *  loss first. */
	closeDocument() {
		this.documentOpen = true;
		this.score = makeScore();
		this.cursor = { track: 0, measure: 0, beat: 0, string: 0, voice: 0 };
		this.selection = null;
		// The document was replaced wholesale — drop the history, the settled
		// baseline (and any in-flight walk) and the pending autosave, then remove
		// the autosaved blob itself: it belongs to the score being closed.
		this.#history.reset();
		this.#history.clearAutosave();
		this.#refocusAfterLoad();
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
		// Drop any hidden-track IDs that no longer exist.
		const liveIds = this.score.tracks.map((t) => t.id);
		if ([...this.hiddenTrackIds].some((id) => !liveIds.includes(id))) {
			this.hiddenTrackIds = new SvelteSet(
				[...this.hiddenTrackIds].filter((id) => liveIds.includes(id))
			);
		}
	}

	/** Move the track at `from` so it ends up at index `to` (drag-reorder in the
	 *  tracks panel). Focus/hidden state is ID-keyed and survives untouched; the
	 *  index-based cursor and open track-control panel are remapped so they keep
	 *  pointing at the same tracks. */
	moveTrack(from: number, to: number) {
		const n = this.score.tracks.length;
		if (from === to || from < 0 || from >= n || to < 0 || to >= n) return;
		const remap = (i: number) =>
			i === from ? to : i > from && i <= to ? i - 1 : i < from && i >= to ? i + 1 : i;
		this.commit(() => {
			const [t] = this.score.tracks.splice(from, 1);
			this.score.tracks.splice(to, 0, t);
			this.cursor.track = remap(this.cursor.track);
		});
		if (this.trackControlIndex >= 0) this.trackControlIndex = remap(this.trackControlIndex);
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
		this.#history.dirtyBaseline();
		this.persist();
	}
	setPan(index: number, p: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		t.pan = clamp(p, -1, 1);
		this.#history.dirtyBaseline();
		this.persist();
	}
	setEqBand(index: number, band: 'low' | 'mid' | 'high', db: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		t.eq = { ...t.eq, [band]: clamp(db, -12, 12) };
		this.#history.dirtyBaseline();
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
		this.#history.dirtyBaseline();
		this.persist();
	}

	// ---- audio backing track (config only; bytes live in the controller) -----
	//
	// Only ever one audio track. Its config is part of the .oto document so
	// tempo/position/pitch persist; the audio file itself is held separately by
	// the runtime controller (see $lib/audio/audio-track). Discrete changes go
	// through commit() (undoable); continuous drags (offset/volume) mutate +
	// persist directly and rely on beginGesture()/endGesture() for undo, exactly
	// like the mixer faders — and deliberately skip the scoreVersion bump so a
	// drag never triggers a MIDI recompile (audio isn't in the MIDI).

	get audio(): AudioTrackConfig | undefined {
		return this.score.audio;
	}
	get hasAudio(): boolean {
		return !!this.score.audio;
	}

	/** Attach a freshly imported audio file. Preserves any existing config whose
	 *  file name matches (so re-adding the same file after reopening a document
	 *  keeps the saved tempo/position/pitch), otherwise starts from defaults. */
	addAudioTrack(fileName: string) {
		this.commit(() => {
			const existing = this.score.audio;
			this.score.audio =
				existing && existing.fileName === fileName ? existing : makeAudioConfig(fileName);
		});
	}

	removeAudioTrack() {
		this.commit(() => {
			this.score.audio = undefined;
		});
	}

	/** Discrete, undoable audio-config change (name, tempo, pitch, toggles). */
	updateAudio(patch: Partial<AudioTrackConfig>) {
		if (!this.score.audio) return;
		this.commit(() => {
			Object.assign(this.score.audio!, patch);
		});
	}

	/** Continuous audio-config change (offset drag, volume fader) — no version
	 *  bump, no per-tick undo snapshot. */
	setAudioOffset(sec: number) {
		if (!this.score.audio || !isFinite(sec)) return;
		this.score.audio.offsetSec = sec;
		this.#history.dirtyBaseline();
		this.persist();
	}
	setAudioVolume(v: number) {
		if (!this.score.audio) return;
		this.score.audio.volume = clamp(v, 0, 1);
		this.#history.dirtyBaseline();
		this.persist();
	}
	toggleAudioMute() {
		if (!this.score.audio) return;
		this.commit(() => (this.score.audio!.muted = !this.score.audio!.muted));
	}
	toggleAudioSolo() {
		if (!this.score.audio) return;
		this.commit(() => (this.score.audio!.soloed = !this.score.audio!.soloed));
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

	/** True if the given track ID has been explicitly hidden via the visibility
	 *  popover. Independent of focus/view mode. */
	isTrackHidden(id: string): boolean {
		return this.hiddenTrackIds.has(id);
	}

	/** True if the given track ID should be visible in the score area. A track
	 *  hidden via the visibility popover is never shown; otherwise the current
	 *  focus (single-view focused track, or multi-view focused set) decides. */
	isTrackVisible(id: string): boolean {
		if (this.hiddenTrackIds.has(id)) return false;
		if (this.trackViewMode === 'single') {
			return !this.focusedTrackId || this.focusedTrackId === id;
		}
		return this.focusedTrackIds.size === 0 || this.focusedTrackIds.has(id);
	}

	/** Explicitly show/hide one track everywhere (the tracks-panel visibility
	 *  popover). This is a pure visibility toggle — it does NOT focus the track
	 *  or touch the focus set, and it works the same in single and multi view.
	 *  The last remaining visible track can never be hidden. */
	setTrackVisible(id: string, visible: boolean) {
		if (!this.score.tracks.some((t) => t.id === id)) return;
		const next = new SvelteSet(this.hiddenTrackIds);
		if (visible) {
			next.delete(id);
		} else {
			// Refuse to hide the last track that's still visible.
			const visibleCount = this.score.tracks.filter((t) => !next.has(t.id)).length;
			if (visibleCount <= 1) return;
			next.add(id);
		}
		this.hiddenTrackIds = next;
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

	/** Bring one bar of one track into view in the score area: whatever the
	 *  current focus was, make that track's staff the (or one of the) visible
	 *  one(s), put the cursor on the bar, and ask the score view to scroll to it.
	 *  Single view swaps the focused track outright; multi view only widens an
	 *  existing focus set (an empty set already shows everything). */
	goToBar(trackIndex: number, measure: number) {
		const t = this.score.tracks[trackIndex];
		if (!t) return;
		if (this.trackViewMode === 'single') {
			this.focusedTrackId = t.id;
		} else if (this.focusedTrackIds.size > 0 && !this.focusedTrackIds.has(t.id)) {
			this.focusedTrackIds = new SvelteSet([...this.focusedTrackIds, t.id]);
		}
		this.setCursor({ track: trackIndex, measure, beat: 0 });
		// Scroll to where the cursor actually landed: a click past the end of a
		// track shorter than the longest one clamps, and the bar it clamped to is
		// the one that exists to scroll to.
		this.scrollToTrack(t.id, this.cursor.measure);
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
		if (this.#rejectLockedEdit(measureIndex)) return;
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
		if (this.#rejectLockedEdit(measureIndex)) return;
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

	/**
	 * Mid-song tempo change: pin a new BPM to a measure. Like a time-signature
	 * change it's score structure (applied to the same bar on every track) and
	 * stays in effect until the next change.
	 */
	setMeasureTempo(measureIndex: number, bpm: number) {
		const clamped = Math.max(20, Math.min(400, bpm));
		this.commit(() => this.#eachTrackMeasure(measureIndex, (m) => (m.tempo = clamped)));
	}

	/** Remove a measure's tempo change so the bar falls back to the tempo already
	 *  in effect (an earlier change, or the song's base tempo). */
	clearMeasureTempo(measureIndex: number) {
		this.commit(() => this.#eachTrackMeasure(measureIndex, (m) => (m.tempo = undefined)));
	}

	/** Tempo in effect at a measure (nearest explicit change at or before it). */
	tempoAt(measureIndex: number): number {
		const measures = this.track.measures;
		for (let i = Math.min(measureIndex, measures.length - 1); i >= 0; i--) {
			const t = measures[i].tempo;
			if (t) return t;
		}
		return this.score.tempo;
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
		if (this.#rejectLockedEdit()) return;
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
		}, 'note-entry');
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
		if (this.#rejectLockedEdit()) return;
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
				if (!measure || measure.locked) continue;
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
			if (this.#rejectLockedEdit()) return;
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
		if (this.#rejectLockedEdit()) return;
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
				if (!targetMeasure || targetMeasure.locked) continue;
				for (let i = 0; i < group.length; i++) {
					targetMeasure.beats.splice(i, 0, JSON.parse(JSON.stringify(group[i])));
				}
			}

			this.cursor = { ...this.cursor, beat: insertAt };
		});
	}

	setBeatDuration(duration: DurationValue, dotted: boolean) {
		if (this.#rejectLockedEdit()) return;
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			beat.duration = duration;
			beat.dotted = dotted;
		});
	}

	/** Insert a new beat after the cursor with the active duration, move into it. */
	insertBeat() {
		if (this.#rejectLockedEdit()) return;
		this.commit(() => {
			const beats = this.editBeats();
			beats.splice(this.cursor.beat + 1, 0, this.#newBeat());
			this.cursor = { ...this.cursor, beat: this.cursor.beat + 1 };
		});
	}

	/** Insert a new beat *before* the cursor, pushing the current beat right. */
	insertBeatBefore() {
		if (this.#rejectLockedEdit()) return;
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
		if (this.#rejectLockedEdit()) return;
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
		if (this.#rejectLockedEdit()) return;
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
		if (this.#rejectLockedEdit()) return;
		this.commit(() => {
			const beat = this.currentBeatRef();
			const note = beat?.notes.find((n) => n.string === this.cursor.string);
			if (!note) return;
			note.bend = semitones;
			note.techniques = addTechnique(note.techniques, 'bend');
		});
	}

	/** The most recent note on the cursor's string strictly before the cursor
	 *  beat, scanning back across measures in the active voice — the note a tie
	 *  applied at the cursor would continue. */
	private tieOriginAt(): OtoNote | null {
		const { measure, beat, string, voice } = this.cursor;
		for (let mi = measure; mi >= 0; mi--) {
			const m = this.track.measures[mi];
			const beats = voice === 1 ? m?.voice2 : m?.beats;
			if (!beats) continue;
			const start = mi === measure ? Math.min(beat, beats.length) - 1 : beats.length - 1;
			for (let bi = start; bi >= 0; bi--) {
				const n = beats[bi].notes.find((x) => x.string === string);
				if (n) return n;
			}
		}
		return null;
	}

	/** Whether a tie applies at the cursor: an earlier note exists on the
	 *  cursor's string to continue, or the note here is already tied (untie). */
	get canTie(): boolean {
		return !!this.currentNote?.tied || this.tieOriginAt() !== null;
	}

	/**
	 * Toggle a tie at the cursor. A tie continues the most recent note on the
	 * same string (even several beats or bars back): applying it places a note
	 * with that pitch marked `tied`, which sustains the earlier note instead of
	 * restriking it. Toggling a tied note removes it again.
	 */
	toggleNoteTie() {
		if (this.#rejectLockedEdit()) return;
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			const existing = beat.notes.find((n) => n.string === this.cursor.string);
			if (existing?.tied) {
				// A tied note is purely a continuation — untying removes it.
				beat.notes.splice(beat.notes.indexOf(existing), 1);
				if (beat.notes.length === 0) beat.rest = true;
				return;
			}
			const origin = this.tieOriginAt();
			if (!origin) return;
			// Continue the pitch the origin ends on (its slide target, if any).
			const fret = origin.slideTo ?? origin.fret;
			if (existing) {
				existing.fret = fret;
				existing.tied = true;
				return;
			}
			if (beat.notes.length === 0) {
				beat.duration = this.activeDuration;
				beat.dotted = this.activeDotted;
			}
			beat.rest = false;
			beat.notes.push({ string: this.cursor.string, fret, tied: true });
			beat.notes.sort((a, b) => a.string - b.string);
		});
	}

	setSlideTarget(fret: number) {
		if (this.#rejectLockedEdit()) return;
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

	/** The beat under the cursor (read-only view for the editor panels). */
	get currentBeat(): OtoBeat | null {
		return this.currentBeatRef();
	}

	// ---- beat-level notation marks -------------------------------------------
	//
	// All of these toggle: applying the value already on the beat clears it, so
	// a single button per mark covers both set and unset.

	setBeatTuplet(n: TupletValue) {
		if (this.#rejectLockedEdit()) return;
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			beat.tuplet = beat.tuplet === n ? undefined : n;
		});
	}

	setBeatDynamic(d: Dynamic) {
		if (this.#rejectLockedEdit()) return;
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			beat.dynamic = beat.dynamic === d ? undefined : d;
		});
	}

	setBeatStrum(dir: StrumDirection) {
		if (this.#rejectLockedEdit()) return;
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			beat.strum = beat.strum === dir ? undefined : dir;
		});
	}

	toggleBeatFermata() {
		if (this.#rejectLockedEdit()) return;
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			beat.fermata = beat.fermata ? undefined : true;
		});
	}

	setBeatOttava(o: Ottava) {
		if (this.#rejectLockedEdit()) return;
		this.commit(() => {
			const beat = this.currentBeatRef();
			if (!beat) return;
			beat.ottava = beat.ottava === o ? undefined : o;
		});
	}

	// ---- measure-level structure marks ----------------------------------------
	//
	// Barlines, repeats, voltas and segno/coda are score structure, so — like a
	// time-signature change — they're applied to the same measure on every track
	// to keep the grid consistent. Simile is per-track content ("this instrument
	// repeats its previous bar") and only touches the active track.

	/** The cursor measure on the active track (for reading current mark state). */
	get currentMeasure(): OtoMeasure | null {
		return this.track.measures[this.cursor.measure] ?? null;
	}

	#eachTrackMeasure(measureIndex: number, fn: (m: OtoMeasure) => void) {
		for (const t of this.score.tracks) {
			const m = t.measures[measureIndex];
			if (m) fn(m);
		}
	}

	toggleMeasureDoubleBarline(measureIndex: number) {
		const cur = this.track.measures[measureIndex]?.barline;
		const next = cur === 'double' ? undefined : ('double' as const);
		this.commit(() => this.#eachTrackMeasure(measureIndex, (m) => (m.barline = next)));
	}

	toggleMeasureRepeatStart(measureIndex: number) {
		const next = this.track.measures[measureIndex]?.repeatStart ? undefined : true;
		this.commit(() => this.#eachTrackMeasure(measureIndex, (m) => (m.repeatStart = next)));
	}

	toggleMeasureRepeatEnd(measureIndex: number) {
		const next = this.track.measures[measureIndex]?.repeatEnd ? undefined : true;
		this.commit(() =>
			this.#eachTrackMeasure(measureIndex, (m) => {
				m.repeatEnd = next;
				if (!next) m.repeatCount = undefined;
			})
		);
	}

	/** Play count for the repeated passage ending at this measure. Selecting a
	 *  count also arms the end repeat; ×2 is the notation default, so it's
	 *  stored as undefined and re-selecting the active count falls back to it. */
	setMeasureRepeatCount(measureIndex: number, count: number) {
		const m = this.track.measures[measureIndex];
		const cur = m?.repeatEnd ? (m.repeatCount ?? 2) : undefined;
		const next = cur === count ? 2 : count;
		this.commit(() =>
			this.#eachTrackMeasure(measureIndex, (mm) => {
				mm.repeatEnd = true;
				mm.repeatCount = next === 2 ? undefined : next;
			})
		);
	}

	/** Volta (alternate ending) number; re-applying the same number clears it. */
	setMeasureVolta(measureIndex: number, n: number) {
		const next = this.track.measures[measureIndex]?.volta === n ? undefined : n;
		this.commit(() => this.#eachTrackMeasure(measureIndex, (m) => (m.volta = next)));
	}

	toggleMeasureSegno(measureIndex: number) {
		const next = this.track.measures[measureIndex]?.segno ? undefined : true;
		this.commit(() => this.#eachTrackMeasure(measureIndex, (m) => (m.segno = next)));
	}

	toggleMeasureCoda(measureIndex: number) {
		const next = this.track.measures[measureIndex]?.coda ? undefined : true;
		this.commit(() => this.#eachTrackMeasure(measureIndex, (m) => (m.coda = next)));
	}

	/** Simile is per-track: only the active track's bar becomes a repeat mark. */
	toggleMeasureSimile(measureIndex: number) {
		this.commit(() => {
			const m = this.track.measures[measureIndex];
			if (!m) return;
			m.simile = m.simile ? undefined : true;
		});
	}

	// ---- bar lock / forced line break ------------------------------------------
	//
	// Both are structural (applied to the same bar on every track, like a
	// time-signature change): a lock protects the whole bar column from content
	// edits, and a line break must move every track's layout together so the
	// multi-track view stays aligned.

	/** True when the bar at `measureIndex` (active track) is locked. */
	isMeasureLocked(measureIndex: number): boolean {
		return !!this.track.measures[measureIndex]?.locked;
	}

	/** Guard for content edits: true (and surfaces a toast) when the target bar
	 *  is locked, so callers can bail out before mutating anything. */
	#rejectLockedEdit(measureIndex = this.cursor.measure): boolean {
		if (!this.isMeasureLocked(measureIndex)) return false;
		toast.warning(`Bar ${measureIndex + 1} is locked`, { id: 'locked-bar' });
		return true;
	}

	/** Lock/unlock a bar. Locked bars reject content edits until unlocked. */
	toggleMeasureLocked(measureIndex: number) {
		const next = this.track.measures[measureIndex]?.locked ? undefined : true;
		this.commit(() => this.#eachTrackMeasure(measureIndex, (m) => (m.locked = next)));
	}

	/** Force/unforce this bar to start a new line in the score layout. */
	toggleMeasureLineBreak(measureIndex: number) {
		const next = this.track.measures[measureIndex]?.lineBreak ? undefined : true;
		this.commit(() => this.#eachTrackMeasure(measureIndex, (m) => (m.lineBreak = next)));
	}
}

function addTechnique(list: Technique[] | undefined, tech: Technique): Technique[] {
	const arr = list ?? [];
	return arr.includes(tech) ? arr : [...arr, tech];
}

export const store = new ScoreStore();
