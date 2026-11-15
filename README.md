<div align="center">
  <img src="./public/logo.png" alt="Circle of Fifths Logo" width="112" />
  <h1>Circle of Fifths — Interactive Musical Scales &amp; Chords Explorer</h1>
  <p>
    <strong>Live Preview:</strong>
    <a href="https://musical-scales.juyoung-m-yoo.workers.dev/">https://musical-scales.juyoung-m-yoo.workers.dev/</a>
  </p>
</div>

An interactive web app built with **React**, **TypeScript**, **Vite**, **Hono**, and **Cloudflare Workers** for exploring the Circle of Fifths, fifths and fourths relationships, scales, and major/minor chords across piano and guitar.

## Features

- **Interactive Circle of Fifths** — Concentric Major and Relative Minor rings with Roman numeral overlays, key-signature tracking, enharmonic toggles (`B/C♭`, `F♯/G♭`, `D♭/C♯`), dark/light themes, and keyboard navigation (`←`, `→`, `Space`, `M`).
- **Fifths & Fourths Explorer** — Compares adjacent `+5` (4th) and `+7` (5th) keys (`6/7` shared tones and single-pitch shifts), with cadence auditions (`I–IV–I`, `I–V–I`) and animated circle walks.
- **Major & Minor Chords** — Displays each key's diatonic Major and Minor chords, diminished chord, Harmonic Minor `V`, and Root Parallel Pair with **Triads / 7ths** and **Block / Arpeggio** modes.
- **Piano & Guitar Tab Views** — Switch between a clickable 2-octave (`C4`–`B5`) piano keyboard and a 15-fret guitar fretboard featuring CAGED/open/barre voicings, neck maps, and scale overlays.
- **Treble Staff & Web Audio Synth** — Live treble-clef key signature SVG and zero-dependency polyphonic Web Audio playback (`Keys`, `Pad`, `Mute`) for scales, chords, and progressions.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, SVG + Web Audio API
- **Edge Runtime / API:** Hono on Cloudflare Workers

## Local Development

```bash
bun install   # or: npm install
bun run dev   # or: npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Testing, Building & Deployment

```bash
bun test                 # Run music theory, fretboard & UI tests
bun run build            # Typecheck and build client + worker bundles
bun run lint             # Lint codebase
bun run preview          # Preview production build locally
bun run build && bun run deploy
```
