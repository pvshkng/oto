// Chromatic tuner controller: microphone → detected pitch, as reactive state.
//
// Lifecycle: `start()` is called when a tuner surface (desktop window / mobile
// modal) mounts and `stop()` when it unmounts, so the mic is only ever live
// while the tuner is actually on screen — the mic indicator in the browser tab
// never lingers after closing it. The controller owns its own small
// AudioContext + AnalyserNode chain, kept apart from the playback engine: the
// synth's context is tuned for output latency and would gain nothing from
// having a live capture branch grafted onto it.
//
// Levels: getUserMedia runs with the speech DSP (AGC etc.) disabled, so raw
// capture level varies wildly across devices — phone mics are near-silent at
// arm's length, desktop mics often run hot. Detection therefore never looks at
// absolute amplitude: each window that clears a low noise floor is
// renormalised to TARGET_RMS (software AGC), and a correlation-confidence
// gate rejects windows with no real periodicity, however loud. The optional
// user `gain` only scales the noise-floor gate (a sensitivity control) and is
// persisted across sessions.
//
// Permission handling: before prompting we consult the Permissions API (where
// supported) so an already-denied mic short-circuits to the `denied` state
// instead of a getUserMedia call that instantly rejects. We also subscribe to
// permission changes, so revoking access mid-session flips the UI to the
// denied state, and re-granting it lets a retry succeed.

export type TunerStatus =
	| 'idle' // not running (tuner closed)
	| 'requesting' // waiting on the permission prompt / device open
	| 'listening' // mic live, detection loop running
	| 'denied' // user (or policy) blocked the microphone
	| 'unavailable' // no mic / no getUserMedia on this device
	| 'error'; // device open failed for another reason

export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

/** Detection window. 2048 samples (~46 ms at 44.1 kHz) resolves down to bass
 *  low E comfortably; below ~30 Hz confidence drops off, which is acceptable. */
const FFT_SIZE = 2048;
/** Plausible fundamental range: just under B0 up to ~C8. */
const MIN_FREQ = 30;
const MAX_FREQ = 4200;
/** Run detection at ~30 Hz — the needle stays fluid while the O(n²)
 *  autocorrelation stays well clear of the frame budget. */
const DETECT_INTERVAL_MS = 33;
/** Keep showing the last note this long after the signal fades, so the readout
 *  doesn't flicker between plucks. */
const HOLD_MS = 750;
/** Post-gain RMS floor below which the input counts as silence. Deliberately
 *  low: with autoGainControl disabled, phone mics a metre from an acoustic
 *  guitar sit around 0.002–0.005 RMS. Loud broadband noise passing this gate
 *  is rejected by the correlation-confidence check instead. */
export const NOISE_FLOOR = 0.0015;
/** Every window that clears the noise floor is renormalised to this RMS
 *  before detection (software AGC), so a whisper-quiet phone mic and a hot
 *  desktop input hit the detector at the same working level. */
const TARGET_RMS = 0.25;
/** Minimum normalised autocorrelation peak to accept a pitch. Periodic
 *  signals score near 1; broadband room noise scores well under 0.5, so this
 *  keeps a hot mic's ambient noise from reading as random notes. */
const MIN_CONFIDENCE = 0.8;
/** User "mic volume" multiplier bounds; scales the input before the silence
 *  gate, i.e. it is a sensitivity control. */
const MIN_GAIN = 0.25;
const MAX_GAIN = 8;
const GAIN_KEY = 'oto.tunerGain';

/**
 * Time-domain autocorrelation with silence-trim and parabolic peak
 * interpolation (the widely used "ACF2+" approach), plus a normalised-peak
 * confidence gate. Expects input already normalised to TARGET_RMS. Returns
 * the fundamental in Hz, or -1 when the window holds no confident pitch.
 */
