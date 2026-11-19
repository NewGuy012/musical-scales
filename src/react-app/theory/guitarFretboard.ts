import {
	ChordQuality,
	DiatonicChord,
	FLAT_CHROMATIC,
	KeyMode,
	LETTERS,
	NATURAL_PC,
	SHARP_CHROMATIC,
	ascendingNotesToMidi,
	buildScale,
	mod12,
	noteOffset,
	noteToPitchClass,
	spellNoteOffset,
} from "./circleOfFifths";

export type FretboardOverlayMode =
	"voicing" | "chordTones" | "pentatonic" | "scale";

type PentatonicKind = "major" | "minor" | "diminished";
export type PentatonicScope = "auto" | "key" | "chord";

export type GuitarStopTechnique =
	| "normal"
	| "harmonic"
	| "hammer"
	| "pull"
	| "slide"
	| "palmMute"
	| "letRing"
	| "staccato";

export interface GuitarSongStop {
	stringIndex: number;
	fret: number;
	technique?: GuitarStopTechnique;
}

export type GuitarChordKind =
	| "major"
	| "minor"
	| "diminished"
	| "aug"
	| "7"
	| "maj7"
	| "m7"
	| "m7♭5"
	| "dim7"
	| "add9"
	| "madd9"
	| "sus4"
	| "sus2";

interface ChordVariationSpec {
	kind: GuitarChordKind;
	label: string;
	suffix: string;
	quality: ChordQuality;
	formula: string;
	description: string;
}

export const CHORD_VARIATION_SPECS: readonly ChordVariationSpec[] = [
	{
		kind: "major",
		label: "Maj",
		suffix: "",
		quality: "major",
		formula: "1 · 3 · 5",
		description: "Major triad",
	},
	{
		kind: "minor",
		label: "m",
		suffix: "m",
		quality: "minor",
		formula: "1 · ♭3 · 5",
		description: "Minor triad",
	},
	{
		kind: "7",
		label: "7",
		suffix: "7",
		quality: "major",
		formula: "1 · 3 · 5 · ♭7",
		description: "Dominant 7th",
	},
	{
		kind: "maj7",
		label: "maj7",
		suffix: "maj7",
		quality: "major",
		formula: "1 · 3 · 5 · 7",
		description: "Major 7th",
	},
	{
		kind: "m7",
		label: "m7",
		suffix: "m7",
		quality: "minor",
		formula: "1 · ♭3 · 5 · ♭7",
		description: "Minor 7th",
	},
	{
		kind: "diminished",
		label: "dim",
		suffix: "°",
		quality: "diminished",
		formula: "1 · ♭3 · ♭5",
		description: "Diminished triad",
	},
	{
		kind: "dim7",
		label: "dim7",
		suffix: "dim7",
		quality: "diminished",
		formula: "1 · ♭3 · ♭5 · 𝄫7",
		description: "Full diminished 7th",
	},
	{
		kind: "m7♭5",
		label: "m7♭5",
		suffix: "m7♭5",
		quality: "diminished",
		formula: "1 · ♭3 · ♭5 · ♭7",
		description: "Half-diminished 7th",
	},
	{
		kind: "aug",
		label: "aug",
		suffix: "aug",
		quality: "major",
		formula: "1 · 3 · ♯5",
		description: "Augmented triad",
	},
	{
		kind: "add9",
		label: "add9",
		suffix: "add9",
		quality: "major",
		formula: "1 · 3 · 5 · 9",
		description: "Major triad with added 9th",
	},
	{
		kind: "madd9",
		label: "m(add9)",
		suffix: "m(add9)",
		quality: "minor",
		formula: "1 · ♭3 · 5 · 9",
		description: "Minor triad with added 9th",
	},
	{
		kind: "sus4",
		label: "sus4",
		suffix: "sus4",
		quality: "major",
		formula: "1 · 4 · 5",
		description: "Suspended 4th",
	},
	{
		kind: "sus2",
		label: "sus2",
		suffix: "sus2",
		quality: "major",
		formula: "1 · 2 · 5",
		description: "Suspended 2nd",
	},
];

export const CHORD_VARIATION_BY_KIND = Object.fromEntries(
	CHORD_VARIATION_SPECS.map((spec) => [spec.kind, spec]),
) as Record<GuitarChordKind, ChordVariationSpec>;

type FretTuple = [number, number, number, number, number, number];

interface GuitarStringInfo {
	stringNumber: 6 | 5 | 4 | 3 | 2 | 1; // 6 = low E, 1 = high e
	label: string;
	openMidi: number;
	openPc: number;
}

interface GuitarVoicingNote {
	stringIndex: number; // 0 (low E) .. 5 (high e)
	fret: number; // -1 = muted, 0 = open, 1..15 = fretted
	midi: number | null;
	pc: number | null;
	intervalLabel: string;
	noteName: string | null;
}

export interface GuitarVoicing {
	id: string;
	name: string;
	positionLabel: string;
	baseFret: number;
	frets: FretTuple;
	notes: GuitarVoicingNote[];
	soundingMidi: number[];
}

// Standard tuning E2 A2 D3 G3 B3 E4 (ordered 6th string -> 1st string)
export const STANDARD_TUNING: GuitarStringInfo[] = [
	{ stringNumber: 6, label: "E", openMidi: 40, openPc: 4 },
	{ stringNumber: 5, label: "A", openMidi: 45, openPc: 9 },
	{ stringNumber: 4, label: "D", openMidi: 50, openPc: 2 },
	{ stringNumber: 3, label: "G", openMidi: 55, openPc: 7 },
	{ stringNumber: 2, label: "B", openMidi: 59, openPc: 11 },
	{ stringNumber: 1, label: "e", openMidi: 64, openPc: 4 },
];

