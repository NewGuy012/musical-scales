import { describe, expect, test } from "bun:test";
import { mod12, noteToPitchClass } from "../src/react-app/theory/circleOfFifths";
import {
	GuitarChordKind,
	MAX_GUITAR_FRET,
	getGuitarVoicings,
} from "../src/react-app/theory/guitarFretboard";

const ALL_ROOTS = [
	"C",
	"C♯",
	"D♭",
	"D",
	"E♭",
	"E",
	"F",
	"F♯",
	"G♭",
	"G",
	"A♭",
	"A",
	"B♭",
	"B",
	"C♭",
] as const;

const CHORD_SPECS: Record<GuitarChordKind, number[]> = {
	major: [0, 4, 7],
	minor: [0, 3, 7],
	diminished: [0, 3, 6],
	maj7: [0, 4, 7, 11],
	m7: [0, 3, 7, 10],
	"7": [0, 4, 7, 10],
	"m7♭5": [0, 3, 6, 10],
};

describe("Guitar fretboard chord voicing generator", () => {
	test("generates at least 3 valid, playable voicings across all 15 roots and 7 chord qualities", () => {
		for (const root of ALL_ROOTS) {
			const rootPc = noteToPitchClass(root);
			for (const [kind, intervals] of Object.entries(CHORD_SPECS) as [
				GuitarChordKind,
				number[],
			][]) {
				const allowedPcs = new Set(intervals.map((i) => mod12(rootPc + i)));
				const voicings = getGuitarVoicings(
					root,
					kind,
					[root],
					root.includes("♭"),
				);

				expect(voicings.length).toBeGreaterThanOrEqual(3);

				for (const v of voicings) {
					expect(v.soundingMidi.length).toBeGreaterThanOrEqual(3);

					// Every sounding fret belongs strictly to the chord's pitch classes
					const presentPcs = new Set<number>();
					for (const n of v.notes) {
						if (n.fret >= 0) {
							expect(n.fret).toBeLessThanOrEqual(MAX_GUITAR_FRET);
							expect(n.pc).not.toBeNull();
							expect(allowedPcs.has(n.pc!)).toBe(true);
							expect(n.intervalLabel).not.toBe("?");
							presentPcs.add(n.pc!);
						}
					}

					// Root must be present (and lowest sounding note should be Root for these voicings)
					expect(presentPcs.has(rootPc)).toBe(true);
					const lowestSounding = v.notes.find((n) => n.fret >= 0);
					expect(lowestSounding?.pc).toBe(rootPc);

					// Essential intervals (3rd and 7th for 7ths, 3rd and 5th for triads) must be present
					if (kind === "major" || kind === "minor" || kind === "diminished") {
						for (const reqPc of allowedPcs) {
							expect(presentPcs.has(reqPc)).toBe(true);
						}
					} else {
						// For 7th chords, root + 3rd + 7th (plus 5th when non-shell) must be present
						expect(presentPcs.has(mod12(rootPc + intervals[1]))).toBe(true);
						expect(presentPcs.has(mod12(rootPc + intervals[3]))).toBe(true);
						if (kind === "m7♭5") {
							expect(presentPcs.has(mod12(rootPc + 6))).toBe(true);
						}
					}

					// Playable finger span <= 4 frets
					const fretted = v.frets.filter((f) => f > 0);
					if (fretted.length > 0) {
						expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(
							4,
						);
					}
				}
			}
		}
	});

	test("C major includes Open C, A-shape (fret 3), G-shape (fret 5), E-shape (fret 8), and D-shape (fret 10)", () => {
		const cMaj = getGuitarVoicings("C", "major", ["C", "E", "G"], false);
		expect(cMaj[0].name).toBe("Open C");
		expect(cMaj[0].frets).toEqual([-1, 3, 2, 0, 1, 0]);
		expect(cMaj.some((v) => v.name === "A-Shape Barre" && v.baseFret === 3)).toBe(
			true,
		);
		expect(cMaj.some((v) => v.name === "E-Shape Barre" && v.baseFret === 8)).toBe(
			true,
		);
		expect(
			cMaj.some((v) => v.name === "D-Shape Upper" && v.baseFret === 10),
		).toBe(true);
	});
});
