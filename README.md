# oto

A lightweight, web-based music **tablature & notation studio** — think Guitar Pro / Soundslice,
but it runs anywhere in the browser with nothing to install. Built with SvelteKit, Svelte 5
runes, Tailwind, [bits-ui](https://github.com/huntabyte/bits-ui) and Tone.js.

## Features

- **Multi-track scores** in a single document — guitar, bass, ukulele or custom tunings.
- **Three notation systems per track**, independently toggleable:
  - Tablature (the primary editing surface)
  - Standard notation (treble staff, pitch-positioned note heads, stems, beams, accidentals, ledger lines)
  - Rhythmic notation (slash/stem rhythm view)
- **Crisp SVG rendering** using the [Bravura](https://github.com/steinbergmedia/bravura) SMuFL
  music font — scales to any zoom and exports cleanly to PDF.
- **Fast note entry**: click a beat, type fret numbers (multi-digit supported), pick a duration.
- **Bar-capacity awareness**: durations are summed against the time signature; over-filled bars
  turn **red** and the overflowing notes are skipped on playback.
- **Note durations**: whole, half, quarter, eighth, sixteenth, thirty-second + dotted.
- **Two voices per bar**: a second voice (stems down) can hold a different rhythm than
  the first, so a sustained note can ring under a run of faster notes.
- **Auto-grow entry**: typing a note extends the bar with a ready next beat and advances
  the cursor automatically, so you can play in a part without inserting beats by hand.
- **Distinct instrument voices**: nylon and steel-string acoustics use a Karplus–Strong
  plucked-string model; electric/clean/bass have their own synth + effect chains.
- **Effects**: hammer-on/pull-off, slide, bend (½/full/1½/2), vibrato, palm mute, let ring,
  harmonic, dead/ghost/staccato notes — all editable.
- **Playback** with Tone.js: press **Space** to play from the cursor, again to stop.
- **Loop selection**: shift-click or shift-arrow to select a region, then loop it.
- **Metronome** toggle, synced to the transport.
- **Virtual fretboard** for finding notes and visualising hand positions; click to enter & audition.
- **Transpose & detune** any track at any time (non-destructive display transpose, fret transpose,
  or tuning detune), plus capo support.
- **Guitar Pro import** (`.gp`, `.gpx`, `.gp3/4/5`, `.gp7`) — parsed in-browser via alphaTab and
  converted to `.oto`.
- **Save / load** as `.oto` files, **export PDF** from the UI, with **localStorage autosave**.
- **Responsive**: a touch keypad and touch-sized transport cover all fundamentals on mobile.

## Keyboard shortcuts

| Key                    | Action                                             |
| ---------------------- | -------------------------------------------------- |
| `Space`                | Play / stop                                        |
| `0`–`9`                | Enter fret number at the cursor (multi-digit)      |
| Arrows                 | Move the cursor (string / beat)                    |
| `Shift`+`←/→`          | Extend the loop selection                          |
| `Enter`                | Insert a beat after the cursor                     |
| `Backspace` / `Delete` | Delete the note at the cursor                      |
| `w h q e s`            | Set duration (whole/half/quarter/eighth/sixteenth) |
| `.`                    | Toggle dotted                                      |
| `Ctrl/⌘+Z` / `Shift+Z` | Undo / redo                                        |
| `Ctrl/⌘+S`             | Save `.oto`                                        |

## The `.oto` format

`.oto` is a human-readable JSON document — like MIDI in spirit (timing + pitch across multiple
instruments), but tailored for fretted notation. A score holds tracks; each track has a tuning,
view flags and a list of measures; each measure holds **beats**; each beat has a duration and a set
of simultaneous notes (`{ string, fret, techniques?, bend?, slideTo? }`). Durations are stored as
the denominator of a whole note (`4` = quarter), so a bar's fill is just the sum of beat fractions
against `timeSignature[0] / timeSignature[1]`. See `src/lib/oto/types.ts`.

## Architecture

```
src/lib/
  oto/         # .oto types, duration math, pitch helpers, transpose, (de)serialisation
  notation/    # SMuFL glyphs + pure SVG layout engine (measures → positioned systems)
  audio/       # Tone.js engine, score compiler, playback controller, metronome
  io/          # .oto + PDF file IO, Guitar Pro → .oto conversion (alphaTab)
  stores/      # singleton reactive store (Svelte 5 runes): score, cursor, selection, playback
  components/  # Toolbar, TransportBar, TrackHeader, TrackStaff, EditPalette, Fretboard
```

Notation is rendered as **SVG** (not canvas): it stays crisp at any zoom, hit-testing for the
editor is straightforward, and it prints/exports to PDF as vectors. Guitar Pro import runs entirely
client-side — alphaTab is a pure-TypeScript parser, so no backend is required; the heavy module is
loaded on demand only when a file is imported.

## Develop

```sh
bun install
bun run dev          # http://localhost:5173
bun run check        # svelte-check (types)
bun run lint         # prettier + eslint
bun run test:unit -- --run --project server   # unit tests (node)
bun run build        # production build (Vercel adapter)
```
