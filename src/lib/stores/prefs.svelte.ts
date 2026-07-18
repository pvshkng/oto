// Persisted user preferences — device/session settings rather than document
// data, so they live apart from the .oto score (in localStorage) and survive a
// page reload. Every setter persists immediately; loading tolerates missing or
// malformed values by keeping defaults. Panel placement is part of the same
// prefs blob but is owned by PanelController — this module only serializes it.

import type { MetronomeSound } from '$lib/audio/engine';
import type { SoundFontQuality } from '$lib/audio/soundfont';
import type { PanelController, PanelId, PanelLayout } from './panels.svelte';

const PREFS_KEY = 'oto.prefs';

const METRONOME_SOUNDS: MetronomeSound[] = ['click', 'beep', 'wood', 'bell'];

/** Discrete score-zoom steps (1 = 100%). Ctrl+wheel / Ctrl+± walk this ladder
 *  so repeated zooms land on round sizes instead of drifting continuously. */
const ZOOM_LEVELS = [0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.5, 1.75, 2];
export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

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
	soundFontQuality?: SoundFontQuality;
	scoreZoom?: number;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

export class PrefsController {
	#metronomeOn = $state(false);
	#metronomeSound = $state<MetronomeSound>('click');
	#metronomeVolume = $state(1);
	#loopEnabled = $state(false);
	#countInOn = $state(false);
	#playbackSpeedOn = $state(false);
	#playbackSpeed = $state(1);
	#pageView = $state(false);
	#soundFontQuality = $state<SoundFontQuality>('standard');
	#scoreZoom = $state(1);

	#panels: PanelController;

	constructor(panels: PanelController) {
		this.#panels = panels;
	}

	get metronomeOn(): boolean {
		return this.#metronomeOn;
	}
	set metronomeOn(v: boolean) {
		this.#metronomeOn = v;
		this.persist();
	}
	get metronomeSound(): MetronomeSound {
		return this.#metronomeSound;
	}
	set metronomeSound(v: MetronomeSound) {
		this.#metronomeSound = v;
		this.persist();
	}
	get metronomeVolume(): number {
		return this.#metronomeVolume;
	}
	set metronomeVolume(v: number) {
		this.#metronomeVolume = clamp(v, 0, 1);
		this.persist();
	}
	get loopEnabled(): boolean {
		return this.#loopEnabled;
	}
	set loopEnabled(v: boolean) {
		this.#loopEnabled = v;
		this.persist();
	}
	get countInOn(): boolean {
		return this.#countInOn;
	}
	set countInOn(v: boolean) {
		this.#countInOn = v;
		this.persist();
	}
	get playbackSpeedOn(): boolean {
		return this.#playbackSpeedOn;
	}
	set playbackSpeedOn(v: boolean) {
		this.#playbackSpeedOn = v;
		this.persist();
	}
	/** Playback speed multiplier (0.5..1.5) applied only while speed is on. */
	get playbackSpeed(): number {
		return this.#playbackSpeed;
	}
	set playbackSpeed(v: number) {
		this.#playbackSpeed = clamp(v, 0.5, 1.5);
		this.persist();
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
		this.persist();
	}
	/** Soundfont quality: standard (SF3) or high (SF2). The engine applies a
	 *  change via audio.switchSoundFont(), see SettingsModal. */
	get soundFontQuality(): SoundFontQuality {
		return this.#soundFontQuality;
	}
	set soundFontQuality(v: SoundFontQuality) {
		this.#soundFontQuality = v;
		this.persist();
	}
	/** Score-view zoom factor (0.5..2). Applied as CSS zoom on the score paper
	 *  only — the surrounding panels and chrome keep their UI scale. */
	get scoreZoom(): number {
		return this.#scoreZoom;
	}
	set scoreZoom(v: number) {
		this.#scoreZoom = clamp(v, MIN_ZOOM, MAX_ZOOM);
		this.persist();
	}
	zoomIn() {
		this.scoreZoom = ZOOM_LEVELS.find((z) => z > this.#scoreZoom) ?? MAX_ZOOM;
	}
	zoomOut() {
		this.scoreZoom = ZOOM_LEVELS.findLast((z) => z < this.#scoreZoom) ?? MIN_ZOOM;
	}

	/** Restore persisted user preferences. Safe to call once on startup; missing
	 *  or malformed values keep their defaults. */
	load() {
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
			if (p.panelLayout) this.#panels.applyStoredLayout(p.panelLayout);
			if (typeof p.bottomSplitSwap === 'boolean') this.#panels.bottomSplitSwap = p.bottomSplitSwap;
			if (typeof p.pageView === 'boolean') this.#pageView = p.pageView;
			if (p.soundFontQuality === 'standard' || p.soundFontQuality === 'high')
				this.#soundFontQuality = p.soundFontQuality;
			if (typeof p.scoreZoom === 'number') this.#scoreZoom = clamp(p.scoreZoom, MIN_ZOOM, MAX_ZOOM);
		} catch {
			/* keep defaults */
		}
	}

	persist() {
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
				panelLayout: $state.snapshot(this.#panels.panelLayout),
				bottomSplitSwap: this.#panels.bottomSplitSwap,
				pageView: this.#pageView,
				soundFontQuality: this.#soundFontQuality,
				scoreZoom: this.#scoreZoom
			};
			localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
		} catch {
			/* quota / private mode */
		}
	}
}
