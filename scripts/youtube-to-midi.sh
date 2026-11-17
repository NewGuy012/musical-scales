#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'EOF'
Usage: scripts/youtube-to-midi.sh <youtube-url> [options]

Downloads audio from YouTube, optionally separates instrument stems with Demucs,
transcribes polyphonic MIDI via Spotify Basic Pitch, and imports into CompactSongSpec.

Options:
  --instrument <type>                 piano | guitar | cello | violin (default: guitar)
  --out-dir <dir>                     Working directory for audio/MIDI (default: /tmp/youtube-import)
  --stem <piano|guitar|other|none>    Stem selection with htdemucs_6s (default: auto by instrument)
  --no-demucs                         Skip Demucs stem separation (faster for solo piano/guitar/cello)
  --quantize <n>                      Grid subdivision passed to import-song (default: 16)
  --out <path>                        Write CompactSongSpec (.ts or .json) via import-song
  --wav <path>                        Render verification WAV preview via import-song
  -h, --help                          Show this help

Dependencies (install locally as needed):
  yt-dlp        brew install yt-dlp
  ffmpeg        brew install ffmpeg
  basic-pitch   pipx install basic-pitch   (or python3 -m pip install basic-pitch)
  demucs        pipx install demucs        (optional, recommended for full mixes)
EOF
}

if [[ $# -eq 0 ]]; then
	usage
	exit 1
fi

URL=""
INSTRUMENT="guitar"
OUT_DIR="/tmp/youtube-import"
STEM="auto"
USE_DEMUCS=1
QUANTIZE="16"
OUT_SPEC=""
OUT_WAV=""

while [[ $# -gt 0 ]]; do
	case "$1" in
		-h|--help)
			usage
			exit 0
			;;
		--instrument)
			INSTRUMENT="${2:?Missing value for --instrument}"
			shift 2
			;;
		--out-dir)
			OUT_DIR="${2:?Missing value for --out-dir}"
			shift 2
			;;
		--stem)
			STEM="${2:?Missing value for --stem}"
			shift 2
			;;
		--no-demucs)
			USE_DEMUCS=0
			shift
			;;
		--quantize)
			QUANTIZE="${2:?Missing value for --quantize}"
			shift 2
			;;
		--out)
			OUT_SPEC="${2:?Missing value for --out}"
			shift 2
			;;
		--wav)
			OUT_WAV="${2:?Missing value for --wav}"
			shift 2
			;;
		-*)
			echo "Unknown option: $1" >&2
			usage >&2
			exit 1
			;;
		*)
			if [[ -z "$URL" ]]; then
				URL="$1"
			else
				echo "Unexpected argument: $1" >&2
				exit 1
			fi
			shift
			;;
	esac
done

if [[ -z "$URL" ]]; then
	echo "Missing <youtube-url>." >&2
	usage >&2
	exit 1
fi

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required tool '$1'. $2" >&2
		exit 1
	fi
}

require_cmd yt-dlp "Install with: brew install yt-dlp"
require_cmd ffmpeg "Install with: brew install ffmpeg"
require_cmd basic-pitch "Install with: pipx install basic-pitch"

if [[ "$STEM" == "none" ]]; then
	USE_DEMUCS=0
elif [[ "$STEM" == "auto" ]]; then
	if [[ "$INSTRUMENT" == "piano" ]]; then
		STEM="piano"
	elif [[ "$INSTRUMENT" == "guitar" ]]; then
		STEM="guitar"
	else
		STEM="other"
	fi
fi

mkdir -p "$OUT_DIR"
RAW_TEMPLATE="$OUT_DIR/source.%(ext)s"

echo "[1/4] Downloading audio with yt-dlp..."
yt-dlp --no-playlist -x --audio-format wav -o "$RAW_TEMPLATE" "$URL"

SOURCE_WAV="$OUT_DIR/source.wav"
if [[ ! -f "$SOURCE_WAV" ]]; then
	echo "Expected downloaded audio at $SOURCE_WAV" >&2
	exit 1
fi

TITLE="$(yt-dlp --no-playlist --print title "$URL" 2>/dev/null | head -n 1 || true)"
TRANSCRIBE_WAV="$SOURCE_WAV"

if [[ "$USE_DEMUCS" -eq 1 ]]; then
	if command -v demucs >/dev/null 2>&1; then
		echo "[2/4] Separating stems with demucs (htdemucs_6s -> $STEM)..."
		DEMUCS_DIR="$OUT_DIR/stems"
		demucs -n htdemucs_6s -o "$DEMUCS_DIR" "$SOURCE_WAV"
		STEM_CANDIDATE="$DEMUCS_DIR/htdemucs_6s/source/${STEM}.wav"
		if [[ -f "$STEM_CANDIDATE" ]]; then
			TRANSCRIBE_WAV="$STEM_CANDIDATE"
		else
			echo "Warning: stem '$STEM_CANDIDATE' not found; falling back to full mix." >&2
		fi
	else
		echo "[2/4] demucs not installed; transcribing full audio mix." >&2
	fi
else
	echo "[2/4] Skipping demucs (--no-demucs)."
fi

echo "[3/4] Transcribing polyphonic MIDI with basic-pitch..."
MIDI_OUT_DIR="$OUT_DIR/midi"
mkdir -p "$MIDI_OUT_DIR"
basic-pitch "$MIDI_OUT_DIR" "$TRANSCRIBE_WAV"

MIDI_FILE="$(find "$MIDI_OUT_DIR" -maxdepth 1 -name '*.mid' | head -n 1 || true)"
if [[ -z "$MIDI_FILE" ]]; then
	echo "basic-pitch did not produce a .mid file in $MIDI_OUT_DIR" >&2
	exit 1
fi

echo "[4/4] Compiling CompactSongSpec via bun run import-song..."
CMD=(bun run import-song --input "$MIDI_FILE" --instrument "$INSTRUMENT" --quantize "$QUANTIZE")
if [[ -n "$TITLE" ]]; then
	CMD+=(--title "$TITLE" --composer "YouTube Transcription")
fi
if [[ -n "$OUT_SPEC" ]]; then
	CMD+=(--out "$OUT_SPEC")
fi
if [[ -n "$OUT_WAV" ]]; then
	CMD+=(--wav "$OUT_WAV")
fi

echo "Running: ${CMD[*]}"
"${CMD[@]}"
