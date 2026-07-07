// Playback engine built on alphaTab's alphaSynth.
//
// The score is compiled to a single multi-channel MIDI file (see ./midi.ts)
// and handed to alphaSynth — a SoundFont2/3 synthesizer that runs inside a
// Web Worker and feeds an AudioWorklet. Synthesis and sequencing therefore
// live entirely off the main thread: UI jank (rendering, scrolling, GC) can
// no longer starve the audio pipeline, which is what made the previous
// Tone.js engine (all main-thread scheduling + per-note synth voices) turn
// choppy and eventually fall silent on mobile with several tracks playing.
//
// Live mixing (volume/mute/solo per track, master volume, metronome level)
// goes through alphaSynth's channel APIs, so faders keep working while a
// piece plays. Pan and EQ are baked/bypassed — see the notes on syncTrack.

import { loading } from '$lib/stores/loading.svelte';
import { store } from '$lib/stores/score.svelte';
import type { OtoTrack } from '$lib/oto/types';
import type * as at from '@coderline/alphatab';
import soundFontUrl from '@coderline/alphatab/soundfont/sonivox.sf3?url';
import {
	buildMetronomePreviewMidi,
	buildPluckMidi,
	loadAlphaTab,
	METRONOME_CHANNEL,
	METRONOME_SOUNDS,
	type CompiledSong,
	type MetronomeSound
} from './midi';

export { METRONOME_SOUNDS, type MetronomeSound, type CompiledSong };

/** How the synth namespace's web-only classes look at runtime (they exist in
 *  the shipped bundle but are omitted from alphaTab's public .d.ts). */
interface SynthWebExports {
	AlphaSynthAudioWorkletOutput: new (settings: at.Settings) => at.synth.ISynthOutput;
	AlphaSynthWebWorkerApi: new (
		output: at.synth.ISynthOutput,
		settings: at.Settings
	) => at.synth.IAlphaSynth;
}

export interface PlayOptions {
	/** Tracks of the score being played — used to sync channel mute/solo/volume. */
	tracks: OtoTrack[];
	masterVolume: number;
	metronome: boolean;
	/** Metronome click level (0..1). */
	metronomeVolume: number;
	/** Play a one-bar count-in (at the start position's tempo/metre) first. */
	countIn: boolean;
	/** Playback speed multiplier (1 = normal). */
	playbackSpeed: number;
	/** Tick to start playing from. */
	startTick: number;
	/** When repeating: tick the loop wraps at. Ignored otherwise. */
	endTick: number;
	/** When repeating: tick the loop restarts from. Equal to startTick unless
	 *  the cursor was before the loop selection (then the cursor→loop-start
	 *  preamble plays once and later passes loop only the selection). */
	loopStartTick: number;
	/** Loop [loopStartTick, endTick] indefinitely. */
	repeat: boolean;
	/** Fired as the playhead reaches each beat of the primary voice. */
	onBeatMarker: (measure: number, beat: number) => void;
	/** Fired on every position change with the raw song position (ms) — used to
	 *  keep the audio backing track locked to the MIDI clock. */
	onPosition?: (currentTimeMs: number) => void;
	onStop: () => void;
}

export class AudioEngine {
	private synth: at.synth.IAlphaSynth | null = null;
	private alphaTab: typeof at | null = null;
	private initPromise: Promise<void> | null = null;
	private soundFontOk = false;
	private soundFontBytes: Uint8Array | null = null;

	private metroSound: MetronomeSound = 'click';
	private metroVolume = 1;
	private metroEnabled = false;

	/** Channel map + beat table of the currently loaded song. */
	private channels = new Map<string, number>();
	private beatTicks: CompiledSong['beatTicks'] = [];
	private lastBeatIndex = -1;
	/** Tracks passed to the current/last play() call — read by syncAllTracks
	 *  callers to resolve solo state across the whole score. */
	private currentTracks: OtoTrack[] = [];
	private onBeatMarker: ((measure: number, beat: number) => void) | null = null;
	private onPosition: ((currentTimeMs: number) => void) | null = null;
	private onStopCb: (() => void) | null = null;
	private repeat = false;
	private loopEndTick = 0;
	/** Set while the cursor→loop preamble plays; on the first wrap the
	 *  playback range is narrowed to start here (the loop selection start). */
	private pendingLoopStart: number | null = null;

