<script lang="ts">
	import { Menubar as MenubarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		align = 'start',
		alignOffset = -4,
		sideOffset = 8,
		portalProps,
		...restProps
	}: MenubarPrimitive.ContentProps & {
		portalProps?: MenubarPrimitive.PortalProps;
	} = $props();
</script>

<MenubarPrimitive.Portal {...portalProps}>
	<MenubarPrimitive.Content
		bind:ref
		data-slot="menubar-content"
		{align}
		{alignOffset}
		{sideOffset}
		class={cn(
			'bg-popover text-popover-foreground z-50 min-w-[12rem] origin-(--bits-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-md',
			className
		)}
		{...restProps}
	/>
</MenubarPrimitive.Portal>
