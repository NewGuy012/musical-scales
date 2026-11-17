# Guitar & Cello Transcription Pipeline

The offline ingestion pipeline converts authentic scores, tablatures, MIDI files, and YouTube audio/video into verified `CompactSongSpec` repertoire modules while keeping the browser & Cloudflare Worker bundle free of heavy parser dependencies.

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
  ├─ Repeat & volta unrolling (1st/2nd endings)
  ├─ Variable tempo map (BPM changes -> ms offsets & bar durations)
  ├─ Viterbi ergonomic solver (scripts/transcription/ergonomicSolver.ts)
  │    └─ Preserves explicit TAB strings/frets or solves minimum-shift neck paths
  ├─ Key & Roman numeral analyzer (scripts/transcription/harmonicAnalyzer.ts)
  │    └─ Krumhansl-Schmuckler key detection + weighted bar/half-bar harmony
  └─ Emits CompactSongSpec (.ts module or .json) + optional 22.05 kHz WAV preview
```

---

## Quick Start

### 1. Import Guitar Pro, MusicXML, or MIDI

List available tracks inside a score:

```bash
bun run import-song --input path/to/song.gp5 --list-tracks
```

Import a track into a TypeScript repertoire module and render a WAV listening check:

```bash
bun run import-song \
  --input path/to/song.gp5 \
  --track 0 \
  --instrument guitar \
  --id my-guitar-piece \
  --out src/react-app/theory/myGuitarPiece.ts \
  --wav /tmp/my-guitar-preview.wav
```

For raw/audio-derived MIDI files (`--instrument cello` or `--instrument guitar`):

```bash
bun run import-song \
  --input path/to/cello.mid \
  --instrument cello \
  --quantize 16 \
  --split-chords \
  --out src/react-app/theory/myCelloPiece.ts \
  --wav /tmp/my-cello-preview.wav
```

### 2. Import from YouTube Video / Audio

Install local audio tools once:

- `brew install yt-dlp ffmpeg`
- `pipx install basic-pitch`
- `pipx install demucs` (optional; recommended for multi-instrument recordings)

Run the wrapper script:

```bash
scripts/youtube-to-midi.sh "https://www.youtube.com/watch?v=..." \
  --instrument guitar \
  --out src/react-app/theory/youtubePiece.ts \
  --wav /tmp/youtube-preview.wav
```

Add `--no-demucs` for solo acoustic guitar or solo cello recordings to transcribe directly from the downloaded WAV without stem separation.

---

## Modules

- [`scripts/transcription/importers.ts`](../scripts/transcription/importers.ts): Parses Guitar Pro / MusicXML via `@coderline/alphatab` and Standard MIDI via `@tonejs/midi`, normalizing custom tunings (reversed from high-to-low into low-to-high), capos, tie chains, dynamics, hammer-ons/pull-offs, slides, harmonics, palm mutes, let-ring sustains, repeat markers, and volta endings.
- [`scripts/transcription/ergonomicSolver.ts`](../scripts/transcription/ergonomicSolver.ts): Uses dynamic programming (Viterbi) across playable left-hand fret/semitone positions (`MAX_SONG_GUITAR_FRET = 22`, `MAX_SONG_BOWED_SEMITONE = 24`) to minimize position jumps and string crossings when a score lacks explicit tablature.
- [`scripts/transcription/harmonicAnalyzer.ts`](../scripts/transcription/harmonicAnalyzer.ts): Detects tonal center via Krumhansl-Schmuckler pitch-class correlation and infers bar or half-bar Roman numerals + slash/extended chord symbols.
- [`scripts/transcription/scoreIr.ts`](../scripts/transcription/scoreIr.ts): Linearizes repeats, converts variable tempo tick timelines to millisecond `offsetMs` / `barDurationMs`, batches polyphonic voices, and formats strict-TypeScript `CompactSongSpec` modules.
- [`scripts/import-song.ts`](../scripts/import-song.ts): Bun CLI runner supporting `--out` (`.ts`/`.json`), `--json`, `--list-tracks`, `--quantize`, and offline WAV preview rendering via `renderTimedSequenceOfflineSamples` + `encodeWavPcm16`.
