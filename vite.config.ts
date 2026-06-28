import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { alphaTab } from '@coderline/alphatab-vite';

export default defineConfig({
	// alphaTab is only used for Guitar Pro import/export, never its live audio
	// player, so the audio worklet it configures for playback is dead weight.
	// (Disabling webWorkers too hits a bug in the plugin's generateBundle hook
	// when both are off, so only audioWorklets is turned off here.)
	plugins: [tailwindcss(), sveltekit(), devtoolsJson(), alphaTab({ audioWorklets: false })],
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
