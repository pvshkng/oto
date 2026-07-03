# Drum kit samples

One-shot samples for the **Drum Kit** instrument. Each file is a single
percussion hit, named by its General MIDI percussion note number:

```
static/samples/drums/<midi>.mp3
```

The full note → piece mapping lives in `src/lib/oto/drums.ts` (`DRUM_PIECES`).
For example:

| MIDI | Piece            | File     |
| ---- | ---------------- | -------- |
| 36   | Kick             | 36.mp3   |
| 38   | Snare (hit)      | 38.mp3   |
| 42   | Hi-Hat (closed)  | 42.mp3   |
| 46   | Hi-Hat (open)    | 46.mp3   |
| 49   | Crash high       | 49.mp3   |
| 51   | Ride (edge)      | 51.mp3   |

## Enabling a sample

Drop the `.mp3` into this folder **and** add its filename to `manifest.json`:

```json
{
  "available": ["36.mp3", "38.mp3", "42.mp3"]
}
```

Only files listed in `available` are fetched at runtime, so a piece with no
sample yet never 404s — the app just plays its synthesised fallback for that
piece until you add the file. Any piece not listed keeps using the built-in
synth kit (`DrumVoice` in `drums.ts`).
