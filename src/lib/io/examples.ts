// Example scores are the same fixtures guarded by testfiles.spec.ts
// (<repo>/test-files) — bundled at build time via Vite's glob import rather
// than fetched from GitHub at runtime. Fetching raw.githubusercontent.com on
// every open was flaky in practice (GitHub rate-limits that CDN aggressively)
// and could drift from whatever format version this build actually supports;
// bundling removes both problems and works offline.
const modules = import.meta.glob('../../../test-files/*.oto', {
	query: '?raw',
	import: 'default'
}) as Record<string, () => Promise<string>>;

export interface ExampleFile {
	name: string;
	label: string;
	load: () => Promise<string>;
}

function labelFromName(name: string): string {
	const base = name.replace(/\.oto$/, '').replace(/[-_]+/g, ' ');
	return base.charAt(0).toUpperCase() + base.slice(1);
}

export const exampleFiles: ExampleFile[] = Object.entries(modules)
	.map(([path, load]) => {
		const name = path.split('/').pop()!;
		return { name, label: labelFromName(name), load };
	})
	.sort((a, b) => a.label.localeCompare(b.label));
