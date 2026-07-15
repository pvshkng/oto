import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { alphaTab } from '@coderline/alphatab-vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

// Serves the repo-root soundfont/ dir in dev. Production fetches these files
// from GitHub instead (kept out of the build, see src/lib/audio/soundfont.ts).
function localSoundfonts(): Plugin {
	return {
		name: 'oto-local-soundfonts',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use('/soundfont', (req, res, next) => {
				const name = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\//, ''));
				const file = path.resolve('soundfont', name);
				if (!name || name.includes('..') || !existsSync(file)) return next();
				res.setHeader('Content-Length', statSync(file).size);
				res.setHeader('Content-Type', 'application/octet-stream');
				createReadStream(file).pipe(res);
			});
		}
	};
}

export default defineConfig({
	// alphaTab powers both Guitar Pro import AND audio playback (alphaSynth in a
	// Web Worker feeding an AudioWorklet), so the plugin's worker + worklet
	// wiring must stay enabled.
	plugins: [tailwindcss(), sveltekit(), devtoolsJson(), alphaTab(), localSoundfonts()],
	assetsInclude: ['**/*.otf', '**/*.ttf', '**/*.woff', '**/*.woff2'],
	resolve: {
		alias: {
			'/node_modules/.vite/deps/font': '/fonts'
		}
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
