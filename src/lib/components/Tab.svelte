<script lang="ts">
	// TabRenderer.svelte - Professional Guitar Tablature Renderer
	import { onMount } from 'svelte';
	
	interface Note {
		string: number; // 0-5 (high E to low E)
		fret: number;
		duration: number; // in beats (0.25 = 16th, 0.5 = 8th, 1 = quarter, etc)
		technique?: 'hammer' | 'pull' | 'slide' | 'bend' | 'vibrato' | 'palm-mute';
		slideTo?: number; // target fret for slides
	}
	
	interface Measure {
		notes: Note[][];
		timeSignature?: [number, number];
		tempo?: number;
	}
	
	interface TabProps {
		measures: Measure[];
		title?: string;
		artist?: string;
		tuning?: string[];
		capo?: number;
	}
	
	let {
		measures,
		title = 'Untitled',
		artist,
		tuning = ['E', 'B', 'G', 'D', 'A', 'E'],
		capo = 0
	}: TabProps = $props();
	
	let isPlaying = $state(false);
	let currentBeat = $state(-1);
	let tempo = $state(measures[0]?.tempo || 120);
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	
	const STRING_SPACING = 20;
	const MEASURE_WIDTH = 200;
	const LEFT_MARGIN = 60;
	const TOP_MARGIN = 80;
	const NOTE_SPACING = 40;
	
	onMount(() => {
		ctx = canvas.getContext('2d')!;
		drawTab();
	});
	
	function drawTab() {
		if (!ctx) return;
		
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		
		// Draw title and artist
		ctx.fillStyle = '#000';
		ctx.font = 'bold 24px Arial';
		ctx.fillText(title, LEFT_MARGIN, 30);
		
		if (artist) {
			ctx.font = '16px Arial';
			ctx.fillStyle = '#666';
			ctx.fillText(artist, LEFT_MARGIN, 55);
		}
		
		let currentX = LEFT_MARGIN;
		let currentY = TOP_MARGIN;
		let beatIndex = 0;
		
		measures.forEach((measure, measureIndex) => {
			// Check if we need to move to next line
			if (currentX + MEASURE_WIDTH > canvas.width - 40 && measureIndex > 0) {
				currentX = LEFT_MARGIN;
				currentY += STRING_SPACING * 7 + 40;
			}
			
			// Draw measure
			drawMeasure(ctx, measure, currentX, currentY, beatIndex);
			
			currentX += MEASURE_WIDTH;
			beatIndex += measure.notes.length;
		});
	}
	
	function drawMeasure(
		ctx: CanvasRenderingContext2D,
		measure: Measure,
		x: number,
		y: number,
		startBeatIndex: number
	) {
		// Draw strings
		ctx.strokeStyle = '#333';
		ctx.lineWidth = 1;
		
		for (let i = 0; i < 6; i++) {
			const stringY = y + i * STRING_SPACING;
			ctx.beginPath();
			ctx.moveTo(x, stringY);
			ctx.lineTo(x + MEASURE_WIDTH - 10, stringY);
			ctx.stroke();
		}
		
		// Draw string names
		ctx.fillStyle = '#666';
		ctx.font = 'bold 12px monospace';
		tuning.forEach((note, i) => {
			ctx.fillText(note, x - 25, y + i * STRING_SPACING + 4);
		});
		
		// Draw measure lines
		ctx.strokeStyle = '#000';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x, y + 5 * STRING_SPACING);
		ctx.stroke();
		
		ctx.beginPath();
		ctx.moveTo(x + MEASURE_WIDTH - 10, y);
		ctx.lineTo(x + MEASURE_WIDTH - 10, y + 5 * STRING_SPACING);
		ctx.stroke();
		
		// Draw notes
		measure.notes.forEach((chord, chordIndex) => {
			const noteX = x + 20 + chordIndex * NOTE_SPACING;
			const beatIdx = startBeatIndex + chordIndex;
			
			// Highlight current beat
			if (isPlaying && beatIdx === currentBeat) {
				ctx.fillStyle = 'rgba(66, 153, 225, 0.2)';
				ctx.fillRect(noteX - 10, y - 10, 25, 5 * STRING_SPACING + 20);
			}
			
			chord.forEach((note) => {
				const noteY = y + note.string * STRING_SPACING;
				
				// Draw note circle
				ctx.fillStyle = isPlaying && beatIdx === currentBeat ? '#4299e1' : '#fff';
				ctx.strokeStyle = '#000';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(noteX, noteY, 10, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
				
				// Draw fret number
				ctx.fillStyle = isPlaying && beatIdx === currentBeat ? '#fff' : '#000';
				ctx.font = 'bold 12px Arial';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(note.fret.toString(), noteX, noteY);
				
				// Draw technique indicators
				if (note.technique) {
					ctx.fillStyle = '#e53e3e';
					ctx.font = '10px Arial';
					drawTechnique(ctx, note, noteX, noteY);
				}
				
				// Draw slides
				if (note.technique === 'slide' && note.slideTo !== undefined) {
					ctx.strokeStyle = '#666';
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.moveTo(noteX + 10, noteY);
					ctx.lineTo(noteX + NOTE_SPACING - 10, noteY);
					ctx.stroke();
				}
			});
		});
	}
	
	function drawTechnique(
		ctx: CanvasRenderingContext2D,
		note: Note,
		x: number,
		y: number
	) {
		let symbol = '';
		switch (note.technique) {
			case 'hammer':
				symbol = 'H';
				break;
			case 'pull':
				symbol = 'P';
				break;
			case 'bend':
				symbol = '↑';
				break;
			case 'vibrato':
				symbol = '~';
				break;
			case 'palm-mute':
				symbol = 'PM';
				break;
		}
		ctx.fillText(symbol, x, y - 20);
	}
	
	async function playTab() {
		if (isPlaying) {
			stopTab();
			return;
		}
		
		isPlaying = true;
		const beatDuration = (60 / tempo) * 1000; // ms per beat
		
		let totalBeats = 0;
		measures.forEach((m) => (totalBeats += m.notes.length));
		
		for (let i = 0; i < totalBeats && isPlaying; i++) {
			currentBeat = i;
			drawTab();
			await new Promise((resolve) => setTimeout(resolve, beatDuration));
		}
		
		stopTab();
	}
	
	function stopTab() {
		isPlaying = false;
		currentBeat = -1;
		drawTab();
	}
	
	function handleTempoChange(e: Event) {
		tempo = parseInt((e.target as HTMLInputElement).value);
	}
	
	$effect(() => {
		if (canvas && ctx) {
			drawTab();
		}
	});
