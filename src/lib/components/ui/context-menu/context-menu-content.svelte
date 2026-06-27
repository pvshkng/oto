<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		...restProps
	}: ContextMenuPrimitive.ContentProps & {
		portalProps?: ContextMenuPrimitive.PortalProps;
	} = $props();
</script>

<ContextMenuPrimitive.Portal {...portalProps}>
	<ContextMenuPrimitive.Content
		bind:ref
		data-slot="context-menu-content"
		class={cn(
			'bg-popover text-popover-foreground z-50 max-h-(--bits-context-menu-content-available-height) min-w-[8rem] origin-(--bits-context-menu-content-transform-origin) overflow-y-auto overflow-x-hidden rounded-md border p-1 shadow-md',
			className
		)}
		{...restProps}
	/>
</ContextMenuPrimitive.Portal>
