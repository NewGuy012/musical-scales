import { mod12, noteToPitchClass } from "./circleOfFifths";
import {
	GuitarChordKind,
	getChordToneNameMap,
	getIntervalLabel,
} from "./guitarFretboard";

export interface CelloStringInfo {
	stringNumber: 4 | 3 | 2 | 1; // 4 = low C, 1 = high A
	label: string;
	openMidi: number;
	openPc: number;
}

export interface CelloVoicingNote {
	stringIndex: number; // 0 (low C) .. 3 (high A)
	semitone: number; // -1 = unplayed, 0 = open, 1..14 = fingered
	finger: number | null; // 0 = open, 1..4 = left-hand finger, null = unplayed
	midi: number | null;
	pc: number | null;
	intervalLabel: string; // "R", "3", "♭3", "5", "♭5", "7", "♭7", or "×"
	noteName: string | null;
}

export interface CelloVoicing {
	id: string;
	name: string;
	positionLabel: string; // e.g. "Open / 1st Pos", "1st Pos", "4th Pos"
	handBaseSemitone: number; // 0 = open only, >= 1 = 1st finger semitone anchor
	semitones: [number, number, number, number]; // [str4 C, str3 G, str2 D, str1 A]
	notes: CelloVoicingNote[];
	soundingMidi: number[]; // low-to-high MIDI pitches for bow roll
}

// Standard cello tuning in Perfect Fifths: C2 G2 D3 A3
export const CELLO_TUNING: CelloStringInfo[] = [
	{ stringNumber: 4, label: "C", openMidi: 36, openPc: 0 },
	{ stringNumber: 3, label: "G", openMidi: 43, openPc: 7 },
	{ stringNumber: 2, label: "D", openMidi: 50, openPc: 2 },
	{ stringNumber: 1, label: "A", openMidi: 57, openPc: 9 },
];

export const MAX_CELLO_SEMITONE = 14;

function getPositionLabel(minNonZero: number, hasOpen: boolean): string {
	if (minNonZero === 0) return "Open";
	const prefix = hasOpen ? "Open + " : "";
	if (minNonZero === 1) return `${prefix}Half Pos`;
	if (minNonZero === 2) return `${prefix}1st Pos`;
	if (minNonZero === 3) return `${prefix}2nd Pos`;
	if (minNonZero <= 5) return `${prefix}3rd Pos`;
	if (minNonZero <= 7) return `${prefix}4th Pos`;
	return `${prefix}Upper Pos`;
}

interface RawCelloShape {
	id: string;
	name: string;
	semitones: [number, number, number, number];
}

function buildCelloVoicing(
	shape: RawCelloShape,
	rootPc: number,
	kind: GuitarChordKind,
	resolveNoteName: (pc: number) => string,
): CelloVoicing | null {
	const maxSemi = shape.semitones.reduce((acc, s) => Math.max(acc, s), 0);
	if (maxSemi > MAX_CELLO_SEMITONE) return null;
	if (shape.semitones.some((s) => s < -1)) return null;

	const nonZero = shape.semitones.filter((s) => s > 0);
	const hasOpen = shape.semitones.some((s) => s === 0);

	// Keep closed hand frame within 3 semitones (4 fingers spanning 1..4)
	const minNonZero = nonZero.length > 0 ? Math.min(...nonZero) : 0;
	const maxNonZero = nonZero.length > 0 ? Math.max(...nonZero) : 0;
	if (nonZero.length > 0 && maxNonZero - minNonZero > 3) {
		return null;
	}

	const handBaseSemitone = minNonZero;

	const notes: CelloVoicingNote[] = shape.semitones.map(
		(semitone, stringIndex) => {
			if (semitone < 0) {
				return {
					stringIndex,
					semitone,
					finger: null,
					midi: null,
					pc: null,
					intervalLabel: "×",
					noteName: null,
				};
			}
			const info = CELLO_TUNING[stringIndex];
			const midi = info.openMidi + semitone;
			const pc = mod12(info.openPc + semitone);
			const intervalLabel = getIntervalLabel(rootPc, pc, kind) ?? "?";
			const finger = semitone === 0 ? 0 : semitone - handBaseSemitone + 1;
			return {
				stringIndex,
				semitone,
				finger,
				midi,
				pc,
				intervalLabel,
				noteName: resolveNoteName(pc),
			};
		},
	);

	const soundingMidi = notes
		.filter((n): n is CelloVoicingNote & { midi: number } => n.midi !== null)
		.map((n) => n.midi);

	return {
		id: shape.id,
		name: shape.name,
		positionLabel: getPositionLabel(minNonZero, hasOpen),
		handBaseSemitone,
		semitones: shape.semitones,
		notes,
		soundingMidi,
	};
}