export const MAX_GUITAR_FRET = 15;
export const MAX_SONG_GUITAR_FRET = 22;
export const DEFAULT_GUITAR_TUNING_MIDI: readonly number[] =
	STANDARD_TUNING.map((s) => s.openMidi);

export const CHORD_INTERVAL_MAP: Record<
	GuitarChordKind,
	Record<number, string>
> = {
	major: { 0: "R", 4: "3", 7: "5" },
	minor: { 0: "R", 3: "♭3", 7: "5" },
	diminished: { 0: "R", 3: "♭3", 6: "♭5" },
	aug: { 0: "R", 4: "3", 8: "♯5" },
	maj7: { 0: "R", 4: "3", 7: "5", 11: "7" },
	m7: { 0: "R", 3: "♭3", 7: "5", 10: "♭7" },
	"7": { 0: "R", 4: "3", 7: "5", 10: "♭7" },
	"m7♭5": { 0: "R", 3: "♭3", 6: "♭5", 10: "♭7" },
	dim7: { 0: "R", 3: "♭3", 6: "♭5", 9: "𝄫7" },
	add9: { 0: "R", 4: "3", 7: "5", 2: "9" },
	madd9: { 0: "R", 3: "♭3", 7: "5", 2: "9" },
	sus4: { 0: "R", 5: "4", 7: "5" },
	sus2: { 0: "R", 2: "2", 7: "5" },
};

const OPEN_SHAPES: Partial<
	Record<GuitarChordKind, Partial<Record<number, [string, string, FretTuple]>>>
> = {
	major: {
		0: ["open-c", "Open C", [-1, 3, 2, 0, 1, 0]],
		9: ["open-a", "Open A", [-1, 0, 2, 2, 2, 0]],
		7: ["open-g", "Open G", [3, 2, 0, 0, 0, 3]],
		4: ["open-e", "Open E", [0, 2, 2, 1, 0, 0]],
		2: ["open-d", "Open D", [-1, -1, 0, 2, 3, 2]],
		5: ["compact-f", "Compact F", [-1, -1, 3, 2, 1, 1]],
	},
	minor: {
		4: ["open-em", "Open Em", [0, 2, 2, 0, 0, 0]],
		9: ["open-am", "Open Am", [-1, 0, 2, 2, 1, 0]],
		2: ["open-dm", "Open Dm", [-1, -1, 0, 2, 3, 1]],
	},
	aug: {
		0: ["open-caug", "Open Caug", [-1, 3, 2, 1, 1, 0]],
		4: ["open-eaug", "Open Eaug", [0, 3, 2, 1, 1, 0]],
		7: ["open-gaug", "Open Gaug", [3, 2, 1, 0, 0, 3]],
		9: ["open-aaug", "Open Aaug", [-1, 0, 3, 2, 2, 1]],
		2: ["open-daug", "Open Daug", [-1, -1, 0, 3, 3, 2]],
	},
	"7": {
		4: ["open-e7", "Open E7", [0, 2, 0, 1, 0, 0]],
		9: ["open-a7", "Open A7", [-1, 0, 2, 0, 2, 0]],
		2: ["open-d7", "Open D7", [-1, -1, 0, 2, 1, 2]],
		7: ["open-g7", "Open G7", [3, 2, 0, 0, 0, 1]],
		0: ["open-c7", "Open C7", [-1, 3, 2, 3, 1, 0]],
		11: ["open-b7", "Open B7", [-1, 2, 1, 2, 0, 2]],
	},
	maj7: {
		0: ["open-cmaj7", "Open Cmaj7", [-1, 3, 2, 0, 0, 0]],
		5: ["open-fmaj7", "Open Fmaj7", [-1, -1, 3, 2, 1, 0]],
		7: ["open-gmaj7", "Open Gmaj7", [3, 2, 0, 0, 0, 2]],
		2: ["open-dmaj7", "Open Dmaj7", [-1, -1, 0, 2, 2, 2]],
		9: ["open-amaj7", "Open Amaj7", [-1, 0, 2, 1, 2, 0]],
		4: ["open-emaj7", "Open Emaj7", [0, 2, 1, 1, 0, 0]],
	},
	m7: {
		4: ["open-em7", "Open Em7", [0, 2, 0, 0, 0, 0]],
		9: ["open-am7", "Open Am7", [-1, 0, 2, 0, 1, 0]],
		2: ["open-dm7", "Open Dm7", [-1, -1, 0, 2, 1, 1]],
	},
	dim7: {
		2: ["open-ddim7", "Open Ddim7", [-1, -1, 0, 1, 0, 1]],
		9: ["open-adim7", "Open Adim7", [-1, 0, 1, 2, 1, 2]],
		4: ["open-edim7", "Open Edim7", [0, 1, 2, 0, 2, 0]],
	},
	add9: {
		0: ["open-cadd9", "Open Cadd9", [-1, 3, 2, 0, 3, 0]],
		7: ["open-gadd9", "Open Gadd9", [3, 2, 0, 2, 0, 3]],
		4: ["open-eadd9", "Open Eadd9", [0, 2, 4, 1, 0, 0]],
		9: ["open-aadd9", "Open Aadd9", [-1, 0, 2, 4, 2, 0]],
	},
	madd9: {
		4: ["open-emadd9", "Open Em(add9)", [0, 2, 4, 0, 0, 0]],
		9: ["open-amadd9", "Open Am(add9)", [-1, 0, 2, 4, 1, 0]],
	},
	sus4: {
		2: ["open-dsus4", "Open Dsus4", [-1, -1, 0, 2, 3, 3]],
		9: ["open-asus4", "Open Asus4", [-1, 0, 2, 2, 3, 0]],
		4: ["open-esus4", "Open Esus4", [0, 2, 2, 2, 0, 0]],
		7: ["open-gsus4", "Open Gsus4", [3, 3, 0, 0, 1, 3]],
		0: ["open-csus4", "Open Csus4", [-1, 3, 3, 0, 1, 1]],
	},
	sus2: {
		2: ["open-dsus2", "Open Dsus2", [-1, -1, 0, 2, 3, 0]],
		9: ["open-asus2", "Open Asus2", [-1, 0, 2, 2, 0, 0]],
		0: ["open-csus2", "Open Csus2", [-1, 3, 0, 0, 3, 3]],
		7: ["open-gsus2", "Open Gsus2", [3, 0, 0, 2, 3, 3]],
		4: ["open-esus2", "Open Esus2", [0, 2, 4, 4, 0, 0]],
	},
};

