// Central reactive application state, built on Svelte 5 runes.
//
// One singleton store holds the score, the edit cursor, the loop selection,
// the active duration/effects palette and playback state. Components read these
// directly (they're deep-reactive `$state`) and call methods to mutate.

import { SvelteSet } from 'svelte/reactivity';
import { toast } from 'svelte-sonner';
import {
	makeScore,
	makeTrack,
	makeAudioConfig,
	parse,
	serialize,
	serializeCompact,
	restBeat,
	emptyMeasure,
	uid
} from '$lib/oto/format';
import { analyzeMeasure, beatsFilled, measureCapacity } from '$lib/oto/duration';
import { detuneTrack, transposeTrackFrets, retuneTrack } from '$lib/oto/transpose';
import { MAX_SECTIONS } from '$lib/oto/sections';
import type { MetronomeSound } from '$lib/audio/engine';
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

const STORAGE_KEY = 'oto.score';
const PREFS_KEY = 'oto.prefs';
const AUTOSAVE = true;

const METRONOME_SOUNDS: MetronomeSound[] = ['click', 'beep', 'wood', 'bell'];

/** Where a desktop panel currently lives. `float` = a free-floating, draggable
 *  window; the others dock it into the corresponding edge slot. */
export type Dock = 'left' | 'right' | 'bottom' | 'float';

/** The desktop panels that can be freely docked/undocked and remember their
 *  placement. `song`/`track`/`tempo`/`addRemove` all render through RightPanel
 *  (one open at a time) but each remembers its own dock independently. `tuner`
 *  is float-only on desktop and a modal on mobile. */
export type PanelId = 'note' | 'keys' | 'song' | 'track' | 'tempo' | 'addRemove' | 'tuner';

/** Persisted placement for one panel: which edge it's docked to (or `float`),
 *  plus the last floating-window offset so it reopens where the user left it. */
interface PanelLayout {
	dock: Dock;
	x: number;
	y: number;
}

/** Which docks each panel is allowed to use. Song/track/tempo/add-remove are
 *  side/float only (no bottom); the note editor and key-input pad may also dock
 *  to the bottom strip. */
const PANEL_ALLOWED: Record<PanelId, Dock[]> = {
	note: ['left', 'right', 'bottom', 'float'],
	// The key-input pad (keypad/fretboard/piano) is a wide, landscape component —
	// it only makes sense along the bottom strip or as a floating window, never
	// squeezed into a narrow side column.
	keys: ['bottom', 'float'],
	song: ['left', 'right', 'float'],
	track: ['left', 'right', 'float'],
	tempo: ['left', 'right', 'float'],
	addRemove: ['left', 'right', 'float'],
	// The tuner is a compact readout widget — always a small floating window on
	// desktop (mobile shows it as a modal instead).
	tuner: ['float']
};

const PANEL_DEFAULT_DOCK: Record<PanelId, Dock> = {
	note: 'left',
	keys: 'bottom',
	song: 'right',
	track: 'right',
	tempo: 'right',
	addRemove: 'right',
	tuner: 'float'
};

const PANEL_IDS = Object.keys(PANEL_ALLOWED) as PanelId[];

/** Tie-break order when normalizing a legacy layout that somehow put two panels
 *  on the same edge — the first listed keeps the slot, later ones are floated. */
const PANEL_PRIORITY: PanelId[] = ['note', 'song', 'track', 'tempo', 'addRemove', 'keys', 'tuner'];

function defaultPanelLayout(): Record<PanelId, PanelLayout> {
	return Object.fromEntries(
		PANEL_IDS.map((id) => [id, { dock: PANEL_DEFAULT_DOCK[id], x: 0, y: 0 }])
	) as Record<PanelId, PanelLayout>;
}

/** Persisted user-preference shape (a subset of the store's session fields). */
interface StoredPrefs {
	metronomeOn?: boolean;
	metronomeSound?: MetronomeSound;
	metronomeVolume?: number;
	loopEnabled?: boolean;
	countInOn?: boolean;
	playbackSpeedOn?: boolean;
	playbackSpeed?: number;
	panelLayout?: Partial<Record<PanelId, Partial<PanelLayout>>>;
	bottomSplitSwap?: boolean;
	pageView?: boolean;
}

export interface Selection {
	track: number;
	startMeasure: number;
	startBeat: number;
	endMeasure: number;
	endBeat: number;
}

