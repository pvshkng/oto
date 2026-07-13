<script lang="ts">
	import './layout.css';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { store } from '$lib/stores/score.svelte';
	import { loading } from '$lib/stores/loading.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { toast } from 'svelte-sonner';
	import GithubRibbon from '$lib/components/GithubRibbon.svelte';

	let { children } = $props();

	// Last-resort net: an error that escapes every local handler while the
	// loading overlay is up (e.g. thrown from a render flush the overlay's
	// unmount was part of) would otherwise leave the app stuck on "Opening…".
	// Force the overlay closed and say what happened.
	function onUncaught(e: Event) {
		if (!loading.active) return;
		loading.finish();
		const cause = 'reason' in e ? (e as PromiseRejectionEvent).reason : (e as ErrorEvent).error;
		toast.error('Something went wrong while loading.', {
			description: cause instanceof Error ? cause.message : undefined
		});
	}

	beforeNavigate((nav) => {
		if (!store.documentOpen) return;
		if (nav.type === 'leave') {
			nav.cancel();
			return;
		}
		if (!confirm('Unsaved changes will be lost. Leave this page?')) nav.cancel();
	});
</script>

<svelte:window onerror={onUncaught} onunhandledrejection={onUncaught} />

<svelte:head>
	<link rel="icon" href={resolve('/') + 'favicon.ico'} />
</svelte:head>

<GithubRibbon />
<Toaster position={store.isDesktop ? 'top-right' : 'top-center'} />
{@render children()}
