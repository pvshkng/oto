<script lang="ts">
	// Bottom control bar. Horizontally scrollable strip with all top-level
	// controls. On desktop (≥1024 px) the edit-notes button expands to a 4-part
	// joined control (Edit Note | Keypad | Fretboard | Piano), the Tracks toggle
	// is hidden (TracksPanel is always visible), and Tempo/Song/Add-Remove open a
	// right panel instead of a bottom drawer.

	import { store } from '$lib/stores/score.svelte';
	import { play, pausePlayback, stopPlayback, goToStart } from '$lib/audio/playback';
	import { audio } from '$lib/audio/engine';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { MIXER_FADER_CLASS } from './tracks-panel/mixer-fader';
	import { cn } from '$lib/utils';
	import OmniCommand from './OmniCommand.svelte';
	import AddRemoveDrawer from './AddRemoveDrawer.svelte';
	import TempoDrawer from './TempoDrawer.svelte';
	import TuningFork from './icons/TuningFork.svelte';

	import DotsThreeVertical from 'phosphor-svelte/lib/DotsThreeVertical';
	import Play from 'phosphor-svelte/lib/Play';
	import Pause from 'phosphor-svelte/lib/Pause';
	import Stop from 'phosphor-svelte/lib/Stop';
	import SkipBack from 'phosphor-svelte/lib/SkipBack';
	import Metronome from 'phosphor-svelte/lib/Metronome';
	import Speedometer from 'phosphor-svelte/lib/Speedometer';
	import ClockCountdown from 'phosphor-svelte/lib/ClockCountdown';
	import Repeat from 'phosphor-svelte/lib/Repeat';
	import PencilSimple from 'phosphor-svelte/lib/PencilSimple';
	import Numpad from 'phosphor-svelte/lib/Numpad';
	import Guitar from 'phosphor-svelte/lib/Guitar';
	import PianoKeys from 'phosphor-svelte/lib/PianoKeys';
	import Sliders from 'phosphor-svelte/lib/Sliders';
	import GearSix from 'phosphor-svelte/lib/GearSix';
	import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
	import ArrowClockwise from 'phosphor-svelte/lib/ArrowClockwise';

	let omniOpen = $state(false);

	// Desktop edit tool buttons: pressing a tool button while it's active toggles
	// the key-input strip off; pressing an inactive one opens the strip on that tool.
	function toggleKeyTool(tool: 'keypad' | 'fretboard' | 'piano') {
		if (store.editTool === tool && store.keyInputOpen) {
			store.keyInputOpen = false;
		} else {
			store.editTool = tool;
			store.openPanel('keys');
		}
	}

	// Desktop detail-panel toggles — independent, so opening one leaves the others
	// open; clicking an already-open panel closes it.
	function toggleTempo() {
		store.togglePanel('tempo');
	}

	// Playback speed: the toggle switches the multiplier on/off and the slider
	// adjusts it; both apply to the synth immediately, even mid-playback.
	function setSpeedOn(v: boolean) {
		store.playbackSpeedOn = v;
		audio.setPlaybackSpeed(store.effectivePlaybackSpeed);
	}
	function setSpeed(v: number) {
		store.playbackSpeed = v;
		audio.setPlaybackSpeed(store.effectivePlaybackSpeed);
	}
</script>

