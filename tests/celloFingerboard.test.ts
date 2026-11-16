import { describe, expect, test } from "bun:test";
import {
	BOWED_TUNINGS,
	type BowedInstrument,
	CELLO_TUNING,
	MAX_BOWED_SEMITONE,
	VIOLIN_TUNING,
	getBowedVoicings,
} from "../src/react-app/theory/celloFingerboard";
import {
	mod12,
	noteToPitchClass,
} from "../src/react-app/theory/circleOfFifths";
import {
	CHORD_INTERVAL_MAP,
	type GuitarChordKind,
} from "../src/react-app/theory/guitarFretboard";

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

describe("bowed fingerboard voicings (cello & violin)", () => {
	test("defines standard C2-G2-D3-A3 cello and G3-D4-A4-E5 violin fifths tunings", () => {
		expect(CELLO_TUNING.map((s) => `${s.label}:${s.openMidi}`)).toEqual([
			"C:36",
			"G:43",
			"D:50",
			"A:57",
		]);
		expect(VIOLIN_TUNING.map((s) => `${s.label}:${s.openMidi}`)).toEqual([
			"G:55",
			"D:62",
			"A:69",
			"E:76",
		]);
		expect(MAX_BOWED_SEMITONE).toBe(14);
		expect(BOWED_TUNINGS.cello).toBe(CELLO_TUNING);
		expect(BOWED_TUNINGS.violin).toBe(VIOLIN_TUNING);
	});

	test("includes idiomatic open-string voicings for cello and violin", () => {
		const celloC = getBowedVoicings("cello", "C", "major", ["C", "E", "G"]);
		const openC = celloC.find((v) => v.semitones.join(",") === "0,0,2,3");
		expect(openC?.notes.map((n) => n.noteName)).toEqual(["C", "G", "E", "C"]);
		expect(openC?.notes.map((n) => n.finger)).toEqual([0, 0, 1, 2]);
		expect(openC?.soundingMidi).toEqual([36, 43, 52, 60]);

		const violinG = getBowedVoicings("violin", "G", "major", ["G", "B", "D"]);
		const openG = violinG.find((v) => v.semitones.join(",") === "0,0,2,3");
		expect(openG?.notes.map((n) => n.noteName)).toEqual(["G", "D", "B", "G"]);
		expect(openG?.notes.map((n) => n.finger)).toEqual([0, 0, 1, 2]);
		expect(openG?.soundingMidi).toEqual([55, 62, 71, 79]);

		const violinD = getBowedVoicings("violin", "D", "major", ["D", "F♯", "A"]);
		const openD = violinD.find((v) => v.semitones.join(",") === "-1,0,0,2");
		expect(openD?.name).toBe("Open D-Str");
		expect(openD?.soundingMidi).toEqual([62, 69, 78]);
	});

	test("produces >= 3 valid closed-frame voicings across cello & violin for all 15 roots and 13 qualities", () => {
		const kinds = Object.keys(CHORD_INTERVAL_MAP) as GuitarChordKind[];

		for (const instrument of ["cello", "violin"] as BowedInstrument[]) {
			for (const root of ALL_ROOTS) {
				const preferFlats = root === "F" || root.includes("♭");
				const rootPc = noteToPitchClass(root);

				for (const kind of kinds) {
					const intervals = Object.keys(CHORD_INTERVAL_MAP[kind]).map(Number);
					const allowedPcs = new Set(
						intervals.map((off) => mod12(rootPc + off)),
					);
					const requiredPcs = intervals
						.filter((off) => !(OMIT_FIFTH_KINDS.has(kind) && off === 7))
						.map((off) => mod12(rootPc + off));

					const voicings = getBowedVoicings(
						instrument,
						root,
						kind,
						[root],
						preferFlats,
					);
					expect(voicings.length).toBeGreaterThanOrEqual(3);

					for (const voicing of voicings) {
						expect(voicing.notes).toHaveLength(4);

						const nonZeroSemitones = voicing.semitones.filter((s) => s > 0);
						for (const semi of voicing.semitones) {
							expect(semi).toBeGreaterThanOrEqual(-1);
							expect(semi).toBeLessThanOrEqual(MAX_BOWED_SEMITONE);
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
								expect(note.finger).toBe(note.semitone === 0 ? 0 : note.finger);
								if (note.semitone > 0) {
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
		}
	});
});
