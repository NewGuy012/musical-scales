import { BACH_CELLO_SUITE_1_SPEC } from "./bachCelloSuite1";
import { CANNONBALL_RAG_SPEC } from "./cannonballRag";
import {
	type ChordQuality,
	type KeyMode,
	ascendingNotesToMidi,
} from "./circleOfFifths";
import { DEBUSSY_CLAIR_DE_LUNE_SPEC } from "./debussyClairDeLune";
import type {
	GuitarChordKind,
	GuitarSongStop,
	GuitarStopTechnique,
} from "./guitarFretboard";
import { HAYDN_CELLO_CONCERTO_2_SPEC } from "./haydnCelloConcerto2";
import { MASSENET_MEDITATION_SPEC } from "./massenetMeditation";
import { SCHUBERT_MOMENT_MUSICAUX_3_SPEC } from "./schubertMomentMusicaux3";
import { TOMMY_AMAZING_GRACE_SPEC } from "./tommyAmazingGrace";

export type { GuitarSongStop, GuitarStopTechnique };

export type InstrumentTab = "piano" | "guitar" | "violin" | "cello";

export type SongNoteTechnique =
	| "normal"
	| "harmonic"
	| "hammer"
	| "pull"
	| "slide"
	| "palmMute"
	| "letRing"
	| "staccato"
	| "portamento"
	| "pizzicato"
	| "slur";

export interface SongPerformanceNote {
	midi: number;
	durationSec: number;
	velocity?: number;
	technique?: SongNoteTechnique;
	slideFromMidi?: number;
	slurToNext?: boolean;
}

export interface SongSubBarChord {
	offsetMs: number;
	chordSymbol: string;
	roman: string;
	quality: ChordQuality;
	guitarKind?: GuitarChordKind;
	chordNotes?: string[];
	circleDegree: number;
	circleSlotIndex?: number;
}

export interface BowedSongStop {
	stringIndex: number;
	semitone: number;
	finger: number;
	technique?:
		"normal" | "harmonic" | "portamento" | "staccato" | "pizzicato" | "slur";
}

export interface SongNoteEvent {
	midi: number[];
	durationSec: number;
	stepDurationMs: number;
	/** Explicit onset offset inside the bar (ms) for polyphonic voices and rests. */
	offsetMs?: number;
	/** Per-note durations, velocities, and techniques matching `midi` entries. */
	notes?: SongPerformanceNote[];
	velocity?: number;
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
	barDurationMs?: number;
	subBarChords?: SongSubBarChord[];
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
	tuning?: number[];
	capo?: number;
	theorySummary: string;
	studyGuide?: SongStudyGuide;
	steps: SongChordStep[];
}

export interface FlattenedSongStep {
	atMs: number;
	durationSec: number;
	midi: number[];
	notes?: SongPerformanceNote[];
	velocity?: number;
	spreadSec?: number;
	chordStepIndex: number;
	chordStep: SongChordStep;
	subBarChord?: SongSubBarChord;
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
	barMeta?: {
		barDurationMs?: number;
		subBarChords?: SongSubBarChord[];
	},
];

export interface CompactSongSpec extends Omit<SongExample, "steps"> {
	idPrefix: string;
	bars: CompactSongBar[];
}

export interface NotationBarSpec {
	barNumber: number;
	chordSymbol: string;
	roman: string;
	quality: ChordQuality;
	guitarKind: GuitarChordKind;
	chordNotes: string[];
	circleDegree: number;
	circleSlotIndex?: number;
	cue: string;
	notation: string;
}

export function mapNotationBars(
	bars: NotationBarSpec[],
	parseBar: (notation: string) => SongNoteEvent[],
	resolveDisplayMidi: (
		bar: NotationBarSpec,
		events: SongNoteEvent[],
	) => number[] = (bar) => ascendingNotesToMidi(bar.chordNotes),
): CompactSongBar[] {
	return bars.map((bar) => {
		const events = parseBar(bar.notation);
		return [
			bar.barNumber,
			bar.chordSymbol,
			bar.roman,
			bar.quality,
			bar.guitarKind,
			bar.chordNotes,
			resolveDisplayMidi(bar, events),
			bar.circleDegree,
			bar.cue,
			events,
			bar.circleSlotIndex,
		];
	});
}

export function hydrateSong({
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
				barMeta,
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
				...(barMeta?.barDurationMs !== undefined
					? { barDurationMs: barMeta.barDurationMs }
					: {}),
				...(barMeta?.subBarChords !== undefined
					? { subBarChords: barMeta.subBarChords }
					: {}),
				events,
			}),
		),
	};
}

export const SONG_EXAMPLES: SongExample[] = [
	hydrateSong(SCHUBERT_MOMENT_MUSICAUX_3_SPEC),
	hydrateSong(DEBUSSY_CLAIR_DE_LUNE_SPEC),
	hydrateSong(CANNONBALL_RAG_SPEC),
	hydrateSong(TOMMY_AMAZING_GRACE_SPEC),
	hydrateSong(MASSENET_MEDITATION_SPEC),
	hydrateSong(BACH_CELLO_SUITE_1_SPEC),
	hydrateSong(HAYDN_CELLO_CONCERTO_2_SPEC),
];

export function getSongsForInstrument(
	instrument: InstrumentTab,
): SongExample[] {
	return SONG_EXAMPLES.filter((song) => song.instruments.includes(instrument));
}

