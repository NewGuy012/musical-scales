import {
	BOWED_HARMONIC_TOUCH_SEMITONES,
	BOWED_STRING_ROMAN,
	MAX_BOWED_SEMITONE,
	VIOLIN_TUNING,
	resolveBowedStringIndex,
} from "./celloFingerboard";
import { parsePitchToMidi } from "./circleOfFifths";
import {
	type BowedSongStop,
	type CompactSongSpec,
	type NotationBarSpec,
	type SongNoteEvent,
	mapNotationBars,
} from "./songRuntime";

const STEP_QUARTER_MS = 900; // ~66.7 BPM (Andante religioso)

/**
 * Estimates an idiomatic violin left-hand finger number (0 = open, 1..4 = closed
 * frame or upper-position stop) from semitone offset on a string.
 */
function inferViolinFinger(semitone: number): number {
	if (semitone <= 0) return 0;
	if (semitone <= 2) return 1;
	if (semitone <= 4) return 2;
	if (semitone <= 6) return 3;
	if (semitone === 7) return 4;
	if (semitone <= 9) return 3; // 3rd position ring finger (e.g., F♯5 on A, C♯6 on E)
	if (semitone <= 11) return 4; // 3rd position pinky (e.g., D6, D♯6 on E)
	if (semitone === 12) return 2; // 5th position middle finger (E6 on E)
	if (semitone === 13) return 3; // 5th position ring finger (F6 on E)
	return 4; // 5th/6th position pinky (F♯6 / G6 on E)
}

function parseDurationBeats(durRaw?: string): number {
	if (!durRaw) return 1;
	if (durRaw.includes("/")) {
		const [num, den] = durRaw.split("/").map(Number);
		if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) {
			throw new Error(`Invalid Massenet beat fraction: ${durRaw}`);
		}
		return num / den;
	}
	const val = Number(durRaw);
	if (!Number.isFinite(val) || val <= 0) {
		throw new Error(`Invalid Massenet beat duration: ${durRaw}`);
	}
	return val;
}

function parseViolinNoteToken(token: string): {
	midi: number;
	pitchName: string;
	stop: BowedSongStop;
	label: string;
} {
	const isHarmonic = token.endsWith("*");
	const cleanToken = isHarmonic ? token.slice(0, -1) : token;
	const [pitchPart, stringOverride] = cleanToken.split("@");
	const { midi } = parsePitchToMidi(pitchPart);
	const stringIndex = resolveBowedStringIndex(
		VIOLIN_TUNING,
		stringOverride,
		midi,
	);

	const rawSemitone = midi - VIOLIN_TUNING[stringIndex].openMidi;
	const harmonicTouch = isHarmonic
		? BOWED_HARMONIC_TOUCH_SEMITONES[rawSemitone]
		: undefined;

	let semitone: number;
	let finger: number;
	if (harmonicTouch !== undefined) {
		semitone = harmonicTouch;
		finger = 4;
	} else if (rawSemitone === MAX_BOWED_SEMITONE + 1 && stringIndex === 3) {
		// G6 peak (Bar 32) sits 1 semitone above the 14-semitone visual neck limit.
		semitone = MAX_BOWED_SEMITONE;
		finger = 4;
	} else {
		if (rawSemitone < 0 || rawSemitone > MAX_BOWED_SEMITONE) {
			throw new Error(
				`Note ${token} (MIDI ${midi}) exceeds violin fingerboard range on string ${stringIndex}`,
			);
		}
		semitone = rawSemitone;
		finger = inferViolinFinger(semitone);
	}

	const stringRoman = BOWED_STRING_ROMAN[stringIndex];
	const label = isHarmonic
		? `${pitchPart} (${stringRoman} · Harm)`
		: semitone === 0
			? `${pitchPart} (Open ${stringRoman})`
			: `${pitchPart} (${stringRoman} · F${finger})`;

	return {
		midi,
		pitchName: pitchPart,
		stop: {
			stringIndex,
			semitone,
			finger,
			...(isHarmonic ? { technique: "harmonic" as const } : {}),
		},
		label,
	};
}

