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

export const SHARP_ORDER = ["F♯", "C♯", "G♯", "D♯", "A♯", "E♯", "B♯"] as const;
export const FLAT_ORDER = ["B♭", "E♭", "A♭", "D♭", "G♭", "C♭", "F♭"] as const;

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10] as const;

const MAJOR_ROMANS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"] as const;
const MINOR_ROMANS = ["i", "ii°", "III", "iv", "v", "VI", "VII"] as const;

const MAJOR_QUALITIES: ChordQuality[] = [
	"major",
	"minor",
	"minor",
	"major",
	"major",
	"minor",
	"diminished",
];

const MINOR_QUALITIES: ChordQuality[] = [
	"minor",
	"diminished",
	"major",
	"minor",
	"minor",
	"major",
	"major",
];

const MAJOR_SEVENTH_SUFFIXES = [
	"maj7",
	"m7",
	"m7",
	"maj7",
	"7",
	"m7",
	"m7♭5",
] as const;

const MINOR_SEVENTH_SUFFIXES = [
	"m7",
	"m7♭5",
	"maj7",
	"m7",
	"m7",
	"maj7",
	"7",
] as const;

const MAJOR_FUNCTIONS = [
	"Tonic",
	"Supertonic",
	"Mediant",
	"Subdominant · 4th",
	"Dominant · 5th",
	"Relative Minor",
	"Leading Tone",
] as const;

const MINOR_FUNCTIONS = [
	"Tonic",
	"Supertonic",
	"Relative Major",
	"Subdominant · 4th",
	"Dominant · 5th",
	"Submediant",
	"Subtonic",
] as const;

// Circle offsets from tonic slot p for degrees 1..7
const CIRCLE_DEGREE_OFFSETS = [0, 11, 1, 11, 1, 0, 5] as const;

