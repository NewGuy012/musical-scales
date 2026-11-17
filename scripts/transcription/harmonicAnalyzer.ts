import {
	CIRCLE_SLOTS,
	type ChordQuality,
	FLAT_CHROMATIC,
	type KeyMode,
	SHARP_CHROMATIC,
	analyzeKey,
	mod12,
	noteToPitchClass,
} from "../../src/react-app/theory/circleOfFifths";
import {
	CHORD_VARIATION_SPECS,
	type GuitarChordKind,
	buildChordVariation,
} from "../../src/react-app/theory/guitarFretboard";

export interface WeightedPitchEvent {
	midi: number;
	offsetTicks: number;
	durationTicks: number;
}

export interface InferredHarmony {
	chordSymbol: string;
	roman: string;
	quality: ChordQuality;
	guitarKind: GuitarChordKind;
	chordNotes: string[];
	circleDegree: number;
	circleSlotIndex: number;
}

// Krumhansl-Schmuckler major & minor key-profile weights (C = index 0)
const MAJOR_PROFILE = [
	6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
] as const;
const MINOR_PROFILE = [
	6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
] as const;

const CHORD_TEMPLATES: readonly {
	kind: GuitarChordKind;
	intervals: readonly number[];
	requiredPcs: readonly number[];
	complexityPenalty: number;
}[] = [
	{
		kind: "major",
		intervals: [0, 4, 7],
		requiredPcs: [0, 4],
		complexityPenalty: 0,
	},
	{
		kind: "minor",
		intervals: [0, 3, 7],
		requiredPcs: [0, 3],
		complexityPenalty: 0,
	},
	{
		kind: "7",
		intervals: [0, 4, 7, 10],
		requiredPcs: [0, 4, 10],
		complexityPenalty: 0.14,
	},
	{
		kind: "maj7",
		intervals: [0, 4, 7, 11],
		requiredPcs: [0, 4, 11],
		complexityPenalty: 0.2,
	},
	{
		kind: "m7",
		intervals: [0, 3, 7, 10],
		requiredPcs: [0, 3, 10],
		complexityPenalty: 0.16,
	},
	{
		kind: "diminished",
		intervals: [0, 3, 6],
		requiredPcs: [0, 3, 6],
		complexityPenalty: 0.15,
	},
	{
		kind: "dim7",
		intervals: [0, 3, 6, 9],
		requiredPcs: [0, 3, 6, 9],
		complexityPenalty: 0.28,
	},
	{
		kind: "m7♭5",
		intervals: [0, 3, 6, 10],
		requiredPcs: [0, 3, 6, 10],
		complexityPenalty: 0.25,
	},
	{
		kind: "add9",
		intervals: [0, 4, 7, 2],
		requiredPcs: [0, 4, 2],
		complexityPenalty: 0.25,
	},
	{
		kind: "sus4",
		intervals: [0, 5, 7],
		requiredPcs: [0, 5, 7],
		complexityPenalty: 0.24,
	},
	{
		kind: "sus2",
		intervals: [0, 2, 7],
		requiredPcs: [0, 2, 7],
		complexityPenalty: 0.26,
	},
	{
		kind: "aug",
		intervals: [0, 4, 8],
		requiredPcs: [0, 4, 8],
		complexityPenalty: 0.3,
	},
];

function pearsonCorrelation(
	hist: readonly number[],
	profile: readonly number[],
	shift: number,
): number {
	let sumX = 0;
	let sumY = 0;
	for (let i = 0; i < 12; i++) {
		sumX += hist[(i + shift) % 12];
		sumY += profile[i];
	}
	const meanX = sumX / 12;
	const meanY = sumY / 12;
	let num = 0;
	let denX = 0;
	let denY = 0;
	for (let i = 0; i < 12; i++) {
		const dx = hist[(i + shift) % 12] - meanX;
		const dy = profile[i] - meanY;
		num += dx * dy;
		denX += dx * dx;
		denY += dy * dy;
	}
	const den = Math.sqrt(denX * denY);
	return den > 1e-9 ? num / den : 0;
}