function parseViolinBarNotation(notation: string): SongNoteEvent[] {
	return notation
		.trim()
		.split(/\s+/)
		.map((item) => {
			const [notesRaw, durRaw] = item.split(":");
			const beats = parseDurationBeats(durRaw);
			const parts = notesRaw.split("+").map(parseViolinNoteToken);
			const isChord = parts.length > 1;

			const stepDurationMs = Math.max(120, Math.round(beats * STEP_QUARTER_MS));
			const durationSec = Math.max(0.22, (stepDurationMs / 1000) * 1.08);

			return {
				midi: parts.map((p) => p.midi),
				durationSec,
				stepDurationMs,
				noteLabel: isChord
					? `${parts.map((p) => p.pitchName).join("–")} Double Stop`
					: parts[0].label,
				spreadSec: isChord ? 0.05 : 0,
				violinStops: parts.map((p) => p.stop),
			};
		});
}

const MEDITATION_BARS: NotationBarSpec[] = [
	{
		barNumber: 1,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Harp intro · Gentle D major arpeggio before violin entry",
		notation: "D4:0.5 F♯4:0.5 A4:0.5 D5:0.5 A4:0.5 F♯4:0.5 D4:0.5 A4:0.5",
	},
	{
		barNumber: 2,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Harp wave swells into solo violin opening",
		notation: "D4:0.5 F♯4:0.5 A4:0.5 D5:0.5 F♯4:0.5 A4:0.5 D5:0.5 A4:0.5",
	},
	{
		barNumber: 3,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Andante (p) · Singing F♯5 (sul A) → D5 → A4–D5–F♯5 triplet",
		notation: "F♯5@A:2.5 D5@A:0.5 A4:1/3 D5:1/3 F♯5@E:1/3",
	},
	{
		barNumber: 4,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Soaring E-string phrase · B5 → C♯6 → D6",
		notation: "B5:2 C♯6:1 D6:1",
	},
	{
		barNumber: 5,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "D5 → E5 into quintuplet turn (F♯–G–F♯–E–F♯) → A5 → A4",
		notation:
			"D5@A:1.5 E5@A:0.5 F♯5:1/5 G5:1/5 F♯5:1/5 E5:1/5 F♯5:1/5 A5:0.5 A4:0.5",
	},
	{
		barNumber: 6,
		chordSymbol: "G",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		cue: "Warm subdominant G Major · B4 → C♯5 → D5",
		notation: "B4:3 C♯5:0.5 D5:0.5",
	},
	{
		barNumber: 7,
		chordSymbol: "Em",
		roman: "ii",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["E", "G", "B"],
		circleDegree: 2,
		cue: "F♯5 → E5 → G5 sigh with chromatic D♯5 neighbor into E5",
		notation: "F♯5:0.5 E5:0.5 G5:2 D♯5@A:0.5 E5@A:0.5",
	},
	{
		barNumber: 8,
		chordSymbol: "Em7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 2,
		cue: "Rising F♯5–G5–A5–B5 octave leap down to B4",
		notation: "F♯5:0.5 G5:0.5 A5:0.5 B5:0.5 B5:1 B4:1",
	},
	{
		barNumber: 9,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "C♯5 → D5 with delicate 16th-note turn over A7",
		notation: "C♯5:2 D5:1 E5@E:0.25 D5@A:0.25 C♯5:0.25 D5@A:0.25",
	},
	{
		barNumber: 10,
		chordSymbol: "C♯°7",
		roman: "vii°7/V",
		quality: "diminished",
		guitarKind: "dim7",
		chordNotes: ["C♯", "E", "G", "B♭"],
		circleDegree: 7,
		circleSlotIndex: 7,
		cue: "Rallentando (f) · E5 swells to chromatic F♮5 over C♯°7",
		notation: "E5:2 F5:2",
	},
	{
		barNumber: 11,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "A tempo (pp) · Opening F♯5 → D5 → A4–D5–F♯5 motif returns",
		notation: "F♯5@A:2.5 D5@A:0.5 A4:1/3 D5:1/3 F♯5@E:1/3",
	},
	{
		barNumber: 12,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Second climb up the E string · B5 → C♯6 → D6",
		notation: "B5:2 C♯6:1 D6:1",
	},
	{
		barNumber: 13,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Sweeping dotted F♯5 launching into rapid 16th-note arpeggio",
		notation: "F♯5@A:2.75 D5@A:0.25 A4:0.25 D5@A:0.25 F♯5:0.25 A5:0.25",
	},
	{
		barNumber: 14,
		chordSymbol: "C/E",
		roman: "♭VII6",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["C", "E", "G"],
		circleDegree: 7,
		circleSlotIndex: 0,
		cue: "Più f cresc. · Color shift to C/E with C♮6 → D6 → E6",
		notation: "C6:2 D6:1 E6:1",
	},
	{
		barNumber: 15,
		chordSymbol: "B7",
		roman: "V7/ii",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["B", "D♯", "F♯", "A"],
		circleDegree: 6,
		circleSlotIndex: 5,
		cue: "Forte peak on B7 (V7/ii) · F♯6 cascades down D♯6–B5–F♯5–D♯5",
		notation: "F♯6:2.5 D♯6:0.5 B5:1/3 F♯5:1/3 D♯5@A:1/3",
	},
	{
		barNumber: 16,
		chordSymbol: "Em",
		roman: "ii",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["E", "G", "B"],
		circleDegree: 2,
		cue: "Cascading E minor triplets descending from A5 down to E4",
		notation:
			"A5:2/3 G5:1/3 E5:1/3 B4:1/3 G4:1/3 F♯5:2/3 E5:1/3 B4:1/3 G4:1/3 E4:1/3",
	},
	{
		barNumber: 17,
		chordSymbol: "A7sus4",
		roman: "V7sus4",
		quality: "major",
		guitarKind: "sus4",
		chordNotes: ["A", "D", "E", "G"],
		circleDegree: 5,
		cue: "Drops onto rich G string (A3 → B3 → C♯4 → D4) over A7sus4",
		notation: "D5@A:2/3 A4:1/3 F♯4:1/3 D4:1/3 A3:1/3 B3:1 C♯4:0.5 D4:0.5",
	},
	{
		barNumber: 18,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Expressif · Warm D-string melody E4 → F♯4 → G4",
		notation: "E4:2 F♯4:1 G4:1",
	},
	{
		barNumber: 19,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Tender dip to B3 on the G string before returning to E4",
		notation: "E4:1 F♯4:1 B3:1 E4:1",
	},
	{
		barNumber: 20,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Rallentando · D4 suspension resolves to C♯4 leading tone",
		notation: "D4:2 C♯4:2",
	},
	{
		barNumber: 21,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Quiet arrival on open D4 whole note before animated bridge",
		notation: "D4:4",
	},
	{
		barNumber: 22,
		chordSymbol: "C/E",
		roman: "♭VII6",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["C", "E", "G"],
		circleDegree: 7,
		circleSlotIndex: 0,
		cue: "Animando (mf) · Steps into C Major color (C5 → G4 → A4 → E4)",
		notation: "C5@D:2.5 G4:0.5 A4@D:0.5 E4:0.5",
	},
	{
		barNumber: 23,
		chordSymbol: "F♯7",
		roman: "V7/vi",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["F♯", "A♯", "C♯", "E"],
		circleDegree: 3,
		circleSlotIndex: 6,
		cue: "F♯7 (V7/vi) · G4 resolves to F♯4, launching A♯4–C♯5–E5 triplet",
		notation: "G4:1 F♯4:2 A♯4@D:1/3 C♯5:1/3 E5@A:1/3",
	},
	{
		barNumber: 24,
		chordSymbol: "Em",
		roman: "ii",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["E", "G", "B"],
		circleDegree: 2,
		cue: "Sequence rises a step into Em (E5 → B4 → C♯5 → G4)",
		notation: "E5@A:2.5 B4:0.5 C♯5:0.5 G4:0.5",
	},
	{
		barNumber: 25,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Poco a poco appassionato · B4 → A4 and C♯5–E5–G5 triplet",
		notation: "B4:1 A4:2 C♯5:1/3 E5@A:1/3 G5:1/3",
	},
	{
		barNumber: 26,
		chordSymbol: "G/B",
		roman: "IV6",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		cue: "Forte surge over G/B · G5 → A5 → B5 descending through D",
		notation: "G5:1.5 A5:0.5 B5:0.5 F♯5:0.5 D5@A:0.5 B4:0.5",
	},
	{
		barNumber: 27,
		chordSymbol: "Am7/C",
		roman: "v7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["A", "C", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 0,
		cue: "Am7/C · Quintuplet turn (E–D♯–E–F♯–G) → G5–E5–C5–G4",
		notation:
			"E5:0.75 F♯5:0.25 E5:1/5 D♯5:1/5 E5:1/5 F♯5:1/5 G5:1/5 G5:0.5 E5:0.5 C5:0.5 G4:0.5",
	},
	{
		barNumber: 28,
		chordSymbol: "C7",
		roman: "V7/♭III",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["C", "E", "G", "B♭"],
		circleDegree: 7,
		circleSlotIndex: 0,
		cue: "Sudden piano on C7 · B♭4 → A4 → G4 turns toward F Major",
		notation: "B♭4:2 A4:1 G4:1",
	},
	{
		barNumber: 29,
		chordSymbol: "C7",
		roman: "V7/♭III",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["C", "E", "G", "B♭"],
		circleDegree: 7,
		circleSlotIndex: 0,
		cue: "Stepping down A5–G5–F5 → E5–D5–C5 over C7",
		notation: "A5:1 G5:0.5 F5:0.5 E5:1 D5:0.5 C5:0.5",
	},
	{
		barNumber: 30,
		chordSymbol: "F",
		roman: "♭III",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["F", "A", "C"],
		circleDegree: 3,
		circleSlotIndex: 11,
		cue: "Crescendo into F Major · D6 → C6 → A5 → C6",
		notation: "D6:1.5 C6:0.5 A5:1.5 C6:0.5",
	},
	{
		barNumber: 31,
		chordSymbol: "F/A",
		roman: "♭III6",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["F", "A", "C"],
		circleDegree: 3,
		circleSlotIndex: 11,
		cue: "Building higher over F/A · E6 → D6 → C6 → A5 → C6",
		notation: "E6:1.5 D6:0.5 C6:1 A5:0.5 C6:0.5",
	},
	{
		barNumber: 32,
		chordSymbol: "Fm/C",
		roman: "♭iii6/4",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["F", "A♭", "C"],
		circleDegree: 3,
		circleSlotIndex: 8,
		cue: "Fortissimo (ff) climax · F6 → G6 peak cascading down Fm triad",
		notation: "F6:1.5 E6:0.5 G6:0.5 F6:0.5 C6:0.5 A♭5:0.5",
	},
	{
		barNumber: 33,
		chordSymbol: "B♭m7",
		roman: "♭vi7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["B♭", "D♭", "F", "A♭"],
		circleDegree: 6,
		circleSlotIndex: 7,
		cue: "Più appassionato · F5–E5–G5–F5 sweeping down to F4",
		notation: "F5:0.5 E5:0.5 G5:0.5 F5:1 C5:0.5 A♭4:0.5 F4:0.5",
	},
	{
		barNumber: 34,
		chordSymbol: "Gm7♭5",
		roman: "ivø7",
		quality: "diminished",
		guitarKind: "m7♭5",
		chordNotes: ["G", "B♭", "D♭", "F"],
		circleDegree: 4,
		circleSlotIndex: 10,
		cue: "Sforzando (sf) syncopated F♮4 → E4 cry over Gm7♭5/Fm",
		notation: "F4:0.875 E4:1.625 F4:1 F4:0.5",
	},
	{
		barNumber: 35,
		chordSymbol: "Gm7♭5",
		roman: "ivø7",
		quality: "diminished",
		guitarKind: "m7♭5",
		chordNotes: ["G", "B♭", "D♭", "F"],
		circleDegree: 4,
		circleSlotIndex: 10,
		cue: "Second sf insistence · F♮4 → E4 over agitated bass",
		notation: "F4:0.875 E4:1.625 F4:1 F4:0.5",
	},
	{
		barNumber: 36,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Third sf surge · F4 → E4 climbs G4 → B♭4 over A7♭9 pedal",
		notation: "F4:0.875 E4:1.625 G4:1 B♭4:0.5",
	},
	{
		barNumber: 37,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "A7♭9 cadenza dive to G3, rising chromatically E4–F4–F♯4–G4",
		notation:
			"B♭4:0.75 G4:0.25 E4:0.25 G3:0.25 B♭3:0.25 C♯4:0.25 E4:0.5 F4:0.5 F♯4:0.5 G4:0.5",
	},
	{
		barNumber: 38,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Cédez un peu · Chromatic line twists G4–F♯4–F4–E4 up to B4",
		notation: "G4:0.5 F♯4:0.5 F4:0.5 E4:0.5 G4:0.5 A4:0.5 B♭4:0.5 B4:0.5",
	},
	{
		barNumber: 39,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Rallentando dim. · Descending A13 arpeggio B4 → G4 → E4 → C♯4",
		notation: "B4:1.5 G4:1 E4:1 C♯4:0.5",
	},
	{
		barNumber: 40,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "A tempo (pp) · Serene reprise of opening F♯5 → D5 → A4–D5–F♯5",
		notation: "F♯5@A:2.5 D5@A:0.5 A4:1/3 D5:1/3 F♯5@E:1/3",
	},
	{
		barNumber: 41,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Luminous upper-E ascent · B5 → C♯6 → D6",
		notation: "B5:2 C♯6:1 D6:1",
	},
	{
		barNumber: 42,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Reprise quintuplet turn · D5 → E5 → (F♯–G–F♯–E–F♯) → A5 → A4",
		notation:
			"D5@A:1.5 E5@A:0.5 F♯5:1/5 G5:1/5 F♯5:1/5 E5:1/5 F♯5:1/5 A5:0.5 A4:0.5",
	},
	{
		barNumber: 43,
		chordSymbol: "G",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		cue: "G Major subdominant repose · B4 → C♯5 → D5",
		notation: "B4:3 C♯5:0.5 D5:0.5",
	},
	{
		barNumber: 44,
		chordSymbol: "Em",
		roman: "ii",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["E", "G", "B"],
		circleDegree: 2,
		cue: "F♯5 → E5 → G5 sigh with chromatic D♯5 → E5",
		notation: "F♯5:0.5 E5:0.5 G5:2 D♯5@A:0.5 E5@A:0.5",
	},
	{
		barNumber: 45,
		chordSymbol: "Em7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 2,
		cue: "F♯5–G5–A5–B5 octave drop to B4",
		notation: "F♯5:0.5 G5:0.5 A5:0.5 B5:0.5 B5:1 B4:1",
	},
	{
		barNumber: 46,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Rallentando over A7 · C♯5 → D5 with 16th turn",
		notation: "C♯5:2 D5:1 E5@E:0.25 D5@A:0.25 C♯5:0.25 D5@A:0.25",
	},
	{
		barNumber: 47,
		chordSymbol: "C♯°7",
		roman: "vii°7/V",
		quality: "diminished",
		guitarKind: "dim7",
		chordNotes: ["C♯", "E", "G", "B♭"],
		circleDegree: 7,
		circleSlotIndex: 7,
		cue: "E5 swells to chromatic F♮5 over C♯°7",
		notation: "E5:2 F5:2",
	},
	{
		barNumber: 48,
		chordSymbol: "D7/C",
		roman: "V4/2/IV",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 1,
		cue: "A tempo (pp) · Theme floats over descending C♮ bass (D7/C)",
		notation: "F♯5@A:2.5 D5@A:0.5 A4:1/3 D5:1/3 F♯5@E:1/3",
	},
	{
		barNumber: 49,
		chordSymbol: "G/B",
		roman: "IV6",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		cue: "Bass steps to B (G/B) under B5 → C♯6 → D6",
		notation: "B5:2 C♯6:1 D6:1",
	},
	{
		barNumber: 50,
		chordSymbol: "D/A",
		roman: "I6/4",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Bass reaches A (D/A) · Dotted F♯5 into 16th-note sweep",
		notation: "F♯5@A:2.75 D5@A:0.25 A4:0.25 D5@A:0.25 F♯5:0.25 A5:0.25",
	},
	{
		barNumber: 51,
		chordSymbol: "C/G",
		roman: "♭VII6/4",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["C", "E", "G"],
		circleDegree: 7,
		circleSlotIndex: 0,
		cue: "Bass arrives on G under C/G (Am7/G) · C♮6 → D6 → E6",
		notation: "C6:2 D6:1 E6:1",
	},
	{
		barNumber: 52,
		chordSymbol: "B7",
		roman: "V7/ii",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["B", "D♯", "F♯", "A"],
		circleDegree: 6,
		circleSlotIndex: 5,
		cue: "Fortissimo B7 (V7/ii) · F♯6 descends through D♯6–B5–F♯5–D♯5",
		notation: "F♯6:2.5 D♯6:0.5 B5:1/3 F♯5:1/3 D♯5@A:1/3",
	},
	{
		barNumber: 53,
		chordSymbol: "Em",
		roman: "ii",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["E", "G", "B"],
		circleDegree: 2,
		cue: "Cascading E minor triplets from A5 down to low E4",
		notation:
			"A5:2/3 G5:1/3 E5:1/3 B4:1/3 G4:1/3 F♯5:2/3 E5:1/3 B4:1/3 G4:1/3 E4:1/3",
	},
	{
		barNumber: 54,
		chordSymbol: "A7sus4",
		roman: "V7sus4",
		quality: "major",
		guitarKind: "sus4",
		chordNotes: ["A", "D", "E", "G"],
		circleDegree: 5,
		cue: "Piano settles onto G string (A3 → B3 → C♯4 → D4) over A7sus4",
		notation: "D5@A:2/3 A4:1/3 F♯4:1/3 D4:1/3 A3:1/3 B3:1 C♯4:0.5 D4:0.5",
	},
	{
		barNumber: 55,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Expressif · Singing D-string line E4 → F♯4 → G4",
		notation: "E4:2 F♯4:1 G4:1",
	},
	{
		barNumber: 56,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Warm dip to B3 on G string returning to E4",
		notation: "E4:1 F♯4:1 B3:1 E4:1",
	},
	{
		barNumber: 57,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Rallentando (pp) · D4 resolves softly to C♯4",
		notation: "D4:2 C♯4:2",
	},
	{
		barNumber: 58,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "A tempo · Quiet D4 swells through 16th D major arpeggio to A5",
		notation: "D4:2.75 F♯4:0.25 A4:0.25 D5@A:0.25 F♯5:0.25 A5:0.25",
	},
	{
		barNumber: 59,
		chordSymbol: "C♯7",
		roman: "V7/iii",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["C♯", "E♯", "G♯", "B"],
		circleDegree: 7,
		circleSlotIndex: 7,
		cue: "Surprise C♯7 (V7/iii) color · Sustained B5 → C♯6",
		notation: "B5:3 C♯6:1",
	},
	{
		barNumber: 60,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Deceptive resolution to D Major · F♯6 cascades down D triad",
		notation: "F♯6:1.5 D6:0.5 A5:0.5 F♯5:0.5 D5@A:0.5 A4:0.5",
	},
	{
		barNumber: 61,
		chordSymbol: "E♭7",
		roman: "♭II7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E♭", "G", "B♭", "D♭"],
		circleDegree: 2,
		circleSlotIndex: 9,
		cue: "Tritone sub E♭7 (♭II7) · Mysterious G4 → B♭4 → C♯4",
		notation: "G4:1 B♭4:2 C♯4:1",
	},
	{
		barNumber: 62,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Gentle triplet turn C♯4–D4–E4 resolves to D4 → F♯4",
		notation: "C♯4:0.5 C♯4:1/6 D4:1/6 E4:1/6 D4:2 F♯4:1",
	},
	{
		barNumber: 63,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Peaceful ascending D triad A4 → D5 → F♯5 → A5",
		notation: "A4:1 D5@A:1 F♯5:1 A5:1",
	},
	{
		barNumber: 64,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Ethereal A6 natural harmonic (A string touch-4th) rings softly",
		notation: "A6@A*:4",
	},
	{
		barNumber: 65,
		chordSymbol: "G/B",
		roman: "IV6",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		cue: "A6 harmonic floats over G/B before descending to D5",
		notation: "A6@A*:2 D5@A:2",
	},
	{
		barNumber: 66,
		chordSymbol: "F♯7/A♯",
		roman: "V6/5/vi",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["F♯", "A♯", "C♯", "E"],
		circleDegree: 3,
		circleSlotIndex: 6,
		cue: "Sforzando chromatic A♯ bass under E5 → F♯5",
		notation: "E5@A:1.5 F♯5@A:0.5 F♯5@A:2",
	},
	{
		barNumber: 67,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Piano · Held F♯5 melts gently to E5 over A7",
		notation: "F♯5@A:2 E5@A:2",
	},
	{
		barNumber: 68,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Calmato · Serene D5 with tender C♯5–D5–E5 triplet sigh",
		notation: "D5@A:3 C♯5:1/3 D5@A:1/3 E5@A:1/3",
	},
	{
		barNumber: 69,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Second calmato echo · D5 → C♯5–D5–E5",
		notation: "D5@A:3 C♯5:1/3 D5@A:1/3 E5@A:1/3",
	},
	{
		barNumber: 70,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Final phrase · D5 lifts into crystalline A6 natural harmonic",
		notation: "D5@A:2 A6@A*:2",
	},
	{
		barNumber: 71,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Morendo (ppp) · Final D6 natural harmonic (D string touch-4th) fades",
		notation: "D6@D*:6",
	},
];

