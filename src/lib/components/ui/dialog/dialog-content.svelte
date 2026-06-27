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
		children,
		...restProps
	}: DialogPrimitive.ContentProps & {
		portalProps?: DialogPrimitive.PortalProps;
		showCloseButton?: boolean;
		children: Snippet;
	} = $props();
</script>

<DialogPrimitive.Portal {...portalProps}>
	<DialogOverlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			'bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg',
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
