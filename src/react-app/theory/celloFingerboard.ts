import { mod12, noteToPitchClass } from "./circleOfFifths";
import {
	GuitarChordKind,
	createPitchClassNameResolver,
	getIntervalLabel,
} from "./guitarFretboard";

export type BowedInstrument = "cello" | "violin";
export type BowedSemitoneTuple = [number, number, number, number];

export interface BowedStringInfo {
	stringNumber: 4 | 3 | 2 | 1; // 4 = lowest string, 1 = highest string
	label: string;
	openMidi: number;
	openPc: number;
}

export interface BowedVoicingNote {
	stringIndex: number; // 0 (lowest string) .. 3 (highest string)
	semitone: number; // -1 = unplayed, 0 = open, 1..14 = fingered
	finger: number | null; // 0 = open, 1..4 = left-hand finger, null = unplayed
	midi: number | null;
	pc: number | null;
	intervalLabel: string;
	noteName: string | null;
}

export interface BowedVoicing {
	id: string;
	name: string;
	positionLabel: string;
	handBaseSemitone: number;
	semitones: BowedSemitoneTuple;
	notes: BowedVoicingNote[];
	soundingMidi: number[];
}

export const MAX_BOWED_SEMITONE = 14;
export const MAX_SONG_BOWED_SEMITONE = 24;

// Perfect-fifths tunings: Cello C2-G2-D3-A3, Violin G3-D4-A4-E5
export const CELLO_TUNING: BowedStringInfo[] = [
	{ stringNumber: 4, label: "C", openMidi: 36, openPc: 0 },
	{ stringNumber: 3, label: "G", openMidi: 43, openPc: 7 },
	{ stringNumber: 2, label: "D", openMidi: 50, openPc: 2 },
	{ stringNumber: 1, label: "A", openMidi: 57, openPc: 9 },
];

export const VIOLIN_TUNING: BowedStringInfo[] = [
	{ stringNumber: 4, label: "G", openMidi: 55, openPc: 7 },
	{ stringNumber: 3, label: "D", openMidi: 62, openPc: 2 },
	{ stringNumber: 2, label: "A", openMidi: 69, openPc: 9 },
	{ stringNumber: 1, label: "E", openMidi: 76, openPc: 4 },
];

export const BOWED_TUNINGS: Record<
	BowedInstrument,
	readonly BowedStringInfo[]
> = {
	cello: CELLO_TUNING,
	violin: VIOLIN_TUNING,
};

export const BOWED_STRING_ROMAN = ["IV", "III", "II", "I"] as const;

// Natural harmonics above open string sounding pitch -> touch node semitone.
export const BOWED_HARMONIC_TOUCH_SEMITONES: Record<number, number> = {
	12: 12,
	19: 7,
	24: 5,
};

export function resolveBowedStringIndex(
	tuning: readonly BowedStringInfo[],
	stringOverride: string | undefined,
	midi: number,
): number {
	if (stringOverride) {
		const idx = tuning.findIndex((s) => s.label === stringOverride);
		if (idx === -1) {
			throw new Error(`Unknown string override: ${stringOverride}`);
		}
		return idx;
	}
	for (let i = tuning.length - 1; i >= 0; i--) {
		if (midi >= tuning[i].openMidi) return i;
	}
	return 0;
}

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