export function resolveKeySignatureFromRootPc(
	rootPc: number,
	mode: KeyMode,
	preferFlats = false,
): { keySlot: number; keyMode: KeyMode; keyLabel: string } {
	const normPc = mod12(rootPc);
	for (const slot of CIRCLE_SLOTS) {
		const variants = [
			slot.primary,
			...(slot.enharmonic ? [slot.enharmonic] : []),
		];
		const chosenVariant =
			preferFlats && slot.enharmonic?.side === "flat"
				? slot.enharmonic
				: slot.primary;
		const root =
			mode === "major" ? chosenVariant.majorRoot : chosenVariant.minorRoot;
		if (noteToPitchClass(root) === normPc) {
			return {
				keySlot: slot.index,
				keyMode: mode,
				keyLabel: `${root} ${mode === "major" ? "Major" : "Minor"}`,
			};
		}
		for (const v of variants) {
			const vRoot = mode === "major" ? v.majorRoot : v.minorRoot;
			if (noteToPitchClass(vRoot) === normPc) {
				return {
					keySlot: slot.index,
					keyMode: mode,
					keyLabel: `${vRoot} ${mode === "major" ? "Major" : "Minor"}`,
				};
			}
		}
	}
	return {
		keySlot: 0,
		keyMode: mode,
		keyLabel: mode === "major" ? "C Major" : "A Minor",
	};
}

export function detectKeyFromEvents(
	events: readonly WeightedPitchEvent[],
	preferFlats = false,
): { keySlot: number; keyMode: KeyMode; keyLabel: string } {
	const hist = new Array<number>(12).fill(0);
	for (const ev of events) {
		const weight = Math.max(1, ev.durationTicks) * (ev.midi < 55 ? 1.25 : 1);
		hist[mod12(ev.midi)] += weight;
	}
	const total = hist.reduce((s, v) => s + v, 0);
	if (total <= 0) {
		return { keySlot: 0, keyMode: "major", keyLabel: "C Major" };
	}

	let bestScore = -Infinity;
	let bestPc = 0;
	let bestMode: KeyMode = "major";

	for (let pc = 0; pc < 12; pc++) {
		const maj = pearsonCorrelation(hist, MAJOR_PROFILE, pc);
		if (maj > bestScore) {
			bestScore = maj;
			bestPc = pc;
			bestMode = "major";
		}
		const min = pearsonCorrelation(hist, MINOR_PROFILE, pc);
		if (min > bestScore) {
			bestScore = min;
			bestPc = pc;
			bestMode = "minor";
		}
	}

	return resolveKeySignatureFromRootPc(bestPc, bestMode, preferFlats);
}

function findCircleSlotForRootPc(
	rootPc: number,
	quality: ChordQuality,
): number {
	const norm = mod12(rootPc);
	for (const slot of CIRCLE_SLOTS) {
		const root =
			quality === "minor" ? slot.primary.minorRoot : slot.primary.majorRoot;
		if (noteToPitchClass(root) === norm) {
			return slot.index;
		}
	}
	return 0;
}

const MAJOR_ROMAN_BY_OFFSET: Record<number, string> = {
	0: "I",
	1: "♭II",
	2: "ii",
	3: "♭III",
	4: "iii",
	5: "IV",
	6: "♯iv°",
	7: "V",
	8: "♭VI",
	9: "vi",
	10: "♭VII",
	11: "vii°",
};

const MINOR_ROMAN_BY_OFFSET: Record<number, string> = {
	0: "i",
	1: "♭II",
	2: "ii°",
	3: "III",
	4: "♯iii",
	5: "iv",
	6: "♯iv°",
	7: "v",
	8: "VI",
	9: "♯vi",
	10: "VII",
	11: "vii°",
};

