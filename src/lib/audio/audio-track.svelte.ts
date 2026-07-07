// Runtime controller for the single optional audio backing track.
//
// Split of responsibilities:
//   • The *config* (name, timeline offset, gain/mute/solo, tempo-match, pitch)
//     lives in the .oto document, owned by the score store — see store.audio.
//   • The *audio bytes* are held here for the session, and additionally cached
//     in IndexedDB (see ./audio-cache) so a reload or revisit auto-restores
//     the file without re-importing. They're still never serialised into the
//     .oto document itself — when the cache misses (different browser, cleared
//     storage, a document referencing another file), the config loads with an
//     empty slot and a "re-add the file" prompt; re-importing the matching
//     file realigns everything from the saved offset/tempo/pitch.
//
// Playback is slaved to the alphaSynth MIDI clock: the engine reports the song
// position (ms) on every tick and we chase it with the media element. The chase
// is deliberately lazy — the measured drift is smoothed (events arrive with
// jitter), corrections are applied at a low cadence with a dead-band, and
// `playbackRate` is only ever written when it meaningfully changes. Rewriting
// the rate per event re-tunes the browser's pitch-preserving time-stretcher
// each time, which is what caused audible stutter and CPU burn (worst on
// mobile). For the same reason WaveSurfer here is *render-only*: it never sees
// the playback element, so it does zero work while a piece plays. Tempo-match
// time-stretches (pitch preserved); the optional pitch shift runs through a
// small Web Audio graph.

import { store } from '$lib/stores/score.svelte';
import { toast } from 'svelte-sonner';
import type WaveSurfer from 'wavesurfer.js';
import { PitchShifter } from './pitch-shifter';
import { cacheAudioFile, clearCachedAudioFile, loadCachedAudioFile } from './audio-cache';

/** Smoothed drift (seconds) beyond which we hard-seek instead of rate-trimming.
 *  Seeks decode from the nearest frame and audibly hiccup, so they're a last
 *  resort — the rate trim below handles everything smaller. */
const HARD_RESYNC_SEC = 0.25;
/** Smoothed drift below which we leave playback completely alone. Event jitter
 *  lives inside this window; chasing it would wobble the time-stretcher. */
const DEADBAND_SEC = 0.025;
/** Max fractional rate trim used to close small drift (±8%). */
const MAX_RATE_TRIM = 0.08;
/** Apply at most one correction (rate write or seek) per this window. */
const CORRECTION_INTERVAL_MS = 250;
/** Ignore playbackRate changes smaller than this — not worth re-tuning the
 *  stretcher over. */
const MIN_RATE_DELTA = 0.004;
/** Keep at least this many song-seconds of the clip overlapping the song
 *  region, so it can never be dragged fully out of reach. */
const MIN_VISIBLE_SEC = 0.4;

class AudioTrackController {
	/** Decoded + ready to render/play. */
	ready = $state(false);
	/** Audio duration in seconds (0 until loaded). */
	duration = $state(0);
	/** True once a file has been attached this session. */
	hasFile = $state(false);
	/** Loading/decoding a freshly attached file. */
	loading = $state(false);
	/** Attempting to restore the file from the local cache (page load / doc
	 *  switch) — lets the UI show "loading saved audio" instead of the re-add
	 *  prompt while the lookup is in flight. */
	restoring = $state(false);

	private file: File | null = null;
	private objectUrl: string | null = null;
	/** File name the in-memory bytes belong to — used to notice when the open
	 *  document changes out from under us (new/open/close). */
	private loadedFileName: string | null = null;
	private mediaEl: HTMLAudioElement | null = null;
	private ws: WaveSurfer | null = null;
	private container: HTMLElement | null = null;

	// Pitch-shift Web Audio graph (created lazily on first non-zero pitch).
	private audioCtx: AudioContext | null = null;
	private sourceNode: MediaElementAudioSourceNode | null = null;
	private shifter: PitchShifter | null = null;
	private pitchActive = false;

	// Sync state (plain fields — the hot path must never touch reactive $state).
	private songPlaying = false;
	/** Exponentially smoothed drift between the media clock and the song clock. */
	private errEma = 0;
	/** Last playbackRate actually written to the element. */
	private appliedRate = 1;
	/** performance.now() of the last correction, for the cadence throttle. */
	private lastCorrectionAt = 0;
	/** Set by onSongStart: the element was started inside the user gesture (to
	 *  unlock mobile autoplay) at volume 0; the first sync seeks it into place
	 *  and restores the real gain. */
	private awaitingFirstSync = false;

