import {
	type BowedSemitoneTuple,
	type BowedStringInfo,
	type BowedVoicing,
	type BowedVoicingNote,
	getBowedFifthsVoicings,
} from "./celloFingerboard";
import type { GuitarChordKind } from "./guitarFretboard";

export type ViolinSemitoneTuple = BowedSemitoneTuple;
export type ViolinStringInfo = BowedStringInfo;
export type ViolinVoicingNote = BowedVoicingNote;
export type ViolinVoicing = BowedVoicing;

// Standard violin tuning in Perfect Fifths: G3 D4 A4 E5
export const VIOLIN_TUNING: ViolinStringInfo[] = [
	{ stringNumber: 4, label: "G", openMidi: 55, openPc: 7 },
	{ stringNumber: 3, label: "D", openMidi: 62, openPc: 2 },
	{ stringNumber: 2, label: "A", openMidi: 69, openPc: 9 },
	{ stringNumber: 1, label: "E", openMidi: 76, openPc: 4 },
];

export const MAX_VIOLIN_SEMITONE = 14;

/**
 * Generates playable closed-frame violin chord voicings across G3–D4–A4–E5.
 */
export function getViolinVoicings(
	rootNote: string,
	kind: GuitarChordKind,
	chordNotes: string[],
	preferFlats = false,
): ViolinVoicing[] {
	return getBowedFifthsVoicings(
		VIOLIN_TUNING,
		MAX_VIOLIN_SEMITONE,
		rootNote,
		kind,
		chordNotes,
		preferFlats,
	);
}
