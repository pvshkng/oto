// Shared command catalogue. A single source of truth for editor actions so the
// omni command palette (bottom menubar) and the staff right-click context menu
// stay in lockstep. Each builder reads the store live, so the lists are always
// evaluated against the current selection/context.

import type { Component } from 'svelte';
import { store, type PanelId, type Dock } from '$lib/stores/score.svelte';
import { togglePlayback, stopPlayback } from '$lib/audio/playback';
import { DURATION_ORDER } from '$lib/oto/duration';
import {
	DURATION_LABELS,
	DYNAMICS,
	TECHNIQUE_LABELS,
	TUPLET_VALUES,
	OTTAVAS,
	type Dynamic,
	type DurationValue,
	type Ottava,
	type StrumDirection,
	type Technique,
	type TupletValue
} from '$lib/oto/types';

import Play from 'phosphor-svelte/lib/Play';
import Stop from 'phosphor-svelte/lib/Stop';
import Metronome from 'phosphor-svelte/lib/Metronome';
import Repeat from 'phosphor-svelte/lib/Repeat';
import FloppyDisk from 'phosphor-svelte/lib/FloppyDisk';
import FilePdf from 'phosphor-svelte/lib/FilePdf';
import FolderOpen from 'phosphor-svelte/lib/FolderOpen';
import FilePlus from 'phosphor-svelte/lib/FilePlus';
import ArrowUUpLeft from 'phosphor-svelte/lib/ArrowUUpLeft';
import ArrowUUpRight from 'phosphor-svelte/lib/ArrowUUpRight';
import PencilSimple from 'phosphor-svelte/lib/PencilSimple';
import Trash from 'phosphor-svelte/lib/Trash';
import X from 'phosphor-svelte/lib/X';
import Rows from 'phosphor-svelte/lib/Rows';
import SquareHalf from 'phosphor-svelte/lib/SquareHalf';
import SquareHalfBottom from 'phosphor-svelte/lib/SquareHalfBottom';
import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';
import Copy from 'phosphor-svelte/lib/Copy';
import Eraser from 'phosphor-svelte/lib/Eraser';
import MusicNote from 'phosphor-svelte/lib/MusicNote';
import Sparkle from 'phosphor-svelte/lib/Sparkle';
import Clock from 'phosphor-svelte/lib/Clock';
import TuningFork from '$lib/components/icons/TuningFork.svelte';

export interface Cmd {
	id: string;
	label: string;
	icon?: Component;
	keywords?: string;
	active?: boolean;
	disabled?: boolean;
	run: () => void;
}

export interface CmdGroup {
	heading: string;
	items: Cmd[];
}

export const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'];

/** Play counts offered for a repeated passage (×2 is the notation default). */
export const REPEAT_COUNTS = [2, 3, 4] as const;

export interface EffectUi {
	tech: Technique;
	label: string;
	sym: string;
	alwaysOn?: boolean;
}

/**
 * Technique effects grouped the way Guitar Pro organises its note-effect
 * toolbar. EffectsGrid renders these as visually separated sections; the
 * command palette and context menu flatten them via EFFECT_LIST/EFFECT_UI.
 */