function buildBowedVoicing(
	tuning: readonly BowedStringInfo[],
	maxSemitone: number,
	id: string,
	name: string,
	semitones: BowedSemitoneTuple,
	rootPc: number,
	kind: GuitarChordKind,
	resolveNoteName: (pc: number) => string,
): BowedVoicing | null {
	if (Math.max(0, ...semitones) > maxSemitone) return null;
	if (semitones.some((s) => s < -1)) return null;

	const nonZero = semitones.filter((s) => s > 0);
	const hasOpen = semitones.includes(0);

	// Closed left-hand frame spans at most 3 semitones (fingers 1..4)
	const minNonZero = nonZero.length > 0 ? Math.min(...nonZero) : 0;
	if (nonZero.length > 0 && Math.max(...nonZero) - minNonZero > 3) {
		return null;
	}

	const notes: BowedVoicingNote[] = semitones.map((semitone, stringIndex) => {
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
		const info = tuning[stringIndex];
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
			.filter((n): n is BowedVoicingNote & { midi: number } => n.midi !== null)
			.map((n) => n.midi),
	};
}

/**
 * Generates idiomatic closed-frame chord voicings for any 4-string instrument
 * tuned in ascending Perfect Fifths (e.g. Cello C2-G2-D3-A3 or Violin G3-D4-A4-E5).
 */
export function getBowedFifthsVoicings(
	tuning: readonly BowedStringInfo[],
	maxSemitone: number,
	rootNote: string,
	kind: GuitarChordKind,
	chordNotes: string[],
	preferFlats = false,
): BowedVoicing[] {
	const rootPc = noteToPitchClass(rootNote);
	const basePc = tuning[0].openPc;
	const secondPc = tuning[1].openPc;
	const thirdStrLabel = tuning[2].label;
	const secondStrLabel = tuning[1].label;
	const resolveName = createPitchClassNameResolver(chordNotes, [], preferFlats);
	const candidates: [string, string, BowedSemitoneTuple][] = [];

	const f4 = mod12(rootPc - basePc); // String IV offset
	const f3 = mod12(rootPc - secondPc); // String III offset
	const t4 = mod12(rootPc - basePc + 4);
	const m4 = mod12(rootPc - basePc + 3);
	const m3 = mod12(rootPc - secondPc + 3);
	const s4 = mod12(rootPc - basePc + 7);
	const s4Pos = s4 < 2 ? s4 + 12 : s4;

	switch (kind) {
		case "major": {
			const t3 = mod12(rootPc - secondPc + 4);
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
						] as [string, string, BowedSemitoneTuple][])
					: []),
				[
					"root-g3str",
					f3 === 0 ? `Open ${secondStrLabel}-Str` : "Upper 3-Str",
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
					f3 === 0 ? `Open ${secondStrLabel}-Str` : "Upper 3-Str",
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
					? ([
							["open-g-maj7", `Open ${secondStrLabel} Maj7`, [-1, 0, 4, 2]],
						] as [string, string, BowedSemitoneTuple][])
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
			const s7 = mod12(rootPc - basePc + 10);
			const s7Pos = s7 < 2 ? s7 + 12 : s7;
			const b4 = mod12(rootPc - basePc + 6);
			const b4Pos = b4 < 1 ? b4 + 12 : b4;
			candidates.push(
				["halfdim-root", "4-Str Root", [h4, h4 - 1, h4 + 1, h4 + 1]],
				["halfdim-inv3", "♭7-Bass m7♭5", [s7Pos, s7Pos - 2, s7Pos, s7Pos - 1]],
				["halfdim-inv2", "♭5-Bass m7♭5", [b4Pos, b4Pos - 1, b4Pos + 2, b4Pos]],
			);
			break;
		}
		case "aug": {
			candidates.push(
				["aug-4str", "4-Str Aug", [f4, f4 + 1, f4 + 2, f4 + 3]],
				["aug-low", "Low 3-Str Aug", [f4, f4 + 1, f4 + 2, -1]],
				["aug-upper", "Upper 3-Str Aug", [-1, f3, f3 + 1, f3 + 2]],
				["aug-inv1", "1st Inv (3rd Bass)", [t4, t4 + 1, t4 + 2, t4 + 3]],
			);
			break;
		}
		case "dim7": {
			const pRoot = f4 < 1 ? f4 + 12 : f4;
			const pMin3 = m4 < 1 ? m4 + 12 : m4;
			const pDim5 = mod12(rootPc - basePc + 6);
			const pDim5Pos = pDim5 < 1 ? pDim5 + 12 : pDim5;
			const pDim7 = mod12(rootPc - basePc + 9);
			const pDim7Pos = pDim7 < 1 ? pDim7 + 12 : pDim7;
			candidates.push(
				["dim7-root", "4-Str Root", [pRoot, pRoot - 1, pRoot + 1, pRoot]],
				["dim7-inv1", "♭3-Bass Dim7", [pMin3, pMin3 - 1, pMin3 + 1, pMin3]],
				[
					"dim7-inv2",
					"♭5-Bass Dim7",
					[pDim5Pos, pDim5Pos - 1, pDim5Pos + 1, pDim5Pos],
				],
				[
					"dim7-inv3",
					"𝄫7-Bass Dim7",
					[pDim7Pos, pDim7Pos - 1, pDim7Pos + 1, pDim7Pos],
				],
			);
			break;
		}
		case "add9": {
			const t3 = mod12(rootPc - secondPc + 4);
			const d2 = mod12(rootPc - basePc + 2);
			const d2Pos = d2 < 2 ? d2 + 12 : d2;
			const f3Pos = f3 < 3 ? f3 + 12 : f3;
			candidates.push(
				["add9-4str", "4-Str Add9", [t3 + 3, t3, t3 + 3, t3 + 1]],
				["add9-low", "Low 3-Str", [t3 + 3, t3, t3 + 3, -1]],
				["add9-upper", "Upper 3-Str", [-1, f3Pos, f3Pos - 3, f3Pos]],
				["add9-inv9", "9th-Bass Add9", [d2Pos, d2Pos - 2, d2Pos, d2Pos + 1]],
			);
			break;
		}
		case "madd9": {
			const d2 = mod12(rootPc - basePc + 2);
			const d2Pos = d2 < 2 ? d2 + 12 : d2;
			candidates.push(
				[
					"madd9-4str",
					"4-Str m(add9)",
					[d2Pos, d2Pos - 2, d2Pos - 1, d2Pos + 1],
				],
				[
					"madd9-invb3",
					"♭3-Bass m(add9)",
					[d2Pos + 1, d2Pos - 2, d2Pos - 2, d2Pos + 1],
				],
				["madd9-3str", "Upper Shell", [d2Pos, -1, d2Pos - 1, d2Pos + 1]],
			);
			if (d2 === 1) {
				candidates.push([
					"madd9-open-d",
					`Open ${thirdStrLabel} Shell`,
					[1, -1, 0, 2],
				]);
			}
			break;
		}
		case "sus4": {
			const u4 = mod12(rootPc - basePc + 5);
			candidates.push(
				["sus4-4str", "4-Str Sus4", [f4, f4, f4 + 3, f4 + 3]],
				["sus4-upper", "Upper 3-Str", [-1, f3, f3, f3 + 3]],
				["sus4-low", "Low 3-Str", [f4, f4, f4 + 3, -1]],
				["sus4-inv", "4th-Bass Sus4", [u4, u4, u4, u4 + 3]],
			);
			break;
		}
		case "sus2": {
			const d2 = mod12(rootPc - basePc + 2);
			const d2Pos = d2 < 2 ? d2 + 12 : d2;
			candidates.push(
				["sus2-4str", "4-Str Sus2", [f4, f4, f4, f4 + 3]],
				["sus2-upper", "Upper 3-Str", [-1, f3, f3, f3]],
				["sus2-low", "Low 3-Str", [f4, f4, f4, -1]],
				["sus2-inv", "2nd-Bass Sus2", [d2Pos, d2Pos - 2, d2Pos - 2, d2Pos + 1]],
			);
			break;
		}
	}

	const seen = new Set<string>();
	const built: BowedVoicing[] = [];

	for (const [id, name, semitones] of candidates) {
		const key = semitones.join(",");
		if (seen.has(key)) continue;
		const voicing = buildBowedVoicing(
			tuning,
			maxSemitone,
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

export function getBowedVoicings(
	instrument: BowedInstrument,
	rootNote: string,
	kind: GuitarChordKind,
	chordNotes: string[],
	preferFlats = false,
): BowedVoicing[] {
	return getBowedFifthsVoicings(
		BOWED_TUNINGS[instrument],
		MAX_BOWED_SEMITONE,
		rootNote,
		kind,
		chordNotes,
		preferFlats,
	);
}
