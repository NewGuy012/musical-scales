import {
	ChordQuality,
	KeyAnalysis,
	KeyMode,
	ascendingNotesToMidi,
	mod12,
	noteOffset,
	noteToPitchClass,
} from "./circleOfFifths";
import { GuitarChordKind, buildChordVariation } from "./guitarFretboard";

export interface HarmonyChordSpec {
	id: string;
	symbol: string;
	romanLabel: string;
	root: string;
	quality: ChordQuality;
	guitarKind: GuitarChordKind;
	notes: string[];
	midi: number[];
	circleIndex: number;
	roleTag?: string;
	borrowedNotes: string[];
}

export interface ChromaticPassingPattern {
	id: string;
	title: string;
	formula: string;
	kindLabel: string;
	explanation: string;
	steps: HarmonyChordSpec[];
	passingStepIndex: number;
}

export interface DiminishedChordPattern {
	id: string;
	title: string;
	formula: string;
	kindLabel: string;
	explanation: string;
	steps: HarmonyChordSpec[];
	dimStepIndex: number;
}

export interface SecondaryDominantEntry {
	id: string;
	romanLabel: string;
	targetRoman: string;
	dominantChord: HarmonyChordSpec;
	targetChord: HarmonyChordSpec;
	resolutionSteps: HarmonyChordSpec[];
	leadingToneMove: string;
	circleMotionNote: string;
}

export interface TritoneSubPair {
	id: string;
	label: string;
	sharedTritoneNotes: [string, string];
	originalDominant: HarmonyChordSpec;
	tritoneSubChord: HarmonyChordSpec;
	originalProgression: HarmonyChordSpec[];
	subProgression: HarmonyChordSpec[];
	bassMotionComparison: string;
	tritoneMathNote: string;
}

export interface ColorHarmonyAnalysis {
	keyShortName: string;
	mode: KeyMode;
	chromaticPassing: {
		overview: string;
		patterns: ChromaticPassingPattern[];
	};
	diminishedHarmony: {
		overview: string;
		symmetryFamilyTitle: string;
		symmetryNote: string;
		symmetryFamilyChords: HarmonyChordSpec[];
		patterns: DiminishedChordPattern[];
	};
	secondaryDominants: {
		overview: string;
		items: SecondaryDominantEntry[];
	};
	tritoneSubstitutions: {
		overview: string;
		primary: TritoneSubPair;
		secondarySubs: TritoneSubPair[];
	};
}

const SHARP_ROOTS = [
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
] as const;

const FLAT_ROOTS = [
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
] as const;

const READABLE_ROOTS_SHARP = [
	"C",
	"C♯",
	"D",
	"E♭",
	"E",
	"F",
	"F♯",
	"G",
	"G♯",
	"A",
	"B♭",
	"B",
] as const;

function pcToCircleIndex(pc: number, quality: ChordQuality): number {
	const base = mod12(pc * 7);
	return quality === "minor" ? mod12(base - 3) : base;
}

/**
 * Picks a clean chord root without double-accidentals (or impractical B♯/E♯/F♭/C♭ roots
 * on chromatic substitutions so Piano/Guitar/Cello chord voicings stay easy to read).
 */
function cleanRoot(
	pc: number,
	bias: "sharp" | "flat" | "readable-sharp",
): string {
	const norm = mod12(pc);
	if (bias === "flat") return FLAT_ROOTS[norm];
	if (bias === "readable-sharp") return READABLE_ROOTS_SHARP[norm];
	return SHARP_ROOTS[norm];
}

function normalizePracticalChordRoot(
	note: string,
	bias: "sharp" | "flat",
): string {
	const offset = noteOffset(note);
	const pc = noteToPitchClass(note);
	if (
		Math.abs(offset) <= 1 &&
		note !== "B♯" &&
		note !== "E♯" &&
		note !== "F♭" &&
		note !== "C♭" &&
		note !== "A♯" &&
		note !== "D♯"
	) {
		return note;
	}
	return bias === "flat" ? FLAT_ROOTS[pc] : READABLE_ROOTS_SHARP[pc];
}

