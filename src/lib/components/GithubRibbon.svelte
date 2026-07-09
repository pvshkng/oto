<script lang="ts">
	import GithubLogoIcon from 'phosphor-svelte/lib/GithubLogoIcon';

	const GITHUB_REPO_URL = 'https://github.com/pvshkng/oto' as const;
</script>

<!-- external URL, not a SvelteKit route -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href={GITHUB_REPO_URL}
	target="_blank"
	rel="noopener noreferrer"
	title="View source on GitHub"
	aria-label="View source on GitHub"
	class="fixed top-0 left-0 z-30 flex size-11 items-start justify-start pt-1.5 pl-1.5 transition-[filter] hover:brightness-125"
>
	<!-- Corner triangle via border trick rather than clip-path: some engines
	     (WebKit) drop clip-path on fixed-position elements once a sibling
	     mounts a backdrop-filter, e.g. the omni palette's blurred dialog. -->
	<span
		aria-hidden="true"
		class="absolute top-0 left-0 -z-10 h-0 w-0 border-t-[44px] border-r-[44px] border-t-ink border-r-transparent"
	></span>
	<GithubLogoIcon weight="fill" class="text-paper size-4 -rotate-45" />
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
