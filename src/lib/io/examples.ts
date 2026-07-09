import { base } from '$app/paths';

const FILE_NAMES = [
	'all-note-effects.oto',
	'drums.oto',
	'dynamics.oto',
	'everything-combined.oto',
	'multiple-tracks.oto',
	'octaves-and-marks.oto',
	'repeats-and-structure.oto',
	'tuplets.oto'
];

export interface ExampleFile {
	name: string;
	label: string;
	load: () => Promise<string>;
}

function labelFromName(name: string): string {
	const label = name.replace(/\.oto$/, '').replace(/[-_]+/g, ' ');
	return label.charAt(0).toUpperCase() + label.slice(1);
}

export const exampleFiles: ExampleFile[] = FILE_NAMES.map((name) => ({
	name,
	label: labelFromName(name),
	load: async () => {
		const res = await fetch(`${base}/test-files/${name}`);
		if (!res.ok) throw new Error(`failed to fetch ${name}`);
		return res.text();
	}
})).sort((a, b) => a.label.localeCompare(b.label));
