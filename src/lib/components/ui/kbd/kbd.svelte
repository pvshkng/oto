<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let { class: className, children, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<kbd
	class={cn(
		'bg-muted text-muted-foreground inline-flex h-5 select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium',
		className
	)}
	{...rest}>{@render children?.()}</kbd
>