const DEGREE_ALTERATIONS: Record<GuitarChordKind, readonly [number, number][]> =
	{
		major: [
			[0, 0],
			[2, 0],
			[4, 0],
		],
		minor: [
			[0, 0],
			[2, -1],
			[4, 0],
		],
		diminished: [
			[0, 0],
			[2, -1],
			[4, -1],
		],
		aug: [
			[0, 0],
			[2, 0],
			[4, 1],
		],
		"7": [
			[0, 0],
			[2, 0],
			[4, 0],
			[6, -1],
		],
		maj7: [
			[0, 0],
			[2, 0],
			[4, 0],
			[6, 0],
		],
		m7: [
			[0, 0],
			[2, -1],
			[4, 0],
			[6, -1],
		],
		"m7♭5": [
			[0, 0],
			[2, -1],
			[4, -1],
			[6, -1],
		],
		dim7: [
			[0, 0],
			[2, -1],
			[4, -1],
			[6, -2],
		],
		add9: [
			[0, 0],
			[2, 0],
			[4, 0],
			[1, 0],
		],
		madd9: [
			[0, 0],
			[2, -1],
			[4, 0],
			[1, 0],
		],
		sus4: [
			[0, 0],
			[3, 0],
			[4, 0],
		],
		sus2: [
			[0, 0],
			[1, 0],
			[4, 0],
		],
	};

export function buildChordVariation(
	rootNote: string,
	kind: GuitarChordKind,
	preferFlats = rootNote.includes("♭"),
): {
	symbol: string;
	quality: ChordQuality;
	guitarKind: GuitarChordKind;
	notes: string[];
	midi: number[];
} {
	const spec = CHORD_VARIATION_BY_KIND[kind] ?? CHORD_VARIATION_SPECS[0];
	const majorScale = buildScale(rootNote, "major");
	const fallbackPalette =
		preferFlats || rootNote.includes("♭") ? FLAT_CHROMATIC : SHARP_CHROMATIC;

	const notes = DEGREE_ALTERATIONS[kind].map(([degIdx, delta]) => {
		const baseNote = majorScale[degIdx];
		const nextOffset = noteOffset(baseNote) + delta;
		const targetPc = mod12(noteToPitchClass(baseNote) + delta);
		return (
			(Math.abs(nextOffset) <= 1
				? spellNoteOffset(baseNote[0], nextOffset)
				: null) ?? fallbackPalette[targetPc]
		);
	});

	return {
		symbol: `${rootNote}${spec.suffix}`,
		quality: spec.quality,
		guitarKind: kind,
		notes,
		midi: ascendingNotesToMidi(notes),
	};
}

export function inferGuitarChordKind(
	chord: DiatonicChord | null,
	quality: ChordQuality,
	isSeventh: boolean,
): GuitarChordKind {
	if (!isSeventh || !chord) return quality;
	if (chord.seventhSymbol.endsWith("maj7")) return "maj7";
	if (chord.seventhSymbol.endsWith("m7♭5")) return "m7♭5";
	if (chord.seventhSymbol.endsWith("m7")) return "m7";
	if (chord.seventhSymbol.endsWith("7")) return "7";
	return quality;
}

/**
 * Resolves any pitch class to a spelled note name, preferring chord tones first,
 * then scale degrees, then chromatic sharp/flat fallback.
 */
export function createPitchClassNameResolver(
	chordNotes: string[],
	scaleNotes: string[],
	preferFlats: boolean,
): (pc: number) => string {
	const map = new Map<number, string>();
	for (const n of scaleNotes) map.set(noteToPitchClass(n), n);
	for (const n of chordNotes) map.set(noteToPitchClass(n), n);
	const fallback = preferFlats ? FLAT_CHROMATIC : SHARP_CHROMATIC;
	return (pc: number) => {
		const norm = mod12(pc);
		return map.get(norm) ?? fallback[norm];
	};
}

export function getIntervalLabel(
	rootPc: number,
	targetPc: number,
	kind: GuitarChordKind,
): string | null {
	return CHORD_INTERVAL_MAP[kind][mod12(targetPc - rootPc)] ?? null;
}

function offsetFrets(template: FretTuple, offset: number): FretTuple {
	return template.map((f) => (f < 0 ? -1 : f + offset)) as FretTuple;
}