	playing = false;
	/** Set when the engine failed to start (e.g. soundfont fetch failed), so
	 *  callers can surface a UX warning instead of silently producing no sound. */
	lastStartError: unknown = null;

	/**
	 * Prefetch the heavy assets — the alphaTab module and the SoundFont bytes —
	 * at app start so the first Play is (nearly) instant. Deliberately does NOT
	 * create the synth: constructing the AudioWorklet output spins up an
	 * AudioContext, and doing that before any user gesture makes the browser
	 * keep it suspended and log "An AudioContext was prevented from starting
	 * automatically". The synth itself is created by warmup()/ensureStarted()
	 * from within the first user interaction instead. Never rejects — failures
	 * are recorded (lastStartError + a status banner) and retried on the next
	 * play().
	 */
	async preload(): Promise<void> {
		if (typeof window === 'undefined') return;
		try {
			await loadAlphaTab();
			if (!this.soundFontBytes) {
				this.soundFontBytes = await fetchWithProgress(soundFontUrl);
			}
		} catch (err) {
			this.lastStartError = err;
			store.sampleWarning = "Couldn't load instrument sounds. Playback may be silent.";
		} finally {
			loading.finish();
		}
	}

	/** Boot the synth inside a user gesture (idempotent, never throws). Wired
	 *  to the first pointer/key interaction so the AudioContext starts running
	 *  before the first Play and playback is instant. */
	warmup() {
		void this.ensureStarted().catch(() => {});
	}

	private async init(): Promise<void> {
		const alphaTab = await loadAlphaTab();
		this.alphaTab = alphaTab;
		const settings = new alphaTab.Settings();
		settings.core.logLevel = alphaTab.LogLevel.Warning;
		const synthNs = alphaTab.synth as unknown as SynthWebExports;
		const output = new synthNs.AlphaSynthAudioWorkletOutput(settings);
		const synth = new synthNs.AlphaSynthWebWorkerApi(output, settings);
		this.synth = synth;

		synth.positionChanged.on((e) => {
			if (!this.playing) return;
			this.emitBeatMarker(e.currentTick);
			this.onPosition?.(e.currentTime);
		});
		synth.finished.on(() => {
			if (!this.playing) return;
			if (this.repeat) {
				// Fires on every loop wrap. After the first wrap of a
				// cursor-before-loop play, narrow the range to just the selection.
				if (this.pendingLoopStart !== null && this.synth && this.alphaTab) {
					const range = new this.alphaTab.synth.PlaybackRange();
					range.startTick = this.pendingLoopStart;
					range.endTick = this.loopEndTick;
					this.pendingLoopStart = null;
					this.synth.playbackRange = range;
					this.synth.play();
				}
				return;
			}
			this.playing = false;
			const cb = this.onStopCb;
			this.onStopCb = null;
			cb?.();
		});
	}

	/** Fetch (with progress) + hand the SoundFont to the synth. */
	private async loadSoundFont(): Promise<void> {
		const synth = this.synth;
		if (!synth || this.soundFontOk) return;
		try {
			if (!this.soundFontBytes) {
				this.soundFontBytes = await fetchWithProgress(soundFontUrl);
			}
			const loaded = new Promise<void>((resolve, reject) => {
				synth.soundFontLoaded.on(() => resolve());
				synth.soundFontLoadFailed.on((e) => reject(e));
			});
			synth.loadSoundFont(this.soundFontBytes, false);
			await loaded;
			this.soundFontOk = true;
			this.lastStartError = null;
			store.sampleWarning = null;
		} catch (err) {
			this.lastStartError = err;
			store.sampleWarning = "Couldn't load instrument sounds. Playback may be silent.";
		} finally {
			loading.finish();
		}
	}

	private async ensureStarted(): Promise<void> {
		this.initPromise ??= this.init();
		await this.initPromise;
		if (!this.soundFontOk) await this.loadSoundFont();
		if (!this.synth) throw this.lastStartError ?? new Error('audio engine failed to start');
	}