export const EFFECT_SECTIONS: { title: string; items: EffectUi[] }[] = [
	{
		title: 'Legato',
		items: [
			{ tech: 'hammer', label: 'Hammer-on', sym: 'H' },
			{ tech: 'pull', label: 'Pull-off', sym: 'P' },
			{ tech: 'tap', label: 'Tap', sym: 'T' },
			{ tech: 'trill', label: 'Trill', sym: 'tr' }
		]
	},
	{
		title: 'Bends & slides',
		items: [
			{ tech: 'bend', label: 'Bend', sym: '⤴' },
			{ tech: 'release', label: 'Release', sym: '⤵' },
			{ tech: 'bend-release', label: 'Bend/Release', sym: '⤴⤵' },
			{ tech: 'slide', label: 'Slide', sym: '/' }
		]
	},
	{
		title: 'Vibrato & sustain',
		items: [
			{ tech: 'vibrato', label: 'Vibrato', sym: '∿' },
			{ tech: 'wide-vibrato', label: 'Wide vibrato', sym: '≈' },
			{ tech: 'let-ring', label: 'Let ring', sym: 'LR' },
			{ tech: 'palm-mute', label: 'Palm mute', sym: 'PM' }
		]
	},
	{
		title: 'Harmonics',
		items: [
			{ tech: 'harmonic', label: 'Nat. Harmonic', sym: '<>' },
			{ tech: 'artificial-harmonic', label: 'Art. Harmonic', sym: 'AH' }
		]
	},
	{
		title: 'Articulation',
		items: [
			{ tech: 'accent', label: 'Accent', sym: '>' },
			{ tech: 'heavy-accent', label: 'Heavy accent', sym: '^' },
			{ tech: 'tenuto', label: 'Tenuto', sym: '‒' },
			{ tech: 'staccato', label: 'Staccato', sym: '·' },
			{ tech: 'ghost', label: 'Ghost', sym: '()' },
			{ tech: 'dead', label: 'Dead', sym: '✕', alwaysOn: true },
			{ tech: 'grace', label: 'Grace', sym: 'gr' }
		]
	},
	{
		title: 'Picking & dynamics',
		items: [
			{ tech: 'tremolo', label: 'Tremolo picking', sym: '≡' },
			{ tech: 'slap', label: 'Slap (bass)', sym: 'S' },
			{ tech: 'pop', label: 'Pop (bass)', sym: 'Pop' },
			{ tech: 'fade-in', label: 'Fade in', sym: '<' }
		]
	}
];

/** Effect grid entries, flattened: technique + short symbol. */
export const EFFECT_UI: EffectUi[] = EFFECT_SECTIONS.flatMap((s) => s.items);

export const EFFECT_LIST: Technique[] = EFFECT_UI.map((e) => e.tech);

/** Human-facing labels for the dynamics palette (buttons show the raw mark). */
export const DYNAMIC_LABELS: Record<Dynamic, string> = {
	ppp: 'Pianississimo',
	pp: 'Pianissimo',
	p: 'Piano',
	mp: 'Mezzo-piano',
	mf: 'Mezzo-forte',
	f: 'Forte',
	ff: 'Fortissimo',
	fff: 'Fortississimo',
	fp: 'Fortepiano',
	fz: 'Forzando',
	sf: 'Sforzando',
	sfz: 'Sforzato',
	sffz: 'Sforzato-fortissimo'
};

export const TUPLET_LABELS: Record<TupletValue, string> = {
	3: 'Triplet',
	5: 'Quintuplet',
	6: 'Sextuplet',
	7: 'Septuplet',
	9: 'Nonuplet'
};

export const OTTAVA_LABELS: Record<Ottava, string> = {
	'8va': 'Octave up (8va)',
	'8vb': 'Octave down (8vb)',
	'15ma': 'Two octaves up (15ma)',
	'15mb': 'Two octaves down (15mb)'
};

export const STRUM_LABELS: Record<StrumDirection, string> = {
	down: 'Strum down',
	up: 'Strum up'
};

// ---- shared action helpers (reused by palette and context menu) -----------

export function setDuration(d: DurationValue) {
	store.activeDuration = d;
	store.setBeatDuration(d, store.activeDotted);
}
export function toggleDotted() {
	store.activeDotted = !store.activeDotted;
	store.setBeatDuration(store.activeDuration, store.activeDotted);
}
export function setBarTimeSig(v: string) {
	const [n, d] = v.split('/').map(Number);
	store.setMeasureTimeSignature(store.cursor.measure, n, d);
}
export function hasTech(t: Technique): boolean {
	return store.currentNote?.techniques?.includes(t) ?? false;
}

// ---- command groups --------------------------------------------------------

export function durationCommands(): Cmd[] {
	return DURATION_ORDER.map((d) => ({
		id: `dur-${d}`,
		label: `Duration: ${DURATION_LABELS[d]}`,
		icon: MusicNote,
		keywords: 'note length rhythm',
		active: store.activeDuration === d,
		run: () => setDuration(d)
	}));
}

