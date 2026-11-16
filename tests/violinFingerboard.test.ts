import { describe, expect, test } from "bun:test";
import {
	mod12,
	noteToPitchClass,
} from "../src/react-app/theory/circleOfFifths";
import type { GuitarChordKind } from "../src/react-app/theory/guitarFretboard";
import {
	MAX_VIOLIN_SEMITONE,
	VIOLIN_TUNING,
	getViolinVoicings,
} from "../src/react-app/theory/violinFingerboard";

const CHORD_INTERVALS: Record<GuitarChordKind, number[]> = {
	major: [0, 4, 7],
	minor: [0, 3, 7],
	diminished: [0, 3, 6],
	aug: [0, 4, 8],
	maj7: [0, 4, 7, 11],
	m7: [0, 3, 7, 10],
	"7": [0, 4, 7, 10],
	"m7♭5": [0, 3, 6, 10],
	dim7: [0, 3, 6, 9],
	add9: [0, 4, 7, 2],
	madd9: [0, 3, 7, 2],
	sus4: [0, 5, 7],
	sus2: [0, 2, 7],
};

const OMIT_FIFTH_KINDS = new Set<GuitarChordKind>([
	"maj7",
	"m7",
	"7",
	"add9",
	"madd9",
]);

const ALL_ROOTS = [
	"C",
	"G",
	"D",
	"A",
	"E",
	"B",
	"F♯",
	"C♯",
	"F",
	"B♭",
	"E♭",
	"A♭",
	"D♭",
	"G♭",
	"C♭",
] as const;

describe("violinFingerboard", () => {
	test("defines standard G3-D4-A4-E5 fifths tuning", () => {
		expect(VIOLIN_TUNING.map((s) => `${s.label}:${s.openMidi}`)).toEqual([
			"G:55",
			"D:62",
			"A:69",
			"E:76",
		]);
		expect(MAX_VIOLIN_SEMITONE).toBe(14);
	});

	test("includes Open 4-Str [0, 0, 2, 3] for G major and Open D-Str [-1, 0, 0, 2] for D major", () => {
		const gVoicings = getViolinVoicings("G", "major", ["G", "B", "D"], false);
		expect(gVoicings.length).toBeGreaterThanOrEqual(3);
		const openG = gVoicings.find((v) => v.semitones.join(",") === "0,0,2,3");
		expect(openG).toBeDefined();
		expect(openG?.notes.map((n) => n.noteName)).toEqual(["G", "D", "B", "G"]);
		expect(openG?.notes.map((n) => n.finger)).toEqual([0, 0, 1, 2]);
		expect(openG?.soundingMidi).toEqual([55, 62, 71, 79]);

		const dVoicings = getViolinVoicings("D", "major", ["D", "F♯", "A"], false);
		const openD = dVoicings.find((v) => v.semitones.join(",") === "-1,0,0,2");
		expect(openD).toBeDefined();
		expect(openD?.name).toBe("Open D-Str");
		expect(openD?.soundingMidi).toEqual([62, 69, 78]);
	});

	test("produces >= 3 valid closed-frame voicings across all 15 roots and 13 qualities", () => {
		const kinds = Object.keys(CHORD_INTERVALS) as GuitarChordKind[];

		for (const root of ALL_ROOTS) {
			const preferFlats = root === "F" || root.includes("♭");
			const rootPc = noteToPitchClass(root);

			for (const kind of kinds) {
				const allowedPcs = new Set(
					CHORD_INTERVALS[kind].map((off) => mod12(rootPc + off)),
				);
				const requiredPcs = CHORD_INTERVALS[kind]
					.filter((off) => !(OMIT_FIFTH_KINDS.has(kind) && off === 7))
					.map((off) => mod12(rootPc + off));

				const voicings = getViolinVoicings(root, kind, [root], preferFlats);
				expect(voicings.length).toBeGreaterThanOrEqual(3);

				for (const voicing of voicings) {
					expect(voicing.notes).toHaveLength(4);

					const nonZeroSemitones = voicing.semitones.filter((s) => s > 0);
					for (const semi of voicing.semitones) {
						expect(semi).toBeGreaterThanOrEqual(-1);
						expect(semi).toBeLessThanOrEqual(MAX_VIOLIN_SEMITONE);
					}

					if (nonZeroSemitones.length > 0) {
						expect(
							Math.max(...nonZeroSemitones) - Math.min(...nonZeroSemitones),
						).toBeLessThanOrEqual(3);
					}

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
							if (note.semitone === 0) {
								expect(note.finger).toBe(0);
							} else {
								expect(note.finger).toBeGreaterThanOrEqual(1);
								expect(note.finger).toBeLessThanOrEqual(4);
							}
						}
					}

					for (const reqPc of requiredPcs) {
						expect(presentPcs.has(reqPc)).toBe(true);
					}
				}
			}
		}
	});
});
