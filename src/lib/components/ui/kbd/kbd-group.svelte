<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let { class: className, children, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<span class={cn('inline-flex items-center gap-0.5', className)} {...rest}>
	{@render children?.()}
</span>
