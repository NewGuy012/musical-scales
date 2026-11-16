<div align="center">
  <img src="./public/logo.png" alt="Circle of Fifths Explorer Logo" width="96" />
  <h1>Circle of Fifths Explorer</h1>
  <p>
    <strong>An interactive music theory studio &amp; multi-instrument companion</strong><br />
    Explore keys, fifths/fourths harmony, diatonic chords, and hand placement across <strong>Piano</strong>, <strong>Guitar</strong>, and <strong>Cello</strong> — powered by zero-dependency Web Audio synthesis.
  </p>

  <p>
    <a href="https://musical-scales.juyoung-m-yoo.workers.dev/">
      <img src="https://img.shields.io/badge/Live_Demo-Launch_Explorer-2563eb?style=for-the-badge&logo=cloudflareworkers&logoColor=white" alt="Launch Live Demo" />
    </a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8" />
    <img src="https://img.shields.io/badge/Web_Audio_API-Synth-10B981?style=flat-square" alt="Web Audio API" />
    <img src="https://img.shields.io/badge/Hono-Cloudflare_Workers-F38020?style=flat-square&logo=hono&logoColor=white" alt="Hono and Cloudflare Workers" />
    <img src="https://img.shields.io/badge/Bun-1.4-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun" />
  </p>

  <p>
    <a href="https://musical-scales.juyoung-m-yoo.workers.dev/">Live App</a> ·
    <a href="#quick-tour">Quick Tour</a> ·
    <a href="#instrument-views">Instruments</a> ·
    <a href="#features">Features</a> ·
    <a href="#keyboard-shortcuts">Shortcuts</a> ·
    <a href="#run-locally">Run Locally</a> ·
    <a href="./docs/architecture.md">Architecture</a>
  </p>
</div>

<br />

<p align="center">
  <img src="./docs/images/circle-of-fifths-wheel.jpg" alt="Interactive Circle of Fifths Wheel" width="100%" />
  <br />
  <sub>Dark &amp; Light themes — interactive Circle of Fifths wheel, treble key signature staff, 4th/5th pitch diffs, diatonic chords, and live instrument views.</sub>
</p>

---

## Quick Tour

1. **Pick any key on the wheel** — Click the outer **Major** or inner **Relative Minor** ring (or press `←` / `→`). Toggle **C Pinned** / **Key at 12:00** to keep `C` fixed or smoothly rotate your tonic to the top.
2. **See why neighbors connect** — Compare counter-clockwise **4th (`+5`)** and clockwise **5th (`+7`)** keys side by side: `6/7` scale notes remain identical while only a single half-step shifts. Audition `I–IV–I` / `I–V–I` cadences or walk continuously around the wheel.
3. **Explore chords, variations & chromatic color** — Switch across **Chords & Progressions** (with **Triads / 7ths** and **Arpeggio** toggles), **Passing & Substitutions** (chromatic slides, diminished symmetry, secondary dominants, tritone subs), or audition **13 chord variations** (`Maj`, `m`, `7`, `maj7`, `m7`, `dim`, `dim7`, `m7♭5`, `aug`, `add9`, `m(add9)`, `sus4`, `sus2`) above the instrument dock.
4. **Switch instruments & learn real songs** — Toggle between **Piano**, **Guitar**, and **Cello** at any time. Audio, voicings, fingerings, and interactive **Real Songs** study guides adapt automatically.

---

## Instrument Views

| Tab        | Layout & Range                                 | Voicings, Overlays & Audio                                                                                                                                                                    | Built-in Song Repertoire                                                                |
| :--------- | :--------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **Piano**  | 2-octave clickable keyboard (`C4`–`B5`)        | Chord voicing highlights, scale-tone dots, procedural Grand Piano synthesis                                                                                                                   | Claude Debussy — _Clair de lune_ (`D♭ Major · 9/8 · 54 BPM · 72 bars`)                  |
| **Guitar** | 6-string, 15-fret neck (`E A D G B e`)         | Open & movable CAGED/barre shapes (`≤ 4` frets), `Voicing` / `All Notes` / `Pentatonic` / `Scale` + `+ Chromatic` overlay, `Notes` / `Intervals`, passing phrases, Karplus-Strong nylon synth | _Amazing Grace_ (arr. Tommy Emmanuel) (`E Major · 3/4 · 76 BPM · 34 bars`)              |
| **Cello**  | 4-string fretless neck (`C2–G2–D3–A3`, fifths) | Closed 4-semitone left-hand frames (`LH Frame`), `Voicing` / `All Notes`, `Notes` / `Intervals` / `Fingers`, `▶ Bow Roll`, bowed vibrato & body-formant synth                                 | J.S. Bach — _Cello Suite No. 1 Prelude (BWV 1007)_ (`G Major · 4/4 · 96 BPM · 42 bars`) |