export function effectCommands(): Cmd[] {
	const note = store.currentNote;
	return EFFECT_LIST.map((t) => ({
		id: `fx-${t}`,
		label: `Effect: ${TECHNIQUE_LABELS[t]}`,
		icon: Sparkle,
		keywords: 'technique articulation',
		active: hasTech(t),
		disabled: !note,
		run: () => store.toggleTechnique(t)
	}));
}

export function dynamicCommands(): Cmd[] {
	const beat = store.currentBeat;
	return DYNAMICS.map((d) => ({
		id: `dyn-${d}`,
		label: `Dynamic: ${d} (${DYNAMIC_LABELS[d]})`,
		icon: Sparkle,
		keywords: 'dynamics volume loud soft velocity',
		active: beat?.dynamic === d,
		run: () => store.setBeatDynamic(d)
	}));
}

export function tupletCommands(): Cmd[] {
	const beat = store.currentBeat;
	return TUPLET_VALUES.map((n) => ({
		id: `tuplet-${n}`,
		label: `Tuplet: ${TUPLET_LABELS[n]} (${n})`,
		icon: MusicNote,
		keywords: 'tuplet triplet rhythm division',
		active: beat?.tuplet === n,
		run: () => store.setBeatTuplet(n)
	}));
}

export function beatMarkCommands(): Cmd[] {
	const beat = store.currentBeat;
	const cmds: Cmd[] = [
		{
			id: 'fermata',
			label: 'Fermata',
			icon: MusicNote,
			keywords: 'hold pause bird eye',
			active: !!beat?.fermata,
			run: () => store.toggleBeatFermata()
		}
	];
	for (const o of OTTAVAS) {
		cmds.push({
			id: `ottava-${o}`,
			label: OTTAVA_LABELS[o],
			icon: MusicNote,
			keywords: 'octave ottava transpose sign',
			active: beat?.ottava === o,
			run: () => store.setBeatOttava(o)
		});
	}
	for (const dir of ['down', 'up'] as const) {
		cmds.push({
			id: `strum-${dir}`,
			label: STRUM_LABELS[dir],
			icon: MusicNote,
			keywords: 'strum brush arrow chord tab',
			active: beat?.strum === dir,
			run: () => store.setBeatStrum(dir)
		});
	}
	return cmds;
}

export function barMarkCommands(): Cmd[] {
	const mi = store.cursor.measure;
	const m = store.currentMeasure;
	const cmds: Cmd[] = [
		{
			id: 'bar-double',
			label: 'Double barline',
			icon: Rows,
			keywords: 'barline section double',
			active: m?.barline === 'double',
			run: () => store.toggleMeasureDoubleBarline(mi)
		},
		{
			id: 'bar-repeat-start',
			label: 'Begin repeat',
			icon: Repeat,
			keywords: 'repeat open barline',
			active: !!m?.repeatStart,
			run: () => store.toggleMeasureRepeatStart(mi)
		},
		{
			id: 'bar-repeat-end',
			label: 'End repeat',
			icon: Repeat,
			keywords: 'repeat close barline',
			active: !!m?.repeatEnd,
			run: () => store.toggleMeasureRepeatEnd(mi)
		},
		{
			id: 'bar-simile',
			label: 'Simile mark (repeat previous bar)',
			icon: Repeat,
			keywords: 'simile percent repeat bar',
			active: !!m?.simile,
			run: () => store.toggleMeasureSimile(mi)
		},
		{
			id: 'bar-segno',
			label: 'Segno',
			icon: MusicNote,
			keywords: 'segno navigation dal',
			active: !!m?.segno,
			run: () => store.toggleMeasureSegno(mi)
		},
		{
			id: 'bar-coda',
			label: 'Coda',
			icon: MusicNote,
			keywords: 'coda navigation al',
			active: !!m?.coda,
			run: () => store.toggleMeasureCoda(mi)
		}
	];
	for (const n of REPEAT_COUNTS) {
		cmds.push({
			id: `bar-repeat-count-${n}`,
			label: `Repeat ×${n} (play count)`,
			icon: Repeat,
			keywords: 'repeat count times play passage',
			active: !!m?.repeatEnd && (m?.repeatCount ?? 2) === n,
			run: () => store.setMeasureRepeatCount(mi, n)
		});
	}
	for (const n of [1, 2, 3]) {
		cmds.push({
			id: `bar-volta-${n}`,
			label: `Volta bracket ${n}.`,
			icon: Repeat,
			keywords: 'volta ending alternate bracket',
			active: m?.volta === n,
			run: () => store.setMeasureVolta(mi, n)
		});
	}
	return cmds;
}

