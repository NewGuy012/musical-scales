import { BACH_CELLO_SUITE_1 } from "./bachCelloSuite1";
import type { ChordQuality, KeyMode } from "./circleOfFifths";
import { DEBUSSY_CLAIR_DE_LUNE } from "./debussyClairDeLune";
import type { GuitarChordKind } from "./guitarFretboard";
import { TOMMY_AMAZING_GRACE } from "./tommyAmazingGrace";

export type InstrumentTab = "piano" | "guitar" | "cello";

export interface CelloSongStop {
	stringIndex: number;
	semitone: number;
	finger: number;
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
	celloStops?: CelloSongStop[];
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
	celloStops?: CelloSongStop[];
	guitarStops?: GuitarSongStop[];
}

export const SONG_EXAMPLES: SongExample[] = [
	DEBUSSY_CLAIR_DE_LUNE,
	TOMMY_AMAZING_GRACE,
	BACH_CELLO_SUITE_1,
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
