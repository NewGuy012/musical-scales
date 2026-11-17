import { CELLO_TUNING } from "./celloFingerboard";
import {
	type CompactSongSpec,
	type NotationBarSpec,
	type SongNoteEvent,
	mapNotationBars,
} from "./songRuntime";

const QUARTER_MS = 660; // 4/4 Allegro moderato at quarter = 91 BPM (2640ms per bar)
const EIGHTH_MS = QUARTER_MS / 2; // 330ms
const SIXTEENTH_MS = QUARTER_MS / 4; // 165ms
const DOTTED_EIGHTH_MS = EIGHTH_MS + SIXTEENTH_MS; // 495ms
const DOTTED_QUARTER_MS = QUARTER_MS + EIGHTH_MS; // 990ms
const HALF_MS = QUARTER_MS * 2; // 1320ms
const DOTTED_HALF_MS = QUARTER_MS * 3; // 1980ms
const WHOLE_MS = QUARTER_MS * 4; // 2640ms

const NOTE_OFFSET: Record<string, number> = {
	C: 0,
	"C♯": 1,
	D: 2,
	"D♯": 3,
	"E♭": 3,
	E: 4,
	F: 5,
	"F♯": 6,
	G: 7,
	"G♯": 8,
	"A♭": 8,
	A: 9,
	"A♯": 10,
	"B♭": 10,
	B: 11,
};

function parsePitchToMidi(token: string): {
	midi: number;
	label: string;
} {
	const m = /^([A-G][♯♭]?)(\d)$/.exec(token.trim());
	if (!m) {
		throw new Error(`Invalid Haydn cello pitch token: "${token}"`);
	}
	const [, pitch, octaveStr] = m;
	const offset = NOTE_OFFSET[pitch];
	if (offset === undefined) {
		throw new Error(`Unknown pitch name "${pitch}" in "${token}"`);
	}
	const midi = (Number(octaveStr) + 1) * 12 + offset;
	return { midi, label: `${pitch}${octaveStr}` };
}

function durToMs(dur: string): number {
	switch (dur) {
		case "1":
			return WHOLE_MS;
		case "2.":
			return DOTTED_HALF_MS;
		case "2":
			return HALF_MS;
		case "4.":
			return DOTTED_QUARTER_MS;
		case "4":
			return QUARTER_MS;
		case "8.":
			return DOTTED_EIGHTH_MS;
		case "8":
			return EIGHTH_MS;
		case "16":
			return SIXTEENTH_MS;
		default:
			throw new Error(`Unsupported Haydn duration: "${dur}"`);
	}
}

/**
 * Maps a sounding cello pitch (C2..B4 = 36..71) onto its first-to-fourth-position
 * fingerboard stop; upper thumb-position notes (> B4) return null so stops stay within 0..14.
 */
function pickCelloStop(midi: number) {
	if (midi < 36 || midi > 71) return null;
	// Prefer open strings (C2, G2, D3, A3) for immediate resonant response
	for (let s = 3; s >= 0; s--) {
		const open = CELLO_TUNING[s].openMidi;
		if (midi === open) {
			return { stringIndex: s, semitone: 0, finger: 0 };
		}
	}
	for (let s = 3; s >= 0; s--) {
		const semitone = midi - CELLO_TUNING[s].openMidi;
		if (semitone >= 0 && semitone <= 7) {
			const finger =
				semitone <= 2 ? 1 : semitone <= 4 ? 2 : semitone === 5 ? 3 : 4;
			return { stringIndex: s, semitone, finger };
		}
	}
	const topSemitone = midi - CELLO_TUNING[3].openMidi;
	if (topSemitone >= 0 && topSemitone <= 14) {
		return {
			stringIndex: 3,
			semitone: topSemitone,
			finger: topSemitone <= 9 ? 2 : 3,
		};
	}
	return null;
}

