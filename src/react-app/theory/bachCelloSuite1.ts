import { CELLO_TUNING, MAX_CELLO_SEMITONE } from "./celloFingerboard";
import {
	type ChordQuality,
	NATURAL_PC,
	ascendingNotesToMidi,
	noteOffset,
} from "./circleOfFifths";
import type { GuitarChordKind } from "./guitarFretboard";
import type {
	CelloSongStop,
	CompactSongSpec,
	SongNoteEvent,
} from "./songExamples";

const STEP_16TH_MS = 152;
const LEGATO_16TH_SEC = 0.25;

const STRING_MAP: Record<string, { stringIndex: number; label: string }> = {
	C: { stringIndex: 0, label: "IV" },
	G: { stringIndex: 1, label: "III" },
	D: { stringIndex: 2, label: "II" },
	A: { stringIndex: 3, label: "I" },
};

const STRING_ROMAN = ["IV", "III", "II", "I"] as const;

/**
 * Estimates an idiomatic cello left-hand finger number (0 = open, 1..4 = closed
 * frame or upper-position stop) from semitone offset on a string.
 */
function inferCelloFinger(semitone: number): number {
	if (semitone <= 0) return 0;
	if (semitone <= 2) return 1;
	if (semitone === 3) return 2;
	if (semitone === 4) return 3;
	if (semitone <= 6) return 4;
	if (semitone === 7) return 1; // 4th position index
	if (semitone === 8) return 2;
	if (semitone === 9) return 3;
	return 4;
}

function parseCelloNoteToken(token: string): {
	midi: number;
	pitchName: string;
	stop: CelloSongStop;
	label: string;
} {
	const [pitchPart, stringOverride] = token.split("@");
	const letter = pitchPart[0];
	const octave = Number(pitchPart.slice(-1));
	const basePc = NATURAL_PC[letter];
	if (basePc === undefined || Number.isNaN(octave)) {
		throw new Error(`Invalid Bach cello note token: ${token}`);
	}

	const midi = (octave + 1) * 12 + basePc + noteOffset(pitchPart.slice(0, -1));
	let stringIndex: number;
	if (stringOverride) {
		const mapped = STRING_MAP[stringOverride];
		if (!mapped) {
			throw new Error(`Unknown cello string override: ${stringOverride}`);
		}
		stringIndex = mapped.stringIndex;
	} else if (midi < 43) {
		stringIndex = 0;
	} else if (midi < 50) {
		stringIndex = 1;
	} else if (midi < 57) {
		stringIndex = 2;
	} else {
		stringIndex = 3;
	}

	const openMidi = CELLO_TUNING[stringIndex].openMidi;
	const semitone = midi - openMidi;
	if (semitone < 0 || semitone > MAX_CELLO_SEMITONE) {
		throw new Error(
			`Note ${token} (MIDI ${midi}) exceeds cello fingerboard range on string ${stringIndex}`,
		);
	}

	const finger = inferCelloFinger(semitone);
	const stringRoman = STRING_ROMAN[stringIndex];
	const label =
		semitone === 0
			? `${pitchPart} (Open ${stringRoman})`
			: `${pitchPart} (${stringRoman} · F${finger})`;

	return {
		midi,
		pitchName: pitchPart,
		stop: { stringIndex, semitone, finger },
		label,
	};
}

function parseBachBarNotation(notation: string): SongNoteEvent[] {
	return notation
		.trim()
		.split(/\s+/)
		.map((item) => {
			const [notesRaw, durRaw] = item.split(":");
			const units = durRaw ? Number(durRaw) : 1;
			const parts = notesRaw.split("+").map(parseCelloNoteToken);
			const isChord = parts.length > 1;

			const stepDurationMs = units * STEP_16TH_MS;
			const durationSec =
				units === 1
					? LEGATO_16TH_SEC
					: isChord
						? (stepDurationMs / 1000) * 1.07
						: Math.max(0.36, (stepDurationMs / 1000) * 1.18);

			return {
				midi: parts.map((p) => p.midi),
				durationSec,
				stepDurationMs,
				noteLabel: isChord
					? `${parts.map((p) => p.pitchName).join("–")} Bow Roll`
					: parts[0].label,
				spreadSec: isChord ? 0.08 : 0,
				celloStops: parts.map((p) => p.stop),
			};
		});
}