function inferRomanNumeral(
	tonicPc: number,
	keyMode: KeyMode,
	rootPc: number,
	quality: ChordQuality,
	kind: GuitarChordKind,
): { roman: string; circleDegree: number } {
	const offset = mod12(rootPc - tonicPc);
	const degreeMap: Record<number, number> = {
		0: 1,
		1: 2,
		2: 2,
		3: 3,
		4: 3,
		5: 4,
		6: 4,
		7: 5,
		8: 6,
		9: 6,
		10: 7,
		11: 7,
	};
	const circleDegree = degreeMap[offset] ?? 1;
	const base =
		keyMode === "major"
			? (MAJOR_ROMAN_BY_OFFSET[offset] ?? "I")
			: (MINOR_ROMAN_BY_OFFSET[offset] ?? "i");

	let roman = base;
	if (quality === "major" && roman === roman.toLowerCase() && offset === 2) {
		roman = "V/V";
	} else if (
		quality === "major" &&
		roman === roman.toLowerCase() &&
		offset === 9 &&
		keyMode === "major"
	) {
		roman = "V/ii";
	} else if (
		quality === "major" &&
		roman === roman.toLowerCase() &&
		offset === 4 &&
		keyMode === "major"
	) {
		roman = "V/vi";
	} else if (keyMode === "minor" && offset === 7 && quality === "major") {
		roman = "V";
	} else if (quality === "minor") {
		roman = roman.toLowerCase();
	}

	const spec = CHORD_VARIATION_SPECS.find((s) => s.kind === kind);
	if (
		spec &&
		(kind === "7" || kind === "maj7" || kind === "m7" || kind === "dim7") &&
		!roman.includes("°")
	) {
		if (kind === "7" && !roman.includes("/")) roman = `${roman}7`;
		else if (kind === "maj7") roman = `${roman}maj7`;
		else if (kind === "m7") roman = `${roman}7`;
		else if (kind === "dim7") roman = `${roman}°7`;
	}
	return { roman, circleDegree };
}

export function inferHarmonyForWindow(
	events: readonly WeightedPitchEvent[],
	keySlot: number,
	keyMode: KeyMode,
	windowStartTicks: number,
	ticksPerQuarter: number,
): InferredHarmony {
	const keyAnalysis = analyzeKey(keySlot, keyMode);
	const tonicPc = noteToPitchClass(keyAnalysis.root);
	const preferFlats = keyAnalysis.accidentalsCount < 0;

	if (events.length === 0) {
		const tonic = keyAnalysis.chords[0];
		return {
			chordSymbol: tonic.symbol,
			roman: tonic.roman,
			quality: tonic.quality,
			guitarKind: tonic.quality,
			chordNotes: [...tonic.triadNotes],
			circleDegree: 1,
			circleSlotIndex: tonic.circleIndex,
		};
	}

	const pcWeights = new Array<number>(12).fill(0);
	let lowestMidi = Infinity;
	let lowestPc = 0;

	for (const ev of events) {
		const relTicks = Math.max(0, ev.offsetTicks - windowStartTicks);
		const beatWeight = relTicks % ticksPerQuarter === 0 ? 1.35 : 1.0;
		const downbeatWeight = relTicks === 0 ? 1.5 : 1.0;
		const durWeight = Math.max(0.25, ev.durationTicks / ticksPerQuarter);
		pcWeights[mod12(ev.midi)] += durWeight * beatWeight * downbeatWeight;
		if (ev.midi < lowestMidi) {
			lowestMidi = ev.midi;
			lowestPc = mod12(ev.midi);
		}
	}

	const totalWeight = pcWeights.reduce((a, b) => a + b, 0) || 1;
	const normalized = pcWeights.map((w) => w / totalWeight);

	const scalePcSet = new Set(keyAnalysis.scaleNotes.map(noteToPitchClass));
	const scaleSpellMap = new Map<number, string>();
	keyAnalysis.scaleNotes.forEach((n) =>
		scaleSpellMap.set(noteToPitchClass(n), n),
	);
	const fallbackPalette = preferFlats ? FLAT_CHROMATIC : SHARP_CHROMATIC;

	let bestScore = -Infinity;
	let bestRootPc = lowestPc;
	let bestKind: GuitarChordKind = "major";

	for (let rootPc = 0; rootPc < 12; rootPc++) {
		for (const tmpl of CHORD_TEMPLATES) {
			const toneSet = new Set(tmpl.intervals.map((i) => mod12(rootPc + i)));
			let inChordWeight = 0;
			let outChordWeight = 0;
			for (let pc = 0; pc < 12; pc++) {
				if (toneSet.has(pc)) inChordWeight += normalized[pc];
				else outChordWeight += normalized[pc];
			}

			// Check how many essential chord intervals are actually present
			let presentReq = 0;
			for (const req of tmpl.requiredPcs) {
				if (normalized[mod12(rootPc + req)] > 0.04) presentReq++;
			}
			const coverageBonus = (presentReq / tmpl.requiredPcs.length) * 0.45;
			const bassBonus =
				rootPc === lowestPc ? 0.35 : toneSet.has(lowestPc) ? 0.14 : -0.05;
			const diatonicBonus = scalePcSet.has(rootPc) ? 0.1 : 0;

			const score =
				inChordWeight * 1.25 -
				outChordWeight * 0.65 +
				coverageBonus +
				bassBonus +
				diatonicBonus -
				tmpl.complexityPenalty;

			if (score > bestScore) {
				bestScore = score;
				bestRootPc = rootPc;
				bestKind = tmpl.kind;
			}
		}
	}

	const rootName = scaleSpellMap.get(bestRootPc) ?? fallbackPalette[bestRootPc];
	const variation = buildChordVariation(rootName, bestKind, preferFlats);
	const { roman, circleDegree } = inferRomanNumeral(
		tonicPc,
		keyMode,
		bestRootPc,
		variation.quality,
		bestKind,
	);
	const circleSlotIndex = findCircleSlotForRootPc(
		bestRootPc,
		variation.quality,
	);

	return {
		chordSymbol: variation.symbol,
		roman,
		quality: variation.quality,
		guitarKind: bestKind,
		chordNotes: variation.notes,
		circleDegree,
		circleSlotIndex,
	};
}

