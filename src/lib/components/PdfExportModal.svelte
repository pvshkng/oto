<script lang="ts">
	// Mobile-only PDF export prompt. On mobile, window.print() is non-blocking,
	// so exportPdf() can't flip to page view and print in the same tick — the
	// browser snapshots the continuous (narrow, wrapped) layout before page view
	// renders. Instead we ask the user to switch to page view here, then drive
	// the print ourselves once the paginated layout has settled on screen.
	import { store } from '$lib/stores/score.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import FilePdf from 'phosphor-svelte/lib/FilePdf';

	// Wait two frames so the just-enabled page view actually paints before the
	// print dialog snapshots the document.
	function nextPaint(): Promise<void> {
		return new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		);
	}

	async function switchAndExport() {
		store.pageView = true;
		store.pdfExportModalOpen = false;
		// Let the paginated A4 layout render before opening the browser's print /
		// PDF screen. We deliberately leave page view on afterward: mobile print
		// is async, so reverting now would print the pre-flip layout.
		await nextPaint();
		const files = await import('$lib/io/files');
		files.printCurrentView();
	}
</script>

<Dialog.Root bind:open={store.pdfExportModalOpen}>
	<Dialog.Content floating class="max-w-md gap-4 p-0">
		<Dialog.Header class="p-4 pb-0">
			<Dialog.Title>Export PDF</Dialog.Title>
			<Dialog.Description>
				Page view is needed for a clean PDF. Otherwise the staff wraps to the screen width and
				breaks across short lines.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-row justify-end gap-2 p-4 pt-0">
			<Dialog.Close class={buttonVariants({ variant: 'outline' })}>Cancel</Dialog.Close>
			<Button onclick={switchAndExport}>
				<FilePdf class="size-4" />
				Switch &amp; export
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