interface BachBarSpec {
	barNumber: number;
	chordSymbol: string;
	roman: string;
	quality: ChordQuality;
	guitarKind: GuitarChordKind;
	chordNotes: string[];
	circleDegree: number;
	circleSlotIndex?: number;
	cue: string;
	notation: string;
}

const BACH_PRELUDE_BARS: BachBarSpec[] = [
	{
		barNumber: 1,
		chordSymbol: "G",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 1,
		cue: "Open G2 – D3 – B3 (F1) – A3",
		notation: "G2 D3 B3 A3 B3 D3 B3 D3 G2 D3 B3 A3 B3 D3 B3 D3",
	},
	{
		barNumber: 2,
		chordSymbol: "C/G",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["C", "E", "G"],
		circleDegree: 4,
		cue: "G2 pedal – E3 (F1) – C4 (F2)",
		notation: "G2 E3 C4 B3 C4 E3 C4 E3 G2 E3 C4 B3 C4 E3 C4 E3",
	},
	{
		barNumber: 3,
		chordSymbol: "D7/G",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "G2 pedal – F♯3 (F3) – C4 (F2)",
		notation: "G2 F♯3 C4 B3 C4 F♯3 C4 F♯3 G2 F♯3 C4 B3 C4 F♯3 C4 F♯3",
	},
	{
		barNumber: 4,
		chordSymbol: "G",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 1,
		cue: "G2 pedal – G3 (F4) – B3 – F♯3 pass",
		notation: "G2 G3 B3 A3 B3 G3 B3 G3 G2 G3 B3 A3 B3 G3 B3 F♯3",
	},
	{
		barNumber: 5,
		chordSymbol: "Em7",
		roman: "vi7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 6,
		cue: "Em7 arpeggio – C♯3 approach to V/V",
		notation: "G2 E3 B3 A3 B3 G3 F♯3 G3 E3 G3 F♯3 G3 B2 D3 C♯3 B2",
	},
	{
		barNumber: 6,
		chordSymbol: "A7/C♯",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 2,
		circleSlotIndex: 3,
		cue: "C♯3 (III) – G3 – A3 · Secondary dominant",
		notation: "C♯3 G3 A3 G3 A3 G3 A3 G3 C♯3 G3 A3 G3 A3 G3 A3 G3",
	},
	{
		barNumber: 7,
		chordSymbol: "D/F♯",
		roman: "V6",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 5,
		cue: "F♯3 – A3 – D4 · Tonicized D Major",
		notation: "F♯3 A3 D4 C♯4 D4 A3 G3 A3 F♯3 A3 G3 A3 D3 F♯3 E3 D3",
	},
	{
		barNumber: 8,
		chordSymbol: "Em",
		roman: "vi",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["E", "G", "B"],
		circleDegree: 6,
		cue: "E2 (IV · F3) – B2 – G3 string crossing",
		notation: "E2 B2 G3 F♯3 G3 B2 G3 B2 E2 B2 G3 F♯3 G3 B2 G3 B2",
	},
	{
		barNumber: 9,
		chordSymbol: "A7/E",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 2,
		circleSlotIndex: 3,
		cue: "A7 scale surge into D Major",
		notation: "E2 C♯3 D3 E3 D3 C♯3 B2 A2 G3 F♯3 E3 D4 C♯4 B3 A3 G3",
	},
	{
		barNumber: 10,
		chordSymbol: "D",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 5,
		cue: "D Major cadence & arpeggio",
		notation: "F♯3 E3 D3 D4 A3 D4 F♯3 A3 D3 E3 F♯3 A3 G3 F♯3 E3 D3",
	},
	{
		barNumber: 11,
		chordSymbol: "G♯°7",
		roman: "vii°7/ii",
		quality: "diminished",
		guitarKind: "diminished",
		chordNotes: ["G♯", "B", "D", "F"],
		circleDegree: 7,
		circleSlotIndex: 6,
		cue: "G♯3 – D3 – F3 – B3 · Dim7 to Am",
		notation: "G♯3 D3 F3 E3 F3 D3 G♯3 D3 B3 D3 F3 E3 F3 D3 G♯3 D3",
	},
	{
		barNumber: 12,
		chordSymbol: "Am/C",
		roman: "ii6",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["A", "C", "E"],
		circleDegree: 2,
		cue: "Am first inversion · C3–E3–A3–C4",
		notation: "C3 E3 A3 B3 C4 A3 E3 D3 C3 E3 A3 B3 C4 A3 F♯3 E3",
	},
	{
		barNumber: 13,
		chordSymbol: "B7/D♯",
		roman: "V7/vi",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["B", "D♯", "F♯", "A"],
		circleDegree: 3,
		circleSlotIndex: 5,
		cue: "D♯3 – F♯3 – A3 · Pull toward Em",
		notation: "D♯3 F♯3 D♯3 F♯3 A3 F♯3 A3 F♯3 D♯3 F♯3 D♯3 F♯3 A3 F♯3 A3 F♯3",
	},
	{
		barNumber: 14,
		chordSymbol: "Em",
		roman: "vi",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["E", "G", "B"],
		circleDegree: 6,
		cue: "Em resolution & scale descent to G2",
		notation: "G3 F♯3 E3 G3 F♯3 G3 A3 F♯3 G3 F♯3 E3 D3 C3 B2 A2 G2",
	},
	{
		barNumber: 15,
		chordSymbol: "D7/F♯",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "F♯2 (IV) – C3 – D3 · D6/5 transition",
		notation: "F♯2 C3 D3 C3 D3 C3 D3 C3 F♯2 C3 D3 C3 D3 C3 D3 C3",
	},
	{
		barNumber: 16,
		chordSymbol: "G7",
		roman: "V7/IV",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["G", "B", "D", "F"],
		circleDegree: 1,
		circleSlotIndex: 1,
		cue: "G2 – B2 – F♮3 · Dominant pull to IV",
		notation: "G2 B2 F3 E3 F3 B2 F3 B2 G2 B2 F3 E3 F3 B2 F3 B2",
	},
	{
		barNumber: 17,
		chordSymbol: "C/G",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["C", "E", "G"],
		circleDegree: 4,
		cue: "G2 pedal – C3 – E3 · C Major",
		notation: "G2 C3 E3 D3 E3 C3 E3 C3 G2 C3 E3 D3 E3 C3 E3 C3",
	},
	{
		barNumber: 18,
		chordSymbol: "D7/G",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "G2 pedal – F♯3 – C4 · Echo of Bar 3",
		notation: "G2 F♯3 C4 B3 C4 F♯3 C4 F♯3 G2 F♯3 C4 B3 C4 F♯3 C4 F♯3",
	},
	{
		barNumber: 19,
		chordSymbol: "G",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 1,
		cue: "G2 cascade down to low D2",
		notation: "G2 D3 B3 A3 B3 G3 F♯3 E3 D3 C3 B2 A2 G2 F♯2 E2 D2",
	},
	{
		barNumber: 20,
		chordSymbol: "A7/C♯",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 2,
		circleSlotIndex: 3,
		cue: "Deep C♯2 (IV · F1) – A2 – E3 – G3",
		notation: "C♯2 A2 E3 F♯3 G3 E3 F♯3 G3 C♯2 A2 E3 F♯3 G3 E3 F♯3 G3",
	},
	{
		barNumber: 21,
		chordSymbol: "D7/C",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "Open C2 pedal – A2 – D3 – F♯3",
		notation: "C2 A2 D3 E3 F♯3 D3 E3 F♯3 C2 A2 D3 E3 F♯3 D3 E3 F♯3",
	},
	{
		barNumber: 22,
		chordSymbol: "D7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "Climactic D4 fermata & cadenza scale",
		notation: "C2 A2 D3 F♯3 A3 C♯4 D4:4 A2 B2 C3 D3 E3 F♯3 G3",
	},
	{
		barNumber: 23,
		chordSymbol: "D7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "Ascending D7 arpeggio & scale to D4",
		notation: "A3 F♯3 D3 E3 F♯3 G3 A3 B3 C4 A3 F♯3 G3 A3 B3 C4 D4",
	},
	{
		barNumber: 24,
		chordSymbol: "D7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "Chromatic turns E♭4–D4–C♯4–D4 over D7",
		notation: "E♭4 D4 C♯4 D4 D4 C4 B3 C4 C4 A3 F♯3 E3 D3 A2 B2 C3",
	},
	{
		barNumber: 25,
		chordSymbol: "G",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 1,
		cue: "D2–F♯3–C4 resolves to G Major",
		notation: "D2 A2 D3 F♯3 A3 B3 C4 A3 B3 G3 D3 C3 B2 G2 A2 B2",
	},
	{
		barNumber: 26,
		chordSymbol: "G/D",
		roman: "I6/4",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 1,
		cue: "G/D climb into C♯4–B♭3 dim7 turn",
		notation: "D2 G2 B2 D3 G3 A3 B3 G3 C♯4 B♭3 A3 B♭3 B♭3 A3 G♯3 A3",
	},
	{
		barNumber: 27,
		chordSymbol: "A7",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 2,
		circleSlotIndex: 3,
		cue: "A7 arpeggio ascending to C♯4–D4",
		notation: "A3 G3 F♯3 G3 G3 E3 C♯3 B2 A2 C♯3 E3 G3 A3 C♯4 D4 C♯4",
	},
	{
		barNumber: 28,
		chordSymbol: "D",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 5,
		cue: "D Major cascade down to low E2",
		notation: "D4 A3 F♯3 E3 F♯3 A3 D3 F♯3 A2 D3 C♯3 B2 A2 G2 F♯2 E2",
	},
	{
		barNumber: 29,
		chordSymbol: "D7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "Low D2 anchor – cascading D7 scales",
		notation: "D2:2 C4 B3 A3 G3 F♯3 E3 D3 C4 B3 A3 G3 F♯3 E3 D3",
	},
	{
		barNumber: 30,
		chordSymbol: "D7/C",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "Sequential bass walk C3 → B2",
		notation: "C3 B3 A3 G3 F♯3 E3 D3 C3 B2 A3 G3 F♯3 E3 D3 C3 B2",
	},
	{
		barNumber: 31,
		chordSymbol: "D/A",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 5,
		cue: "Open A3 pedal bariolage begins",
		notation: "A2 G3 F♯3 E3 F♯3 A3 D3 A3 E3 A3 F♯3 A3 G3 A3 E3 A3",
	},
	{
		barNumber: 32,
		chordSymbol: "D/A",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 5,
		cue: "D–E–F♯–G line vs open A3 pedal",
		notation: "F♯3 A3 D3 A3 G3 A3 E3 A3 F♯3 A3 D3 A3 G3 A3 E3 A3",
	},
	{
		barNumber: 33,
		chordSymbol: "D/A",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 5,
		cue: "Rising D-string line + open A3 unison",
		notation: "F♯3 A3 D3 A3 E3 A3 F♯3 A3 G3 A3 A3@D A3 B3 A3 D3 A3",
	},
	{
		barNumber: 34,
		chordSymbol: "D7/A",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "Climbs to D4 against open A3",
		notation: "A3@D A3 B3 A3 C4 A3 D3 A3 B3 A3 C4 A3 D4 A3 B3 A3",
	},
	{
		barNumber: 35,
		chordSymbol: "Am7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["A", "C", "E", "G"],
		circleDegree: 2,
		cue: "C4–B3–G3 bariolage against A3",
		notation: "C4 A3 B3 A3 C4 A3 A3@D A3 B3 A3 A3@D A3 B3 A3 G3 A3",
	},
	{
		barNumber: 36,
		chordSymbol: "D7/A",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "Descending A3–G3–F♯3–E3 bariolage",
		notation: "A3@D A3 G3 A3 A3@D A3 F♯3 A3 G3 A3 F♯3 A3 G3 A3 E3 A3",
	},
	{
		barNumber: 37,
		chordSymbol: "D7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "Chromatic climb F3 → B♭3 over D3 pedal",
		notation: "F♯3 A3 D3 E3 F3 D3 F♯3 D3 G3 D3 G♯3 D3 A3 D3 B♭3 D3",
	},
	{
		barNumber: 38,
		chordSymbol: "D7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "Chromatic peak B3 → F♯4 over D3 pedal",
		notation: "B3 D3 C4 D3 C♯4 D3 D4 D3 E♭4 D3 E4 D3 F4 D3 F♯4 D3",
	},
	{
		barNumber: 39,
		chordSymbol: "G/D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 1,
		cue: "High G4–B3–D3 triumphant crossing",
		notation: "G4 B3@D D3 B3@D G4 B3@D G4 B3@D G4 B3@D D3 B3@D G4 B3@D G4 B3@D",
	},
	{
		barNumber: 40,
		chordSymbol: "D7/A",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "High G4–A3–D3 dominant suspension",
		notation: "G4 A3@D D3 A3@D G4 A3@D G4 A3@D G4 A3@D D3 A3@D G4 A3@D G4 A3@D",
	},
	{
		barNumber: 41,
		chordSymbol: "D7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 5,
		cue: "F♯4–C4–D3 dominant 7th climax",
		notation:
			"F♯4 C4@D D3 C4@D F♯4 C4@D F♯4 C4@D F♯4 C4@D D3 C4@D F♯4 C4@D F♯4 C4@D",
	},
	{
		barNumber: 42,
		chordSymbol: "G",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 1,
		cue: "Final G2–B3–G4 Tonic Cadence",
		notation: "G2+B3@D+G4:16",
	},
];

