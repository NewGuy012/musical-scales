# Multi-Instrument Transcription Pipeline

The offline ingestion pipeline converts authentic scores, tablatures, MIDI files, and YouTube audio/video into normalized, tick-based [`SongDocumentV2`](../src/react-app/theory/songRuntime.ts) repertoire modules for **Piano**, **Guitar**, **Cello**, and **Violin**, while keeping the browser & Cloudflare Worker bundle free of heavy parser dependencies.

---

## Architecture Overview

```text
Tier 1 (Symbolic Scores)
  .gp / .gp3-.gp8 / .gpx / .musicxml / .mxl ──▶ @coderline/alphatab ─┐
  .mid / .midi ────────────────────────────────▶ @tonejs/midi ────────┼─▶ ScoreTrackIR
                                                                     │
Tier 2 (Audio / YouTube)                                             │
  YouTube URL ─▶ yt-dlp ─▶ demucs (htdemucs_6s) ─▶ basic-pitch (.mid)┘
                                                                     │
   ┌─────────────────────────────────────────────────────────────────┘
   ▼
ScoreTrackIR Compiler (scripts/transcription/scoreIr.ts)
  ├─ Repeat & volta unrolling + form deduplication (repeated bar reuse)
  ├─ Variable tempo map (tick-based tempoMap -> runtime ms conversion & practice speeds)
  ├─ Grand-staff merging (RH + LH hand tags) & MIDI CC64 sustain pedal extension (piano)
  ├─ Viterbi ergonomic solver (scripts/transcription/ergonomicSolver.ts)
  │    └─ Preserves explicit TAB strings/frets or solves minimum-shift neck paths (guitar/cello/violin)
  ├─ Key & Roman numeral analyzer (scripts/transcription/harmonicAnalyzer.ts)
  │    └─ Krumhansl-Schmuckler key detection + weighted bar/half-bar harmony
  └─ Emits SongDocumentV2 (.ts module or .json; --legacy for v1 CompactSongSpec) + optional 22.05 kHz WAV
```

---

## Quick Start

### 1. Import Guitar Pro, MusicXML, or MIDI

List available tracks inside a score:

```bash
bun run import-song --input path/to/song.gp5 --list-tracks
```

Import a guitar tab or grand-staff piano score into a TypeScript repertoire module and render a WAV listening check:

```bash
bun run import-song \
  --input path/to/song.gp5 \
  --track 0 \
  --instrument guitar \
  --id my-guitar-piece \
  --out src/react-app/theory/myGuitarPiece.ts \
  --wav /tmp/my-guitar-preview.wav
```

For raw/audio-derived MIDI files (`--instrument piano`, `guitar`, `cello`, or `violin`):

```bash
bun run import-song \
  --input path/to/piano.mid \
  --instrument piano \
  --quantize 16 \
  --split-chords \
  --out src/react-app/theory/myPianoPiece.ts \
  --wav /tmp/my-piano-preview.wav
```

### 2. Import from YouTube Video / Audio

Install local audio tools once:

- `brew install yt-dlp ffmpeg`
- `pipx install basic-pitch`
- `pipx install demucs` (optional, recommended for multi-instrument recordings)

Run the wrapper script:

```bash
scripts/youtube-to-midi.sh "https://www.youtube.com/watch?v=..." \
  --instrument piano \
  --out src/react-app/theory/youtubePiano.ts \
  --wav /tmp/youtube-preview.wav
```

Tips by instrument & recording style:

- **Solo recordings** (solo piano, solo acoustic guitar, solo cello): pass `--no-demucs` so `basic-pitch` reads the clean recording directly without stem-separation artifacts.
- **Full mixes / bands**: Demucs (`htdemucs_6s`) automatically selects `piano.wav` for `--instrument piano`, `guitar.wav` for `--instrument guitar`, and `other.wav` for `cello`/`violin`.
- **Piano rubato & expressive playing**: `basic-pitch` captures polyphonic piano well, though free-tempo rubato or sustained dense pedaling isn't aligned to an external beat tracker automatically (use `--quantize 0` to keep unquantized raw timestamps, or prefer clean MusicXML/MIDI when exact score engraving is available).

---

## Modules

- [`scripts/transcription/importers.ts`](../scripts/transcription/importers.ts): Parses Guitar Pro / MusicXML via `@coderline/alphatab` and Standard MIDI via `@tonejs/midi`, normalizing grand staves (RH + LH), MIDI CC64 sustain pedal intervals, custom tunings (reversed from high-to-low into low-to-high), capos, tie chains, dynamics, hammer-ons/pull-offs, slides, harmonics, palm mutes, let-ring sustains, repeat markers, and volta endings.
- [`scripts/transcription/ergonomicSolver.ts`](../scripts/transcription/ergonomicSolver.ts): Uses dynamic programming (Viterbi) across playable left-hand fret/semitone positions (`MAX_SONG_GUITAR_FRET = 22`, `MAX_SONG_BOWED_SEMITONE = 24`) to minimize position jumps and string crossings when a stringed score lacks explicit tablature (no-op for piano).
- [`scripts/transcription/harmonicAnalyzer.ts`](../scripts/transcription/harmonicAnalyzer.ts): Detects tonal center via Krumhansl-Schmuckler pitch-class correlation and infers bar or half-bar Roman numerals + slash/extended chord symbols.
- [`scripts/transcription/scoreIr.ts`](../scripts/transcription/scoreIr.ts): Linearizes repeats, deduplicates repeated bars into `form`, emits tick-based `SongDocumentV2` (with normalized `chords` palette, `tempoMap`, and unified stop tuples, plus `--legacy` v1 `CompactSongSpec` support), and formats strict-TypeScript modules.
- [`scripts/import-song.ts`](../scripts/import-song.ts): Bun CLI runner supporting `--out` (`.ts`/`.json`), `--json`, `--legacy`, `--list-tracks`, `--quantize`, and offline WAV preview rendering via `renderTimedSequenceOfflineSamples` + `encodeWavPcm16`.
