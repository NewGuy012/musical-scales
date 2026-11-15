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
	intervalLabel: string; // "R", "3", "♭3", "5", "♭5", "7", "♭7", or "×"
	noteName: string | null;
}

export interface GuitarVoicing {
	id: string;
	name: string; // e.g. "Open", "E-Shape", "A-Shape", "D-Shape"
	positionLabel: string; // e.g. "Open" or "Fret 3"
	baseFret: number; // 0 for open, >= 1 for movable
	frets: [number, number, number, number, number, number]; // [str6..str1]
	notes: GuitarVoicingNote[];
	soundingMidi: number[]; // low-to-high MIDI pitches for strumming
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

const FLAT_CHROMATIC = [
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

const CHORD_INTERVAL_MAP: Record<GuitarChordKind, Record<number, string>> = {
	major: { 0: "R", 4: "3", 7: "5" },
	minor: { 0: "R", 3: "♭3", 7: "5" },
	diminished: { 0: "R", 3: "♭3", 6: "♭5" },
	maj7: { 0: "R", 4: "3", 7: "5", 11: "7" },
	m7: { 0: "R", 3: "♭3", 7: "5", 10: "♭7" },
	"7": { 0: "R", 4: "3", 7: "5", 10: "♭7" },
	"m7♭5": { 0: "R", 3: "♭3", 6: "♭5", 10: "♭7" },
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

export function getIntervalLabel(
	rootPc: number,
	targetPc: number,
	kind: GuitarChordKind,
): string | null {
	const semitones = mod12(targetPc - rootPc);
	return CHORD_INTERVAL_MAP[kind][semitones] ?? null;
}

interface RawShape {
	id: string;
	name: string;
	frets: [number, number, number, number, number, number];
}

function buildVoicing(
	shape: RawShape,
	rootPc: number,
	kind: GuitarChordKind,
	resolveNoteName: (pc: number) => string,
): GuitarVoicing | null {
	const nonZeroFrets = shape.frets.filter((f) => f > 0);
	const maxFret = shape.frets.reduce((acc, f) => Math.max(acc, f), 0);
	if (maxFret > MAX_GUITAR_FRET) return null;

	// Check playable span for fretted notes
	if (nonZeroFrets.length > 0) {
		const minNonZero = Math.min(...nonZeroFrets);
		const maxNonZero = Math.max(...nonZeroFrets);
		if (maxNonZero - minNonZero > 4) return null;
	}

	const hasOpen = shape.frets.some((f) => f === 0);
	const minFret = nonZeroFrets.length > 0 ? Math.min(...nonZeroFrets) : 0;
	const baseFret = hasOpen && minFret <= 4 ? 0 : minFret;

	const notes: GuitarVoicingNote[] = shape.frets.map((fret, stringIndex) => {
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
		const intervalLabel = getIntervalLabel(rootPc, pc, kind) ?? "?";
		return {
			stringIndex,
			fret,
			midi,
			pc,
			intervalLabel,
			noteName: resolveNoteName(pc),
		};
	});

	const soundingMidi = notes
		.filter((n): n is GuitarVoicingNote & { midi: number } => n.midi !== null)
		.map((n) => n.midi);

	return {
		id: shape.id,
		name: shape.name,
		positionLabel: baseFret === 0 ? "Open" : `Fret ${baseFret}`,
		baseFret,
		frets: shape.frets,
		notes,
		soundingMidi,
	};
}

function offsetFrets(
	template: [number, number, number, number, number, number],
	offset: number,
): [number, number, number, number, number, number] {
	return template.map((f) => (f < 0 ? -1 : f + offset)) as [
		number,
		number,
		number,
		number,
		number,
		number,
	];
}

function movableFret(rootPc: number, openPc: number, minFret = 1): number {
	const raw = mod12(rootPc - openPc);
	return raw < minFret ? raw + 12 : raw;
}

export function getGuitarVoicings(
	rootNote: string,
	kind: GuitarChordKind,
	chordNotes: string[],
	preferFlats = false,
): GuitarVoicing[] {
	const rootPc = noteToPitchClass(rootNote);
	const resolveName = getChordToneNameMap(chordNotes, preferFlats);
	const candidates: RawShape[] = [];

	const f6 = movableFret(rootPc, 4, 1);
	const f5 = movableFret(rootPc, 9, 1);
	const f4 = movableFret(rootPc, 2, 1);

	if (kind === "major") {
		if (rootPc === 0)
			candidates.push({
				id: "open-c",
				name: "Open C",
				frets: [-1, 3, 2, 0, 1, 0],
			});
		if (rootPc === 9)
			candidates.push({
				id: "open-a",
				name: "Open A",
				frets: [-1, 0, 2, 2, 2, 0],
			});
		if (rootPc === 7)
			candidates.push({
				id: "open-g",
				name: "Open G",
				frets: [3, 2, 0, 0, 0, 3],
			});
		if (rootPc === 4)
			candidates.push({
				id: "open-e",
				name: "Open E",
				frets: [0, 2, 2, 1, 0, 0],
			});
		if (rootPc === 2)
			candidates.push({
				id: "open-d",
				name: "Open D",
				frets: [-1, -1, 0, 2, 3, 2],
			});
		if (rootPc === 5)
			candidates.push({
				id: "compact-f",
				name: "Compact F",
				frets: [-1, -1, 3, 2, 1, 1],
			});

		candidates.push({
			id: "e-shape",
			name: "E-Shape Barre",
			frets: offsetFrets([0, 2, 2, 1, 0, 0], f6),
		});
		candidates.push({
			id: "a-shape",
			name: "A-Shape Barre",
			frets: offsetFrets([-1, 0, 2, 2, 2, 0], f5),
		});

		const cAnchor = movableFret(rootPc, 0, 1); // C open pc=0 -> C-shape anchor
		candidates.push({
			id: "c-shape",
			name: "C-Shape",
			frets: offsetFrets([-1, 3, 2, 0, 1, 0], cAnchor),
		});

		const gAnchor = movableFret(rootPc, 7, 1); // G open pc=7 -> G-shape anchor
		candidates.push({
			id: "g-shape",
			name: "G-Shape",
			frets: offsetFrets([3, 2, 0, 0, 0, -1], gAnchor),
		});

		candidates.push({
			id: "d-shape",
			name: "D-Shape Upper",
			frets: offsetFrets([-1, -1, 0, 2, 3, 2], f4),
		});
	} else if (kind === "minor") {
		if (rootPc === 4)
			candidates.push({
				id: "open-em",
				name: "Open Em",
				frets: [0, 2, 2, 0, 0, 0],
			});
		if (rootPc === 9)
			candidates.push({
				id: "open-am",
				name: "Open Am",
				frets: [-1, 0, 2, 2, 1, 0],
			});
		if (rootPc === 2)
			candidates.push({
				id: "open-dm",
				name: "Open Dm",
				frets: [-1, -1, 0, 2, 3, 1],
			});

		candidates.push({
			id: "em-shape",
			name: "Em-Shape Barre",
			frets: offsetFrets([0, 2, 2, 0, 0, 0], f6),
		});
		candidates.push({
			id: "am-shape",
			name: "Am-Shape Barre",
			frets: offsetFrets([-1, 0, 2, 2, 1, 0], f5),
		});

		const cmAnchor = mod12(rootPc - 0); // Cm shape anchor (0 for Cm = x3101x)
		candidates.push({
			id: "cm-shape",
			name: "Cm-Shape",
			frets: offsetFrets([-1, 3, 1, 0, 1, -1], cmAnchor),
		});

		const gmAnchor = mod12(rootPc - 7); // Gm shape anchor (0 for Gm = 3100xx)
		candidates.push({
			id: "gm-shape",
			name: "Gm-Shape",
			frets: offsetFrets([3, 1, 0, 0, -1, -1], gmAnchor),
		});

		candidates.push({
			id: "dm-shape",
			name: "Dm-Shape Upper",
			frets: offsetFrets([-1, -1, 0, 2, 3, 1], f4),
		});
	} else if (kind === "7") {
		if (rootPc === 4)
			candidates.push({
				id: "open-e7",
				name: "Open E7",
				frets: [0, 2, 0, 1, 0, 0],
			});
		if (rootPc === 9)
			candidates.push({
				id: "open-a7",
				name: "Open A7",
				frets: [-1, 0, 2, 0, 2, 0],
			});
		if (rootPc === 2)
			candidates.push({
				id: "open-d7",
				name: "Open D7",
				frets: [-1, -1, 0, 2, 1, 2],
			});
		if (rootPc === 7)
			candidates.push({
				id: "open-g7",
				name: "Open G7",
				frets: [3, 2, 0, 0, 0, 1],
			});
		if (rootPc === 0)
			candidates.push({
				id: "open-c7",
				name: "Open C7",
				frets: [-1, 3, 2, 3, 1, 0],
			});
		if (rootPc === 11)
			candidates.push({
				id: "open-b7",
				name: "Open B7",
				frets: [-1, 2, 1, 2, 0, 2],
			});

		candidates.push({
			id: "e7-shape",
			name: "E7-Shape Barre",
			frets: offsetFrets([0, 2, 0, 1, 0, 0], f6),
		});
		candidates.push({
			id: "a7-shape",
			name: "A7-Shape Barre",
			frets: offsetFrets([-1, 0, 2, 0, 2, 0], f5),
		});

		const c7Anchor = movableFret(rootPc, 0, 1);
		candidates.push({
			id: "c7-shape",
			name: "C7-Shape",
			frets: offsetFrets([-1, 3, 2, 3, 1, -1], c7Anchor),
		});

		candidates.push({
			id: "d7-shape",
			name: "D7-Shape Upper",
			frets: offsetFrets([-1, -1, 0, 2, 1, 2], f4),
		});
	} else if (kind === "maj7") {
		if (rootPc === 0)
			candidates.push({
				id: "open-cmaj7",
				name: "Open Cmaj7",
				frets: [-1, 3, 2, 0, 0, 0],
			});
		if (rootPc === 5)
			candidates.push({
				id: "open-fmaj7",
				name: "Open Fmaj7",
				frets: [-1, -1, 3, 2, 1, 0],
			});
		if (rootPc === 7)
			candidates.push({
				id: "open-gmaj7",
				name: "Open Gmaj7",
				frets: [3, 2, 0, 0, 0, 2],
			});
		if (rootPc === 2)
			candidates.push({
				id: "open-dmaj7",
				name: "Open Dmaj7",
				frets: [-1, -1, 0, 2, 2, 2],
			});
		if (rootPc === 9)
			candidates.push({
				id: "open-amaj7",
				name: "Open Amaj7",
				frets: [-1, 0, 2, 1, 2, 0],
			});
		if (rootPc === 4)
			candidates.push({
				id: "open-emaj7",
				name: "Open Emaj7",
				frets: [0, 2, 1, 1, 0, 0],
			});

		candidates.push({
			id: "shell6-maj7",
			name: "6th-Str Maj7",
			frets: offsetFrets([0, -1, 1, 1, 0, -1], f6),
		});
		candidates.push({
			id: "a-maj7-shape",
			name: "A-Shape Maj7",
			frets: offsetFrets([-1, 0, 2, 1, 2, 0], f5),
		});
		candidates.push({
			id: "d-maj7-shape",
			name: "D-Shape Maj7",
			frets: offsetFrets([-1, -1, 0, 2, 2, 2], f4),
		});
	} else if (kind === "m7") {
		if (rootPc === 4)
			candidates.push({
				id: "open-em7",
				name: "Open Em7",
				frets: [0, 2, 0, 0, 0, 0],
			});
		if (rootPc === 9)
			candidates.push({
				id: "open-am7",
				name: "Open Am7",
				frets: [-1, 0, 2, 0, 1, 0],
			});
		if (rootPc === 2)
			candidates.push({
				id: "open-dm7",
				name: "Open Dm7",
				frets: [-1, -1, 0, 2, 1, 1],
			});

		candidates.push({
			id: "em7-shape",
			name: "Em7-Shape Barre",
			frets: offsetFrets([0, 2, 0, 0, 0, 0], f6),
		});
		candidates.push({
			id: "shell6-m7",
			name: "6th-Str Jazz m7",
			frets: offsetFrets([0, -1, 0, 0, 0, -1], f6),
		});
		candidates.push({
			id: "am7-shape",
			name: "Am7-Shape Barre",
			frets: offsetFrets([-1, 0, 2, 0, 1, 0], f5),
		});
		candidates.push({
			id: "dm7-shape",
			name: "Dm7-Shape Upper",
			frets: offsetFrets([-1, -1, 0, 2, 1, 1], f4),
		});
	} else if (kind === "diminished") {
		const d6 = mod12(rootPc - 4);
		const d5 = mod12(rootPc - 9);
		const d4 = mod12(rootPc - 2);

		candidates.push({
			id: "dim-6",
			name: "6th-Str Dim",
			frets: offsetFrets([0, 1, 2, 0, -1, -1], d6),
		});
		candidates.push({
			id: "dim-5",
			name: "5th-Str Dim",
			frets: offsetFrets([-1, 0, 1, 2, 1, -1], d5),
		});
		candidates.push({
			id: "dim-4",
			name: "4th-Str Dim",
			frets: offsetFrets([-1, -1, 0, 1, 3, 1], d4),
		});
		// Also offer upper octave position if low position was open/low
		if (d6 <= 2) {
			candidates.push({
				id: "dim-6-hi",
				name: "6th-Str High",
				frets: offsetFrets([0, 1, 2, 0, -1, -1], d6 + 12),
			});
		}
		if (d5 <= 2) {
			candidates.push({
				id: "dim-5-hi",
				name: "5th-Str High",
				frets: offsetFrets([-1, 0, 1, 2, 1, -1], d5 + 12),
			});
		}
	} else if (kind === "m7♭5") {
		const h6 = movableFret(rootPc, 4, 1);
		const h5 = mod12(rootPc - 9);
		const h4 = mod12(rootPc - 2);

		candidates.push({
			id: "halfdim-6",
			name: "6th-Str m7♭5",
			frets: [h6, -1, h6, h6, h6 - 1, -1],
		});
		candidates.push({
			id: "halfdim-5",
			name: "5th-Str m7♭5",
			frets: offsetFrets([-1, 0, 1, 0, 1, -1], h5),
		});
		candidates.push({
			id: "halfdim-4",
			name: "4th-Str m7♭5",
			frets: offsetFrets([-1, -1, 0, 1, 1, 1], h4),
		});
		if (h5 <= 2) {
			candidates.push({
				id: "halfdim-5-hi",
				name: "5th-Str High",
				frets: offsetFrets([-1, 0, 1, 0, 1, -1], h5 + 12),
			});
		}
	}

	const seenFrets = new Set<string>();
	const built: GuitarVoicing[] = [];

	for (const candidate of candidates) {
		const key = candidate.frets.join(",");
		if (seenFrets.has(key)) continue;
		const voicing = buildVoicing(candidate, rootPc, kind, resolveName);
		if (voicing) {
			seenFrets.add(key);
			built.push(voicing);
		}
	}

	// Sort naturally from open / lowest neck position up to highest neck position
	return built.sort((a, b) => a.baseFret - b.baseFret);
}
