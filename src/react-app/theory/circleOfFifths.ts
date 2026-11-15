export type KeyMode = "major" | "minor";
export type AccidentalPreference = "standard" | "sharps" | "flats";
export type ChordQuality = "major" | "minor" | "diminished";
export type EnharmonicSide = "sharp" | "flat";

export interface KeyVariant {
	majorRoot: string;
	minorRoot: string;
	accidentalsCount: number; // positive = sharps, negative = flats, 0 = natural
	side: EnharmonicSide | "neutral";
}

export interface CircleSlot {
	index: number; // 0..11 clockwise starting at C (12 o'clock)
	primary: KeyVariant;
	enharmonic?: KeyVariant;
}

export interface DiatonicChord {
	degree: number; // 1..7
	roman: string;
	root: string;
	quality: ChordQuality;
	symbol: string;
	seventhSymbol: string;
	triadNotes: [string, string, string];
	seventhNotes: [string, string, string, string];
	triadMidi: [number, number, number];
	seventhMidi: [number, number, number, number];
	circleIndex: number;
	functionLabel: string;
}

export interface KeyNeighborInfo {
	direction: "fourth" | "fifth";
	slotIndex: number;
	mode: KeyMode;
	root: string;
	shortName: string;
	name: string;
	accidentalsCount: number;
	signatureDeltaLabel: string;
	sharedCount: number;
	removedNote: string;
	addedNote: string;
	chordRoman: string;
	chordSymbol: string;
}

export interface ChordProgression {
	id: string;
	name: string;
	label: string;
	description: string;
	degrees: number[]; // 1-based degrees; -5 indicates Harmonic Minor V
}

export interface TonicChordPair {
	major: {
		symbol: string;
		notes: [string, string, string];
		midi: [number, number, number];
		noteLabel?: string;
	};
	minor: {
		symbol: string;
		notes: [string, string, string];
		midi: [number, number, number];
		noteLabel?: string;
	};
}

