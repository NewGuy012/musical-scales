import {
	type ChordQuality,
	NATURAL_PC,
	ascendingNotesToMidi,
	noteOffset,
} from "./circleOfFifths";
import type { GuitarChordKind } from "./guitarFretboard";
import type {
	BowedSongStop,
	CompactSongSpec,
	SongNoteEvent,
} from "./songExamples";
import { MAX_VIOLIN_SEMITONE, VIOLIN_TUNING } from "./violinFingerboard";

const STEP_8TH_MS = 440; // ~68 BPM (Andante religioso)

const STRING_MAP: Record<string, { stringIndex: number; label: string }> = {
	G: { stringIndex: 0, label: "IV" },
	D: { stringIndex: 1, label: "III" },
	A: { stringIndex: 2, label: "II" },
	E: { stringIndex: 3, label: "I" },
};

const STRING_ROMAN = ["IV", "III", "II", "I"] as const;

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
	if (semitone <= 9) return 3; // 3rd position ring finger (e.g., F♯5 on A)
	if (semitone <= 11) return 4; // 3rd position pinky (e.g., D6 on E)
	if (semitone === 12) return 2; // 5th position octave (E6 on E)
	return 3;
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
	const letter = pitchPart[0];
	const octave = Number(pitchPart.slice(-1));
	const basePc = NATURAL_PC[letter];
	if (basePc === undefined || Number.isNaN(octave)) {
		throw new Error(`Invalid Massenet violin note token: ${token}`);
	}

	const midi = (octave + 1) * 12 + basePc + noteOffset(pitchPart.slice(0, -1));
	let stringIndex: number;
	if (stringOverride) {
		const mapped = STRING_MAP[stringOverride];
		if (!mapped) {
			throw new Error(`Unknown violin string override: ${stringOverride}`);
		}
		stringIndex = mapped.stringIndex;
	} else if (midi < 62) {
		stringIndex = 0;
	} else if (midi < 69) {
		stringIndex = 1;
	} else if (midi < 76) {
		stringIndex = 2;
	} else {
		stringIndex = 3;
	}

	const openMidi = VIOLIN_TUNING[stringIndex].openMidi;
	const semitone = midi - openMidi;
	if (semitone < 0 || semitone > MAX_VIOLIN_SEMITONE) {
		throw new Error(
			`Note ${token} (MIDI ${midi}) exceeds violin fingerboard range on string ${stringIndex}`,
		);
	}

	const finger = inferViolinFinger(semitone);
	const stringRoman = STRING_ROMAN[stringIndex];
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
			const units = durRaw ? Number(durRaw) : 1;
			const parts = notesRaw.split("+").map(parseViolinNoteToken);
			const isChord = parts.length > 1;

			const stepDurationMs = Math.round(units * STEP_8TH_MS);
			const durationSec = Math.max(0.38, (stepDurationMs / 1000) * 1.12);

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

