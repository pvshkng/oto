// Real-time pitch shifter built from plain Web Audio nodes — no AudioWorklet,
// no ScriptProcessor. It's an adaptation of Chris Wilson's "Jungle" granular
// pitch shifter: two delay lines whose delay times are swept by looping
// sawtooth control buffers, cross-faded by matching windowing buffers, so the
// output is repitched without changing playback speed.
//
// Why this approach: it runs entirely on the audio thread as a small fixed
// graph of native nodes, so it stays glitch-free and cheap even on mobile —
// no per-sample JS callback that a busy main thread could starve. Quality is
// plenty for the app's jobs (transcribing, learning, practising along), and at
// 0 semitones the controller bypasses it entirely so the common case is
// bit-transparent.

const DELAY_TIME = 0.1;
const FADE_TIME = 0.05;
const BUFFER_TIME = 0.1;

/** A buffer that fades 0→1 over fadeTime, holds 1 over activeTime, then fades
 *  1→0 — the cross-fade window for one of the two delay grains. */
function createFadeBuffer(
	ctx: BaseAudioContext,
	activeTime: number,
	fadeTime: number
): AudioBuffer {
	const length1 = activeTime * ctx.sampleRate;
	const length2 = (activeTime - 2 * fadeTime) * ctx.sampleRate;
	const length = length1 + length2;
	const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const p = buffer.getChannelData(0);

	const fadeLength = fadeTime * ctx.sampleRate;
	const fadeIndex1 = fadeLength;
	const fadeIndex2 = length1 - fadeLength;

	for (let i = 0; i < length1; ++i) {
		let value: number;
		if (i < fadeIndex1) value = Math.sqrt(i / fadeLength);
		else if (i >= fadeIndex2) value = Math.sqrt(1 - (i - fadeIndex2) / fadeLength);
		else value = 1;
		p[i] = value;
	}

	for (let i = length1; i < length; ++i) p[i] = 0;
	return buffer;
}

/** A looping sawtooth control buffer that sweeps a delay line's delay time from
 *  0→delayTime (or the reverse), producing the pitch shift when summed with the
 *  fade window above. */
function createDelayTimeBuffer(
	ctx: BaseAudioContext,
	activeTime: number,
	fadeTime: number,
	shiftUp: boolean
): AudioBuffer {
	const length1 = activeTime * ctx.sampleRate;
	const length2 = (activeTime - 2 * fadeTime) * ctx.sampleRate;
	const length = length1 + length2;
	const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const p = buffer.getChannelData(0);

	for (let i = 0; i < length1; ++i) {
		if (shiftUp) p[i] = (length1 - i) / length;
		else p[i] = i / length1;
	}
	for (let i = length1; i < length; ++i) p[i] = 0;
	return buffer;
}

/**
 * A repitching effect with plain `input`/`output` GainNodes. Feed audio into
 * `input`, take it from `output`; call `setPitchOffset(semitones)` any time.
 */
export class PitchShifter {
	readonly input: GainNode;
	readonly output: GainNode;

	private ctx: BaseAudioContext;
	private modGain1: GainNode;
	private modGain2: GainNode;
	private delay1: DelayNode;
	private delay2: DelayNode;
	private fade1: GainNode;
	private fade2: GainNode;
	private mod1: AudioBufferSourceNode;
	private mod2: AudioBufferSourceNode;
	private fadeSource1: AudioBufferSourceNode;
	private fadeSource2: AudioBufferSourceNode;
	private started = false;

	constructor(ctx: BaseAudioContext) {
		this.ctx = ctx;
		this.input = ctx.createGain();
		this.output = ctx.createGain();

		// Two looping sawtooth LFOs, a half-cycle out of phase, drive the delays.
		const mod1Buffer = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, false);
		const mod2Buffer = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, true);
		const fadeBuffer = createFadeBuffer(ctx, BUFFER_TIME, FADE_TIME);

		this.mod1 = ctx.createBufferSource();
		this.mod2 = ctx.createBufferSource();
		this.mod1.buffer = mod1Buffer;
		this.mod2.buffer = mod2Buffer;
		this.mod1.loop = true;
		this.mod2.loop = true;

		this.modGain1 = ctx.createGain();
		this.modGain2 = ctx.createGain();
		this.delay1 = ctx.createDelay();
		this.delay2 = ctx.createDelay();
		this.mod1.connect(this.modGain1);
		this.mod2.connect(this.modGain2);
		this.modGain1.connect(this.delay1.delayTime);
		this.modGain2.connect(this.delay2.delayTime);

		// Cross-fade windows for each grain.
		this.fadeSource1 = ctx.createBufferSource();
		this.fadeSource2 = ctx.createBufferSource();
		this.fadeSource1.buffer = fadeBuffer;
		this.fadeSource2.buffer = fadeBuffer;
		this.fadeSource1.loop = true;
		this.fadeSource2.loop = true;

		this.fade1 = ctx.createGain();
		this.fade2 = ctx.createGain();
		this.fade1.gain.value = 0;
		this.fade2.gain.value = 0;
		this.fadeSource1.connect(this.fade1.gain);
		this.fadeSource2.connect(this.fade2.gain);

		// input → delayN → fadeN → output
		this.input.connect(this.delay1);
		this.input.connect(this.delay2);
		this.delay1.connect(this.fade1);
		this.delay2.connect(this.fade2);
		this.fade1.connect(this.output);
		this.fade2.connect(this.output);

		this.setPitchOffset(0);
	}

	/** Start the internal LFOs, staggered by half a buffer so the grains alternate. */
	private start() {
		if (this.started) return;
		this.started = true;
		const t = this.ctx.currentTime + 0.05;
		this.mod1.start(t);
		this.mod2.start(t + BUFFER_TIME / 2);
		this.fadeSource1.start(t);
		this.fadeSource2.start(t + BUFFER_TIME / 2);
	}

	/** Repitch by `semitones` (±12). 0 leaves the signal essentially untouched. */
	setPitchOffset(semitones: number) {
		this.start();
		const octaves = Math.max(-12, Math.min(12, semitones)) / 12;
		// A positive delay-time sweep lowers pitch and vice-versa.
		if (octaves > 0) {
			this.modGain1.gain.value = 0;
			this.modGain2.gain.value = (DELAY_TIME * octaves) / 1;
		} else {
			this.modGain1.gain.value = (DELAY_TIME * -octaves) / 1;
			this.modGain2.gain.value = 0;
		}
		this.mod1.playbackRate.value = octaves / DELAY_TIME || 0.0001;
		this.mod2.playbackRate.value = octaves / DELAY_TIME || 0.0001;
	}

	dispose() {
		try {
			this.mod1.stop();
			this.mod2.stop();
			this.fadeSource1.stop();
			this.fadeSource2.stop();
		} catch {
			/* already stopped */
		}
		this.input.disconnect();
		this.output.disconnect();
	}
}
