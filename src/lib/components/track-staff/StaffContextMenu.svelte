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
	import CaretLeft from 'phosphor-svelte/lib/CaretLeft';
	import CaretRight from 'phosphor-svelte/lib/CaretRight';
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

	// Mobile submenu navigation. Desktop uses bits-ui's Sub flyouts (a second
	// panel beside the first); on mobile a flyout would overflow the viewport,
	// so instead the SAME panel swaps to the submenu's item group, with a
	// "Back" row at the top to return to the parent group.
	type CtxView = 'root' | 'note' | 'effects' | 'insert-beat' | 'insert-bar' | 'timesig';
	let view = $state<CtxView>('root');
	// Every open starts back at the root group.
	$effect(() => {
		if (ctxOpen) view = 'root';
	});
</script>

<!-- Item groups shared between the desktop flyout submenus and the mobile
     in-panel submenu views, so both render exactly the same actions. -->
{#snippet noteItems()}
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
{/snippet}

{#snippet effectItems()}
	{#each EFFECT_LIST as t (t)}
		<ContextMenu.Item onSelect={() => store.toggleTechnique(t)} disabled={t !== 'dead' && !ctxNote}>
			<span>{TECHNIQUE_LABELS[t]}</span>
			{#if hasTech(t)}<span class="ml-auto">●</span>{/if}
		</ContextMenu.Item>
	{/each}
{/snippet}

{#snippet insertBeatItems()}
	<ContextMenu.Item onSelect={() => store.insertBeatBefore()}>
		Before
		<Kbd.Group class="ml-auto"><Kbd.Root>⇧</Kbd.Root><Kbd.Root>↵</Kbd.Root></Kbd.Group>
	</ContextMenu.Item>
	<ContextMenu.Item onSelect={() => store.insertBeat()}>
		After
		<Kbd.Root class="ml-auto">↵</Kbd.Root>
	</ContextMenu.Item>
{/snippet}

{#snippet insertBarItems()}
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
{/snippet}

{#snippet timeSigItems()}
	{#each TIME_SIGS as ts (ts)}
		<ContextMenu.Item onSelect={() => setBarTimeSig(ts)}>{ts}</ContextMenu.Item>
	{/each}
{/snippet}

<!-- Mobile pseudo sub-trigger: swaps the panel to the submenu's group instead
     of opening a flyout. closeOnSelect keeps the menu up through the swap. -->
{#snippet navRow(label: string, target: CtxView)}
	<ContextMenu.Item closeOnSelect={false} onSelect={() => (view = target)}>
		{label}
		<CaretRight class="text-muted-foreground ml-auto size-4" />
	</ContextMenu.Item>
{/snippet}

<!-- Mobile "Back" row at the top of a submenu view, returning to the parent. -->
{#snippet backRow(label: string, target: CtxView)}
	<ContextMenu.Item
		closeOnSelect={false}
		onSelect={() => (view = target)}
		class="text-muted-foreground font-medium"
	>
		<CaretLeft class="size-4" />
		Back
		<span class="ml-auto text-xs">{label}</span>
	</ContextMenu.Item>
	<ContextMenu.Separator />
{/snippet}

<ContextMenu.Content class="w-56">
	{#if !store.isDesktop && view !== 'root'}
		<!-- Mobile submenu views: same panel, swapped item group. -->
		{#if view === 'note'}
			{@render backRow('Note', 'root')}
			{@render noteItems()}
			<ContextMenu.Separator />
			{@render navRow('Effects', 'effects')}
		{:else if view === 'effects'}
			{@render backRow('Effects', 'note')}
			{@render effectItems()}
		{:else if view === 'insert-beat'}
			{@render backRow('Insert beat', 'root')}
			{@render insertBeatItems()}
		{:else if view === 'insert-bar'}
			{@render backRow('Insert bar', 'root')}
			{@render insertBarItems()}
		{:else if view === 'timesig'}
			{@render backRow('Time signature', 'root')}
			{@render timeSigItems()}
		{/if}
	{:else}
		<!-- Cut / Copy / Paste as compact icon row -->
		<div class="mb-0.5 flex items-center gap-0.5 px-1.5 pt-1 pb-1.5">
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

		{#if store.isDesktop}
			<ContextMenu.Sub>
				<ContextMenu.SubTrigger>Note</ContextMenu.SubTrigger>
				<ContextMenu.SubContent class="w-44">
					{@render noteItems()}
					<ContextMenu.Separator />
					<ContextMenu.Sub>
						<ContextMenu.SubTrigger>Effects</ContextMenu.SubTrigger>
						<ContextMenu.SubContent class="w-48">
							{@render effectItems()}
						</ContextMenu.SubContent>
					</ContextMenu.Sub>
				</ContextMenu.SubContent>
			</ContextMenu.Sub>
		{:else}
			{@render navRow('Note', 'note')}
		{/if}

		<ContextMenu.Item
			disabled={!ctxNote && !store.selection && !store.hasNoteSelection}
			variant="destructive"
			onSelect={() =>
				store.selection ? store.deleteNotesInSelection() : store.deleteNoteAtCursor()}
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

		{#if store.isDesktop}
			<ContextMenu.Sub>
				<ContextMenu.SubTrigger>Insert beat</ContextMenu.SubTrigger>
				<ContextMenu.SubContent class="w-48">
					{@render insertBeatItems()}
				</ContextMenu.SubContent>
			</ContextMenu.Sub>
		{:else}
			{@render navRow('Insert beat', 'insert-beat')}
		{/if}

		<ContextMenu.Separator />

		{#if store.isDesktop}
			<ContextMenu.Sub>
				<ContextMenu.SubTrigger>Insert bar</ContextMenu.SubTrigger>
				<ContextMenu.SubContent class="w-52">
					{@render insertBarItems()}
				</ContextMenu.SubContent>
			</ContextMenu.Sub>
		{:else}
			{@render navRow('Insert bar', 'insert-bar')}
		{/if}
		<ContextMenu.Item onSelect={() => store.duplicateMeasureAt(store.cursor.measure)}>
			Duplicate bar
			<Kbd.Group class="ml-auto"
				><Kbd.Root>Ctrl</Kbd.Root><Kbd.Root>⇧</Kbd.Root><Kbd.Root>D</Kbd.Root></Kbd.Group
			>
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => store.clearMeasureAt(store.cursor.measure)}>
			Clear bar
		</ContextMenu.Item>
		{#if store.isDesktop}
			<ContextMenu.Sub>
				<ContextMenu.SubTrigger>Time signature</ContextMenu.SubTrigger>
				<ContextMenu.SubContent class="w-32">
					{@render timeSigItems()}
				</ContextMenu.SubContent>
			</ContextMenu.Sub>
		{:else}
			{@render navRow('Time signature', 'timesig')}
		{/if}
		<ContextMenu.Item
			variant="destructive"
			disabled={track.measures.length <= 1}
			onSelect={() => store.removeMeasureFromAll(store.cursor.measure)}
		>
			Delete bar
		</ContextMenu.Item>
	{/if}
</ContextMenu.Content>
