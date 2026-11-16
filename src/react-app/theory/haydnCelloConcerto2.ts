import {
	BOWED_HARMONIC_TOUCH_SEMITONES,
	BOWED_STRING_ROMAN,
	CELLO_TUNING,
	MAX_BOWED_SEMITONE,
	resolveBowedStringIndex,
} from "./celloFingerboard";
import { parsePitchToMidi } from "./circleOfFifths";
import {
	type BowedSongStop,
	type CompactSongSpec,
	type NotationBarSpec,
	type SongNoteEvent,
	mapNotationBars,
} from "./songExamples";

const EIGHTH_MS = 250; // 6/8 Allegro at dotted-quarter = 80 BPM (250ms per eighth note)
const SIXTEENTH_MS = EIGHTH_MS / 2;
const QUARTER_MS = EIGHTH_MS * 2;
const DOTTED_QUARTER_MS = EIGHTH_MS * 3;
const DOTTED_HALF_MS = EIGHTH_MS * 6;

function inferCelloFinger(semitone: number): number {
	if (semitone === 0) return 0;
	if (semitone <= 2) return 1;
	if (semitone <= 4) return 2;
	if (semitone <= 5) return 3;
	if (semitone <= 7) return 4;
	if (semitone === 8) return 1;
	if (semitone === 9) return 2;
	if (semitone <= 12) return 3;
	return 4;
}

interface ParsedStop {
	midi: number;
	pitchName: string;
	label: string;
	stop?: BowedSongStop;
}

