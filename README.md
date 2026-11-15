# Circle of Fifths — Interactive Musical Scales & Chords Explorer

> **Live Preview:** [https://musical-scales.juyoung-m-yoo.workers.dev/](https://musical-scales.juyoung-m-yoo.workers.dev/)

An interactive web application built with **React**, **TypeScript**, **Vite**, **Hono**, and **Cloudflare Workers** for exploring the Circle of Fifths, fifths and fourths relationships, scales, and major/minor chords in real time.

## Features

- **Interactive Circle of Fifths Wheel**
  - Dual concentric rings for **Major keys** (outer) and **Relative Minor keys** (inner), plus an outer key-signature perimeter (`0`, `1♯`–`7♯`, `1♭`–`7♭`) and diminished chord (`vii°` / `ii°`) marker.
  - Highlights the active 6-chord diatonic neighborhood with Roman numeral overlays (`IV`, `I`, `V` / `ii`, `vi`, `iii` in Major; `VI`, `III`, `VII` / `iv`, `i`, `v` in Minor).
  - Supports **Standard**, **Sharps (`♯`)**, and **Flats (`♭`)** enharmonic spellings (plus per-slot toggling for `B / C♭`, `F♯ / G♭`, and `D♭ / C♯`), optional wheel rotation to center the active key, and dark/light themes.
  - Keyboard shortcuts: `←` (4th), `→` (5th), `Space` (play tonic), and `M` (toggle Major/Minor).
- **Fifths & Fourths Relationship Explorer**
  - Inspects both the counter-clockwise **Perfect 4th (`+5` semitones)** and clockwise **Perfect 5th (`+7` semitones)** neighbors, showing key signature deltas, `6/7` shared scale notes, and the single shifted pitch (such as `B → B♭` or `F → F♯`).
  - Includes one-click cadence auditions (`I–IV–I` / `I–V–I`) and animated **Walk 4ths** / **Walk 5ths** playback around the full circle.
- **Major & Minor Chords per Key**
  - Groups each key's diatonic **Major Chords** and **Minor Chords**, alongside its diminished triad, Harmonic Minor `V` (in Minor mode), and direct **Root Parallel Pair** (`Major` vs. `Minor` sharing the same tonic note).
  - Switch between **Triads** and **7th Chords** and toggle **Block Chord** vs. **Arpeggio** voicing.
- **Key Signature Staff, Piano Voicing & Web Audio Synth**
  - Treble-clef SVG staff rendering the exact sharps or flats of the selected key.
  - Clickable 2-octave (`C4`–`B5`) piano keyboard highlighting active chord voicings and scale notes.
  - Built-in Web Audio API polyphonic synthesizer (`Keys`, `Pad`, and `Mute` modes) with scale playback and common chord progressions.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, SVG + Web Audio API
- **Edge Runtime / API:** Hono on Cloudflare Workers

## Local Development

Install dependencies:

```bash
bun install
# or: npm install
```

Start the development server:

```bash
bun run dev
# or: npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Testing, Building & Deployment

Run unit and component render tests:

```bash
bun test
```

Typecheck, lint, and build for production:

```bash
bun run build
bun run lint
```

Preview the production build locally or deploy to Cloudflare Workers:

```bash
bun run preview
bun run build && bun run deploy
```