function parseHaydnBarNotation(notation: string): SongNoteEvent[] {
	return notation
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((raw) => {
			const slashIdx = raw.indexOf("/");
			if (slashIdx === -1) {
				throw new Error(`Missing duration in Haydn token "${raw}"`);
			}
			const pitchPart = raw.slice(0, slashIdx);
			const dur = raw.slice(slashIdx + 1);
			const stepDurationMs = durToMs(dur);
			const pitches = pitchPart.split("+").map(parsePitchToMidi);
			const stops = pitches
				.map((p) => pickCelloStop(p.midi))
				.filter((st): st is NonNullable<typeof st> => st !== null);
			const soundingMs = Math.max(stepDurationMs * 0.94, 150);
			return {
				midi: pitches.map((p) => p.midi),
				durationSec: Number((soundingMs / 1000).toFixed(3)),
				stepDurationMs,
				noteLabel: pitches.map((p) => p.label).join(" + "),
				...(pitches.length > 1 ? { spreadSec: 0.03 } : {}),
				...(stops.length > 0 ? { celloStops: stops } : {}),
			};
		});
}

const HAYDN_ALLEGRO_BARS: NotationBarSpec[] = [
	// 1. Orchestral Tutti Opening Theme (Urtext Full Score mm. 1–6)
	{
		barNumber: 1,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Tutti Theme m.1: stately D Major opening F♯4 turn & tonic leap",
		notation: "F♯4/4 F♯4/16 G4/16 G♯4/16 A4/16 A4/8. F♯4/16 D4/8 A4/8",
	},
	{
		barNumber: 2,
		chordSymbol: "G → D",
		roman: "IV → I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		circleSlotIndex: 1,
		cue: "Tutti m.2: subdominant B4 lift easing down through A4–F♯4–G4–B4",
		notation: "B4/4 B4/16 A4/16 G4/16 F♯4/16 A4/8. F♯4/16 G4/8 A4/16 B4/16",
	},
	{
		barNumber: 3,
		chordSymbol: "D → A7 → D",
		roman: "I → V7 → I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Tutti m.3: Classical answering turn A4–G4–F♯4–E4 over D–A7",
		notation: "A4/8 G4/16 F♯4/16 E4/8. G4/16 F♯4/8 E4/16 D4/16 E4/8 A3/8",
	},
	{
		barNumber: 4,
		chordSymbol: "E7 → A",
		roman: "V7/V → V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Tutti m.4: leading-tone G♯3 rise into the dominant pedal D♯4–E4–A4",
		notation:
			"G♯3/16 A3/16 B3/16 E4/16 C♯4/8 D4/8 D4/8 D♯4/16 E4/16 D4/16 E4/16 F♯4/16 G♯4/16",
	},
	{
		barNumber: 5,
		chordSymbol: "D → G → A7",
		roman: "I → IV → V7",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Tutti m.5: dotted-eighth fanfare dialogue before A Major half cadence",
		notation: "A4/8. F♯4/16 G4/8. A4/16 G4/8 F♯4/16 E4/16 D4/8 C♯4/16 E4/16",
	},
	{
		barNumber: 6,
		chordSymbol: "E7 → A",
		roman: "V7/V → V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Tutti m.6: A Major cadence welcoming the Solo Cello entrance",
		notation:
			"G♯3/16 A3/16 B3/16 D4/16 C♯4/8 E4/8 A4/8 G♯4/16 F♯4/16 E4/8 A3/8",
	},
	// 2. Solo Cello Primary Theme (mf cantabile — Edition Peters p.1)
	{
		barNumber: 7,
		chordSymbol: "D (Solo Entrance)",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Solo mf cantabile: warm singing statement of the F♯4 primary theme",
		notation: "F♯4/4 F♯4/16 G4/16 G4/16 A4/16 A4/8. F♯4/16 A4/4",
	},
	{
		barNumber: 8,
		chordSymbol: "G → D",
		roman: "IV → I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["G", "B", "D"],
		circleDegree: 4,
		circleSlotIndex: 1,
		cue: "Solo m.2: soaring B4–D5 turn & open-D octave drop A4→D4",
		notation: "B4/4 D5/16 C5/16 B4/16 A4/16 A4/8. D4/16 G4/8 A4/16 B4/16",
	},
	{
		barNumber: 9,
		chordSymbol: "A7 → D",
		roman: "V7 → I",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Solo m.3: fluent 16th-note Classical filigree landing on open A3",
		notation:
			"A4/16 G4/16 F♯4/16 E4/16 D4/16 E4/16 G4/16 A4/16 G4/16 F♯4/16 E4/16 D4/16 C♯4/16 E4/16 A4/16 A3/16",
	},
	{
		barNumber: 10,
		chordSymbol: "E7 → A",
		roman: "V7/V → V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Solo m.4: rising G♯3 arpeggio & chromatic D4→D♯4→E4 modulation",
		notation:
			"G♯3/16 A3/16 B3/16 E4/16 C♯4/8 D4/8 D4/8 D♯4/16 E4/16 D4/16 E4/16 F♯4/16 G♯4/16",
	},
	{
		barNumber: 11,
		chordSymbol: "A",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Solo m.5: sunlit A4–D5–B4 apex settling gracefully to A3",
		notation:
			"A4/16 G♯4/16 F♯4/16 E4/16 F♯4/16 D5/16 B4/16 G♯4/16 A4/16 G♯4/16 F♯4/16 E4/16 C♯4/16 E4/16 A4/16 A3/16",
	},
	{
		barNumber: 12,
		chordSymbol: "Bm → E7 → A",
		roman: "ii/V → V7/V → V",
		quality: "minor",
		guitarKind: "minor",
		chordNotes: ["B", "D", "F♯"],
		circleDegree: 6,
		circleSlotIndex: 4,
		cue: "Solo m.6: lyrical cadence resolving cleanly into A Major",
		notation:
			"B4/8 C♯5/16 D5/16 D5/16 C♯5/16 B4/16 A4/16 G♯4/16 F♯4/16 E4/16 D4/16 C♯4/8 A3/8",
	},
	{
		barNumber: 13,
		chordSymbol: "A",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Bridge scale: A Major pulse rising through E4–F♯4–G♯4–A4",
		notation: "A3/4 E4/4 A3/4 E4/16 F♯4/16 G♯4/16 A4/16",
	},
	// 3. Secondary Lyrical Theme (espressivo in A Major & Bariolage)
	{
		barNumber: 14,
		chordSymbol: "A (espress.)",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Second Theme m.1 (espress.): tender C♯5–B4 sigh in A Major",
		notation: "C♯5/4 B4/8 B4/8 D5/8. C♯5/16 A4/8 G♯4/16 A4/16",
	},
	{
		barNumber: 15,
		chordSymbol: "E7 → A",
		roman: "V7/V → V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Second Theme m.2: flowing scalar turn & climbing C♯5 upbeat",
		notation: "B4/8 C♯5/16 D5/16 C♯5/16 B4/16 A4/16 G♯4/16 A4/4 B4/8 C♯5/8",
	},
	{
		barNumber: 16,
		chordSymbol: "A/E → E7",
		roman: "V64 → V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G♯"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Bariolage m.1: open-A3 pedal alternating beneath singing A4–B4–C♯5",
		notation: "A4/8 A3/8 A4/8 A3/8 G♯4/8 A4/16 B4/16 C♯5/8 B4/16 G♯4/16",
	},
	{
		barNumber: 17,
		chordSymbol: "A/E → E7",
		roman: "V64 → V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E", "G♯"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Bariolage m.2: answering A3–A4 echo climbing toward D5 peak",
		notation: "A4/8 A3/8 A4/8 A3/8 G♯4/8 A4/16 B4/16 C♯5/8 B4/16 G♯4/16",
	},
	{
		barNumber: 18,
		chordSymbol: "D → Bm7 → E7 → A",
		roman: "IV/V → ii/V → V7/V → V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 4,
		circleSlotIndex: 2,
		cue: "Climax of Second Theme: D5 drop to G♯4 & descending A-major scale",
		notation:
			"A4/8 D5/16 B4/16 G♯4/8 B4/16 G♯4/16 A4/16 G♯4/16 F♯4/16 E4/16 D4/8 C♯4/8",
	},
	{
		barNumber: 19,
		chordSymbol: "A",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Pause on A Major before Rehearsal [A] virtuoso passagework",
		notation: "E4/4 C♯4/4 A3/2",
	},
	// 4. Rehearsal [A] Virtuoso Arpeggios & Exposition Close (Edition Peters p.1 [A])
	{
		barNumber: 20,
		chordSymbol: "A ([A] Allegro)",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Rehearsal [A] mf: crisp scalar drop A2–A3–B2 & open-A string crossing",
		notation:
			"A2/16 A3/16 G♯3/16 F♯3/16 E3/16 D3/16 C♯3/16 B2/16 A2/16 E3/16 C♯3/16 E3/16 A2/16 E3/16 C♯3/16 E3/16",
	},
	{
		barNumber: 21,
		chordSymbol: "D/A → E7",
		roman: "I64 → V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Rehearsal [A] m.2: rising low-register scale climbing out of A2",
		notation:
			"D3/16 A2/16 B2/16 C♯3/16 D3/16 E3/16 F♯3/16 G♯3/16 A3/8 B3/8 C♯4/8 D♯4/8",
	},
	{
		barNumber: 22,
		chordSymbol: "A (Piano Echo)",
		roman: "V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Rehearsal [A] piano echo: delicate A3→B2 cascade & Bm string turn",
		notation:
			"A2/16 A3/16 G♯3/16 F♯3/16 E3/16 D3/16 C♯3/16 B2/16 A2/16 E3/16 C♯3/16 E3/16 A2/16 D3/16 B2/16 D3/16",
	},
	{
		barNumber: 23,
		chordSymbol: "E7 → A",
		roman: "V7/V → V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Crescendo run: G♯2–D3 pedal launching ascending A-major 16ths",
		notation:
			"G♯2/16 D3/16 B2/16 D3/16 G♯2/16 E3/16 D3/16 B2/16 A2/16 B2/16 C♯3/16 D3/16 E3/16 F♯3/16 G♯3/16 A3/16",
	},
	{
		barNumber: 24,
		chordSymbol: "E7",
		roman: "V7/V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["E", "G♯", "B", "D"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Pre-cadential surge up through E4 & soaring G♯4–B4–D5 arpeggio",
		notation:
			"B3/16 C♯4/16 D4/16 E4/16 F♯4/16 E4/16 D4/16 C♯4/16 B3/16 G♯4/16 E4/16 B4/16 G♯4/16 E5/16 B4/16 D5/16",
	},
	{
		barNumber: 25,
		chordSymbol: "E7 → A",
		roman: "V7/V → V",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Exposition trill prep: G♯2–A2 bass drop into descending A4–D4 line",
		notation: "G♯2/8 A2/8 A4/4 G4/16 F♯4/16 E4/16 D4/16 C♯4/8 B3/8",
	},
	{
		barNumber: 26,
		chordSymbol: "E7 → A (Tutti Cadence)",
		roman: "V7/V → V",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["A", "C♯", "E"],
		circleDegree: 5,
		circleSlotIndex: 3,
		cue: "Tutti close of Exposition in A Major: E4–B3 cadence resolving to A3",
		notation: "B3/4 C♯4/8 B3/8 A3/2",
	},
	// 5. Tonic Home Return (Recapitulation Theme Recall in D Major)
	{
		barNumber: 27,
		chordSymbol: "A7 → D",
		roman: "V7 → I",
		quality: "major",
		guitarKind: "7",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Tonic recall: gentle D Major theme echo F♯4–G4–A4 over A7→D",
		notation: "F♯4/4 F♯4/16 G4/16 A4/16 F♯4/16 G4/8 E4/8 D4/8 A3/8",
	},
	{
		barNumber: 28,
		chordSymbol: "D",
		roman: "I",
		quality: "major",
		guitarKind: "major",
		chordNotes: ["D", "F♯", "A"],
		circleDegree: 1,
		circleSlotIndex: 2,
		cue: "Final D Major resolution: open D3–A3 fifth & tonic D3 ringing out",
		notation: "F♯4/4 A3/4 D3+A3+F♯4/2",
	},
];