export function timeSigCommands(): Cmd[] {
	return TIME_SIGS.map((ts) => ({
		id: `ts-${ts}`,
		label: `Time signature: ${ts}`,
		icon: Clock,
		keywords: 'meter bar',
		run: () => setBarTimeSig(ts)
	}));
}

/** Context-aware note actions — most need a note under the cursor; tie only
 *  needs an earlier note on the cursor's string to continue. */
export function noteCommands(): Cmd[] {
	const note = store.currentNote;
	const items: Cmd[] = [];
	items.push({
		id: 'dotted',
		label: store.activeDotted ? 'Dotted (on)' : 'Dotted',
		icon: MusicNote,
		active: store.activeDotted,
		run: toggleDotted
	});
	items.push({
		id: 'tie-note',
		label: 'Tie note',
		icon: MusicNote,
		keywords: 'tie hold sustain legato continue',
		active: !!note?.tied,
		disabled: !store.canTie,
		run: () => store.toggleNoteTie()
	});
	items.push({
		id: 'delete-note',
		label: 'Delete note',
		icon: Trash,
		disabled: !note,
		run: () => store.deleteNoteAtCursor()
	});
	return items;
}

export function barCommands(): Cmd[] {
	const m = store.cursor.measure;
	const onlyOne = store.track.measures.length <= 1;
	return [
		{
			id: 'bar-insert-before',
			label: 'Insert bar before',
			icon: Rows,
			run: () => store.insertMeasureAt(m)
		},
		{
			id: 'bar-insert-after',
			label: 'Insert bar after',
			icon: Rows,
			run: () => store.insertMeasureAt(m + 1)
		},
		{
			id: 'bar-duplicate',
			label: 'Duplicate bar',
			icon: Copy,
			run: () => store.duplicateMeasureAt(m)
		},
		{ id: 'bar-clear', label: 'Clear bar', icon: Eraser, run: () => store.clearMeasureAt(m) },
		{
			id: 'bar-delete',
			label: 'Delete bar',
			icon: Trash,
			disabled: onlyOne,
			run: () => store.removeMeasureFromAll(m)
		}
	];
}

export function fileCommands(): Cmd[] {
	return [
		{
			id: 'file-new',
			label: 'New score',
			icon: FilePlus,
			run: () => {
				if (confirm('Start a new score? Your current one stays in the last save.'))
					store.newScore();
			}
		},
		{
			id: 'file-save',
			label: 'Save .oto',
			icon: FloppyDisk,
			run: () => void import('$lib/io/files').then((m) => m.downloadOto())
		},
		{
			id: 'file-pdf',
			label: 'Export PDF',
			icon: FilePdf,
			run: () => void import('$lib/io/files').then((m) => m.exportPdf())
		},
		{
			id: 'file-open',
			label: 'Open / Import',
			icon: FolderOpen,
			run: () => (store.openFileModalOpen = true)
		},
		{
			id: 'file-close',
			label: 'Close score',
			icon: X,
			keywords: 'close quit exit welcome empty',
			disabled: !store.documentOpen,
			run: () => {
				if (confirm('Close this score? Unsaved changes will be lost.')) store.closeDocument();
			}
		}
	];
}

export function editCommands(): Cmd[] {
	return [
		{ id: 'undo', label: 'Undo', icon: ArrowUUpLeft, run: () => store.undo() },
		{ id: 'redo', label: 'Redo', icon: ArrowUUpRight, run: () => store.redo() },
		{
			id: 'toggle-editor',
			label: store.editMode ? 'Hide note editor' : 'Show note editor',
			icon: PencilSimple,
			active: store.editMode,
			run: () => store.togglePanel('note')
		}
	];
}

