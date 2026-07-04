import { describe, it, expect } from 'vitest';
import { importer, exporter, Settings } from '@coderline/alphatab';
import { gpScoreToOto, isGuitarProFile, type AtScore } from './guitarpro';

const { ScoreLoader } = importer;

// We exercise the converter with scores built from alphaTex (alphaTab's text
// format). This produces the same in-memory Score model that the Guitar Pro
// binary importers produce, so the mapping is verified without binary fixtures.
function fromTex(tex: string): AtScore {
	return ScoreLoader.loadAlphaTex(tex) as unknown as AtScore;
}

describe('isGuitarProFile', () => {
	it('matches Guitar Pro extensions', () => {
		expect(isGuitarProFile('song.gp5')).toBe(true);
		expect(isGuitarProFile('song.gpx')).toBe(true);
		expect(isGuitarProFile('song.gp')).toBe(true);
		expect(isGuitarProFile('song.GP4')).toBe(true);
		expect(isGuitarProFile('song.oto')).toBe(false);
		expect(isGuitarProFile('song.txt')).toBe(false);
	});
});

describe('gpScoreToOto', () => {
	it('carries over title and tempo', () => {
		const oto = gpScoreToOto(fromTex('\\title "Hello" \\tempo 132 . 0.1 1.1 2.1 3.1'));
		expect(oto.format).toBe('oto');
		expect(oto.title).toBe('Hello');
		expect(oto.tempo).toBe(132);
		expect(oto.tracks.length).toBe(1);
	});

	it('maps string numbers from alphaTab (1=low) to .oto (0=high)', () => {
		// 0.1 = fret 0 on alphaTex string 1 → highest string → .oto string 0.
		// 3.6 = fret 3 on alphaTex string 6 → lowest string → .oto string 5.
		const oto = gpScoreToOto(fromTex('. 0.1 3.6'));
		const beats = oto.tracks[0].measures[0].beats;
		const high = beats[0].notes[0];
		const low = beats[1].notes[0];
		expect(high.string).toBe(0);
		expect(high.fret).toBe(0);
		expect(low.string).toBe(5);
		expect(low.fret).toBe(3);
	});

	it('preserves a standard 6-string guitar tuning, high-to-low', () => {
		const oto = gpScoreToOto(fromTex('. 0.1'));
		expect(oto.tracks[0].tuning).toEqual(['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);
		expect(oto.tracks[0].kind).toBe('guitar');
	});

	it('maps note durations', () => {
		const oto = gpScoreToOto(fromTex('. :4 0.1 :8 0.1 :16 0.1'));
		const beats = oto.tracks[0].measures[0].beats;
		expect(beats[0].duration).toBe(4);
		expect(beats[1].duration).toBe(8);
		expect(beats[2].duration).toBe(16);
	});

	it('marks rests', () => {
		const oto = gpScoreToOto(fromTex('. 0.1 r 0.1'));
		const beats = oto.tracks[0].measures[0].beats;
		expect(beats[1].rest).toBe(true);
		expect(beats[1].notes.length).toBe(0);
	});

	it('imports effects: palm mute, let ring, vibrato, bend, harmonic', () => {
		const oto = gpScoreToOto(fromTex('. 3.3{pm} 5.3{lr} 7.3{v} 7.3{b (0 4)} 12.3{nh}'));
		const notes = oto.tracks[0].measures[0].beats.map((b) => b.notes[0]);
		expect(notes[0].techniques).toContain('palm-mute');
		expect(notes[1].techniques).toContain('let-ring');
		expect(notes[2].techniques).toContain('vibrato');
		expect(notes[3].techniques).toContain('bend');
		expect(notes[3].bend).toBeGreaterThan(0);
		expect(notes[4].techniques).toContain('harmonic');
	});

	it('captures the time signature', () => {
		const oto = gpScoreToOto(fromTex('\\ts 3 4 . 0.1 0.1 0.1'));
		expect(oto.timeSignature).toEqual([3, 4]);
		expect(oto.tracks[0].measures[0].timeSignature).toEqual([3, 4]);
	});

	it('imports multiple tracks', () => {
		const oto = gpScoreToOto(
			fromTex('\\track "Guitar" . 0.1 1.1 | \\track "Bass" \\tuning E1 A1 D2 G2 . 0.1 1.1')
		);
		expect(oto.tracks.length).toBe(2);
		expect(oto.tracks[0].name).toBe('Guitar');
		expect(oto.tracks[1].name).toBe('Bass');
		expect(oto.tracks[1].kind).toBe('bass');
		expect(oto.tracks[1].tuning.length).toBe(4);
	});

	it('round-trips through real Guitar Pro (.gp) binary bytes', () => {
		// Build → export to GP7 bytes → load via the same binary importer the app
		// uses for uploaded files → convert. This exercises the full import path.
		const score = ScoreLoader.loadAlphaTex('\\title "Binary" \\tempo 100 . 3.3 5.3 7.3 8.3');
		const bytes = new exporter.Gp7Exporter().export(score, new Settings());
		const reloaded = ScoreLoader.loadScoreFromBytes(new Uint8Array(bytes), new Settings());
		const oto = gpScoreToOto(reloaded as unknown as AtScore);
		expect(oto.title).toBe('Binary');
		expect(oto.tempo).toBe(100);
		const frets = oto.tracks[0].measures[0].beats.map((b) => b.notes[0]?.fret);
		expect(frets).toEqual([3, 5, 7, 8]);
	});

	it('distinguishes an ascending slur (hammer-on) from a descending one (pull-off)', () => {
		const hammerOn = gpScoreToOto(fromTex('. 3.3{h} 5.3'));
		expect(hammerOn.tracks[0].measures[0].beats[0].notes[0].techniques).toContain('hammer');

		const pullOff = gpScoreToOto(fromTex('. 5.3{h} 3.3'));
		expect(pullOff.tracks[0].measures[0].beats[0].notes[0].techniques).toContain('pull');
	});

	it('imports accents, taps and artificial harmonics', () => {
		const oto = gpScoreToOto(fromTex('. 3.3{ac} 3.3{lht} 3.3{ah}'));
		const notes = oto.tracks[0].measures[0].beats.map((b) => b.notes[0]);
		expect(notes[0].techniques).toContain('accent');
		expect(notes[1].techniques).toContain('tap');
		expect(notes[2].techniques).toContain('artificial-harmonic');
		expect(notes[2].techniques).not.toContain('harmonic');
	});

	it('captures the key signature', () => {
		const oto = gpScoreToOto(fromTex('\\ks d . 0.1'));
		expect(oto.keySignature).toBe(2);
	});
});

describe('gpScoreToOto: drum tracks', () => {
	it('imports a percussion staff as a drum-kit track instead of dropping it', () => {
		const oto = gpScoreToOto(fromTex('\\track "Drums" . 36 38 42'));
		expect(oto.tracks.length).toBe(1);
		const track = oto.tracks[0];
		expect(track.kind).toBe('custom');
		expect(track.instrument).toBe('drums');
		expect(track.view.standard).toBe(false);
		expect(track.view.tab).toBe(true);
	});

	it('gives every distinct GM drum piece its own line, highest pitch first, fret 0', () => {
		const oto = gpScoreToOto(fromTex('\\track "Drums" . 36 38 42'));
		const track = oto.tracks[0];
		// 42 = Hi-Hat closed, 38 = Snare, 36 = Kick — highest pitch first.
		expect(track.tuning).toEqual(['F#2', 'D2', 'C2']);
		const beats = track.measures[0].beats;
		// Input order is kick(36), snare(38), hi-hat(42); lines run high→low.
		expect(beats[0].notes).toEqual([{ string: 2, fret: 0 }]); // kick
		expect(beats[1].notes).toEqual([{ string: 1, fret: 0 }]); // snare
		expect(beats[2].notes).toEqual([{ string: 0, fret: 0 }]); // hi-hat
	});

	it('keeps simultaneous drum hits together as a chord on one beat', () => {
		const oto = gpScoreToOto(fromTex('\\track "Drums" . (36 42)'));
		const strings = oto.tracks[0].measures[0].beats[0].notes.map((n) => n.string).sort();
		expect(strings).toEqual([0, 1]);
	});

	it('imports a mix of stringed and drum tracks in the same file', () => {
		const oto = gpScoreToOto(fromTex('\\track "Guitar" . 0.1 1.1 | \\track "Drums" . 36 38'));
		expect(oto.tracks.length).toBe(2);
		expect(oto.tracks[0].kind).toBe('guitar');
		expect(oto.tracks[1].instrument).toBe('drums');
	});

	it('round-trips a drum track through real Guitar Pro (.gp) binary bytes', () => {
		const score = ScoreLoader.loadAlphaTex('\\track "Drums" . 36 38 42');
		const bytes = new exporter.Gp7Exporter().export(score, new Settings());
		const reloaded = ScoreLoader.loadScoreFromBytes(new Uint8Array(bytes), new Settings());
		const oto = gpScoreToOto(reloaded as unknown as AtScore);
		expect(oto.tracks.length).toBe(1);
		expect(oto.tracks[0].instrument).toBe('drums');
		expect(oto.tracks[0].tuning.length).toBe(3);
	});
});
