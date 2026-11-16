import { describe, expect, test } from "bun:test";
import {
	CIRCLE_SLOTS,
	analyzeKey,
	ascendingNotesToMidi,
	buildScale,
	noteToPitchClass,
} from "../src/react-app/theory/circleOfFifths";

describe("Circle of Fifths music theory engine", () => {
	test("builds exact textbook scales for sharp and flat enharmonic keys", () => {
		expect(buildScale("C", "major")).toEqual([
			"C",
			"D",
			"E",
			"F",
			"G",
			"A",
			"B",
		]);
		expect(buildScale("F♯", "major")).toEqual([
			"F♯",
			"G♯",
			"A♯",
			"B",
			"C♯",
			"D♯",
			"E♯",
		]);
		expect(buildScale("G♭", "major")).toEqual([
			"G♭",
			"A♭",
			"B♭",
			"C♭",
			"D♭",
			"E♭",
			"F",
		]);
		expect(buildScale("C♭", "major")).toEqual([
			"C♭",
			"D♭",
			"E♭",
			"F♭",
			"G♭",
			"A♭",
			"B♭",
		]);
		expect(buildScale("C♯", "major")).toEqual([
			"C♯",
			"D♯",
			"E♯",
			"F♯",
			"G♯",
			"A♯",
			"B♯",
		]);
		expect(buildScale("A", "minor")).toEqual([
			"A",
			"B",
			"C",
			"D",
			"E",
			"F",
			"G",
		]);
		expect(buildScale("E♭", "minor")).toEqual([
			"E♭",
			"F",
			"G♭",
			"A♭",
			"B♭",
			"C♭",
			"D♭",
		]);
	});

	test("for every key and mode, yields 3 major chords, 3 minor chords, and 1 diminished chord", () => {
		for (const pref of ["standard", "sharps", "flats"] as const) {
			for (let slot = 0; slot < CIRCLE_SLOTS.length; slot++) {
				for (const mode of ["major", "minor"] as const) {
					const analysis = analyzeKey(slot, mode, pref);
					expect(analysis.scaleNotes).toHaveLength(7);
					expect(analysis.chords).toHaveLength(7);
					expect(analysis.majorChords).toHaveLength(3);
					expect(analysis.minorChords).toHaveLength(3);
					expect(analysis.diminishedChord.quality).toBe("diminished");

					if (mode === "major") {
						expect(analysis.majorChords.map((c) => c.roman)).toEqual([
							"I",
							"IV",
							"V",
						]);
						expect(analysis.minorChords.map((c) => c.roman)).toEqual([
							"ii",
							"iii",
							"vi",
						]);
					} else {
						expect(analysis.minorChords.map((c) => c.roman)).toEqual([
							"i",
							"iv",
							"v",
						]);
						expect(analysis.majorChords.map((c) => c.roman)).toEqual([
							"III",
							"VI",
							"VII",
						]);
						expect(analysis.harmonicMinorV?.quality).toBe("major");
					}

					// Ensure every chord and scale stays inside the 2-octave C4..B5 piano range
					for (const midi of analysis.scaleMidi) {
						expect(midi).toBeGreaterThanOrEqual(60);
						expect(midi).toBeLessThanOrEqual(83);
					}
					for (const chord of analysis.chords) {
						for (const midi of chord.seventhMidi) {
							expect(midi).toBeGreaterThanOrEqual(60);
							expect(midi).toBeLessThanOrEqual(83);
						}
					}
				}
			}
		}
	});

	test("fifths and fourths neighbors always share 6/7 scale tones and move by +7 / +5 semitones", () => {
		for (const pref of ["standard", "sharps", "flats"] as const) {
			for (let slot = 0; slot < 12; slot++) {
				for (const mode of ["major", "minor"] as const) {
					const analysis = analyzeKey(slot, mode, pref);
					const rootPc = noteToPitchClass(analysis.root);

					const fifthPc = noteToPitchClass(analysis.fifthNeighbor.root);
					expect((fifthPc - rootPc + 12) % 12).toBe(7);
					expect(analysis.fifthNeighbor.sharedCount).toBe(6);
					expect(analysis.fifthNeighbor.removedNote.length).toBeGreaterThan(0);
					expect(analysis.fifthNeighbor.addedNote.length).toBeGreaterThan(0);

					const fourthPc = noteToPitchClass(analysis.fourthNeighbor.root);
					expect((fourthPc - rootPc + 12) % 12).toBe(5);
					expect(analysis.fourthNeighbor.sharedCount).toBe(6);
					expect(analysis.fourthNeighbor.removedNote.length).toBeGreaterThan(0);
					expect(analysis.fourthNeighbor.addedNote.length).toBeGreaterThan(0);
				}
			}
		}
	});

	test("C major and A minor diatonic chords and neighbor shifts match exact expectations", () => {
		const cMaj = analyzeKey(0, "major");
		expect(cMaj.majorChords.map((c) => c.symbol)).toEqual(["C", "F", "G"]);
		expect(cMaj.minorChords.map((c) => c.symbol)).toEqual(["Dm", "Em", "Am"]);
		expect(cMaj.diminishedChord.symbol).toBe("B°");
		expect(cMaj.fifthNeighbor.shortName).toBe("G");
		expect(cMaj.fifthNeighbor.removedNote).toBe("F");
		expect(cMaj.fifthNeighbor.addedNote).toBe("F♯");
		expect(cMaj.fourthNeighbor.shortName).toBe("F");
		expect(cMaj.fourthNeighbor.removedNote).toBe("B");
		expect(cMaj.fourthNeighbor.addedNote).toBe("B♭");
		expect(cMaj.tonicPair.major.notes).toEqual(["C", "E", "G"]);
		expect(cMaj.tonicPair.minor.notes).toEqual(["C", "E♭", "G"]);

		const aMin = analyzeKey(0, "minor");
		expect(aMin.minorChords.map((c) => c.symbol)).toEqual(["Am", "Dm", "Em"]);
		expect(aMin.majorChords.map((c) => c.symbol)).toEqual(["C", "F", "G"]);
		expect(aMin.harmonicMinorV?.symbol).toBe("E");
		expect(aMin.harmonicMinorV?.triadNotes).toEqual(["E", "G♯", "B"]);
		expect(aMin.relativeKey.shortName).toBe("C");
		expect(aMin.parallelKey.shortName).toBe("A");
	});

	test("ascendingNotesToMidi places C♭4 safely inside C4..B5", () => {
		const cbTriad = ascendingNotesToMidi(["C♭", "E♭", "G♭"]);
		expect(cbTriad).toEqual([71, 75, 78]);
	});

	test("major and minor progressions cover multiple categories with valid chord degrees", () => {
		const maj = analyzeKey(0, "major");
		const min = analyzeKey(0, "minor");
		expect(maj.progressions.length).toBeGreaterThanOrEqual(10);
		expect(min.progressions.length).toBeGreaterThanOrEqual(10);

		for (const p of maj.progressions) {
			expect(p.category.length).toBeGreaterThan(0);
			expect(p.degrees.length).toBeGreaterThanOrEqual(3);
			for (const deg of p.degrees) {
				expect(deg).toBeGreaterThanOrEqual(1);
				expect(deg).toBeLessThanOrEqual(7);
			}
		}

		for (const p of min.progressions) {
			expect(p.category.length).toBeGreaterThan(0);
			expect(p.degrees.length).toBeGreaterThanOrEqual(3);
			for (const deg of p.degrees) {
				expect(deg === -5 || (deg >= 1 && deg <= 7)).toBe(true);
			}
		}
	});
});
