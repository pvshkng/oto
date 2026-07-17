// Undo/redo history and the debounced autosave, built around one shared idea:
// the "baseline" — a JSON snapshot of the last settled score. Editing pushes
// the previous baseline for undo (free), and the costly whole-score proxy walk
// that refreshes it is deferred to idle time so a keystroke never blocks on it.
// The autosave reuses the same walk whenever it can. See the perf notes on the
// individual members; the invariants here were won from profiling large scores.
//
// The controller doesn't own the score itself — it reads and (on undo/redo)
// replaces it through the small host interface, so the score store stays the
// single owner of document state.

import { serializeCompact } from '$lib/oto/format';
import type { OtoMeasure, OtoScore } from '$lib/oto/types';

const STORAGE_KEY = 'oto.score';
const AUTOSAVE = true;

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

/** What the history controller needs from its owning store. */
export interface HistoryHost {
	getScore(): OtoScore;
	/** Replace the document (undo/redo restore a parsed snapshot). */
	setScore(score: OtoScore): void;
	/** Called after undo/redo swapped the score in (e.g. clamp the cursor). */
	afterRestore(): void;
}

export class ScoreHistory {
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

	#host: HistoryHost;

	constructor(host: HistoryHost) {
		this.#host = host;
	}

	get canUndo(): boolean {
		return this.#undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.#redoStack.length > 0;
	}

	// ---- autosave ----------------------------------------------------------

	/** The raw autosaved score blob, if any (page-load restore). */
	readAutosave(): string | null {
		if (typeof localStorage === 'undefined') return null;
		return localStorage.getItem(STORAGE_KEY);
	}

	/** Drop the autosave (the document it belongs to is being closed). */
	clearAutosave() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* ignore */
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
				: serializeCompact($state.snapshot(this.#host.getScore()) as OtoScore);
			localStorage.setItem(STORAGE_KEY, blob);
		} catch {
			/* quota / private mode */
		}
	}

	// ---- edits -------------------------------------------------------------

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
		this.scheduleSettle();
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
			this.#baselineFor !== this.#host.getScore() ||
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
		this.#baselineFor = this.#host.getScore();
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
			this.#adoptBaseline($state.snapshot(this.#host.getScore()) as OtoScore);
		}
		this.#burstOpen = false;
		this.#burstKey = null;
	}

	scheduleSettle() {
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
	// own scheduleSettle restarts it), so a half-walked snapshot can never be
	// adopted.
	#settleIdle() {
		if (!this.#needsBaselineRefresh()) {
			this.#burstOpen = false;
			this.#burstKey = null;
			return;
		}
		const epoch = this.#snapEpoch;
		const score = this.#host.getScore();
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
			if (epoch !== this.#snapEpoch || score !== this.#host.getScore()) return; // aborted by an edit
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
	dirtyBaseline() {
		this.#snapEpoch++;
		this.#baselineStale = true;
		if (!this.#gestureActive) this.scheduleSettle();
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
		this.scheduleSettle();
	}

	undo() {
		this.#settle(); // ensure the baseline reflects the current state for redo
		const prev = this.#undoStack.pop();
		if (prev === undefined) return;
		this.#redoStack.push(this.#baseline);
		this.#restore(prev);
	}

	redo() {
		this.#settle();
		const next = this.#redoStack.pop();
		if (next === undefined) return;
		this.#undoStack.push(this.#baseline);
		this.#restore(next);
	}

	/** Swap a history snapshot in as the current score. */
	#restore(snapshot: string) {
		this.#host.setScore(JSON.parse(snapshot));
		this.#baseline = snapshot;
		this.#baselineFor = this.#host.getScore();
		this.#baselineStale = false;
		this.#burstOpen = false;
		this.#snapEpoch++;
		this.#settledEpoch = this.#snapEpoch; // the restored string IS the new state
		this.#host.afterRestore();
		this.#scoreVersion++;
		this.persist();
	}

	/** Forget everything — the document was replaced wholesale (close/new). Drops
	 *  the history stacks, the settled baseline (and any in-flight walk) so
	 *  nothing from the closed score can be pushed for undo or written to the
	 *  autosave, and any autosave still waiting in the debounce window. */
	reset() {
		this.#undoStack = [];
		this.#redoStack = [];
		this.#cancelSettleWork();
		this.#snapEpoch++;
		this.#baseline = '';
		this.#baselineFor = null;
		this.#baselineStale = false;
		this.#burstOpen = false;
		this.#burstKey = null;
		this.scheduleSettle();
		if (this.#persistTimer) {
			clearTimeout(this.#persistTimer);
			this.#persistTimer = null;
		}
	}
}