</script>

<div class="tab-renderer">
	<div class="controls">
		<button class="play-btn" onclick={playTab}>
			{isPlaying ? '⏸' : '▶'} {isPlaying ? 'Pause' : 'Play'}
		</button>
		
		<button class="stop-btn" onclick={stopTab} disabled={!isPlaying}>
			⏹ Stop
		</button>
		
		<div class="tempo-control">
			<label for="tempo">Tempo: {tempo} BPM</label>
			<input
				id="tempo"
				type="range"
				min="40"
				max="240"
				value={tempo}
				oninput={handleTempoChange}
			/>
		</div>
		
		{#if capo > 0}
			<div class="capo-indicator">Capo: {capo}</div>
		{/if}
	</div>
	
	<div class="canvas-container">
		<canvas bind:this={canvas} width="1000" height="600"></canvas>
	</div>
</div>

<style>
	.tab-renderer {
		background: #f7fafc;
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}
	
	.controls {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: white;
		border-radius: 8px;
		flex-wrap: wrap;
	}
	
	button {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	
	.play-btn {
		background: #4299e1;
		color: white;
	}
	
	.play-btn:hover {
		background: #3182ce;
		transform: translateY(-1px);
	}
	
	.stop-btn {
		background: #e53e3e;
		color: white;
	}
	
	.stop-btn:hover:not(:disabled) {
		background: #c53030;
	}
	
	.stop-btn:disabled {
		background: #cbd5e0;
		cursor: not-allowed;
	}
	
	.tempo-control {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	
	.tempo-control label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #2d3748;
	}
	
	.tempo-control input[type='range'] {
		width: 200px;
	}
	
	.capo-indicator {
		padding: 0.5rem 1rem;
		background: #fef5e7;
		border: 2px solid #f39c12;
		border-radius: 6px;
		font-weight: 600;
		color: #d68910;
	}
	
	.canvas-container {
		background: white;
		border-radius: 8px;
		padding: 1rem;
		overflow-x: auto;
	}
	
	canvas {
		display: block;
		max-width: 100%;
		height: auto;
	}
</style>