	/** Config exists in the document but its file hasn't been re-imported yet. */
	get needsFile(): boolean {
		return store.hasAudio && !this.hasFile;
	}

	/** Time-stretch factor to map audio seconds onto song seconds (1 = none). */
	get stretch(): number {
		const a = store.audio;
		if (!a || !a.matchTempo || !a.sourceTempo) return 1;
		return store.score.tempo / a.sourceTempo;
	}

	/** Song-seconds one measure spans, at the global tempo/time-signature. Used
	 *  by the UI to line the waveform up with the MIDI bar grid. */
	get measureSeconds(): number {
		const [num, den] = store.score.timeSignature;
		const quarters = num * (4 / den);
		return quarters * (60 / Math.max(1, store.score.tempo));
	}

	/** Total song length in seconds (measure count × measure length). */
	get songSeconds(): number {
		const measures = Math.max(1, ...store.score.tracks.map((t) => t.measures.length));
		return measures * this.measureSeconds;
	}

	/** Song-seconds the clip occupies once stretched. */
	get clipSeconds(): number {
		return this.stretch > 0 ? this.duration / this.stretch : this.duration;
	}

	// ---- file lifecycle ----------------------------------------------------

	/** Import an audio file, (re)using any saved config that matches its name.
	 *  `fromCache` marks an automatic restore from the local cache — it skips
	 *  re-writing the cache with the bytes that just came out of it. */
	async attachFile(file: File, opts: { fromCache?: boolean } = {}): Promise<void> {
		if (
			!file.type.startsWith('audio/') &&
			!/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(file.name)
		) {
			toast.error('That doesn’t look like an audio file.');
			return;
		}
		this.loading = true;
		this.ready = false;
		this.revokeUrl();
		this.file = file;
		this.peaks = null; // stale waveform data from a previous file
		this.objectUrl = URL.createObjectURL(file);
		this.loadedFileName = file.name;
		this.hasFile = true;
		// Create the config, or keep a matching one untouched. Skipping the
		// commit when the file name already matches keeps saved alignment AND
		// keeps automatic restores out of the undo history.
		if (store.audio?.fileName !== file.name) store.addAudioTrack(file.name);
		// Remember the bytes locally so the next page load restores them without
		// a manual re-import (fire-and-forget; failure just means re-import).
		if (!opts.fromCache) void cacheAudioFile(file);
		// The cache now (potentially) holds this file — allow future restores
		// for it even if an earlier lookup missed.
		this.restoreAttemptedFor = null;
		this.ensureMediaEl();
		const el = this.mediaEl!;
		el.src = this.objectUrl;
		// Playback readiness comes from the element itself, NOT the waveform:
		// a cache-restored file must be playable even if the tracks panel (and
		// therefore WaveSurfer) is never opened this session — e.g. on mobile,
		// where the panel is closed by default. WaveSurfer's decode later
		// refines the duration when/if the waveform mounts.
		el.addEventListener(
			'loadedmetadata',
			() => {
				if (this.mediaEl !== el) return; // torn down while loading
				if (isFinite(el.duration)) this.duration = el.duration;
				this.ready = true;
				this.applyGain();
				// Deliberately NOT applyPitch() here: a cache restore runs without a
				// user gesture, and creating the pitch graph's AudioContext then
				// would leave it suspended (browser autoplay policy) with the audio
				// routed through it — i.e. silent. onSongStart applies pitch from
				// within the Play gesture instead.
			},
			{ once: true }
		);
		if (this.container) await this.mount(this.container);
		else this.loading = false;
	}

	/** File name of the last cache restore attempt. One attempt per name is
	 *  enough — a miss can't succeed on retry until a manual import refills the
	 *  cache (attachFile clears this), so retrying would just hammer IndexedDB. */
	private restoreAttemptedFor: string | null = null;

	/** Try to reattach the file from the local cache when the open document's
	 *  audio config names it. Called on page load and whenever the document
	 *  changes (see reconcile). Silent on miss — the re-add prompt handles it. */
	async restoreFromCache(): Promise<void> {
		if (this.hasFile || this.restoring) return;
		const wanted = store.audio?.fileName;
		if (!wanted || this.restoreAttemptedFor === wanted) return;
		this.restoreAttemptedFor = wanted;
		this.restoring = true;
		try {
			const file = await loadCachedAudioFile();
			// Re-check the world after the async gap: the user may have imported a
			// file or switched documents while the cache read was in flight.
			if (file && file.name === wanted && !this.hasFile && store.audio?.fileName === wanted) {
				await this.attachFile(file, { fromCache: true });
			}
		} finally {
			this.restoring = false;
		}
	}

