<div align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/pvshkng/oto/main/src/lib/assets/android-chrome-512x512-transparent.png" height="256" width="256">
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/pvshkng/oto/main/src/lib/assets/android-chrome-512x512.png" height="256" width="256">
    <img alt="Oto logo." src="https://raw.githubusercontent.com/pvshkng/oto/main/src/lib/assets/android-chrome-512x512.png" height="256" width="256">
  </picture>
  <h1>Oto</h1>
</div>

<div align="center">
  <a href="https://github.com/pvshkng/oto/actions">
    <img src="https://github.com/pvshkng/oto/actions/workflows/ci.yml/badge.svg?branch=main" alt="Github Actions Badge">
  </a>
  <a href="https://github.com/pvshkng/oto/releases/">
    <img src="https://img.shields.io/github/v/release/pvshkng/oto?color=white&display_name=tag&logoColor=white" alt="Latest Oto Release">
  </a>
  <a href="https://puvish.dev/">
    <img src="https://img.shields.io/badge/built%20by-puvish.dev-white" alt="Built by puvish.dev">
  </a>
</div>
<h1></h1>

Oto is a web-based tablature and music notation editor. It runs entirely in the browser: multiple
tracks and tunings, tab and standard notation side by side, and playback with repeats, tempo and
a metronome.

Built with [SvelteKit](https://svelte.dev/), [shadcn-svelte](https://www.shadcn-svelte.com/) and
[alphaTab](https://alphatab.net/).

## Features

- Multi-track scores with independent tunings
- Tab, standard notation and rhythmic notation views, toggled per track
- Note durations, tuplets, two voices per bar, dynamics
- Structure marks: repeats, voltas, simile marks, segno and coda
- Techniques: hammer-on/pull-off, slide, bend, vibrato, palm mute, harmonics and more
- Playback with speed control, repeats, loop selection and metronome
- Virtual fretboard and piano for note entry
- Transpose, detune and capo
- Import from `.gp`, `.gpx`, `.gp3/4/5`, `.gp7`
- Save/load `.oto` files, export PDF, localStorage autosave

## Keyboard shortcuts

| Key                                 | Action                                  |
| ----------------------------------- | --------------------------------------- |
| `Space`                             | Play / stop                             |
| `0`-`9`                             | Enter fret number at the cursor         |
| Arrows                              | Move the cursor                         |
| `Shift`+`←/→`                       | Extend the loop selection               |
| `Enter` / `Shift+Enter`             | Insert a beat after / before the cursor |
| `-`                                 | Delete the beat at the cursor           |
| `Backspace` / `Delete`              | Delete the note at the cursor           |
| `x`                                 | Toggle dead note                        |
| `w h q e s`                         | Set duration                            |
| `.`                                 | Toggle dotted                           |
| `[` / `]`                           | Start / complete a mark span            |
| `Ctrl/⌘+X/C/V`                      | Cut / copy / paste                      |
| `Ctrl/⌘+D` / `Ctrl/⌘+Shift+D`       | Clear / duplicate measure               |
| `Ctrl/⌘+Enter`                      | Insert measure (`Shift` for before)     |
| `Ctrl/⌘+Z` / `Shift+Z` / `Ctrl/⌘+Y` | Undo / redo                             |
| `Ctrl/⌘+S`                          | Save                                    |

## The `.oto` format

`.oto` is a JSON document. A score holds tracks; each track has a tuning and a list of measures;
each measure holds beats; each beat has a duration and a set of notes. Durations are stored as the
denominator of a whole note, so a bar's fill is the sum of beat fractions against the time
signature. See `src/lib/oto/types.ts`.

## Architecture

```
src/lib/
  oto/         # .oto types, duration math, pitch helpers, transpose, (de)serialisation
  notation/    # SMuFL glyphs and SVG layout engine
  audio/       # alphaSynth playback engine, MIDI compiler, metronome
  editing/     # note/beat entry logic
  io/          # .oto + PDF file IO, Guitar Pro import
  stores/      # reactive score, cursor, selection and playback state
  components/  # Toolbar, TrackHeader, TrackStaff, EditPanel, Fretboard, Piano
```

## Develop

```sh
bun install
bun run dev          # http://localhost:5173
bun run check        # svelte-check (types)
bun run lint         # prettier + eslint
bun run test:unit -- --run --project server   # unit tests (node)
bun run build        # production build (static adapter)
```
