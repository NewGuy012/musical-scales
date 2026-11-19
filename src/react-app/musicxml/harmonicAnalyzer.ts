import {
	type ChordQuality,
	FLAT_CHROMATIC,
	type KeyAnalysis,
	type KeyMode,
	SHARP_CHROMATIC,
	analyzeKey,
	mod12,
	noteToPitchClass,
	pcToCircleIndex,
	resolveSlotVariant,
} from "../theory/circleOfFifths";
import {
	CHORD_INTERVAL_MAP,
	type GuitarChordKind,
	buildChordVariation,
} from "../theory/guitarFretboard";

interface WeightedPitchEvent {
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
}[] = (
	[
		{ kind: "major", requiredPcs: [0, 4], complexityPenalty: 0 },
		{ kind: "minor", requiredPcs: [0, 3], complexityPenalty: 0 },
		{ kind: "7", requiredPcs: [0, 4, 10], complexityPenalty: 0.14 },
		{ kind: "maj7", requiredPcs: [0, 4, 11], complexityPenalty: 0.2 },
		{ kind: "m7", requiredPcs: [0, 3, 10], complexityPenalty: 0.16 },
		{ kind: "diminished", requiredPcs: [0, 3, 6], complexityPenalty: 0.15 },
		{ kind: "dim7", requiredPcs: [0, 3, 6, 9], complexityPenalty: 0.28 },
		{ kind: "m7♭5", requiredPcs: [0, 3, 6, 10], complexityPenalty: 0.25 },
		{ kind: "add9", requiredPcs: [0, 4, 2], complexityPenalty: 0.25 },
		{ kind: "sus4", requiredPcs: [0, 5, 7], complexityPenalty: 0.24 },
		{ kind: "sus2", requiredPcs: [0, 2, 7], complexityPenalty: 0.26 },
		{ kind: "aug", requiredPcs: [0, 4, 8], complexityPenalty: 0.3 },
	] as const
).map((spec) => ({
	...spec,
	intervals: Object.keys(CHORD_INTERVAL_MAP[spec.kind]).map(Number),
}));

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
	const keySlot = pcToCircleIndex(mod12(rootPc), mode);
	const variant = resolveSlotVariant(
		keySlot,
		preferFlats ? "flats" : "standard",
	);
	const root = mode === "major" ? variant.majorRoot : variant.minorRoot;
	return {
		keySlot,
		keyMode: mode,
		keyLabel: `${root} ${mode === "major" ? "Major" : "Minor"}`,
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

	if (!roman.includes("°")) {
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
	precomputedKey?: KeyAnalysis,
): InferredHarmony {
	const keyAnalysis = precomputedKey ?? analyzeKey(keySlot, keyMode);
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
	return {
		chordSymbol: variation.symbol,
		roman,
		quality: variation.quality,
		guitarKind: bestKind,
		chordNotes: variation.notes,
		circleDegree,
		circleSlotIndex: pcToCircleIndex(bestRootPc, variation.quality),
	};
}

const EXPLICIT_SUFFIX_MAP: Readonly<Record<string, GuitarChordKind>> = {
	m: "minor",
	min: "minor",
	maj7: "maj7",
	Δ7: "maj7",
	M7: "maj7",
	m7: "m7",
	min7: "m7",
	"m7♭5": "m7♭5",
	ø7: "m7♭5",
	ø: "m7♭5",
	dim7: "dim7",
	"°7": "dim7",
	dim: "diminished",
	"°": "diminished",
	aug: "aug",
	"+": "aug",
	add9: "add9",
	madd9: "madd9",
	"m(add9)": "madd9",
	sus4: "sus4",
	sus: "sus4",
	sus2: "sus2",
};

export function resolveExplicitChordSymbol(
	symbolRaw: string,
	keySlot: number,
	keyMode: KeyMode,
	precomputedKey?: KeyAnalysis,
): InferredHarmony | null {
	const normalized = symbolRaw.trim().replace(/#/g, "♯").replace(/b/g, "♭");
	const clean = normalized.split("/")[0]?.trim();
	if (!clean) return null;

	const match = /^([A-G][♯♭]?)(.*)$/.exec(clean);
	if (!match) return null;
	const [, rootName, suffix] = match;
	const rootPc = noteToPitchClass(rootName);

	let kind: GuitarChordKind = Object.hasOwn(EXPLICIT_SUFFIX_MAP, suffix)
		? EXPLICIT_SUFFIX_MAP[suffix]
		: "major";
	if (!Object.hasOwn(EXPLICIT_SUFFIX_MAP, suffix)) {
		if (
			suffix.includes("maj9") ||
			suffix.includes("Δ9") ||
			suffix.includes("M9")
		) {
			kind = "maj7";
		} else if (/(?:7|9|11|13)/.test(suffix)) {
			kind = suffix.startsWith("m") ? "m7" : "7";
		} else if (suffix.startsWith("m")) {
			kind = "minor";
		}
	}

	const keyAnalysis = precomputedKey ?? analyzeKey(keySlot, keyMode);
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
		chordSymbol: normalized,
		roman,
		quality: variation.quality,
		guitarKind: kind,
		chordNotes: variation.notes,
		circleDegree,
		circleSlotIndex: pcToCircleIndex(rootPc, variation.quality),
	};
}