// How long after the last edit the history "baseline" (the expensive snapshot
// that undo reverts to) is refreshed. Editing keeps pushing the previous
// baseline for undo — which is free — and the costly proxy walk is deferred to
// this idle gap instead of blocking each keystroke. A rapid run of edits within
// the window coalesces into one undo entry.
const HISTORY_SETTLE_MS = 400;

/** Run `cb` when the browser is idle (with a bounded wait), falling back to a
 *  short timeout where requestIdleCallback doesn't exist (Safari, node tests).
 *  Returns a canceller. */
function scheduleIdle(cb: (deadline?: IdleDeadline) => void): () => void {
	if (typeof requestIdleCallback === 'function') {
		const id = requestIdleCallback(cb, { timeout: 50 });
		return () => cancelIdleCallback(id);
	}
	const id = setTimeout(cb, 16);
	return () => clearTimeout(id);
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

	// Desktop panel placement. Each panel (note editor, key-input pad, song/track/
	// tempo/add-remove) can be docked to an edge or floated freely, and remembers
	// where the user last put it (persisted via prefs). See setPanelDock / the
	// PANEL_* tables above.
	panelLayout = $state<Record<PanelId, PanelLayout>>(defaultPanelLayout());
	// When the note editor and the key-input pad are BOTH docked to the bottom
	// strip they share it side-by-side; this flips which one sits on the left.
	bottomSplitSwap = $state(false);

	// Live drag-to-dock session: which floating panel is being dragged and which
	// edge (if any) it's currently hovering over. `+page` reads `dropTarget` to
	// paint the drop-zone preview; the drag ends by docking there or floating.
	draggingPanel = $state<PanelId | null>(null);
	dropTarget = $state<Dock | null>(null);
	// The most-recently-grabbed floating panel — rendered on top so it's never
	// buried under another window while you're interacting with it.
	frontPanel = $state<PanelId | null>(null);

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
		return PANEL_ALLOWED[id];
	}

	panelDock(id: PanelId): Dock {
		return this.panelLayout[id].dock;
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

	/** Open a desktop panel. The detail panels (song/track/tempo/add-remove) are
	 *  independent — opening one no longer closes the others — so if a newly-opened
	 *  panel's remembered edge is already taken by another open panel, it opens
	 *  floating instead, letting several coexist on screen. */
	openPanel(id: PanelId) {
		this.#setPanelOpen(id, true);
		const p = this.panelLayout[id];
		if (this.isDesktop) {
			if (
				(p.dock === 'left' || p.dock === 'right') &&
				PANEL_IDS.some(
					(o) => o !== id && this.isPanelOpen(o) && this.panelLayout[o].dock === p.dock
				)
			) {
				// The remembered edge is taken by another open panel — open floating
				// instead so both stay visible.
				p.dock = 'float';
				this.#persistPrefs();
			}
			// Cascade never-placed floating windows (offset 0,0) clear of the left
			// column so they don't stack on top of each other or a left-docked
			// panel; an explicitly-placed spot is kept as-is. Also covers panels
			// that are float-by-default (the tuner) on their first open.
			if (p.dock === 'float' && p.x === 0 && p.y === 0) {
				const others = PANEL_IDS.filter(
					(o) => o !== id && this.isPanelOpen(o) && this.panelLayout[o].dock === 'float'
				).length;
				p.x = 340 + others * 30;
				p.y = 24 + others * 30;
				this.#persistPrefs();
			}
		}
		this.bringToFront(id);
	}

	closePanel(id: PanelId) {
		this.#setPanelOpen(id, false);
	}

	togglePanel(id: PanelId) {
		if (this.isPanelOpen(id)) this.closePanel(id);
		else this.openPanel(id);
	}

	/** Raise a panel above its peers (last grabbed wins). */
	bringToFront(id: PanelId) {
		this.frontPanel = id;
	}

	/** Stacking order for a floating panel: the one being dragged sits above the
	 *  most-recently-grabbed one, which sits above the rest. Kept below the
	 *  shared z-50 overlay layer (Popover/Dialog/DropdownMenu/...) so portalled
	 *  dropdowns opened from a panel's content always render on top of it. */
	panelZ(id: PanelId): number {
		if (this.draggingPanel === id) return 30;
		if (this.frontPanel === id) return 20;
		return 10;
	}

	/** Move a panel to a dock. Left and right are single-occupancy slots, so
	 *  docking there evicts whatever else claimed that edge back to floating —
	 *  keeping the invariant that at most one panel lives on each side. */
	setPanelDock(id: PanelId, dock: Dock) {
		if (!PANEL_ALLOWED[id].includes(dock)) return;
		if (dock === 'left' || dock === 'right') {
			for (const other of PANEL_IDS) {
				if (other !== id && this.panelLayout[other].dock === dock) {
					this.panelLayout[other].dock = 'float';
				}
			}
		}
		this.panelLayout[id].dock = dock;
		this.#persistPrefs();
	}

	/** Remember where a floating panel was dragged to (offset from its anchor). */
	setPanelFloatPos(id: PanelId, x: number, y: number) {
		this.panelLayout[id].x = x;
		this.panelLayout[id].y = y;
		this.#persistPrefs();
	}

	toggleBottomSplit() {
		this.bottomSplitSwap = !this.bottomSplitSwap;
		this.#persistPrefs();
	}

	// ---- drag-to-dock -------------------------------------------------------

	/** How close (px) the pointer must get to an edge for that edge's drop zone
	 *  to arm. */
	static #DOCK_SNAP_PX = 150;

	beginPanelDrag(id: PanelId) {
		this.draggingPanel = id;
		this.dropTarget = null;
	}

	/** While dragging, arm the nearest allowed edge whose drop zone the pointer is
	 *  inside (or clear it when the pointer is out in open space → will float). */
	updatePanelDrag(id: PanelId, clientX: number, clientY: number) {
		if (this.draggingPanel !== id) return;
		const allowed = PANEL_ALLOWED[id];
		const w = window.innerWidth;
		const h = window.innerHeight;
		let best: Dock | null = null;
		let bestDist = ScoreStore.#DOCK_SNAP_PX;
		if (allowed.includes('left') && clientX < bestDist) {
			best = 'left';
			bestDist = clientX;
		}
		if (allowed.includes('right') && w - clientX < bestDist) {
			best = 'right';
			bestDist = w - clientX;
		}
		if (allowed.includes('bottom') && h - clientY < bestDist) {
			best = 'bottom';
			bestDist = h - clientY;
		}
		this.dropTarget = best;
	}

	/** Finish a drag: dock to the armed edge, or persist the new floating offset
	 *  when released in open space. */
	endPanelDrag(id: PanelId, offsetX: number, offsetY: number) {
		const target = this.dropTarget;
		this.draggingPanel = null;
		this.dropTarget = null;
		if (target && target !== 'float') {
			this.setPanelDock(id, target);
		} else {
			this.setPanelFloatPos(id, offsetX, offsetY);
		}
	}

	/** Pull any floating panel whose saved offset would land it (mostly)
	 *  off-screen back into view — e.g. a position saved on a much larger window.
	 *  Called once from initLayout when the viewport size is known. */
	clampFloatingPanels() {
		const w = window.innerWidth;
		const h = window.innerHeight;
		for (const id of PANEL_IDS) {
			const p = this.panelLayout[id];
			if (p.dock !== 'float') continue;
			// Anchors sit ~16px inside an edge; keep at least a grabbable strip of
			// the header on-screen regardless of which corner the panel anchors to.
			const nx = clamp(p.x, -(w - 160), w - 160);
			const ny = clamp(p.y, -(h - 96), h - 96);
			if (nx !== p.x || ny !== p.y) {
				p.x = nx;
				p.y = ny;
			}
		}
	}

	/** Enforce "≤1 panel per left/right edge" — defends against a hand-edited or
	 *  future-migrated layout; setPanelDock already keeps this true at runtime. */
	#normalizePanelDocks() {
		for (const side of ['left', 'right'] as const) {
			let taken = false;
			for (const id of PANEL_PRIORITY) {
				if (this.panelLayout[id].dock !== side) continue;
				if (taken) this.panelLayout[id].dock = 'float';
				else taken = true;
			}
		}
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

	// User preferences (persisted to localStorage, see loadPrefs/#persistPrefs).
	// These are device/session settings rather than document data, so they live
	// apart from the .oto score and survive a page reload.
	#metronomeOn = $state(false);
	#metronomeSound = $state<MetronomeSound>('click');
	#metronomeVolume = $state(1);
	#loopEnabled = $state(false);
	#countInOn = $state(false);
	#playbackSpeedOn = $state(false);
	#playbackSpeed = $state(1);
	#pageView = $state(false);

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
	get playbackSpeedOn(): boolean {
		return this.#playbackSpeedOn;
	}
	set playbackSpeedOn(v: boolean) {
		this.#playbackSpeedOn = v;
		this.#persistPrefs();
	}
	/** Playback speed multiplier (0.5..1.5) applied only while speed is on. */
	get playbackSpeed(): number {
		return this.#playbackSpeed;
	}
	set playbackSpeed(v: number) {
		this.#playbackSpeed = clamp(v, 0.5, 1.5);
		this.#persistPrefs();
	}
	/** The speed the engine should actually play at (1 while speed is off). */
	get effectivePlaybackSpeed(): number {
		return this.#playbackSpeedOn ? this.#playbackSpeed : 1;
	}
	/** Page view: lay the score out as A4 pages (with page breaks and numbered
	 *  footers) instead of one continuous sheet. Also what PDF export prints. */
	get pageView(): boolean {
		return this.#pageView;
	}
	set pageView(v: boolean) {
		this.#pageView = v;
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

	// History — JSON string snapshots of the score (see #adoptBaseline).
	#undoStack = $state<string[]>([]);
	#redoStack = $state<string[]>([]);
	// The "baseline": a JSON snapshot of the last settled score — the state a
	// fresh edit reverts to. Kept current during idle (see #settle) so commit()
	// can push it to the undo stack for free instead of walking the reactive
	// proxy on every keystroke. `#baselineFor` is the score object it was taken
	// from; when `score` is reassigned (load/undo/redo) the reference changes and
	// the baseline is lazily recomputed. `#baselineStale` forces a recompute when
	// a non-undoable direct mutation (a mixer setter) changed the score in place.
	#baseline = '';
	#baselineFor: OtoScore | null = null;
	#baselineStale = false;
	/** True while an undo entry is open and further edits may coalesce into it. */
	#burstOpen = false;
	/** Coalesce key of the open entry; only a same-key edit joins it (see commit). */
	#burstKey: string | null = null;
	#settleTimer: ReturnType<typeof setTimeout> | null = null;
	/** Cancels an in-flight idle-sliced baseline walk (see #settleIdle). */
	#sliceCancel: (() => void) | null = null;
	/** Bumped on every score mutation (commit, live, mixer setters, undo/redo).
	 *  The sliced walk and the autosave's baseline reuse validate against it, so
	 *  neither can ever hold state from before an interleaved edit. */
	#snapEpoch = 0;
	/** Epoch at which #baseline was computed. While it matches #snapEpoch the
	 *  baseline string IS the current score — the autosave writes it directly
	 *  instead of paying its own whole-score snapshot walk. */
	#settledEpoch = -1;
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
		this.#scheduleSettle();
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
			if (typeof p.playbackSpeedOn === 'boolean') this.#playbackSpeedOn = p.playbackSpeedOn;
			if (typeof p.playbackSpeed === 'number')
				this.#playbackSpeed = clamp(p.playbackSpeed, 0.5, 1.5);
			if (p.panelLayout) {
				for (const id of PANEL_IDS) {
					const s = p.panelLayout[id];
					if (!s) continue;
					if (s.dock && PANEL_ALLOWED[id].includes(s.dock)) this.panelLayout[id].dock = s.dock;
					if (typeof s.x === 'number') this.panelLayout[id].x = s.x;
					if (typeof s.y === 'number') this.panelLayout[id].y = s.y;
				}
				this.#normalizePanelDocks();
			}
			if (typeof p.bottomSplitSwap === 'boolean') this.bottomSplitSwap = p.bottomSplitSwap;
			if (typeof p.pageView === 'boolean') this.#pageView = p.pageView;
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
				countInOn: this.#countInOn,
				playbackSpeedOn: this.#playbackSpeedOn,
				playbackSpeed: this.#playbackSpeed,
				panelLayout: $state.snapshot(this.panelLayout),
				bottomSplitSwap: this.bottomSplitSwap,
				pageView: this.#pageView
			};
			localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
		} catch {
			/* quota / private mode */
		}
	}

	// Autosave is debounced: serializing the whole score is O(score) main-thread
	// work, and persist() fires from continuous gestures (a fader drag calls it
	// per pointer tick) and from every edit — doing it synchronously each time
	// is jank exactly when smoothness matters most (e.g. mixing while a piece
	// plays). One trailing write per burst is enough; flushPersist() runs on
	// pagehide/hidden so nothing is lost when the tab goes away. The window is
	// deliberately generous — a large score costs real time to serialize + write,
	// so during a rapid edit or drag burst we'd rather coalesce many writes into
	// one than write every ~300ms.
	#persistTimer: ReturnType<typeof setTimeout> | null = null;
	/** Times a due autosave has been re-debounced waiting for the settle to
	 *  finish its walk (see #writeScore) — bounded so autosave can't starve. */
	#persistDeferrals = 0;

	persist() {
		if (!AUTOSAVE || typeof localStorage === 'undefined') return;
		if (this.#persistTimer) return;
		this.#persistTimer = setTimeout(() => {
			this.#persistTimer = null;
			this.#writeScore();
		}, 800);
	}

	/** Write any pending autosave immediately (page is being hidden/unloaded). */
	flushPersist() {
		if (!this.#persistTimer) return;
		clearTimeout(this.#persistTimer);
		this.#persistTimer = null;
		this.#writeScore(true);
	}

	#writeScore(force = false) {
		// When the settle that refreshed the undo baseline already serialized the
		// score (and nothing has mutated since — same #snapEpoch), the baseline
		// string IS the current score: write it directly, zero extra work. (Its
		// `updatedAt` is whatever the last real save stamped — the autosave is a
		// crash-recovery blob, not an export, so that's fine.)
		const fresh = this.#baseline !== '' && this.#settledEpoch === this.#snapEpoch;
		// A settle is still walking the score — wait for it instead of paying a
		// second whole-score walk here (it flushes the autosave itself on
		// completion, see #adoptBaseline). Bounded so a marathon of nonstop edits
		// can't starve the autosave forever.
		if (
			!force &&
			!fresh &&
			(this.#settleTimer !== null || this.#sliceCancel !== null) &&
			this.#persistDeferrals < 3
		) {
			this.#persistDeferrals++;
			this.persist();
			return;
		}
		this.#persistDeferrals = 0;
		try {
			// Fallback: snapshot the reactive proxy to a plain object first, then
			// serialize compactly — stringifying the deep proxy directly pays a
			// signal-materialising trap on every property, and the blob is never
			// read by a human so it doesn't need indentation.
			const blob = fresh
				? this.#baseline
				: serializeCompact($state.snapshot(this.score) as OtoScore);
			localStorage.setItem(STORAGE_KEY, blob);
		} catch {
			/* quota / private mode */
		}
	}

	/** Open an undoable edit, run a mutation and persist. The pre-edit snapshot
	 *  used for undo is the already-computed baseline (free); the fresh baseline
	 *  for the *next* edit is deferred to an idle #settle so a keystroke never
	 *  blocks on the whole-score proxy walk.
	 *
	 *  Pass `coalesceKey` for a rapid, continuous action (note entry) so a run of
	 *  such edits collapses into a single undo entry and only settles once it
	 *  stops. Omit it for a discrete command (add/remove section, toggle, …) so it
	 *  gets its own undo entry — a following different command never merges in. */
	commit(mutate: () => void, coalesceKey?: string) {
		this.#beginEdit(coalesceKey);
		mutate();
		this.#snapEpoch++;
		this.#scoreVersion++;
		this.persist();
		this.#scheduleSettle();
	}

	/** Mutate and persist without opening a new undo entry — for use inside a
	 *  gesture (see beginGesture) where the entry was already opened up front. */
	commitLive(mutate: () => void) {
		mutate();
		this.#snapEpoch++;
		this.#scoreVersion++;
		this.persist();
	}

	// Open an undo entry. A rapid same-key edit joins the open entry (coalesces)
	// and returns immediately. Otherwise a new entry is opened: #settle() first
	// makes the baseline reflect the current (pre-edit) score — a no-op on the hot
	// path where the last idle settle already did it, so no proxy walk happens on
	// the keystroke — then the baseline is pushed as this entry's undo target.
	#beginEdit(coalesceKey?: string) {
		if (this.#burstOpen && coalesceKey != null && coalesceKey === this.#burstKey) return;
		this.#settle();
		this.#undoStack.push(this.#baseline);
		if (this.#undoStack.length > 100) this.#undoStack.shift();
		this.#redoStack = [];
		this.#burstOpen = true;
		this.#burstKey = coalesceKey ?? null;
	}

	#needsBaselineRefresh(): boolean {
		return (
			this.#burstOpen ||
			this.#baselineStale ||
			this.#baselineFor !== this.score ||
			this.#baseline === ''
		);
	}

	/** Record `snap` (a plain snapshot of the current score) as the settled
	 *  baseline, and keep the plain object so the autosave can reuse the walk.
	 *  History entries are JSON strings — undo/redo JSON.parse them back to a
	 *  fresh, mutable object (re-proxied on assignment to `score`). A
	 *  structuredClone would be nicer, but the snapshot carries state Svelte
	 *  can't structured-clone in the browser; the JSON round-trip is the safe
	 *  path, and it's what the autosave uses too. */
	#adoptBaseline(snap: OtoScore) {
		this.#baseline = JSON.stringify(snap);
		this.#baselineFor = this.score;
		this.#baselineStale = false;
		this.#settledEpoch = this.#snapEpoch;
		// A pending autosave no longer needs its own snapshot walk — the string
		// just computed IS the current score. Flush it now.
		if (this.#persistTimer) {
			clearTimeout(this.#persistTimer);
			this.#persistTimer = null;
			this.#persistDeferrals = 0;
			try {
				if (AUTOSAVE && typeof localStorage !== 'undefined')
					localStorage.setItem(STORAGE_KEY, this.#baseline);
			} catch {
				/* quota / private mode */
			}
		}
	}

	#cancelSettleWork() {
		if (this.#settleTimer) {
			clearTimeout(this.#settleTimer);
			this.#settleTimer = null;
		}
		if (this.#sliceCancel) {
			this.#sliceCancel();
			this.#sliceCancel = null;
		}
	}

	// Refresh the baseline to the current score and close the burst, synchronously.
	// This is the expensive whole-score proxy walk — only forced when the fresh
	// state is needed *right now* (opening a new undo entry, undo/redo). On the
	// hot path the idle settle below has usually already run, so this no-ops.
	#settle() {
		this.#cancelSettleWork();
		if (this.#needsBaselineRefresh()) {
			this.#adoptBaseline($state.snapshot(this.score) as OtoScore);
		}
		this.#burstOpen = false;
		this.#burstKey = null;
	}

	#scheduleSettle() {
		this.#cancelSettleWork();
		this.#settleTimer = setTimeout(() => {
			this.#settleTimer = null;
			this.#settleIdle();
		}, HISTORY_SETTLE_MS);
	}

	// Idle-sliced baseline refresh. Snapshotting a big score's reactive proxy in
	// one go blocks the main thread for hundreds of ms, and (being deferred) that
	// block lands *between* keystrokes — exactly where the next keypress queues
	// behind it. Instead the walk streams measure-by-measure in idle slices; any
	// interleaved mutation bumps #snapEpoch which aborts the walk (the mutation's
	// own #scheduleSettle restarts it), so a half-walked snapshot can never be
	// adopted.
	#settleIdle() {
		if (!this.#needsBaselineRefresh()) {
			this.#burstOpen = false;
			this.#burstKey = null;
			return;
		}
		const epoch = this.#snapEpoch;
		const score = this.score;
		// Scalar fields + track shells snapshotted up front (cheap); the measure
		// lists — the bulk of a big score — stream into the shells below.
		const shell = $state.snapshot({
			...score,
			tracks: score.tracks.map((t) => ({ ...t, measures: [] as OtoMeasure[] }))
		}) as OtoScore;
		let ti = 0;
		let mi = 0;
		const step = (deadline?: IdleDeadline) => {
			this.#sliceCancel = null;
			if (epoch !== this.#snapEpoch || score !== this.score) return; // aborted by an edit
			const until = performance.now() + 12;
			while (ti < score.tracks.length) {
				const measures = score.tracks[ti].measures;
				while (mi < measures.length) {
					const outOfBudget =
						deadline && !deadline.didTimeout
							? deadline.timeRemaining() < 2
							: performance.now() >= until;
					if (outOfBudget) {
						this.#sliceCancel = scheduleIdle(step);
						return;
					}
					shell.tracks[ti].measures.push($state.snapshot(measures[mi]) as OtoMeasure);
					mi++;
				}
				ti++;
				mi = 0;
			}
			this.#adoptBaseline(shell);
			this.#burstOpen = false;
			this.#burstKey = null;
		};
		this.#sliceCancel = scheduleIdle(step);
	}

	/** Mark the baseline stale after a direct, non-undoable mutation (mixer
	 *  setters) so the next undo entry captures that change instead of reverting
	 *  past it, and refresh it during idle. Skipped mid-gesture — endGesture
	 *  schedules the refresh once the drag ends. */
	#dirtyBaseline() {
		this.#snapEpoch++;
		this.#baselineStale = true;
		if (!this.#gestureActive) this.#scheduleSettle();
	}

	/**
	 * Begin a continuous mixer gesture (a fader/knob drag). We open one undo entry
	 * on drag-start, then let the live setters mutate freely; endGesture() closes
	 * it. This makes volume/pan/EQ undoable without flooding the history with one
	 * entry per pointer tick. Safe to call repeatedly — only the first call in a
	 * gesture opens the entry.
	 */
	beginGesture() {
		if (this.#gestureActive) return;
		this.#gestureActive = true;
		this.#beginEdit(); // opens a fresh entry (no key), finalizing any prior burst
	}

	endGesture() {
		this.#gestureActive = false;
		// The drag changed the score in place under the open entry; close the
		// burst and mark the baseline stale so the next edit starts a fresh entry
		// (and its baseline includes this drag). The refresh is deferred to idle.
		this.#burstOpen = false;
		this.#baselineStale = true;
		this.#scheduleSettle();
	}

	undo() {
		this.#settle(); // ensure the baseline reflects the current state for redo
		const prev = this.#undoStack.pop();
		if (prev === undefined) return;
		this.#redoStack.push(this.#baseline);
		this.score = JSON.parse(prev);
		this.#baseline = prev;
		this.#baselineFor = this.score;
		this.#baselineStale = false;
		this.#burstOpen = false;
		this.#snapEpoch++;
		this.#settledEpoch = this.#snapEpoch; // the restored string IS the new state
		this.clampCursor();
		this.#scoreVersion++;
		this.persist();
	}

	redo() {
		this.#settle();
		const next = this.#redoStack.pop();
		if (next === undefined) return;
		this.#undoStack.push(this.#baseline);
		this.score = JSON.parse(next);
		this.#baseline = next;
		this.#baselineFor = this.score;
		this.#baselineStale = false;
		this.#burstOpen = false;
		this.#snapEpoch++;
		this.#settledEpoch = this.#snapEpoch; // the restored string IS the new state
		this.clampCursor();
		this.#scoreVersion++;
		this.persist();
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
		this.#undoStack = [];
		this.#redoStack = [];
		// The document was replaced wholesale — drop the settled baseline (and any
		// in-flight walk) so nothing from the closed score can be pushed for undo
		// or written to the autosave.
		this.#cancelSettleWork();
		this.#snapEpoch++;
		this.#baseline = '';
		this.#baselineFor = null;
		this.#baselineStale = false;
		this.#burstOpen = false;
		this.#burstKey = null;
		this.#scheduleSettle();
		// Drop any autosave still waiting in the debounce window — it belongs to
		// the score being closed and would otherwise re-write the key just removed.
		if (this.#persistTimer) {
			clearTimeout(this.#persistTimer);
			this.#persistTimer = null;
		}
		if (typeof localStorage !== 'undefined') {
			try {
				localStorage.removeItem(STORAGE_KEY);
			} catch {
				/* ignore */
			}
		}
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
		this.#dirtyBaseline();
		this.persist();
	}
	setPan(index: number, p: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		t.pan = clamp(p, -1, 1);
		this.#dirtyBaseline();
		this.persist();
	}
	setEqBand(index: number, band: 'low' | 'mid' | 'high', db: number) {
		const t = this.score.tracks[index];
		if (!t) return;
		t.eq = { ...t.eq, [band]: clamp(db, -12, 12) };
		this.#dirtyBaseline();
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
		this.#dirtyBaseline();
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
		this.#dirtyBaseline();
		this.persist();
	}
	setAudioVolume(v: number) {
		if (!this.score.audio) return;
		this.score.audio.volume = clamp(v, 0, 1);
		this.#dirtyBaseline();
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