export function autoCorrelate(input: Float32Array, sampleRate: number): number {
	let size = input.length;

	// Trim the leading/trailing low-amplitude tails: correlating mostly-silence
	// biases the peak search toward spurious long lags.
	let r1 = 0;
	let r2 = size - 1;
	const thres = 0.2;
	for (let i = 0; i < size / 2; i++) {
		if (Math.abs(input[i]) < thres) {
			r1 = i;
			break;
		}
	}
	for (let i = 1; i < size / 2; i++) {
		if (Math.abs(input[size - i]) < thres) {
			r2 = size - i;
			break;
		}
	}
	const buf = input.subarray(r1, r2);
	size = buf.length;
	if (size < 2) return -1;

	const c = new Float32Array(size);
	for (let lag = 0; lag < size; lag++) {
		let sum = 0;
		for (let i = 0; i < size - lag; i++) sum += buf[i] * buf[i + lag];
		c[lag] = sum;
	}

	// Skip the zero-lag peak, then take the highest remaining correlation.
	let d = 0;
	while (d < size - 1 && c[d] > c[d + 1]) d++;
	let maxval = -1;
	let maxpos = -1;
	for (let i = d; i < size; i++) {
		if (c[i] > maxval) {
			maxval = c[i];
			maxpos = i;
		}
	}
	if (maxpos <= 0) return -1;

	// Confidence: the peak relative to zero-lag energy, compensated for the
	// shorter overlap at longer lags (c[lag] sums size−lag products). A truly
	// periodic signal scores ~1 here; noise has no strong repeat and scores
	// low, whatever its level — this is what keeps a loud room quiet on the
	// readout.
	const confidence = (maxval / c[0]) * (size / (size - maxpos));
	if (confidence < MIN_CONFIDENCE) return -1;

	// Parabolic interpolation around the peak for sub-sample lag precision —
	// at 44.1 kHz a whole-sample lag step near 330 Hz is ~2.5 cents, too coarse.
	let t0 = maxpos;
	const x1 = c[t0 - 1] ?? c[t0];
	const x2 = c[t0];
	const x3 = c[t0 + 1] ?? c[t0];
	const a = (x1 + x3 - 2 * x2) / 2;
	const b = (x3 - x1) / 2;
	if (a) t0 = t0 - b / (2 * a);

	return sampleRate / t0;
}

class TunerController {
	status = $state<TunerStatus>('idle');
	permission = $state<MicPermission>('unknown');
	/** Human-readable detail for status === 'error'. */
	errorMessage = $state('');

	/** Detected fundamental in Hz; 0 while nothing is sounding. */
	freq = $state(0);
	/** Nearest equal-tempered MIDI note; -1 while silent. */
	midi = $state(-1);
	/** Deviation from that note in cents (−50…+50). */
	cents = $state(0);

	/** User mic-volume multiplier (sensitivity). 1 = as captured. */
	gain = $state(1);
	/** Post-gain input level (RMS, instant attack / fast decay) for the meter. */
	level = $state(0);

	#stream: MediaStream | null = null;
	#ctx: AudioContext | null = null;
	#analyser: AnalyserNode | null = null;
	#buf: Float32Array<ArrayBuffer> | null = null;
	#raf = 0;
	#lastDetect = 0;
	#lastHeard = 0;
	#permStatus: PermissionStatus | null = null;

