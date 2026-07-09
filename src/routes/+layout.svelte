<script lang="ts">
	import './layout.css';
	import { base } from '$app/paths';
	import { beforeNavigate } from '$app/navigation';
	import { store } from '$lib/stores/score.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import GithubRibbon from '$lib/components/GithubRibbon.svelte';

	let { children } = $props();

	beforeNavigate((nav) => {
		if (!store.documentOpen) return;
		if (nav.type === 'leave') {
			nav.cancel();
			return;
		}
		if (!confirm('Unsaved changes will be lost. Leave this page?')) nav.cancel();
	});
</script>

<svelte:head>
	<link rel="icon" href="{base}/favicon/favicon.ico" />
</svelte:head>

<GithubRibbon />
<Toaster position={store.isDesktop ? 'top-right' : 'top-center'} />
{@render children()}
