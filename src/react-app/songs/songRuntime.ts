import {
	type ChordQuality,
	FLAT_CHROMATIC,
	type KeyMode,
	SHARP_CHROMATIC,
	ascendingNotesToMidi,
	mod12,
} from "../theory/circleOfFifths";
import type {
	GuitarChordKind,
	GuitarSongStop,
	GuitarStopTechnique,
} from "../theory/guitarFretboard";

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

export type SongHand = "rh" | "lh";

export interface SongPerformanceNote {
	midi: number;
	durationSec: number;
	velocity?: number;
	technique?: SongNoteTechnique;
	slideFromMidi?: number;
	slurToNext?: boolean;
	hand?: SongHand;
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
	/** Total bar count for lightweight catalog stubs prior to lazy load. */
	barCount?: number;
	/** True when loaded interactively in-browser from a local MusicXML file. */
	isLocalPreview?: boolean;
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

export type SongStopTuple =
	| [stringIndex: number, fretOrSemitone: number]
	| [stringIndex: number, semitone: number, finger: number]
	| SongHand;

/**
 * Compact tick-based note tuple:
 * `[offsetTicks, durationTicks, midi, velocityPct(0..100), tech?, stop?, slideFromMidi?]`
 */
export type SongNoteTuple = [
	offsetTicks: number,
	durationTicks: number,
	midi: number,
	velocity: number,
	tech?: SongNoteTechnique | null,
	stop?: SongStopTuple | null,
	slideFromMidi?: number,
];

export interface SongChordPaletteEntry {
	roman: string;
	quality: ChordQuality;
	notes: string[];
	degree: number;
	slot?: number;
	guitarKind?: GuitarChordKind;
	displayMidi?: number[];
}

export interface SongBar {
	ts?: string;
	barTicks?: number;
	harmony: Array<[offsetTicks: number, chordKey: string]>;
	cue?: string;
	notes: SongNoteTuple[];
}

export interface SongDocument {
	version: 2;
	id: string;
	idPrefix?: string;
	title: string;
	composerOrSource: string;
	subtitle?: string;
	instruments: InstrumentTab[];
	tpq: number;
	keySlot: number;
	keyMode: KeyMode;
	keyLabel: string;
	timeSignature: string;
	tempoMap: Array<[tick: number, bpm: number]>;
	tuning?: number[];
	capo?: number;
	theorySummary: string;
	studyGuide?: SongStudyGuide;
	chords: Record<string, SongChordPaletteEntry>;
	/** Optional playback order of 0-based indices into `bars` (supports repeat reuse). */
	form?: number[];
	bars: SongBar[];
}

function defaultGuitarKindForQuality(quality: ChordQuality): GuitarChordKind {
	return quality;
}

function preferFlatsForSongKey(keyLabel: string, keySlot: number): boolean {
	if (keyLabel.includes("♭")) return true;
	if (keyLabel.includes("♯")) return false;
	return keySlot >= 8;
}

function formatMidiNoteLabel(midi: number, preferFlats: boolean): string {
	const pc = mod12(midi);
	const oct = Math.floor(midi / 12) - 1;
	const names = preferFlats ? FLAT_CHROMATIC : SHARP_CHROMATIC;
	return `${names[pc]}${oct}`;
}

function parseTimeSignatureTicks(ts: string, tpq: number): number {
	const parts = ts.split("/");
	const num = Number(parts[0]) || 4;
	const den = Number(parts[1]) || 4;
	return Math.max(1, Math.round((tpq * 4 * num) / den));
}

function buildTempoTicksToMs(
	tpq: number,
	tempoMap: readonly [number, number][],
	speed = 1,
): (tick: number) => number {
	const safeTpq = Math.max(1, tpq);
	const safeSpeed = Math.max(0.25, Math.min(2.5, speed));
	const sorted = [...tempoMap]
		.filter(([, bpm]) => bpm > 0)
		.sort((a, b) => a[0] - b[0]);
	if (sorted.length === 0 || sorted[0][0] > 0) {
		sorted.unshift([0, sorted[0]?.[1] ?? 120]);
	}

	const segments: Array<{ startTick: number; startMs: number; bpm: number }> =
		[];
	let accMs = 0;
	for (let i = 0; i < sorted.length; i++) {
		const [tick, bpm] = sorted[i];
		if (i > 0) {
			const prev = sorted[i - 1];
			accMs += ((tick - prev[0]) * 60000) / (prev[1] * safeSpeed * safeTpq);
		}
		segments.push({ startTick: tick, startMs: accMs, bpm });
	}

	return (tick: number) => {
		let seg = segments[0];
		for (let i = 1; i < segments.length; i++) {
			if (segments[i].startTick <= tick) {
				seg = segments[i];
			} else {
				break;
			}
		}
		return (
			seg.startMs +
			((tick - seg.startTick) * 60000) / (seg.bpm * safeSpeed * safeTpq)
		);
	};
}

function resolvePaletteEntry(
	chords: Record<string, SongChordPaletteEntry>,
	key: string | undefined,
): SongChordPaletteEntry {
	if (key && Object.hasOwn(chords, key)) return chords[key];
	const firstKey = Object.keys(chords)[0];
	if (firstKey) return chords[firstKey];
	return {
		roman: "I",
		quality: "major",
		notes: ["C", "E", "G"],
		degree: 1,
	};
}

export function scaleSongExampleSpeed(
	song: SongExample,
	speed: number,
): SongExample {
	const safeSpeed = Math.max(0.25, Math.min(2.5, speed));
	if (Math.abs(safeSpeed - 1) < 0.001) return song;
	const k = 1 / safeSpeed;
	return {
		...song,
		bpm: Math.max(1, Math.round(song.bpm * safeSpeed)),
		steps: song.steps.map((step) => ({
			...step,
			...(step.barDurationMs !== undefined
				? { barDurationMs: Math.round(step.barDurationMs * k * 100) / 100 }
				: {}),
			...(step.subBarChords
				? {
						subBarChords: step.subBarChords.map((sub) => ({
							...sub,
							offsetMs: Math.round(sub.offsetMs * k * 100) / 100,
						})),
					}
				: {}),
			events: step.events.map((ev) => ({
				...ev,
				durationSec: Math.round(ev.durationSec * k * 1000) / 1000,
				stepDurationMs: Math.max(
					1,
					Math.round(ev.stepDurationMs * k * 100) / 100,
				),
				...(ev.offsetMs !== undefined
					? { offsetMs: Math.round(ev.offsetMs * k * 100) / 100 }
					: {}),
				...(ev.notes
					? {
							notes: ev.notes.map((n) => ({
								...n,
								durationSec: Math.round(n.durationSec * k * 1000) / 1000,
							})),
						}
					: {}),
			})),
		})),
	};
}

/**
 * Hydrates a canonical tick-based `SongDocument` into a timed `SongExample`
 * ready for Web Audio playback and instrument visualizer highlighting.
 */
export function hydrateSong(
	doc: SongDocument,
	options?: { speed?: number },
): SongExample {
	const speed = options?.speed ?? 1;
	const ticksToMs = buildTempoTicksToMs(doc.tpq, doc.tempoMap, speed);
	const initialBpm = Math.max(
		1,
		Math.round((doc.tempoMap[0]?.[1] ?? 120) * speed),
	);
	const preferFlats = preferFlatsForSongKey(doc.keyLabel, doc.keySlot);
	const instrument = doc.instruments[0] ?? "guitar";
	const idPrefix =
		doc.idPrefix ?? doc.id.replace(/[^a-z0-9]/gi, "").slice(0, 6);
	const barOrder =
		doc.form && doc.form.length > 0 ? doc.form : doc.bars.map((_, idx) => idx);

	let barStartTick = 0;
	const steps: SongChordStep[] = barOrder.map((barIdx, playIdx) => {
		const bar = doc.bars[barIdx] ?? doc.bars[0];
		const barTicks =
			bar?.barTicks ??
			parseTimeSignatureTicks(bar?.ts ?? doc.timeSignature, doc.tpq);
		const barStartMs = ticksToMs(barStartTick);
		const barEndMs = ticksToMs(barStartTick + barTicks);
		const barDurationMs = Math.max(
			1,
			Math.round((barEndMs - barStartMs) * 100) / 100,
		);

		const primaryChordKey = bar?.harmony[0]?.[1];
		const primaryChord = resolvePaletteEntry(doc.chords, primaryChordKey);
		const chordSymbol = primaryChordKey ?? doc.keyLabel.split(" ")[0] ?? "C";
		const guitarKind =
			primaryChord.guitarKind ??
			defaultGuitarKindForQuality(primaryChord.quality);
		const displayMidi =
			primaryChord.displayMidi ?? ascendingNotesToMidi(primaryChord.notes);

		const subBarChords: SongSubBarChord[] | undefined =
			bar && bar.harmony.length > 1
				? bar.harmony.map(([offTick, hKey]) => {
						const hEntry = resolvePaletteEntry(doc.chords, hKey);
						const offMs = Math.max(
							0,
							Math.round(
								(ticksToMs(barStartTick + offTick) - barStartMs) * 100,
							) / 100,
						);
						return {
							offsetMs: offMs,
							chordSymbol: hKey,
							roman: hEntry.roman,
							quality: hEntry.quality,
							guitarKind:
								hEntry.guitarKind ??
								defaultGuitarKindForQuality(hEntry.quality),
							chordNotes: hEntry.notes,
							circleDegree: hEntry.degree,
							...(hEntry.slot !== undefined
								? { circleSlotIndex: hEntry.slot }
								: {}),
						};
					})
				: undefined;

		const sortedNotes = [...(bar?.notes ?? [])].sort(
			(a, b) => a[0] - b[0] || a[2] - b[2],
		);
		const groups: Array<{ offsetTicks: number; items: SongNoteTuple[] }> = [];
		for (const note of sortedNotes) {
			const last = groups[groups.length - 1];
			if (last && last.offsetTicks === note[0]) {
				last.items.push(note);
			} else {
				groups.push({ offsetTicks: note[0], items: [note] });
			}
		}

		const events: SongNoteEvent[] = groups.map((group, gIdx) => {
			const absStartTick = barStartTick + group.offsetTicks;
			const absStartMs = ticksToMs(absStartTick);
			const offsetMs = Math.round((absStartMs - barStartMs) * 100) / 100;
			const nextTick =
				gIdx + 1 < groups.length
					? barStartTick + groups[gIdx + 1].offsetTicks
					: barStartTick + barTicks;
			const stepDurationMs = Math.max(
				10,
				Math.round((ticksToMs(nextTick) - absStartMs) * 100) / 100,
			);

			const perfNotes: SongPerformanceNote[] = group.items.map((item) => {
				const [, durTicks, midi, velPct, tech, stop, slideFromMidi] = item;
				const absEndMs = ticksToMs(absStartTick + Math.max(1, durTicks));
				const durationSec = Math.max(
					0.03,
					Math.round(((absEndMs - absStartMs) / 1000) * 1000) / 1000,
				);
				const velocity = Math.max(0.05, Math.min(1, velPct / 100));
				const hand = stop === "rh" || stop === "lh" ? stop : undefined;
				return {
					midi,
					durationSec,
					velocity,
					...(tech && tech !== "normal" ? { technique: tech } : {}),
					...(slideFromMidi !== undefined ? { slideFromMidi } : {}),
					...(hand ? { hand } : {}),
				};
			});

			const midis = perfNotes.map((n) => n.midi);
			const maxDurationSec = Math.max(...perfNotes.map((n) => n.durationSec));
			const avgVelocity =
				Math.round(
					(perfNotes.reduce((acc, n) => acc + (n.velocity ?? 0.8), 0) /
						perfNotes.length) *
						1000,
				) / 1000;
			const labels = midis.map((m) => formatMidiNoteLabel(m, preferFlats));
			const noteLabel =
				labels.length <= 3
					? labels.join(" + ")
					: `${labels[0]} chord (${labels.length} notes)`;

			const event: SongNoteEvent = {
				midi: midis,
				offsetMs,
				durationSec: maxDurationSec,
				stepDurationMs,
				notes: perfNotes,
				velocity: avgVelocity,
				noteLabel,
				spreadSec: midis.length >= 3 ? 0.015 : 0,
			};

			const tupleStops = group.items.map((item) => item[5]);
			if (
				instrument === "guitar" &&
				tupleStops.some((st) => Array.isArray(st))
			) {
				event.guitarStops = tupleStops
					.filter((st): st is [number, number] | [number, number, number] =>
						Array.isArray(st),
					)
					.map((st, idx): GuitarSongStop => {
						const tech = perfNotes[idx]?.technique;
						const mappedTech =
							tech &&
							(tech === "normal" ||
								tech === "harmonic" ||
								tech === "hammer" ||
								tech === "pull" ||
								tech === "slide" ||
								tech === "palmMute" ||
								tech === "letRing" ||
								tech === "staccato")
								? tech
								: undefined;
						return {
							stringIndex: st[0],
							fret: st[1],
							...(mappedTech && mappedTech !== "normal"
								? { technique: mappedTech }
								: {}),
						};
					});
			} else if (
				(instrument === "cello" || instrument === "violin") &&
				tupleStops.some((st) => Array.isArray(st))
			) {
				const bowedStops: BowedSongStop[] = tupleStops
					.filter((st): st is [number, number] | [number, number, number] =>
						Array.isArray(st),
					)
					.map((st, idx) => {
						const tech = perfNotes[idx]?.technique;
						const mappedTech =
							tech &&
							(tech === "normal" ||
								tech === "harmonic" ||
								tech === "portamento" ||
								tech === "staccato" ||
								tech === "pizzicato" ||
								tech === "slur")
								? tech
								: undefined;
						return {
							stringIndex: st[0],
							semitone: st[1],
							finger: st[2] ?? 1,
							...(mappedTech && mappedTech !== "normal"
								? { technique: mappedTech }
								: {}),
						};
					});
				if (instrument === "cello") event.celloStops = bowedStops;
				else event.violinStops = bowedStops;
			}

			return event;
		});

		const firstEventMidi = events[0]?.midi;
		const effectiveDisplayMidi =
			firstEventMidi && firstEventMidi.length > 0
				? firstEventMidi
				: displayMidi;

		barStartTick += barTicks;
		return {
			id: `${idPrefix}-bar-${playIdx + 1}`,
			barLabel: `Bar ${playIdx + 1}`,
			chordSymbol,
			roman: primaryChord.roman,
			quality: primaryChord.quality,
			guitarKind,
			chordNotes: primaryChord.notes,
			displayMidi: effectiveDisplayMidi,
			circleDegree: primaryChord.degree,
			...(primaryChord.slot !== undefined
				? { circleSlotIndex: primaryChord.slot }
				: {}),
			cue: bar?.cue || `${chordSymbol} (${primaryChord.roman})`,
			barDurationMs,
			...(subBarChords ? { subBarChords } : {}),
			events,
		};
	});

	return {
		id: doc.id,
		title: doc.title,
		composerOrSource: doc.composerOrSource,
		subtitle: doc.subtitle ?? `${doc.keyLabel} (${doc.timeSignature})`,
		instruments: doc.instruments,
		keySlot: doc.keySlot,
		keyMode: doc.keyMode,
		keyLabel: doc.keyLabel,
		timeSignature: doc.timeSignature,
		bpm: initialBpm,
		...(doc.tuning ? { tuning: doc.tuning } : {}),
		...(doc.capo ? { capo: doc.capo } : {}),
		theorySummary: doc.theorySummary,
		...(doc.studyGuide ? { studyGuide: doc.studyGuide } : {}),
		barCount: steps.length,
		steps,
	};
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