export function resolveExplicitChordSymbol(
	symbolRaw: string,
	keySlot: number,
	keyMode: KeyMode,
): InferredHarmony | null {
	const clean = symbolRaw
		.trim()
		.replace(/#/g, "♯")
		.replace(/b/g, "♭")
		.split("/")[0]
		?.trim();
	if (!clean) return null;

	const match = /^([A-G][♯♭]?)(.*)$/.exec(clean);
	if (!match) return null;
	const [, rootName, suffix] = match;
	const rootPc = noteToPitchClass(rootName);

	let kind: GuitarChordKind = "major";
	if (suffix === "m" || suffix === "min") kind = "minor";
	else if (suffix === "maj7" || suffix === "Δ7") kind = "maj7";
	else if (suffix === "m7" || suffix === "min7") kind = "m7";
	else if (suffix === "m7♭5" || suffix === "ø7") kind = "m7♭5";
	else if (suffix === "dim7" || suffix === "°7") kind = "dim7";
	else if (suffix === "dim" || suffix === "°") kind = "diminished";
	else if (suffix === "aug" || suffix === "+") kind = "aug";
	else if (suffix === "add9") kind = "add9";
	else if (suffix === "madd9" || suffix === "m(add9)") kind = "madd9";
	else if (suffix === "sus4") kind = "sus4";
	else if (suffix === "sus2") kind = "sus2";
	else if (
		suffix.includes("7") ||
		suffix.includes("9") ||
		suffix.includes("13")
	)
		kind = suffix.startsWith("m") ? "m7" : "7";

	const keyAnalysis = analyzeKey(keySlot, keyMode);
	const tonicPc = noteToPitchClass(keyAnalysis.root);
	const variation = buildChordVariation(
		rootName,
		kind,
		keyAnalysis.accidentalsCount < 0 || rootName.includes("♭"),
	);
	const { roman, circleDegree } = inferRomanNumeral(
		tonicPc,
		keyMode,
		rootPc,
		variation.quality,
		kind,
	);
	return {
		chordSymbol: symbolRaw.trim().replace(/#/g, "♯").replace(/b/g, "♭"),
		roman,
		quality: variation.quality,
		guitarKind: kind,
		chordNotes: variation.notes,
		circleDegree,
		circleSlotIndex: findCircleSlotForRootPc(rootPc, variation.quality),
	};
}
