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
	<Dialog.Content class="max-w-sm gap-4">
		<Dialog.Header>
			<Dialog.Title>Export PDF</Dialog.Title>
			<Dialog.Description>
				On a phone the score has to be in <strong>page view</strong> to export cleanly — otherwise the
				staff wraps to the narrow screen width and the PDF comes out broken across short lines. Switch
				to page view, then your browser's PDF export screen will open.
			</Dialog.Description>
		</Dialog.Header>

		<Dialog.Footer class="flex-row justify-end gap-2">
			<Dialog.Close class={buttonVariants({ variant: 'outline' })}>Cancel</Dialog.Close>
			<Button onclick={switchAndExport}>
				<FilePdf class="size-4" />
				Switch &amp; export
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