export const MASSENET_MEDITATION_SPEC: CompactSongSpec = {
	id: "massenet-meditation-thais",
	idPrefix: "thais",
	title: "Méditation (from Thaïs)",
	composerOrSource: "Jules Massenet · Act II Intermezzo",
	subtitle: "Complete 71-bar lyrical violin solo in D Major",
	instruments: ["violin"],
	keySlot: 2,
	keyMode: "major",
	keyLabel: "D Major",
	timeSignature: "4/4",
	bpm: 67,
	theorySummary:
		"Complete 71-bar solo violin score in D Major (4/4): opens over 2 bars of D harp arpeggios before entering on F♯5 (sul A) → D5 → A4–D5–F♯5 → B5–C♯6–D6, modulates through C/E, B7, F Major, and A7♭9 cadenza, returns with descending-bass reprise (D7/C → G/B → D/A), slips in the famous C♯7 → D deceptive resolution and E♭7 tritone sub, and floats out on A6 and D6 natural harmonics.",
	studyGuide: {
		vibeAndSound:
			"Singing, vocal cantabile lines (Andante religioso) with seamless legato phrasing—warm A-string resonance at the start opening into luminous E-string peaks and crystalline natural harmonics.",
		harmonyHook:
			"Combines warm D Major lyricism with a passionate C Major / F Major middle storm, a descending-bass reprise (D7/C → G/B → D/A → C/G), a dramatic C♯7 → D deceptive resolution (Bar 60), and an E♭7 tritone substitution (Bar 61).",
		practiceTips: [
			"Enter Bar 3 on the A string (3rd/5th position for F♯5 → D5) for Massenet's warm vocal 'sul A' color before crossing to the E string for B5 → C♯6 → D6.",
			"Listen to Bars 48–51 in the reprise: the melody stays identical to Bar 11 while the bass walks down chromatically C → B → A → G underneath.",
			"For the Bar 64, 65, and 70 A6 harmonics and Bar 71 D6 finale, touch the string lightly a perfect fourth above the open string (semitone 5) without pressing to the fingerboard.",
		],
		sections: [
			{
				id: "thais-sec-1",
				title: "1. Harp Intro & Main Theme",
				barRange: "Bars 1–10",
				startStepIndex: 0,
				endStepIndex: 9,
				progressionTag: "I – IV – ii – V7 – vii°7/V",
				insight:
					"Two bars of D harp waves lead into the iconic F♯5 → D5 → A4–D5–F♯5 → B5–C♯6–D6 theme, passing through G and Em before pausing on F♮5 over C♯°7.",
			},
			{
				id: "thais-sec-2",
				title: "2. Soaring Ascent & Em Cadence",
				barRange: "Bars 11–21",
				startStepIndex: 10,
				endStepIndex: 20,
				progressionTag: "I – ♭VII6 – V7/ii – ii – V7sus4 – V7 – I",
				insight:
					"Climbs through C/E and B7 (V7/ii) to a radiant F♯6 peak, cascades down E minor triplets onto the G string, and settles quietly onto D.",
			},
			{
				id: "thais-sec-3",
				title: "3. Animando & Cadenza Storm",
				barRange: "Bars 22–39",
				startStepIndex: 21,
				endStepIndex: 38,
				progressionTag: "♭VII6 – V7/vi – ii – V7 – ♭III – ivø7 – V7♭9",
				insight:
					"Modulates restlessly via F♯7 → Em → A7 → C7 into F Major and Fm (ff), erupting in sforzando Gm7♭5 sighs and a chromatic A7♭9 cadenza.",
			},
			{
				id: "thais-sec-4",
				title: "4. Reprise, Deceptive Turn & Finale",
				barRange: "Bars 40–71",
				startStepIndex: 39,
				endStepIndex: 70,
				progressionTag: "I – V4/2/IV – V7/iii → I – ♭II7 – I",
				insight:
					"Reprises the theme over a descending C–B–A–G bass, delivers Massenet's famous C♯7 → D deceptive resolution and E♭7 tritone sub, and fades out on A6 and D6 harmonics.",
			},
		],
	},
	bars: mapNotationBars(MEDITATION_BARS, parseViolinBarNotation),
};