function makeChordSpec(params: {
	id: string;
	root: string;
	kind: GuitarChordKind;
	romanLabel: string;
	keyScalePcs: Set<number>;
	preferFlats?: boolean;
	roleTag?: string;
	notesOverride?: string[];
}): HarmonyChordSpec {
	const {
		id,
		root,
		kind,
		romanLabel,
		keyScalePcs,
		preferFlats = root.includes("♭"),
		roleTag,
		notesOverride,
	} = params;
	const built = buildChordVariation(root, kind, preferFlats);
	const notes = notesOverride ?? built.notes;
	const midi = notesOverride ? ascendingNotesToMidi(notesOverride) : built.midi;
	const borrowedNotes = notes.filter(
		(n) => !keyScalePcs.has(noteToPitchClass(n)),
	);

	return {
		id,
		symbol: built.symbol,
		romanLabel,
		root,
		quality: built.quality,
		guitarKind: kind,
		notes,
		midi,
		circleIndex: pcToCircleIndex(noteToPitchClass(root), built.quality),
		roleTag,
		borrowedNotes,
	};
}

function diatonicSeventhSpec(
	analysis: KeyAnalysis,
	degreeIdx: number,
	keyScalePcs: Set<number>,
	idPrefix: string,
): HarmonyChordSpec {
	const c = analysis.chords[degreeIdx];
	const kind: GuitarChordKind = c.seventhSymbol.endsWith("maj7")
		? "maj7"
		: c.seventhSymbol.endsWith("m7♭5")
			? "m7♭5"
			: c.seventhSymbol.endsWith("m7")
				? "m7"
				: "7";

	return {
		id: `${idPrefix}-${c.symbol}-${c.degree}`,
		symbol: c.seventhSymbol,
		romanLabel: c.seventhSymbol.startsWith(c.root)
			? c.roman + c.seventhSymbol.slice(c.root.length)
			: c.roman,
		root: c.root,
		quality: c.quality,
		guitarKind: kind,
		notes: [...c.seventhNotes],
		midi: [...c.seventhMidi],
		circleIndex: c.circleIndex,
		borrowedNotes: c.seventhNotes.filter(
			(n) => !keyScalePcs.has(noteToPitchClass(n)),
		),
	};
}

function describeTritoneTone(
	origNote: string,
	subNote: string | undefined,
): string {
	if (!subNote || subNote === origNote) return origNote;
	return `${origNote}/${subNote}`;
}

