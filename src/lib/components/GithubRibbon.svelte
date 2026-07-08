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
	class="fixed top-0 left-0 z-30 flex size-11 items-start justify-start pt-1.5 pl-1.5 [clip-path:polygon(0_0,100%_0,0_100%)] bg-ink transition-[filter] hover:brightness-125"
>
	<GithubLogoIcon weight="fill" class="text-paper size-4 -rotate-45" />
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
