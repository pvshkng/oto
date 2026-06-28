<script lang="ts">
	// Bottom control bar. A minimal, horizontally scrollable strip: an omni
	// command button (dots) opens the command palette, a File combobox and
	// direct undo/redo/add-remove controls replace the old File/Edit dropdown
	// menus (dropdowns don't work well on touch), the note-editor toggle sits
	// at the top level, and the transport / metronome / loop / tempo controls
	// follow.

	import { store } from '$lib/stores/score.svelte';
	import { play, pausePlayback, stopPlayback, goToStart } from '$lib/audio/playback';
	import { downloadOto, openFile, exportPdf } from '$lib/io/files';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import OmniCommand from './OmniCommand.svelte';
	import AddRemoveDrawer from './AddRemoveDrawer.svelte';
	import TempoDrawer from './TempoDrawer.svelte';

	import DotsThreeVertical from 'phosphor-svelte/lib/DotsThreeVertical';
	import Play from 'phosphor-svelte/lib/Play';
	import Pause from 'phosphor-svelte/lib/Pause';
	import Stop from 'phosphor-svelte/lib/Stop';
	import SkipBack from 'phosphor-svelte/lib/SkipBack';
	import Metronome from 'phosphor-svelte/lib/Metronome';
	import ClockCountdown from 'phosphor-svelte/lib/ClockCountdown';
	import Repeat from 'phosphor-svelte/lib/Repeat';
	import PencilSimple from 'phosphor-svelte/lib/PencilSimple';
	import Sliders from 'phosphor-svelte/lib/Sliders';
	import GearSix from 'phosphor-svelte/lib/GearSix';
	import File from 'phosphor-svelte/lib/File';
	import FilePlus from 'phosphor-svelte/lib/FilePlus';
	import FloppyDisk from 'phosphor-svelte/lib/FloppyDisk';
	import FilePdf from 'phosphor-svelte/lib/FilePdf';
	import FolderOpen from 'phosphor-svelte/lib/FolderOpen';
	import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
	import ArrowClockwise from 'phosphor-svelte/lib/ArrowClockwise';
	import PlusMinus from 'phosphor-svelte/lib/PlusMinus';

	let omniOpen = $state(false);
	let fileOpen = $state(false);
	let addRemoveOpen = $state(false);
	let tempoOpen = $state(false);

	function confirmNew() {
		if (confirm('Start a new score? Your current one stays in the last save.')) store.newScore();
	}
	function runFile(fn: () => void) {
		fn();
		fileOpen = false;
	}
</script>

<div
	class="bottom-bar bg-background flex items-center gap-1.5 overflow-x-auto border-t px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	style="padding-bottom: calc(0.375rem + env(safe-area-inset-bottom))"