export function analyzeColorHarmony(
	analysis: KeyAnalysis,
): ColorHarmonyAnalysis {
	const tonicNote = analysis.scaleNotes[0] ?? analysis.root;
	const tonicPc = noteToPitchClass(tonicNote);
	const keyIsFlat = analysis.accidentalsCount < 0;
	const keyScalePcs = new Set(analysis.scaleNotes.map(noteToPitchClass));
	const isMajor = analysis.mode === "major";

	const tonicMaj7 = diatonicSeventhSpec(
		analysis,
		0,
		keyScalePcs,
		"color-tonic",
	);

	// --- 1. Chromatic Passing Chords ---
	const chromaticPassingPatterns: ChromaticPassingPattern[] = [];

	if (isMajor) {
		const ii7 = diatonicSeventhSpec(analysis, 1, keyScalePcs, "pass-ii");
		const iii7 = diatonicSeventhSpec(analysis, 2, keyScalePcs, "pass-iii");
		const ivMaj7 = diatonicSeventhSpec(analysis, 3, keyScalePcs, "pass-iv");
		const v7 = diatonicSeventhSpec(analysis, 4, keyScalePcs, "pass-v");

		const b3Root = cleanRoot(tonicPc + 3, "flat");
		const b3Pass = makeChordSpec({
			id: "pass-biiim7",
			root: b3Root,
			kind: "m7",
			romanLabel: "♭iiim7",
			keyScalePcs,
			preferFlats: true,
			roleTag: "Passing",
		});

		const s4Root = cleanRoot(tonicPc + 6, "readable-sharp");
		const s4Pass = makeChordSpec({
			id: "pass-sivm7b5",
			root: s4Root,
			kind: "m7♭5",
			romanLabel: "♯ivm7♭5",
			keyScalePcs,
			preferFlats: false,
			roleTag: "Passing",
		});

		const minorIvRoot = normalizePracticalChordRoot(
			analysis.chords[3].root,
			"flat",
		);
		const minorIvPass = makeChordSpec({
			id: "pass-ivm7",
			root: minorIvRoot,
			kind: "m7",
			romanLabel: "ivm7",
			keyScalePcs,
			preferFlats: true,
			roleTag: "Borrowed Minor",
		});

		chromaticPassingPatterns.push(
			{
				id: "maj-m7-slide",
				title: "Parallel m7 Half-Step Slide",
				formula: `${iii7.symbol} → ${b3Pass.symbol} → ${ii7.symbol} → ${tonicMaj7.symbol}`,
				kindLabel: "Chromatic Planing",
				explanation: `Slides the exact same m7 grip down 1 fret (${iii7.root} → ${b3Pass.root} → ${ii7.root}) to link iiim7 smoothly into iim7.`,
				steps: [iii7, b3Pass, ii7, tonicMaj7],
				passingStepIndex: 1,
			},
			{
				id: "maj-bass-climb",
				title: "Chromatic 4 → ♯4 → 5 Walkup",
				formula: `${ivMaj7.symbol} → ${s4Pass.symbol} → ${v7.symbol} → ${tonicMaj7.symbol}`,
				kindLabel: "Bass Walkup",
				explanation: `Raises the 4th degree by 1 semitone (${ivMaj7.root} → ${s4Pass.root} → ${v7.root}) for classic gospel, soul & jazz upward momentum into V7.`,
				steps: [ivMaj7, s4Pass, v7, tonicMaj7],
				passingStepIndex: 1,
			},
			{
				id: "maj-minor-plagal",
				title: "Chromatic Minor Plagal Line (6 → ♭6 → 5)",
				formula: `${ivMaj7.symbol} → ${minorIvPass.symbol} → ${tonicMaj7.symbol}`,
				kindLabel: "Inner Voice Line",
				explanation: `Flips IV to minor ivm7 before resolving home, pulling degree 6 chromatically down through ♭6 onto the 5th of ${tonicMaj7.symbol}.`,
				steps: [ivMaj7, minorIvPass, tonicMaj7],
				passingStepIndex: 1,
			},
		);
	} else {
		const iTriad: HarmonyChordSpec = {
			id: "pass-minor-i",
			symbol: analysis.chords[0].symbol,
			romanLabel: "i",
			root: analysis.chords[0].root,
			quality: "minor",
			guitarKind: "minor",
			notes: [...analysis.chords[0].triadNotes],
			midi: [...analysis.chords[0].triadMidi],
			circleIndex: analysis.chords[0].circleIndex,
			borrowedNotes: [],
		};
		const iv7 = diatonicSeventhSpec(analysis, 3, keyScalePcs, "min-pass-iv");
		const v7Min = diatonicSeventhSpec(analysis, 4, keyScalePcs, "min-pass-v");
		const harmonicV = analysis.harmonicMinorV
			? makeChordSpec({
					id: "min-pass-domV",
					root: normalizePracticalChordRoot(
						analysis.harmonicMinorV.root,
						keyIsFlat ? "flat" : "sharp",
					),
					kind: "7",
					romanLabel: "V7",
					keyScalePcs,
					preferFlats: keyIsFlat,
					roleTag: "Harmonic V7",
					notesOverride: [...analysis.harmonicMinorV.seventhNotes],
				})
			: v7Min;

		// Minor Line Cliché: i → ♭IIIaug (i(maj7) color) → i7 → vim7♭5
		const b3MajRoot = normalizePracticalChordRoot(
			analysis.chords[2].root,
			keyIsFlat ? "flat" : "sharp",
		);
		const lineClicheAug = makeChordSpec({
			id: "min-line-aug",
			root: b3MajRoot,
			kind: "aug",
			romanLabel: "♭IIIaug (maj7 line)",
			keyScalePcs,
			preferFlats: !keyIsFlat,
			roleTag: "Chromatic ♮7",
		});
		const viHalfDimRoot = cleanRoot(tonicPc + 9, "readable-sharp");
		const viHalfDim = makeChordSpec({
			id: "min-line-vim7b5",
			root: viHalfDimRoot,
			kind: "m7♭5",
			romanLabel: "♯vim7♭5",
			keyScalePcs,
			preferFlats: keyIsFlat,
			roleTag: "Dorian ♮6",
		});

		const flatVRoot = cleanRoot(tonicPc + 6, "flat");
		const flatVPass = makeChordSpec({
			id: "min-pass-bvm7",
			root: flatVRoot,
			kind: "m7",
			romanLabel: "♭vm7",
			keyScalePcs,
			preferFlats: true,
			roleTag: "Passing",
		});

		const s4Root = cleanRoot(tonicPc + 6, "readable-sharp");
		const s4Pass = makeChordSpec({
			id: "min-pass-sivm7b5",
			root: s4Root,
			kind: "m7♭5",
			romanLabel: "♯ivm7♭5",
			keyScalePcs,
			preferFlats: false,
			roleTag: "Passing",
		});

		chromaticPassingPatterns.push(
			{
				id: "min-line-cliche",
				title: "Minor Line Cliché (1 → 7 → ♭7 → 6)",
				formula: `${iTriad.symbol} → ${lineClicheAug.symbol} → ${tonicMaj7.symbol} → ${viHalfDim.symbol}`,
				kindLabel: "Inner Chromatic Line",
				explanation: `Keeps ${analysis.chords[2].root} & ${analysis.scaleNotes[4]} steady while a chromatic voice descends 1 → ♮7 → ♭7 → ♮6.`,
				steps: [iTriad, lineClicheAug, tonicMaj7, viHalfDim],
				passingStepIndex: 1,
			},
			{
				id: "min-m7-slide",
				title: "Parallel m7 Slide (vm7 → ♭vm7 → ivm7)",
				formula: `${v7Min.symbol} → ${flatVPass.symbol} → ${iv7.symbol} → ${tonicMaj7.symbol}`,
				kindLabel: "Chromatic Planing",
				explanation: `Glides down 1 semitone (${v7Min.root} → ${flatVPass.root} → ${iv7.root}) using one movable m7 shape.`,
				steps: [v7Min, flatVPass, iv7, tonicMaj7],
				passingStepIndex: 1,
			},
			{
				id: "min-bass-climb",
				title: "Chromatic Climb into V7 (4 → ♯4 → 5)",
				formula: `${iv7.symbol} → ${s4Pass.symbol} → ${harmonicV.symbol} → ${iTriad.symbol}`,
				kindLabel: "Bass Walkup",
				explanation: `Uses ${s4Pass.symbol} to bridge the 4th chromatically up to the dominant ${harmonicV.symbol}.`,
				steps: [iv7, s4Pass, harmonicV, iTriad],
				passingStepIndex: 1,
			},
		);
	}

	// --- 2. Diminished Chords (Symmetrical Dim7 & Passing Bridges) ---
	const dimAnchorPc = isMajor ? mod12(tonicPc + 1) : mod12(tonicPc + 11);
	const symmetryRoots = [0, 3, 6, 9].map((step) =>
		cleanRoot(dimAnchorPc + step, step % 2 === 1 ? "flat" : "readable-sharp"),
	);
	// In minor keys where dimAnchorPc + 0 is the raised leading tone (e.g., G♯ in A Minor),
	// keep exact sharp name for the leading tone when key prefers sharps/natural
	if (!isMajor) {
		symmetryRoots[0] = cleanRoot(dimAnchorPc, keyIsFlat ? "flat" : "sharp");
	} else {
		symmetryRoots[0] = cleanRoot(dimAnchorPc, "sharp");
	}

	const symmetryFamilyChords = symmetryRoots.map((root, idx) =>
		makeChordSpec({
			id: `dim-sym-${idx}-${root}`,
			root,
			kind: "dim7",
			romanLabel: idx === 0 ? (isMajor ? "♯i°7" : "vii°7") : `+${idx * 3}st`,
			keyScalePcs,
			preferFlats: idx > 0 && root.includes("♭"),
			roleTag: idx === 0 ? "Root Dim7" : `+${idx * 3} Frets`,
		}),
	);

	const dimPatterns: DiminishedChordPattern[] = [];
	if (isMajor) {
		const ii7 = diatonicSeventhSpec(analysis, 1, keyScalePcs, "dim-ii");
		const ivMaj7 = diatonicSeventhSpec(analysis, 3, keyScalePcs, "dim-iv");
		const v7 = diatonicSeventhSpec(analysis, 4, keyScalePcs, "dim-v");

		const sharp1Dim = symmetryFamilyChords[0];
		const sharp4DimRoot = cleanRoot(tonicPc + 6, "sharp");
		const sharp4Dim = makeChordSpec({
			id: `dim-s4-${sharp4DimRoot}`,
			root: sharp4DimRoot,
			kind: "dim7",
			romanLabel: "♯iv°7",
			keyScalePcs,
			preferFlats: false,
			roleTag: "Passing Dim7",
		});
		const viiDimRoot = normalizePracticalChordRoot(
			analysis.chords[6].root,
			keyIsFlat ? "flat" : "sharp",
		);
		const viiDim7 = makeChordSpec({
			id: `dim-vii-${viiDimRoot}`,
			root: viiDimRoot,
			kind: "dim7",
			romanLabel: "vii°7 (rootless V7♭9)",
			keyScalePcs,
			preferFlats: true,
			roleTag: "Dominant Proxy",
		});

		dimPatterns.push(
			{
				id: "dim-maj-s1",
				title: "♯i°7 Passing (I → ♯i°7 → iim7)",
				formula: `${tonicMaj7.symbol} → ${sharp1Dim.symbol} → ${ii7.symbol}`,
				kindLabel: "Ascending Bass",
				explanation: `Connects ${tonicMaj7.root} up by half step through ${sharp1Dim.symbol} into ${ii7.symbol}. Built with 3-semitone spacing so all 4 notes push inward.`,
				steps: [tonicMaj7, sharp1Dim, ii7],
				dimStepIndex: 1,
			},
			{
				id: "dim-maj-s4",
				title: "♯iv°7 Bridge (IV → ♯iv°7 → V7)",
				formula: `${ivMaj7.symbol} → ${sharp4Dim.symbol} → ${v7.symbol} → ${tonicMaj7.symbol}`,
				kindLabel: "Gospel / Jazz Walk",
				explanation: `Chromatic ${ivMaj7.root} → ${sharp4Dim.root} → ${v7.root} bass walk into the dominant — one of the signature turnaround engines in Broadway & acoustic standards.`,
				steps: [ivMaj7, sharp4Dim, v7, tonicMaj7],
				dimStepIndex: 1,
			},
			{
				id: "dim-maj-vii",
				title: "vii°7 as Rootless V7♭9",
				formula: `${v7.symbol} → ${viiDim7.symbol} → ${tonicMaj7.symbol}`,
				kindLabel: "Dominant Substitute",
				explanation: `${viiDim7.symbol} equals ${v7.symbol}♭9 without its ${v7.root} bass — adding dramatic dark tension that resolves a half step into ${tonicMaj7.symbol}.`,
				steps: [v7, viiDim7, tonicMaj7],
				dimStepIndex: 1,
			},
		);
	} else {
		const iMin: HarmonyChordSpec = {
			id: "dim-minor-i",
			symbol: analysis.chords[0].symbol,
			romanLabel: "i",
			root: analysis.chords[0].root,
			quality: "minor",
			guitarKind: "minor",
			notes: [...analysis.chords[0].triadNotes],
			midi: [...analysis.chords[0].triadMidi],
			circleIndex: analysis.chords[0].circleIndex,
			borrowedNotes: [],
		};
		const iiiMaj7 = diatonicSeventhSpec(analysis, 2, keyScalePcs, "dim-iii");
		const iv7 = diatonicSeventhSpec(analysis, 3, keyScalePcs, "dim-iv");
		const harmonicV = analysis.harmonicMinorV
			? makeChordSpec({
					id: "dim-harmV",
					root: normalizePracticalChordRoot(
						analysis.harmonicMinorV.root,
						keyIsFlat ? "flat" : "sharp",
					),
					kind: "7",
					romanLabel: "V7",
					keyScalePcs,
					preferFlats: keyIsFlat,
					notesOverride: [...analysis.harmonicMinorV.seventhNotes],
				})
			: diatonicSeventhSpec(analysis, 4, keyScalePcs, "dim-v");

		const viiDim7 = symmetryFamilyChords[0];
		const sharp3DimRoot = cleanRoot(tonicPc + 4, "sharp");
		const sharp3Dim = makeChordSpec({
			id: `dim-s3-${sharp3DimRoot}`,
			root: sharp3DimRoot,
			kind: "dim7",
			romanLabel: "♯iii°7",
			keyScalePcs,
			preferFlats: false,
			roleTag: "Passing Dim7",
		});
		const sharp4DimRoot = cleanRoot(tonicPc + 6, "sharp");
		const sharp4Dim = makeChordSpec({
			id: `dim-s4-${sharp4DimRoot}`,
			root: sharp4DimRoot,
			kind: "dim7",
			romanLabel: "♯iv°7",
			keyScalePcs,
			preferFlats: false,
			roleTag: "Passing Dim7",
		});

		dimPatterns.push(
			{
				id: "dim-min-vii",
				title: "vii°7 Leading Tension (Rootless V7♭9)",
				formula: `${iv7.symbol} → ${viiDim7.symbol} → ${iMin.symbol}`,
				kindLabel: "Minor Cadence",
				explanation: `${viiDim7.symbol} contains the top 4 tension notes of ${harmonicV.symbol}♭9 (${viiDim7.notes.join("·")}) — resolving a half step up to ${iMin.symbol}.`,
				steps: [iv7, viiDim7, iMin],
				dimStepIndex: 1,
			},
			{
				id: "dim-min-s4",
				title: "♯iv°7 Approach (iv7 → ♯iv°7 → V7)",
				formula: `${iv7.symbol} → ${sharp4Dim.symbol} → ${harmonicV.symbol} → ${iMin.symbol}`,
				kindLabel: "Ascending Bass",
				explanation: `Climbs chromatically from ${iv7.root} through ${sharp4Dim.symbol} straight onto the dominant ${harmonicV.symbol}.`,
				steps: [iv7, sharp4Dim, harmonicV, iMin],
				dimStepIndex: 1,
			},
			{
				id: "dim-min-s3",
				title: "III → ♯iii°7 → iv7 Relative Bridge",
				formula: `${iiiMaj7.symbol} → ${sharp3Dim.symbol} → ${iv7.symbol}`,
				kindLabel: "Passing Dim7",
				explanation: `Walks smoothly from the relative major (${iiiMaj7.symbol}) through ${sharp3Dim.symbol} into ${iv7.symbol}.`,
				steps: [iiiMaj7, sharp3Dim, iv7],
				dimStepIndex: 1,
			},
		);
	}

	// --- 3. Secondary Dominants ---
	const secondarySpecList: {
		targetDegIdx: number;
		targetRoman: string;
		romanLabel: string;
		resolveHomeAfter?: boolean;
	}[] = isMajor
		? [
				{
					targetDegIdx: 4,
					targetRoman: "V",
					romanLabel: "V7/V",
					resolveHomeAfter: true,
				},
				{ targetDegIdx: 5, targetRoman: "vi", romanLabel: "V7/vi" },
				{ targetDegIdx: 3, targetRoman: "IV", romanLabel: "V7/IV" },
				{
					targetDegIdx: 1,
					targetRoman: "ii",
					romanLabel: "V7/ii",
					resolveHomeAfter: true,
				},
				{ targetDegIdx: 2, targetRoman: "iii", romanLabel: "V7/iii" },
			]
		: [
				{
					targetDegIdx: 3,
					targetRoman: "iv",
					romanLabel: "V7/iv",
					resolveHomeAfter: true,
				},
				{
					targetDegIdx: 4,
					targetRoman: "v",
					romanLabel: "V7/v",
					resolveHomeAfter: true,
				},
				{ targetDegIdx: 5, targetRoman: "VI", romanLabel: "V7/VI" },
				{ targetDegIdx: 6, targetRoman: "VII", romanLabel: "V7/VII" },
				{ targetDegIdx: 2, targetRoman: "III", romanLabel: "V7/III" },
			];

	const secondaryItems: SecondaryDominantEntry[] = secondarySpecList.map(
		(entry) => {
			const targetChordSpec = diatonicSeventhSpec(
				analysis,
				entry.targetDegIdx,
				keyScalePcs,
				`sec-target-${entry.targetRoman}`,
			);
			const targetPc = noteToPitchClass(targetChordSpec.root);
			const domPc = mod12(targetPc + 7);
			const domRoot = cleanRoot(domPc, keyIsFlat ? "flat" : "readable-sharp");
			const dominantChord = makeChordSpec({
				id: `sec-dom-${entry.targetRoman}-${domRoot}`,
				root: domRoot,
				kind: "7",
				romanLabel: entry.romanLabel,
				keyScalePcs,
				preferFlats: keyIsFlat || domRoot.includes("♭"),
				roleTag: entry.romanLabel,
			});

			const vChordForChain =
				!isMajor && analysis.harmonicMinorV
					? makeChordSpec({
							id: `sec-chain-v-${entry.targetRoman}`,
							root: normalizePracticalChordRoot(
								analysis.harmonicMinorV.root,
								keyIsFlat ? "flat" : "sharp",
							),
							kind: "7",
							romanLabel: "V7",
							keyScalePcs,
							preferFlats: keyIsFlat,
							notesOverride: [...analysis.harmonicMinorV.seventhNotes],
						})
					: diatonicSeventhSpec(analysis, 4, keyScalePcs, "sec-chain-v");

			let resolutionSteps: HarmonyChordSpec[];
			if (entry.resolveHomeAfter && entry.targetDegIdx === 4) {
				resolutionSteps = [dominantChord, targetChordSpec, tonicMaj7];
			} else if (
				entry.resolveHomeAfter &&
				(entry.targetDegIdx === 1 || entry.targetDegIdx === 3)
			) {
				resolutionSteps = [
					dominantChord,
					targetChordSpec,
					vChordForChain,
					tonicMaj7,
				];
			} else {
				resolutionSteps = [dominantChord, targetChordSpec];
			}

			const leadingNote = dominantChord.notes[1] ?? "";
			const isLeadingBorrowed = !keyScalePcs.has(noteToPitchClass(leadingNote));
			const thirdQualDesc = isLeadingBorrowed
				? `${leadingNote} (raised 3rd of ${dominantChord.symbol})`
				: `${leadingNote} (3rd of ${dominantChord.symbol}) & ${dominantChord.notes[3]} (♭7)`;

			return {
				id: `secdom-${entry.targetRoman}`,
				romanLabel: entry.romanLabel,
				targetRoman: entry.targetRoman,
				dominantChord,
				targetChord: targetChordSpec,
				resolutionSteps,
				leadingToneMove: `${thirdQualDesc} pulls chromatically into ${targetChordSpec.symbol}.`,
				circleMotionNote:
					domPc === mod12(tonicPc + 7)
						? `Turns ${tonicNote} from stable home into Dominant tension pushing clockwise by 4th to ${targetChordSpec.root}.`
						: `Steps up to ${dominantChord.root} on the Circle, then falls a fifth counter-clockwise into ${targetChordSpec.root}.`,
			};
		},
	);

	// --- 4. Tritone Substitutions ---
	const buildTritonePair = (params: {
		id: string;
		label: string;
		prepChord: HarmonyChordSpec;
		origDom: HarmonyChordSpec;
		targetChord: HarmonyChordSpec;
		subRoman: string;
	}): TritoneSubPair => {
		const { id, label, prepChord, origDom, targetChord, subRoman } = params;
		const origPc = noteToPitchClass(origDom.root);
		const subPc = mod12(origPc + 6);
		const subRoot = cleanRoot(subPc, "flat");
		const tritoneSubChord = makeChordSpec({
			id: `tritone-${id}-${subRoot}`,
			root: subRoot,
			kind: "7",
			romanLabel: subRoman,
			keyScalePcs,
			preferFlats: true,
			roleTag: "Tritone Sub",
		});

		const orig3rd = origDom.notes[1] ?? "";
		const orig7th = origDom.notes[3] ?? "";
		const sub3rd = tritoneSubChord.notes[1] ?? "";
		const sub7th = tritoneSubChord.notes[3] ?? "";

		const sharedTritoneNotes: [string, string] = [
			describeTritoneTone(orig3rd, sub7th),
			describeTritoneTone(orig7th, sub3rd),
		];

		return {
			id,
			label,
			sharedTritoneNotes,
			originalDominant: origDom,
			tritoneSubChord,
			originalProgression: [prepChord, origDom, targetChord],
			subProgression: [prepChord, tritoneSubChord, targetChord],
			bassMotionComparison: `Replaces ${origDom.root} → ${targetChord.root} fifth leap with chromatic ${prepChord.root} → ${subRoot} → ${targetChord.root} bass descent.`,
			tritoneMathNote: `${origDom.symbol} (${orig3rd} & ${orig7th}) and ${tritoneSubChord.symbol} (${sub7th} & ${sub3rd}) share the exact same tritone — placed 180° opposite across the Circle of Fifths.`,
		};
	};

	const prepChordPrimary = isMajor
		? diatonicSeventhSpec(analysis, 1, keyScalePcs, "tri-ii")
		: diatonicSeventhSpec(analysis, 1, keyScalePcs, "tri-min-ii");

	const origPrimaryV7 =
		!isMajor && analysis.harmonicMinorV
			? makeChordSpec({
					id: "tri-orig-harmV",
					root: normalizePracticalChordRoot(
						analysis.harmonicMinorV.root,
						keyIsFlat ? "flat" : "sharp",
					),
					kind: "7",
					romanLabel: "V7",
					keyScalePcs,
					preferFlats: keyIsFlat,
					notesOverride: [...analysis.harmonicMinorV.seventhNotes],
				})
			: diatonicSeventhSpec(analysis, 4, keyScalePcs, "tri-orig-v");

	const primaryTritoneSub = buildTritonePair({
		id: "primary-bII7",
		label: `Primary ♭II7 → ${isMajor ? "Imaj7" : "im7"}`,
		prepChord: prepChordPrimary,
		origDom: origPrimaryV7,
		targetChord: tonicMaj7,
		subRoman: "♭II7 (subV)",
	});

	const secondarySubs: TritoneSubPair[] = [];
	if (isMajor) {
		const secV = secondaryItems.find((s) => s.targetRoman === "V");
		const secII = secondaryItems.find((s) => s.targetRoman === "ii");
		const secVI = secondaryItems.find((s) => s.targetRoman === "vi");
		if (secV) {
			secondarySubs.push(
				buildTritonePair({
					id: "sub-of-v",
					label: "subV7/V (♭VI7 → V7)",
					prepChord: diatonicSeventhSpec(analysis, 3, keyScalePcs, "tri-iv"),
					origDom: secV.dominantChord,
					targetChord: secV.targetChord,
					subRoman: "♭VI7 (subV/V)",
				}),
			);
		}
		if (secII) {
			secondarySubs.push(
				buildTritonePair({
					id: "sub-of-ii",
					label: "subV7/ii (♭III7 → iim7)",
					prepChord: diatonicSeventhSpec(analysis, 2, keyScalePcs, "tri-iii"),
					origDom: secII.dominantChord,
					targetChord: secII.targetChord,
					subRoman: "♭III7 (subV/ii)",
				}),
			);
		}
		if (secVI) {
			secondarySubs.push(
				buildTritonePair({
					id: "sub-of-vi",
					label: "subV7/vi (♭VII7 → vim7)",
					prepChord: tonicMaj7,
					origDom: secVI.dominantChord,
					targetChord: secVI.targetChord,
					subRoman: "♭VII7 (subV/vi)",
				}),
			);
		}
	} else {
		const secIV = secondaryItems.find((s) => s.targetRoman === "iv");
		const secV = secondaryItems.find((s) => s.targetRoman === "v");
		if (secIV) {
			secondarySubs.push(
				buildTritonePair({
					id: "min-sub-of-iv",
					label: "subV7/iv (♭V7 → ivm7)",
					prepChord: diatonicSeventhSpec(
						analysis,
						2,
						keyScalePcs,
						"tri-min-iii",
					),
					origDom: secIV.dominantChord,
					targetChord: secIV.targetChord,
					subRoman: "♭V7 (subV/iv)",
				}),
			);
		}
		if (secV) {
			secondarySubs.push(
				buildTritonePair({
					id: "min-sub-of-v",
					label: "subV7/v (♭VI7 → V7)",
					prepChord: diatonicSeventhSpec(
						analysis,
						3,
						keyScalePcs,
						"tri-min-iv",
					),
					origDom: secV.dominantChord,
					targetChord: origPrimaryV7,
					subRoman: "♭VI7 (subV/v)",
				}),
			);
		}
	}

	return {
		keyShortName: analysis.shortName,
		mode: analysis.mode,
		chromaticPassing: {
			overview:
				"Chromatic passing chords insert non-diatonic shapes one semitone (1 fret) away from stable chords so the bass or inner voices glide smoothly instead of jumping.",
			patterns: chromaticPassingPatterns,
		},
		diminishedHarmony: {
			overview:
				"Symmetrical dim7 chords (stacked minor 3rds: 0·3·6·9) create unstable pulling tension — either walking chromatically upward by half step or acting as a rootless V7♭9 dominant.",
			symmetryFamilyTitle: `3-Semitone Symmetry Family (${symmetryRoots.map((r) => `${r}°7`).join(" = ")})`,
			symmetryNote:
				"All four diminished 7th chords below use the exact same 4 pitch classes — sliding one guitar grip up 3 frets simply puts a different note on bottom.",
			symmetryFamilyChords,
			patterns: dimPatterns,
		},
		secondaryDominants: {
			overview:
				"Turn any diatonic chord into a temporary target by placing a Dominant 7th one fifth clockwise above it on the Circle of Fifths — introducing a chromatic leading tone that pulls inward.",
			items: secondaryItems,
		},
		tritoneSubstitutions: {
			overview:
				"Replace any Dominant 7th with the Dominant 7th directly opposite on the Circle of Fifths (+6 semitones / a tritone). Because both chords share the same 3rd & ♭7 tension pair, the fifth leap becomes a silky chromatic half-step resolution.",
			primary: primaryTritoneSub,
			secondarySubs,
		},
	};
}
