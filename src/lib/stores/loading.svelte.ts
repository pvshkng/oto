// Reactive progress state for the sample/import loading screen.
//
// A single in-flight "batch" tracks how many sample files (and any extra import
// steps) are still pending. The overlay is shown while a batch is active and
// fades out when it completes. Kept deliberately tiny — it's just enough state
// to drive a determinate progress bar and a label.

class LoadingStore {
	/** Whether the loading overlay should be shown. */
	active = $state(false);
	/** Files/steps in the current batch. */
	total = $state(0);
	/** Files/steps completed so far. */
	done = $state(0);
	/** Short status line, e.g. "Loading instruments". */
	label = $state('Loading instruments');

	get progress(): number {
		return this.total > 0 ? Math.min(1, this.done / this.total) : 0;
	}

	/** Open (or extend) the current batch by `count` pending items. */
	begin(count: number, label = 'Loading instruments') {
		if (count <= 0) return;
		if (!this.active) {
			this.total = 0;
			this.done = 0;
		}
		this.total += count;
		this.label = label;
		this.active = true;
	}

	/** Mark one item complete; auto-hides when the batch is fully done. */
	tick() {
		this.done = Math.min(this.total, this.done + 1);
		if (this.done >= this.total) this.active = false;
	}

	/** Force the overlay closed (e.g. on error, so the app stays usable). */
	finish() {
		this.active = false;
	}
}

export const loading = new LoadingStore();
