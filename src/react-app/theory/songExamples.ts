import { BACH_CELLO_SUITE_1_SPEC } from "./bachCelloSuite1";
import { CANNONBALL_RAG_SPEC } from "./cannonballRag";
import type { ChordQuality, KeyMode } from "./circleOfFifths";
import { DEBUSSY_CLAIR_DE_LUNE_SPEC } from "./debussyClairDeLune";
import type { GuitarChordKind } from "./guitarFretboard";
import { HAYDN_CELLO_CONCERTO_2_SPEC } from "./haydnCelloConcerto2";
import { MASSENET_MEDITATION_SPEC } from "./massenetMeditation";
import { SCHUBERT_MOMENT_MUSICAUX_3_SPEC } from "./schubertMomentMusicaux3";
import { TOMMY_AMAZING_GRACE_SPEC } from "./tommyAmazingGrace";

export type InstrumentTab = "piano" | "guitar" | "violin" | "cello";

export interface BowedSongStop {
	stringIndex: number;
	semitone: number;
	finger: number;
	technique?: "normal" | "harmonic" | "portamento";
}

export type GuitarStopTechnique = "normal" | "harmonic" | "hammer" | "slide";

export interface GuitarSongStop {
	stringIndex: number;
	fret: number;
	technique?: GuitarStopTechnique;
}

export interface SongNoteEvent {
	midi: number[];
	durationSec: number;
	stepDurationMs: number;
	noteLabel: string;
	spreadSec?: number;
	celloStops?: BowedSongStop[];
	violinStops?: BowedSongStop[];
	guitarStops?: GuitarSongStop[];
}

export interface SongChordStep {
	id: string;
	barLabel: string;
	chordSymbol: string;
	roman: string;
	quality: ChordQuality;
	guitarKind: GuitarChordKind;
	chordNotes: string[];
	displayMidi: number[];
	circleDegree: number;
	circleSlotIndex?: number;
	cue: string;
	events: SongNoteEvent[];
}

export interface SongSectionGuide {
	id: string;
	title: string;
	barRange: string;
	startStepIndex: number;
	endStepIndex: number;
	progressionTag: string;
	insight: string;
}

export interface SongStudyGuide {
	vibeAndSound: string;
	harmonyHook: string;
	practiceTips: string[];
	sections: SongSectionGuide[];
}

export interface SongExample {
	id: string;
	title: string;
	composerOrSource: string;
	subtitle: string;
	instruments: InstrumentTab[];
	keySlot: number;
	keyMode: KeyMode;
	keyLabel: string;
	timeSignature: string;
	bpm: number;
	theorySummary: string;
	studyGuide?: SongStudyGuide;
	steps: SongChordStep[];
}

export interface FlattenedSongStep {
	atMs: number;
	durationSec: number;
	midi: number[];
	spreadSec?: number;
	chordStepIndex: number;
	chordStep: SongChordStep;
	noteLabel: string;
	celloStops?: BowedSongStop[];
	violinStops?: BowedSongStop[];
	guitarStops?: GuitarSongStop[];
}

export type CompactSongBar = [
	barNumber: number,
	chordSymbol: string,
	roman: string,
	quality: ChordQuality,
	guitarKind: GuitarChordKind,
	chordNotes: string[],
	displayMidi: number[],
	circleDegree: number,
	cue: string,
	events: SongNoteEvent[],
	circleSlotIndex?: number,
];

export interface CompactSongSpec extends Omit<SongExample, "steps"> {
	idPrefix: string;
	bars: CompactSongBar[];
}

function hydrateSong({
	idPrefix,
	bars,
	...meta
}: CompactSongSpec): SongExample {
	return {
		...meta,
		steps: bars.map(
			([
				barNumber,
				chordSymbol,
				roman,
				quality,
				guitarKind,
				chordNotes,
				displayMidi,
				circleDegree,
				cue,
				events,
				circleSlotIndex,
			]) => ({
				id: `${idPrefix}-bar-${barNumber}`,
				barLabel: `Bar ${barNumber}`,
				chordSymbol,
				roman,
				quality,
				guitarKind,
				chordNotes,
				displayMidi,
				circleDegree,
				...(circleSlotIndex !== undefined ? { circleSlotIndex } : {}),
				cue,
				events,
			}),
		),
	};
}

