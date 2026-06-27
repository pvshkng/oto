<script lang="ts">
	// Bottom control bar. A minimal, horizontally scrollable strip: an omni command
	// button (dots) opens the command palette, a compact Menubar holds File and
	// Edit (with Insert nested inside Edit), the note-editor toggle sits at the top
	// level, and the transport / metronome / loop / tempo controls follow.

	import { store } from '$lib/stores/score.svelte';
	import { togglePlayback, stopPlayback } from '$lib/audio/playback';
	import { downloadOto, openFile, exportPdf } from '$lib/io/files';
	import * as Menubar from '$lib/components/ui/menubar';
	import * as Popover from '$lib/components/ui/popover';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import OmniCommand from './OmniCommand.svelte';
	import TrackControlDrawer from './TrackControlDrawer.svelte';

	import DotsThreeVertical from 'phosphor-svelte/lib/DotsThreeVertical';
	import Play from 'phosphor-svelte/lib/Play';
	import Pause from 'phosphor-svelte/lib/Pause';
	import Stop from 'phosphor-svelte/lib/Stop';
	import Metronome from 'phosphor-svelte/lib/Metronome';
	import Repeat from 'phosphor-svelte/lib/Repeat';
	import PencilSimple from 'phosphor-svelte/lib/PencilSimple';
	import GearSix from 'phosphor-svelte/lib/GearSix';

	let omniOpen = $state(false);
	let addTrackOpen = $state(false);

	function confirmNew() {
		if (confirm('Start a new score? Your current one stays in the last save.')) store.newScore();
	}
	function open() {
		void openFile();
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

	<Menubar.Root class="h-9 shrink-0 gap-0.5 border-none bg-transparent p-0 shadow-none">
		<Menubar.Menu>
			<Menubar.Trigger>File</Menubar.Trigger>
			<Menubar.Content side="top" align="start" sideOffset={8}>
				<Menubar.Item onSelect={confirmNew}>New</Menubar.Item>
				<Menubar.Item onSelect={open}>Open / Import</Menubar.Item>
				<Menubar.Separator />
				<Menubar.Item onSelect={() => downloadOto()}>Save .oto</Menubar.Item>
				<Menubar.Item onSelect={() => exportPdf()}>Export PDF</Menubar.Item>
			</Menubar.Content>
		</Menubar.Menu>

		<Menubar.Menu>
			<Menubar.Trigger>Edit</Menubar.Trigger>
			<Menubar.Content side="top" align="start" sideOffset={8}>
				<Menubar.Item onSelect={() => store.undo()}>Undo</Menubar.Item>
				<Menubar.Item onSelect={() => store.redo()}>Redo</Menubar.Item>
				<Menubar.Separator />
				<Menubar.Sub>
					<Menubar.SubTrigger>Insert</Menubar.SubTrigger>
					<Menubar.SubContent>
						<Menubar.Item onSelect={() => store.addMeasureToAll()}>Add bar</Menubar.Item>
						<Menubar.Item onSelect={() => store.insertMeasureAt(store.cursor.measure)}>
							Insert bar at cursor
						</Menubar.Item>
						<Menubar.Item onSelect={() => store.duplicateMeasureAt(store.cursor.measure)}>
							Duplicate current bar
						</Menubar.Item>
						<Menubar.Separator />
						<Menubar.Item onSelect={() => (addTrackOpen = true)}>Add track</Menubar.Item>
					</Menubar.SubContent>
				</Menubar.Sub>
			</Menubar.Content>
		</Menubar.Menu>
	</Menubar.Root>

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
		variant={store.metronomeOn ? 'default' : 'outline'}
		size="icon"
		class="size-9 shrink-0"
		title="Metronome"
		aria-label="Toggle metronome"
		onclick={() => (store.metronomeOn = !store.metronomeOn)}
	>
		<Metronome class="size-5" />
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

	<!-- Tempo -->
	<Popover.Root>
		<Popover.Trigger
			class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-9 shrink-0 tabular-nums')}
		>
			{store.score.tempo}<span class="text-muted-foreground text-[10px] font-semibold">bpm</span>
		</Popover.Trigger>
		<Popover.Content side="top" class="w-56">
			<div class="flex flex-col gap-2">
				<span class="text-sm font-semibold">{store.score.tempo} BPM</span>
				<input
					type="range"
					min="40"
					max="240"
					class="accent-primary w-full"
					value={store.score.tempo}
					oninput={(e) => store.setTempo(+e.currentTarget.value)}
				/>
			</div>
		</Popover.Content>
	</Popover.Root>

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
<TrackControlDrawer bind:open={addTrackOpen} mode="add" />
