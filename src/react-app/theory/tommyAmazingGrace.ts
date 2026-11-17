import { STANDARD_TUNING, parseGuitarStops } from "./guitarFretboard";
import type {
	CompactSongSpec,
	NotationBarSpec,
	SongNoteEvent,
} from "./songRuntime";

const EIGHTH_MS = 330; // 9/8 compound triple at dotted-quarter = 61 BPM (990ms per beat)
const SIXTEENTH_MS = EIGHTH_MS / 2;
const TRIPLET_16_MS = EIGHTH_MS / 3;

function durToMs(dur: string): number {
	switch (dur) {
		case "1":
			return EIGHTH_MS * 9;
		case "2.":
			return EIGHTH_MS * 6;
		case "2":
			return EIGHTH_MS * 4;
		case "4.":
			return EIGHTH_MS * 3;
		case "4":
			return EIGHTH_MS * 2;
		case "8.":
			return Math.round(EIGHTH_MS * 1.5);
		case "8":
			return EIGHTH_MS;
		case "16":
			return SIXTEENTH_MS;
		case "3":
			return TRIPLET_16_MS;
		default:
			throw new Error(`Unsupported Amazing Grace duration token: "${dur}"`);
	}
}

const CHROMATIC = [
	"C",
	"C♯",
	"D",
	"D♯",
	"E",
	"F",
	"F♯",
	"G",
	"G♯",
	"A",
	"A♯",
	"B",
];

