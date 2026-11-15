import { describe, expect, test } from "bun:test";
import {
	CELLO_TUNING,
	getCelloVoicings,
	MAX_CELLO_SEMITONE,
} from "../src/react-app/theory/celloFingerboard";
import {
	mod12,
	noteToPitchClass,
} from "../src/react-app/theory/circleOfFifths";
import type { GuitarChordKind } from "../src/react-app/theory/guitarFretboard";

const CHORD_INTERVALS: Record<GuitarChordKind, number[]> = {
	major: [0, 4, 7],
	minor: [0, 3, 7],
	diminished: [0, 3, 6],
	maj7: [0, 4, 7, 11],
	m7: [0, 3, 7, 10],
	"7": [0, 4, 7, 10],
	"m7♭5": [0, 3, 6, 10],
};

const REQUIRED_INTERVALS: Record<GuitarChordKind, number[]> = {
	major: [0, 4, 7],
	minor: [0, 3, 7],
	diminished: [0, 3, 6],
	maj7: [0, 4, 11],
	m7: [0, 3, 10],
	"7": [0, 4, 10],
	"m7♭5": [0, 3, 6, 10],
};

const SHARP_NOTES = [
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
const FLAT_NOTES = [
	"C",
	"D♭",
	"D",
	"E♭",
	"E",
	"F",
	"G♭",
	"G",
	"A♭",
	"A",
	"B♭",
	"B",
];

const ALL_ROOTS = [
	{ root: "C", preferFlats: false },
	{ root: "G", preferFlats: false },
	{ root: "D", preferFlats: false },
	{ root: "A", preferFlats: false },
	{ root: "E", preferFlats: false },
	{ root: "B", preferFlats: false },
	{ root: "F♯", preferFlats: false },
	{ root: "C♯", preferFlats: false },
	{ root: "F", preferFlats: true },
	{ root: "B♭", preferFlats: true },
	{ root: "E♭", preferFlats: true },
	{ root: "A♭", preferFlats: true },
	{ root: "D♭", preferFlats: true },
	{ root: "G♭", preferFlats: true },
	{ root: "C♭", preferFlats: true },
];

function buildExpectedChordNotes(
	root: string,
	kind: GuitarChordKind,
	preferFlats: boolean,
): string[] {
	const rootPc = noteToPitchClass(root);
	const scale = preferFlats ? FLAT_NOTES : SHARP_NOTES;
	return CHORD_INTERVALS[kind].map((offset, idx) =>
		idx === 0 ? root : scale[mod12(rootPc + offset)],
	);
}

describe("celloFingerboard", () => {
	test("defines standard C2-G2-D3-A3 fifths tuning", () => {
		expect(CELLO_TUNING.map((s) => `${s.label}:${s.openMidi}`)).toEqual([
			"C:36",
			"G:43",
			"D:50",
			"A:57",
		]);
		expect(MAX_CELLO_SEMITONE).toBe(14);
	});

	test("includes Open 4-Str [0, 0, 2, 3] voicing for C major", () => {
		const voicings = getCelloVoicings("C", "major", ["C", "E", "G"], false);
		expect(voicings.length).toBeGreaterThanOrEqual(3);
		const openC = voicings.find(
			(v) => v.semitones.join(",") === "0,0,2,3",
		);
		expect(openC).toBeDefined();
		expect(openC?.notes.map((n) => n.noteName)).toEqual(["C", "G", "E", "C"]);
		expect(openC?.notes.map((n) => n.finger)).toEqual([0, 0, 1, 2]);
		expect(openC?.soundingMidi).toEqual([36, 43, 52, 60]);
	});

	test("produces >= 3 valid closed-frame voicings across all 15 roots and 7 qualities", () => {
		const kinds = Object.keys(CHORD_INTERVALS) as GuitarChordKind[];

		for (const { root, preferFlats } of ALL_ROOTS) {
			const rootPc = noteToPitchClass(root);

			for (const kind of kinds) {
				const chordNotes = buildExpectedChordNotes(root, kind, preferFlats);
				const allowedPcs = new Set(
					CHORD_INTERVALS[kind].map((off) => mod12(rootPc + off)),
				);
				const requiredPcs = REQUIRED_INTERVALS[kind].map((off) =>
					mod12(rootPc + off),
				);

				const voicings = getCelloVoicings(root, kind, chordNotes, preferFlats);
				expect(voicings.length).toBeGreaterThanOrEqual(3);

				for (const voicing of voicings) {
					expect(voicing.notes).toHaveLength(4);

					// All played semitones within 0..MAX_CELLO_SEMITONE
					const nonZeroSemitones = voicing.semitones.filter((s) => s > 0);
					for (const semi of voicing.semitones) {
						expect(semi).toBeGreaterThanOrEqual(-1);
						expect(semi).toBeLessThanOrEqual(MAX_CELLO_SEMITONE);
					}

					// Closed left-hand frame <= 3 semitones (fingers 1..4)
					if (nonZeroSemitones.length > 0) {
						const span =
							Math.max(...nonZeroSemitones) - Math.min(...nonZeroSemitones);
						expect(span).toBeLessThanOrEqual(3);
					}

					// Pitch classes belong to chord and finger numbers are 0..4 or null
					const presentPcs = new Set<number>();
					for (const note of voicing.notes) {
						if (note.semitone === -1) {
							expect(note.finger).toBeNull();
							expect(note.midi).toBeNull();
							expect(note.pc).toBeNull();
							expect(note.intervalLabel).toBe("×");
						} else {
							expect(note.pc).not.toBeNull();
							expect(allowedPcs.has(note.pc as number)).toBe(true);
							presentPcs.add(note.pc as number);
							expect(note.finger).not.toBeNull();
							if (note.semitone === 0) {
								expect(note.finger).toBe(0);
							} else {
								expect(note.finger).toBeGreaterThanOrEqual(1);
								expect(note.finger).toBeLessThanOrEqual(4);
							}
						}
					}

					// Every essential interval for the chord quality is present
					for (const reqPc of requiredPcs) {
						expect(presentPcs.has(reqPc)).toBe(true);
					}
				}
			}
		}
	});
});