function resolveBarDurationMs(step: SongChordStep): number {
	if (step.barDurationMs !== undefined) return step.barDurationMs;
	const hasOffsets = step.events.some((evt) => evt.offsetMs !== undefined);
	if (hasOffsets) {
		return step.events.reduce(
			(maxEnd, evt) =>
				Math.max(maxEnd, (evt.offsetMs ?? 0) + evt.stepDurationMs),
			0,
		);
	}
	return step.events.reduce((sum, evt) => sum + evt.stepDurationMs, 0);
}

function resolveEventNotes(
	evt: SongNoteEvent,
): SongPerformanceNote[] | undefined {
	if (evt.notes && evt.notes.length > 0) return evt.notes;
	const stopList = evt.guitarStops ?? evt.celloStops ?? evt.violinStops;
	const hasTechnique = Boolean(
		stopList?.some((stop) => stop.technique && stop.technique !== "normal"),
	);
	if (evt.velocity === undefined && !hasTechnique) {
		return undefined;
	}
	return evt.midi.map((midi, idx) => {
		const technique = stopList?.[idx]?.technique;
		return {
			midi,
			durationSec: evt.durationSec,
			...(evt.velocity !== undefined ? { velocity: evt.velocity } : {}),
			...(technique && technique !== "normal" ? { technique } : {}),
		};
	});
}

function resolveSubBarChord(
	step: SongChordStep,
	offsetMs: number,
): SongSubBarChord | undefined {
	const changes = step.subBarChords;
	if (!changes || changes.length === 0) return undefined;
	let matched = changes[0];
	for (const change of changes) {
		if (change.offsetMs <= offsetMs + 0.5) {
			matched = change;
		} else {
			break;
		}
	}
	return matched;
}

function materializeStepNotes(step: FlattenedSongStep): SongPerformanceNote[] {
	if (step.notes && step.notes.length > 0) return step.notes;
	return step.midi.map((midi) => ({
		midi,
		durationSec: step.durationSec,
		...(step.velocity !== undefined ? { velocity: step.velocity } : {}),
	}));
}

export function flattenSongPlaybackSteps(song: SongExample): {
	events: FlattenedSongStep[];
	totalDurationMs: number;
} {
	const rawEvents: FlattenedSongStep[] = [];
	let barStartMs = 0;
	let usedExplicitOffsets = false;

	song.steps.forEach((chordStep, chordStepIndex) => {
		let seqOffsetMs = 0;
		for (const evt of chordStep.events) {
			if (evt.offsetMs !== undefined) usedExplicitOffsets = true;
			if (evt.midi.length === 0) {
				seqOffsetMs += evt.stepDurationMs;
				continue;
			}
			const offsetMs = evt.offsetMs ?? seqOffsetMs;
			const atMs = barStartMs + offsetMs;
			const notes = resolveEventNotes(evt);
			const subBarChord = resolveSubBarChord(chordStep, offsetMs);
			rawEvents.push({
				atMs,
				durationSec: evt.durationSec,
				midi: evt.midi,
				...(notes ? { notes } : {}),
				...(evt.velocity !== undefined ? { velocity: evt.velocity } : {}),
				spreadSec: evt.spreadSec,
				chordStepIndex,
				chordStep,
				...(subBarChord ? { subBarChord } : {}),
				noteLabel: evt.noteLabel,
				celloStops: evt.celloStops,
				violinStops: evt.violinStops,
				guitarStops: evt.guitarStops,
			});
			seqOffsetMs += evt.stepDurationMs;
		}
		barStartMs += resolveBarDurationMs(chordStep);
	});

	if (!usedExplicitOffsets || rawEvents.length <= 1) {
		return {
			events: rawEvents,
			totalDurationMs: barStartMs,
		};
	}

	rawEvents.sort((a, b) => a.atMs - b.atMs);
	const merged: FlattenedSongStep[] = [];
	for (const next of rawEvents) {
		const prev = merged[merged.length - 1];
		if (prev && Math.abs(next.atMs - prev.atMs) <= 0.5) {
			const combinedNotes = [
				...materializeStepNotes(prev),
				...materializeStepNotes(next),
			];
			const mergedLabel =
				prev.noteLabel === next.noteLabel
					? prev.noteLabel
					: `${prev.noteLabel} · ${next.noteLabel}`;
			merged[merged.length - 1] = {
				...prev,
				durationSec: Math.max(prev.durationSec, next.durationSec),
				midi: [...prev.midi, ...next.midi],
				notes: combinedNotes,
				spreadSec: prev.spreadSec ?? next.spreadSec ?? 0,
				noteLabel: mergedLabel,
				...(prev.guitarStops || next.guitarStops
					? {
							guitarStops: [
								...(prev.guitarStops ?? []),
								...(next.guitarStops ?? []),
							],
						}
					: {}),
				...(prev.celloStops || next.celloStops
					? {
							celloStops: [
								...(prev.celloStops ?? []),
								...(next.celloStops ?? []),
							],
						}
					: {}),
				...(prev.violinStops || next.violinStops
					? {
							violinStops: [
								...(prev.violinStops ?? []),
								...(next.violinStops ?? []),
							],
						}
					: {}),
			};
		} else {
			merged.push(next);
		}
	}

	return {
		events: merged,
		totalDurationMs: barStartMs,
	};
}

export function getSongBarStartTimes(song: SongExample): number[] {
	const starts: number[] = [];
	let currentMs = 0;

	for (const step of song.steps) {
		starts.push(currentMs);
		currentMs += resolveBarDurationMs(step);
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