	constructor() {
		if (typeof localStorage !== 'undefined') {
			const saved = Number(localStorage.getItem(GAIN_KEY));
			if (Number.isFinite(saved) && saved > 0) {
				this.gain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, saved));
			}
		}
	}

	/** Set the mic-volume multiplier (clamped) and persist it. */
	setGain(g: number) {
		this.gain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, g));
		try {
			localStorage.setItem(GAIN_KEY, String(this.gain));
		} catch {
			// Persistence is best-effort (private browsing, quota).
		}
	}

	/** Open the microphone and begin pitch detection. Safe to call again while
	 *  already running (no-op) or after a denial (retries the prompt). */
	async start() {
		if (this.status === 'listening' || this.status === 'requesting') return;
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			this.status = 'unavailable';
			return;
		}
		this.status = 'requesting';

		await this.#checkPermission();
		if (this.permission === 'denied') {
			this.status = 'denied';
			return;
		}

		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				// Raw signal: the speech-oriented DSP (echo cancellation, noise
				// suppression, AGC) filters and pumps exactly the sustained tonal
				// content a tuner needs to see.
				audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
			});
		} catch (err) {
			const name = err instanceof DOMException ? err.name : '';
			if (name === 'NotAllowedError' || name === 'SecurityError') {
				this.permission = 'denied';
				this.status = 'denied';
			} else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
				this.status = 'unavailable';
			} else {
				this.errorMessage = err instanceof Error ? err.message : 'Could not open the microphone.';
				this.status = 'error';
			}
			return;
		}

		// The tuner may have been closed while the permission prompt was up.
		if (this.status !== 'requesting') {
			stream.getTracks().forEach((t) => t.stop());
			return;
		}

		this.permission = 'granted';
		this.#stream = stream;
		// OS-level revocation (or unplugging the device) ends the track without
		// any Permissions API event — treat it like a stop.
		for (const track of stream.getTracks()) {
			track.onended = () => {
				if (this.status === 'listening') {
					this.stop();
					this.status = this.#permStatus?.state === 'denied' ? 'denied' : 'error';
					if (this.status === 'error') this.errorMessage = 'The microphone was disconnected.';
				}
			};
		}

		this.#ctx = new AudioContext();
		// start() runs from a click on the tuner toggle, so resume() is allowed —
		// but a context created in a stale gesture window can still open suspended.
		void this.#ctx.resume().catch(() => {});
		this.#analyser = this.#ctx.createAnalyser();
		this.#analyser.fftSize = FFT_SIZE;
		this.#ctx.createMediaStreamSource(stream).connect(this.#analyser);
		this.#buf = new Float32Array(FFT_SIZE);
		this.#lastHeard = 0;
		this.status = 'listening';
		this.#raf = requestAnimationFrame(this.#loop);
	}

	/** Release the microphone and reset the readout. */
	stop() {
		cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		this.#stream?.getTracks().forEach((t) => {
			t.onended = null;
			t.stop();
		});
		this.#stream = null;
		void this.#ctx?.close().catch(() => {});
		this.#ctx = null;
		this.#analyser = null;
		this.#buf = null;
		this.freq = 0;
		this.midi = -1;
		this.cents = 0;
		this.level = 0;
		this.status = 'idle';
	}

	/** Read (and start watching) the mic permission via the Permissions API.
	 *  Leaves `permission` at 'unknown' where the API or the 'microphone' name
	 *  is unsupported (e.g. Firefox) — getUserMedia then decides. */
	async #checkPermission() {
		if (this.#permStatus) {
			this.permission = this.#permStatus.state;
			return;
		}
		try {
			const s = await navigator.permissions.query({ name: 'microphone' as PermissionName });
			this.#permStatus = s;
			this.permission = s.state;
			s.addEventListener('change', () => {
				this.permission = s.state;
				if (s.state === 'denied' && (this.status === 'listening' || this.status === 'requesting')) {
					this.stop();
					this.status = 'denied';
				}
			});
		} catch {
			this.permission = 'unknown';
		}
	}

	#loop = () => {
		this.#raf = requestAnimationFrame(this.#loop);
		if (!this.#analyser || !this.#buf || !this.#ctx) return;
		const now = performance.now();
		if (now - this.#lastDetect < DETECT_INTERVAL_MS) return;
		this.#lastDetect = now;

		this.#analyser.getFloatTimeDomainData(this.#buf);
		const buf = this.#buf;
		let rms = 0;
		for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
		rms = Math.sqrt(rms / buf.length);
		const heard = rms * this.gain;
		// Instant attack, quick decay — reads like a meter, not a flicker.
		this.level = Math.max(heard, this.level * 0.7);

		let f = -1;
		if (heard >= NOISE_FLOOR) {
			// Software AGC: renormalise the window to a fixed working level so
			// detection is independent of how hot or quiet the device's mic is.
			// (The user gain deliberately isn't part of the scale — it only moves
			// the silence gate above, acting as a sensitivity control.)
			const k = TARGET_RMS / rms;
			for (let i = 0; i < buf.length; i++) buf[i] *= k;
			f = autoCorrelate(buf, this.#ctx.sampleRate);
		}
		if (f >= MIN_FREQ && f <= MAX_FREQ) {
			this.#lastHeard = now;
			this.freq = f;
			const exact = 69 + 12 * Math.log2(f / 440);
			const nearest = Math.round(exact);
			const cents = (exact - nearest) * 100;
			// Light smoothing while the note holds steady, so the needle reads as
			// a needle instead of jittering sample noise; jump cuts on note change.
			this.cents = nearest === this.midi ? this.cents + (cents - this.cents) * 0.35 : cents;
			this.midi = nearest;
		} else if (this.midi >= 0 && now - this.#lastHeard > HOLD_MS) {
			this.freq = 0;
			this.midi = -1;
			this.cents = 0;
		}
	};
}

export const tuner = new TunerController();
