<div align="center">
  <img src="./public/logo.png" alt="Circle of Fifths Logo" width="108" />
  <h1>Circle of Fifths Explorer</h1>
  <p>An interactive music theory and instrument companion for learning keys, fifths/fourths harmony, chords, and hand placement across <strong>Piano</strong>, <strong>Guitar</strong>, and <strong>Cello</strong>.</p>
  <p>
    <strong>Live Preview:</strong>
    <a href="https://musical-scales.juyoung-m-yoo.workers.dev/">https://musical-scales.juyoung-m-yoo.workers.dev/</a>
  </p>
</div>

## What You Can Explore

- **Interactive Circle of Fifths** — Click any key on the concentric Major (outer) and Relative Minor (inner) rings to inspect its key signature, scale notes on a treble staff, and enharmonic twins (`B/C♭`, `F♯/G♭`, `D♭/C♯`).
- **Fifths & Fourths Relationships** — See how neighboring keys move by `+5` (fourth) or `+7` (fifth) while sharing `6/7` scale notes, audition `I–IV–I` / `I–V–I` cadences, or walk smoothly around the circle.
- **Major & Minor Chords** — Explore every key's diatonic chords, Harmonic Minor `V`, and parallel Major/Minor tonic pair with **Triads / 7ths** and **Block / Arpeggio** playback.
- **Learn from Real Songs** — Play curated arrangements synchronized live to the Circle of Fifths and instrument hand positions, or click any measure bar to jump straight to that chord.

## Instrument Tabs & Built-in Songs

Switch tabs at any time — audio automatically adapts via **Instrument** mode (with **Pad** and **Mute** toggles in the header):

| Tab             | What You See                        | Hand Placement Focus                                | Song Example                                            |
| :-------------- | :---------------------------------- | :-------------------------------------------------- | :------------------------------------------------------ |
| **Piano View**  | 2-octave keyboard (`C4`–`B5`)       | Highlighted chord voicings & scale dots             | _Do-Re-Mi_ (_The Sound of Music_)                       |
| **Guitar View** | 15-fret neck (`E A D G B e`)        | CAGED open/barre shapes, strumming & scale overlays | _Amazing Grace_                                         |
| **Cello View**  | Fretless neck (`C2–G2–D3–A3`, 5ths) | Closed 4-semitone left-hand frames & fingers `0–4`  | _Bach — Cello Suite No. 1 (Prelude)_ _(Cello tab only)_ |

## Keyboard Shortcuts

- `←` / `→` — Step counter-clockwise (fourths) or clockwise (fifths) around the wheel
- `M` — Toggle Major / Minor mode
- `Space` — Play the selected key's tonic chord

## Run Locally

Built with **React 19**, **TypeScript**, **Vite**, **Web Audio API**, **Hono**, and **Cloudflare Workers**.

```bash
bun install
bun dev       # open http://localhost:5173
```

```bash
bun test      # run unit and UI tests
bun fmt       # format codebase with Bun's native formatter
bun check -b  # typecheck across all tsconfig projects with Bun
bun lint      # run bun check -b and bun fmt --check
bun run build # typecheck and build client + worker bundles
bun deploy    # deploy to Cloudflare Workers
```
