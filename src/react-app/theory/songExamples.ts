import type { ChordQuality, KeyMode } from "./circleOfFifths";
import type { GuitarChordKind } from "./guitarFretboard";

export type InstrumentTab = "piano" | "guitar" | "cello";

export interface SongNoteEvent {
	midi: number[];
	durationSec: number;
	stepDurationMs: number;
	noteLabel: string;
	spreadSec?: number;
}

export interface SongChordStep {
	id: string;
	barLabel: string;
	chordSymbol: string;
	roman: string;
	quality: ChordQuality;
	guitarKind: GuitarChordKind;
	chordNotes: string[];
	displayMidi: number[];
	circleDegree: number;
	cue: string;
	events: SongNoteEvent[];
}

export interface SongExample {
	id: string;
	title: string;
	composerOrSource: string;
	subtitle: string;
	instruments: InstrumentTab[];
	keySlot: number;
	keyMode: KeyMode;
	keyLabel: string;
	timeSignature: string;
	bpm: number;
	theorySummary: string;
	steps: SongChordStep[];
}

export interface FlattenedSongStep {
	atMs: number;
	durationSec: number;
	midi: number[];
	spreadSec?: number;
	chordStepIndex: number;
	chordStep: SongChordStep;
	noteLabel: string;
}

function buildBachBarEvents(
	pattern: { midi: number; label: string }[],
	repeat: number,
	stepDurationMs = 152,
): SongNoteEvent[] {
	const events: SongNoteEvent[] = [];
	for (let r = 0; r < repeat; r++) {
		for (const item of pattern) {
			events.push({
				midi: [item.midi],
				durationSec: 0.25,
				stepDurationMs,
				noteLabel: item.label,
				spreadSec: 0,
			});
		}
	}
	return events;
}