export const BACH_CELLO_SUITE_1_SPEC: CompactSongSpec = {
	id: "bach-cello-suite-1",
	idPrefix: "bach",
	title: "Cello Suite No. 1 — Prelude (BWV 1007)",
	composerOrSource: "J.S. Bach",
	subtitle: "Full 42-bar solo bariolage & harmonic journey in G Major",
	instruments: ["cello"],
	keySlot: 1,
	keyMode: "major",
	keyLabel: "G Major",
	timeSignature: "4/4",
	bpm: 96,
	theorySummary:
		"Full 42-bar BWV 1007 Prelude: opens over an open G2 pedal (I–IV–V7–I), modulates through D Major (V) and Em (vi) to the Bar 22 fermata, climbs through open-A3 bariolage & chromatic passing tones, and resolves to G4.",
	studyGuide: {
		vibeAndSound:
			"Continuous 16th-note string crossings (bariolage) create the illusion of two voices—a resonant open bass drone beneath a singing melodic line.",
		harmonyHook:
			"A masterclass in the Circle of Fifths: anchors home with I–IV–V7–I over an open G2 pedal, then steps clockwise (A7 → D) and back via G7 → C.",
		practiceTips: [
			"Memorize Bars 1–4 first: your open G2 string stays anchored while the upper two voices simply walk I → IV → V7 → I.",
			"Watch the Circle of Fifths in Bars 6–14: Bach visits D (5th), Am (ii), and Em (vi) using leading-tone chords (A7, G♯°7, B7).",
			"In Bars 31–36, keep the upper bow relaxed against the open A3 string while the left hand walks stepwise on the D string.",
		],
		sections: [
			{
				id: "bach-sec-1",
				title: "1. Opening G Pedal",
				barRange: "Bars 1–4",
				startStepIndex: 0,
				endStepIndex: 3,
				progressionTag: "I – IV – V7 – I",
				insight:
					"Establishes G Major over a constant open G2 drone, cycling straight through G, C/G, D7/G, and back to G.",
			},
			{
				id: "bach-sec-2",
				title: "2. Circle Climb to D & Em",
				barRange: "Bars 5–14",
				startStepIndex: 4,
				endStepIndex: 13,
				progressionTag: "vi7 – V7/V – V – vii°7/ii – V7/vi – vi",
				insight:
					"Steps clockwise around the Circle via A7 into D Major, then weaves through diminished G♯°7 and B7 to land on Em.",
			},
			{
				id: "bach-sec-3",
				title: "3. G7 Return & Cadenza",
				barRange: "Bars 15–30",
				startStepIndex: 14,
				endStepIndex: 29,
				progressionTag: "V7 – V7/IV – IV – V7 – I",
				insight:
					"Adds F♮ to turn G into G7 (pulling back to C), peaks on the dramatic Bar 22 D7 hold, and cascades back to G Major.",
			},
			{
				id: "bach-sec-4",
				title: "4. Open-A Bariolage Finale",
				barRange: "Bars 31–42",
				startStepIndex: 30,
				endStepIndex: 41,
				progressionTag: "V – ii7 – V7 – I",
				insight:
					"Crosses rapidly against the ringing open A3 string, climbs chromatically to F♯4 over D7, and closes with a full G chord.",
			},
		],
	},
	bars: BACH_PRELUDE_BARS.map((spec) => [
		spec.barNumber,
		spec.chordSymbol,
		spec.roman,
		spec.quality,
		spec.guitarKind,
		spec.chordNotes,
		ascendingNotesToMidi(spec.chordNotes),
		spec.circleDegree,
		spec.cue,
		parseBachBarNotation(spec.notation),
		spec.circleSlotIndex,
	]),
};
