<script lang="ts">
	import * as Tone from 'tone';
	const synth = new Tone.Synth().toDestination();
</script>

<button
	on:click={(e) => {
		synth.triggerAttackRelease('C4', '8n');
	}}>Play</button
>
