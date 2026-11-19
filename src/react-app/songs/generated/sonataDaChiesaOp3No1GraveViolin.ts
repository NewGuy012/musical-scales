import type { SongDocument } from "../songRuntime";

export const SONATA_DA_CHIESA_OP_3_NO_1_GRAVE_VIOLIN_SPEC: SongDocument = {
	version: 2,
	id: "sonata-da-chiesa-op-3-no-1-grave-violin",
	idPrefix: "sonata",
	title: "Sonata da Chiesa, Op. 3 No. 1 — Grave",
	composerOrSource: "Arcangelo Corelli",
	subtitle: "F Major (4/4) · violin MusicXML",
	instruments: ["violin"],
	tpq: 960,
	keySlot: 11,
	keyMode: "major",
	keyLabel: "F Major",
	timeSignature: "4/4",
	tempoMap: [[0, 60]],
	theorySummary:
		"Ingested from MusicXML in F Major (4/4, 60 BPM) with polyphonic timing, dynamics, and ergonomic violin fingerings.",
	studyGuide: {
		vibeAndSound:
			"MusicXML violin arrangement of Sonata da Chiesa, Op. 3 No. 1 — Grave in F Major with polyphonic timing, dynamics, and instrument fingerings.",
		harmonyHook:
			"Tracks F Major harmony bar-by-bar against the Circle of Fifths.",
		practiceTips: [
			"Audition individual sections slowly before stringing the full arrangement together.",
			"Watch the highlighted fretboard/fingerboard markers to keep left-hand position shifts economical.",
			"Use the Circle of Fifths wheel to spot secondary dominants and chromatic passing chords.",
		],
		sections: [
			{
				id: "imp-sec-1",
				title: "1. Main Theme",
				barRange: "Bars 1–19",
				startStepIndex: 0,
				endStepIndex: 18,
				progressionTag: "F – C – B♭ – F – C – C/G",
				insight: "Measures 1–19 in F Major moving across F → C → B♭ → F.",
			},
		],
	},
	chords: {
		F: {
			roman: "I",
			quality: "major",
			notes: ["F", "A", "C"],
			degree: 1,
			slot: 11,
		},
		Gm7: {
			roman: "ii7",
			quality: "minor",
			notes: ["G", "B♭", "D", "F"],
			degree: 2,
			slot: 10,
			guitarKind: "m7",
		},
		C: {
			roman: "V",
			quality: "major",
			notes: ["C", "E", "G"],
			degree: 5,
			slot: 0,
		},
		"F/A": {
			roman: "I",
			quality: "major",
			notes: ["F", "A", "C"],
			degree: 1,
			slot: 11,
		},
		"B♭": {
			roman: "IV",
			quality: "major",
			notes: ["B♭", "D", "F"],
			degree: 4,
			slot: 10,
		},
		"F/C": {
			roman: "I",
			quality: "major",
			notes: ["F", "A", "C"],
			degree: 1,
			slot: 11,
		},
		"C/G": {
			roman: "V",
			quality: "major",
			notes: ["C", "E", "G"],
			degree: 5,
			slot: 0,
		},
		"Dm7/F": {
			roman: "vi7",
			quality: "minor",
			notes: ["D", "F", "A", "C"],
			degree: 6,
			slot: 11,
			guitarKind: "m7",
		},
		"Am7/E": {
			roman: "iii7",
			quality: "minor",
			notes: ["A", "C", "E", "G"],
			degree: 3,
			slot: 0,
			guitarKind: "m7",
		},
		C7: {
			roman: "V7",
			quality: "major",
			notes: ["C", "E", "G", "B♭"],
			degree: 5,
			slot: 0,
			guitarKind: "7",
		},
		"Em/B": {
			roman: "vii°",
			quality: "minor",
			notes: ["E", "G", "B"],
			degree: 7,
			slot: 1,
		},
		Dm: {
			roman: "vi",
			quality: "minor",
			notes: ["D", "F", "A"],
			degree: 6,
			slot: 11,
		},
		A7: {
			roman: "V/vi",
			quality: "major",
			notes: ["A", "C♯", "E", "G"],
			degree: 3,
			slot: 3,
			guitarKind: "7",
		},
		"B♭/D": {
			roman: "IV",
			quality: "major",
			notes: ["B♭", "D", "F"],
			degree: 4,
			slot: 10,
		},
		"B♭maj7": {
			roman: "IVmaj7",
			quality: "major",
			notes: ["B♭", "D", "F", "A"],
			degree: 4,
			slot: 10,
			guitarKind: "maj7",
		},
		"C/D": {
			roman: "V",
			quality: "major",
			notes: ["C", "E", "G"],
			degree: 5,
			slot: 0,
		},
		"Gm/B♭": {
			roman: "ii",
			quality: "minor",
			notes: ["G", "B♭", "D"],
			degree: 2,
			slot: 10,
		},
	},
	bars: [
		{
			harmony: [
				[0, "F"],
				[1920, "Gm7"],
			],
			notes: [
				[0, 1440, 84, 78, null, [3, 8, 4]],
				[1440, 480, 84, 78, null, [3, 8, 4]],
				[1920, 960, 82, 78, null, [3, 6, 4]],
				[2880, 960, 81, 78, null, [3, 5, 3]],
			],
		},
		{
			harmony: [
				[0, "C"],
				[1920, "F/A"],
			],
			notes: [
				[0, 1920, 79, 78, null, [3, 3, 1]],
				[1920, 480, 81, 78, null, [3, 5, 3]],
				[2400, 480, 82, 78, null, [3, 6, 4]],
				[2880, 1440, 84, 78, null, [3, 8, 4]],
			],
		},
		{
			harmony: [
				[0, "B♭"],
				[1920, "F/C"],
			],
			notes: [
				[480, 480, 77, 78, null, [2, 8, 4]],
				[960, 1920, 82, 78, null, [3, 6, 4]],
				[2880, 960, 81, 78, null, [3, 5, 4]],
			],
		},
		{
			harmony: [[0, "F"]],
			notes: [
				[0, 1920, 79, 78, null, [3, 3, 3]],
				[1920, 1920, 77, 78, null, [3, 1, 1]],
			],
		},
		{
			harmony: [[0, "C"]],
			notes: [
				[0, 1440, 81, 78, null, [3, 5, 4]],
				[1440, 480, 81, 78, null, [3, 5, 4]],
				[1920, 1440, 79, 78, null, [3, 3, 2]],
				[3360, 240, 81, 78, null, [3, 5, 4]],
				[3600, 240, 79, 78, "slur", [3, 3, 3]],
			],
		},
		{
			harmony: [
				[0, "C/G"],
				[1920, "C"],
			],
			notes: [
				[0, 1440, 77, 78, null, [3, 1, 1]],
				[1440, 240, 79, 78, null, [3, 3, 3]],
				[1680, 240, 77, 78, "slur", [3, 1, 1]],
				[1920, 1440, 76, 78, null, [3, 0, 0]],
				[3360, 480, 79, 78, null, [3, 3, 3]],
			],
		},
		{
			harmony: [
				[0, "Dm7/F"],
				[1920, "Am7/E"],
			],
			notes: [
				[0, 480, 81, 78, null, [3, 5, 4]],
				[480, 480, 74, 78, null, [2, 5, 4]],
				[960, 480, 74, 78, null, [2, 5, 4]],
				[1440, 480, 74, 78, null, [2, 5, 4]],
				[1920, 480, 74, 78, null, [2, 5, 4]],
				[2400, 480, 72, 78, "slur", [2, 3, 2]],
				[3360, 480, 79, 78, null, [3, 3, 2]],
			],
		},
		{
			harmony: [
				[0, "F"],
				[1920, "F/C"],
			],
			notes: [
				[0, 240, 81, 78, null, [3, 5, 4]],
				[240, 240, 79, 78, "slur", [3, 3, 3]],
				[480, 240, 77, 78, null, [3, 1, 1]],
				[720, 240, 76, 78, "slur", [3, 0, 0]],
				[960, 960, 74, 78, null, [2, 5, 4]],
				[1920, 960, 72, 78, null, [2, 3, 3]],
				[2880, 1920, 77, 78, null, [3, 1, 1]],
			],
		},
		{
			harmony: [
				[0, "C7"],
				[1920, "F"],
			],
			notes: [
				[960, 960, 76, 78, null, [3, 0, 0]],
				[1920, 2880, 81, 78, null, [3, 5, 4]],
			],
		},
		{
			harmony: [
				[0, "C7"],
				[1920, "F/A"],
			],
			notes: [
				[960, 1920, 79, 78, null, [3, 3, 3]],
				[2880, 1920, 77, 78, null, [3, 1, 1]],
			],
		},
		{
			harmony: [
				[0, "Em/B"],
				[1920, "Dm"],
			],
			notes: [
				[960, 1440, 76, 78, null, [3, 0, 0]],
				[2400, 480, 69, 78, null, [2, 0, 0]],
				[2880, 1920, 74, 78, null, [2, 5, 4]],
			],
		},
		{
			harmony: [
				[0, "A7"],
				[1920, "B♭/D"],
			],
			notes: [
				[960, 720, 74, 78, null, [2, 5, 4]],
				[1680, 240, 73, 78, null, [2, 4, 3]],
				[1920, 960, 74, 78, null, [2, 5, 4]],
				[2880, 1920, 70, 78, null, [2, 1, 1]],
			],
		},
		{
			harmony: [
				[0, "F"],
				[1920, "B♭maj7"],
			],
			notes: [
				[960, 1920, 69, 78, null, [2, 0, 0]],
				[2880, 480, 67, 78, null, [1, 5, 4]],
				[3360, 480, 65, 78, "slur", [1, 3, 2]],
			],
		},
		{
			harmony: [
				[0, "C"],
				[1920, "C/D"],
			],
			notes: [
				[0, 480, 64, 78, null, [1, 2, 1]],
				[480, 480, 60, 78, null, [0, 5, 4]],
				[960, 1920, 84, 78, null, [3, 8, 4]],
				[2880, 1920, 82, 78, null, [3, 6, 4]],
			],
		},
		{
			harmony: [
				[0, "F/A"],
				[1920, "Gm/B♭"],
			],
			notes: [
				[960, 960, 81, 78, null, [3, 5, 4]],
				[1920, 1440, 74, 78, null, [2, 5, 4]],
				[3360, 480, 79, 78, null, [3, 3, 3]],
			],
		},
		{
			harmony: [[0, "F/C"]],
			notes: [
				[0, 480, 76, 78, null, [3, 0, 0]],
				[480, 480, 72, 78, null, [2, 3, 3]],
				[960, 1920, 77, 78, null, [3, 1, 1]],
				[2880, 720, 77, 78, null, [3, 1, 1]],
				[3600, 240, 76, 78, null, [3, 0, 0]],
			],
		},
		{
			harmony: [
				[0, "F/A"],
				[1920, "B♭"],
			],
			notes: [
				[0, 1440, 77, 78, null, [3, 1, 1]],
				[1440, 480, 72, 78, null, [2, 3, 3]],
				[1920, 1440, 74, 78, null, [2, 5, 4]],
				[3360, 480, 62, 78, null, [1, 0, 0]],
			],
		},
		{
			harmony: [[0, "C"]],
			notes: [
				[0, 960, 64, 78, null, [1, 2, 2]],
				[960, 1920, 65, 78, null, [1, 3, 3]],
				[2880, 960, 64, 78, null, [1, 2, 2]],
			],
		},
		{
			harmony: [[0, "F"]],
			notes: [[0, 3840, 65, 78, null, [1, 3, 3]]],
		},
	],
};
