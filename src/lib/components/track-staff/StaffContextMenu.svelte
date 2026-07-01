<script lang="ts">
	import { store } from '$lib/stores/score.svelte';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as Kbd from '$lib/components/ui/kbd';
	import { DURATION_ORDER } from '$lib/oto/duration';
	import {
		DURATION_LABELS,
		TECHNIQUE_LABELS,
		type DurationValue,
		type OtoNote,
		type OtoTrack
	} from '$lib/oto/types';
	import Scissors from 'phosphor-svelte/lib/Scissors';
	import Copy from 'phosphor-svelte/lib/Copy';
	import ClipboardText from 'phosphor-svelte/lib/ClipboardText';
	import {
		EFFECT_LIST,
		TIME_SIGS,
		setDuration,
		toggleDotted,
		setBarTimeSig,
		hasTech
	} from '$lib/commands';

	let {
		ctxOpen = $bindable(false),
		ctxNote,
		track
	}: {
		ctxOpen?: boolean;
		ctxNote: OtoNote | null;
		track: OtoTrack;
	} = $props();

	const DUR_GLYPHS: Record<DurationValue, string> = {
		1: '𝅝',
		2: '𝅗𝅥',
		4: '♩',
		8: '♪',
		16: '𝅘𝅥𝅯',
		32: '𝅘𝅥𝅰'
	};

	const CTX_ICON_BTN =
		'flex items-center justify-center w-[30px] h-[30px] rounded-[6px] border-none bg-transparent [background-image:none!important] text-muted-foreground cursor-pointer [transform:none!important] hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed';
</script>