<table>
  <tr>
    <td width="50%" align="center">
      <strong>Guitar View — 15-Fret CAGED Neck &amp; <em>Amazing Grace</em></strong><br /><br />
      <img src="./docs/images/instrument-guitar.png" alt="Guitar Fretboard View showing Open G chord and Amazing Grace song bars" width="100%" />
    </td>
    <td width="50%" align="center">
      <strong>Cello View — Fretless 5ths Neck &amp; <em>Bach Suite No. 1</em></strong><br /><br />
      <img src="./docs/images/instrument-cello.png" alt="Cello Fingerboard View showing left-hand frame and Bach Cello Suite No. 1 Prelude" width="100%" />
    </td>
  </tr>
</table>

---

## Features

- **Circle & Key Signatures**
  - Concentric Major and Relative Minor rings with Roman numeral overlays (`I–vii°` / `i–VII`) and clickable `↺ 4th` / `5th ↻` arcs
  - Live treble-clef key signature staff SVG and clickable scale-degree strip (`▶ Play Scale`)
  - Global accidental preference (`Standard`, `Sharps ♯`, `Flats ♭`), per-key enharmonic flips (`B/C♭`, `F♯/G♭`, `D♭/C♯`), and one-click **Relative** / **Parallel** key jumps
- **Fifths & Fourths Harmony**
  - Exact `6/7` shared-note comparison and single-pitch half-step diff for adjacent keys
  - Instant `I–IV–I` / `I–V–I` cadence playback and continuous **Walk 4ths** / **Walk 5ths** stepping
- **Chords, Variations & Progressions**
  - Grouped diatonic **Major**, **Minor**, **Diminished**, **Harmonic Minor `V`**, and **Root Parallel Pair** cards
  - 13 interactive **Chord Variations** (`Maj`, `m`, `7`, `maj7`, `m7`, `dim`, `dim7`, `m7♭5`, `aug`, `add9`, `m(add9)`, `sus4`, `sus2`) synced with the active root
  - Curated **Progressions** grouped across **Classics & Cadences**, **Pop & Rock**, **Jazz & Circle**, and **Classical & Sequence** (11 Major, 10 Minor)
- **Passing & Substitutions**
  - Clickable chromatic passing slides, symmetric diminished 7th (`dim7`) families, secondary dominants (`V7/...`), and tritone substitutions (`♭II7`) highlighted live on the wheel and instrument dock
- **Real Songs & Study Guides**
  - Bar-by-bar transport controls, scrubbable timeline slider, jump-to-section **Study Guides**, and synchronized fingerings/stops (including guitar harmonics, hammers, and slides)
- **Zero-Dependency Web Audio & Themes**
  - Header sound switcher (instrument-matched **Auto**, warm **Pad**, or **Muted**) with zero external audio files
  - **Dark** and **Light** UI themes

---

## Keyboard Shortcuts

| Key     | Action                                                 |
| :------ | :----------------------------------------------------- |
| `←`     | Step counter-clockwise to the **Perfect 4th** neighbor |
| `→`     | Step clockwise to the **Perfect 5th** neighbor         |
| `M`     | Toggle between **Major** and **Natural Minor** mode    |
| `Space` | Play the selected key's **tonic chord**                |
| `Esc`   | Stop active playback (or close the shortcuts popover)  |

---

## Run Locally

### Prerequisites

- [Bun](https://bun.sh/) (`bun@1.4.4` recommended)

### Quick Start

```bash
git clone https://github.com/NewGuy012/musical-scales.git
cd musical-scales
bun install
bun dev       # open http://localhost:5173
```

### Available Scripts

| Command           | Description                                                              |
| :---------------- | :----------------------------------------------------------------------- |
| `bun dev`         | Start the Vite + Cloudflare Workers dev server (`http://localhost:5173`) |
| `bun test`        | Run unit, voicing, DSP, and UI tests plus `bun fmt --check`              |
| `bun fmt`         | Format codebase with Bun's native formatter (`bunfig.toml`)              |
| `bun check -b`    | Typecheck across app, Node, and Worker `tsconfig` projects               |
| `bun lint`        | Run `bun check -b` and `bun fmt --check`                                 |
| `bun run build`   | Typecheck and build client + worker bundles into `dist/`                 |
| `bun run preview` | Build and preview the production bundle locally                          |
| `bun deploy`      | Deploy to Cloudflare Workers via Wrangler                                |

<details>
<summary><strong>Project Structure &amp; Architecture</strong> — explore source directories and technical docs</summary>

<br />

```text
musical-scales/
├── docs/
│   ├── architecture.md          # Data flow, DSP, and theory engine overview
│   └── images/                  # README showcase screenshots
├── public/                      # Static brand assets and security headers
├── src/
│   ├── react-app/
│   │   ├── App.tsx              # Root state, keyboard shortcuts, and sequencer
│   │   ├── audio/synth.ts       # Web Audio synth (Piano, Guitar, Cello, Pad)
│   │   ├── components/          # Wheel, staff, chords, color harmony, songs, instruments
│   │   └── theory/              # Scales, chromatic harmony, Guitar/Cello voicings, repertoire
│   └── worker/index.ts          # Hono edge worker with security headers
└── tests/                       # Theory, voicing, audio DSP, and SSR tests
```

See [`docs/architecture.md`](./docs/architecture.md) for the full Mermaid data-flow diagram, Karplus-Strong guitar DSP details, and module-by-module breakdown.

</details>