export const SONG_EXAMPLES: SongExample[] = [
	{
		id: "sound-of-music-doremi",
		title: "Do-Re-Mi (from The Sound of Music)",
		composerOrSource: "Rodgers & Hammerstein",
		subtitle: "Major scale degrees & I–IV–V7 chord harmony",
		instruments: ["piano"],
		keySlot: 0,
		keyMode: "major",
		keyLabel: "C Major",
		timeSignature: "4/4",
		bpm: 136,
		theorySummary:
			"Walks up the C Major scale (C–D–E–F–G–A–B–C) supported by the three primary chords of the Circle of Fifths: C (I), F (IV), and G7 (V7).",
		steps: [
			{
				id: "doremi-1",
				barLabel: "Bar 1–2",
				chordSymbol: "C",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["C", "E", "G"],
				displayMidi: [60, 64, 67],
				circleDegree: 1,
				cue: '"Doe, a deer, a female deer"',
				events: [
					{
						midi: [48, 52, 55, 60],
						durationSec: 0.6,
						stepDurationMs: 600,
						noteLabel: "C chord + C4",
						spreadSec: 0.008,
					},
					{ midi: [62], durationSec: 0.22, stepDurationMs: 200, noteLabel: "D4" },
					{ midi: [64], durationSec: 0.58, stepDurationMs: 600, noteLabel: "E4" },
					{ midi: [60], durationSec: 0.22, stepDurationMs: 200, noteLabel: "C4" },
					{ midi: [64], durationSec: 0.38, stepDurationMs: 400, noteLabel: "E4" },
					{ midi: [60], durationSec: 0.38, stepDurationMs: 400, noteLabel: "C4" },
					{ midi: [64], durationSec: 0.72, stepDurationMs: 760, noteLabel: "E4" },
				],
			},
			{
				id: "doremi-2",
				barLabel: "Bar 3–4",
				chordSymbol: "G7",
				roman: "V7",
				quality: "major",
				guitarKind: "7",
				chordNotes: ["G", "B", "D", "F"],
				displayMidi: [62, 65, 67, 71],
				circleDegree: 5,
				cue: '"Ray, a drop of golden sun"',
				events: [
					{
						midi: [53, 55, 59, 62],
						durationSec: 0.6,
						stepDurationMs: 600,
						noteLabel: "G7 chord + D4",
						spreadSec: 0.008,
					},
					{ midi: [64], durationSec: 0.22, stepDurationMs: 200, noteLabel: "E4" },
					{ midi: [65], durationSec: 0.22, stepDurationMs: 200, noteLabel: "F4" },
					{ midi: [65], durationSec: 0.22, stepDurationMs: 200, noteLabel: "F4" },
					{ midi: [64], durationSec: 0.22, stepDurationMs: 200, noteLabel: "E4" },
					{ midi: [62], durationSec: 0.22, stepDurationMs: 200, noteLabel: "D4" },
					{ midi: [65], durationSec: 1.05, stepDurationMs: 1120, noteLabel: "F4" },
				],
			},
			{
				id: "doremi-3",
				barLabel: "Bar 5–6",
				chordSymbol: "C",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["C", "E", "G"],
				displayMidi: [60, 64, 67],
				circleDegree: 1,
				cue: '"Me, a name I call myself"',
				events: [
					{
						midi: [48, 55, 60, 64],
						durationSec: 0.6,
						stepDurationMs: 600,
						noteLabel: "C chord + E4",
						spreadSec: 0.008,
					},
					{ midi: [65], durationSec: 0.22, stepDurationMs: 200, noteLabel: "F4" },
					{ midi: [67], durationSec: 0.58, stepDurationMs: 600, noteLabel: "G4" },
					{ midi: [64], durationSec: 0.22, stepDurationMs: 200, noteLabel: "E4" },
					{ midi: [67], durationSec: 0.38, stepDurationMs: 400, noteLabel: "G4" },
					{ midi: [64], durationSec: 0.38, stepDurationMs: 400, noteLabel: "E4" },
					{ midi: [67], durationSec: 0.72, stepDurationMs: 760, noteLabel: "G4" },
				],
			},
			{
				id: "doremi-4",
				barLabel: "Bar 7–8",
				chordSymbol: "F",
				roman: "IV",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["F", "A", "C"],
				displayMidi: [65, 69, 72],
				circleDegree: 4,
				cue: '"Far, a long, long way to run"',
				events: [
					{
						midi: [53, 57, 60, 65],
						durationSec: 0.6,
						stepDurationMs: 600,
						noteLabel: "F chord + F4",
						spreadSec: 0.008,
					},
					{ midi: [67], durationSec: 0.22, stepDurationMs: 200, noteLabel: "G4" },
					{ midi: [69], durationSec: 0.22, stepDurationMs: 200, noteLabel: "A4" },
					{ midi: [69], durationSec: 0.22, stepDurationMs: 200, noteLabel: "A4" },
					{ midi: [67], durationSec: 0.22, stepDurationMs: 200, noteLabel: "G4" },
					{ midi: [65], durationSec: 0.22, stepDurationMs: 200, noteLabel: "F4" },
					{ midi: [69], durationSec: 1.05, stepDurationMs: 1120, noteLabel: "A4" },
				],
			},
			{
				id: "doremi-5",
				barLabel: "Bar 9",
				chordSymbol: "C",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["C", "E", "G"],
				displayMidi: [60, 64, 67],
				circleDegree: 1,
				cue: '"Sew, a needle pulling..."',
				events: [
					{
						midi: [48, 52, 60, 64, 67],
						durationSec: 0.6,
						stepDurationMs: 600,
						noteLabel: "C chord + G4",
						spreadSec: 0.008,
					},
					{ midi: [60], durationSec: 0.22, stepDurationMs: 200, noteLabel: "C4" },
					{ midi: [62], durationSec: 0.22, stepDurationMs: 200, noteLabel: "D4" },
					{ midi: [64], durationSec: 0.22, stepDurationMs: 200, noteLabel: "E4" },
					{ midi: [65], durationSec: 0.22, stepDurationMs: 200, noteLabel: "F4" },
					{ midi: [67], durationSec: 0.22, stepDurationMs: 200, noteLabel: "G4" },
				],
			},
			{
				id: "doremi-6",
				barLabel: "Bar 10",
				chordSymbol: "F",
				roman: "IV",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["F", "A", "C"],
				displayMidi: [65, 69, 72],
				circleDegree: 4,
				cue: '"...thread"',
				events: [
					{
						midi: [53, 57, 60, 69],
						durationSec: 0.85,
						stepDurationMs: 880,
						noteLabel: "F chord + A4",
						spreadSec: 0.008,
					},
				],
			},
			{
				id: "doremi-7",
				barLabel: "Bar 11",
				chordSymbol: "G7",
				roman: "V7",
				quality: "major",
				guitarKind: "7",
				chordNotes: ["G", "B", "D", "F"],
				displayMidi: [62, 65, 67, 71],
				circleDegree: 5,
				cue: '"So – La – Ti..."',
				events: [
					{
						midi: [55, 59, 65, 67],
						durationSec: 0.4,
						stepDurationMs: 400,
						noteLabel: "G7 + G4",
						spreadSec: 0.008,
					},
					{ midi: [69], durationSec: 0.4, stepDurationMs: 400, noteLabel: "A4" },
					{ midi: [71], durationSec: 0.56, stepDurationMs: 560, noteLabel: "B4" },
				],
			},
			{
				id: "doremi-8",
				barLabel: "Bar 12",
				chordSymbol: "C",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["C", "E", "G"],
				displayMidi: [60, 64, 67, 72],
				circleDegree: 1,
				cue: '"...back to Do!"',
				events: [
					{
						midi: [48, 52, 55, 60, 72],
						durationSec: 1.2,
						stepDurationMs: 1200,
						noteLabel: "C chord + C5",
						spreadSec: 0.012,
					},
				],
			},
		],
	},
	{
		id: "amazing-grace-guitar",
		title: "Amazing Grace",
		composerOrSource: "Traditional Hymn (New Britain)",
		subtitle: "3/4 open-chord campfire & fingerstyle classic",
		instruments: ["guitar"],
		keySlot: 1,
		keyMode: "major",
		keyLabel: "G Major",
		timeSignature: "3/4",
		bpm: 118,
		theorySummary:
			"Built on G Major's core Circle of Fifths neighbors: G (I), C (IV), Em (vi), and D7 (V7) using open-position guitar shapes.",
		steps: [
			{
				id: "grace-1",
				barLabel: "Bars 1–2",
				chordSymbol: "G",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["G", "B", "D"],
				displayMidi: [67, 71, 74],
				circleDegree: 1,
				cue: '"A-mazing grace, how"',
				events: [
					{ midi: [50], durationSec: 0.48, stepDurationMs: 480, noteLabel: "D3" },
					{
						midi: [43, 47, 50, 55],
						durationSec: 1.0,
						stepDurationMs: 920,
						noteLabel: "G chord + G3",
						spreadSec: 0.036,
					},
					{ midi: [59], durationSec: 0.25, stepDurationMs: 240, noteLabel: "B3" },
					{ midi: [55], durationSec: 0.25, stepDurationMs: 240, noteLabel: "G3" },
					{ midi: [59], durationSec: 0.9, stepDurationMs: 920, noteLabel: "B3" },
					{ midi: [57], durationSec: 0.46, stepDurationMs: 480, noteLabel: "A3" },
				],
			},
			{
				id: "grace-2",
				barLabel: "Bar 3",
				chordSymbol: "C",
				roman: "IV",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["C", "E", "G"],
				displayMidi: [60, 64, 67],
				circleDegree: 4,
				cue: '"sweet the"',
				events: [
					{
						midi: [48, 52, 55],
						durationSec: 1.0,
						stepDurationMs: 920,
						noteLabel: "C chord + G3",
						spreadSec: 0.036,
					},
					{ midi: [52], durationSec: 0.46, stepDurationMs: 480, noteLabel: "E3" },
				],
			},
			{
				id: "grace-3",
				barLabel: "Bars 4–5",
				chordSymbol: "G",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["G", "B", "D"],
				displayMidi: [67, 71, 74],
				circleDegree: 1,
				cue: '"sound, that saved a"',
				events: [
					{
						midi: [43, 47, 50],
						durationSec: 1.0,
						stepDurationMs: 920,
						noteLabel: "G chord + D3",
						spreadSec: 0.036,
					},
					{ midi: [50], durationSec: 0.46, stepDurationMs: 480, noteLabel: "D3" },
					{
						midi: [43, 47, 50, 55],
						durationSec: 1.0,
						stepDurationMs: 920,
						noteLabel: "G chord + G3",
						spreadSec: 0.036,
					},
					{ midi: [59], durationSec: 0.25, stepDurationMs: 240, noteLabel: "B3" },
					{ midi: [55], durationSec: 0.25, stepDurationMs: 240, noteLabel: "G3" },
				],
			},
			{
				id: "grace-4",
				barLabel: "Bar 6",
				chordSymbol: "Em",
				roman: "vi",
				quality: "minor",
				guitarKind: "minor",
				chordNotes: ["E", "G", "B"],
				displayMidi: [64, 67, 71],
				circleDegree: 6,
				cue: '"wretch like"',
				events: [
					{
						midi: [40, 47, 52, 55, 59],
						durationSec: 1.0,
						stepDurationMs: 920,
						noteLabel: "Em chord + B3",
						spreadSec: 0.036,
					},
					{ midi: [57], durationSec: 0.46, stepDurationMs: 480, noteLabel: "A3" },
				],
			},
			{
				id: "grace-5",
				barLabel: "Bar 7",
				chordSymbol: "D7",
				roman: "V7",
				quality: "major",
				guitarKind: "7",
				chordNotes: ["D", "F♯", "A", "C"],
				displayMidi: [62, 66, 69, 72],
				circleDegree: 5,
				cue: '"me; I"',
				events: [
					{
						midi: [50, 54, 57, 60, 62],
						durationSec: 1.0,
						stepDurationMs: 920,
						noteLabel: "D7 chord + D4",
						spreadSec: 0.024,
					},
					{ midi: [59], durationSec: 0.46, stepDurationMs: 480, noteLabel: "B3" },
				],
			},
			{
				id: "grace-6",
				barLabel: "Bars 8–9",
				chordSymbol: "G",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["G", "B", "D"],
				displayMidi: [67, 71, 74],
				circleDegree: 1,
				cue: '"once was lost, but"',
				events: [
					{
						midi: [43, 47, 50, 59, 62],
						durationSec: 1.0,
						stepDurationMs: 920,
						noteLabel: "G chord + D4",
						spreadSec: 0.036,
					},
					{ midi: [59], durationSec: 0.25, stepDurationMs: 240, noteLabel: "B3" },
					{ midi: [55], durationSec: 0.25, stepDurationMs: 240, noteLabel: "G3" },
					{ midi: [59], durationSec: 0.9, stepDurationMs: 920, noteLabel: "B3" },
					{ midi: [57], durationSec: 0.46, stepDurationMs: 480, noteLabel: "A3" },
				],
			},
			{
				id: "grace-7",
				barLabel: "Bar 10",
				chordSymbol: "C",
				roman: "IV",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["C", "E", "G"],
				displayMidi: [60, 64, 67],
				circleDegree: 4,
				cue: '"now am"',
				events: [
					{
						midi: [48, 52, 55],
						durationSec: 1.0,
						stepDurationMs: 920,
						noteLabel: "C chord + G3",
						spreadSec: 0.036,
					},
					{ midi: [52], durationSec: 0.46, stepDurationMs: 480, noteLabel: "E3" },
				],
			},
			{
				id: "grace-8",
				barLabel: "Bars 11–12",
				chordSymbol: "G",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["G", "B", "D"],
				displayMidi: [67, 71, 74],
				circleDegree: 1,
				cue: '"found, was blind, but"',
				events: [
					{
						midi: [43, 47, 50],
						durationSec: 1.0,
						stepDurationMs: 920,
						noteLabel: "G chord + D3",
						spreadSec: 0.036,
					},
					{ midi: [50], durationSec: 0.46, stepDurationMs: 480, noteLabel: "D3" },
					{
						midi: [43, 47, 50, 55],
						durationSec: 1.0,
						stepDurationMs: 920,
						noteLabel: "G chord + G3",
						spreadSec: 0.036,
					},
					{ midi: [59], durationSec: 0.25, stepDurationMs: 240, noteLabel: "B3" },
					{ midi: [55], durationSec: 0.25, stepDurationMs: 240, noteLabel: "G3" },
				],
			},
			{
				id: "grace-9",
				barLabel: "Bar 13",
				chordSymbol: "Em",
				roman: "vi",
				quality: "minor",
				guitarKind: "minor",
				chordNotes: ["E", "G", "B"],
				displayMidi: [64, 67, 71],
				circleDegree: 6,
				cue: '"now"',
				events: [
					{
						midi: [40, 47, 52, 55, 59],
						durationSec: 0.96,
						stepDurationMs: 920,
						noteLabel: "Em chord + B3",
						spreadSec: 0.036,
					},
				],
			},
			{
				id: "grace-10",
				barLabel: "Bar 13 (beat 3)",
				chordSymbol: "D7",
				roman: "V7",
				quality: "major",
				guitarKind: "7",
				chordNotes: ["D", "F♯", "A", "C"],
				displayMidi: [62, 66, 69, 72],
				circleDegree: 5,
				cue: '"I"',
				events: [
					{
						midi: [50, 54, 57],
						durationSec: 0.5,
						stepDurationMs: 480,
						noteLabel: "D7 + A3",
						spreadSec: 0.018,
					},
				],
			},
			{
				id: "grace-11",
				barLabel: "Bar 14",
				chordSymbol: "G",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["G", "B", "D"],
				displayMidi: [67, 71, 74],
				circleDegree: 1,
				cue: '"see."',
				events: [
					{
						midi: [43, 47, 50, 55, 59, 67],
						durationSec: 1.5,
						stepDurationMs: 1400,
						noteLabel: "Open G Strum",
						spreadSec: 0.032,
					},
				],
			},
		],
	},
	{
		id: "bach-cello-suite-1",
		title: "Cello Suite No. 1 — Prelude (BWV 1007)",
		composerOrSource: "J.S. Bach",
		subtitle: "Bariolage string crossings over an open G2 pedal",
		instruments: ["cello"],
		keySlot: 1,
		keyMode: "major",
		keyLabel: "G Major",
		timeSignature: "4/4",
		bpm: 96,
		theorySummary:
			"Outlines I → IV6/4 → V7 → I across open G2 and D3 strings while shifting fingered upper voices (B–C–F♯–G) on D and A strings.",
		steps: [
			{
				id: "bach-bar-1",
				barLabel: "Bar 1",
				chordSymbol: "G",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["G", "B", "D"],
				displayMidi: [67, 71, 74],
				circleDegree: 1,
				cue: "Open G2 – D3 – B3 (1st finger) – A3",
				events: buildBachBarEvents(
					[
						{ midi: 43, label: "G2 (Open III)" },
						{ midi: 50, label: "D3 (Open II)" },
						{ midi: 59, label: "B3 (I · F1)" },
						{ midi: 57, label: "A3 (Open I)" },
						{ midi: 59, label: "B3 (I · F1)" },
						{ midi: 50, label: "D3 (Open II)" },
						{ midi: 59, label: "B3 (I · F1)" },
						{ midi: 50, label: "D3 (Open II)" },
					],
					2,
				),
			},
			{
				id: "bach-bar-2",
				barLabel: "Bar 2",
				chordSymbol: "C/G",
				roman: "IV",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["C", "E", "G"],
				displayMidi: [60, 64, 67],
				circleDegree: 4,
				cue: "G2 pedal – E3 (1st finger) – C4 (2nd finger)",
				events: buildBachBarEvents(
					[
						{ midi: 43, label: "G2 (Open III)" },
						{ midi: 52, label: "E3 (II · F1)" },
						{ midi: 60, label: "C4 (I · F2)" },
						{ midi: 59, label: "B3 (I · F1)" },
						{ midi: 60, label: "C4 (I · F2)" },
						{ midi: 52, label: "E3 (II · F1)" },
						{ midi: 60, label: "C4 (I · F2)" },
						{ midi: 52, label: "E3 (II · F1)" },
					],
					2,
				),
			},
			{
				id: "bach-bar-3",
				barLabel: "Bar 3",
				chordSymbol: "D7/G",
				roman: "V7",
				quality: "major",
				guitarKind: "7",
				chordNotes: ["D", "F♯", "A", "C"],
				displayMidi: [62, 66, 69, 72],
				circleDegree: 5,
				cue: "G2 pedal – F♯3 (3rd finger) – C4 (2nd finger)",
				events: buildBachBarEvents(
					[
						{ midi: 43, label: "G2 (Open III)" },
						{ midi: 54, label: "F♯3 (II · F3)" },
						{ midi: 60, label: "C4 (I · F2)" },
						{ midi: 59, label: "B3 (I · F1)" },
						{ midi: 60, label: "C4 (I · F2)" },
						{ midi: 54, label: "F♯3 (II · F3)" },
						{ midi: 60, label: "C4 (I · F2)" },
						{ midi: 54, label: "F♯3 (II · F3)" },
					],
					2,
				),
			},
			{
				id: "bach-bar-4",
				barLabel: "Bar 4",
				chordSymbol: "G",
				roman: "I",
				quality: "major",
				guitarKind: "major",
				chordNotes: ["G", "B", "D"],
				displayMidi: [67, 71, 74],
				circleDegree: 1,
				cue: "G2 pedal – G3 (4th finger) – B3 – Tonic Cadence",
				events: [
					...buildBachBarEvents(
						[
							{ midi: 43, label: "G2 (Open III)" },
							{ midi: 55, label: "G3 (II · F4)" },
							{ midi: 59, label: "B3 (I · F1)" },
							{ midi: 57, label: "A3 (Open I)" },
							{ midi: 59, label: "B3 (I · F1)" },
							{ midi: 55, label: "G3 (II · F4)" },
							{ midi: 59, label: "B3 (I · F1)" },
							{ midi: 55, label: "G3 (II · F4)" },
						],
						1,
					),
					{
						midi: [43, 50, 59],
						durationSec: 1.25,
						stepDurationMs: 1250,
						noteLabel: "G2–D3–B3 Bow Roll",
						spreadSec: 0.08,
					},
				],
			},
		],
	},
];

export function getSongsForInstrument(
	instrument: InstrumentTab,
): SongExample[] {
	return SONG_EXAMPLES.filter((song) => song.instruments.includes(instrument));
}

export function flattenSongPlaybackSteps(song: SongExample): {
	events: FlattenedSongStep[];
	totalDurationMs: number;
} {
	const events: FlattenedSongStep[] = [];
	let currentMs = 0;

	song.steps.forEach((chordStep, chordStepIndex) => {
		for (const evt of chordStep.events) {
			events.push({
				atMs: currentMs,
				durationSec: evt.durationSec,
				midi: evt.midi,
				spreadSec: evt.spreadSec,
				chordStepIndex,
				chordStep,
				noteLabel: evt.noteLabel,
			});
			currentMs += evt.stepDurationMs;
		}
	});

	return {
		events,
		totalDurationMs: currentMs,
	};
}