export function transportCommands(): Cmd[] {
	return [
		{
			id: 'play',
			label: store.isPlaying ? 'Stop playback' : 'Play',
			icon: store.isPlaying ? Stop : Play,
			run: () => togglePlayback()
		},
		{ id: 'stop', label: 'Stop', icon: Stop, run: () => stopPlayback() },
		{
			id: 'metronome',
			label: store.metronomeOn ? 'Metronome (on)' : 'Metronome',
			icon: Metronome,
			active: store.metronomeOn,
			run: () => (store.metronomeOn = !store.metronomeOn)
		},
		{
			id: 'loop',
			label: store.loopEnabled ? 'Loop selection (on)' : 'Loop selection',
			icon: Repeat,
			active: store.loopEnabled,
			run: () => (store.loopEnabled = !store.loopEnabled)
		},
		{
			id: 'tuner',
			label: store.tunerOpen ? 'Chromatic tuner (open)' : 'Chromatic tuner',
			icon: TuningFork,
			keywords: 'tuner tune pitch fork microphone',
			active: store.tunerOpen,
			run: () => store.togglePanel('tuner')
		}
	];
}

const PANEL_LABELS: Record<PanelId, string> = {
	note: 'Note editor',
	keys: 'Key pad',
	song: 'Song details',
	track: 'Track control',
	tempo: 'Tempo',
	addRemove: 'Add / remove',
	// Float-only, so panelCommands never emits a dock action for it — listed to
	// keep the record total over PanelId.
	tuner: 'Tuner'
};
const DOCK_LABELS: Record<Dock, string> = {
	left: 'dock left',
	right: 'dock right',
	bottom: 'dock bottom',
	float: 'float'
};
const DOCK_ICONS: Record<Dock, Component> = {
	left: SquareHalf,
	right: SquareHalf,
	bottom: SquareHalfBottom,
	float: ArrowSquareOut
};

/** Desktop-only panel-docking actions: for each open panel, move it to any of
 *  its allowed docks (except where it already is). Mirrors the in-header dock
 *  controls so the whole flow is reachable from the keyboard. */
export function panelCommands(): Cmd[] {
	if (!store.isDesktop) return [];
	const cmds: Cmd[] = [];
	for (const id of Object.keys(PANEL_LABELS) as PanelId[]) {
		if (!store.isPanelOpen(id)) continue;
		for (const dock of store.panelAllowed(id)) {
			if (store.panelDock(id) === dock) continue;
			cmds.push({
				id: `dock-${id}-${dock}`,
				label: `${PANEL_LABELS[id]}: ${DOCK_LABELS[dock]}`,
				icon: DOCK_ICONS[dock],
				keywords: 'dock undock move panel window',
				run: () => store.setPanelDock(id, dock)
			});
		}
	}
	return cmds;
}

/** The full, context-aware command list for the omni palette. */
export function allCommandGroups(): CmdGroup[] {
	const hasNote = !!store.currentNote;
	const groups: CmdGroup[] = [];
	groups.push({ heading: 'File', items: fileCommands() });
	groups.push({ heading: 'Transport', items: transportCommands() });
	groups.push({ heading: 'Edit', items: editCommands() });
	// Note actions stay listed without a note under the cursor (with their own
	// disabled flags) — a tie is applied on an EMPTY beat after an earlier note,
	// so it must be reachable exactly then. Effects still need a note.
	if (hasNote) {
		groups.push({
			heading: 'Note',
			items: [...noteCommands(), ...durationCommands(), ...effectCommands()]
		});
	} else {
		groups.push({ heading: 'Note', items: [...noteCommands(), ...durationCommands()] });
	}
	groups.push({
		heading: 'Beat',
		items: [...tupletCommands(), ...dynamicCommands(), ...beatMarkCommands()]
	});
	groups.push({
		heading: `Bar ${store.cursor.measure + 1}`,
		items: [...barCommands(), ...barMarkCommands(), ...timeSigCommands()]
	});
	const panels = panelCommands();
	if (panels.length) groups.push({ heading: 'Panels', items: panels });
	return groups;
}
