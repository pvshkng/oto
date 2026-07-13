<script lang="ts">
	import { toast } from 'svelte-sonner';
	import FileArrowUp from 'phosphor-svelte/lib/FileArrowUp';
	import { isGuitarProFile } from '$lib/io/guitarpro';

	let dragging = $state(false);
	let depth = 0;

	function isSupported(name: string): boolean {
		return /\.oto$/i.test(name) || isGuitarProFile(name);
	}

	function hasFiles(e: DragEvent): boolean {
		return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
	}

	function onDragEnter(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		depth++;
		dragging = true;
	}

	function onDragOver(e: DragEvent) {
		if (!hasFiles(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave() {
		if (!dragging) return;
		depth = Math.max(0, depth - 1);
		if (depth === 0) dragging = false;
	}

	async function onDrop(e: DragEvent) {
		depth = 0;
		dragging = false;
		if (!hasFiles(e)) return;
		e.preventDefault();
		const file = e.dataTransfer?.files?.[0];
		if (!file) return;
		if (!isSupported(file.name)) {
			toast.error('Unsupported file type. Drop a .oto or Guitar Pro file.');
			return;
		}
		if (!confirm('Unsaved changes will be lost. Open anyway?')) return;
		try {
			const files = await import('$lib/io/files');
			await files.openLocalFile(file);
		} catch (e) {
			toast.error(`Could not open ${file.name}.`, {
				description: e instanceof Error ? e.message : undefined
			});
		}
	}
</script>

<svelte:window
	ondragenter={onDragEnter}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
/>

{#if dragging}
	<div
		class="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-bg/70 backdrop-blur-sm print:hidden"
	>
		<div
			class="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-foreground/40 bg-background/70 backdrop-blur-md px-10 py-8 shadow-[0_6px_24px_rgba(0,0,0,0.2)]"
		>
			<FileArrowUp class="size-8 text-foreground/70" />
			<div class="text-sm font-medium text-foreground">Drop to open</div>
			<div class="text-xs text-foreground/60">.oto and other compatible files</div>
		</div>
	</div>
{/if}
