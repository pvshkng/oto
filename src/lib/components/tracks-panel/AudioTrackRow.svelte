<script lang="ts">
	// The audio backing track — always the top row of the tracks panel. It mirrors
	// a normal track's frozen controls column (name · M · S · volume) but swaps the
	// focus/eye button for a tools popover (tempo-match + pitch shift), and its
	// timeline area shows the imported file's waveform positioned along the same
	// bar grid as every MIDI track, so audio and MIDI can be lined up by eye.
	//
	// Positioning: the waveform is a clip on the song timeline. `offsetSec` is the
	// song-time where the clip's own start sits; drag it (desktop) or nudge it in
	// 250 ms steps with the carets (mobile) to sync it with the notation. A
	// negative offset slides the clip's head left of bar 1, where it's clipped
	// away — that's how you skip a long silent intro so the audio lines up with
	// where the transcription actually begins.

	import { store } from '$lib/stores/score.svelte';
	import { audio } from '$lib/audio/engine';
	import { audioTrack } from '$lib/audio/audio-track.svelte';
	import { cn } from '$lib/utils';
	import * as Popover from '$lib/components/ui/popover';
	import { MIXER_FADER_CLASS } from './mixer-fader';
	import SpeakerSimpleHigh from 'phosphor-svelte/lib/SpeakerSimpleHigh';
	import CaretLeft from 'phosphor-svelte/lib/CaretLeft';
	import CaretRight from 'phosphor-svelte/lib/CaretRight';
	import Waveform from 'phosphor-svelte/lib/Waveform';
	import ArrowClockwise from 'phosphor-svelte/lib/ArrowClockwise';

	let {
		lead,
		timelineW,
		cell
	}: {
		lead: number;
		timelineW: number;
		cell: number;
	} = $props();

	const cfg = $derived(store.audio!);

	// Pixels-per-song-second, derived from the same measure width (`cell`) the
	// MIDI rows use, so the waveform's bar positions match theirs exactly.
	const pxPerSec = $derived(cell / audioTrack.measureSeconds);
	const clipWidthPx = $derived(audioTrack.clipSeconds * pxPerSec);
	const clipLeftPx = $derived(cfg.offsetSec * pxPerSec);

	let waveEl = $state<HTMLDivElement>();

	// Mount / re-mount the waveform whenever the container appears (panel opened)
	// and a file is present. audioTrack keeps the file across mounts.
	$effect(() => {
		if (waveEl && audioTrack.hasFile) {
			void audioTrack.mount(waveEl);
			return () => audioTrack.unmount();
		}
	});

	// Keep gain live if solo/mute state changes elsewhere.
	$effect(() => {
		// touch the reactive deps
		void cfg.muted;
		void cfg.soloed;
		void cfg.volume;
		void store.score.tracks.map((t) => t.soloed);
		audioTrack.applyGain();
	});

	function setVolume(v: number) {
		store.setAudioVolume(v);
		audioTrack.applyGain();
	}
	function toggleMute() {
		store.toggleAudioMute();
		audioTrack.applyGain();
	}
	function toggleSolo() {
		store.toggleAudioSolo();
		audioTrack.applyGain();
		// Audio solo silences the MIDI voices — re-push channel state.
		audio.syncAllTracks(store.score.tracks);
	}

	function setPitch(semis: number) {
		store.updateAudio({ pitchSemitones: Math.max(-12, Math.min(12, semis)) });
		audioTrack.applyPitch();
	}

	// ---- desktop drag-to-reposition ----------------------------------------
	let dragging = $state(false);
	function onWavePointerDown(e: PointerEvent) {
		if (!store.isDesktop) return;
		e.preventDefault();
		dragging = true;
		const startX = e.clientX;
		const startOffset = cfg.offsetSec;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		store.beginGesture();
		function move(ev: PointerEvent) {
			const dx = ev.clientX - startX;
			store.setAudioOffset(audioTrack.clampOffset(startOffset + dx / pxPerSec));
		}
		function up(ev: PointerEvent) {
			dragging = false;
			store.endGesture();
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			try {
				(e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
			} catch {
				/* ignore */
			}
		}
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	const NUDGE = 0.25; // seconds — one caret press
</script>

<div class="bg-muted/20 relative flex border-b">
	<!-- Frozen controls column -->
	<div
		class="bg-background/60 sticky left-0 z-10 flex shrink-0 flex-col gap-1.5 border-r px-2.5 py-2 backdrop-blur-md"
		style="width:{lead}px;border-left:3px solid var(--primary)"
	>
		<div class="flex items-center gap-2">
			<div class="flex min-w-0 flex-1 items-stretch">
				<!-- Tools (tempo + pitch) — replaces the eye/focus button -->
				<Popover.Root>
					<Popover.Trigger
						class="text-muted-foreground hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-l-md rounded-r-none border [background-image:none!important]"
						title="Audio tempo & pitch tools"
						aria-label="Audio tempo and pitch tools"
					>
						<Waveform class="size-3.5" />
					</Popover.Trigger>
					<Popover.Content side="top" align="start" class="w-64 space-y-3 p-3 text-[12px]">
						<!-- Tempo match -->
						<div class="space-y-1.5">
							<div class="flex items-center justify-between">
								<span class="font-semibold">Tempo</span>
								<label class="flex items-center gap-1.5">
									<input
										type="checkbox"
										checked={cfg.matchTempo}
										disabled={!cfg.sourceTempo}
										onchange={(e) => store.updateAudio({ matchTempo: e.currentTarget.checked })}
									/>
									<span class="text-muted-foreground">Match song ({store.score.tempo})</span>
								</label>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-muted-foreground w-20 shrink-0">Audio BPM</span>
								<input
									type="number"
									min="20"
									max="400"
									placeholder="—"
									value={cfg.sourceTempo ?? ''}
									class="bg-background w-20 rounded-md border px-2 py-1 tabular-nums"
									onchange={(e) => {
										const n = e.currentTarget.valueAsNumber;
										store.updateAudio({
											sourceTempo: isFinite(n) && n > 0 ? Math.max(20, Math.min(400, n)) : undefined
										});
									}}
								/>
							</div>
							<p class="text-muted-foreground text-[11px] leading-snug">
								Set the audio's own tempo, then Match to time-stretch it onto the song grid (pitch
								kept).
							</p>
						</div>
						<!-- Pitch shift -->
						<div class="space-y-1.5 border-t pt-2.5">
							<div class="flex items-center justify-between">
								<span class="font-semibold">Pitch</span>
								<span class="text-muted-foreground tabular-nums">
									{cfg.pitchSemitones > 0 ? '+' : ''}{cfg.pitchSemitones} st
								</span>
							</div>
							<div class="flex items-center gap-1">
								<button
									class="hover:bg-muted flex size-7 items-center justify-center rounded-md border [background-image:none!important]"
									title="Down a semitone"
									aria-label="Pitch down a semitone"
									onclick={() => setPitch(cfg.pitchSemitones - 1)}>−</button
								>
								<input
									type="range"
									min="-12"
									max="12"
									step="1"
									value={cfg.pitchSemitones}
									class={cn(MIXER_FADER_CLASS, 'min-w-0 flex-1')}
									aria-label="Pitch shift semitones"
									oninput={(e) => setPitch(e.currentTarget.valueAsNumber)}
								/>
								<button
									class="hover:bg-muted flex size-7 items-center justify-center rounded-md border [background-image:none!important]"
									title="Up a semitone"
									aria-label="Pitch up a semitone"
									onclick={() => setPitch(cfg.pitchSemitones + 1)}>+</button
								>
								<button
									class="text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-md border [background-image:none!important]"
									title="Reset pitch"
									aria-label="Reset pitch"
									onclick={() => setPitch(0)}><ArrowClockwise class="size-3.5" /></button
								>
							</div>
						</div>
					</Popover.Content>
				</Popover.Root>

				<!-- File name — read-only label, styled like the track-name button -->
				<div
					class="text-foreground flex h-7 min-w-0 flex-1 items-center gap-1.5 border border-l-0 bg-transparent px-2 text-[13px] font-semibold"
					title={cfg.fileName}
				>
					<span class="truncate">{cfg.name}</span>
				</div>

				<!-- Mute -->
				<button
					class={cn(
						'flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-l-0 text-[11px] font-bold',
						cfg.muted ? 'sunk text-foreground' : 'text-muted-foreground hover:text-foreground'
					)}
					title="Mute audio"
					aria-pressed={cfg.muted}
					onclick={toggleMute}>M</button
				>
				<!-- Solo -->
				<button
					class={cn(
						'flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-l-0 text-[11px] font-bold',
						cfg.soloed ? 'sunk text-foreground' : 'text-muted-foreground hover:text-foreground'
					)}
					title="Solo audio"
					aria-pressed={cfg.soloed}
					onclick={toggleSolo}>S</button
				>
				<!-- Volume -->
				<Popover.Root>
					<Popover.Trigger
						class="text-muted-foreground hover:text-foreground flex h-7 shrink-0 items-center gap-1 rounded-l-none rounded-r-md border border-l-0 px-1.5 text-[11px] tabular-nums"
						title={`Audio volume: ${Math.round(cfg.volume * 100)}%`}
						aria-label="Audio volume"
					>
						<SpeakerSimpleHigh class="size-3.5" />
						{Math.round(cfg.volume * 100)}%
					</Popover.Trigger>
					<Popover.Content side="top" align="end" class="w-44 p-1.5">
						<div class="flex items-center gap-2">
							<SpeakerSimpleHigh class="text-muted-foreground size-3.5 shrink-0" />
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								aria-label="Audio volume"
								class={cn(MIXER_FADER_CLASS, 'min-w-0 flex-1')}
								value={cfg.volume}
								onpointerdown={() => store.beginGesture()}
								onpointerup={() => store.endGesture()}
								onpointercancel={() => store.endGesture()}
								oninput={(e) => setVolume(e.currentTarget.valueAsNumber)}
							/>
							<span class="text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums"
								>{Math.round(cfg.volume * 100)}%</span
							>
						</div>
					</Popover.Content>
				</Popover.Root>
			</div>
		</div>
	</div>

	<!-- Timeline area: the waveform clip, aligned to the bar grid. Height comes
	     from the controls column (flex-stretch), so the row matches a MIDI track
	     exactly; the waveform fills that height and never overflows or scrolls.
	     Overflow stays visible so the mobile carets (a sticky flow child) resolve
	     against the panel's scroll container. -->
	<div class="relative flex shrink-0 items-center" style="width:{timelineW}px">
		{#if audioTrack.needsFile}
			<!-- Config restored from the .oto file but the audio itself isn't saved —
			     prompt to re-add the same file to realign. -->
			<button
				class="text-muted-foreground hover:text-foreground absolute inset-y-0 left-0 flex items-center gap-2 px-3 text-[12px] [background-image:none!important]"
				onclick={() => audioTrack.promptImport()}
			>
				<ArrowClockwise class="size-4" />
				Re-add “{cfg.fileName}” to restore the audio
			</button>
		{:else}
			<!-- Clip mask: clips the waveform head at the song-start line when the
			     clip is dragged to a negative offset (intro pushed off the left). -->
			<div class="absolute inset-0 overflow-hidden">
				<!-- The clip: absolutely positioned by offset -->
				<div
					class={cn(
						'absolute inset-y-1',
						store.isDesktop && 'cursor-ew-resize',
						dragging && 'opacity-80'
					)}
					style="left:{clipLeftPx}px;width:{Math.max(8, clipWidthPx)}px"
					onpointerdown={onWavePointerDown}
					role="presentation"
					title={store.isDesktop ? 'Drag to sync with the notation' : undefined}
				>
					<div bind:this={waveEl} class="h-full w-full"></div>
				</div>
			</div>

			{#if !audioTrack.ready && audioTrack.loading}
				<div class="text-muted-foreground absolute inset-0 flex items-center px-3 text-[12px]">
					Decoding waveform…
				</div>
			{/if}

			<!-- Mobile: nudge carets, laid over the waveform. As a sticky flow child
			     they stay pinned just past the frozen controls column no matter how
			     far the timeline is scrolled, so they're always reachable. Tap a
			     caret to shift the audio ∓250 ms to line it up with the notation. -->
			{#if !store.isDesktop && audioTrack.ready}
				<div class="sticky z-20 flex shrink-0 items-center gap-2 pl-2" style="left:{lead}px">
					<button
						class="bg-background/90 text-foreground flex size-9 touch-manipulation items-center justify-center rounded-full border shadow-sm active:scale-95 [background-image:none!important]"
						title="Move audio earlier (−250 ms)"
						aria-label="Move audio earlier by 250 milliseconds"
						onclick={() => audioTrack.nudge(-NUDGE)}
					>
						<CaretLeft class="size-4" weight="bold" />
					</button>
					<button
						class="bg-background/90 text-foreground flex size-9 touch-manipulation items-center justify-center rounded-full border shadow-sm active:scale-95 [background-image:none!important]"
						title="Move audio later (+250 ms)"
						aria-label="Move audio later by 250 milliseconds"
						onclick={() => audioTrack.nudge(NUDGE)}
					>
						<CaretRight class="size-4" weight="bold" />
					</button>
				</div>
			{/if}
		{/if}
	</div>
</div>