	/** Open the OS file picker and attach the chosen audio file. */
	promptImport() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus';
		input.onchange = () => {
			const file = input.files?.[0];
			if (file) void this.attachFile(file);
		};
		input.click();
	}

	private ensureMediaEl() {
		if (this.mediaEl) return;
		const el = new Audio();
		el.preload = 'auto';
		// Tempo-match / drift trims change playbackRate; keep the pitch fixed so
		// only the pitch-shift tool ever repitches the audio.
		el.preservesPitch = true;
		this.mediaEl = el;
	}

	private revokeUrl() {
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}
	}

	// ---- waveform decode + mount ---------------------------------------------

	/** Waveform channel data, decoded once per file and cached across panel
	 *  open/close (WaveSurfer would otherwise re-decode on every mount). */
	private peaks: Float32Array[] | null = null;

	/** Decode the file's channel data with an OfflineAudioContext. Offline
	 *  contexts aren't subject to the browser's autoplay policy, so this works
	 *  without a user gesture and never triggers the "AudioContext was
	 *  prevented from starting" console warning (which WaveSurfer's own decoder
	 *  — a temporary regular AudioContext — does). 8 kHz matches WaveSurfer's
	 *  default decode rate; plenty for bar-level rendering, light on memory. */
	private async decodePeaks(): Promise<void> {
		if (this.peaks || !this.file) return;
		try {
			const buf = await this.file.arrayBuffer();
			const ctx = new OfflineAudioContext(1, 1, 8000);
			const decoded = await ctx.decodeAudioData(buf);
			if (!this.file) return; // torn down while decoding
			this.peaks = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
				decoded.getChannelData(i)
			);
			this.duration = decoded.duration;
		} catch {
			// Leave peaks null — WaveSurfer decodes as a fallback below.
		}
	}

	/** Mount (or re-mount) the waveform into `el`. Safe to call when the panel
	 *  re-renders; keeps the file and config. No-op without an attached file. */
	async mount(el: HTMLElement): Promise<void> {
		this.container = el;
		if (!this.file || !this.objectUrl) return;
		this.ensureMediaEl();
		const [{ default: WS }] = await Promise.all([import('wavesurfer.js'), this.decodePeaks()]);
		// The container may have unmounted (or a newer mount started) while the
		// decode was in flight.
		if (this.container !== el || !this.file) return;
		// Tear down a previous instance bound to a stale container.
		this.ws?.destroy();
		// Render-only: the playback element is deliberately NOT handed to
		// WaveSurfer. If it were, WaveSurfer would re-render its progress overlay
		// and cursor on every timeupdate while the song plays — per-frame canvas
		// and style work underneath the panel's backdrop-blur layers, one of the
		// main sources of playback jank. This instance just paints a static
		// waveform from the pre-decoded peaks.
		this.ws = WS.create({
			container: el,
			url: this.objectUrl,
			// Pre-decoded data → WaveSurfer skips its own decode entirely.
			peaks: this.peaks ?? undefined,
			duration: this.peaks ? this.duration : undefined,
			// Fill the clip container so the waveform never exceeds the track row's
			// height (the row height is driven by the controls column, as with MIDI
			// tracks) — no fixed pixel height, no internal scrolling.
			height: 'auto',
			waveColor: 'rgba(120,120,140,0.55)',
			cursorWidth: 0,
			fillParent: true,
			interact: false,
			dragToSeek: false,
			autoScroll: false,
			hideScrollbar: true,
			normalize: true,
			barWidth: 2,
			barGap: 1,
			barRadius: 1
		});
		this.ws.on('ready', (dur: number) => {
			this.duration = dur;
			this.ready = true;
			this.loading = false;
			// No applyPitch() here — mount can happen without a user gesture (see
			// the loadedmetadata note in attachFile); onSongStart handles it.
			this.applyGain();
		});
		this.ws.on('error', () => {
			this.loading = false;
			toast.error('Couldn’t decode that audio file.');
		});
	}

	/** Detach the waveform (panel closed) but keep the file for a later re-mount. */
	unmount() {
		this.ws?.destroy();
		this.ws = null;
		this.container = null;
	}

	/** Drop the in-memory audio bytes, waveform and pitch graph (leaves the
	 *  document config untouched). A media element can only ever have one
	 *  MediaElementAudioSourceNode, so the element is discarded here too — the
	 *  next imported file gets a fresh element + graph. Shared by remove() and
	 *  reconcile(). */
	private teardownBytes() {
		this.stop();
		this.ws?.destroy();
		this.ws = null;
		this.container = null;
		this.revokeUrl();
		this.shifter?.dispose();
		this.shifter = null;
		this.sourceNode?.disconnect();
		this.sourceNode = null;
		this.pitchActive = false;
		if (this.mediaEl) {
			this.mediaEl.pause();
			this.mediaEl.removeAttribute('src');
			this.mediaEl.load();
			this.mediaEl = null;
		}
		this.file = null;
		this.loadedFileName = null;
		this.peaks = null;
		this.hasFile = false;
		this.ready = false;
		this.duration = 0;
		// A fresh element starts at rate 1 — keep the mirror in step.
		this.appliedRate = 1;
	}

	/** Remove the audio track entirely — bytes, waveform, config, pitch graph
	 *  and the local byte cache (an explicit removal shouldn't resurrect on the
	 *  next reload). */
	remove() {
		this.teardownBytes();
		void clearCachedAudioFile();
		store.removeAudioTrack();
	}

	/** Reconcile the loaded audio with the open document whenever the document
	 *  changes (page load / New / Open / Close). Drops bytes the new document
	 *  doesn't reference, then tries the local cache for the file it *does*
	 *  reference — so a reload or reopening a saved .oto auto-restores the
	 *  audio without a manual re-import. Never touches the config; on a cache
	 *  miss the re-add prompt shows as before. */
	reconcile() {
		if (this.hasFile) {
			if (store.audio?.fileName === this.loadedFileName) return;
			this.teardownBytes();
		}
		if (store.hasAudio) void this.restoreFromCache();
	}

	// ---- pitch graph -------------------------------------------------------

	private ensurePitchGraph() {
		if (this.shifter || !this.mediaEl) return;
		try {
			const Ctx =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			this.audioCtx ??= new Ctx();
			this.sourceNode = this.audioCtx.createMediaElementSource(this.mediaEl);
			this.shifter = new PitchShifter(this.audioCtx);
			// input → shifter → destination. Bypassed (direct) until pitch ≠ 0.
			this.sourceNode.connect(this.audioCtx.destination);
		} catch {
			this.shifter = null;
		}
	}

	/** Route through / around the pitch shifter for the current semitone setting. */
	applyPitch() {
		const semis = store.audio?.pitchSemitones ?? 0;
		if (semis === 0 && !this.pitchActive) return; // stay on the clean direct path
		this.ensurePitchGraph();
		if (!this.shifter || !this.sourceNode || !this.audioCtx) return;
		void this.audioCtx.resume();
		this.sourceNode.disconnect();
		if (semis === 0) {
			this.sourceNode.connect(this.audioCtx.destination);
			this.pitchActive = false;
		} else {
			this.sourceNode.connect(this.shifter.input);
			this.shifter.output.connect(this.audioCtx.destination);
			this.shifter.setPitchOffset(semis);
			this.pitchActive = true;
		}
	}

	// ---- gain / mute / solo ------------------------------------------------

	/** Effective 0..1 gain given mute and the global (MIDI + audio) solo state. */
	private effectiveGain(): number {
		const a = store.audio;
		if (!a) return 0;
		if (a.muted) return 0;
		const anySolo = a.soloed || store.score.tracks.some((t) => t.soloed);
		if (anySolo && !a.soloed) return 0;
		return a.volume;
	}

	/** Push the effective gain to the media element. Call after any mute/solo/
	 *  volume change (audio or MIDI track). */
	applyGain() {
		if (this.mediaEl) this.mediaEl.volume = this.effectiveGain();
	}

	// ---- positioning --------------------------------------------------------

	/** Clamp a proposed offset so at least a grabbable strip of the clip stays
	 *  within the song region (never fully off either side). */
	clampOffset(sec: number): number {
		const clip = this.clipSeconds || 1;
		const min = -(clip - MIN_VISIBLE_SEC);
		const max = this.songSeconds - MIN_VISIBLE_SEC;
		return Math.max(min, Math.min(max, sec));
	}

	/** Nudge the clip along the song timeline by `deltaSec` (mobile carets). One
	 *  undo step per nudge. */
	nudge(deltaSec: number) {
		if (!store.audio) return;
		store.beginGesture();
		store.setAudioOffset(this.clampOffset(store.audio.offsetSec + deltaSec));
		store.endGesture();
	}

	// ---- sync to the song clock --------------------------------------------

	/** Called when the song starts playing. Runs synchronously inside the Play
	 *  press (before the engine's first await), i.e. within the user gesture —
	 *  starting the element here, at volume 0, unlocks it so every later
	 *  programmatic play()/pause() from the worker's position events is allowed
	 *  on mobile. The first sync callback seeks it into place and restores gain. */
	onSongStart() {
		this.songPlaying = true;
		this.errEma = 0;
		this.lastCorrectionAt = 0;
		// Apply any saved pitch now — we're inside the Play gesture, so the
		// graph's AudioContext may be created/resumed here (it can't be at
		// restore time, where the browser would keep it suspended → silence).
		this.applyPitch();
		const el = this.mediaEl;
		if (el && this.ready) {
			el.volume = 0;
			this.awaitingFirstSync = true;
			void el.play().catch(() => {});
		}
	}

	/** Called when the song pauses or stops. */
	onSongStop() {
		this.songPlaying = false;
		this.awaitingFirstSync = false;
		this.mediaEl?.pause();
	}

	/**
	 * Chase the song clock. `songMs` is the alphaSynth position (song ms at the
	 * nominal tempo). Called from every position event, but designed to be
	 * near-free per call: a couple of float ops to update the drift estimate,
	 * with DOM writes (rate/seek/volume) gated behind the dead-band and the
	 * correction cadence so the time-stretcher is never thrashed.
	 */
	syncToSong(songMs: number) {
		const el = this.mediaEl;
		const a = store.audio;
		if (!el || !a || !this.ready || !this.songPlaying) return;

		const stretch = this.stretch;
		const target = (songMs / 1000) * stretch - a.offsetSec;

		// Outside the clip's own content → nothing to sound; hold it paused.
		if (target < 0 || target > this.duration) {
			if (!el.paused) el.pause();
			this.errEma = 0;
			return;
		}

		const baseRate = stretch * store.effectivePlaybackSpeed;

		// First event after Play (element was gesture-unlocked at volume 0), or
		// (re)entering the clip region mid-song: land exactly on target and go.
		if (el.paused || this.awaitingFirstSync) {
			el.currentTime = target;
			this.writeRate(el, baseRate);
			this.applyGain();
			this.awaitingFirstSync = false;
			this.errEma = 0;
			this.lastCorrectionAt = performance.now();
			if (el.paused) void el.play().catch(() => {});
			return;
		}

		// Smooth the measured drift — position events arrive with jitter, and
		// chasing the raw signal is what made the rate oscillate audibly.
		const err = el.currentTime - target;
		this.errEma = this.errEma * 0.7 + err * 0.3;

		const now = performance.now();
		if (now - this.lastCorrectionAt < CORRECTION_INTERVAL_MS) return;
		this.lastCorrectionAt = now;

		if (Math.abs(this.errEma) > HARD_RESYNC_SEC) {
			// Way off (e.g. after a loop wrap) — seek once and reset the estimate.
			el.currentTime = target;
			this.errEma = 0;
			this.writeRate(el, baseRate);
		} else if (Math.abs(this.errEma) > DEADBAND_SEC) {
			// Ahead → slow down a touch; behind → speed up. Proportional, capped.
			const trim = Math.max(-MAX_RATE_TRIM, Math.min(MAX_RATE_TRIM, this.errEma * 0.6));
			this.writeRate(el, baseRate * (1 - trim));
		} else {
			// In sync — make sure we're back on the plain base rate and stay quiet.
			this.writeRate(el, baseRate);
		}
	}

	/** Write playbackRate only when it meaningfully changed — every write
	 *  re-tunes the pitch-preserving stretcher, so redundant ones cost real CPU. */
	private writeRate(el: HTMLAudioElement, rate: number) {
		if (Math.abs(rate - this.appliedRate) < MIN_RATE_DELTA) return;
		this.appliedRate = rate;
		el.playbackRate = rate;
	}

	/** Full teardown (page unload). */
	stop() {
		this.songPlaying = false;
		this.awaitingFirstSync = false;
		this.mediaEl?.pause();
	}
}

export const audioTrack = new AudioTrackController();
