import {
	type AccidentalPreference,
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

export interface KeySignatureResolution {
	keySlot: number;
	keyMode: KeyMode;
	keyLabel: string;
}

export interface DetectKeyOptions {
	harmonies?: readonly { chordSymbol: string }[];
	candidates?: ReadonlyArray<{ rootPc: number; mode: KeyMode }>;
}

export function resolveKeySignatureFromRootPc(
	rootPc: number,
	mode: KeyMode,
	preferFlatsOrPref: boolean | AccidentalPreference = false,
): KeySignatureResolution {
	const keySlot = pcToCircleIndex(mod12(rootPc), mode);
	const pref: AccidentalPreference =
		typeof preferFlatsOrPref === "string"
			? preferFlatsOrPref
			: preferFlatsOrPref
				? "flats"
				: "standard";
	const variant = resolveSlotVariant(keySlot, pref);
	const root = mode === "major" ? variant.majorRoot : variant.minorRoot;
	return {
		keySlot,
		keyMode: mode,
		keyLabel: `${root} ${mode === "major" ? "Major" : "Minor"}`,
	};
}

export function parseExplicitKeyOption(
	keyRaw: string,
): KeySignatureResolution | null {
	const cleaned = keyRaw.trim().replace(/#/g, "♯").replace(/b/g, "♭");
	const match = /^([A-G][♯♭]?)\s*(major|maj|minor|min|m)?$/i.exec(cleaned);
	if (!match) return null;
	const [, rootToken, modeToken] = match;
	const rootName = rootToken[0].toUpperCase() + rootToken.slice(1);
	const modeLower = (modeToken ?? "").toLowerCase();
	const mode: KeyMode =
		modeLower === "m" || modeLower === "min" || modeLower === "minor"
			? "minor"
			: "major";
	const rootPc = noteToPitchClass(rootName);
	const pref: AccidentalPreference = rootName.includes("♯")
		? "sharps"
		: rootName.includes("♭")
			? "flats"
			: "standard";
	return resolveKeySignatureFromRootPc(rootPc, mode, pref);
}

interface ClassifiedHarmonyForKey {
	rootPc: number;
	quality: ChordQuality;
	isPowerOrSus: boolean;
}

function scoreHarmoniesForKeyCandidate(
	harmonies: readonly ClassifiedHarmonyForKey[],
	tonicPc: number,
	mode: KeyMode,
): number {
	if (harmonies.length === 0) return 0;
	const ka = analyzeKey(pcToCircleIndex(tonicPc, mode), mode);
	const diatonicQualityByPc = new Map<number, ChordQuality>();
	for (const chord of ka.chords) {
		diatonicQualityByPc.set(noteToPitchClass(chord.root), chord.quality);
	}

	let sum = 0;
	for (const h of harmonies) {
		const offset = mod12(h.rootPc - tonicPc);
		if (offset === 0 && (h.isPowerOrSus || h.quality === mode)) {
			sum += h.isPowerOrSus ? 0.6 : 1.0;
		} else if (offset === 7 && (h.quality === "major" || h.isPowerOrSus)) {
			sum += h.isPowerOrSus ? 0.4 : 0.65;
		} else if (offset === 5 && (h.quality === mode || h.isPowerOrSus)) {
			sum += 0.45;
		} else {
			const diatonicQuality = diatonicQualityByPc.get(h.rootPc);
			if (
				diatonicQuality === h.quality ||
				(h.isPowerOrSus && diatonicQuality !== undefined)
			) {
				sum += 0.3;
			}
		}
	}

	let anchor = 0;
	const first = harmonies[0];
	const last = harmonies[harmonies.length - 1];
	if (first && first.rootPc === tonicPc) {
		if (first.quality === mode && !first.isPowerOrSus) anchor += 0.35;
		else if (first.isPowerOrSus) anchor += 0.2;
	}
	if (last && last.rootPc === tonicPc) {
		if (last.quality === mode && !last.isPowerOrSus) anchor += 0.25;
		else if (last.isPowerOrSus) anchor += 0.15;
	}

	return sum / harmonies.length + anchor;
}

export function detectKeyFromEvents(
	events: readonly WeightedPitchEvent[],
	preferFlats = false,
	options?: DetectKeyOptions,
): KeySignatureResolution {
	const hist = new Array<number>(12).fill(0);
	for (const ev of events) {
		const weight = Math.max(1, ev.durationTicks) * (ev.midi < 55 ? 1.25 : 1);
		hist[mod12(ev.midi)] += weight;
	}
	const total = hist.reduce((s, v) => s + v, 0);

	const parsedHarmonies: ClassifiedHarmonyForKey[] = [];
	for (const mark of options?.harmonies ?? []) {
		const parsed = parseChordSymbolBase(mark.chordSymbol);
		if (!parsed) continue;
		const isPowerOrSus =
			parsed.suffix === "5" || parsed.suffix.startsWith("sus");
		const quality: ChordQuality =
			parsed.kind === "minor" || parsed.kind === "m7" || parsed.kind === "madd9"
				? "minor"
				: parsed.kind === "diminished" ||
					  parsed.kind === "dim7" ||
					  parsed.kind === "m7♭5"
					? "diminished"
					: "major";
		parsedHarmonies.push({
			rootPc: parsed.rootPc,
			quality,
			isPowerOrSus,
		});
	}

	const candidates =
		options?.candidates && options.candidates.length > 0
			? options.candidates
			: Array.from({ length: 12 }, (_, pc) => [
					{ rootPc: pc, mode: "major" as const },
					{ rootPc: pc, mode: "minor" as const },
				]).flat();

	if (total <= 0 && parsedHarmonies.length === 0) {
		const first = candidates[0] ?? { rootPc: 0, mode: "major" as const };
		return resolveKeySignatureFromRootPc(first.rootPc, first.mode, preferFlats);
	}

	let bestScore = -Infinity;
	let bestPc = candidates[0]?.rootPc ?? 0;
	let bestMode: KeyMode = candidates[0]?.mode ?? "major";

	for (const cand of candidates) {
		const pc = mod12(cand.rootPc);
		const pitchScore =
			total > 0
				? pearsonCorrelation(
						hist,
						cand.mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE,
						pc,
					)
				: 0;
		const harmonyScore = scoreHarmoniesForKeyCandidate(
			parsedHarmonies,
			pc,
			cand.mode,
		);
		const score = pitchScore + harmonyScore;
		if (score > bestScore) {
			bestScore = score;
			bestPc = pc;
			bestMode = cand.mode;
		}
	}

	return resolveKeySignatureFromRootPc(bestPc, bestMode, preferFlats);
}

const MAJOR_ROMAN_UPPER_BY_OFFSET: Record<number, string> = {
	0: "I",
	1: "♭II",
	2: "II",
	3: "♭III",
	4: "III",
	5: "IV",
	6: "♯IV",
	7: "V",
	8: "♭VI",
	9: "VI",
	10: "♭VII",
	11: "VII",
};

const MINOR_ROMAN_UPPER_BY_OFFSET: Record<number, string> = {
	0: "I",
	1: "♭II",
	2: "II",
	3: "III",
	4: "♯III",
	5: "IV",
	6: "♯IV",
	7: "V",
	8: "VI",
	9: "♯VI",
	10: "VII",
	11: "VII",
};

const DEGREE_NUMERALS_UPPER = [
	"I",
	"II",
	"III",
	"IV",
	"V",
	"VI",
	"VII",
] as const;

const CHROMATIC_OFFSETS = new Set([1, 3, 6, 8, 10]);

function toLowerRomanPreservingAccidentals(romanUpper: string): string {
	return romanUpper.replace(/[IV]+/g, (m) => m.toLowerCase());
}

function resolveBaseUpperRoman(
	offset: number,
	keyMode: KeyMode,
	quality: ChordQuality,
	rootName?: string,
	keyAnalysis?: KeyAnalysis,
): string {
	if (rootName && keyAnalysis && CHROMATIC_OFFSETS.has(offset)) {
		const rootLetter = rootName[0];
		const degIdx = keyAnalysis.scaleNotes.findIndex((n) => n[0] === rootLetter);
		if (degIdx >= 0) {
			const scalePc = noteToPitchClass(keyAnalysis.scaleNotes[degIdx]);
			const delta = mod12(
				offset - mod12(scalePc - noteToPitchClass(keyAnalysis.root)),
			);
			if (delta === 1) return `♯${DEGREE_NUMERALS_UPPER[degIdx]}`;
			if (delta === 11) return `♭${DEGREE_NUMERALS_UPPER[degIdx]}`;
		}
	}
	if (keyMode === "major") {
		if (offset === 1 && quality === "diminished") return "♯I";
		if (offset === 8 && quality === "diminished") return "♯V";
		return MAJOR_ROMAN_UPPER_BY_OFFSET[offset] ?? "I";
	}
	if (offset === 1 && quality === "diminished") return "♯I";
	if (offset === 11 && quality === "major") return "♯VII";
	return MINOR_ROMAN_UPPER_BY_OFFSET[offset] ?? "I";
}

function inferRomanNumeral(
	tonicPc: number,
	keyMode: KeyMode,
	rootPc: number,
	quality: ChordQuality,
	kind: GuitarChordKind,
	options?: {
		rootName?: string;
		keyAnalysis?: KeyAnalysis;
		isPower?: boolean;
		isSus?: boolean;
	},
): { roman: string; circleDegree: number; effectiveQuality: ChordQuality } {
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

	// Power chords (5) and suspended chords (sus4/sus2) have no 3rd; align
	// their UI quality and Roman case with minor-key tonic/subdominant context.
	const isThirdless = Boolean(options?.isPower || options?.isSus);
	let effectiveQuality: ChordQuality = quality;
	if (isThirdless && keyMode === "minor" && (offset === 0 || offset === 5)) {
		effectiveQuality = "minor";
	}

	const baseUpper = resolveBaseUpperRoman(
		offset,
		keyMode,
		effectiveQuality,
		options?.rootName,
		options?.keyAnalysis,
	);

	if (options?.isPower) {
		const stem =
			effectiveQuality === "minor"
				? toLowerRomanPreservingAccidentals(baseUpper)
				: baseUpper;
		return { roman: `${stem}5`, circleDegree, effectiveQuality };
	}

	if (options?.isSus) {
		const susSuffix = kind === "sus2" ? "sus2" : "sus4";
		const stem =
			effectiveQuality === "minor"
				? toLowerRomanPreservingAccidentals(baseUpper)
				: baseUpper;
		return { roman: `${stem}${susSuffix}`, circleDegree, effectiveQuality };
	}

	if (effectiveQuality === "diminished") {
		const dimSuffix = kind === "dim7" ? "°7" : kind === "m7♭5" ? "ø7" : "°";
		return {
			roman: `${toLowerRomanPreservingAccidentals(baseUpper)}${dimSuffix}`,
			circleDegree,
			effectiveQuality,
		};
	}

	if (effectiveQuality === "minor") {
		const minorSuffix = kind === "m7" ? "7" : "";
		return {
			roman: `${toLowerRomanPreservingAccidentals(baseUpper)}${minorSuffix}`,
			circleDegree,
			effectiveQuality,
		};
	}

	// Major-quality chords (major, 7, maj7, aug, add9)
	const seventhTag = kind === "7" ? "7" : "";
	if (kind === "major" || kind === "7") {
		if (offset === 2) {
			return {
				roman: `V${seventhTag}/V`,
				circleDegree,
				effectiveQuality,
			};
		}
		if (keyMode === "major" && offset === 9) {
			return {
				roman: `V${seventhTag}/ii`,
				circleDegree,
				effectiveQuality,
			};
		}
		if (keyMode === "major" && offset === 4) {
			return {
				roman: `V${seventhTag}/vi`,
				circleDegree,
				effectiveQuality,
			};
		}
		if (keyMode === "major" && offset === 11) {
			return {
				roman: `V${seventhTag}/iii`,
				circleDegree,
				effectiveQuality,
			};
		}
	}

	const majorSuffix =
		kind === "7" ? "7" : kind === "maj7" ? "maj7" : kind === "aug" ? "+" : "";
	return {
		roman: `${baseUpper}${majorSuffix}`,
		circleDegree,
		effectiveQuality,
	};
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
	const { roman, circleDegree, effectiveQuality } = inferRomanNumeral(
		tonicPc,
		keyMode,
		bestRootPc,
		variation.quality,
		bestKind,
		{
			rootName,
			keyAnalysis,
			isSus: bestKind === "sus4" || bestKind === "sus2",
		},
	);
	return {
		chordSymbol: variation.symbol,
		roman,
		quality: effectiveQuality,
		guitarKind: bestKind,
		chordNotes: variation.notes,
		circleDegree,
		circleSlotIndex: pcToCircleIndex(bestRootPc, effectiveQuality),
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
	"6": "major",
	m6: "minor",
	"5": "major",
};

function parseChordSymbolBase(symbolRaw: string): {
	normalized: string;
	rootName: string;
	rootPc: number;
	suffix: string;
	kind: GuitarChordKind;
	isPower: boolean;
	isSus: boolean;
} | null {
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

	return {
		normalized,
		rootName,
		rootPc,
		suffix,
		kind,
		isPower: suffix === "5",
		isSus: kind === "sus4" || kind === "sus2",
	};
}

export function resolveExplicitChordSymbol(
	symbolRaw: string,
	keySlot: number,
	keyMode: KeyMode,
	precomputedKey?: KeyAnalysis,
): InferredHarmony | null {
	const parsed = parseChordSymbolBase(symbolRaw);
	if (!parsed) return null;
	const { normalized, rootName, rootPc, kind, isPower, isSus } = parsed;

	const keyAnalysis = precomputedKey ?? analyzeKey(keySlot, keyMode);
	const tonicPc = noteToPitchClass(keyAnalysis.root);
	const variation = buildChordVariation(
		rootName,
		kind,
		keyAnalysis.accidentalsCount < 0 || rootName.includes("♭"),
	);
	const { roman, circleDegree, effectiveQuality } = inferRomanNumeral(
		tonicPc,
		keyMode,
		rootPc,
		variation.quality,
		kind,
		{
			rootName,
			keyAnalysis,
			isPower,
			isSus,
		},
	);
	const chordNotes = isPower
		? [variation.notes[0], variation.notes[2] ?? variation.notes[1]].filter(
				(n): n is string => Boolean(n),
			)
		: variation.notes;
	return {
		chordSymbol: normalized,
		roman,
		quality: effectiveQuality,
		guitarKind: kind,
		chordNotes,
		circleDegree,
		circleSlotIndex: pcToCircleIndex(rootPc, effectiveQuality),
	};
}