function movableFret(rootPc: number, openPc: number, minFret = 1): number {
	const raw = mod12(rootPc - openPc);
	return raw < minFret ? raw + 12 : raw;
}

function buildVoicing(
	id: string,
	name: string,
	frets: FretTuple,
	rootPc: number,
	kind: GuitarChordKind,
	resolveNoteName: (pc: number) => string,
): GuitarVoicing | null {
	if (frets.some((f) => f < -1)) return null;
	const nonZeroFrets = frets.filter((f) => f > 0);
	const maxFret = Math.max(0, ...frets);
	if (maxFret > MAX_GUITAR_FRET) return null;

	if (nonZeroFrets.length > 0) {
		const minNonZero = Math.min(...nonZeroFrets);
		if (Math.max(...nonZeroFrets) - minNonZero > 4) return null;
	}

	const hasOpen = frets.includes(0);
	const minFret = nonZeroFrets.length > 0 ? Math.min(...nonZeroFrets) : 0;
	const baseFret = hasOpen && minFret <= 4 ? 0 : minFret;

	const notes: GuitarVoicingNote[] = frets.map((fret, stringIndex) => {
		if (fret < 0) {
			return {
				stringIndex,
				fret,
				midi: null,
				pc: null,
				intervalLabel: "×",
				noteName: null,
			};
		}
		const info = STANDARD_TUNING[stringIndex];
		const midi = info.openMidi + fret;
		const pc = mod12(info.openPc + fret);
		return {
			stringIndex,
			fret,
			midi,
			pc,
			intervalLabel: getIntervalLabel(rootPc, pc, kind) ?? "?",
			noteName: resolveNoteName(pc),
		};
	});

	return {
		id,
		name,
		positionLabel: baseFret === 0 ? "Open" : `Fret ${baseFret}`,
		baseFret,
		frets,
		notes,
		soundingMidi: notes
			.filter((n): n is GuitarVoicingNote & { midi: number } => n.midi !== null)
			.map((n) => n.midi),
	};
}

