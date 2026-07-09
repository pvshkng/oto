import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// GitHub Pages serves project sites from /<repo>/, but a custom domain
		// (static/CNAME) serves from the root instead. BASE_PATH is set
		// accordingly at build time (see .github/workflows/deploy.yml) and left
		// empty for local dev/preview.
		paths: { base: process.env.BASE_PATH ?? '' }
	}
};

export default config;