>
	<!-- Omni command palette trigger -->
	<Button
		variant="ghost"
		size="icon"
		class="size-9 shrink-0"
		title="Command palette"
		aria-label="Open command palette"
		onclick={() => (omniOpen = true)}
	>
		<DotsThreeVertical class="size-5" weight="bold" />
	</Button>

	<!-- File combobox: New / Save / Export on top, Open below -->
	<Popover.Root bind:open={fileOpen}>
		<Popover.Trigger
			class={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-9 shrink-0')}
			title="File"
			aria-label="File"
		>
			<File class="size-4" />
		</Popover.Trigger>
		<Popover.Content side="top" align="start" class="w-56 p-0">
			<Command.Root>
				<Command.List>
					<Command.Group>
						<Command.Item onSelect={() => runFile(confirmNew)}>
							<FilePlus class="size-4" /> New
						</Command.Item>
						<Command.Item onSelect={() => runFile(() => downloadOto())}>
							<FloppyDisk class="size-4" /> Save .oto
						</Command.Item>
						<Command.Item onSelect={() => runFile(() => exportPdf())}>
							<FilePdf class="size-4" /> Export PDF
						</Command.Item>
					</Command.Group>
					<Command.Separator />
					<Command.Group>
						<Command.Item onSelect={() => runFile(() => void openFile())}>
							<FolderOpen class="size-4" /> Open / Import
						</Command.Item>
					</Command.Group>
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>

	<!-- Undo / redo, stuck together like the metronome/BPM split control -->
	<div class="flex shrink-0 items-stretch">
		<Button
			variant="outline"
			size="icon"
			class="size-9 rounded-r-none"
			title="Undo"
			aria-label="Undo"
			disabled={!store.canUndo}
			onclick={() => store.undo()}
		>
			<ArrowCounterClockwise class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-9 rounded-l-none border-l-0"
			title="Redo"
			aria-label="Redo"
			disabled={!store.canRedo}
			onclick={() => store.redo()}
		>
			<ArrowClockwise class="size-4" />
		</Button>
	</div>

	<!-- Add / remove bars and tracks, opens a drawer (not a dropdown) -->
	<Button
		variant="outline"
		size="icon"
		class="size-9 shrink-0"
		title="Add or remove"
		aria-label="Add or remove bars and tracks"
		onclick={() => (addRemoveOpen = true)}
	>
		<PlusMinus class="size-4" />
	</Button>

	<!-- Track mixer: levels, pan, EQ, arrangement and section markers. Toggled
	     on/off controls read as physically pressed in (sunk), not accent-filled. -->
	<Button
		variant="outline"
		size="sm"
		class={cn('h-9 shrink-0', store.mixerOpen && 'sunk')}
		title="Tracks"
		aria-label="Open track mixer"
		aria-pressed={store.mixerOpen}
		onclick={() => (store.mixerOpen = !store.mixerOpen)}
	>
		<Sliders class="size-4" />
		<span class="hidden sm:inline">Tracks</span>
	</Button>

	<!-- Note editor toggle, kept at the top level for one-tap access -->
	<Button
		variant="outline"
		size="sm"
		class={cn('h-9 shrink-0', store.editMode && 'sunk')}
		title="Toggle note editor"
		aria-pressed={store.editMode}
		onclick={() => (store.editMode = !store.editMode)}
	>
		<PencilSimple class="size-4" />
		<span class="hidden sm:inline">{store.editMode ? 'Editing' : 'Edit notes'}</span>
	</Button>

	<div class="bg-border mx-1 h-6 w-px shrink-0"></div>

	<!-- Transport: Play, Pause, Stop and Back-to-start stuck together as one
	     control (rounded only on the outer ends). Play and Pause are separate
	     buttons, each sinking while its state is active, so it's always clear
	     whether playback is running or paused. Play always starts from the
	     cursor, so navigating while paused and pressing Play resumes exactly
	     there. Stop drops the cursor back to bar 1 without scrolling;
	     Back-to-start rewinds to bar 1 and scrolls the score there. -->
	<div class="flex shrink-0 items-stretch">
		<Button
			variant="outline"
			size="icon"
			class={cn('size-9 rounded-r-none', store.isPlaying && 'sunk')}
			title="Play (Space)"
			aria-label="Play"
			aria-pressed={store.isPlaying}
			onclick={play}
		>
			<Play class="size-5" weight="fill" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class={cn('size-9 rounded-none border-l-0', store.isPaused && 'sunk')}
			title="Pause (Space)"
			aria-label="Pause"
			aria-pressed={store.isPaused}
			onclick={pausePlayback}
		>
			<Pause class="size-5" weight="fill" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-9 rounded-none border-l-0"
			title="Stop"
			aria-label="Stop"
			onclick={stopPlayback}
		>
			<Stop class="size-5" weight="fill" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-9 rounded-l-none border-l-0"
			title="Back to the beginning"
			aria-label="Back to the beginning"
			onclick={goToStart}
		>
			<SkipBack class="size-5" weight="fill" />
		</Button>
	</div>

	<!-- Loop stays a standalone control, not part of the transport group. -->
	<Button
		variant="outline"
		size="icon"
		class={cn(
			'size-9 shrink-0',
			store.loopEnabled && 'sunk',
			store.selection && !store.loopEnabled && 'border-foreground'
		)}
		title="Loop selection"
		aria-label="Toggle loop"
		aria-pressed={store.loopEnabled}
		onclick={() => (store.loopEnabled = !store.loopEnabled)}
	>
		<Repeat class="size-5" />
	</Button>
	<!-- Metronome + count-in + tempo: one split control. The metronome is the
	     rounded-left half, BPM the rounded-right half, with the count-in toggle
	     joined in the middle so they read as a single button cut into thirds. -->
	<div class="flex shrink-0 items-stretch">
		<Button
			variant="outline"
			size="icon"
			class={cn('size-9 rounded-r-none', store.metronomeOn && 'sunk')}
			title="Metronome"
			aria-label="Toggle metronome"
			aria-pressed={store.metronomeOn}
			onclick={() => (store.metronomeOn = !store.metronomeOn)}
		>
			<Metronome class="size-5" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class={cn('size-9 rounded-none border-l-0', store.countInOn && 'sunk')}
			title="Count-in (one bar of clicks before play)"
			aria-label="Toggle count-in"
			aria-pressed={store.countInOn}
			onclick={() => (store.countInOn = !store.countInOn)}
		>
			<ClockCountdown class="size-5" />
		</Button>
		<Button
			variant="outline"
			size="sm"
			class="h-9 rounded-l-none border-l-0 tabular-nums"
			title="Tempo"
			aria-label="Open tempo settings"
			onclick={() => (tempoOpen = true)}
		>
			{store.score.tempo}<span class="text-muted-foreground text-[10px] font-semibold">bpm</span>
		</Button>
	</div>

	<Button
		variant="ghost"
		size="icon"
		class="size-9 shrink-0"
		title="Song settings"
		aria-label="Song settings"
		onclick={() => (store.songModalOpen = true)}
	>
		<GearSix class="size-5" />
	</Button>
</div>

<OmniCommand bind:open={omniOpen} />
<AddRemoveDrawer bind:open={addRemoveOpen} />
<TempoDrawer bind:open={tempoOpen} />
