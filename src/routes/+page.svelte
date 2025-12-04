<script lang="ts">
	// +page.svelte
	import Tab from '$lib/components/Tab.svelte';
	
	// Example: A simple song with various techniques
	const measures = [
		// Measure 1 - Intro
		{
			tempo: 120,
			notes: [
				[{ string: 0, fret: 0, duration: 1 }],
				[{ string: 1, fret: 0, duration: 1 }],
				[{ string: 2, fret: 1, duration: 1 }],
				[{ string: 3, fret: 2, duration: 1 }]
			]
		},
		// Measure 2
		{
			notes: [
				[
					{ string: 4, fret: 2, duration: 1 },
					{ string: 3, fret: 2, duration: 1 }
				],
				[{ string: 2, fret: 2, duration: 1, technique: 'hammer' }],
				[{ string: 1, fret: 3, duration: 1 }],
				[{ string: 0, fret: 3, duration: 1 }]
			]
		},
		// Measure 3 - Power chord
		{
			notes: [
				[
					{ string: 5, fret: 3, duration: 1 },
					{ string: 4, fret: 5, duration: 1 },
					{ string: 3, fret: 5, duration: 1 }
				],
				[
					{ string: 5, fret: 3, duration: 1 },
					{ string: 4, fret: 5, duration: 1 },
					{ string: 3, fret: 5, duration: 1 }
				],
				[
					{ string: 5, fret: 3, duration: 1 },
					{ string: 4, fret: 5, duration: 1 },
					{ string: 3, fret: 5, duration: 1 }
				],
				[
					{ string: 5, fret: 3, duration: 1 },
					{ string: 4, fret: 5, duration: 1 },
					{ string: 3, fret: 5, duration: 1 }
				]
			]
		},
		// Measure 4 - With techniques
		{
			notes: [
				[{ string: 2, fret: 5, duration: 1, technique: 'bend' }],
				[{ string: 2, fret: 7, duration: 0.5 }],
				[{ string: 2, fret: 5, duration: 0.5, technique: 'pull' }],
				[{ string: 1, fret: 5, duration: 1, technique: 'vibrato' }]
			]
		},
		// Measure 5 - Slide
		{
			notes: [
				[{ string: 3, fret: 5, duration: 1, technique: 'slide', slideTo: 7 }],
				[{ string: 3, fret: 7, duration: 1 }],
				[{ string: 2, fret: 7, duration: 1 }],
				[{ string: 1, fret: 8, duration: 1 }]
			]
		},
		// Measure 6 - Palm mute section
		{
			notes: [
				[{ string: 5, fret: 0, duration: 0.5, technique: 'palm-mute' }],
				[{ string: 5, fret: 0, duration: 0.5, technique: 'palm-mute' }],
				[{ string: 5, fret: 0, duration: 0.5, technique: 'palm-mute' }],
				[{ string: 5, fret: 0, duration: 0.5, technique: 'palm-mute' }]
			]
		}
	];
	
	// Example 2: Fingerstyle pattern
	const fingerstyleMeasures = [
		{
			tempo: 90,
			notes: [
				[
					{ string: 5, fret: 3, duration: 1 },
					{ string: 2, fret: 0, duration: 1 },
					{ string: 1, fret: 1, duration: 1 }
				],
				[{ string: 3, fret: 0, duration: 1 }],
				[{ string: 2, fret: 0, duration: 1 }],
				[{ string: 1, fret: 1, duration: 1 }]
			]
		},
		{
			notes: [
				[
					{ string: 5, fret: 3, duration: 1 },
					{ string: 2, fret: 0, duration: 1 }
				],
				[{ string: 3, fret: 2, duration: 1 }],
				[{ string: 2, fret: 0, duration: 1 }],
				[{ string: 1, fret: 1, duration: 1 }]
			]
		}
	];
</script>

<svelte:head>
	<title>Professional Guitar Tab Renderer</title>
</svelte:head>

<main>
	<h1>🎸 Professional Guitar Tablature Renderer</h1>
	<p class="subtitle">Interactive tablature with playback, similar to Guitar Pro & Soundslice</p>
	
	<section>
		<h2>Rock Riff Example</h2>
		<Tab
			measures={measures}
			title="Rock Riff in Em"
			artist="Demo Song"
			tuning={['E', 'B', 'G', 'D', 'A', 'E']}
		/>
	</section>
	
	<section>
		<h2>Fingerstyle Pattern</h2>
		<Tab
			measures={fingerstyleMeasures}
			title="Fingerstyle in C"
			capo={3}
		/>
	</section>
	
	<section class="features">
		<h2>Features</h2>
		<ul>
			<li>✅ Interactive playback with tempo control</li>
			<li>✅ Visual beat highlighting during playback</li>
			<li>✅ Multiple guitar techniques (hammer-on, pull-off, bends, slides, vibrato, palm mute)</li>
			<li>✅ Custom tuning support</li>
			<li>✅ Capo indication</li>
			<li>✅ Multi-measure layout with automatic line breaks</li>
			<li>✅ Professional rendering with Canvas API</li>
		</ul>
	</section>
</main>

<style>
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}
	
	h1 {
		text-align: center;
		color: #2d3748;
		margin-bottom: 0.5rem;
	}
	
	.subtitle {
		text-align: center;
		color: #718096;
		margin-bottom: 3rem;
		font-size: 1.1rem;
	}
	
	section {
		margin-bottom: 3rem;
	}
	
	h2 {
		color: #2d3748;
		margin-bottom: 1rem;
	}
	
	.features {
		background: white;
		padding: 2rem;
		border-radius: 12px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}
	
	.features ul {
		list-style: none;
		padding: 0;
	}
	
	.features li {
		padding: 0.5rem 0;
		font-size: 1.05rem;
		color: #4a5568;
	}
</style>