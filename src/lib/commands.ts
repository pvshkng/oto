// Shared command catalogue. A single source of truth for editor actions so the
// omni command palette (bottom menubar) and the staff right-click context menu
// stay in lockstep. Each builder reads the store live, so the lists are always
// evaluated against the current selection/context.

import type { Component } from 'svelte';
import { store } from '$lib/stores/score.svelte';
import { togglePlayback, stopPlayback } from '$lib/audio/playback';
import { DURATION_ORDER } from '$lib/oto/duration';
import {
	DURATION_LABELS,
	TECHNIQUE_LABELS,
	type DurationValue,
	type Technique
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
import Rows from 'phosphor-svelte/lib/Rows';
import Copy from 'phosphor-svelte/lib/Copy';
import Eraser from 'phosphor-svelte/lib/Eraser';
import MusicNote from 'phosphor-svelte/lib/MusicNote';
import Sparkle from 'phosphor-svelte/lib/Sparkle';
import Clock from 'phosphor-svelte/lib/Clock';

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

export const EFFECT_LIST: Technique[] = [
	'hammer',
	'slide',
	'bend',
	'release',
	'bend-release',
	'vibrato',
	'palm-mute',
	'let-ring',
	'harmonic',
	'artificial-harmonic',
	'dead',
	'staccato',
	'ghost',
	'accent',
	'grace'
];

export const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'];

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

export function timeSigCommands(): Cmd[] {
	return TIME_SIGS.map((ts) => ({
		id: `ts-${ts}`,
		label: `Time signature: ${ts}`,
		icon: Clock,
		keywords: 'meter bar',
		run: () => setBarTimeSig(ts)
	}));
}

/** Context-aware note actions, present only when a note is under the cursor. */
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
			run: () => void import('$lib/io/files').then((m) => m.openFile())
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
			run: () => (store.editMode = !store.editMode)
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
		}
	];
}

/** The full, context-aware command list for the omni palette. */
export function allCommandGroups(): CmdGroup[] {
	const hasNote = !!store.currentNote;
	const groups: CmdGroup[] = [];
	groups.push({ heading: 'File', items: fileCommands() });
	groups.push({ heading: 'Transport', items: transportCommands() });
	groups.push({ heading: 'Edit', items: editCommands() });
	if (hasNote) {
		groups.push({
			heading: 'Note',
			items: [...noteCommands(), ...durationCommands(), ...effectCommands()]
		});
	} else {
		groups.push({ heading: 'Note', items: durationCommands() });
	}
	groups.push({
		heading: `Bar ${store.cursor.measure + 1}`,
		items: [...barCommands(), ...timeSigCommands()]
	});
	return groups;
}
