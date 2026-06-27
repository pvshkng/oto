<script lang="ts">
	// Context-aware command palette. Lists every editor action (transport, edit,
	// note, bar, file) from the shared commands module, so it mirrors the staff
	// context menu. Opens from the bottom menubar dots button or Cmd/Ctrl+K.

	import * as Command from '$lib/components/ui/command';
	import * as Dialog from '$lib/components/ui/dialog';
	import { allCommandGroups } from '$lib/commands';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	// Re-read the (reactive) command groups whenever the palette is open.
	const groups = $derived(open ? allCommandGroups() : []);

	function runAndClose(run: () => void) {
		run();
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="overflow-hidden p-0" showCloseButton={false}>
		<Dialog.Title class="sr-only">Command palette</Dialog.Title>
		<Dialog.Description class="sr-only">Search and run any editor action</Dialog.Description>
		<Command.Root class="[&_[data-command-group-heading]]:px-2">
			<Command.Input placeholder="Type a command or search..." />
			<Command.List>
				<Command.Empty>No results found.</Command.Empty>
				{#each groups as group (group.heading)}
					<Command.Group heading={group.heading}>
						{#each group.items as cmd (cmd.id)}
							{@const Icon = cmd.icon}
							<Command.Item
								value={`${group.heading} ${cmd.label} ${cmd.keywords ?? ''}`}
								disabled={cmd.disabled}
								onSelect={() => runAndClose(cmd.run)}
							>
								{#if Icon}<Icon class="size-4" />{/if}
								<span>{cmd.label}</span>
								{#if cmd.active}<span class="ml-auto text-xs">●</span>{/if}
							</Command.Item>
						{/each}
					</Command.Group>
				{/each}
			</Command.List>
		</Command.Root>
	</Dialog.Content>
</Dialog.Root>
