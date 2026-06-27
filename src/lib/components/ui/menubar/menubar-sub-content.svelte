<script lang="ts">
	import { Menubar as MenubarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: MenubarPrimitive.SubContentProps = $props();
</script>

<MenubarPrimitive.SubContent
	bind:ref
	data-slot="menubar-sub-content"
	class={cn(
		'bg-popover text-popover-foreground z-50 min-w-[8rem] origin-(--bits-menubar-sub-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg',
		className
	)}
	{...restProps}
/>