export const CIRCLE_SLOTS: CircleSlot[] = [
	{
		index: 0,
		primary: {
			majorRoot: "C",
			minorRoot: "A",
			accidentalsCount: 0,
			side: "neutral",
		},
	},
	{
		index: 1,
		primary: {
			majorRoot: "G",
			minorRoot: "E",
			accidentalsCount: 1,
			side: "sharp",
		},
	},
	{
		index: 2,
		primary: {
			majorRoot: "D",
			minorRoot: "B",
			accidentalsCount: 2,
			side: "sharp",
		},
	},
	{
		index: 3,
		primary: {
			majorRoot: "A",
			minorRoot: "F♯",
			accidentalsCount: 3,
			side: "sharp",
		},
	},
	{
		index: 4,
		primary: {
			majorRoot: "E",
			minorRoot: "C♯",
			accidentalsCount: 4,
			side: "sharp",
		},
	},
	{
		index: 5,
		primary: {
			majorRoot: "B",
			minorRoot: "G♯",
			accidentalsCount: 5,
			side: "sharp",
		},
		enharmonic: {
			majorRoot: "C♭",
			minorRoot: "A♭",
			accidentalsCount: -7,
			side: "flat",
		},
	},
	{
		index: 6,
		primary: {
			majorRoot: "F♯",
			minorRoot: "D♯",
			accidentalsCount: 6,
			side: "sharp",
		},
		enharmonic: {
			majorRoot: "G♭",
			minorRoot: "E♭",
			accidentalsCount: -6,
			side: "flat",
		},
	},
	{
		index: 7,
		primary: {
			majorRoot: "D♭",
			minorRoot: "B♭",
			accidentalsCount: -5,
			side: "flat",
		},
		enharmonic: {
			majorRoot: "C♯",
			minorRoot: "A♯",
			accidentalsCount: 7,
			side: "sharp",
		},
	},
	{
		index: 8,
		primary: {
			majorRoot: "A♭",
			minorRoot: "F",
			accidentalsCount: -4,
			side: "flat",
		},
	},
	{
		index: 9,
		primary: {
			majorRoot: "E♭",
			minorRoot: "C",
			accidentalsCount: -3,
			side: "flat",
		},
	},
	{
		index: 10,
		primary: {
			majorRoot: "B♭",
			minorRoot: "G",
			accidentalsCount: -2,
			side: "flat",
		},
	},
	{
		index: 11,
		primary: {
			majorRoot: "F",
			minorRoot: "D",
			accidentalsCount: -1,
			side: "flat",
		},
	},
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

export function mod12(n: number): number {
	return ((n % 12) + 12) % 12;
}

export function noteToPitchClass(note: string): number {
	const letter = note[0];
	const base = NATURAL_PC[letter];
	if (base === undefined) {
		throw new Error(`Invalid note name: ${note}`);
	}
	let offset = 0;
	for (const ch of note.slice(1)) {
		if (ch === "♯" || ch === "#") offset += 1;
		else if (ch === "♭" || ch === "b") offset -= 1;
		else if (ch === "𝄪") offset += 2;
		else if (ch === "𝄫") offset -= 2;
	}
	return mod12(base + offset);
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

export function buildScale(root: string, mode: KeyMode): string[] {
	const rootLetter = root[0];
	const rootLetterIdx = LETTERS.indexOf(rootLetter as (typeof LETTERS)[number]);
	if (rootLetterIdx === -1) {
		throw new Error(`Invalid root note: ${root}`);
	}
	const rootPc = noteToPitchClass(root);
	const intervals = mode === "major" ? MAJOR_INTERVALS : MINOR_INTERVALS;

	return intervals.map((semitones, idx) => {
		const letter = LETTERS[(rootLetterIdx + idx) % 7];
		const targetPc = mod12(rootPc + semitones);
		let diff = mod12(targetPc - NATURAL_PC[letter]);
		if (diff > 6) diff -= 12;
		const accidental =
			diff === 1
				? "♯"
				: diff === -1
					? "♭"
					: diff === 2
						? "𝄪"
						: diff === -2
							? "𝄫"
							: "";
		return `${letter}${accidental}`;
	});
}

/**
 * Maps a sequence of ascending note names onto MIDI pitches starting inside C4..B4 (60..71)
 * so every triad, seventh chord, and 1-octave scale stays comfortably inside C4..B5 (60..83).
 */
export function ascendingNotesToMidi(notes: string[]): number[] {
	if (notes.length === 0) return [];
	const rootPc = noteToPitchClass(notes[0]);
	const firstMidi = 60 + rootPc; // C4 (60) .. B4 (71)
	const result = [firstMidi];

	for (let i = 1; i < notes.length; i++) {
		const pc = noteToPitchClass(notes[i]);
		const prev = result[i - 1];
		let step = mod12(pc - mod12(prev));
		if (step === 0) step = 12;
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
	if (accidentalsCount > 0) {
		return accidentalsCount === 1 ? "1 sharp" : `${accidentalsCount} sharps`;
	}
	const flats = Math.abs(accidentalsCount);
	return flats === 1 ? "1 flat" : `${flats} flats`;
}

export function formatShortSignature(accidentalsCount: number): string {
	if (accidentalsCount === 0) return "0";
	if (accidentalsCount > 0) return `${accidentalsCount}♯`;
	return `${Math.abs(accidentalsCount)}♭`;
}

export function getSignatureAccidentals(accidentalsCount: number): string[] {
	if (accidentalsCount === 0) return [];
	if (accidentalsCount > 0) return SHARP_ORDER.slice(0, accidentalsCount);
	return FLAT_ORDER.slice(0, Math.abs(accidentalsCount));
}

export function resolveSlotVariant(
	slotIndex: number,
	preference: AccidentalPreference = "standard",
	slotSideOverrides: Partial<Record<number, EnharmonicSide>> = {},
): KeyVariant {
	const slot = CIRCLE_SLOTS[mod12(slotIndex)];
	if (!slot.enharmonic) return slot.primary;

	const override = slotSideOverrides[slot.index];
	if (override) {
		if (slot.primary.side === override) return slot.primary;
		if (slot.enharmonic.side === override) return slot.enharmonic;
	}

	if (preference === "sharps") {
		return slot.primary.side === "sharp" ? slot.primary : slot.enharmonic;
	}
	if (preference === "flats") {
		return slot.primary.side === "flat" ? slot.primary : slot.enharmonic;
	}
	return slot.primary;
}

function buildDiatonicChord(
	scaleNotes: string[],
	degreeIndex: number,
	mode: KeyMode,
	slotIndex: number,
): DiatonicChord {
	const degree = degreeIndex + 1;
	const root = scaleNotes[degreeIndex];
	const quality =
		mode === "major"
			? MAJOR_QUALITIES[degreeIndex]
			: MINOR_QUALITIES[degreeIndex];
	const roman =
		mode === "major" ? MAJOR_ROMANS[degreeIndex] : MINOR_ROMANS[degreeIndex];
	const seventhSuffix =
		mode === "major"
			? MAJOR_SEVENTH_SUFFIXES[degreeIndex]
			: MINOR_SEVENTH_SUFFIXES[degreeIndex];
	const functionLabel =
		mode === "major"
			? MAJOR_FUNCTIONS[degreeIndex]
			: MINOR_FUNCTIONS[degreeIndex];

	const triadNotes: [string, string, string] = [
		scaleNotes[degreeIndex],
		scaleNotes[(degreeIndex + 2) % 7],
		scaleNotes[(degreeIndex + 4) % 7],
	];
	const seventhNotes: [string, string, string, string] = [
		...triadNotes,
		scaleNotes[(degreeIndex + 6) % 7],
	];

	return {
		degree,
		roman,
		root,
		quality,
		symbol: formatChordSymbol(root, quality),
		seventhSymbol: `${root}${seventhSuffix}`,
		triadNotes,
		seventhNotes,
		triadMidi: ascendingNotesToMidi(triadNotes) as [number, number, number],
		seventhMidi: ascendingNotesToMidi(seventhNotes) as [
			number,
			number,
			number,
			number,
		],
		circleIndex: mod12(slotIndex + CIRCLE_DEGREE_OFFSETS[degreeIndex]),
		functionLabel,
	};
}

function buildHarmonicMinorV(
	scaleNotes: string[],
	slotIndex: number,
): DiatonicChord {
	const root = scaleNotes[4];
	const raisedSeventh = raiseNoteBySemitone(scaleNotes[6]);
	const third = raisedSeventh;
	const fifth = scaleNotes[1];
	const triadNotes: [string, string, string] = [root, third, fifth];
	const seventhNotes: [string, string, string, string] = [
		root,
		third,
		fifth,
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
		seventhMidi: ascendingNotesToMidi(seventhNotes) as [
			number,
			number,
			number,
			number,
		],
		circleIndex: mod12(slotIndex + 1),
		functionLabel: "Harmonic Dominant · 5th",
	};
}

function raiseNoteBySemitone(note: string): string {
	const letter = note[0];
	const current = noteOffset(note);
	const next = current + 1;
	if (next === 0) return letter;
	if (next === 1) return `${letter}♯`;
	if (next === 2) return `${letter}𝄪`;
	if (next === -1) return `${letter}♭`;
	return note;
}

function lowerNoteBySemitone(note: string): string {
	const letter = note[0];
	const current = noteOffset(note);
	const next = current - 1;
	if (next === 0) return letter;
	if (next === -1) return `${letter}♭`;
	if (next === -2) return `${letter}𝄫`;
	if (next === 1) return `${letter}♯`;
	return note;
}

function findVariantByRoot(
	root: string,
	mode: KeyMode,
): { slotIndex: number; variant: KeyVariant } | null {
	for (const slot of CIRCLE_SLOTS) {
		const candidates = slot.enharmonic
			? [slot.primary, slot.enharmonic]
			: [slot.primary];
		for (const v of candidates) {
			const candidateRoot = mode === "major" ? v.majorRoot : v.minorRoot;
			if (candidateRoot === root) {
				return { slotIndex: slot.index, variant: v };
			}
		}
	}
	return null;
}

function findEnharmonicByPitchClass(
	pc: number,
	mode: KeyMode,
	preferredSide: EnharmonicSide | "neutral",
): { slotIndex: number; variant: KeyVariant; root: string } {
	const matches: { slotIndex: number; variant: KeyVariant; root: string }[] = [];
	for (const slot of CIRCLE_SLOTS) {
		const candidates = slot.enharmonic
			? [slot.primary, slot.enharmonic]
			: [slot.primary];
		for (const v of candidates) {
			const candidateRoot = mode === "major" ? v.majorRoot : v.minorRoot;
			if (noteToPitchClass(candidateRoot) === pc) {
				matches.push({ slotIndex: slot.index, variant: v, root: candidateRoot });
			}
		}
	}
	const sideMatch = matches.find((m) => m.variant.side === preferredSide);
	return sideMatch ?? matches[0];
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
	let signatureDeltaLabel = "";
	if (currentAccCount >= 0 && targetVariant.accidentalsCount > currentAccCount) {
		signatureDeltaLabel = `+${delta}♯`;
	} else if (
		currentAccCount <= 0 &&
		targetVariant.accidentalsCount < currentAccCount
	) {
		signatureDeltaLabel = `+${Math.abs(delta)}♭`;
	} else if (delta === 1) {
		signatureDeltaLabel = "-1♭";
	} else if (delta === -1) {
		signatureDeltaLabel = "-1♯";
	} else {
		signatureDeltaLabel = `${formatShortSignature(currentAccCount)} → ${formatShortSignature(targetVariant.accidentalsCount)}`;
	}

	const shortName = mode === "major" ? targetRoot : `${targetRoot}m`;
	const name = mode === "major" ? `${targetRoot} Major` : `${targetRoot} Minor`;
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
		root: targetRoot,
		shortName,
		name,
		accidentalsCount: targetVariant.accidentalsCount,
		signatureDeltaLabel,
		sharedCount,
		removedNote: currentScaleNotes[removedIdx] ?? "",
		addedNote: targetScaleNotes[addedIdx] ?? "",
		chordRoman,
		chordSymbol: shortName,
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
	const shortName = mode === "major" ? root : `${root}m`;
	const name = mode === "major" ? `${root} Major` : `${root} Minor`;
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

	// Build direct Major & Minor chords sharing this key's root pitch
	const majorRootTriad: [string, string, string] =
		mode === "major"
			? chords[0].triadNotes
			: [
					scaleNotes[0],
					raiseNoteBySemitone(scaleNotes[2]),
					scaleNotes[4],
				];
	const minorRootTriad: [string, string, string] =
		mode === "minor"
			? chords[0].triadNotes
			: [
					scaleNotes[0],
					lowerNoteBySemitone(scaleNotes[2]),
					scaleNotes[4],
				];

	// Parallel key lookup (e.g., C Major <-> C Minor; D♭ Major -> C♯ Minor)
	const parallelMode: KeyMode = mode === "major" ? "minor" : "major";
	const exactParallel = findVariantByRoot(root, parallelMode);
	const parallelMatch =
		exactParallel ??
		findEnharmonicByPitchClass(
			noteToPitchClass(root),
			parallelMode,
			variant.side,
		);
	const parallelRoot =
		parallelMode === "major"
			? parallelMatch.variant.majorRoot
			: parallelMatch.variant.minorRoot;

	// Relative key (same slot, opposite mode)
	const relativeMode: KeyMode = mode === "major" ? "minor" : "major";
	const relativeRoot =
		relativeMode === "major" ? variant.majorRoot : variant.minorRoot;

	// Check if parallel minor/major requires enharmonic respelling (e.g. D♭m -> C♯m)
	const minorSourceCheck =
		mode === "major" && !exactParallel
			? `Respelling of ${root}m (${parallelRoot}m)`
			: undefined;
	const majorSourceCheck =
		mode === "minor" && !exactParallel
			? `Respelling of ${root} (${parallelRoot})`
			: undefined;

	const cleanMajorNotes: [string, string, string] =
		mode === "minor" && !exactParallel
			? (buildScale(parallelRoot, "major").filter((_, i) =>
					[0, 2, 4].includes(i),
				) as [string, string, string])
			: majorRootTriad;

	const cleanMinorNotes: [string, string, string] =
		mode === "major" && !exactParallel
			? (buildScale(parallelRoot, "minor").filter((_, i) =>
					[0, 2, 4].includes(i),
				) as [string, string, string])
			: minorRootTriad;

	const majorDisplaySymbol =
		mode === "minor" && !exactParallel ? parallelRoot : root;
	const minorDisplaySymbol =
		mode === "major" && !exactParallel ? `${parallelRoot}m` : `${root}m`;

	const enharmonicVariant = slot.enharmonic
		? variant === slot.primary
			? slot.enharmonic
			: slot.primary
		: null;

	const enharmonicTwin = enharmonicVariant
		? {
				side: enharmonicVariant.side as EnharmonicSide,
				root:
					mode === "major"
						? enharmonicVariant.majorRoot
						: enharmonicVariant.minorRoot,
				shortName:
					mode === "major"
						? enharmonicVariant.majorRoot
						: `${enharmonicVariant.minorRoot}m`,
				name:
					mode === "major"
						? `${enharmonicVariant.majorRoot} Major`
						: `${enharmonicVariant.minorRoot} Minor`,
				accidentalsCount: enharmonicVariant.accidentalsCount,
			}
		: null;

	return {
		slotIndex: idx,
		mode,
		root,
		shortName,
		name,
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
				symbol: majorDisplaySymbol,
				notes: cleanMajorNotes,
				midi: ascendingNotesToMidi(cleanMajorNotes) as [
					number,
					number,
					number,
				],
				noteLabel: majorSourceCheck,
			},
			minor: {
				symbol: minorDisplaySymbol,
				notes: cleanMinorNotes,
				midi: ascendingNotesToMidi(cleanMinorNotes) as [
					number,
					number,
					number,
				],
				noteLabel: minorSourceCheck,
			},
		},
		relativeKey: {
			slotIndex: idx,
			mode: relativeMode,
			root: relativeRoot,
			shortName: relativeMode === "major" ? relativeRoot : `${relativeRoot}m`,
			name:
				relativeMode === "major"
					? `${relativeRoot} Major`
					: `${relativeRoot} Minor`,
		},
		parallelKey: {
			slotIndex: parallelMatch.slotIndex,
			mode: parallelMode,
			root: parallelRoot,
			shortName: parallelMode === "major" ? parallelRoot : `${parallelRoot}m`,
			name:
				parallelMode === "major"
					? `${parallelRoot} Major`
					: `${parallelRoot} Minor`,
			isEnharmonic: !exactParallel,
		},
		enharmonicTwin,
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
		progressions: mode === "major" ? MAJOR_PROGRESSIONS : MINOR_PROGRESSIONS,
	};
}