export function getCelloVoicings(
	rootNote: string,
	kind: GuitarChordKind,
	chordNotes: string[],
	preferFlats = false,
): CelloVoicing[] {
	const rootPc = noteToPitchClass(rootNote);
	const resolveName = getChordToneNameMap(chordNotes, preferFlats);
	const candidates: RawCelloShape[] = [];

	const f4 = mod12(rootPc - 0); // C string (0)
	const f3 = mod12(rootPc - 7); // G string (7)

	if (kind === "major") {
		// 4-string Root Position: R, 5, 3, R
		candidates.push({
			id: "root-4str",
			name: f4 === 0 ? "Open 4-Str" : "4-Str Root",
			semitones: [f4, f4, f4 + 2, f4 + 3],
		});
		if (f4 <= 2) {
			candidates.push({
				id: "root-4str-oct",
				name: "Upper 4-Str",
				semitones: [f4 + 12, f4 + 12, f4 + 14, f4 + 15],
			});
		}

		// Upper 3-string Root Position: x, R, 5, 3
		candidates.push({
			id: "root-g3str",
			name: f3 === 0 ? "Open G-Str" : "Upper 3-Str",
			semitones: [-1, f3, f3, f3 + 2],
		});

		// Low 3-string Root Position: R, 5, 3, x
		candidates.push({
			id: "root-c3str",
			name: "Low 3-Str",
			semitones: [f4, f4, f4 + 2, -1],
		});

		// 1st Inversion (3rd in bass): 3, R, 5, 3
		const t4 = mod12(rootPc + 4);
		candidates.push({
			id: "inv1-4str",
			name: "1st Inv (3rd Bass)",
			semitones: [t4, t4 + 1, t4 + 1, t4 + 3],
		});

		// Upper 3-string 1st Inversion: x, 3, R, 5
		const t3 = mod12(rootPc + 4 - 7);
		candidates.push({
			id: "inv1-3str",
			name: "Upper 1st Inv",
			semitones: [-1, t3, t3 + 1, t3 + 1],
		});
	} else if (kind === "minor") {
		// 4-string Root Position: R, 5, ♭3, R
		candidates.push({
			id: "root-4str",
			name: f4 === 0 ? "Open 4-Str" : "4-Str Root",
			semitones: [f4, f4, f4 + 1, f4 + 3],
		});

		// Upper 3-string Root Position: x, R, 5, ♭3
		candidates.push({
			id: "root-g3str",
			name: f3 === 0 ? "Open G-Str" : "Upper 3-Str",
			semitones: [-1, f3, f3, f3 + 1],
		});

		// Low 3-string Root Position: R, 5, ♭3, x
		candidates.push({
			id: "root-c3str",
			name: "Low 3-Str",
			semitones: [f4, f4, f4 + 1, -1],
		});

		// 1st Inversion Minor (♭3 in bass): ♭3, R, 5, ♭3
		const m4 = mod12(rootPc + 3);
		candidates.push({
			id: "inv1-4str",
			name: "1st Inv (♭3 Bass)",
			semitones: [m4, m4 + 2, m4 + 2, m4 + 3],
		});

		// Upper 3-string 1st Inversion Minor: x, ♭3, R, 5
		const m3 = mod12(rootPc + 3 - 7);
		candidates.push({
			id: "inv1-3str",
			name: "Upper 1st Inv",
			semitones: [-1, m3, m3 + 2, m3 + 2],
		});
	} else if (kind === "maj7") {
		// 4-string Root Position: R, 5, 3, 7
		candidates.push({
			id: "root-4str-maj7",
			name: f4 === 0 ? "Open Maj7" : "4-Str Root",
			semitones: [f4, f4, f4 + 2, f4 + 2],
		});

		// Close Jazz Maj7: R, 3, 7, 5
		const j4 = f4 < 3 ? f4 + 12 : f4;
		candidates.push({
			id: "jazz-maj7",
			name: "Close R-3-7-5",
			semitones: [j4, j4 - 3, j4 - 3, j4 - 2],
		});

		// Upper 3-string Maj7 Shell (when open G fits): x, R, 7, 3
		if (f3 === 0) {
			candidates.push({
				id: "open-g-maj7",
				name: "Open G Maj7",
				semitones: [-1, 0, 4, 2],
			});
		}

		// 1st Inversion (3rd in bass): 3, 7, 5, R
		const t4 = mod12(rootPc + 4);
		const t4Pos = t4 < 1 ? t4 + 12 : t4;
		candidates.push({
			id: "inv1-maj7",
			name: "1st Inv Maj7",
			semitones: [t4Pos, t4Pos, t4Pos + 1, t4Pos - 1],
		});

		// Upper 3-string 3rd Inversion: x, 7, 3, R
		const g7Pos = t4 < 2 ? t4 + 12 : t4;
		candidates.push({
			id: "inv3-g-maj7",
			name: "Upper 7th-Bass",
			semitones: [-1, g7Pos, g7Pos - 2, g7Pos - 1],
		});
	} else if (kind === "7") {
		// 4-string Root Position: R, 5, 3, ♭7
		candidates.push({
			id: "root-4str-7",
			name: f4 === 0 ? "Open Dom7" : "4-Str Root",
			semitones: [f4, f4, f4 + 2, f4 + 1],
		});

		// 5th-in-bass Dominant 7: 5, R, ♭7, 3
		const s4 = mod12(rootPc + 7);
		const s4Pos = s4 < 2 ? s4 + 12 : s4;
		candidates.push({
			id: "inv2-dom7",
			name: "5th-Bass Dom7",
			semitones: [s4Pos, s4Pos - 2, s4Pos + 1, s4Pos],
		});

		// Upper 3-string Shell: x, R, ♭7, 3
		candidates.push({
			id: "shell-g-7",
			name: "Upper Shell (R-♭7-3)",
			semitones: [-1, f3, f3 + 3, f3 + 2],
		});
	} else if (kind === "m7") {
		// 4-string Root Position: R, 5, ♭3, ♭7
		candidates.push({
			id: "root-4str-m7",
			name: f4 === 0 ? "Open m7" : "4-Str Root",
			semitones: [f4, f4, f4 + 1, f4 + 1],
		});

		// 5th-in-bass m7: 5, R, ♭7, ♭3
		const s4 = mod12(rootPc + 7);
		const s4Pos = s4 < 2 ? s4 + 12 : s4;
		candidates.push({
			id: "inv2-m7",
			name: "5th-Bass m7",
			semitones: [s4Pos, s4Pos - 2, s4Pos + 1, s4Pos - 1],
		});

		// Upper 3-string Shell: x, R, ♭7, ♭3
		candidates.push({
			id: "shell-g-m7",
			name: "Upper Shell (R-♭7-♭3)",
			semitones: [-1, f3, f3 + 3, f3 + 1],
		});
	} else if (kind === "diminished") {
		// Low 3-string Root Position Dim: R, ♭5, ♭3, x
		const d4 = f4 < 1 ? f4 + 12 : f4;
		candidates.push({
			id: "dim-low",
			name: "Low Root Dim",
			semitones: [d4, d4 - 1, d4 + 1, -1],
		});

		// Upper 3-string Root Position Dim: x, R, ♭5, ♭3
		const d3 = f3 < 1 ? f3 + 12 : f3;
		candidates.push({
			id: "dim-upper",
			name: "Upper Root Dim",
			semitones: [-1, d3, d3 - 1, d3 + 1],
		});

		// Low 1st Inversion Dim: ♭3, R, ♭5, x
		const m4 = mod12(rootPc + 3);
		candidates.push({
			id: "dim-inv1-low",
			name: "1st Inv Dim",
			semitones: [m4, m4 + 2, m4 + 1, -1],
		});

		// Upper 1st Inversion Dim: x, ♭3, R, ♭5
		const m3 = mod12(rootPc + 3 - 7);
		candidates.push({
			id: "dim-inv1-upper",
			name: "Upper 1st Inv",
			semitones: [-1, m3, m3 + 2, m3 + 1],
		});
	} else if (kind === "m7♭5") {
		// 4-string Root Position m7♭5: R, ♭5, ♭3, ♭7
		const h4 = f4 < 1 ? f4 + 12 : f4;
		candidates.push({
			id: "halfdim-root",
			name: "4-Str Root",
			semitones: [h4, h4 - 1, h4 + 1, h4 + 1],
		});

		// ♭7-in-bass m7♭5: ♭7, ♭3, R, ♭5
		const s7 = mod12(rootPc + 10);
		const s7Pos = s7 < 2 ? s7 + 12 : s7;
		candidates.push({
			id: "halfdim-inv3",
			name: "♭7-Bass m7♭5",
			semitones: [s7Pos, s7Pos - 2, s7Pos, s7Pos - 1],
		});

		// ♭5-in-bass m7♭5: ♭5, R, ♭7, ♭3
		const b4 = mod12(rootPc + 6);
		const b4Pos = b4 < 1 ? b4 + 12 : b4;
		candidates.push({
			id: "halfdim-inv2",
			name: "♭5-Bass m7♭5",
			semitones: [b4Pos, b4Pos - 1, b4Pos + 2, b4Pos],
		});
	}

	const seen = new Set<string>();
	const built: CelloVoicing[] = [];

	for (const candidate of candidates) {
		const key = candidate.semitones.join(",");
		if (seen.has(key)) continue;
		const voicing = buildCelloVoicing(candidate, rootPc, kind, resolveName);
		if (voicing) {
			seen.add(key);
			built.push(voicing);
		}
	}

	return built.sort((a, b) => a.handBaseSemitone - b.handBaseSemitone);
}