<div
	class="bg-background/50 relative z-[2] flex items-center gap-1.5 overflow-x-auto border-t px-2 py-1.5 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

	<!-- Undo / redo -->
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

	<!-- Cut / Copy / Paste
	<div class="flex shrink-0 items-stretch">
		<Button
			variant="outline"
			size="icon"
			class="size-9 rounded-r-none"
			title="Cut"
			aria-label="Cut"
			onclick={() => store.cutSelection()}
		>
			<Scissors class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-9 rounded-none border-l-0"
			title="Copy"
			aria-label="Copy"
			onclick={() => store.copySelection()}
		>
			<Copy class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-9 rounded-l-none border-l-0"
			title="Paste"
			aria-label="Paste"
			disabled={!store.clipboard}
			onclick={() => store.pasteClipboard()}
		>
			<ClipboardText class="size-4" />
		</Button>
	</div>
	-->

	<!-- Add / remove: drawer on mobile, right-panel toggle on desktop
	<Button
		variant="outline"
		size="icon"
		class={cn('size-9 shrink-0', store.isDesktop && store.addRemoveOpen && 'sunk')}
		title="Add or remove"
		aria-label="Add or remove bars and tracks"
		aria-pressed={store.isDesktop ? store.addRemoveOpen : undefined}
		onclick={() => (store.isDesktop ? toggleAddRemove() : (store.addRemoveOpen = true))}
	>
		<PlusMinus class="size-4" />
	</Button>
	-->

	<!-- Track mixer toggle -->
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

	<!-- Edit controls:
	     Mobile: single Edit Notes toggle (opens bottom dock EditPanel)
	     Desktop: 4-part joined control — Edit Note (left panel) | Keypad | Fretboard | Piano -->
	{#if store.isDesktop}
		<div class="flex shrink-0 items-stretch">
			<Button
				variant="outline"
				size="sm"
				class={cn('h-9 rounded-r-none', store.editMode && 'sunk')}
				title="Note properties panel"
				aria-label="Toggle note properties"
				aria-pressed={store.editMode}
				onclick={() => store.togglePanel('note')}
			>
				<PencilSimple class="size-4" />
				<span class="hidden sm:inline">Note</span>
			</Button>
			<Button
				variant="outline"
				size="icon"
				class={cn(
					'size-9 rounded-none border-l-0',
					store.keyInputOpen && store.editTool === 'keypad' && 'sunk'
				)}
				title="Keypad"
				aria-label="Keypad input"
				aria-pressed={store.keyInputOpen && store.editTool === 'keypad'}
				onclick={() => toggleKeyTool('keypad')}
			>
				<Numpad class="size-4" />
			</Button>
			<Button
				variant="outline"
				size="icon"
				class={cn(
					'size-9 rounded-none border-l-0',
					store.keyInputOpen && store.editTool === 'fretboard' && 'sunk'
				)}
				title="Fretboard"
				aria-label="Fretboard input"
				aria-pressed={store.keyInputOpen && store.editTool === 'fretboard'}
				onclick={() => toggleKeyTool('fretboard')}
			>
				<Guitar class="size-4" />
			</Button>
			<Button
				variant="outline"
				size="icon"
				class={cn(
					'size-9 rounded-l-none border-l-0',
					store.keyInputOpen && store.editTool === 'piano' && 'sunk'
				)}
				title="Piano keys"
				aria-label="Piano key input"
				aria-pressed={store.keyInputOpen && store.editTool === 'piano'}
				onclick={() => toggleKeyTool('piano')}
			>
				<PianoKeys class="size-4" />
			</Button>
		</div>
	{:else}
		<Button
			variant="outline"
			size="sm"
			class={cn('h-9 shrink-0', store.editMode && 'sunk')}
			title="Toggle note editor"
			aria-pressed={store.editMode}
			onclick={() => store.togglePanel('note')}
		>
			<PencilSimple class="size-4" />
			<span class="hidden sm:inline">{store.editMode ? 'Editing' : 'Edit notes'}</span>
		</Button>
	{/if}

	<div class="bg-border mx-1 h-6 w-px shrink-0"></div>

	<!-- Transport -->
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

	<!-- Loop -->
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

	<!-- Metronome + count-in + tempo -->
	<div class="flex shrink-0 items-stretch">
		<Button
			variant="outline"
			size="icon"
			class={cn('size-9 rounded-r-none', store.metronomeOn && 'sunk')}
			title="Metronome"
			aria-label="Toggle metronome"
			aria-pressed={store.metronomeOn}
			onclick={() => {
				store.metronomeOn = !store.metronomeOn;
				// Apply immediately, even mid-playback, instead of waiting for the next play().
				audio.setMetronomeEnabled(store.metronomeOn);
			}}
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
			class={cn(
				'h-9 rounded-l-none border-l-0 tabular-nums',
				store.isDesktop && store.tempoOpen && 'sunk'
			)}
			title="Tempo"
			aria-label="Open tempo settings"
			aria-pressed={store.isDesktop ? store.tempoOpen : undefined}
			onclick={() => (store.isDesktop ? toggleTempo() : (store.tempoOpen = true))}
		>
			{store.score.tempo}<span class="text-muted-foreground text-[10px] font-semibold">bpm</span>
		</Button>
	</div>

	<!-- Chromatic tuner: floating window on desktop, modal on mobile -->
	<Button
		variant="outline"
		size="icon"
		class={cn('size-9 shrink-0', store.tunerOpen && 'sunk')}
		title="Chromatic tuner"
		aria-label="Toggle chromatic tuner"
		aria-pressed={store.tunerOpen}
		onclick={() => store.togglePanel('tuner')}
	>
		<TuningFork class="size-5" />
	</Button>

	<!-- Playback speed: standalone button showing icon + multiplier, sunk while
	     active. Clicking always opens the popover (toggling off happens inside
	     it, so a press never accidentally disables the speed override). -->
	<Popover.Root>
		<Popover.Trigger
			class={cn(
				buttonVariants({ variant: 'outline', size: 'sm' }),
				'h-9 shrink-0 gap-1 px-2 tabular-nums',
				store.playbackSpeedOn && 'sunk'
			)}
			title="Playback speed"
			aria-label="Playback speed"
			aria-pressed={store.playbackSpeedOn}
		>
			<Speedometer class="size-5" />
			{Math.round(store.playbackSpeed * 100)}%
		</Popover.Trigger>
		<Popover.Content side="top" align="center" class="w-60 p-3">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-xs font-semibold">Playback speed</span>
				<button
					class={cn(
						'rounded-md border px-2 py-0.5 text-[11px] font-semibold [background-image:none!important]',
						store.playbackSpeedOn
							? 'sunk text-foreground'
							: 'text-muted-foreground hover:text-foreground'
					)}
					title={store.playbackSpeedOn ? 'Disable speed override' : 'Enable speed override'}
					aria-pressed={store.playbackSpeedOn}
					onclick={() => setSpeedOn(!store.playbackSpeedOn)}
				>
					{store.playbackSpeedOn ? 'On' : 'Off'}
				</button>
			</div>
			<div class="flex items-center gap-2">
				<input
					type="range"
					min="0.5"
					max="1.5"
					step="0.05"
					aria-label="Playback speed"
					title="Playback speed"
					class={cn(MIXER_FADER_CLASS, 'min-w-0 flex-1')}
					value={store.playbackSpeed}
					aria-valuetext={`${Math.round(store.playbackSpeed * 100)} percent`}
					oninput={(e) => setSpeed(e.currentTarget.valueAsNumber)}
				/>
				<span class="text-muted-foreground w-10 shrink-0 text-right text-[11px] tabular-nums"
					>{Math.round(store.playbackSpeed * 100)}%</span
				>
			</div>
		</Popover.Content>
	</Popover.Root>

	<!-- Settings pushed to the far right, split off from the song-control
	     buttons on the left (ml-auto opens the gap when there's room; the strip
	     still scrolls when the viewport is too narrow to fit everything). -->
	<Button
		variant="ghost"
		size="icon"
		class="ml-auto size-9 shrink-0"
		title="Settings"
		aria-label="Settings"
		onclick={() => (store.settingsOpen = true)}
	>
		<GearSix class="size-5" />
	</Button>
</div>

<OmniCommand bind:open={omniOpen} />
<!-- Mobile drawers — suppressed on desktop because RightPanel handles those. -->
{#if !store.isDesktop}
	<AddRemoveDrawer />
	<TempoDrawer />
{/if}
