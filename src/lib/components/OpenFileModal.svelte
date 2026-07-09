<script lang="ts">
	import { store } from '$lib/stores/score.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { buttonVariants } from '$lib/components/ui/button';
	import FolderOpen from 'phosphor-svelte/lib/FolderOpen';
	import FileText from 'phosphor-svelte/lib/FileText';
	import X from 'phosphor-svelte/lib/X';
	import { toast } from 'svelte-sonner';
	import { getRecentFiles, removeRecentFile, type RecentFile } from '$lib/io/recent-files';
	import { exampleFiles, type ExampleFile } from '$lib/io/examples';

	let recents = $state<RecentFile[]>([]);

	$effect(() => {
		if (store.openFileModalOpen) recents = getRecentFiles();
	});

	function confirmDiscard(): boolean {
		return confirm('Unsaved changes will be lost. Open anyway?');
	}

	async function browse() {
		if (!confirmDiscard()) return;
		store.openFileModalOpen = false;
		try {
			const files = await import('$lib/io/files');
			await files.openFile();
		} catch {
			toast.error('Could not open that file.');
		}
	}

	async function openRecent(f: RecentFile) {
		if (!confirmDiscard()) return;
		store.openFileModalOpen = false;
		try {
			const files = await import('$lib/io/files');
			await files.openWithLoading(f.name, () => f.content);
		} catch {
			toast.error(`Could not open ${f.name}.`);
		}
	}

	async function openExample(ex: ExampleFile) {
		if (!confirmDiscard()) return;
		store.openFileModalOpen = false;
		try {
			const files = await import('$lib/io/files');
			await files.openWithLoading(ex.name, () => ex.load());
		} catch {
			toast.error(`Could not open ${ex.name}.`);
		}
	}

	function forget(e: Event, name: string) {
		e.stopPropagation();
		removeRecentFile(name);
		recents = getRecentFiles();
	}

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const browseClass =
		'flex w-full cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-none! px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground';
	// Section labels ("Recent files" / "Examples") and the file-name rows share
	// one colour so the two lists read as a single, consistent palette.
	const sectionLabelClass =
		'px-2 text-[0.65rem] font-medium tracking-wide text-foreground/70 uppercase';
	const linkClass =
		'flex w-full cursor-pointer items-center gap-2 rounded-md bg-none! px-2 py-1.5 text-left text-sm text-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground';
</script>

<Dialog.Root bind:open={store.openFileModalOpen}>
	<Dialog.Content
		overlayClass="bg-transparent"
		class="max-w-md gap-4 p-0"
		onOpenAutoFocus={(e) => e.preventDefault()}
	>
		<Dialog.Header class="p-4 pb-0">
			<Dialog.Title>Open / Import</Dialog.Title>
			<Dialog.Description>
				Pick a recent file, try an example, or browse your device. Opening a file replaces the
				current score.
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid max-h-[70vh] gap-4 overflow-y-auto p-4 pt-0">
			<button type="button" class={browseClass} onclick={browse}>
				<FolderOpen class="size-4 shrink-0 text-muted-foreground" />
				<span class="flex-1">Browse file</span>
			</button>

			{#if recents.length > 0}
				<div class="grid gap-0.5">
					<div class={sectionLabelClass}>Recent files</div>
					{#each recents as f (f.name)}
						<div class="group relative">
							<button type="button" class={linkClass} onclick={() => openRecent(f)}>
								<FileText class="size-4 shrink-0 text-muted-foreground" />
								<span class="min-w-0 flex-1 truncate">{f.name}</span>
								<span class="shrink-0 pr-6 text-xs text-muted-foreground"
									>{formatDate(f.openedAt)}</span
								>
							</button>
							<button
								type="button"
								class="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-xs bg-none! p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60 hover:opacity-100!"
								aria-label={`Remove ${f.name} from recent files`}
								onclick={(e) => forget(e, f.name)}
							>
								<X class="size-3.5" />
							</button>
						</div>
					{/each}
				</div>
			{/if}

			{#if exampleFiles.length > 0}
				<div class="grid gap-0.5">
					<div class={sectionLabelClass}>Examples</div>
					{#each exampleFiles as ex (ex.name)}
						<button type="button" class={linkClass} onclick={() => openExample(ex)}>
							<FileText class="size-4 shrink-0 text-muted-foreground" />
							<span class="min-w-0 flex-1 truncate">{ex.name}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="flex flex-row justify-end p-4 pt-0">
			<Dialog.Close class={buttonVariants({ variant: 'outline' })}>Cancel</Dialog.Close>
		</div>
	</Dialog.Content>
</Dialog.Root>
