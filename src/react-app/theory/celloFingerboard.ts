import { mod12, noteToPitchClass } from "./circleOfFifths";
import {
	GuitarChordKind,
	getChordToneNameMap,
	getIntervalLabel,
} from "./guitarFretboard";

export type CelloSemitoneTuple = [number, number, number, number];

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
	intervalLabel: string;
	noteName: string | null;
}

export interface CelloVoicing {
	id: string;
	name: string;
	positionLabel: string;
	handBaseSemitone: number;
	semitones: CelloSemitoneTuple;
	notes: CelloVoicingNote[];
	soundingMidi: number[];
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

function buildCelloVoicing(
	id: string,
	name: string,
	semitones: CelloSemitoneTuple,
	rootPc: number,
	kind: GuitarChordKind,
	resolveNoteName: (pc: number) => string,
): CelloVoicing | null {
	if (Math.max(0, ...semitones) > MAX_CELLO_SEMITONE) return null;
	if (semitones.some((s) => s < -1)) return null;

	const nonZero = semitones.filter((s) => s > 0);
	const hasOpen = semitones.includes(0);

	// Closed left-hand frame spans at most 3 semitones (fingers 1..4)
	const minNonZero = nonZero.length > 0 ? Math.min(...nonZero) : 0;
	if (nonZero.length > 0 && Math.max(...nonZero) - minNonZero > 3) {
		return null;
	}

	const notes: CelloVoicingNote[] = semitones.map((semitone, stringIndex) => {
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
		return {
			stringIndex,
			semitone,
			finger: semitone === 0 ? 0 : semitone - minNonZero + 1,
			midi,
			pc,
			intervalLabel: getIntervalLabel(rootPc, pc, kind) ?? "?",
			noteName: resolveNoteName(pc),
		};
	});

	return {
		id,
		name,
		positionLabel: getPositionLabel(minNonZero, hasOpen),
		handBaseSemitone: minNonZero,
		semitones,
		notes,
		soundingMidi: notes
			.filter((n): n is CelloVoicingNote & { midi: number } => n.midi !== null)
			.map((n) => n.midi),
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
	const candidates: [string, string, CelloSemitoneTuple][] = [];

	const f4 = mod12(rootPc); // C string (0)
	const f3 = mod12(rootPc - 7); // G string (7)
	const t4 = mod12(rootPc + 4);
	const m4 = mod12(rootPc + 3);
	const m3 = mod12(rootPc - 4);
	const s4 = mod12(rootPc + 7);
	const s4Pos = s4 < 2 ? s4 + 12 : s4;

	switch (kind) {
		case "major": {
			const t3 = mod12(rootPc - 3);
			candidates.push(
				[
					"root-4str",
					f4 === 0 ? "Open 4-Str" : "4-Str Root",
					[f4, f4, f4 + 2, f4 + 3],
				],
				...(f4 <= 2
					? ([
							[
								"root-4str-oct",
								"Upper 4-Str",
								[f4 + 12, f4 + 12, f4 + 14, f4 + 15],
							],
						] as [string, string, CelloSemitoneTuple][])
					: []),
				[
					"root-g3str",
					f3 === 0 ? "Open G-Str" : "Upper 3-Str",
					[-1, f3, f3, f3 + 2],
				],
				["root-c3str", "Low 3-Str", [f4, f4, f4 + 2, -1]],
				["inv1-4str", "1st Inv (3rd Bass)", [t4, t4 + 1, t4 + 1, t4 + 3]],
				["inv1-3str", "Upper 1st Inv", [-1, t3, t3 + 1, t3 + 1]],
			);
			break;
		}
		case "minor":
			candidates.push(
				[
					"root-4str",
					f4 === 0 ? "Open 4-Str" : "4-Str Root",
					[f4, f4, f4 + 1, f4 + 3],
				],
				[
					"root-g3str",
					f3 === 0 ? "Open G-Str" : "Upper 3-Str",
					[-1, f3, f3, f3 + 1],
				],
				["root-c3str", "Low 3-Str", [f4, f4, f4 + 1, -1]],
				["inv1-4str", "1st Inv (♭3 Bass)", [m4, m4 + 2, m4 + 2, m4 + 3]],
				["inv1-3str", "Upper 1st Inv", [-1, m3, m3 + 2, m3 + 2]],
			);
			break;
		case "maj7": {
			const j4 = f4 < 3 ? f4 + 12 : f4;
			const t4Pos = t4 < 1 ? t4 + 12 : t4;
			const g7Pos = t4 < 2 ? t4 + 12 : t4;
			candidates.push(
				[
					"root-4str-maj7",
					f4 === 0 ? "Open Maj7" : "4-Str Root",
					[f4, f4, f4 + 2, f4 + 2],
				],
				["jazz-maj7", "Close R-3-7-5", [j4, j4 - 3, j4 - 3, j4 - 2]],
				...(f3 === 0
					? ([["open-g-maj7", "Open G Maj7", [-1, 0, 4, 2]]] as [
							string,
							string,
							CelloSemitoneTuple,
						][])
					: []),
				["inv1-maj7", "1st Inv Maj7", [t4Pos, t4Pos, t4Pos + 1, t4Pos - 1]],
				["inv3-g-maj7", "Upper 7th-Bass", [-1, g7Pos, g7Pos - 2, g7Pos - 1]],
			);
			break;
		}
		case "7":
			candidates.push(
				[
					"root-4str-7",
					f4 === 0 ? "Open Dom7" : "4-Str Root",
					[f4, f4, f4 + 2, f4 + 1],
				],
				["inv2-dom7", "5th-Bass Dom7", [s4Pos, s4Pos - 2, s4Pos + 1, s4Pos]],
				["shell-g-7", "Upper Shell (R-♭7-3)", [-1, f3, f3 + 3, f3 + 2]],
			);
			break;
		case "m7":
			candidates.push(
				[
					"root-4str-m7",
					f4 === 0 ? "Open m7" : "4-Str Root",
					[f4, f4, f4 + 1, f4 + 1],
				],
				["inv2-m7", "5th-Bass m7", [s4Pos, s4Pos - 2, s4Pos + 1, s4Pos - 1]],
				["shell-g-m7", "Upper Shell (R-♭7-♭3)", [-1, f3, f3 + 3, f3 + 1]],
			);
			break;
		case "diminished": {
			const d4 = f4 < 1 ? f4 + 12 : f4;
			const d3 = f3 < 1 ? f3 + 12 : f3;
			candidates.push(
				["dim-low", "Low Root Dim", [d4, d4 - 1, d4 + 1, -1]],
				["dim-upper", "Upper Root Dim", [-1, d3, d3 - 1, d3 + 1]],
				["dim-inv1-low", "1st Inv Dim", [m4, m4 + 2, m4 + 1, -1]],
				["dim-inv1-upper", "Upper 1st Inv", [-1, m3, m3 + 2, m3 + 1]],
			);
			break;
		}
		case "m7♭5": {
			const h4 = f4 < 1 ? f4 + 12 : f4;
			const s7 = mod12(rootPc + 10);
			const s7Pos = s7 < 2 ? s7 + 12 : s7;
			const b4 = mod12(rootPc + 6);
			const b4Pos = b4 < 1 ? b4 + 12 : b4;
			candidates.push(
				["halfdim-root", "4-Str Root", [h4, h4 - 1, h4 + 1, h4 + 1]],
				["halfdim-inv3", "♭7-Bass m7♭5", [s7Pos, s7Pos - 2, s7Pos, s7Pos - 1]],
				["halfdim-inv2", "♭5-Bass m7♭5", [b4Pos, b4Pos - 1, b4Pos + 2, b4Pos]],
			);
			break;
		}
	}

	const seen = new Set<string>();
	const built: CelloVoicing[] = [];

	for (const [id, name, semitones] of candidates) {
		const key = semitones.join(",");
		if (seen.has(key)) continue;
		const voicing = buildCelloVoicing(
			id,
			name,
			semitones,
			rootPc,
			kind,
			resolveName,
		);
		if (voicing) {
			seen.add(key);
			built.push(voicing);
		}
	}

	return built.sort((a, b) => a.handBaseSemitone - b.handBaseSemitone);
}
