<div align="center">
  <img src="./public/logo.png" alt="Musical Scales Logo" width="88" />
  <h1>Musical Scales</h1>
  <p>
    <strong>An interactive music theory studio &amp; multi-instrument companion</strong><br />
    Explore keys on the Circle of Fifths, build chords and progressions, study real songs, and hear live voicings across <strong>Piano</strong>, <strong>Guitar</strong>, <strong>Violin</strong>, and <strong>Cello</strong> — powered by built-in Web Audio synthesis.
  </p>

  <p>
    <a href="https://musical-scales.juyoung-m-yoo.workers.dev/">
      <img src="https://img.shields.io/badge/Live_Demo-Launch_App-2563eb?style=for-the-badge&logo=cloudflareworkers&logoColor=white" alt="Launch Live Demo" />
    </a>
  </p>

  <p>
    <a href="https://musical-scales.juyoung-m-yoo.workers.dev/">Live App</a> ·
    <a href="#whats-inside">What's Inside</a> ·
    <a href="#instruments--real-songs">Instruments &amp; Real Songs</a> ·
    <a href="#keyboard-shortcuts">Shortcuts</a> ·
    <a href="#run-locally">Run Locally</a>
  </p>
</div>

<br />

<p align="center">
  <img src="./docs/images/studio-piano-dark.png" alt="Musical Scales workspace in dark theme" width="100%" />
  <br />
  <sub><strong>Musical Scales</strong> — top Table of Contents bar with clearly labeled <strong>Circle of Fifths</strong>, <strong>Neighbors</strong>, <strong>Key &amp; Scale</strong>, <strong>Exploration</strong>, and <strong>Instruments</strong> sections.</sub>
</p>

---

## What's Inside

Use the **Contents** bar at the top of the app to jump straight to any section—including a direct **Real Songs** shortcut:

1. **Circle of Fifths** — Click the outer **Major** or inner **Relative Minor** ring to switch keys and hear the tonic chord. Toggle **C Pinned** / **Key at 12:00** to keep `C` fixed or rotate the active key to the top.
2. **Neighbors** — Compare adjacent **4th** and **5th** keys side by side (`6/7` shared notes, single half-step change), audition `I–IV–I` / `I–V–I` cadences, or walk smoothly around the circle.
3. **Key & Scale** — View the treble **Key Signature** staff, jump to **Relative** or **Parallel** keys, flip enharmonic spellings (`B/C♭`, `F♯/G♭`, `D♭/C♯`), and play the 7-note scale.
4. **Exploration** — Switch across three focused tabs:
   - **Chords & Progressions**: Diatonic Major, Minor, Diminished, Harmonic `V`, and Parallel chords (Triads or 7ths, block or Arpeggio) plus curated chord progressions.
   - **Passing & Substitutions**: Interactive chromatic passing slides, symmetric `dim7` families, secondary dominants, and tritone substitutions.
   - **Real Songs**: Full bar-by-bar arrangements with study guides, section jumps, practice tips, and a scrubbable transport bar synced to the instrument below.
5. **Instruments** — Switch between **Piano**, **Guitar**, **Violin**, and **Cello** at any time, audition 13 chord variations (`Maj`, `m`, `7`, `maj7`, `m7`, `dim`, `dim7`, `m7♭5`, `aug`, `add9`, `m(add9)`, `sus4`, `sus2`), and play notes directly on the keyboard, fretboard, or fingerboards.

---

## Instruments & Real Songs