function parseCelloNoteToken(raw: string): ParsedStop {
	const match = /^([A-G](?:[#♯b♭])?\d)(\*)?(?:@(C|G|D|A)(?::F(\d))?)?$/.exec(
		raw.trim(),
	);
	if (!match) {
		throw new Error(`Invalid Haydn cello token: "${raw}"`);
	}
	const [, pitchRaw, harmMark, strKey, fingerStr] = match;
	const { midi, pitchName: baseLabel } = parsePitchToMidi(pitchRaw);
	const isHarmonic = Boolean(harmMark);

	const stringIndex =
		!strKey && isHarmonic && (midi === 69 || midi === 76 || midi === 81)
			? 3
			: !strKey && isHarmonic && (midi === 62 || midi === 74)
				? 2
				: !strKey && isHarmonic && midi === 55
					? 1
					: resolveBowedStringIndex(CELLO_TUNING, strKey, midi);
	const stringRoman = BOWED_STRING_ROMAN[stringIndex];
	const openMidi = CELLO_TUNING[stringIndex].openMidi;
	const interval = midi - openMidi;

	if (isHarmonic) {
		const touchSemitone = BOWED_HARMONIC_TOUCH_SEMITONES[interval];
		if (touchSemitone === undefined) {
			throw new Error(
				`Token "${raw}" (MIDI ${midi}) is not a natural harmonic on ${CELLO_TUNING[stringIndex].label}`,
			);
		}
		const finger = fingerStr !== undefined ? Number(fingerStr) : 3;
		return {
			midi,
			pitchName: baseLabel,
			label: `${baseLabel} Harm. (${stringRoman})`,
			stop: {
				stringIndex,
				semitone: touchSemitone,
				finger,
			},
		};
	}

	if (interval < 0) {
		throw new Error(
			`Token "${raw}" (MIDI ${midi}) is below ${CELLO_TUNING[stringIndex].label} string`,
		);
	}

	// Thumb-position notes above B4 (MAX_BOWED_SEMITONE = 14) still sound their true pitch
	// while omitting out-of-range neck dots so rendered fingerboard stops stay within 0..14.
	if (interval > MAX_BOWED_SEMITONE) {
		return {
			midi,
			pitchName: baseLabel,
			label: `${baseLabel} (${stringRoman} Thumb Pos)`,
		};
	}

	const finger =
		fingerStr !== undefined ? Number(fingerStr) : inferCelloFinger(interval);
	return {
		midi,
		pitchName: baseLabel,
		label: `${baseLabel} (${stringRoman} F${finger})`,
		stop: {
			stringIndex,
			semitone: interval,
			finger,
		},
	};
}

function durToMs(dur: string): number {
	switch (dur) {
		case "16":
			return SIXTEENTH_MS;
		case "8":
			return EIGHTH_MS;
		case "4":
			return QUARTER_MS;
		case "4.":
			return DOTTED_QUARTER_MS;
		case "4+8r":
			return DOTTED_QUARTER_MS;
		case "2.":
			return DOTTED_HALF_MS;
		default:
			throw new Error(`Unsupported Haydn duration "${dur}"`);
	}
}

function parseHaydnBarNotation(notation: string): SongNoteEvent[] {
	return notation
		.trim()
		.split(/\s+/)
		.map((token) => {
			const slashIdx = token.lastIndexOf("/");
			if (slashIdx === -1) {
				throw new Error(`Missing duration on token "${token}"`);
			}
			const pitchSpec = token.slice(0, slashIdx);
			const dur = token.slice(slashIdx + 1);
			const stepDurationMs = durToMs(dur);
			const soundingMs = dur === "4+8r" ? QUARTER_MS : stepDurationMs;
			const parts = pitchSpec.split("+").map(parseCelloNoteToken);
			const stops = parts.flatMap((p) => (p.stop ? [p.stop] : []));
			const isChord = parts.length > 1;
			return {
				midi: parts.map((p) => p.midi),
				durationSec: Number((soundingMs / 1000).toFixed(3)),
				stepDurationMs,
				noteLabel: isChord
					? `${parts.map((p) => p.pitchName).join("–")} Bow Roll`
					: parts[0].label,
				...(isChord ? { spreadSec: 0.05 } : {}),
				...(stops.length > 0 ? { celloStops: stops } : {}),
			};
		});
}

const HAYDN_RONDO_BARS: NotationBarSpec[] = [
	{
		barNumber: 1,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Solo refrain: F♯4–E4–F♯4 · G4–F♯4–G4 (6/8)",
		notation: "F#4/8 E4/8 F#4/8 G4/8 F#4/8 G4/8",
	},
	{
		barNumber: 2,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Octave harmonics: A4 (I F3) – F♯4 – D4 (II F3)",
		notation: "A4*@A:F3/4 F#4/8 D4*@D:F3/4+8r",
	},
	{
		barNumber: 3,
		chordSymbol: "A7/G",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Dominant answer: E4–D4–E4 · F♯4–E4–F♯4",
		notation: "E4/8 D4/8 E4/8 F#4/8 E4/8 F#4/8",
	},
	{
		barNumber: 4,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Descending A7 triad: G4 – E4 – C♯4",
		notation: "G4@A:F4/4 E4/8 C#4/4+8r",
	},
	{
		barNumber: 5,
		chordSymbol: "G/B",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		circleSlotIndex: 1,
		cue: "Rising step D4–E4–F♯4 · double D4 anchor",
		notation: "D4@A:F1/8 E4/8 F#4/8 D4@A:F1/4 D4@A:F1/8",
	},
	{
		barNumber: 6,
		chordSymbol: "B7/D♯",
		roman: "V7/ii",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["B", "D♯", "F♯", "A"],
		circleDegree: 5,
		circleSlotIndex: 5,
		cue: "Chromatic D♯4 pivot toward E minor",
		notation: "D4@A:F1/8 E4/8 F#4/8 D4@A:F1/4 D#4@A:F1/8",
	},
	{
		barNumber: 7,
		chordSymbol: "Em7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 2,
		circleSlotIndex: 1,
		cue: "F♯4–G4–A4 arch · mordent descent to E4",
		notation: "F#4/8 G4/8 A4/8 G4/8 F#4/8 E4/8",
	},
	{
		barNumber: 8,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Fermata V hold on A4 · G4–F♯4 lead-in",
		notation: "A4/4. G4/4 F#4/8",
	},
	{
		barNumber: 9,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Tutti echo: D3+F♯4 · E4–F♯4 · G4–F♯4–G4",
		notation: "D3+F#4/8 E4/8 F#4/8 G4/8 F#4/8 G4/8",
	},
	{
		barNumber: 10,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Tutti D3+A4 – F♯4 – D4 cadence",
		notation: "D3+A4*@A:F3/4 F#4/8 D4*@D:F3/4+8r",
	},
	{
		barNumber: 11,
		chordSymbol: "A7/G",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Tutti V4/2 answer: E4–D4–E4 · F♯4–E4–F♯4",
		notation: "E4/8 D4/8 E4/8 F#4/8 E4/8 F#4/8",
	},
	{
		barNumber: 12,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Tutti A7: G4 – E4 – C♯4 arpeggio",
		notation: "G4@A:F4/4 E4/8 C#4/4+8r",
	},
	{
		barNumber: 13,
		chordSymbol: "G/B",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		circleSlotIndex: 1,
		cue: "Tutti IV6–I6/4: D4–E4–F♯4 · D4",
		notation: "D4@A:F1/8 E4/8 F#4/8 D4@A:F1/4 D4@A:F1/8",
	},
	{
		barNumber: 14,
		chordSymbol: "B7/D♯",
		roman: "V7/ii",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["B", "D♯", "F♯", "A"],
		circleDegree: 5,
		circleSlotIndex: 5,
		cue: "Tutti turn toward V/V with D♯4",
		notation: "D4@A:F1/8 E4/8 F#4/8 D4@A:F1/4 D#4@A:F1/8",
	},
	{
		barNumber: 15,
		chordSymbol: "E7",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 5,
		circleSlotIndex: 4,
		cue: "Tutti dominant drive: E4–G♯4–A4 · B4–A4–G4",
		notation: "E4/8 G#4/8 A4/8 B4/8 A4/8 G4/8",
	},
	{
		barNumber: 16,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Cadential 16ths A4–G4–F♯4–E4 into D3+D4",
		notation: "A4/16 G4/16 F#4/16 E4/16 D3+D4@A:F1/4+8r D4/8",
	},
	{
		barNumber: 17,
		chordSymbol: "D/F♯",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Solo dol.: A4–G4–F♯4–E4 · rising F♯4–A4–B4",
		notation: "A4/8 G4/16 F#4/16 E4/8 F#4/8 A4/8 B4/8",
	},
	{
		barNumber: 18,
		chordSymbol: "Em7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 2,
		circleSlotIndex: 1,
		cue: "Sustained B4 – A4 sigh over E minor",
		notation: "B4/4. A4/4+8r",
	},
	{
		barNumber: 19,
		chordSymbol: "E7/G♯",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 5,
		circleSlotIndex: 4,
		cue: "Repeated E4 pulses · G♯4–A4 turn",
		notation: "E4/8 E4/8 E4/8 F#4/16 G#4/16 A4/16 G#4/16 E4/8",
	},
	{
		barNumber: 20,
		chordSymbol: "A",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "V tonicization: C♯4 dotted cadence – B3",
		notation: "C#4/4. B3/4+8r",
	},
	{
		barNumber: 21,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "16th cascade A4–G4–F♯4–E4 · A4–G♯4–A4",
		notation: "A4/16 G4/16 F#4/16 E4/16 D4/8 A4/8 G#4/8 A4/8",
	},
	{
		barNumber: 22,
		chordSymbol: "Bm7",
		roman: "vi7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["B", "D", "F♯", "A"],
		circleDegree: 6,
		circleSlotIndex: 2,
		cue: "Crescendo sequence: A4–G4–G4 · A4–G4–G4",
		notation: "A4/8 G4/8 G4/8 A4/8 G4/8 G4/8",
	},
	{
		barNumber: 23,
		chordSymbol: "Em7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 2,
		circleSlotIndex: 1,
		cue: "Sequential step down: G4–F♯4–F♯4",
		notation: "G4/8 F#4/8 F#4/8 G4/8 F#4/8 F#4/8",
	},
	{
		barNumber: 24,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "V7 sigh: F♯4–E4–E4 · F♯4–E4–D4",
		notation: "F#4/8 E4/8 E4/8 F#4/8 E4/8 D4/8",
	},
	{
		barNumber: 25,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "2a string arpeggios: D4 harmonic to A4",
		notation:
			"D4*@D:F3/16 E4/16 F#4/16 E4/16 A4*@A:F3/16 F#4/16 D4*@D:F3/16 E4/16 F#4/16 E4/16 A4*@A:F3/16 F#4/16",
	},
	{
		barNumber: 26,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Climbing 16th turn: E4–F♯4–G4–A4–G4–E4",
		notation:
			"E4/16 F#4/16 G4/16 F#4/16 A4/16 G4/16 F#4/16 G4/16 A4/16 G4/16 F#4/16 E4/16",
	},
	{
		barNumber: 27,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Piano echo of 16th D4–A4 arpeggios",
		notation:
			"D4*@D:F3/16 E4/16 F#4/16 E4/16 A4*@A:F3/16 F#4/16 D4*@D:F3/16 E4/16 F#4/16 E4/16 A4*@A:F3/16 F#4/16",
	},
	{
		barNumber: 28,
		chordSymbol: "G",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		circleSlotIndex: 1,
		cue: "Upper B4 peak inside 16th ripple",
		notation:
			"E4/16 F#4/16 G4/16 F#4/16 B4/16 G4/16 F#4/16 G4/16 A4/16 G4/16 F#4/16 E4/16",
	},
	{
		barNumber: 29,
		chordSymbol: "Em",
		roman: "ii",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["E", "G", "B"],
		circleDegree: 2,
		circleSlotIndex: 1,
		cue: "Crescendo run from B3 through A4–B4",
		notation:
			"D4/16 B3/16 C#4/16 D4/16 E4/16 F#4/16 D4/16 E4/16 F#4/16 G4/16 A4/16 B4/16",
	},
	{
		barNumber: 30,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Scale surge toward high C♯5",
		notation:
			"A4/16 F#4/16 G4/16 A4/16 B4/16 A4/16 G#4/16 A4/16 B4/16 A4/16 B4/16 C#5/16",
	},
	{
		barNumber: 31,
		chordSymbol: "D/A",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Forte thumb-position D5*–C♯5–B4 apex",
		notation: "D5*@D:F3/4 C#5/16 B4/16 A4/4 B4/16 A4/16",
	},
	{
		barNumber: 32,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Glissez fermata: D5* – C♯5 – B4 – C♮5 on V7",
		notation: "D5*@D:F3/4. C#5/8 B4/8 C5/8",
	},
	{
		barNumber: 33,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Solo refrain return (p): F♯4–E4–F♯4–G4",
		notation: "F#4/8 E4/8 F#4/8 G4/8 F#4/8 G4/8",
	},
	{
		barNumber: 34,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Octave harmonics return: A4 – F♯4 – D4",
		notation: "A4*@A:F3/4 F#4/8 D4*@D:F3/4+8r",
	},
	{
		barNumber: 35,
		chordSymbol: "A7/G",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Refrain V7 answer: E4–D4–E4 · F♯4–E4–F♯4",
		notation: "E4/8 D4/8 E4/8 F#4/8 E4/8 F#4/8",
	},
	{
		barNumber: 36,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Descending A7 triad: G4 – E4 – C♯4",
		notation: "G4@A:F4/4 E4/8 C#4/4+8r",
	},
	{
		barNumber: 37,
		chordSymbol: "G/B",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		circleSlotIndex: 1,
		cue: "Gentle D4–E4–F♯4 climb · D4 pedal",
		notation: "D4@A:F1/8 E4/8 F#4/8 D4@A:F1/4 D4@A:F1/8",
	},
	{
		barNumber: 38,
		chordSymbol: "B7/D♯",
		roman: "V7/ii",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["B", "D♯", "F♯", "A"],
		circleDegree: 5,
		circleSlotIndex: 5,
		cue: "D♯4 inflection leaning into E minor",
		notation: "D4@A:F1/8 E4/8 F#4/8 D4@A:F1/4 D#4@A:F1/8",
	},
	{
		barNumber: 39,
		chordSymbol: "Em7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 2,
		circleSlotIndex: 1,
		cue: "F♯4–G4–A4 arch · mordent to E4",
		notation: "F#4/8 G4/8 A4/8 G4/8 F#4/8 E4/8",
	},
	{
		barNumber: 40,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "V fermata hold on A4 before Tutti",
		notation: "A4/4. G4/4 F#4/8",
	},
	{
		barNumber: 41,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Tutti transition (f): D3+F♯4 theme return",
		notation: "D3+F#4/8 E4/8 F#4/8 G4/8 F#4/8 G4/8",
	},
	{
		barNumber: 42,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Tutti D3+A4 – F♯4 – D4",
		notation: "D3+A4*@A:F3/4 F#4/8 D4*@D:F3/4+8r",
	},
	{
		barNumber: 43,
		chordSymbol: "A7/G",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Tutti V4/2 sequence: E4–D4–E4 · F♯4–E4–F♯4",
		notation: "E4/8 D4/8 E4/8 F#4/8 E4/8 F#4/8",
	},
	{
		barNumber: 44,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Tutti A7 drop: G4 – E4 – C♯4",
		notation: "G4@A:F4/4 E4/8 C#4/4+8r",
	},
	{
		barNumber: 45,
		chordSymbol: "G/B",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		circleSlotIndex: 1,
		cue: "Tutti rising fourth: D4–E4–F♯4 · D4",
		notation: "D4@A:F1/8 E4/8 F#4/8 D4@A:F1/4 D4@A:F1/8",
	},
	{
		barNumber: 46,
		chordSymbol: "B7/D♯",
		roman: "V7/ii",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["B", "D♯", "F♯", "A"],
		circleDegree: 5,
		circleSlotIndex: 5,
		cue: "Tutti pivots cleanly toward A Major",
		notation: "D4@A:F1/8 E4/8 F#4/8 D4@A:F1/4 D#4@A:F1/8",
	},
	{
		barNumber: 47,
		chordSymbol: "E7",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 5,
		circleSlotIndex: 4,
		cue: "Dominant push in A: E4–G♯4–B4–G♯4–E4",
		notation: "E4/8 G#4/8 B4/8 G#4/8 E4/8 D4/8",
	},
	{
		barNumber: 48,
		chordSymbol: "E7",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 5,
		circleSlotIndex: 4,
		cue: "Scalar cadence into A Major (Bar 49)",
		notation: "E4/8 D4/8 C#4/8 B3/8 A3/8 G#3/8",
	},
	{
		barNumber: 49,
		chordSymbol: "A",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Episode B in A Major: sweeping A3–A4 arpeggio",
		notation:
			"A3/16 C#4/16 E4/16 A4*@A:F3/16 E4/16 C#4/16 A3/16 E4/16 D4/16 C#4/16 B3/16 A3/16",
	},
	{
		barNumber: 50,
		chordSymbol: "A",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Episode B arrival: ringing A3+E4 fifth cadence",
		notation: "C#4/16 A3/16 E4/16 A3/16 C#4/8 A3+E4/4.",
	},
];

export const HAYDN_CELLO_CONCERTO_2_SPEC: CompactSongSpec = {
	id: "haydn-cello-concerto-2",
	title: "Cello Concerto No. 2 in D Major (III. Rondo: Allegro)",
	composerOrSource: "Joseph Haydn · Hob. VIIb:2 (Op. 101)",
	subtitle:
		"6/8 Classical rondo refrain, natural harmonics & A Major episode (Bars 1–50)",
	instruments: ["cello"],
	keySlot: 2,
	keyMode: "major",
	keyLabel: "D Major",
	timeSignature: "6/8",
	bpm: 80,
	theorySummary:
		"Opening 50 bars of Movement III (Rondo: Allegro) in D Major: the solo cello opens with its lilting I–V7 refrain and octave harmonics, trades phrases with the Tutti orchestra (Bars 9–16), climbs through 16th-note arpeggios to a glissez V7 fermata (Bar 32), reprises the refrain, and modulates into A Major (V) at Bars 49–50.",
	studyGuide: {
		vibeAndSound:
			"Joyful 6/8 Classical dance: two buoyant three-eighth pulses per bar carry Haydn's solo refrain from ringing octave harmonics into brisk 16th-note arpeggios.",
		harmonyHook:
			"Anchors tightly on D Major (I) and A7 (V7), spices Bars 6, 14, 38, and 46 with B7/D♯ (V7/ii), and executes a classic sonata-rondo modulation to the dominant key of A Major by Bar 49.",
		practiceTips: [
			"Touch the 12th-fret octave harmonics (A4 and D4) lightly in Bar 2 and Bar 34 without pressing down to let them ring cleanly over D.",
			"Shape Bars 25–32 as one continuous crescendo from light 2a-string 16ths up to Bar 32's expressive glissez fermata on V7.",
			"Notice how Bars 47–48 use E7 (V7/V) to pivot cleanly into the bright open-A sweeping arpeggio of Bar 49.",
		],
		sections: [
			{
				id: "haydn-sec-1",
				title: "1. Solo Rondo Refrain",
				barRange: "Bars 1–8",
				startStepIndex: 0,
				endStepIndex: 7,
				progressionTag: "I – V7 – IV – V7/ii – ii7 – V7",
				insight:
					"The solo cello states the playful 8-bar D Major theme right away, answering F♯4–E4–F♯4–G4 with octave harmonics and a fermata V hold.",
			},
			{
				id: "haydn-sec-2",
				title: "2. Tutti Echo",
				barRange: "Bars 9–16",
				startStepIndex: 8,
				endStepIndex: 15,
				progressionTag: "I – V7 – IV – V7/V – I",
				insight:
					"Full orchestra echoes the refrain forte, driving through E7 (V7/V) into crisp cadential 16ths onto tonic D.",
			},
			{
				id: "haydn-sec-3",
				title: "3. Dolce Episode & Glissez Apex",
				barRange: "Bars 17–32",
				startStepIndex: 16,
				endStepIndex: 31,
				progressionTag: "I – ii7 – V7/V – vi7 – V7",
				insight:
					"A lyrical dolce variation yields to cascading sequences (Bars 22–24) and brisk 2a-string 16ths climbing up to Bar 32's glissez fermata.",
			},
			{
				id: "haydn-sec-4",
				title: "4. Refrain Return & A Major Modulation",
				barRange: "Bars 33–50",
				startStepIndex: 32,
				endStepIndex: 49,
				progressionTag: "I – V7 – V7/V – V",
				insight:
					"Solo and Tutti reprise the D Major refrain before E7 pivots cleanly into the dominant key of A Major (Bars 49–50).",
			},
		],
	},
	idPrefix: "hc",
	bars: mapNotationBars(
		HAYDN_RONDO_BARS,
		parseHaydnBarNotation,
		(_, events) => {
			const firstStop = events[0]?.celloStops?.[0];
			return firstStop
				? [CELLO_TUNING[firstStop.stringIndex].openMidi + firstStop.semitone]
				: (events[0]?.midi.slice(0, 1) ?? [62]);
		},
	),
};
