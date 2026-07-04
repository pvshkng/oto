# .oto test files

Hand-curated fixture scores for manual and automated testing. Open any of them
in the app via **Open / Import**, or use them as regression inputs — the unit
suite (`src/lib/oto/testfiles.spec.ts`) parses every file here and fails if one
stops loading or overflows a bar.

| File                        | Exercises                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `multiple-tracks.oto`       | Four parallel tracks (lead, strummed rhythm, bass, drums), sections, mixed note/chord writing.                       |
| `drums.oto`                 | Drum-kit track only: rock beat, half-time, 16th groove, ghost-note snares, tom fill, crash ending.                   |
| `all-note-effects.oto`      | Every note technique in the vocabulary, one beat each (bends carry amounts, slides carry targets), plus a tie.       |
| `dynamics.oto`              | Every dynamic marking `ppp … sffz`, then a crescendo phrase.                                                         |
| `tuplets.oto`               | Triplets, quintuplets, sextuplets, septuplets, nonuplets — all bars fill their metre exactly — plus a two-voice bar. |
| `repeats-and-structure.oto` | Double barlines, begin/end repeat (x3), volta brackets 1./2., simile mark, segno, coda, metre + tempo changes.       |
| `octaves-and-marks.oto`     | 8va / 8vb / 15ma / 15mb octave signs, fermata, tremolo picking, ghost notes, strum-up/down chords.                   |
| `everything-combined.oto`   | All of the above at once across four tracks, with key signature, capo, pan/EQ and per-bar tempo overrides.           |

All files are generated through the app's own score factory + serializer, so
they are valid `.oto` (format v4) documents by construction.