export function getGuitarVoicings(
	rootNote: string,
	kind: GuitarChordKind,
	chordNotes: string[],
	preferFlats = false,
): GuitarVoicing[] {
	const rootPc = noteToPitchClass(rootNote);
	const resolveName = createPitchClassNameResolver(chordNotes, [], preferFlats);
	const candidates: [string, string, FretTuple][] = [];

	const openMatch = OPEN_SHAPES[kind]?.[rootPc];
	if (openMatch) candidates.push(openMatch);

	const addShape = (
		id: string,
		name: string,
		template: FretTuple,
		offset: number,
	) => {
		if (offset >= 0) {
			candidates.push([id, name, offsetFrets(template, offset)]);
		}
	};

	const f6 = movableFret(rootPc, 4, 1);
	const f5 = movableFret(rootPc, 9, 1);
	const f4 = movableFret(rootPc, 2, 1);
	const d6 = mod12(rootPc - 4);
	const d5 = mod12(rootPc - 9);
	const d4 = mod12(rootPc - 2);

	switch (kind) {
		case "major":
			addShape("e-shape", "E-Shape Barre", [0, 2, 2, 1, 0, 0], f6);
			addShape("a-shape", "A-Shape Barre", [-1, 0, 2, 2, 2, 0], f5);
			addShape(
				"c-shape",
				"C-Shape",
				[-1, 3, 2, 0, 1, 0],
				movableFret(rootPc, 0, 1),
			);
			addShape(
				"g-shape",
				"G-Shape",
				[3, 2, 0, 0, 0, -1],
				movableFret(rootPc, 7, 1),
			);
			addShape("d-shape", "D-Shape Upper", [-1, -1, 0, 2, 3, 2], f4);
			break;
		case "minor":
			addShape("em-shape", "Em-Shape Barre", [0, 2, 2, 0, 0, 0], f6);
			addShape("am-shape", "Am-Shape Barre", [-1, 0, 2, 2, 1, 0], f5);
			addShape("cm-shape", "Cm-Shape", [-1, 3, 1, 0, 1, -1], mod12(rootPc));
			addShape("gm-shape", "Gm-Shape", [3, 1, 0, 0, -1, -1], mod12(rootPc - 7));
			addShape("dm-shape", "Dm-Shape Upper", [-1, -1, 0, 2, 3, 1], f4);
			break;
		case "7":
			addShape("e7-shape", "E7-Shape Barre", [0, 2, 0, 1, 0, 0], f6);
			addShape("a7-shape", "A7-Shape Barre", [-1, 0, 2, 0, 2, 0], f5);
			addShape(
				"c7-shape",
				"C7-Shape",
				[-1, 3, 2, 3, 1, -1],
				movableFret(rootPc, 0, 1),
			);
			addShape("d7-shape", "D7-Shape Upper", [-1, -1, 0, 2, 1, 2], f4);
			break;
		case "maj7":
			addShape("shell6-maj7", "6th-Str Maj7", [0, -1, 1, 1, 0, -1], f6);
			addShape("a-maj7-shape", "A-Shape Maj7", [-1, 0, 2, 1, 2, 0], f5);
			addShape("d-maj7-shape", "D-Shape Maj7", [-1, -1, 0, 2, 2, 2], f4);
			break;
		case "m7":
			addShape("em7-shape", "Em7-Shape Barre", [0, 2, 0, 0, 0, 0], f6);
			addShape("shell6-m7", "6th-Str Jazz m7", [0, -1, 0, 0, 0, -1], f6);
			addShape("am7-shape", "Am7-Shape Barre", [-1, 0, 2, 0, 1, 0], f5);
			addShape("dm7-shape", "Dm7-Shape Upper", [-1, -1, 0, 2, 1, 1], f4);
			break;
		case "diminished":
			addShape("dim-6", "6th-Str Dim", [0, 1, 2, 0, -1, -1], d6);
			addShape("dim-5", "5th-Str Dim", [-1, 0, 1, 2, 1, -1], d5);
			addShape("dim-4", "4th-Str Dim", [-1, -1, 0, 1, 3, 1], d4);
			addShape("dim-6-hi", "6th-Str High", [0, 1, 2, 0, -1, -1], d6 + 12);
			addShape("dim-5-hi", "5th-Str High", [-1, 0, 1, 2, 1, -1], d5 + 12);
			break;
		case "m7♭5":
			addShape("halfdim-6", "6th-Str m7♭5", [1, -1, 1, 1, 0, -1], f6 - 1);
			addShape("halfdim-5", "5th-Str m7♭5", [-1, 0, 1, 0, 1, -1], d5);
			addShape("halfdim-4", "4th-Str m7♭5", [-1, -1, 0, 1, 1, 1], d4);
			addShape("halfdim-5-hi", "5th-Str High", [-1, 0, 1, 0, 1, -1], d5 + 12);
			break;
		case "aug":
			addShape("aug-6", "6th-Str Aug", [0, -1, 2, 1, 1, -1], f6);
			addShape("aug-5", "5th-Str Aug", [-1, 0, 3, 2, 2, -1], f5);
			addShape("aug-4", "4th-Str Aug", [-1, -1, 0, 3, 3, 2], f4);
			addShape("aug-5-comp", "5th-Str Close", [-1, 2, 1, 0, 0, -1], f5 - 2);
			addShape("aug-4-comp", "4th-Str Close", [-1, -1, 2, 1, 1, 0], f4 - 2);
			break;
		case "dim7":
			addShape("dim7-6", "6th-Str Dim7", [1, -1, 0, 1, 0, -1], f6 - 1);
			addShape("dim7-5", "5th-Str Dim7", [-1, 1, 2, 0, 2, -1], f5 - 1);
			addShape("dim7-4", "4th-Str Dim7", [-1, -1, 0, 1, 0, 1], f4);
			addShape("dim7-6-hi", "6th-Str High", [1, -1, 0, 1, 0, -1], f6 + 11);
			addShape("dim7-5-hi", "5th-Str High", [-1, 1, 2, 0, 2, -1], f5 + 11);
			break;
		case "add9": {
			const f4Add = f4 >= 2 ? f4 : f4 + 12;
			addShape("add9-6", "6th-Str Add9", [0, -1, 2, 1, 0, 2], f6);
			addShape("add9-5", "5th-Str Add9", [-1, 1, 0, 3, 1, 1], f5 - 1);
			addShape("add9-5-c", "C-Shape Add9", [-1, 3, 2, 0, 3, -1], f5 - 3);
			addShape("add9-5-spread", "5th-Str Spread", [-1, 0, 2, 4, 2, -1], f5);
			addShape("add9-6-spread", "6th-Str Spread", [0, 2, 4, 1, 0, -1], f6);
			addShape(
				f4 >= 2 ? "add9-4" : "add9-4-hi",
				f4 >= 2 ? "4th-Str Add9" : "4th-Str High",
				[-1, -1, 2, 1, 0, 2],
				f4Add - 2,
			);
			break;
		}
		case "madd9": {
			const f4Madd = f4 >= 2 ? f4 : f4 + 12;
			addShape("madd9-6", "6th-Str m(add9)", [0, -1, 2, 0, 0, 2], f6);
			addShape("madd9-5", "5th-Str m(add9)", [-1, 2, 0, 4, 2, 2], f5 - 2);
			addShape("madd9-5-spread", "5th-Str Spread", [-1, 0, 2, 4, 1, -1], f5);
			addShape("madd9-6-spread", "6th-Str Spread", [0, 2, 4, 0, 0, -1], f6);
			addShape(
				f4 >= 2 ? "madd9-4" : "madd9-4-hi",
				f4 >= 2 ? "4th-Str m(add9)" : "4th-Str High",
				[-1, -1, 2, 0, 0, 2],
				f4Madd - 2,
			);
			break;
		}
		case "sus4":
			addShape("sus4-6", "6th-Str Sus4", [0, 2, 2, 2, 0, 0], f6);
			addShape("sus4-5", "5th-Str Sus4", [-1, 0, 2, 2, 3, 0], f5);
			addShape("sus4-4", "4th-Str Sus4", [-1, -1, 0, 2, 3, 3], f4);
			break;
		case "sus2":
			addShape("sus2-6", "6th-Str Sus2", [1, -1, 3, 0, 1, 1], f6 - 1);
			addShape("sus2-5", "5th-Str Sus2", [-1, 0, 2, 2, 0, 0], f5);
			addShape("sus2-4", "4th-Str Sus2", [-1, -1, 0, 2, 3, 0], f4);
			addShape("sus2-6-power", "6th-Str Open-Top", [0, 2, 4, 4, -1, -1], f6);
			break;
	}

	const seenFrets = new Set<string>();
	const built: GuitarVoicing[] = [];

	for (const [id, name, frets] of candidates) {
		const key = frets.join(",");
		if (seenFrets.has(key)) continue;
		const voicing = buildVoicing(id, name, frets, rootPc, kind, resolveName);
		if (voicing) {
			seenFrets.add(key);
			built.push(voicing);
		}
	}

	return built.sort((a, b) => a.baseFret - b.baseFret);
}