	/** Map a tick position to the latest primary-voice beat at/before it. */
	private emitBeatMarker(tick: number) {
		const beats = this.beatTicks;
		if (!beats.length || !this.onBeatMarker) return;
		let lo = 0;
		let hi = beats.length - 1;
		let idx = -1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (beats[mid].tick <= tick) {
				idx = mid;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		if (idx >= 0 && idx !== this.lastBeatIndex) {
			this.lastBeatIndex = idx;
			this.onBeatMarker(beats[idx].measure, beats[idx].beat);
		}
	}

	/** Switch the metronome's click timbre. The choice is baked into the next
	 *  compiled song; mid-playback the new sound applies from the next Play. */
	setMetronomeSound(sound: MetronomeSound) {
		this.metroSound = sound;
	}

	get metronomeSound(): MetronomeSound {
		return this.metroSound;
	}

	/** Current metronome click level (0..1), after clamping. */
	get metronomeVolume(): number {
		return this.metroVolume;
	}

	/** Set the metronome's click level (0..1). Applied live to the metronome's
	 *  MIDI channel; remembered for engine start when called before that. */
	setMetronomeVolume(v: number) {
		this.metroVolume = Math.max(0, Math.min(1, v));
		this.synth?.setChannelVolume(METRONOME_CHANNEL, this.metroVolume);
	}

	/** Turn the metronome on/off live — takes effect on the very next beat
	 *  (the clicks are always in the MIDI; their channel is muted/unmuted). */
	setMetronomeEnabled(v: boolean) {
		this.metroEnabled = v;
		this.synth?.setChannelMute(METRONOME_CHANNEL, !v);
	}

	/**
	 * Push a track's live volume/mute/solo onto its synth channel. Public so
	 * the store (via the mixer) can make a fader audible while a piece is
	 * playing. Pan is baked into the compiled MIDI (applied on the next play);
	 * per-track EQ has no equivalent in the SoundFont synth and is inactive.
	 */
	syncTrack(track: OtoTrack) {
		const synth = this.synth;
		const channel = this.channels.get(track.id);
		if (!synth || channel === undefined) return;
		synth.setChannelVolume(channel, Math.max(0, Math.min(1, track.volume ?? 1)));
		synth.setChannelMute(channel, track.muted);
		synth.setChannelSolo(channel, track.soloed);
		this.syncMetronomeSolo(this.currentTracks);
	}

	/**
	 * Re-apply every track's live volume/mute/solo. Solo semantics (soloing one
	 * track silences the others) are implemented inside the synth, so pushing
	 * each track's own flags is enough — plus keeping the metronome channel
	 * exempt from solo muting, matching the old engine's behavior.
	 */
	syncAllTracks(tracks: OtoTrack[]) {
		this.currentTracks = tracks;
		const synth = this.synth;
		if (!synth) return;
		// Soloing the audio backing track silences every MIDI voice — the synth
		// has no channel for the audio, so we enforce it here by muting them all.
		const audioSolo = store.score.audio?.soloed ?? false;
		for (const t of tracks) {
			const channel = this.channels.get(t.id);
			if (channel === undefined) continue;
			synth.setChannelVolume(channel, Math.max(0, Math.min(1, t.volume ?? 1)));
			synth.setChannelMute(channel, t.muted || audioSolo);
			synth.setChannelSolo(channel, t.soloed);
		}
		this.syncMetronomeSolo(tracks);
	}

	/** Any track solo would also silence the metronome channel — mark it solo
	 *  too while any track is soloed so clicks stay audible. */
	private syncMetronomeSolo(tracks: OtoTrack[]) {
		const anySolo = tracks.some((t) => t.soloed);
		this.synth?.setChannelSolo(METRONOME_CHANNEL, anySolo);
	}

	/** Set the master output level (0..1). */
	setMasterVolume(v: number) {
		if (this.synth) this.synth.masterVolume = Math.max(0, Math.min(1, v));
	}

	/** Set the playback speed multiplier live (0.5..1.5, 1 = normal). Applies
	 *  immediately mid-playback; also remembered by play() via PlayOptions. */
	setPlaybackSpeed(v: number) {
		if (this.synth) this.synth.playbackSpeed = Math.max(0.5, Math.min(1.5, v));
	}

	/** Play one metronome click immediately (used by the sound picker, so
	 *  picking a variant gives instant audible feedback without starting
	 *  playback). Skipped while a piece is playing — a one-time preview would
	 *  pause the song. */
	async previewMetronome() {
		if (this.playing) return;
		await this.ensureStarted();
		const midi = await buildMetronomePreviewMidi(this.metroSound);
		this.synth!.setChannelVolume(METRONOME_CHANNEL, this.metroVolume);
		this.synth!.setChannelMute(METRONOME_CHANNEL, false);
		this.synth!.playOneTimeMidiFile(midi);
	}

	/** Audition a single note immediately (used by the fretboard / note entry).
	 *  Skipped while a piece is playing for the same reason as previewMetronome. */
	async pluck(track: OtoTrack, stringIndex: number, fret: number) {
		if (this.playing) return;
		await this.ensureStarted();
		const { midi, channel } = await buildPluckMidi(track, stringIndex, fret);
		// Respect the track's fader (and mute) for the audition, like the old
		// per-track gain node did.
		this.synth!.setChannelVolume(channel, Math.max(0, Math.min(1, track.volume ?? 1)));
		this.synth!.setChannelMute(channel, track.muted);
		this.synth!.playOneTimeMidiFile(midi);
	}

	async play(compiled: CompiledSong, opts: PlayOptions) {
		await this.ensureStarted();
		if (!this.soundFontOk) {
			// One more attempt (e.g. the network came back); play silently
			// otherwise would just confuse.
			await this.loadSoundFont();
			if (!this.soundFontOk) throw this.lastStartError ?? new Error('soundfont unavailable');
		}
		this.stop();
		const synth = this.synth!;
		const alphaTab = this.alphaTab!;

		this.channels = compiled.channels;
		this.beatTicks = compiled.beatTicks;
		this.lastBeatIndex = -1;
		this.onBeatMarker = opts.onBeatMarker;
		this.onPosition = opts.onPosition ?? null;
		this.onStopCb = opts.onStop;
		this.repeat = opts.repeat;
		this.loopEndTick = opts.endTick;
		this.pendingLoopStart = null;

		// The worker processes commands in order, so the load and every setting
		// below are guaranteed to be applied before play() starts sequencing.
		synth.loadMidiFile(compiled.midi);

		this.setMasterVolume(opts.masterVolume);
		this.setPlaybackSpeed(opts.playbackSpeed);
		this.setMetronomeVolume(opts.metronomeVolume);
		this.setMetronomeEnabled(opts.metronome);
		this.syncAllTracks(opts.tracks);
		// Built-in one-bar count-in (its click timbre is alphaSynth's own).
		synth.countInVolume = opts.countIn ? this.metroVolume : 0;
		// Our clicks live on their own channel; keep the built-in metronome off.
		synth.metronomeVolume = 0;

		if (opts.repeat) {
			const range = new alphaTab.synth.PlaybackRange();
			range.startTick = opts.startTick;
			range.endTick = opts.endTick;
			if (opts.loopStartTick > opts.startTick) this.pendingLoopStart = opts.loopStartTick;
			synth.isLooping = true;
			synth.playbackRange = range; // also seeks to startTick
		} else {
			synth.isLooping = false;
			synth.playbackRange = null;
			synth.tickPosition = opts.startTick;
		}

		this.playing = true;
		synth.play();
	}

	stop() {
		this.playing = false;
		this.pendingLoopStart = null;
		this.onStopCb = null;
		const synth = this.synth;
		if (!synth) return;
		synth.stop();
		synth.isLooping = false;
		synth.playbackRange = null;
	}

	dispose() {
		this.stop();
		this.synth?.destroy();
		this.synth = null;
		this.initPromise = null;
		this.soundFontOk = false;
	}
}

/** Download a URL as bytes, driving the loading overlay's progress bar. The
 *  batch opens before the request goes out so the overlay covers the whole
 *  download, and the caller's `finally` (via loading.finish) closes it on
 *  failure. */
async function fetchWithProgress(url: string): Promise<Uint8Array> {
	const STEPS = 20;
	loading.begin(STEPS);
	let ticked = 0;
	const tickTo = (n: number) => {
		while (ticked < n) {
			loading.tick();
			ticked++;
		}
	};
	const res = await fetch(url);
	if (!res.ok) throw new Error(`soundfont fetch failed: ${res.status}`);
	const total = Number(res.headers.get('content-length')) || 0;
	if (!res.body || !total) {
		const bytes = new Uint8Array(await res.arrayBuffer());
		tickTo(STEPS);
		return bytes;
	}
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.length;
		tickTo(Math.min(STEPS, Math.floor((received / total) * STEPS)));
	}
	tickTo(STEPS);
	const out = new Uint8Array(received);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.length;
	}
	return out;
}

export const audio = new AudioEngine();
