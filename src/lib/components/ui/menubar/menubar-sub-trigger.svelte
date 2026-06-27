<script lang="ts">
	import { Menubar as MenubarPrimitive } from 'bits-ui';
	import CaretRight from 'phosphor-svelte/lib/CaretRight';
	import { cn } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	}: MenubarPrimitive.SubTriggerProps & { inset?: boolean } = $props();
</script>

<MenubarPrimitive.SubTrigger
	bind:ref
	data-slot="menubar-sub-trigger"
	data-inset={inset}
	class={cn(
		'focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[inset]:pl-8',
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<CaretRight class="ml-auto size-4" />
</MenubarPrimitive.SubTrigger>