| Instrument | Interactive View                                                                                       | Built-in Real Song                                                             |
| :--------- | :----------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **Piano**  | 2-octave clickable keyboard (`C4`–`B5`) with chord highlights & scale-tone dots                        | Claude Debussy — _Clair de lune_ (`D♭ Major · 9/8 · 72 bars`)                  |
| **Guitar** | 6-string, 15-fret neck (`E A D G B e`) with CAGED voicings, Pentatonic/Scale & `+ Chromatic` overlays  | _Amazing Grace_ (arr. Tommy Emmanuel) (`E Major · 3/4 · 34 bars`)              |
| **Violin** | 4-string fretless neck (`G3–D4–A4–E5`) with left-hand frames (`LH Frame`), finger numbers & `Bow Roll` | Jules Massenet — _Méditation (from Thaïs)_ (`D Major · 4/4 · 44 bars`)         |
| **Cello**  | 4-string fretless neck (`C2–G2–D3–A3`) with left-hand frames (`LH Frame`), finger numbers & `Bow Roll` | J.S. Bach — _Cello Suite No. 1 Prelude (BWV 1007)_ (`G Major · 4/4 · 42 bars`) |

<table>
  <tr>
    <td width="50%" align="center">
      <strong>Exploration (Real Songs) &amp; Guitar</strong><br /><br />
      <img src="./docs/images/instrument-guitar.png" alt="Real Songs study guide for Amazing Grace paired with the 15-fret Guitar fretboard" width="100%" />
    </td>
    <td width="50%" align="center">
      <strong>Exploration (Real Songs) &amp; Violin</strong><br /><br />
      <img src="./docs/images/instrument-violin.png" alt="Real Songs study guide for Massenet Méditation from Thaïs paired with the fretless Violin fingerboard" width="100%" />
    </td>
  </tr>
</table>

<details>
<summary><strong>More screenshots</strong> — Cello &amp; Real Songs, Light theme &amp; Circle of Fifths close-up</summary>

<br />

<table>
  <tr>
    <td width="34%" align="center">
      <strong>Cello &amp; Real Songs</strong><br /><br />
      <img src="./docs/images/instrument-cello.png" alt="Real Songs study guide for Bach Cello Suite No. 1 paired with the fretless Cello fingerboard" width="100%" />
    </td>
    <td width="38%" align="center">
      <strong>Light Theme (G Major)</strong><br /><br />
      <img src="./docs/images/studio-piano-light.png" alt="Musical Scales in light theme showing G Major" width="100%" />
    </td>
    <td width="28%" align="center">
      <strong>Circle of Fifths Wheel</strong><br /><br />
      <img src="./docs/images/circle-of-fifths-wheel.jpg" alt="Circle of Fifths interactive key wheel" width="100%" />
    </td>
  </tr>
</table>

</details>

---

## Keyboard Shortcuts

| Key     | Action                                  |
| :------ | :-------------------------------------- |
| `←`     | Step counter-clockwise to the **4th**   |
| `→`     | Step clockwise to the **5th**           |
| `M`     | Toggle **Major** / **Minor** mode       |
| `Space` | Play the active **tonic chord**         |
| `Esc`   | Stop playback (or close shortcuts menu) |

---

## Run Locally

Requires [Bun](https://bun.sh/) (`bun@1.4.4` recommended).

```bash
git clone https://github.com/NewGuy012/musical-scales.git
cd musical-scales
bun install
bun dev       # open http://localhost:5173
```

<details>
<summary><strong>Developer scripts &amp; architecture</strong></summary>

<br />

| Command           | Description                                                   |
| :---------------- | :------------------------------------------------------------ |
| `bun dev`         | Start Vite + Cloudflare Workers dev server                    |
| `bun test`        | Run unit, voicing, audio, and UI tests plus `bun fmt --check` |
| `bun fmt`         | Format codebase with Bun                                      |
| `bun check -b`    | Typecheck app, Node, and Worker projects                      |
| `bun lint`        | Run typecheck and format verification                         |
| `bun run build`   | Build production client and worker bundles into `dist/`       |
| `bun run preview` | Build and preview production bundle locally                   |
| `bun deploy`      | Deploy to Cloudflare Workers via Wrangler                     |

See [`docs/architecture.md`](./docs/architecture.md) for module details, Karplus-Strong guitar DSP notes, and data-flow diagrams.

</details>
