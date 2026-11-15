import {
	ChordQuality,
	DiatonicChord,
	mod12,
	noteToPitchClass,
} from "./circleOfFifths";

export type GuitarChordKind =
	| "major"
	| "minor"
	| "diminished"
	| "maj7"
	| "m7"
	| "7"
	| "m7♭5";

export type FretTuple = [number, number, number, number, number, number];

export interface GuitarStringInfo {
	stringNumber: 6 | 5 | 4 | 3 | 2 | 1; // 6 = low E, 1 = high e
	label: string;
	openMidi: number;
	openPc: number;
}

export interface GuitarVoicingNote {
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

const SHARP_CHROMATIC = [
	"C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B",
] as const;

const FLAT_CHROMATIC = [
	"C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B",
] as const;

const CHORD_INTERVAL_MAP: Record<GuitarChordKind, Record<number, string>> = {
	major: { 0: "R", 4: "3", 7: "5" },
	minor: { 0: "R", 3: "♭3", 7: "5" },
	diminished: { 0: "R", 3: "♭3", 6: "♭5" },
	maj7: { 0: "R", 4: "3", 7: "5", 11: "7" },
	m7: { 0: "R", 3: "♭3", 7: "5", 10: "♭7" },
	"7": { 0: "R", 4: "3", 7: "5", 10: "♭7" },
	"m7♭5": { 0: "R", 3: "♭3", 6: "♭5", 10: "♭7" },
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
};

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

export function getChordToneNameMap(
	chordNotes: string[],
	preferFlats: boolean,
): (pc: number) => string {
	const pcToSpelled = new Map<number, string>();
	for (const n of chordNotes) {
		pcToSpelled.set(noteToPitchClass(n), n);
	}
	const fallback = preferFlats ? FLAT_CHROMATIC : SHARP_CHROMATIC;
	return (pc: number) => pcToSpelled.get(mod12(pc)) ?? fallback[mod12(pc)];
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
	const chordLookup = getChordToneNameMap(chordNotes, preferFlats);
	const chordPcs = new Set(chordNotes.map(noteToPitchClass));
	const scaleMap = new Map<number, string>();
	for (const n of scaleNotes) {
		scaleMap.set(noteToPitchClass(n), n);
	}
	return (pc: number) => {
		const norm = mod12(pc);
		if (chordPcs.has(norm)) return chordLookup(norm);
		return scaleMap.get(norm) ?? chordLookup(norm);
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
	const resolveName = getChordToneNameMap(chordNotes, preferFlats);
	const candidates: [string, string, FretTuple][] = [];

	const openMatch = OPEN_SHAPES[kind]?.[rootPc];
	if (openMatch) candidates.push(openMatch);

	const f6 = movableFret(rootPc, 4, 1);
	const f5 = movableFret(rootPc, 9, 1);
	const f4 = movableFret(rootPc, 2, 1);
	const d6 = mod12(rootPc - 4);
	const d5 = mod12(rootPc - 9);
	const d4 = mod12(rootPc - 2);

	switch (kind) {
		case "major":
			candidates.push(
				["e-shape", "E-Shape Barre", offsetFrets([0, 2, 2, 1, 0, 0], f6)],
				["a-shape", "A-Shape Barre", offsetFrets([-1, 0, 2, 2, 2, 0], f5)],
				["c-shape", "C-Shape", offsetFrets([-1, 3, 2, 0, 1, 0], movableFret(rootPc, 0, 1))],
				["g-shape", "G-Shape", offsetFrets([3, 2, 0, 0, 0, -1], movableFret(rootPc, 7, 1))],
				["d-shape", "D-Shape Upper", offsetFrets([-1, -1, 0, 2, 3, 2], f4)],
			);
			break;
		case "minor":
			candidates.push(
				["em-shape", "Em-Shape Barre", offsetFrets([0, 2, 2, 0, 0, 0], f6)],
				["am-shape", "Am-Shape Barre", offsetFrets([-1, 0, 2, 2, 1, 0], f5)],
				["cm-shape", "Cm-Shape", offsetFrets([-1, 3, 1, 0, 1, -1], mod12(rootPc))],
				["gm-shape", "Gm-Shape", offsetFrets([3, 1, 0, 0, -1, -1], mod12(rootPc - 7))],
				["dm-shape", "Dm-Shape Upper", offsetFrets([-1, -1, 0, 2, 3, 1], f4)],
			);
			break;
		case "7":
			candidates.push(
				["e7-shape", "E7-Shape Barre", offsetFrets([0, 2, 0, 1, 0, 0], f6)],
				["a7-shape", "A7-Shape Barre", offsetFrets([-1, 0, 2, 0, 2, 0], f5)],
				["c7-shape", "C7-Shape", offsetFrets([-1, 3, 2, 3, 1, -1], movableFret(rootPc, 0, 1))],
				["d7-shape", "D7-Shape Upper", offsetFrets([-1, -1, 0, 2, 1, 2], f4)],
			);
			break;
		case "maj7":
			candidates.push(
				["shell6-maj7", "6th-Str Maj7", offsetFrets([0, -1, 1, 1, 0, -1], f6)],
				["a-maj7-shape", "A-Shape Maj7", offsetFrets([-1, 0, 2, 1, 2, 0], f5)],
				["d-maj7-shape", "D-Shape Maj7", offsetFrets([-1, -1, 0, 2, 2, 2], f4)],
			);
			break;
		case "m7":
			candidates.push(
				["em7-shape", "Em7-Shape Barre", offsetFrets([0, 2, 0, 0, 0, 0], f6)],
				["shell6-m7", "6th-Str Jazz m7", offsetFrets([0, -1, 0, 0, 0, -1], f6)],
				["am7-shape", "Am7-Shape Barre", offsetFrets([-1, 0, 2, 0, 1, 0], f5)],
				["dm7-shape", "Dm7-Shape Upper", offsetFrets([-1, -1, 0, 2, 1, 1], f4)],
			);
			break;
		case "diminished":
			candidates.push(
				["dim-6", "6th-Str Dim", offsetFrets([0, 1, 2, 0, -1, -1], d6)],
				["dim-5", "5th-Str Dim", offsetFrets([-1, 0, 1, 2, 1, -1], d5)],
				["dim-4", "4th-Str Dim", offsetFrets([-1, -1, 0, 1, 3, 1], d4)],
			);
			if (d6 <= 2) {
				candidates.push(["dim-6-hi", "6th-Str High", offsetFrets([0, 1, 2, 0, -1, -1], d6 + 12)]);
			}
			if (d5 <= 2) {
				candidates.push(["dim-5-hi", "5th-Str High", offsetFrets([-1, 0, 1, 2, 1, -1], d5 + 12)]);
			}
			break;
		case "m7♭5":
			candidates.push(
				["halfdim-6", "6th-Str m7♭5", [f6, -1, f6, f6, f6 - 1, -1]],
				["halfdim-5", "5th-Str m7♭5", offsetFrets([-1, 0, 1, 0, 1, -1], d5)],
				["halfdim-4", "4th-Str m7♭5", offsetFrets([-1, -1, 0, 1, 1, 1], d4)],
			);
			if (d5 <= 2) {
				candidates.push(["halfdim-5-hi", "5th-Str High", offsetFrets([-1, 0, 1, 0, 1, -1], d5 + 12)]);
			}
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