export const SONG_EXAMPLES: SongExample[] = [
	hydrateSong(DEBUSSY_CLAIR_DE_LUNE_SPEC),
	hydrateSong(SCHUBERT_MOMENT_MUSICAUX_3_SPEC),
	hydrateSong(TOMMY_AMAZING_GRACE_SPEC),
	hydrateSong(CANNONBALL_RAG_SPEC),
	hydrateSong(MASSENET_MEDITATION_SPEC),
	hydrateSong(BACH_CELLO_SUITE_1_SPEC),
	hydrateSong(HAYDN_CELLO_CONCERTO_2_SPEC),
];

export function getSongsForInstrument(
	instrument: InstrumentTab,
): SongExample[] {
	return SONG_EXAMPLES.filter((song) => song.instruments.includes(instrument));
}

export function flattenSongPlaybackSteps(song: SongExample): {
	events: FlattenedSongStep[];
	totalDurationMs: number;
} {
	const events: FlattenedSongStep[] = [];
	let currentMs = 0;

	song.steps.forEach((chordStep, chordStepIndex) => {
		for (const evt of chordStep.events) {
			events.push({
				atMs: currentMs,
				durationSec: evt.durationSec,
				midi: evt.midi,
				spreadSec: evt.spreadSec,
				chordStepIndex,
				chordStep,
				noteLabel: evt.noteLabel,
				celloStops: evt.celloStops,
				violinStops: evt.violinStops,
				guitarStops: evt.guitarStops,
			});
			currentMs += evt.stepDurationMs;
		}
	});

	return {
		events,
		totalDurationMs: currentMs,
	};
}

export function getSongBarStartTimes(song: SongExample): number[] {
	const starts: number[] = [];
	let currentMs = 0;

	for (const step of song.steps) {
		starts.push(currentMs);
		for (const evt of step.events) {
			currentMs += evt.stepDurationMs;
		}
	}

	return starts;
}

export function findPlaybackEventAtTime(
	events: FlattenedSongStep[],
	timeMs: number,
): { eventIndex: number; event: FlattenedSongStep | null } {
	if (events.length === 0) {
		return { eventIndex: -1, event: null };
	}

	const clampedMs = Math.max(0, timeMs);
	let low = 0;
	let high = events.length - 1;
	let bestIndex = 0;

	while (low <= high) {
		const mid = (low + high) >> 1;
		if (events[mid].atMs <= clampedMs) {
			bestIndex = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return {
		eventIndex: bestIndex,
		event: events[bestIndex],
	};
}

export function formatSongTime(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "0:00";
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function findSongSectionForBar(
	studyGuide: SongStudyGuide | undefined,
	stepIndex: number,
): SongSectionGuide | null {
	if (!studyGuide || studyGuide.sections.length === 0) return null;
	return (
		studyGuide.sections.find(
			(s) => stepIndex >= s.startStepIndex && stepIndex <= s.endStepIndex,
		) ??
		studyGuide.sections[0] ??
		null
	);
}

export function describeRomanFunction(
	roman: string,
	quality: ChordQuality,
): string {
	if (
		roman.includes("/vi") ||
		roman.includes("/V") ||
		roman.includes("/IV") ||
		roman.includes("/ii") ||
		roman.includes("/iii")
	) {
		return "Secondary dominant · pulls to next chord";
	}
	if (roman.includes("♯iv") || roman.includes("vii°")) {
		return "Chromatic / leading-tone tension";
	}
	if (roman.includes("Picardy")) {
		return "Picardy third · minor turns major";
	}
	if (roman.startsWith("i♭") || roman.startsWith("i♯")) {
		return "Borrowed parallel minor color";
	}
	if (roman.startsWith("iv")) {
		return "Minor subdominant · bittersweet lift";
	}
	if (roman === "i" || roman.startsWith("i6")) {
		return "Minor tonic · home base";
	}
	if (roman.startsWith("III")) {
		return "Relative major (III) · bright lift";
	}
	if (roman.startsWith("VI")) {
		return "Submediant (VI) · warm major color";
	}
	if (roman.startsWith("IV")) {
		return "Subdominant (4th) · warm harmonic lift";
	}
	if (roman.startsWith("V")) {
		return "Dominant (5th) · pulls strongly home";
	}
	if (roman.startsWith("ii")) {
		return "Pre-dominant · sets up V";
	}
	if (roman.startsWith("vi") || roman.startsWith("iii")) {
		return "Relative minor color";
	}
	if (roman.startsWith("I")) {
		return roman.includes("6")
			? "Tonic inversion · gentle home"
			: "Tonic · home base";
	}
	if (quality === "diminished") return "Diminished · passing tension";
	if (quality === "minor") return "Minor color";
	return "Harmonic anchor";
}