const CHROMATIC_DEGREES_SHARP = [
	"1",
	"♭2",
	"2",
	"♭3",
	"3",
	"4",
	"♯4",
	"5",
	"♯5",
	"6",
	"♭7",
	"7",
] as const;

const CHROMATIC_DEGREES_FLAT = [
	"1",
	"♭2",
	"2",
	"♭3",
	"3",
	"4",
	"♭5",
	"5",
	"♭6",
	"6",
	"♭7",
	"7",
] as const;

interface ChromaticPassingPhrase {
	id: string;
	label: string;
	tag: string;
	notes: string[];
	midi: number[];
	tip: string;
}

interface GuitarScalePassGuide {
	pentatonicRoot: string;
	pentatonicRootPc: number;
	pentatonicKind: PentatonicKind;
	pentatonicName: string;
	relativeTwinName: string;
	formula: string;
	degrees: string[];
	pentatonicNotes: string[];
	pentatonicPcs: number[];
	pentatonicMidi: number[];
	omittedSummary: string;
	cagedBoxTip: string;
	activeScope: "key" | "chord";
	hasDistinctChordPentatonic: boolean;
	keyPentatonicName: string;
	chordPentatonicName: string;
	chordIsNonDiatonic: boolean;
	overlayPassingPcs: number[];
	passingPhrases: ChromaticPassingPhrase[];
}

export function getChromaticDegreeLabel(
	rootPc: number,
	targetPc: number,
	preferFlats: boolean,
): string {
	const semi = mod12(targetPc - rootPc);
	return (preferFlats ? CHROMATIC_DEGREES_FLAT : CHROMATIC_DEGREES_SHARP)[semi];
}

function resolveRelativeRoot(
	rootNote: string,
	targetKind: "minor" | "major",
	fallbackPalette: readonly string[],
): string {
	const rootPc = noteToPitchClass(rootNote);
	const targetPc =
		targetKind === "minor" ? mod12(rootPc - 3) : mod12(rootPc + 3);
	const letterIdx = LETTERS.indexOf(rootNote[0] as (typeof LETTERS)[number]);
	if (letterIdx !== -1) {
		const targetLetter =
			LETTERS[(letterIdx + (targetKind === "minor" ? 5 : 2)) % 7];
		let diff = mod12(targetPc - NATURAL_PC[targetLetter]);
		if (diff > 6) diff -= 12;
		const spelled =
			Math.abs(diff) <= 1 ? spellNoteOffset(targetLetter, diff) : null;
		if (spelled) return spelled;
	}
	return fallbackPalette[targetPc];
}

const PENTATONIC_SPECS: Record<
	PentatonicKind,
	{
		intervals: readonly number[];
		degrees: readonly string[];
		formula: string;
		label: string;
	}
> = {
	major: {
		intervals: [0, 2, 4, 7, 9],
		degrees: ["1", "2", "3", "5", "6"],
		formula: "1 · 2 · 3 · 5 · 6",
		label: "Major Pentatonic",
	},
	minor: {
		intervals: [0, 3, 5, 7, 10],
		degrees: ["1", "♭3", "4", "5", "♭7"],
		formula: "1 · ♭3 · 4 · 5 · ♭7",
		label: "Minor Pentatonic",
	},
	diminished: {
		intervals: [0, 3, 5, 6, 10],
		degrees: ["1", "♭3", "4", "♭5", "♭7"],
		formula: "1 · ♭3 · 4 · ♭5 · ♭7",
		label: "Minor-♭5 Pentatonic",
	},
};

function getPentatonicPocketHint(
	pentatonicRootPc: number,
	pentatonicKind: PentatonicKind,
	selectedVoicing: GuitarVoicing | null,
): string {
	const voicingFrets = selectedVoicing?.frets.filter((f) => f >= 0) ?? [0, 3];
	const nonZero = voicingFrets.filter((f) => f > 0);
	const vMin =
		selectedVoicing && selectedVoicing.baseFret === 0
			? 0
			: nonZero.length > 0
				? Math.min(...nonZero)
				: 0;
	const vMax = nonZero.length > 0 ? Math.max(...nonZero) : 3;
	const targetMid = (vMin + vMax) / 2;

	if (pentatonicKind === "diminished") {
		const winStart = vMin;
		const winEnd = Math.min(MAX_GUITAR_FRET, Math.max(winStart + 3, vMax));
		return `Frets ${winStart}–${winEnd} (frames around ${
			selectedVoicing?.name ?? "chord grip"
		})`;
	}

	const relMajorPc =
		pentatonicKind === "major" ? pentatonicRootPc : mod12(pentatonicRootPc + 3);

	const boxDefs = [
		{ offset: 0, maj: "C-Shape Pocket", min: "Minor Box 4 (5th-Str Root)" },
		{ offset: 2, maj: "A-Shape Pocket", min: "Minor Box 5" },
		{
			offset: 5,
			maj: "G-Shape / Rel. Minor Box 1",
			min: "Minor Box 1 (6th-Str Root)",
		},
		{ offset: 7, maj: "E-Shape Pocket", min: "Minor Box 2" },
		{ offset: 10, maj: "D-Shape Pocket", min: "Minor Box 3" },
	] as const;

	let best: { start: number; end: number; label: string; dist: number } | null =
		null;

	for (const def of boxDefs) {
		const baseStart = mod12(relMajorPc + def.offset);
		const candidates = [baseStart];
		if (baseStart + 12 + 3 <= MAX_GUITAR_FRET) {
			candidates.push(baseStart + 12);
		}
		for (const start of candidates) {
			const end = start + 3;
			if (end > MAX_GUITAR_FRET) continue;
			const mid = (start + end) / 2;
			const dist = Math.abs(mid - targetMid);
			if (!best || dist < best.dist) {
				best = {
					start,
					end,
					label: pentatonicKind === "major" ? def.maj : def.min,
					dist,
				};
			}
		}
	}

	if (!best) return "Frets 0–3 (Open Position)";
	return `Frets ${best.start}–${best.end} (${best.label})`;
}