export interface KeyAnalysis {
	slotIndex: number;
	mode: KeyMode;
	root: string;
	shortName: string;
	name: string;
	accidentalsCount: number;
	accidentals: string[];
	signatureLabel: string;
	scaleNotes: string[];
	scaleMidi: number[];
	chords: DiatonicChord[];
	majorChords: DiatonicChord[];
	minorChords: DiatonicChord[];
	diminishedChord: DiatonicChord;
	harmonicMinorV: DiatonicChord | null;
	tonicPair: TonicChordPair;
	relativeKey: {
		slotIndex: number;
		mode: KeyMode;
		root: string;
		shortName: string;
		name: string;
	};
	parallelKey: {
		slotIndex: number;
		mode: KeyMode;
		root: string;
		shortName: string;
		name: string;
		isEnharmonic: boolean;
	};
	enharmonicTwin: {
		side: EnharmonicSide;
		root: string;
		shortName: string;
		name: string;
		accidentalsCount: number;
	} | null;
	fourthNeighbor: KeyNeighborInfo;
	fifthNeighbor: KeyNeighborInfo;
	progressions: ChordProgression[];
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL_PC: Record<string, number> = {
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11,
};

const ACCIDENTAL_BY_OFFSET: Record<number, string> = {
	[-2]: "𝄫",
	[-1]: "♭",
	0: "",
	1: "♯",
	2: "𝄪",
};

export const SHARP_ORDER = ["F♯", "C♯", "G♯", "D♯", "A♯", "E♯", "B♯"] as const;
export const FLAT_ORDER = ["B♭", "E♭", "A♭", "D♭", "G♭", "C♭", "F♭"] as const;

// Circle offsets from tonic slot for scale degrees 1..7
const CIRCLE_DEGREE_OFFSETS = [0, 11, 1, 11, 1, 0, 5] as const;

export const CIRCLE_SLOTS: CircleSlot[] = [
	{ index: 0, primary: { majorRoot: "C", minorRoot: "A", accidentalsCount: 0, side: "neutral" } },
	{ index: 1, primary: { majorRoot: "G", minorRoot: "E", accidentalsCount: 1, side: "sharp" } },
	{ index: 2, primary: { majorRoot: "D", minorRoot: "B", accidentalsCount: 2, side: "sharp" } },
	{ index: 3, primary: { majorRoot: "A", minorRoot: "F♯", accidentalsCount: 3, side: "sharp" } },
	{ index: 4, primary: { majorRoot: "E", minorRoot: "C♯", accidentalsCount: 4, side: "sharp" } },
	{
		index: 5,
		primary: { majorRoot: "B", minorRoot: "G♯", accidentalsCount: 5, side: "sharp" },
		enharmonic: { majorRoot: "C♭", minorRoot: "A♭", accidentalsCount: -7, side: "flat" },
	},
	{
		index: 6,
		primary: { majorRoot: "F♯", minorRoot: "D♯", accidentalsCount: 6, side: "sharp" },
		enharmonic: { majorRoot: "G♭", minorRoot: "E♭", accidentalsCount: -6, side: "flat" },
	},
	{
		index: 7,
		primary: { majorRoot: "D♭", minorRoot: "B♭", accidentalsCount: -5, side: "flat" },
		enharmonic: { majorRoot: "C♯", minorRoot: "A♯", accidentalsCount: 7, side: "sharp" },
	},
	{ index: 8, primary: { majorRoot: "A♭", minorRoot: "F", accidentalsCount: -4, side: "flat" } },
	{ index: 9, primary: { majorRoot: "E♭", minorRoot: "C", accidentalsCount: -3, side: "flat" } },
	{ index: 10, primary: { majorRoot: "B♭", minorRoot: "G", accidentalsCount: -2, side: "flat" } },
	{ index: 11, primary: { majorRoot: "F", minorRoot: "D", accidentalsCount: -1, side: "flat" } },
];

const MAJOR_PROGRESSIONS: ChordProgression[] = [
	{
		id: "maj-1451",
		name: "I – IV – V – I",
		label: "Classic Fifths & Fourths",
		description: "Moves counter-clockwise to the 4th, clockwise to the 5th, and resolves home.",
		degrees: [1, 4, 5, 1],
	},
	{
		id: "maj-1564",
		name: "I – V – vi – IV",
		label: "Pop Anthem Loop",
		description: "Alternates between major tonic/dominant/subdominant and the relative minor.",
		degrees: [1, 5, 6, 4],
	},
	{
		id: "maj-251",
		name: "ii – V – I",
		label: "Jazz Circle Cadence",
		description: "Walks clockwise by fifths from the minor ii through V back to I.",
		degrees: [2, 5, 1],
	},
	{
		id: "maj-1645",
		name: "I – vi – IV – V",
		label: "50s Progression",
		description: "Drops to the relative minor before climbing through IV and V.",
		degrees: [1, 6, 4, 5],
	},
];

const MINOR_PROGRESSIONS: ChordProgression[] = [
	{
		id: "min-1451",
		name: "i – iv – v – i",
		label: "Natural Minor Cadence",
		description: "Explores the minor 4th and minor 5th neighbors around the tonic minor.",
		degrees: [1, 4, 5, 1],
	},
	{
		id: "min-1637",
		name: "i – VI – III – VII",
		label: "Epic Minor Loop",
		description: "Weaves between minor tonic and the three bright relative major chords.",
		degrees: [1, 6, 3, 7],
	},
	{
		id: "min-1473",
		name: "i – iv – VII – III",
		label: "Circle Minor Walk",
		description: "Steps around the circle of fifths into the relative major.",
		degrees: [1, 4, 7, 3],
	},
	{
		id: "min-251",
		name: "ii° – V – i",
		label: "Harmonic Minor Cadence",
		description: "Uses the diminished ii° and raised major V to pull strongly back to i.",
		degrees: [2, -5, 1],
	},
];

const MODE_SPECS: Record<
	KeyMode,
	{
		intervals: readonly number[];
		romans: readonly string[];
		qualities: readonly ChordQuality[];
		seventhSuffixes: readonly string[];
		functions: readonly string[];
		progressions: ChordProgression[];
	}
> = {
	major: {
		intervals: [0, 2, 4, 5, 7, 9, 11],
		romans: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
		qualities: ["major", "minor", "minor", "major", "major", "minor", "diminished"],
		seventhSuffixes: ["maj7", "m7", "m7", "maj7", "7", "m7", "m7♭5"],
		functions: [
			"Tonic",
			"Supertonic",
			"Mediant",
			"Subdominant · 4th",
			"Dominant · 5th",
			"Relative Minor",
			"Leading Tone",
		],
		progressions: MAJOR_PROGRESSIONS,
	},
	minor: {
		intervals: [0, 2, 3, 5, 7, 8, 10],
		romans: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
		qualities: ["minor", "diminished", "major", "minor", "minor", "major", "major"],
		seventhSuffixes: ["m7", "m7♭5", "maj7", "m7", "m7", "maj7", "7"],
		functions: [
			"Tonic",
			"Supertonic",
			"Relative Major",
			"Subdominant · 4th",
			"Dominant · 5th",
			"Submediant",
			"Subtonic",
		],
		progressions: MINOR_PROGRESSIONS,
	},
};

export function mod12(n: number): number {
	return ((n % 12) + 12) % 12;
}

export function noteOffset(note: string): number {
	let offset = 0;
	for (const ch of note.slice(1)) {
		if (ch === "♯" || ch === "#") offset += 1;
		else if (ch === "♭" || ch === "b") offset -= 1;
		else if (ch === "𝄪") offset += 2;
		else if (ch === "𝄫") offset -= 2;
	}
	return offset;
}

export function noteToPitchClass(note: string): number {
	const base = NATURAL_PC[note[0]];
	if (base === undefined) {
		throw new Error(`Invalid note name: ${note}`);
	}
	return mod12(base + noteOffset(note));
}

export function formatKeyIdentity(root: string, mode: KeyMode) {
	return {
		root,
		shortName: mode === "major" ? root : `${root}m`,
		name: mode === "major" ? `${root} Major` : `${root} Minor`,
	};
}

export function getChordCardId(chord: DiatonicChord, suffix = ""): string {
	return `${chord.roman}-${chord.symbol}${suffix}`;
}

export function buildScale(root: string, mode: KeyMode): string[] {
	const rootLetterIdx = LETTERS.indexOf(root[0] as (typeof LETTERS)[number]);
	if (rootLetterIdx === -1) {
		throw new Error(`Invalid root note: ${root}`);
	}
	const rootPc = noteToPitchClass(root);

	return MODE_SPECS[mode].intervals.map((semitones, idx) => {
		const letter = LETTERS[(rootLetterIdx + idx) % 7];
		const targetPc = mod12(rootPc + semitones);
		let diff = mod12(targetPc - NATURAL_PC[letter]);
		if (diff > 6) diff -= 12;
		return `${letter}${ACCIDENTAL_BY_OFFSET[diff] ?? ""}`;
	});
}

/**
 * Maps ascending note names onto MIDI pitches starting in C4..B4 (60..71)
 * so every triad, 7th chord, and 1-octave scale stays within C4..B5 (60..83).
 */
export function ascendingNotesToMidi(notes: string[]): number[] {
	if (notes.length === 0) return [];
	const result = [60 + noteToPitchClass(notes[0])];

	for (let i = 1; i < notes.length; i++) {
		const pc = noteToPitchClass(notes[i]);
		const prev = result[i - 1];
		const step = mod12(pc - mod12(prev)) || 12;
		result.push(prev + step);
	}
	return result;
}

export function formatChordSymbol(root: string, quality: ChordQuality): string {
	if (quality === "major") return root;
	if (quality === "minor") return `${root}m`;
	return `${root}°`;
}

export function formatKeySignatureLabel(accidentalsCount: number): string {
	if (accidentalsCount === 0) return "0 sharps / 0 flats";
	const abs = Math.abs(accidentalsCount);
	const unit = accidentalsCount > 0 ? "sharp" : "flat";
	return `${abs} ${unit}${abs === 1 ? "" : "s"}`;
}

export function formatShortSignature(accidentalsCount: number): string {
	if (accidentalsCount === 0) return "0";
	return `${Math.abs(accidentalsCount)}${accidentalsCount > 0 ? "♯" : "♭"}`;
}

export function getSignatureAccidentals(accidentalsCount: number): string[] {
	if (accidentalsCount === 0) return [];
	return (accidentalsCount > 0 ? SHARP_ORDER : FLAT_ORDER).slice(
		0,
		Math.abs(accidentalsCount),
	);
}

export function resolveSlotVariant(
	slotIndex: number,
	preference: AccidentalPreference = "standard",
	slotSideOverrides: Partial<Record<number, EnharmonicSide>> = {},
): KeyVariant {
	const slot = CIRCLE_SLOTS[mod12(slotIndex)];
	if (!slot.enharmonic) return slot.primary;

	const targetSide =
		slotSideOverrides[slot.index] ??
		(preference === "sharps"
			? "sharp"
			: preference === "flats"
				? "flat"
				: null);

	if (targetSide) {
		return slot.primary.side === targetSide ? slot.primary : slot.enharmonic;
	}
	return slot.primary;
}

function alterNote(note: string, delta: number): string {
	const acc = ACCIDENTAL_BY_OFFSET[noteOffset(note) + delta];
	return acc !== undefined ? `${note[0]}${acc}` : note;
}

function buildDiatonicChord(
	scaleNotes: string[],
	degreeIndex: number,
	mode: KeyMode,
	slotIndex: number,
): DiatonicChord {
	const spec = MODE_SPECS[mode];
	const root = scaleNotes[degreeIndex];
	const quality = spec.qualities[degreeIndex];
	const triadNotes: [string, string, string] = [
		root,
		scaleNotes[(degreeIndex + 2) % 7],
		scaleNotes[(degreeIndex + 4) % 7],
	];
	const seventhNotes: [string, string, string, string] = [
		...triadNotes,
		scaleNotes[(degreeIndex + 6) % 7],
	];

	return {
		degree: degreeIndex + 1,
		roman: spec.romans[degreeIndex],
		root,
		quality,
		symbol: formatChordSymbol(root, quality),
		seventhSymbol: `${root}${spec.seventhSuffixes[degreeIndex]}`,
		triadNotes,
		seventhNotes,
		triadMidi: ascendingNotesToMidi(triadNotes) as [number, number, number],
		seventhMidi: ascendingNotesToMidi(seventhNotes) as [number, number, number, number],
		circleIndex: mod12(slotIndex + CIRCLE_DEGREE_OFFSETS[degreeIndex]),
		functionLabel: spec.functions[degreeIndex],
	};
}

function buildHarmonicMinorV(scaleNotes: string[], slotIndex: number): DiatonicChord {
	const root = scaleNotes[4];
	const triadNotes: [string, string, string] = [
		root,
		alterNote(scaleNotes[6], 1),
		scaleNotes[1],
	];
	const seventhNotes: [string, string, string, string] = [
		...triadNotes,
		scaleNotes[3],
	];

	return {
		degree: 5,
		roman: "V",
		root,
		quality: "major",
		symbol: root,
		seventhSymbol: `${root}7`,
		triadNotes,
		seventhNotes,
		triadMidi: ascendingNotesToMidi(triadNotes) as [number, number, number],
		seventhMidi: ascendingNotesToMidi(seventhNotes) as [number, number, number, number],
		circleIndex: mod12(slotIndex + 1),
		functionLabel: "Harmonic Dominant · 5th",
	};
}

function getAllSlotVariants(mode: KeyMode) {
	return CIRCLE_SLOTS.flatMap((slot) => {
		const variants = slot.enharmonic ? [slot.primary, slot.enharmonic] : [slot.primary];
		return variants.map((variant) => ({
			slotIndex: slot.index,
			variant,
			root: mode === "major" ? variant.majorRoot : variant.minorRoot,
		}));
	});
}

function computeNeighborInfo(
	direction: "fourth" | "fifth",
	currentSlotIndex: number,
	currentScaleNotes: string[],
	currentAccCount: number,
	mode: KeyMode,
	preference: AccidentalPreference,
	slotSideOverrides: Partial<Record<number, EnharmonicSide>>,
): KeyNeighborInfo {
	const targetSlotIndex = mod12(
		direction === "fifth" ? currentSlotIndex + 1 : currentSlotIndex - 1,
	);
	const targetVariant = resolveSlotVariant(
		targetSlotIndex,
		preference,
		slotSideOverrides,
	);
	const targetRoot =
		mode === "major" ? targetVariant.majorRoot : targetVariant.minorRoot;
	const targetScaleNotes = buildScale(targetRoot, mode);

	const currPcs = currentScaleNotes.map(noteToPitchClass);
	const targetPcs = targetScaleNotes.map(noteToPitchClass);

	const sharedCount = currPcs.filter((pc) => targetPcs.includes(pc)).length;
	const removedIdx = currPcs.findIndex((pc) => !targetPcs.includes(pc));
	const addedIdx = targetPcs.findIndex((pc) => !currPcs.includes(pc));

	const delta = targetVariant.accidentalsCount - currentAccCount;
	let signatureDeltaLabel: string;
	if (currentAccCount >= 0 && targetVariant.accidentalsCount > currentAccCount) {
		signatureDeltaLabel = `+${delta}♯`;
	} else if (currentAccCount <= 0 && targetVariant.accidentalsCount < currentAccCount) {
		signatureDeltaLabel = `+${Math.abs(delta)}♭`;
	} else if (delta === 1) {
		signatureDeltaLabel = "-1♭";
	} else if (delta === -1) {
		signatureDeltaLabel = "-1♯";
	} else {
		signatureDeltaLabel = `${formatShortSignature(currentAccCount)} → ${formatShortSignature(targetVariant.accidentalsCount)}`;
	}

	const identity = formatKeyIdentity(targetRoot, mode);
	const chordRoman =
		mode === "major"
			? direction === "fourth"
				? "IV"
				: "V"
			: direction === "fourth"
				? "iv"
				: "v";

	return {
		direction,
		slotIndex: targetSlotIndex,
		mode,
		...identity,
		accidentalsCount: targetVariant.accidentalsCount,
		signatureDeltaLabel,
		sharedCount,
		removedNote: currentScaleNotes[removedIdx] ?? "",
		addedNote: targetScaleNotes[addedIdx] ?? "",
		chordRoman,
		chordSymbol: identity.shortName,
	};
}

export function analyzeKey(
	slotIndex: number,
	mode: KeyMode,
	preference: AccidentalPreference = "standard",
	slotSideOverrides: Partial<Record<number, EnharmonicSide>> = {},
): KeyAnalysis {
	const idx = mod12(slotIndex);
	const slot = CIRCLE_SLOTS[idx];
	const variant = resolveSlotVariant(idx, preference, slotSideOverrides);
	const root = mode === "major" ? variant.majorRoot : variant.minorRoot;
	const identity = formatKeyIdentity(root, mode);
	const scaleNotes = buildScale(root, mode);
	const scaleMidi = ascendingNotesToMidi([...scaleNotes, scaleNotes[0]]);

	const chords = scaleNotes.map((_, degreeIndex) =>
		buildDiatonicChord(scaleNotes, degreeIndex, mode, idx),
	);
	const majorChords = chords.filter((c) => c.quality === "major");
	const minorChords = chords.filter((c) => c.quality === "minor");
	const diminishedChord = chords.find((c) => c.quality === "diminished")!;
	const harmonicMinorV =
		mode === "minor" ? buildHarmonicMinorV(scaleNotes, idx) : null;

	const majorRootTriad: [string, string, string] =
		mode === "major"
			? chords[0].triadNotes
			: [scaleNotes[0], alterNote(scaleNotes[2], 1), scaleNotes[4]];
	const minorRootTriad: [string, string, string] =
		mode === "minor"
			? chords[0].triadNotes
			: [scaleNotes[0], alterNote(scaleNotes[2], -1), scaleNotes[4]];

	const oppositeMode: KeyMode = mode === "major" ? "minor" : "major";
	const allParallelCandidates = getAllSlotVariants(oppositeMode);
	const exactParallel =
		allParallelCandidates.find((c) => c.root === root) ?? null;
	const rootPc = noteToPitchClass(root);
	const pcMatches = allParallelCandidates.filter(
		(c) => noteToPitchClass(c.root) === rootPc,
	);
	const parallelMatch =
		exactParallel ??
		pcMatches.find((m) => m.variant.side === variant.side) ??
		pcMatches[0];
	const parallelRoot = parallelMatch.root;

	const relativeRoot =
		oppositeMode === "major" ? variant.majorRoot : variant.minorRoot;

	const extractTriad = (scale: string[]): [string, string, string] => [
		scale[0],
		scale[2],
		scale[4],
	];

	const cleanMajorNotes =
		mode === "minor" && !exactParallel
			? extractTriad(buildScale(parallelRoot, "major"))
			: majorRootTriad;
	const cleanMinorNotes =
		mode === "major" && !exactParallel
			? extractTriad(buildScale(parallelRoot, "minor"))
			: minorRootTriad;

	const enharmonicVariant = slot.enharmonic
		? variant === slot.primary
			? slot.enharmonic
			: slot.primary
		: null;

	return {
		slotIndex: idx,
		mode,
		...identity,
		accidentalsCount: variant.accidentalsCount,
		accidentals: getSignatureAccidentals(variant.accidentalsCount),
		signatureLabel: formatKeySignatureLabel(variant.accidentalsCount),
		scaleNotes,
		scaleMidi,
		chords,
		majorChords,
		minorChords,
		diminishedChord,
		harmonicMinorV,
		tonicPair: {
			major: {
				symbol: mode === "minor" && !exactParallel ? parallelRoot : root,
				notes: cleanMajorNotes,
				midi: ascendingNotesToMidi(cleanMajorNotes) as [number, number, number],
				noteLabel:
					mode === "minor" && !exactParallel
						? `Respelling of ${root} (${parallelRoot})`
						: undefined,
			},
			minor: {
				symbol: mode === "major" && !exactParallel ? `${parallelRoot}m` : `${root}m`,
				notes: cleanMinorNotes,
				midi: ascendingNotesToMidi(cleanMinorNotes) as [number, number, number],
				noteLabel:
					mode === "major" && !exactParallel
						? `Respelling of ${root}m (${parallelRoot}m)`
						: undefined,
			},
		},
		relativeKey: {
			slotIndex: idx,
			mode: oppositeMode,
			...formatKeyIdentity(relativeRoot, oppositeMode),
		},
		parallelKey: {
			slotIndex: parallelMatch.slotIndex,
			mode: oppositeMode,
			...formatKeyIdentity(parallelRoot, oppositeMode),
			isEnharmonic: !exactParallel,
		},
		enharmonicTwin: enharmonicVariant
			? {
					side: enharmonicVariant.side as EnharmonicSide,
					...formatKeyIdentity(
						mode === "major"
							? enharmonicVariant.majorRoot
							: enharmonicVariant.minorRoot,
						mode,
					),
					accidentalsCount: enharmonicVariant.accidentalsCount,
				}
			: null,
		fourthNeighbor: computeNeighborInfo(
			"fourth",
			idx,
			scaleNotes,
			variant.accidentalsCount,
			mode,
			preference,
			slotSideOverrides,
		),
		fifthNeighbor: computeNeighborInfo(
			"fifth",
			idx,
			scaleNotes,
			variant.accidentalsCount,
			mode,
			preference,
			slotSideOverrides,
		),
		progressions: MODE_SPECS[mode].progressions,
	};
}