interface MeditationBarSpec {
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

const MEDITATION_BARS: MeditationBarSpec[] = [
	{
		barNumber: 1,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Harp intro · Gentle D major arpeggio",
		notation: "D4:2 F♯4:2 A4:2 D5:2",
	},
	{
		barNumber: 2,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Rising harp wave into solo entrance",
		notation: "D4:2 A4:2 D5:2 F♯5@A:2",
	},
	{
		barNumber: 3,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Dolce · Singing F♯5 (sul A) → D5 → B4",
		notation: "F♯5@A:4 D5@A:2 B4:2",
	},
	{
		barNumber: 4,
		chordSymbol: "Bm7",
		roman: "vi7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["B", "D", "F♯", "A"],
		circleDegree: 6,
		cue: "Relative minor warmth · B4 → D5 → F♯5",
		notation: "B4:2 D5:2 E5@A:2 F♯5@A:2",
	},
	{
		barNumber: 5,
		chordSymbol: "G",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		cue: "Subdominant lift · G5 → F♯5 → E5",
		notation: "G5:4 F♯5:2 E5:2",
	},
	{
		barNumber: 6,
		chordSymbol: "Em7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 2,
		cue: "Stepwise descent · D5 → B4 → C♯5 → D5",
		notation: "D5:4 B4:2 C♯5:1 D5:1",
	},
	{
		barNumber: 7,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Dominant sigh · E5 → C♯5 → A4",
		notation: "E5@A:4 C♯5:2 A4:2",
	},
	{
		barNumber: 8,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Resolves home to D5 · A4 pickup",
		notation: "D5:6 A4:2",
	},
	{
		barNumber: 9,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Phrase climbs onto E string · F♯5 → A5",
		notation: "F♯5:4 A5:2 F♯5:2",
	},
	{
		barNumber: 10,
		chordSymbol: "Bm7",
		roman: "vi7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["B", "D", "F♯", "A"],
		circleDegree: 6,
		cue: "High D6 crest → B5 → A5 → F♯5",
		notation: "D6:4 B5:1 A5:1 F♯5:2",
	},
	{
		barNumber: 11,
		chordSymbol: "G",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		cue: "Lyrical stepwise arch · G5 → F♯5 → E5 → D5",
		notation: "G5:3 F♯5:1 E5:2 D5:2",
	},
	{
		barNumber: 12,
		chordSymbol: "E7",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 2,
		circleSlotIndex: 4,
		cue: "G♯5 color · Secondary dominant to A",
		notation: "E5:2 G♯5:2 B5:2 D6:2",
	},
	{
		barNumber: 13,
		chordSymbol: "A",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		cue: "Tonicized A major · C♯6 → B5 → A5 → E5",
		notation: "C♯6:4 B5:1 A5:1 E5:2",
	},
	{
		barNumber: 14,
		chordSymbol: "Em7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 2,
		cue: "Softly descending · G5 → F♯5 → E5 → D5",
		notation: "G5:2 F♯5:2 E5:2 D5:2",
	},
	{
		barNumber: 15,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Expressive turn · C♯5 → D5 → E5 → G5",
		notation: "C♯5:2 D5:2 E5:2 G5:2",
	},
	{
		barNumber: 16,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Section I cadence · F♯5 → D5",
		notation: "F♯5:4 D5:4",
	},
	{
		barNumber: 17,
		chordSymbol: "Bm",
		roman: "vi",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["B", "D", "F♯"],
		circleDegree: 6,
		cue: "Animato · Relative minor surge B4 → B5",
		notation: "B4:2 D5:2 F♯5:2 B5:2",
	},
	{
		barNumber: 18,
		chordSymbol: "Em7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 2,
		cue: "Appassionato · G5 → E5 → B4 → E5",
		notation: "G5:2 E5:2 B4:2 E5:2",
	},
	{
		barNumber: 19,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "G5 → F♯5 → E5 → C♯5 dominant drive",
		notation: "G5:2 F♯5:2 E5:2 C♯5:2",
	},
	{
		barNumber: 20,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Sweeping arpeggio D5 → D6",
		notation: "D5:2 F♯5:2 A5:2 D6:2",
	},
	{
		barNumber: 21,
		chordSymbol: "B7",
		roman: "V7/ii",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["B", "D♯", "F♯", "A"],
		circleDegree: 6,
		circleSlotIndex: 5,
		cue: "D♯5 leading tone · Pulls to Em",
		notation: "D♯5:2 F♯5:2 A5:2 B5:2",
	},
	{
		barNumber: 22,
		chordSymbol: "Em",
		roman: "ii",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["E", "G", "B"],
		circleDegree: 2,
		cue: "High E6 octave crest on E string",
		notation: "G5:2 B5:2 E6:2 B5:2",
	},
	{
		barNumber: 23,
		chordSymbol: "C♯7",
		roman: "V7/iii",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["C♯", "E♯", "G♯", "B"],
		circleDegree: 7,
		circleSlotIndex: 7,
		cue: "C♯7 chromatic lift toward F♯m",
		notation: "G♯5:2 C♯6:2 E♯5:2 G♯5:2",
	},
	{
		barNumber: 24,
		chordSymbol: "F♯m",
		roman: "iii",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["F♯", "A", "C♯"],
		circleDegree: 3,
		cue: "Mediant F♯ minor intensity",
		notation: "A5:2 F♯5:2 C♯5:2 F♯5:2",
	},
	{
		barNumber: 25,
		chordSymbol: "D7",
		roman: "V7/IV",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A", "C"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "C♮6 turns D into V7/IV toward G",
		notation: "C6:2 A5:2 F♯5:2 D5:2",
	},
	{
		barNumber: 26,
		chordSymbol: "G",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		cue: "Broad G Major release · B5 → D5",
		notation: "B5:2 G5:2 D5:2 B4:2",
	},
	{
		barNumber: 27,
		chordSymbol: "Gm",
		roman: "iv",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["G", "B♭", "D"],
		circleDegree: 4,
		circleSlotIndex: 10,
		cue: "Borrowed iv (B♭5) · Bittersweet sigh",
		notation: "B♭5:3 G5:1 D5:2 B♭4:2",
	},
	{
		barNumber: 28,
		chordSymbol: "D/A",
		roman: "I6/4",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Cadential 6/4 poise over A pedal",
		notation: "A5:2 F♯5:2 D5:2 A4:2",
	},
	{
		barNumber: 29,
		chordSymbol: "E7",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 2,
		circleSlotIndex: 4,
		cue: "Più appassionato · G♯5 → E6 surge",
		notation: "G♯5:2 B5:2 D6:2 E6:2",
	},
	{
		barNumber: 30,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "C♯6 → A5 → G5 → E5 dominant tension",
		notation: "C♯6:2 A5:2 G5:2 E5:2",
	},
	{
		barNumber: 31,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Cadenza ascent to F♯6 climax",
		notation: "A4:1 C♯5:1 E5:1 G5:1 A5:1 C♯6:1 F♯6:2",
	},
	{
		barNumber: 32,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "Silky cascade back to Tempo I",
		notation: "E6:1 D6:1 C♯6:1 B5:1 A5:1 G5:1 F♯5:1 E5:1",
	},
	{
		barNumber: 33,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Come prima · Tender reprise on F♯5 (sul A)",
		notation: "F♯5@A:4 D5@A:2 B4:2",
	},
	{
		barNumber: 34,
		chordSymbol: "Bm7",
		roman: "vi7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["B", "D", "F♯", "A"],
		circleDegree: 6,
		cue: "Warm Bm7 sweep · B4 → A5",
		notation: "B4:2 D5:2 F♯5:2 A5:2",
	},
	{
		barNumber: 35,
		chordSymbol: "G",
		roman: "IV",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		cue: "G Major subdominant glow · G5 → D6",
		notation: "G5:2 B5:2 D6:2 B5:2",
	},
	{
		barNumber: 36,
		chordSymbol: "Em7",
		roman: "ii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["E", "G", "B", "D"],
		circleDegree: 2,
		cue: "Rising Em7 steps · E5 → D6",
		notation: "E5:2 G5:2 B5:2 D6:2",
	},
	{
		barNumber: 37,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "C♯6 → A5 → G5 → E5 lyrical fall",
		notation: "C♯6:2 A5:2 G5:2 E5:2",
	},
	{
		barNumber: 38,
		chordSymbol: "F♯m7",
		roman: "iii7",
		quality: "minor",
		guitarKind: "m7",
		chordNotes: ["F♯", "A", "C♯", "E"],
		circleDegree: 3,
		cue: "Deceptive lift to F♯m7 · F♯5 → E6",
		notation: "F♯5:2 A5:2 C♯6:2 E6:2",
	},
	{
		barNumber: 39,
		chordSymbol: "Bm",
		roman: "vi",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["B", "D", "F♯"],
		circleDegree: 6,
		cue: "Gentle descent through B minor",
		notation: "D6:2 B5:2 F♯5:2 D5:2",
	},
	{
		barNumber: 40,
		chordSymbol: "E7",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 2,
		circleSlotIndex: 4,
		cue: "Final dominant preparation · G♯5 → D6",
		notation: "E5:2 G♯5:2 B5:2 D6:2",
	},
	{
		barNumber: 41,
		chordSymbol: "A7",
		roman: "V7",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		cue: "C♯6 → B5 → A5 → G5 softening",
		notation: "C♯6:2 B5:2 A5:2 G5:2",
	},
	{
		barNumber: 42,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Home repose · F♯5 → D5 → A4 → F♯4",
		notation: "F♯5:2 D5:2 A4:2 F♯4:2",
	},
	{
		barNumber: 43,
		chordSymbol: "Gm",
		roman: "iv",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["G", "B♭", "D"],
		circleDegree: 4,
		circleSlotIndex: 10,
		cue: "Plagal farewell · Borrowed Gm (B♭4) sigh",
		notation: "G4:2 B♭4:2 D5:2 G5:2",
	},
	{
		barNumber: 44,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		cue: "Morendo · High F♯6 E-string harmonic fade",
		notation: "F♯5:2 A5:2 D6:2 F♯6@E*:6",
	},
];

export const MASSENET_MEDITATION_SPEC: CompactSongSpec = {
	id: "massenet-meditation-thais",
	idPrefix: "thais",
	title: "Méditation (from Thaïs)",
	composerOrSource: "Jules Massenet · Act II Intermezzo",
	subtitle: "44-bar lyrical cantabile violin solo in D Major",
	instruments: ["violin"],
	keySlot: 2,
	keyMode: "major",
	keyLabel: "D Major",
	timeSignature: "4/4",
	bpm: 68,
	theorySummary:
		"44-bar solo violin study in D Major (4/4): enters dolce on the A string (F♯5 → D5 → B4), ascends through secondary dominants (E7, B7, C♯7, D7) and poignant borrowed Gm (iv), peaks on an A7 cadenza, and floats out on an ethereal F♯6 harmonic.",
	studyGuide: {
		vibeAndSound:
			"Singing, vocal cantabile lines (Andante religioso) with seamless legato phrasing—warm A-string tone at the start opening into luminous high E-string phrases.",
		harmonyHook:
			"Blends lush D Major / B minor relative-key warmth with secondary dominants (E7, B7, C♯7, D7) and the signature bittersweet borrowed minor subdominant (Gm, iv).",
		practiceTips: [
			"Open Bars 3–4 on the A string (3rd position for F♯5) rather than crossing immediately to open E—this creates Massenet's warm, vocal sul A color.",
			"Notice Bars 21–27: each secondary dominant (B7 → Em, C♯7 → F♯m, D7 → G) nudges one chromatic half-step higher before melting into borrowed Gm (B♭).",
			"For the Bar 44 ending, relax left-hand pressure on the E string to let the high F♯6 harmonic ring softly into silence.",
		],
		sections: [
			{
				id: "thais-sec-1",
				title: "1. Harp Intro & Main Theme",
				barRange: "Bars 1–16",
				startStepIndex: 0,
				endStepIndex: 15,
				progressionTag: "I – vi7 – IV – ii7 – V7/V – V – I",
				insight:
					"Sets a calm D Major harp pulse, introduces the beloved F♯5 → D5 → B4 theme, and brightens through E7 (V7/V) into a poised half cadence.",
			},
			{
				id: "thais-sec-2",
				title: "2. Appassionato Modulation",
				barRange: "Bars 17–28",
				startStepIndex: 16,
				endStepIndex: 27,
				progressionTag: "vi – V7/ii – ii – V7/iii – iii – V7/IV – IV – iv",
				insight:
					"Climbs in sequence through B minor, E minor, and F♯ minor via secondary dominants, cresting on G Major and the poignant borrowed Gm (iv).",
			},
			{
				id: "thais-sec-3",
				title: "3. Cadenza Surge & Return",
				barRange: "Bars 29–32",
				startStepIndex: 28,
				endStepIndex: 31,
				progressionTag: "V7/V – V7 (Cadenza)",
				insight:
					"Builds over E7 into a sweeping A7 cadenza up to F♯6 before cascading down the D Major scale straight back to the reprise.",
			},
			{
				id: "thais-sec-4",
				title: "4. Reprise & Harmonic Finale",
				barRange: "Bars 33–44",
				startStepIndex: 32,
				endStepIndex: 43,
				progressionTag: "I – vi7 – iii7 – V7/V – V7 – iv – I",
				insight:
					"Recalls the opening theme with a deceptive lift to F♯m7, one last borrowed Gm plagal sigh, and a delicate high F♯6 E-string harmonic.",
			},
		],
	},
	bars: MEDITATION_BARS.map((spec) => [
		spec.barNumber,
		spec.chordSymbol,
		spec.roman,
		spec.quality,
		spec.guitarKind,
		spec.chordNotes,
		ascendingNotesToMidi(spec.chordNotes),
		spec.circleDegree,
		spec.cue,
		parseViolinBarNotation(spec.notation),
		spec.circleSlotIndex,
	]),
};
