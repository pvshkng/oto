<script lang="ts">
	// Bottom control bar. A minimal, horizontally scrollable strip: an omni
	// command button (dots) opens the command palette, a File combobox and
	// direct undo/redo/add-remove controls replace the old File/Edit dropdown
	// menus (dropdowns don't work well on touch), the note-editor toggle sits
	// at the top level, and the transport / metronome / loop / tempo controls
	// follow.

	import { store } from '$lib/stores/score.svelte';
	import { togglePlayback, stopPlayback, goToStart } from '$lib/audio/playback';
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
	class="bg-background flex items-center gap-1.5 overflow-x-auto border-t px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

	<!-- Undo / redo, promoted out of the old Edit dropdown -->
	<Button
		variant="outline"
		size="icon"
		class="size-9 shrink-0"
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
		class="size-9 shrink-0"
		title="Redo"
		aria-label="Redo"
		disabled={!store.canRedo}
		onclick={() => store.redo()}
	>
		<ArrowClockwise class="size-4" />
	</Button>

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

	<!-- Track mixer: levels, pan, EQ, arrangement and section markers -->
	<Button
		variant={store.mixerOpen ? 'default' : 'outline'}
		size="sm"
		class="h-9 shrink-0"
		title="Tracks"
		aria-label="Open track mixer"
		onclick={() => (store.mixerOpen = !store.mixerOpen)}
	>
		<Sliders class="size-4" />
		<span class="hidden sm:inline">Tracks</span>
	</Button>

	<!-- Note editor toggle, kept at the top level for one-tap access -->
	<Button
		variant={store.editMode ? 'default' : 'outline'}
		size="sm"
		class="h-9 shrink-0"
		title="Toggle note editor"
		onclick={() => (store.editMode = !store.editMode)}
	>
		<PencilSimple class="size-4" />
		<span class="hidden sm:inline">{store.editMode ? 'Editing' : 'Edit notes'}</span>
	</Button>

	<div class="bg-border mx-1 h-6 w-px shrink-0"></div>

	<!-- Transport -->
	<Button
		size="icon"
		class={cn('size-9 shrink-0', store.isPlaying && 'bg-primary/80')}
		title="Play / Stop (Space)"
		aria-label="Play or stop"
		onclick={togglePlayback}
	>
		{#if store.isPlaying}<Pause class="size-5" weight="fill" />{:else}<Play
				class="size-5"
				weight="fill"
			/>{/if}
	</Button>
	<Button
		variant="outline"
		size="icon"
		class="size-9 shrink-0"
		title="Stop"
		aria-label="Stop"
		onclick={stopPlayback}
	>
		<Stop class="size-5" weight="fill" />
	</Button>
	<Button
		variant="outline"
		size="icon"
		class="size-9 shrink-0"
		title="Back to the beginning"
		aria-label="Back to the beginning"
		onclick={goToStart}
	>
		<SkipBack class="size-5" weight="fill" />
	</Button>
	<Button
		variant={store.loopEnabled ? 'default' : 'outline'}
		size="icon"
		class={cn('size-9 shrink-0', store.selection && !store.loopEnabled && 'border-foreground')}
		title="Loop selection"
		aria-label="Toggle loop"
		onclick={() => (store.loopEnabled = !store.loopEnabled)}
	>
		<Repeat class="size-5" />
	</Button>
	<Button
		variant={store.metronomeOn ? 'default' : 'outline'}
		size="icon"
		class="size-9 shrink-0"
		title="Metronome"
		aria-label="Toggle metronome"
		onclick={() => (store.metronomeOn = !store.metronomeOn)}
	>
		<Metronome class="size-5" />
	</Button>

	<!-- Tempo, opens the BPM drawer -->
	<Button
		variant="outline"
		size="sm"
		class="h-9 shrink-0 tabular-nums"
		title="Tempo"
		aria-label="Open tempo settings"
		onclick={() => (tempoOpen = true)}
	>
		{store.score.tempo}<span class="text-muted-foreground text-[10px] font-semibold">bpm</span>
	</Button>

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