export const HAYDN_CELLO_CONCERTO_2_SPEC: CompactSongSpec = {
	id: "haydn-cello-concerto-2",
	title: "Cello Concerto No. 2 (I. Allegro moderato)",
	composerOrSource: "Joseph Haydn (Hob. VIIb:2)",
	subtitle: "I. Allegro moderato in D Major (4/4) · Exposition Highlights",
	instruments: ["cello"],
	keySlot: 2,
	keyMode: "major",
	keyLabel: "D Major",
	timeSignature: "4/4",
	bpm: 91,
	theorySummary:
		"Transcribed cleanly from the First Movement (Allegro moderato, 4/4, D Major) Urtext & Klengel scores: opens with the stately orchestral main theme, introduces the singing Solo Cello (mf cantabile), modulates via E7 to the lyrical second theme and bariolage in A Major, sweeps through Rehearsal [A]'s virtuoso arpeggios, and resolves cleanly back to D Major.",
	studyGuide: {
		vibeAndSound:
			"Poised Classical elegance (Allegro moderato in 4/4): warm singing cantabile lines in D Major alternate with playful Classical 16th turns, open-A bariolage, and sweeping arpeggios.",
		harmonyHook:
			"Follows textbook Sonata-Form key architecture: establishes D Major (I), pivots via secondary dominant E7 (V7/V) into the dominant key of A Major (V) for the second theme, then resolves home to D.",
		practiceTips: [
			"Shape Bar 7's Solo entrance (F♯4 – G4 – A4 – F♯4) with a steady, unhurried bow so the Classical cantabile sings without rushing the 16th-note turns.",
			"Listen in Bar 10 how raising D4 → D♯4 → E4 (on E7) pulls your ear smoothly out of D Major into the bright A Major second theme (Bars 14–18).",
			"In [A] (Bars 20–23), let the open D3 and A3 strings ring clearly against each stopped finger during the string crossings.",
		],
		sections: [
			{
				id: "haydn-sec-1",
				title: "1. Tutti Theme (Orchestral Opening)",
				barRange: "Bars 1–6",
				startStepIndex: 0,
				endStepIndex: 5,
				progressionTag: "I – IV – V7 – V7/V – V",
				insight:
					"Introduces the noble 4/4 D Major main melody before driving through E7 into a crisp A Major half cadence.",
			},
			{
				id: "haydn-sec-2",
				title: "2. Solo Entrance (mf cantabile)",
				barRange: "Bars 7–13",
				startStepIndex: 6,
				endStepIndex: 12,
				progressionTag: "I – IV – V7 – V7/V – V",
				insight:
					"The solo cello enters warmly on F♯4, rises to D5, and uses G♯3 and D♯4 to modulate smoothly into A Major.",
			},
			{
				id: "haydn-sec-3",
				title: "3. Second Theme (espress.) & Bariolage",
				barRange: "Bars 14–19",
				startStepIndex: 13,
				endStepIndex: 18,
				progressionTag: "V (A) – V7/V – V64 – V",
				insight:
					"A tender A Major lyrical theme (C♯5→B4) leads into Haydn's shimmering open-A string bariolage pedal.",
			},
			{
				id: "haydn-sec-4",
				title: "4. [A] Allegro Passagework & Tonic Close",
				barRange: "Bars 20–28",
				startStepIndex: 19,
				endStepIndex: 27,
				progressionTag: "V – V7/V – V – V7 – I",
				insight:
					"Sweeps through Rehearsal [A]'s bass arpeggios and piano echo before cadencing in A Major and echoing D Major home.",
			},
		],
	},
	idPrefix: "hc",
	bars: mapNotationBars(
		HAYDN_ALLEGRO_BARS,
		parseHaydnBarNotation,
		(_, events) => {
			const firstStop = events[0]?.celloStops?.[0];
			return firstStop
				? [CELLO_TUNING[firstStop.stringIndex].openMidi + firstStop.semitone]
				: (events[0]?.midi.slice(0, 1) ?? [66]);
		},
	),
};
