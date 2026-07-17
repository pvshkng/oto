// Desktop panel docking/floating layout. Owns where each panel lives (edge
// slot or free-floating window), the drag-to-dock session state, and the
// stacking order — but NOT whether a panel's content is showing: the open
// flags stay on the score store (they're entangled with mobile modals and
// mutual-exclusion rules there), and this controller reaches them through the
// small host interface it's constructed with.

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
export interface PanelLayout {
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

export const PANEL_IDS = Object.keys(PANEL_ALLOWED) as PanelId[];

/** Tie-break order when normalizing a legacy layout that somehow put two panels
 *  on the same edge — the first listed keeps the slot, later ones are floated. */
const PANEL_PRIORITY: PanelId[] = ['note', 'song', 'track', 'tempo', 'addRemove', 'keys', 'tuner'];

function defaultPanelLayout(): Record<PanelId, PanelLayout> {
	return Object.fromEntries(
		PANEL_IDS.map((id) => [id, { dock: PANEL_DEFAULT_DOCK[id], x: 0, y: 0 }])
	) as Record<PanelId, PanelLayout>;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

/** What the panel controller needs from its owning store. */
export interface PanelHost {
	isDesktop(): boolean;
	/** Whether a panel's content is currently showing (the store's open flags). */
	isOpen(id: PanelId): boolean;
	setOpen(id: PanelId, v: boolean): void;
	/** Persist the user-prefs blob (placement is part of it). */
	persistPrefs(): void;
}

export class PanelController {
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

	#host: PanelHost;

	constructor(host: PanelHost) {
		this.#host = host;
	}

	/** The docks a given panel is allowed to occupy. */
	panelAllowed(id: PanelId): Dock[] {
		return PANEL_ALLOWED[id];
	}

	panelDock(id: PanelId): Dock {
		return this.panelLayout[id].dock;
	}

	/** Open a desktop panel. The detail panels (song/track/tempo/add-remove) are
	 *  independent — opening one no longer closes the others — so if a newly-opened
	 *  panel's remembered edge is already taken by another open panel, it opens
	 *  floating instead, letting several coexist on screen. */
	openPanel(id: PanelId) {
		this.#host.setOpen(id, true);
		const p = this.panelLayout[id];
		if (this.#host.isDesktop()) {
			if (
				(p.dock === 'left' || p.dock === 'right') &&
				PANEL_IDS.some(
					(o) => o !== id && this.#host.isOpen(o) && this.panelLayout[o].dock === p.dock
				)
			) {
				// The remembered edge is taken by another open panel — open floating
				// instead so both stay visible.
				p.dock = 'float';
				this.#host.persistPrefs();
			}
			// Cascade never-placed floating windows (offset 0,0) clear of the left
			// column so they don't stack on top of each other or a left-docked
			// panel; an explicitly-placed spot is kept as-is. Also covers panels
			// that are float-by-default (the tuner) on their first open.
			if (p.dock === 'float' && p.x === 0 && p.y === 0) {
				const others = PANEL_IDS.filter(
					(o) => o !== id && this.#host.isOpen(o) && this.panelLayout[o].dock === 'float'
				).length;
				p.x = 340 + others * 30;
				p.y = 24 + others * 30;
				this.#host.persistPrefs();
			}
		}
		this.bringToFront(id);
	}

	closePanel(id: PanelId) {
		this.#host.setOpen(id, false);
	}

	togglePanel(id: PanelId) {
		if (this.#host.isOpen(id)) this.closePanel(id);
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
		this.#host.persistPrefs();
	}

	/** Remember where a floating panel was dragged to (offset from its anchor). */
	setPanelFloatPos(id: PanelId, x: number, y: number) {
		this.panelLayout[id].x = x;
		this.panelLayout[id].y = y;
		this.#host.persistPrefs();
	}

	toggleBottomSplit() {
		this.bottomSplitSwap = !this.bottomSplitSwap;
		this.#host.persistPrefs();
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
		let bestDist = PanelController.#DOCK_SNAP_PX;
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

	/** Apply a persisted placement (from the prefs blob), dropping anything the
	 *  panel isn't allowed to do and re-enforcing the one-panel-per-edge rule. */
	applyStoredLayout(stored: Partial<Record<PanelId, Partial<PanelLayout>>>) {
		for (const id of PANEL_IDS) {
			const s = stored[id];
			if (!s) continue;
			if (s.dock && PANEL_ALLOWED[id].includes(s.dock)) this.panelLayout[id].dock = s.dock;
			if (typeof s.x === 'number') this.panelLayout[id].x = s.x;
			if (typeof s.y === 'number') this.panelLayout[id].y = s.y;
		}
		this.#normalizePanelDocks();
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
}
