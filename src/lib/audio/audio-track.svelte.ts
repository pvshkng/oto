// Runtime controller for the single optional audio backing track.
//
// Split of responsibilities:
//   • The *config* (name, timeline offset, gain/mute/solo, tempo-match, pitch)
//     lives in the .oto document, owned by the score store — see store.audio.
//   • The *audio bytes* are held here, in memory only, for the current session.
//     They're never serialised, so reopening a document restores the config but
//     leaves an empty slot until the user re-imports the matching file — at
//     which point everything realigns from the saved offset/tempo/pitch.
//
// Playback is slaved to the alphaSynth MIDI clock: the engine reports the song
// position (ms) on every tick and we chase it with the media element, seeking
// on large drift and micro-nudging the playback rate on small drift so the two
// stay locked without audible warble. Tempo-match time-stretches (pitch
// preserved); the optional pitch shift runs through a small Web Audio graph.

import { store } from '$lib/stores/score.svelte';
import { toast } from 'svelte-sonner';
import type WaveSurfer from 'wavesurfer.js';
import { PitchShifter } from './pitch-shifter';

/** How far (seconds) the audio may drift from its target before we hard-seek
 *  instead of nudging the rate. */
const HARD_RESYNC_SEC = 0.12;
/** Max fractional rate trim used to close small drift (±6%). */
const MAX_RATE_TRIM = 0.06;
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

	// Sync state.
	private songPlaying = false;

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

	/** Import an audio file, (re)using any saved config that matches its name. */
	async attachFile(file: File): Promise<void> {
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
		this.objectUrl = URL.createObjectURL(file);
		this.loadedFileName = file.name;
		this.hasFile = true;
		// Create/keep the config (matching file name preserves saved alignment).
		store.addAudioTrack(file.name);
		this.ensureMediaEl();
		this.mediaEl!.src = this.objectUrl;
		if (this.container) await this.mount(this.container);
		else this.loading = false;
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
		el.crossOrigin = 'anonymous';
		this.mediaEl = el;
	}

	private revokeUrl() {
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}
	}

	// ---- waveform mount ----------------------------------------------------

	/** Mount (or re-mount) the waveform into `el`. Safe to call when the panel
	 *  re-renders; keeps the file and config. No-op without an attached file. */
	async mount(el: HTMLElement): Promise<void> {
		this.container = el;
		if (!this.file || !this.objectUrl) return;
		this.ensureMediaEl();
		const { default: WS } = await import('wavesurfer.js');
		// Tear down a previous instance bound to a stale container.
		this.ws?.destroy();
		this.ws = WS.create({
			container: el,
			media: this.mediaEl!,
			url: this.objectUrl,
			height: 48,
			waveColor: 'rgba(120,120,140,0.55)',
			progressColor: 'rgba(120,120,140,0.85)',
			cursorColor: 'var(--primary)',
			cursorWidth: 1,
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
			this.applyPitch();
			this.applyGain();
			this.mediaEl!.preservesPitch = true;
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
		this.hasFile = false;
		this.ready = false;
		this.duration = 0;
	}

	/** Remove the audio track entirely — bytes, waveform, config and pitch graph. */
	remove() {
		this.teardownBytes();
		store.removeAudioTrack();
	}

	/** Drop the loaded audio when the open document changes to one that doesn't
	 *  reference this exact file (New / Open / Close). Never touches the config —
	 *  a reopened document keeps its saved settings and just shows the re-add
	 *  prompt until the matching file is imported again. */
	reconcile() {
		if (!this.hasFile) return;
		if (store.audio?.fileName && store.audio.fileName === this.loadedFileName) return;
		this.teardownBytes();
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

	/** Called when the song starts playing. */
	onSongStart() {
		this.songPlaying = true;
		if (this.pitchActive) void this.audioCtx?.resume();
	}

	/** Called when the song pauses or stops. */
	onSongStop() {
		this.songPlaying = false;
		this.mediaEl?.pause();
	}

	/**
	 * Chase the song clock. `songMs` is the alphaSynth position (song ms at the
	 * nominal tempo). Maps it to the audio time that should be sounding now and
	 * keeps the media element locked to it.
	 */
	syncToSong(songMs: number) {
		const el = this.mediaEl;
		const a = store.audio;
		if (!el || !a || !this.ready || !this.songPlaying) return;

		const stretch = this.stretch;
		const target = (songMs / 1000) * stretch - a.offsetSec;
		this.applyGain();

		// Outside the clip's own content → nothing to sound; hold it paused.
		if (target < 0 || target > this.duration) {
			if (!el.paused) el.pause();
			return;
		}

		// speed × tempo-match feed-forward; small drift trims the rate.
		const baseRate = stretch * store.effectivePlaybackSpeed;
		if (el.paused) {
			el.currentTime = target;
			el.playbackRate = baseRate;
			void el.play().catch(() => {});
			return;
		}
		const err = el.currentTime - target;
		if (Math.abs(err) > HARD_RESYNC_SEC) {
			el.currentTime = target;
			el.playbackRate = baseRate;
		} else {
			const trim = Math.max(-MAX_RATE_TRIM, Math.min(MAX_RATE_TRIM, err * 0.5));
			el.playbackRate = baseRate * (1 - trim);
		}
	}

	/** Full teardown (page unload). */
	stop() {
		this.songPlaying = false;
		this.mediaEl?.pause();
	}
}

export const audioTrack = new AudioTrackController();