export function buildGuitarScalePassGuide(params: {
	keyRootNote: string;
	keyMode: KeyMode;
	scaleNotes: string[];
	chordRootNote: string;
	chordQuality: ChordQuality;
	chordKind: GuitarChordKind | null;
	chordNotes: string[];
	selectedVoicing: GuitarVoicing | null;
	scope: PentatonicScope;
	overlayMode: FretboardOverlayMode;
	preferFlats: boolean;
}): GuitarScalePassGuide {
	const {
		keyRootNote,
		keyMode,
		scaleNotes,
		chordRootNote,
		chordQuality,
		chordKind,
		chordNotes,
		selectedVoicing,
		scope,
		overlayMode,
		preferFlats,
	} = params;

	const resolveName = createPitchClassNameResolver(
		chordNotes,
		scaleNotes,
		preferFlats,
	);
	const fallbackPalette = preferFlats ? FLAT_CHROMATIC : SHARP_CHROMATIC;

	const scalePcs = scaleNotes.map(noteToPitchClass);
	const scalePcSet = new Set(scalePcs);
	const chordPcs = chordNotes.map(noteToPitchClass);
	const chordPcSet = new Set(chordPcs);
	const chordIsNonDiatonic = chordPcs.some((pc) => !scalePcSet.has(pc));

	const keyPentRoot = scaleNotes[0] ?? keyRootNote;
	const keyPentKind: PentatonicKind = keyMode === "minor" ? "minor" : "major";
	const chordPentRoot = chordRootNote || chordNotes[0] || keyPentRoot;
	const chordPentKind: PentatonicKind =
		chordQuality === "minor"
			? "minor"
			: chordQuality === "diminished"
				? "diminished"
				: "major";

	const hasDistinctChordPentatonic =
		noteToPitchClass(chordPentRoot) !== noteToPitchClass(keyPentRoot) ||
		chordPentKind !== keyPentKind;

	const activeScope: "key" | "chord" =
		scope === "auto"
			? chordIsNonDiatonic
				? "chord"
				: "key"
			: hasDistinctChordPentatonic
				? scope
				: "key";

	const pentatonicRoot = activeScope === "chord" ? chordPentRoot : keyPentRoot;
	const pentatonicKind = activeScope === "chord" ? chordPentKind : keyPentKind;
	const pentatonicRootPc = noteToPitchClass(pentatonicRoot);
	const spec = PENTATONIC_SPECS[pentatonicKind];

	const pentatonicPcs = spec.intervals.map((semi) =>
		mod12(pentatonicRootPc + semi),
	);
	const pentatonicNotes =
		activeScope === "key" && scaleNotes.length === 7
			? keyMode === "major"
				? [0, 1, 2, 4, 5].map((idx) => scaleNotes[idx])
				: [0, 2, 3, 4, 6].map((idx) => scaleNotes[idx])
			: pentatonicPcs.map((pc) => resolveName(pc));

	const pentatonicMidi = ascendingNotesToMidi(pentatonicNotes, 48, true);
	const pentatonicName = `${pentatonicRoot} ${spec.label}`;
	const keyPentatonicName = `${keyPentRoot} ${PENTATONIC_SPECS[keyPentKind].label}`;
	const chordPentatonicName = `${chordPentRoot} ${PENTATONIC_SPECS[chordPentKind].label}`;

	let relativeTwinName: string;
	if (pentatonicKind === "major") {
		const relMinor =
			activeScope === "key" && scaleNotes.length === 7
				? scaleNotes[5]
				: resolveRelativeRoot(pentatonicRoot, "minor", fallbackPalette);
		relativeTwinName = `${relMinor} Minor Pentatonic`;
	} else if (pentatonicKind === "minor") {
		const relMajor =
			activeScope === "key" && scaleNotes.length === 7
				? scaleNotes[2]
				: resolveRelativeRoot(pentatonicRoot, "major", fallbackPalette);
		relativeTwinName = `${relMajor} Major Pentatonic`;
	} else {
		const parentMinor = resolveName(mod12(pentatonicRootPc + 9));
		relativeTwinName = `${keyRootNote} ${keyMode === "major" ? "Major" : "Minor"} / ${parentMinor} Minor Pentatonic`;
	}

	let omittedSummary: string;
	if (pentatonicKind === "major") {
		const deg4 = resolveName(mod12(pentatonicRootPc + 5));
		const deg7 = resolveName(mod12(pentatonicRootPc + 11));
		omittedSummary = `Drops 4 (${deg4}) & 7 (${deg7}) to remove half-step tension against chord tones.`;
	} else if (pentatonicKind === "minor") {
		const deg2 = resolveName(mod12(pentatonicRootPc + 2));
		const deg6 = resolveName(mod12(pentatonicRootPc + 8));
		omittedSummary = `Drops 2 (${deg2}) & ♭6 (${deg6}) for a wide, vocal 5-note guitar vocabulary.`;
	} else {
		omittedSummary = `Swaps 5 for ♭5 so all 5 notes support diminished & m7♭5 tension cleanly.`;
	}

	const pcAt = (semi: number) => mod12(pentatonicRootPc + semi);
	const r = (semi: number) => resolveName(pcAt(semi));
	const makePhrase = (
		id: string,
		label: string,
		tag: string,
		notes: string[],
		tip: string,
	): ChromaticPassingPhrase => ({
		id,
		label,
		tag,
		notes,
		midi: ascendingNotesToMidi(notes, 48),
		tip,
	});

	let passingSemitones: readonly number[];
	let passingPhrases: ChromaticPassingPhrase[];

	if (pentatonicKind === "major") {
		const isDom = chordKind === "7";
		passingSemitones = [3, 6, isDom ? 10 : 8];
		passingPhrases = [
			makePhrase(
				"maj-b3-scoop",
				"♭3 → 3 Scoop",
				"2 → ♭3 → 3",
				[r(2), r(3), r(4)],
				`Slide or hammer-on 1 fret from ${r(3)} directly onto the major 3rd (${r(4)}).`,
			),
			makePhrase(
				"maj-b5-bridge",
				"♯4 / ♭5 Blue Bridge",
				"4 → ♯4 → 5",
				[r(5), r(6), r(7)],
				`Pass lightly through ${r(6)} on an upstroke between ${r(5)} and the stable 5th (${r(7)}).`,
			),
			isDom
				? makePhrase(
						"maj-dom7-walk",
						"♭7 → 7 → 1 Walk",
						"6 → ♭7 → 7 → 1",
						[r(9), r(10), r(11), r(0)],
						`Chromatically connect chord tone ♭7 (${r(10)}) straight up into tonic ${r(0)}.`,
					)
				: makePhrase(
						"maj-s5-walk",
						"5 → ♯5 → 6 Link",
						"5 → ♯5 → 6",
						[r(7), r(8), r(9)],
						`Fills the whole step between ${r(7)} and ${r(9)} with classic fingerstyle voice-leading.`,
					),
		];
	} else if (pentatonicKind === "minor") {
		passingSemitones = [6, 4, 11];
		passingPhrases = [
			makePhrase(
				"min-b5-blue",
				"♭5 Blue Note",
				"4 → ♭5 → 5",
				[r(5), r(6), r(7)],
				`Keep ${r(6)} in motion with a quick slide or micro-bend up into ${r(7)} or back to ${r(5)}.`,
			),
			makePhrase(
				"min-nat3-pass",
				"♭3 → ♮3 → 4 Pass",
				"♭3 → 3 → 4",
				[r(3), r(4), r(5)],
				`Bridges minor ${r(3)} to 4th (${r(5)}) — brightens the minor box on passing beats.`,
			),
			makePhrase(
				"min-lead7-pull",
				"♭7 → 7 → 1 Pull",
				"♭7 → 7 → 1",
				[r(10), r(11), r(0)],
				`One-fret leading-tone pull from ${r(11)} directly resolves onto tonic ${r(0)}.`,
			),
		];
	} else {
		passingSemitones = [2, 7, 11];
		passingPhrases = [
			makePhrase(
				"dim-climb",
				"1 → ♭3 Chromatic Climb",
				"1 → ♭2 → 2 → ♭3",
				[r(0), r(1), r(2), r(3)],
				`Walks step-by-step up adjacent frets straight into the minor 3rd (${r(3)}).`,
			),
			makePhrase(
				"dim-b5-turn",
				"4 → ♭5 → ♮5 Link",
				"4 → ♭5 → 5",
				[r(5), r(6), r(7)],
				`Balances the tritone chord tone (${r(6)}) by sliding smoothly onto ${r(7)}.`,
			),
			makePhrase(
				"dim-lead",
				"♭7 → 7 → 1 Resolution",
				"♭7 → 7 → 1",
				[r(10), r(11), r(0)],
				`Half-step resolution back into ${r(0)} calms the diminished tension.`,
			),
		];
	}

	const pentatonicPcSet = new Set(pentatonicPcs);
	const scaleOutsidePcs = Array.from({ length: 12 }, (_, pc) => pc).filter(
		(pc) => !scalePcSet.has(pc) && !chordPcSet.has(pc),
	);

	const overlayPassingPcs =
		overlayMode === "scale"
			? scaleOutsidePcs
			: passingSemitones
					.map(pcAt)
					.filter(
						(pc) =>
							!chordPcSet.has(pc) &&
							(overlayMode !== "pentatonic" || !pentatonicPcSet.has(pc)),
					);

	return {
		pentatonicRoot,
		pentatonicRootPc,
		pentatonicKind,
		pentatonicName,
		relativeTwinName,
		formula: spec.formula,
		degrees: [...spec.degrees],
		pentatonicNotes,
		pentatonicPcs,
		pentatonicMidi,
		omittedSummary,
		cagedBoxTip: getPentatonicPocketHint(
			pentatonicRootPc,
			pentatonicKind,
			selectedVoicing,
		),
		activeScope,
		hasDistinctChordPentatonic,
		keyPentatonicName,
		chordPentatonicName,
		chordIsNonDiatonic,
		overlayPassingPcs,
		passingPhrases,
	};
}
