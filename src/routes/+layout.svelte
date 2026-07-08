<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';
	import { store } from '$lib/stores/score.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import GithubRibbon from '$lib/components/GithubRibbon.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<GithubRibbon />
<Toaster position={store.isDesktop ? 'top-right' : 'top-center'} />
{@render children()}
