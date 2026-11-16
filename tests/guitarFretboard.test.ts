import { describe, expect, test } from "bun:test";
import {
	analyzeKey,
	mod12,
	noteToPitchClass,
} from "../src/react-app/theory/circleOfFifths";
import {
	GuitarChordKind,
	MAX_GUITAR_FRET,
	buildChordVariation,
	buildGuitarScalePassGuide,
	getChromaticDegreeLabel,
	getGuitarVoicings,
	notesToGuitarMidi,
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

describe("Guitar fretboard chord voicing generator", () => {
	test("generates at least 3 valid, playable voicings across all 15 roots and 13 chord qualities", () => {
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

					expect(presentPcs.has(rootPc)).toBe(true);
					expect(v.notes.find((n) => n.fret >= 0)?.pc).toBe(rootPc);

					if (intervals.length === 3) {
						for (const reqPc of allowedPcs)
							expect(presentPcs.has(reqPc)).toBe(true);
					} else {
						expect(presentPcs.has(mod12(rootPc + intervals[1]))).toBe(true);
						expect(presentPcs.has(mod12(rootPc + intervals[3]))).toBe(true);
						if (kind === "m7♭5" || kind === "dim7")
							expect(presentPcs.has(mod12(rootPc + 6))).toBe(true);
					}

					const fretted = v.frets.filter((f) => f > 0);
					if (fretted.length > 0) {
						expect(
							Math.max(...fretted) - Math.min(...fretted),
						).toBeLessThanOrEqual(4);
					}
				}
			}
		}
	});

	test("C major includes Open C, A-shape (fret 3), G-shape (fret 5), E-shape (fret 8), and D-shape (fret 10)", () => {
		const cMaj = getGuitarVoicings("C", "major", ["C", "E", "G"], false);
		expect(cMaj[0].name).toBe("Open C");
		expect(cMaj[0].frets).toEqual([-1, 3, 2, 0, 1, 0]);
		expect(
			cMaj.some((v) => v.name === "A-Shape Barre" && v.baseFret === 3),
		).toBe(true);
		expect(
			cMaj.some((v) => v.name === "E-Shape Barre" && v.baseFret === 8),
		).toBe(true);
		expect(
			cMaj.some((v) => v.name === "D-Shape Upper" && v.baseFret === 10),
		).toBe(true);
	});

	test("buildChordVariation spells aug, dim7, add9, madd9, sus4, sus2 and produces matching open shapes", () => {
		const cAug = buildChordVariation("C", "aug", false);
		expect(cAug.symbol).toBe("Caug");
		expect(cAug.notes).toEqual(["C", "E", "G♯"]);
		expect(cAug.midi).toEqual([60, 64, 68]);
		expect(getGuitarVoicings("C", "aug", cAug.notes, false)[0].name).toBe(
			"Open Caug",
		);

		const cDim7 = buildChordVariation("C", "dim7", false);
		expect(cDim7.symbol).toBe("Cdim7");
		expect(cDim7.notes).toEqual(["C", "E♭", "G♭", "A"]);
		expect(cDim7.quality).toBe("diminished");

		const cAdd9 = buildChordVariation("C", "add9", false);
		expect(cAdd9.symbol).toBe("Cadd9");
		expect(cAdd9.notes).toEqual(["C", "E", "G", "D"]);
		expect(cAdd9.midi).toEqual([60, 64, 67, 74]);
		const cAdd9Voicings = getGuitarVoicings("C", "add9", cAdd9.notes, false);
		expect(cAdd9Voicings[0].name).toBe("Open Cadd9");
		expect(cAdd9Voicings[0].frets).toEqual([-1, 3, 2, 0, 3, 0]);

		const eMadd9 = buildChordVariation("E", "madd9", false);
		expect(eMadd9.symbol).toBe("Em(add9)");
		expect(eMadd9.notes).toEqual(["E", "G", "B", "F♯"]);
		expect(eMadd9.quality).toBe("minor");
		expect(getGuitarVoicings("E", "madd9", eMadd9.notes, false)[0].name).toBe(
			"Open Em(add9)",
		);

		const dSus4 = buildChordVariation("D", "sus4", false);
		expect(dSus4.notes).toEqual(["D", "G", "A"]);
		expect(getGuitarVoicings("D", "sus4", dSus4.notes, false)[0].name).toBe(
			"Open Dsus4",
		);

		const dSus2 = buildChordVariation("D", "sus2", false);
		expect(dSus2.notes).toEqual(["D", "E", "A"]);
		expect(getGuitarVoicings("D", "sus2", dSus2.notes, false)[0].name).toBe(
			"Open Dsus2",
		);
	});

	test("buildGuitarScalePassGuide derives Major/Minor pentatonics, CAGED pockets, and playable chromatic passing phrases", () => {
		const cMaj = analyzeKey(0, "major");
		const cVoicings = getGuitarVoicings("C", "major", ["C", "E", "G"], false);
		const cGuide = buildGuitarScalePassGuide({
			keyRootNote: "C",
			keyMode: "major",
			scaleNotes: cMaj.scaleNotes,
			chordRootNote: "C",
			chordQuality: "major",
			chordKind: "major",
			chordNotes: ["C", "E", "G"],
			selectedVoicing: cVoicings[0],
			scope: "auto",
			overlayMode: "pentatonic",
			preferFlats: false,
		});

		expect(cGuide.pentatonicName).toBe("C Major Pentatonic");
		expect(cGuide.relativeTwinName).toBe("A Minor Pentatonic");
		expect(cGuide.pentatonicNotes).toEqual(["C", "D", "E", "G", "A"]);
		expect(cGuide.pentatonicMidi).toEqual([48, 50, 52, 55, 57, 60]);
		expect(cGuide.hasDistinctChordPentatonic).toBe(false);
		expect(cGuide.cagedBoxTip).toContain("0–3");
		expect(cGuide.passingPhrases).toHaveLength(3);
		expect(cGuide.passingPhrases[0].notes).toEqual(["D", "D♯", "E"]);
		expect(cGuide.passingPhrases[0].midi).toEqual([50, 51, 52]);
		expect(cGuide.overlayPassingPcs.sort((a, b) => a - b)).toEqual([3, 6, 8]);

		// Diatonic Dm keeps Key Pentatonic in auto mode but offers Chord Pentatonic
		const dmGuide = buildGuitarScalePassGuide({
			keyRootNote: "C",
			keyMode: "major",
			scaleNotes: cMaj.scaleNotes,
			chordRootNote: "D",
			chordQuality: "minor",
			chordKind: "minor",
			chordNotes: ["D", "F", "A"],
			selectedVoicing: null,
			scope: "auto",
			overlayMode: "scale",
			preferFlats: false,
		});
		expect(dmGuide.activeScope).toBe("key");
		expect(dmGuide.hasDistinctChordPentatonic).toBe(true);
		expect(dmGuide.chordPentatonicName).toBe("D Minor Pentatonic");
		// In Scale mode, overlay passing notes are the 5 non-diatonic chromatic PCs
		expect(dmGuide.overlayPassingPcs.sort((a, b) => a - b)).toEqual([
			1, 3, 6, 8, 10,
		]);

		// Non-diatonic Cm variation auto-shifts pentatonic to C Minor Pentatonic
		const cmVar = buildChordVariation("C", "minor", true);
		const cmGuide = buildGuitarScalePassGuide({
			keyRootNote: "C",
			keyMode: "major",
			scaleNotes: cMaj.scaleNotes,
			chordRootNote: "C",
			chordQuality: "minor",
			chordKind: "minor",
			chordNotes: cmVar.notes,
			selectedVoicing: null,
			scope: "auto",
			overlayMode: "pentatonic",
			preferFlats: true,
		});
		expect(cmGuide.chordIsNonDiatonic).toBe(true);
		expect(cmGuide.activeScope).toBe("chord");
		expect(cmGuide.pentatonicName).toBe("C Minor Pentatonic");
		expect(cmGuide.pentatonicNotes).toEqual(["C", "E♭", "F", "G", "B♭"]);
		expect(cmGuide.passingPhrases[0].label).toBe("♭5 Blue Note");
		expect(cmGuide.passingPhrases[0].notes).toEqual(["F", "G♭", "G"]);

		// A Minor Box 1 at fret 5
		const aMin = analyzeKey(0, "minor");
		const amVoicings = getGuitarVoicings("A", "minor", ["A", "C", "E"], false);
		const amBarre5 = amVoicings.find((v) => v.baseFret === 5) ?? amVoicings[0];
		const aGuide = buildGuitarScalePassGuide({
			keyRootNote: "A",
			keyMode: "minor",
			scaleNotes: aMin.scaleNotes,
			chordRootNote: "A",
			chordQuality: "minor",
			chordKind: "minor",
			chordNotes: ["A", "C", "E"],
			selectedVoicing: amBarre5,
			scope: "auto",
			overlayMode: "pentatonic",
			preferFlats: false,
		});
		expect(aGuide.pentatonicName).toBe("A Minor Pentatonic");
		expect(aGuide.relativeTwinName).toBe("C Major Pentatonic");
		expect(aGuide.pentatonicNotes).toEqual(["A", "C", "D", "E", "G"]);
		expect(aGuide.cagedBoxTip).toContain("5–8");
	});

	test("getChromaticDegreeLabel and notesToGuitarMidi stay consistent across sharp and flat contexts", () => {
		expect(getChromaticDegreeLabel(0, 6, false)).toBe("♯4");
		expect(getChromaticDegreeLabel(0, 6, true)).toBe("♭5");
		expect(getChromaticDegreeLabel(9, 7, false)).toBe("♭7");
		expect(notesToGuitarMidi(["G", "G♯", "A"], false)).toEqual([55, 56, 57]);
	});
});
