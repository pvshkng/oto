<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';
	import { store } from '$lib/stores/score.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Toaster position={store.isDesktop ? 'top-right' : 'top-center'} />
{@render children()}