<ContextMenu.Content class="w-56">
	<!-- Cut / Copy / Paste as compact icon row -->
	<div class="mb-0.5 flex items-center gap-0.5 pt-1 pb-1.5 px-1.5">
		<button
			class={CTX_ICON_BTN}
			title="Cut (Ctrl+X)"
			onclick={() => {
				store.cutSelection();
				ctxOpen = false;
			}}><Scissors class="size-4" /></button
		>
		<button
			class={CTX_ICON_BTN}
			title="Copy (Ctrl+C)"
			onclick={() => {
				store.copySelection();
				ctxOpen = false;
			}}><Copy class="size-4" /></button
		>
		<button
			class={CTX_ICON_BTN}
			disabled={!store.clipboard}
			title="Paste (Ctrl+V)"
			onclick={() => {
				store.pasteClipboard();
				ctxOpen = false;
			}}><ClipboardText class="size-4" /></button
		>
	</div>

	<ContextMenu.Separator />

	<ContextMenu.Sub>
		<ContextMenu.SubTrigger>Note</ContextMenu.SubTrigger>
		<ContextMenu.SubContent class="w-44">
			{#each DURATION_ORDER as d (d)}
				<ContextMenu.Item onSelect={() => setDuration(d)}>
					<span class="w-4 text-center text-base leading-none">{DUR_GLYPHS[d]}</span>
					<span>{DURATION_LABELS[d]}</span>
					{#if store.activeDuration === d}<span class="ml-auto">●</span>{/if}
				</ContextMenu.Item>
			{/each}
			<ContextMenu.Separator />
			<ContextMenu.Item onSelect={toggleDotted}>
				Dotted
				<Kbd.Root class="ml-auto">.</Kbd.Root>
				{#if store.activeDotted}<span class="ml-1">●</span>{/if}
			</ContextMenu.Item>
			<ContextMenu.Separator />
			<ContextMenu.Sub>
				<ContextMenu.SubTrigger>Effects</ContextMenu.SubTrigger>
				<ContextMenu.SubContent class="w-48">
					{#each EFFECT_LIST as t (t)}
						<ContextMenu.Item
							onSelect={() => store.toggleTechnique(t)}
							disabled={t !== 'dead' && !ctxNote}
						>
							<span>{TECHNIQUE_LABELS[t]}</span>
							{#if hasTech(t)}<span class="ml-auto">●</span>{/if}
						</ContextMenu.Item>
					{/each}
				</ContextMenu.SubContent>
			</ContextMenu.Sub>
		</ContextMenu.SubContent>
	</ContextMenu.Sub>

	<ContextMenu.Item
		disabled={!ctxNote && !store.selection && !store.hasNoteSelection}
		variant="destructive"
		onSelect={() => (store.selection ? store.deleteNotesInSelection() : store.deleteNoteAtCursor())}
	>
		{store.selection || (store.noteSelection?.strings.size ?? 0) > 1
			? 'Delete notes'
			: 'Delete note'}
		<Kbd.Root class="ml-auto">Del</Kbd.Root>
	</ContextMenu.Item>

	<ContextMenu.Separator />

	{#if store.markStartPending}
		<ContextMenu.Item onSelect={() => store.completeMarkEnd()}>
			Mark end
			<Kbd.Root class="ml-auto">]</Kbd.Root>
		</ContextMenu.Item>
	{:else}
		<ContextMenu.Item onSelect={() => store.beginMarkStart()}>
			Mark start
			<Kbd.Root class="ml-auto">[</Kbd.Root>
		</ContextMenu.Item>
	{/if}
	<ContextMenu.Item
		disabled={!store.selection && !store.markStartPending}
		onSelect={() => store.clearSelection()}
	>
		Deselect
		<Kbd.Group class="ml-auto"><Kbd.Root>Ctrl</Kbd.Root><Kbd.Root>D</Kbd.Root></Kbd.Group>
	</ContextMenu.Item>

	<ContextMenu.Separator />

	<ContextMenu.Sub>
		<ContextMenu.SubTrigger>Insert beat</ContextMenu.SubTrigger>
		<ContextMenu.SubContent class="w-48">
			<ContextMenu.Item onSelect={() => store.insertBeatBefore()}>
				Before
				<Kbd.Group class="ml-auto"><Kbd.Root>⇧</Kbd.Root><Kbd.Root>↵</Kbd.Root></Kbd.Group>
			</ContextMenu.Item>
			<ContextMenu.Item onSelect={() => store.insertBeat()}>
				After
				<Kbd.Root class="ml-auto">↵</Kbd.Root>
			</ContextMenu.Item>
		</ContextMenu.SubContent>
	</ContextMenu.Sub>

	<ContextMenu.Separator />

	<ContextMenu.Sub>
		<ContextMenu.SubTrigger>Insert bar</ContextMenu.SubTrigger>
		<ContextMenu.SubContent class="w-52">
			<ContextMenu.Item onSelect={() => store.insertMeasureAt(store.cursor.measure)}>
				Before
				<Kbd.Group class="ml-auto"
					><Kbd.Root>Ctrl</Kbd.Root><Kbd.Root>⇧</Kbd.Root><Kbd.Root>↵</Kbd.Root></Kbd.Group
				>
			</ContextMenu.Item>
			<ContextMenu.Item onSelect={() => store.insertMeasureAt(store.cursor.measure + 1)}>
				After
				<Kbd.Group class="ml-auto"><Kbd.Root>Ctrl</Kbd.Root><Kbd.Root>↵</Kbd.Root></Kbd.Group>
			</ContextMenu.Item>
		</ContextMenu.SubContent>
	</ContextMenu.Sub>
	<ContextMenu.Item onSelect={() => store.duplicateMeasureAt(store.cursor.measure)}>
		Duplicate bar
		<Kbd.Group class="ml-auto"
			><Kbd.Root>Ctrl</Kbd.Root><Kbd.Root>⇧</Kbd.Root><Kbd.Root>D</Kbd.Root></Kbd.Group
		>
	</ContextMenu.Item>
	<ContextMenu.Item onSelect={() => store.clearMeasureAt(store.cursor.measure)}>
		Clear bar
	</ContextMenu.Item>
	<ContextMenu.Sub>
		<ContextMenu.SubTrigger>Time signature</ContextMenu.SubTrigger>
		<ContextMenu.SubContent class="w-32">
			{#each TIME_SIGS as ts (ts)}
				<ContextMenu.Item onSelect={() => setBarTimeSig(ts)}>{ts}</ContextMenu.Item>
			{/each}
		</ContextMenu.SubContent>
	</ContextMenu.Sub>
	<ContextMenu.Item
		variant="destructive"
		disabled={track.measures.length <= 1}
		onSelect={() => store.removeMeasureFromAll(store.cursor.measure)}
	>
		Delete bar
	</ContextMenu.Item>
</ContextMenu.Content>
