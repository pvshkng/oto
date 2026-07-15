# Soundfonts

Playback uses the MuseScore General soundfont by S. Christian Collins,
released under the MIT license (https://musescore.org/en/handbook/soundfonts).

These files are deliberately kept out of the app build to stay within GitHub
Pages bandwidth limits. The app fetches them at runtime:

- `MuseScore_General.sf3` (standard quality, ~36 MB): served from this
  directory via raw.githubusercontent.com.
- `MuseScore_General.sf2` (high quality, ~208 MB): exceeds GitHub's 100 MB
  file limit, so it is served as a release asset. Upload it to a release
  tagged `soundfont`:

  ```sh
  gh release create soundfont ./MuseScore_General.sf2 --title "Soundfonts" \
    --notes "MuseScore General soundfont assets fetched by the app at runtime."
  ```

URLs are defined in `src/lib/audio/soundfont.ts`.