function midiToSharpName(midi: number): string {
	return `${CHROMATIC[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Parses compact notation strings like "0:0+2:2+3:1/4.~1.4 4:12h+5:12h/4~1.5"
 * into SongNoteEvents with generous sustain (~s suffix) and tight pinches.
 */
function parseAmazingGraceBar(
	notation: string,
	chordSymbol: string,
): SongNoteEvent[] {
	return notation
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((raw) => {
			const slashIdx = raw.indexOf("/");
			if (slashIdx === -1) {
				throw new Error(`Missing duration in Amazing Grace token "${raw}"`);
			}
			const stopPart = raw.slice(0, slashIdx);
			const durAndRing = raw.slice(slashIdx + 1);
			const tildeIdx = durAndRing.indexOf("~");
			const dur = tildeIdx === -1 ? durAndRing : durAndRing.slice(0, tildeIdx);
			const ringSec =
				tildeIdx === -1 ? undefined : Number(durAndRing.slice(tildeIdx + 1));
			const stepDurationMs = durToMs(dur);
			const { guitarStops, midi } = parseGuitarStops(stopPart);
			const topMidi = Math.max(...midi);
			const hasHarmonic = guitarStops.some((s) => s.technique === "harmonic");
			const noteName = midiToSharpName(topMidi);
			const label =
				midi.length >= 3
					? `${chordSymbol} (${noteName})`
					: hasHarmonic
						? `<${guitarStops.find((s) => s.technique === "harmonic")?.fret}> ${noteName}`
						: midi.length === 2
							? `${midiToSharpName(midi[0])}+${noteName}`
							: noteName;
			// Let bass & ringing melody sustain naturally without abrupt staccato cutoffs
			const defaultSustainMs = Math.min(
				Math.max(stepDurationMs * 1.45, stepDurationMs <= 180 ? 360 : 620),
				2200,
			);
			const durationSec = Number(
				(ringSec ?? defaultSustainMs / 1000).toFixed(3),
			);
			const event: SongNoteEvent = {
				midi,
				durationSec,
				stepDurationMs,
				noteLabel: label,
				guitarStops,
			};
			// Only gently roll 3+ note chords; 1-2 note pinches speak together tightly
			if (midi.length >= 3) {
				event.spreadSec = 0.022;
			}
			return event;
		});
}

const AMAZING_GRACE_BARS: Array<NotationBarSpec & { circleSlotIndex: number }> =
	[
		{
			barNumber: 1,
			chordSymbol: "E (Pickup)",
			roman: "I (anacrusis)",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "B"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "Verse 1 pickup (PDF m.0): unison B3 slide up C♯4–E4",
			notation: "3:4s+4:0/8~0.95 3:6s/8~0.7 3:9/8~0.8",
		},
		{
			barNumber: 2,
			chordSymbol: "E",
			roman: "I",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "B"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.1 ('-maz-ing'): open E4 over E2 bass + G♯4–A4–G♯4 triplet",
			notation:
				"5:0/8~1.6 0:0/4~1.5 4:7s/16 4:9/8 3:9/16 4:7/16 3:9/16 0:0+4:9/4~1.3 4:9/3 4:10s/3 4:9/3",
		},
		{
			barNumber: 3,
			chordSymbol: "Eaug/G♯ → Aadd9 → A♯°7",
			roman: "I+6 → IVadd9 → ♯iv°7",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "C", "A"],
			circleDegree: 4,
			circleSlotIndex: 11,
			cue: "PDF m.2 ('grace'): Eaug/G♯ walking through Aadd9 & A♯dim7",
			notation:
				"2:6+3:5+4:7/8~0.85 4:7/3 4:8s/3 4:7/3 0:4+3:6/8~0.9 0:5+3:6+4:0+5:0/4.~1.4 1:1+2:2+3:0+4:2/4~0.95 5:0/8~0.65",
		},
		{
			barNumber: 4,
			chordSymbol: "E → B7/F♯",
			roman: "I → V7/5",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["B", "D♯", "F♯", "A"],
			circleDegree: 5,
			circleSlotIndex: 1,
			cue: "PDF m.3 ('how sweet'): E chord sliding over F♯2 bass into B7/F♯",
			notation:
				"0:0+2:2+3:1+4:0/4~1.2 4:0/8~0.6 0:2/8~1.2 2:2s/16 2:1/16 3:2/8 4:0/4~0.9 5:0/8~0.65",
		},
		{
			barNumber: 5,
			chordSymbol: "E",
			roman: "I",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "B"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.4 ('the sound'): ringing E into G-string blues slide pickup",
			notation:
				"0:0+3:1+4:0+5:0/4.~1.7 0:0/8~1.2 3:2s/8 3:4/8 3:5s/16 3:4/16 3:2/8 3:0/8",
		},
		{
			barNumber: 6,
			chordSymbol: "C♯m7",
			roman: "vi7",
			quality: "minor",
			guitarKind: "minor",
			chordNotes: ["C♯", "E", "G♯", "B"],
			circleDegree: 6,
			circleSlotIndex: 0,
			cue: "PDF m.5 ('that saved'): C♯m7 C♯4–D♯4 turnaround & B4 reach",
			notation:
				"1:4+3:4+4:2/4~1.4 4:4/8 1:4+3:4+4:2/8~1.1 4:4/16 4:2/16 4:0/16 4:2/16 4:4/8 5:2/8 5:7/8~0.8",
		},
		{
			barNumber: 7,
			chordSymbol: "F♯m7 → C9♭5 → B7♯5",
			roman: "ii7 → subV9 → V7+5",
			quality: "minor",
			guitarKind: "7",
			chordNotes: ["F♯", "A", "C♯", "E"],
			circleDegree: 2,
			circleSlotIndex: 2,
			cue: "PDF m.6 ('a wretch'): F♯m7 arpeggio into tritone C9♭5 → B7♯5",
			notation:
				"1:9+3:9/8~1.1 4:10/3 5:7/3 4:10/3 4:9/8 3:9/8 0:9/16 0:8/16 0:8+2:8+3:7+4:7/8~0.9 0:7+2:7+3:8+4:8+5:7/4~1.2 0:7/8~0.9",
		},
		{
			barNumber: 8,
			chordSymbol: "B7♯5 → E/G♯",
			roman: "V7+5 → I6",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["B", "D♯", "G", "A"],
			circleDegree: 5,
			circleSlotIndex: 1,
			cue: "PDF m.7 ('like me'): holding B7♯5 before high double-stop answer",
			notation:
				"0:7+2:7+3:8+4:8+5:7/2~1.5 5:0/8~0.6 2:7+3:9/8~0.75 5:7/8 3:9+4:9/8~0.85 3:9+4:9+5:7/8~1.1",
		},
		{
			barNumber: 9,
			chordSymbol: "E → Eaug → E7",
			roman: "I → I+ → I7",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["E", "G♯", "B", "D"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.8 ('I once'): open E2 under chromatic triad walk into E7",
			notation:
				"0:0/4.~1.4 2:3+3:2+4:3/8 2:2+3:1+4:2/8 5:0/8 0:0/8~1.1 2:3+3:2+4:3/8 2:4+3:3+4:4/8",
		},
		{
			barNumber: 10,
			chordSymbol: "E7",
			roman: "I7",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["E", "G♯", "B", "D"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.9 ('was lost'): E7 chord hits over G♯2 bass & A4–B4 pickup",
			notation:
				"0:0+2:3+3:2+4:3/8~1.0 2:4+3:3+4:4/4~0.9 2:3+3:2+4:3/8 2:4+3:3+4:4/8 0:4/8~1.0 3:7s/16 3:9/16 5:5/8 5:7/8",
		},
		{
			barNumber: 11,
			chordSymbol: "A → A♯°7",
			roman: "IV → ♯iv°7",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["A", "C♯", "E"],
			circleDegree: 4,
			circleSlotIndex: 11,
			cue: "PDF m.10 ('but now I'): G4→F♯4 on A2 bass moving into A♯dim7",
			notation:
				"1:0+4:8/8~1.2 4:7/4~0.9 5:0/8 2:2+5:0/8~0.9 4:2/16 4:3/16 1:1+4:0/8~0.95 2:2/8 4:2/8",
		},
		{
			barNumber: 12,
			chordSymbol: "E/B → C°7",
			roman: "I64 → ♯v°7",
			quality: "major",
			guitarKind: "dim7",
			chordNotes: ["C", "D♯", "F♯", "A"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.11 ('am found'): flowing E/B open-string harp into Cdim7",
			notation:
				"1:2+5:0/8~1.3 2:2/8~0.9 3:1/8 4:0/8 5:0/8 4:0/8 1:2/16 1:3/16 2:4/16 3:2/16 4:4/16 5:0/16",
		},
		{
			barNumber: 13,
			chordSymbol: "C♯m9/G♯",
			roman: "vi9/5",
			quality: "minor",
			guitarKind: "minor",
			chordNotes: ["C♯", "E", "G♯", "B", "D♯"],
			circleDegree: 6,
			circleSlotIndex: 0,
			cue: "PDF m.12 ('was blind'): full C♯m9 cascade & descending A4–G♯4–F♯4–E4",
			notation:
				"0:4/8~1.5 1:4/8~1.2 2:2/8~0.9 3:4/8 4:4/8 5:0/8 3:4+4:2p/16 4:4/16 5:5/16 5:4/16 5:2/16 5:0/16",
		},
		{
			barNumber: 14,
			chordSymbol: "F♯9 → B7",
			roman: "V9/V → V7",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["F♯", "A♯", "C♯", "E", "G♯"],
			circleDegree: 5,
			circleSlotIndex: 2,
			cue: "PDF m.13 ('but now'): F♯9 with A–A♯–B chromatic bass into B7",
			notation:
				"0:2+3:3+5:2p/8~1.3 5:4/4~0.95 1:0/8 1:1/8 1:2/8 3:2+4:3s/16 4:2/16 4:0/8 4:0/8",
		},
		{
			barNumber: 15,
			chordSymbol: "Asus2 → E/G♯ → F♯m11",
			roman: "IVsus2 → I6 → ii11",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["A", "B", "E"],
			circleDegree: 4,
			circleSlotIndex: 11,
			cue: "PDF m.14 ('I see'): descending scalar bass Asus2 → E/G♯ → F♯m11",
			notation:
				"1:0+3:2+4:0+5:0/4.~1.4 0:4+3:4+4:0+5:0/4.~1.4 0:2+3:2+4:0+5:0/4.~1.4",
		},
		{
			barNumber: 16,
			chordSymbol: "E → B7",
			roman: "I → V7",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["E", "G♯", "B"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.15: E major G→G♯ hammer turnaround & B7 Verse 2 pickup",
			notation:
				"0:0+2:2+3:0+4:0+5:0/8~1.3 3:1+4:0+5:0/4.~1.4 0:0/4~1.1 1:2+3:2+4:0/8~0.9 4:2/8 5:0/8",
		},
		{
			barNumber: 17,
			chordSymbol: "E (Verse 2)",
			roman: "I",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "B"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "Verse 2 PDF m.16: steady low-E thumb under B-string 2–4–5–4–2–0",
			notation:
				"0:0+5:0/4.~1.5 0:0+2:2+3:1+4:0/4~1.1 0:0/8~1.0 3:4+4:2/16 4:4s/16 4:5s/16 4:4/16 4:2/16 4:0/16",
		},
		{
			barNumber: 18,
			chordSymbol: "E/G♯ → Eaug",
			roman: "I6 → I+6",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "B", "C"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.17: E/G♯ melody lift into ringing Eaug dyad",
			notation:
				"0:4+5:2/8~1.1 5:4/4~1.0 0:4+2:4+3:4+4:4/4~1.2 0:4/8~0.9 0:4+3:5+4:5/8~0.95 3:7+4:7/4~1.0",
		},
		{
			barNumber: 19,
			chordSymbol: "Aadd9 → A♯°7",
			roman: "IVadd9 → ♯iv°7",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["A", "C♯", "E", "B"],
			circleDegree: 4,
			circleSlotIndex: 11,
			cue: "PDF m.18: open Aadd9 shimmer walking into A♯dim7",
			notation:
				"0:5+5:0/4~1.3 2:7/8~0.85 3:6/8 5:0/8 5:0/8 1:1+2:2+3:0+4:2/4~0.95 5:0/8",
		},
		{
			barNumber: 20,
			chordSymbol: "E6 → B7/F♯",
			roman: "I6 → V7/5",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["E", "G♯", "C♯"],
			circleDegree: 5,
			circleSlotIndex: 1,
			cue: "PDF m.19: warm E6 color over F♯2 bass into B7/F♯",
			notation:
				"0:0+2:2+3:1+4:2/4~1.2 5:0/8~0.6 0:2/8~1.2 2:2s/16 2:1/16 3:2/8 4:0/4~0.9 5:0/8",
		},
		{
			barNumber: 21,
			chordSymbol: "E",
			roman: "I",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "B"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.20: full E chord pulsing into B-string slide lick",
			notation:
				"0:0+2:2+3:1+4:0/4.~1.6 0:0/4~1.2 3:4/8 4:2/16 4:4s/16 4:5s/16 4:4/16 4:2/16 4:0/16",
		},
		{
			barNumber: 22,
			chordSymbol: "C♯m7",
			roman: "vi7",
			quality: "minor",
			guitarKind: "minor",
			chordNotes: ["C♯", "E", "G♯", "B"],
			circleDegree: 6,
			circleSlotIndex: 0,
			cue: "PDF m.21: C♯m7 groove soaring up to 10→12 E5 slide",
			notation:
				"1:4+3:4+4:2/4~1.3 4:4/8 1:4+3:4+4:2/8~1.1 4:4/16 4:2/16 4:0/16 5:2/16 5:7/8 5:10s/16 5:12/8.~1.2",
		},
		{
			barNumber: 23,
			chordSymbol: "F♯m7 → C9♭5 → B7♯5",
			roman: "ii7 → subV9 → V7+5",
			quality: "minor",
			guitarKind: "7",
			chordNotes: ["F♯", "A", "C♯", "E"],
			circleDegree: 2,
			circleSlotIndex: 2,
			cue: "PDF m.22–23: F♯m7 descending to C9♭5 & high B4–C♯5 pickup",
			notation:
				"1:9+3:9+5:7/8~1.2 4:10/8 3:9/8 4:9/8 0:9/16 0:8/16 0:8+2:8+3:7+4:7/8~0.9 0:7+2:7+3:8+4:8+5:7/8~1.1 3:7+4:9/16 5:7/16 5:7s/16 5:9/16",
		},
		{
			barNumber: 24,
			chordSymbol: "E7",
			roman: "I7",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["E", "G♯", "B", "D"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.24: E7 high chime voicing (7/7/9) over chromatic 6th triads",
			notation:
				"0:0+3:7+4:7/4~1.2 3:9+4:7+5:9/8 2:3+3:2+4:3/16 5:0/16 2:2+3:1+4:2/16 5:0/16 4:2/16 5:0/16 2:3+3:2+4:3/8 2:4+3:3+4:4/4",
		},
		{
			barNumber: 25,
			chordSymbol: "E7",
			roman: "I7",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["E", "G♯", "B", "D"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.25: E7 chord stabs over E2–G♯2 walking to high A4–B4",
			notation:
				"0:0+2:3+3:2+4:3/8~1.0 2:4+3:3+4:4/4~0.95 2:3+3:2+4:3/8 2:4+3:3+4:4/8 0:4/8~1.0 3:7s/16 3:9/16 5:5/8 5:7/8",
		},
		{
			barNumber: 26,
			chordSymbol: "A7 → A♯°7",
			roman: "IV7 → ♯iv°7",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["A", "C♯", "E", "G"],
			circleDegree: 4,
			circleSlotIndex: 11,
			cue: "PDF m.26: gospel A7 blue slide into A♯dim7",
			notation:
				"1:0+5:8s/8~1.2 5:7/4~0.9 5:0/8 2:2+3:1/16 5:0/16 4:3/16 4:2/16 1:1+4:0/8~1.0 2:2/8 4:2/8",
		},
		{
			barNumber: 27,
			chordSymbol: "B7 → G♯7♯5",
			roman: "V7 → III7+5",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["B", "D♯", "F♯", "A"],
			circleDegree: 5,
			circleSlotIndex: 1,
			cue: "PDF m.27: B7 bass line A2–B2–C3–C♯3 ascending into G♯7♯5",
			notation:
				"1:2+4:0/4~1.2 3:1+4:0/8 1:0/8 1:2/8 1:3/8 1:4/8 0:4+2:4+3:5+4:5/8~1.0 3:4+4:5/8",
		},
		{
			barNumber: 28,
			chordSymbol: "C♯m7 → C°7",
			roman: "vi7 → ♯v°7",
			quality: "minor",
			guitarKind: "minor",
			chordNotes: ["C♯", "E", "G♯", "B"],
			circleDegree: 6,
			circleSlotIndex: 0,
			cue: "PDF m.28: C♯m7 climbing cleanly across Cdim7 passing chord",
			notation:
				"1:4/8~1.1 3:4/8 4:5/8~0.9 1:3/8~1.1 4:4/8 5:7/8 5:5/8 1:3/8 4:4/8",
		},
		{
			barNumber: 29,
			chordSymbol: "B6 → C♯°7 → B9/D♯",
			roman: "V6 → vi°7 → V9/3",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["B", "D♯", "F♯", "G♯"],
			circleDegree: 5,
			circleSlotIndex: 1,
			cue: "PDF m.29: parallel chord climb B6 → C♯dim7 → B9/D♯",
			notation:
				"1:2+2:4+3:4+4:4/4.~1.3 1:4+3:3+4:2/4~0.95 4:3/8 2:1+3:2+4:2+5:2/4.~1.3",
		},
		{
			barNumber: 30,
			chordSymbol: "Asus2 → E/G♯ → F♯m11",
			roman: "IVsus2 → I6 → ii11",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["A", "B", "E"],
			circleDegree: 4,
			circleSlotIndex: 11,
			cue: "PDF m.30: open-string Asus2 → E/G♯ → F♯m11 sigh",
			notation:
				"1:0+3:2+4:0+5:0/4.~1.4 0:4+3:4+4:0+5:0/4.~1.4 0:2+3:2+4:0+5:0/4.~1.4",
		},
		{
			barNumber: 31,
			chordSymbol: "E",
			roman: "I",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "B"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.31: open E hammer + D-string slide into Verse 3 harmonics",
			notation:
				"0:0+2:2+3:0+4:0+5:0/8~1.3 3:1+4:0+5:0/4.~1.4 0:0/4~1.1 2:2/8 2:4s/8 2:7/8",
		},
		{
			barNumber: 32,
			chordSymbol: "E (Bell Harmonics)",
			roman: "I",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "B"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "Verse 3 PDF m.32: low thumb groove + 12th-fret <12> B4+E5 harmonics",
			notation:
				"0:0+2:7/4.~1.4 4:12h+5:12h/4.~1.5 3:4/16 3:5p/16 3:4/16 3:2/16 0:0/8~0.9",
		},
		{
			barNumber: 33,
			chordSymbol: "E",
			roman: "I",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "B"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.33: rolling thumb-and-chime 12th-fret harmonic echoes",
			notation:
				"0:0/8~1.2 3:4/16 3:6/16 4:4/8 4:12h+5:12h/4.~1.5 0:0/8~1.0 3:4/16 3:6/16 4:4/16 4:6/16",
		},
		{
			barNumber: 34,
			chordSymbol: "A7",
			roman: "IV7",
			quality: "major",
			guitarKind: "7",
			chordNotes: ["A", "C♯", "E", "G"],
			circleDegree: 4,
			circleSlotIndex: 11,
			cue: "PDF m.34: A7 thumb groove with shimmering <12> bell harmonics",
			notation:
				"1:0+3:4/8~1.1 3:5/16 3:4/16 3:2/8 4:12h+5:12h/4.~1.5 0:0/8~0.9 2:2p/16 2:4/16 1:3/8",
		},
		{
			barNumber: 35,
			chordSymbol: "Asus2 → E/G♯ → F♯m11",
			roman: "IVsus2 → I6 → ii11",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["A", "B", "E"],
			circleDegree: 4,
			circleSlotIndex: 11,
			cue: "PDF m.66 final cadence setup: Asus2 → E/G♯ → F♯m11",
			notation:
				"1:0+3:2+4:0+5:0/4.~1.4 0:4+3:4+4:0+5:0/4.~1.4 0:2+3:2+4:0+5:0/4.~1.4",
		},
		{
			barNumber: 36,
			chordSymbol: "Emaj9",
			roman: "Imaj9",
			quality: "major",
			guitarKind: "major",
			chordNotes: ["E", "G♯", "B", "D♯", "F♯"],
			circleDegree: 1,
			circleSlotIndex: 0,
			cue: "PDF m.74 finale: resonant Emaj9 chord & 12th-fret harmonic crown",
			notation: "0:0+1:2+2:4+3:1+4:0+5:0/2.~2.6 4:12h+5:12h/4.~2.2",
		},
	];

function buildSteps(): Array<{
	midiNotes: number[];
	noteEvents: SongNoteEvent[];
}> {
	return AMAZING_GRACE_BARS.map((bar) => {
		const noteEvents = parseAmazingGraceBar(bar.notation, bar.chordSymbol);
		const firstStop = noteEvents[0]?.guitarStops?.[0];
		const midiNotes = firstStop
			? [STANDARD_TUNING[firstStop.stringIndex].openMidi + firstStop.fret]
			: (noteEvents[0]?.midi.slice(0, 1) ?? [64]);
		return {
			midiNotes,
			noteEvents,
		};
	});
}

const AMAZING_GRACE_STEPS = buildSteps();

export const TOMMY_AMAZING_GRACE_SPEC: CompactSongSpec = {
	id: "amazing-grace-guitar",
	title: "Amazing Grace",
	composerOrSource: "Traditional · arr. Tommy Emmanuel",
	subtitle: "Fingerstyle E major (9/8) · Verse 1, Verse 2 & Bell Harmonics",
	instruments: ["guitar"],
	keySlot: 4,
	keyMode: "major",
	keyLabel: "E Major",
	timeSignature: "9/8",
	bpm: 63,
	theorySummary:
		"Transcribed directly from the Tim Van Roy 9/8 E Major guitar score: opens with Verse 1's rubato chord-melody over E – Eaug/G♯ – Aadd9 – A♯°7 – B7/F♯ and C♯m7 – F♯m7 – C9♭5 – B7♯5, expands into Verse 2's richer bass fills and chromatic E6/E7 voicings, and closes cleanly with Verse 3's 12th-fret bell harmonics and Emaj9 cadence.",
	studyGuide: {
		vibeAndSound:
			"Slow, singing 9/8 fingerstyle E major: open treble strings ring continuously while gospel bass inversions and 12th-fret harmonics add orchestral warmth.",
		harmonyHook:
			"Built on E – A – B7 dressed up with chromatic bass lines (Eaug/G♯, Aadd9, A♯°7), a tritone substitution (C9♭5 → B7♯5), and the signature Asus2 → E/G♯ → F♯m11 turnaround.",
		practiceTips: [
			"Think 3 broad beats per 9/8 bar (1-2-3), letting each low bass note sustain cleanly under the upper-string melody.",
			"Notice how C♯m7 → F♯m7 → C9♭5 → B7♯5 walks down chromatically from C♯2/F♯2 through C2 into B2.",
			"Touch the B and e strings lightly right above the 12th fret wire for the Bar 32–36 bell harmonics, then resolve gently on the ringing Emaj9 chord.",
		],
		sections: [
			{
				id: "ag-sec-1",
				title: "1. Verse 1 (PDF Bars 0–15)",
				barRange: "Bars 1–16",
				startStepIndex: 0,
				endStepIndex: 15,
				progressionTag: "I – I+ – IVadd9 – V7 – vi7 – ii7 – subV9 – V7",
				insight:
					"States the hymn in compound 9/8 E major from the unison B3 pickup through the iconic C9♭5 → B7♯5 turnaround and Asus2 → E/G♯ → F♯m11 cadence.",
			},
			{
				id: "ag-sec-2",
				title: "2. Verse 2 (PDF Bars 16–31)",
				barRange: "Bars 17–31",
				startStepIndex: 16,
				endStepIndex: 30,
				progressionTag: "I – I+6 – IVadd9 – E7 – B7/G♯7♯5 – IVsus2 – I",
				insight:
					"Deepens the accompaniment with steady alternating bass, a high D5→E5 slide on C♯m7, dense E7 upper-structure triads, and parallel B6 → C♯°7 → B9/D♯ motion.",
			},
			{
				id: "ag-sec-3",
				title: "3. Bell Harmonics & Emaj9 Finale",
				barRange: "Bars 32–36",
				startStepIndex: 31,
				endStepIndex: 35,
				progressionTag: "I – IV7 – IVsus2 – Emaj9",
				insight:
					"Pivots cleanly into Verse 3's 12th-fret harmonic bell chimes over E and A7 thumb patterns before resting on the score's closing Emaj9 voicing.",
			},
		],
	},
	idPrefix: "ag",
	bars: AMAZING_GRACE_BARS.map((bar, idx) => {
		const step = AMAZING_GRACE_STEPS[idx];
		return [
			bar.barNumber,
			bar.chordSymbol,
			bar.roman,
			bar.quality,
			bar.guitarKind,
			bar.chordNotes,
			step.midiNotes,
			bar.circleSlotIndex,
			bar.cue,
			step.noteEvents,
			bar.circleDegree,
		];
	}),
};
