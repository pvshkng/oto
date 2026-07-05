<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import X from 'phosphor-svelte/lib/X';
	import type { Snippet } from 'svelte';
	import DialogOverlay from './dialog-overlay.svelte';
	import { cn } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		showCloseButton = true,
		overlayClass,
		children,
		...restProps
	}: DialogPrimitive.ContentProps & {
		portalProps?: DialogPrimitive.PortalProps;
		showCloseButton?: boolean;
		/** Override the overlay's dimmer — e.g. `bg-transparent` for palettes that
		 *  shouldn't darken the app behind them. */
		overlayClass?: string;
		children: Snippet;
	} = $props();
</script>

<DialogPrimitive.Portal {...portalProps}>
	<DialogOverlay class={overlayClass} />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			'bg-background/85 supports-[backdrop-filter]:bg-background/50 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 backdrop-blur-md sm:max-w-lg shadow-[0px_4px_16px_rgba(17,17,26,0.1),_0px_8px_24px_rgba(17,17,26,0.2),_0px_16px_56px_rgba(17,17,26,0.2)]',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close
				class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 cursor-pointer rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none"
			>
				<X class="size-4" />
				<span class="sr-only">Close</span>
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPrimitive.Portal>
