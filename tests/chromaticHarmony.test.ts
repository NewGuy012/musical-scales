import { describe, expect, test } from "bun:test";
import { analyzeColorHarmony } from "../src/react-app/theory/chromaticHarmony";
import {
	CIRCLE_SLOTS,
	analyzeKey,
	mod12,
	noteToPitchClass,
} from "../src/react-app/theory/circleOfFifths";
import { getGuitarVoicings } from "../src/react-app/theory/guitarFretboard";

describe("Color Harmony engine (Chromatic Passing, Diminished, Secondary Dominants, Tritone Subs)", () => {
	test("builds valid playable chords across all 12 Circle slots in Major and Minor modes", () => {
		for (const slot of CIRCLE_SLOTS) {
			for (const mode of ["major", "minor"] as const) {
				for (const pref of ["standard", "sharps", "flats"] as const) {
					const analysis = analyzeKey(slot.index, mode, pref);
					const color = analyzeColorHarmony(analysis);

					// 1. Chromatic passing patterns
					expect(color.chromaticPassing.patterns).toHaveLength(3);
					for (const p of color.chromaticPassing.patterns) {
						expect(p.steps.length).toBeGreaterThanOrEqual(3);
						for (const step of p.steps) {
							expect(step.notes.length).toBeGreaterThanOrEqual(3);
							expect(step.midi.length).toBe(step.notes.length);
							expect(step.circleIndex).toBeGreaterThanOrEqual(0);
							expect(step.circleIndex).toBeLessThanOrEqual(11);
							expect(
								getGuitarVoicings(
									step.root,
									step.guitarKind,
									step.notes,
									step.root.includes("♭"),
								).length,
							).toBeGreaterThanOrEqual(1);
						}
					}

					// 2. Diminished symmetry family (4 twins share identical pitch-class set)
					const symChords = color.diminishedHarmony.symmetryFamilyChords;
					expect(symChords).toHaveLength(4);
					const baseSet = new Set(symChords[0].notes.map(noteToPitchClass));
					expect(baseSet.size).toBe(4);
					for (let i = 1; i < symChords.length; i++) {
						const nextSet = new Set(symChords[i].notes.map(noteToPitchClass));
						expect(nextSet).toEqual(baseSet);
						expect(
							mod12(
								noteToPitchClass(symChords[i].root) -
									noteToPitchClass(symChords[0].root),
							),
						).toBe(i * 3);
					}
					expect(color.diminishedHarmony.patterns).toHaveLength(3);

					// 3. Secondary dominants sit +7 semitones above target chord root
					expect(color.secondaryDominants.items).toHaveLength(5);
					for (const sec of color.secondaryDominants.items) {
						expect(sec.dominantChord.guitarKind).toBe("7");
						const domPc = noteToPitchClass(sec.dominantChord.root);
						const targetPc = noteToPitchClass(sec.targetChord.root);
						expect(mod12(domPc - targetPc)).toBe(7);
						expect(sec.resolutionSteps.length).toBeGreaterThanOrEqual(2);
					}

					// 4. Primary Tritone Sub sits 180 degrees (+6 circle slots) opposite V7 and shares guide tones
					const tri = color.tritoneSubstitutions.primary;
					const origPc = noteToPitchClass(tri.originalDominant.root);
					const subPc = noteToPitchClass(tri.tritoneSubChord.root);
					expect(mod12(subPc - origPc)).toBe(6);
					expect(
						mod12(
							tri.tritoneSubChord.circleIndex -
								tri.originalDominant.circleIndex,
						),
					).toBe(6);

					const origGuide = new Set([
						noteToPitchClass(tri.originalDominant.notes[1]),
						noteToPitchClass(tri.originalDominant.notes[3]),
					]);
					const subGuide = new Set([
						noteToPitchClass(tri.tritoneSubChord.notes[1]),
						noteToPitchClass(tri.tritoneSubChord.notes[3]),
					]);
					expect(subGuide).toEqual(origGuide);
				}
			}
		}
	});

	test("C Major produces textbook chromatic slides, C♯dim7 family, V7/V (D7), and D♭7 tritone sub", () => {
		const cMaj = analyzeKey(0, "major");
		const color = analyzeColorHarmony(cMaj);

		expect(color.chromaticPassing.patterns[0].formula).toBe(
			"Em7 → E♭m7 → Dm7 → Cmaj7",
		);
		expect(
			color.chromaticPassing.patterns[0].steps[1].borrowedNotes.length,
		).toBeGreaterThanOrEqual(2);

		expect(
			color.diminishedHarmony.symmetryFamilyChords.map((c) => c.symbol),
		).toEqual(["C♯dim7", "Edim7", "Gdim7", "B♭dim7"]);
		expect(color.diminishedHarmony.patterns[0].steps[1].symbol).toBe("C♯dim7");

		const vOfV = color.secondaryDominants.items[0];
		expect(vOfV.romanLabel).toBe("V7/V");
		expect(vOfV.dominantChord.symbol).toBe("D7");
		expect(vOfV.dominantChord.borrowedNotes).toEqual(["F♯"]);

		const pri = color.tritoneSubstitutions.primary;
		expect(pri.originalDominant.symbol).toBe("G7");
		expect(pri.tritoneSubChord.symbol).toBe("D♭7");
		expect(pri.tritoneSubChord.circleIndex).toBe(7);
		expect(pri.sharedTritoneNotes).toEqual(["B/C♭", "F"]);
	});

	test("A Minor produces line cliché with Caug, G♯dim7 family, V7/iv (A7), and B♭7 tritone sub", () => {
		const aMin = analyzeKey(0, "minor");
		const color = analyzeColorHarmony(aMin);

		expect(color.chromaticPassing.patterns[0].formula).toBe(
			"Am → Caug → Am7 → F♯m7♭5",
		);
		expect(
			color.diminishedHarmony.symmetryFamilyChords.map((c) => c.symbol),
		).toEqual(["G♯dim7", "Bdim7", "Ddim7", "Fdim7"]);

		const vOfIv = color.secondaryDominants.items[0];
		expect(vOfIv.romanLabel).toBe("V7/iv");
		expect(vOfIv.dominantChord.symbol).toBe("A7");

		const pri = color.tritoneSubstitutions.primary;
		expect(pri.originalDominant.symbol).toBe("E7");
		expect(pri.tritoneSubChord.symbol).toBe("B♭7");
	});
});
