import type {
	InstrumentTab,
	SongBar,
	SongChordPaletteEntry,
	SongDocument,
	SongHand,
	SongNoteTechnique,
	SongNoteTuple,
	SongStopTuple,
	SongStudyGuide,
} from "../songs/songRuntime";
import { analyzeKey } from "../theory/circleOfFifths";
import { type SolverOnsetGroup, solveInstrumentStops } from "./ergonomicSolver";
import {
	type InferredHarmony,
	detectKeyFromEvents,
	inferHarmonyForWindow,
	resolveExplicitChordSymbol,
} from "./harmonicAnalyzer";

const MAX_LINEARIZED_BARS = 4096;

export interface ScoreTempoEvent {
	atTick: number;
	bpm: number;
}

export interface ScoreBarTempoChange {
	offsetTicks: number;
	bpm: number;
}

export interface ScoreHarmonyMark {
	offsetTicks: number;
	chordSymbol: string;
}

export interface ScoreNoteIR {
	midi: number;
	offsetTicks: number;
	durationTicks: number;
	velocity: number;
	stringIndex?: number;
	fret?: number;
	finger?: number;
	technique?: SongNoteTechnique;
	slideFromMidi?: number;
	hand?: SongHand;
}

export interface ScoreBarIR {
	barNumber: number;
	cue?: string;
	sectionMarker?: string;
	timeSignature?: { numerator: number; denominator: number };
	durationTicks?: number;
	repeatStart?: boolean;
	repeatEndCount?: number;
	endingNumbers?: number[];
	notes: ScoreNoteIR[];
	harmonies?: ScoreHarmonyMark[];
	tempoChanges?: ScoreBarTempoChange[];
}

export interface ScoreTrackIR {
	id: string;
	title: string;
	composerOrSource: string;
	subtitle?: string;
	instrument: InstrumentTab;
	tuningMidi?: number[];
	capo?: number;
	ticksPerQuarter: number;
	tempoEvents: ScoreTempoEvent[];
	keySignature?: {
		keySlot: number;
		keyMode: "major" | "minor";
		keyLabel: string;
	};
	bars: ScoreBarIR[];
}

export interface CompileScoreOptions {
	id?: string;
	idPrefix?: string;
	title?: string;
	composerOrSource?: string;
	subtitle?: string;
	splitHalfBarHarmony?: boolean;
	studyGuide?: SongStudyGuide;
}

/** Unrolls repeat signs and 1st/2nd endings (voltas) into playback order. */
export function linearizeRepeatedBars(
	bars: readonly ScoreBarIR[],
): ScoreBarIR[] {
	if (bars.length === 0) return [];
	const out: ScoreBarIR[] = [];
	let repeatAnchorIdx = 0;
	const repeatCounters = new Map<number, number>();
	let currentPass = 1;
	let i = 0;
	let guard = 0;
	const maxSteps = Math.min(MAX_LINEARIZED_BARS * 2, bars.length * 6);

	while (
		i < bars.length &&
		guard < maxSteps &&
		out.length < MAX_LINEARIZED_BARS
	) {
		guard++;
		const bar = bars[i];
		if (bar.repeatStart) {
			repeatAnchorIdx = i;
		}
		if (
			bar.endingNumbers &&
			bar.endingNumbers.length > 0 &&
			!bar.endingNumbers.includes(currentPass)
		) {
			i++;
			continue;
		}
		out.push(bar);

		if (bar.repeatEndCount && bar.repeatEndCount > 1) {
			const done = (repeatCounters.get(i) ?? 0) + 1;
			repeatCounters.set(i, done);
			if (done < bar.repeatEndCount) {
				currentPass = done + 1;
				i = repeatAnchorIdx;
				continue;
			}
			currentPass = 1;
		}
		i++;
	}
	return out;
}

function defaultBarTicks(
	ticksPerQuarter: number,
	ts: { numerator: number; denominator: number },
): number {
	return Math.round((ticksPerQuarter * 4 * ts.numerator) / ts.denominator);
}

function inferSectionGuide(
	bars: readonly {
		barNumber: number;
		sectionMarker?: string;
		harmony: InferredHarmony;
	}[],
	title: string,
	keyLabel: string,
	instrument: InstrumentTab,
): SongStudyGuide {
	const sections: SongStudyGuide["sections"] = [];
	let secStart = 0;
	let secTitle = bars[0]?.sectionMarker || "1. Main Theme";
	let secIdx = 1;

	const flushSection = (endIdx: number) => {
		const slice = bars.slice(secStart, endIdx + 1);
		const progs: string[] = [];
		for (const b of slice) {
			if (progs[progs.length - 1] !== b.harmony.chordSymbol) {
				progs.push(b.harmony.chordSymbol);
			}
		}
		sections.push({
			id: `imp-sec-${secIdx}`,
			title: secTitle,
			barRange:
				secStart === endIdx
					? `Bar ${secStart + 1}`
					: `Bars ${secStart + 1}–${endIdx + 1}`,
			startStepIndex: secStart,
			endStepIndex: endIdx,
			progressionTag: progs.slice(0, 6).join(" – "),
			insight: `Measures ${secStart + 1}–${endIdx + 1} in ${keyLabel} moving across ${progs.slice(0, 4).join(" → ")}.`,
		});
		secIdx++;
	};

	for (let i = 1; i < bars.length; i++) {
		const marker = bars[i].sectionMarker;
		if (marker && marker !== secTitle) {
			flushSection(i - 1);
			secStart = i;
			secTitle = `${secIdx}. ${marker}`;
		}
	}
	if (bars.length > 0) {
		flushSection(bars.length - 1);
	}

	return {
		vibeAndSound: `MusicXML ${instrument} arrangement of ${title} in ${keyLabel} with polyphonic timing, dynamics, and instrument fingerings.`,
		harmonyHook: `Tracks ${keyLabel} harmony bar-by-bar against the Circle of Fifths.`,
		practiceTips: [
			"Audition individual sections slowly before stringing the full arrangement together.",
			instrument === "piano"
				? "Follow left-hand accompaniment shapes and right-hand voice leading across the keyboard."
				: "Watch the highlighted fretboard/fingerboard markers to keep left-hand position shifts economical.",
			"Use the Circle of Fifths wheel to spot secondary dominants and chromatic passing chords.",
		],
		sections,
	};
}

interface PreparedOnsetBatch {
	barIdx: number;
	offsetTicks: number;
	notes: ScoreNoteIR[];
}

interface PreparedBarPlan {
	barStartTick: number;
	barDurationTicks: number;
	ts: { numerator: number; denominator: number };
	onsetBatches: PreparedOnsetBatch[];
	stopsPerBatch: ReturnType<typeof solveInstrumentStops>;
	primaryHarmony: InferredHarmony;
	harmonyMarks: Array<{ offsetTicks: number; harmony: InferredHarmony }>;
}

function registerChordInPalette(
	palette: Record<string, SongChordPaletteEntry>,
	harmony: InferredHarmony,
): string {
	const base = harmony.chordSymbol;
	const existing = Object.hasOwn(palette, base) ? palette[base] : undefined;
	if (
		existing &&
		existing.roman === harmony.roman &&
		existing.quality === harmony.quality &&
		existing.notes.join(",") === harmony.chordNotes.join(",")
	) {
		return base;
	}
	let key = base;
	if (existing) {
		key = `${base} (${harmony.roman})`;
	}
	if (!Object.hasOwn(palette, key)) {
		Object.defineProperty(palette, key, {
			value: {
				roman: harmony.roman,
				quality: harmony.quality,
				notes: harmony.chordNotes,
				degree: harmony.circleDegree,
				...(harmony.circleSlotIndex !== undefined
					? { slot: harmony.circleSlotIndex }
					: {}),
				...(harmony.guitarKind !== harmony.quality
					? { guitarKind: harmony.guitarKind }
					: {}),
			},
			enumerable: true,
			configurable: true,
			writable: true,
		});
	}
	return key;
}

function encodeNoteTuple(
	note: ScoreNoteIR,
	instrument: InstrumentTab,
	stop: ReturnType<typeof solveInstrumentStops>[number][number] | undefined,
): SongNoteTuple {
	const velPct = Math.max(5, Math.min(100, Math.round(note.velocity * 100)));
	let tupleStop: SongStopTuple | undefined;
	if (stop) {
		tupleStop =
			instrument === "guitar"
				? [stop.stringIndex, stop.fret]
				: [stop.stringIndex, stop.fret, stop.finger ?? 1];
	} else if (instrument === "piano" && note.hand) {
		tupleStop = note.hand;
	}

	const tech =
		note.technique && note.technique !== "normal" ? note.technique : undefined;
	const base = [
		note.offsetTicks,
		Math.max(1, note.durationTicks),
		note.midi,
		velPct,
	] as const;
	if (note.slideFromMidi !== undefined) {
		return [...base, tech ?? null, tupleStop ?? null, note.slideFromMidi];
	}
	if (tupleStop !== undefined) {
		return [...base, tech ?? null, tupleStop];
	}
	if (tech !== undefined) {
		return [...base, tech];
	}
	return [...base];
}

function dedupeBarsToForm(bars: readonly SongBar[]): {
	uniqueBars: SongBar[];
	form?: number[];
} {
	const uniqueBars: SongBar[] = [];
	const indexBySignature = new Map<string, number>();
	const form: number[] = [];

	for (const bar of bars) {
		const sig = JSON.stringify(bar);
		let idx = indexBySignature.get(sig);
		if (idx === undefined) {
			idx = uniqueBars.length;
			indexBySignature.set(sig, idx);
			uniqueBars.push(bar);
		}
		form.push(idx);
	}

	return uniqueBars.length < bars.length
		? { uniqueBars, form }
		: { uniqueBars };
}

/**
 * Compiles canonical `ScoreTrackIR` into a normalized tick-based `SongDocument`.
 */
export function compileScoreTrackToSongDocument(
	track: ScoreTrackIR,
	options: CompileScoreOptions = {},
): SongDocument {
	const linearBars = linearizeRepeatedBars(track.bars);
	const tpq = Math.max(1, track.ticksPerQuarter);

	let activeTs = linearBars[0]?.timeSignature ?? {
		numerator: 4,
		denominator: 4,
	};
	const firstTs = `${activeTs.numerator}/${activeTs.denominator}`;

	const allWeightedNotes = linearBars.flatMap((bar) =>
		bar.notes.map((n) => ({
			midi: n.midi,
			offsetTicks: n.offsetTicks,
			durationTicks: n.durationTicks,
		})),
	);
	const allHarmonies = linearBars.flatMap((bar) => bar.harmonies ?? []);
	const keyInfo =
		track.keySignature ??
		detectKeyFromEvents(allWeightedNotes, false, {
			harmonies: allHarmonies,
		});
	const keyAnalysis = analyzeKey(keyInfo.keySlot, keyInfo.keyMode);

	const barMetaList: {
		barStartTick: number;
		barDurationTicks: number;
		ts: { numerator: number; denominator: number };
		onsetBatches: PreparedOnsetBatch[];
	}[] = [];
	const allOnsetGroups: SolverOnsetGroup[] = [];
	const barTempoEvents: ScoreTempoEvent[] = [];
	let curBarTick = 0;

	linearBars.forEach((bar, barIdx) => {
		if (bar.timeSignature) activeTs = bar.timeSignature;
		const barDurTicks = bar.durationTicks ?? defaultBarTicks(tpq, activeTs);
		for (const tc of bar.tempoChanges ?? []) {
			if (Number.isFinite(tc.bpm) && tc.bpm > 0) {
				barTempoEvents.push({
					atTick: curBarTick + Math.max(0, tc.offsetTicks),
					bpm: tc.bpm,
				});
			}
		}

		const sortedNotes = [...bar.notes].sort(
			(a, b) => a.offsetTicks - b.offsetTicks || a.midi - b.midi,
		);
		const batches: PreparedOnsetBatch[] = [];
		for (const note of sortedNotes) {
			const prevBatch = batches[batches.length - 1];
			if (
				prevBatch &&
				Math.abs(prevBatch.offsetTicks - note.offsetTicks) <= 2
			) {
				prevBatch.notes.push(note);
			} else {
				batches.push({
					barIdx,
					offsetTicks: note.offsetTicks,
					notes: [note],
				});
			}
		}
		for (const batch of batches) {
			allOnsetGroups.push({
				notes: batch.notes.map((n) => ({
					midi: n.midi,
					stringIndex: n.stringIndex,
					fret: n.fret,
					finger: n.finger,
				})),
			});
		}
		barMetaList.push({
			barStartTick: curBarTick,
			barDurationTicks: barDurTicks,
			ts: activeTs,
			onsetBatches: batches,
		});
		curBarTick += barDurTicks;
	});

	const mergedTempos = [...track.tempoEvents, ...barTempoEvents].filter(
		(t) => Number.isFinite(t.bpm) && t.bpm > 0,
	);
	const tempoByTick = new Map<number, number>();
	for (const ev of mergedTempos) {
		tempoByTick.set(Math.max(0, Math.round(ev.atTick)), ev.bpm);
	}
	const sortedTempos = Array.from(tempoByTick.entries()).sort(
		(a, b) => a[0] - b[0],
	);
	const initialBpm = Math.round(sortedTempos[0]?.[1] ?? 120);
	const tempoMap: Array<[number, number]> =
		sortedTempos.length === 0
			? [[0, 120]]
			: sortedTempos[0][0] > 0
				? [[0, initialBpm], ...sortedTempos]
				: sortedTempos;

	const solvedStops = solveInstrumentStops(
		allOnsetGroups,
		track.instrument,
		track.tuningMidi,
		track.capo ?? 0,
	);
	let globalBatchCursor = 0;

	const guideInput: Array<{
		barNumber: number;
		sectionMarker?: string;
		harmony: InferredHarmony;
	}> = [];
	const preparedBars: PreparedBarPlan[] = linearBars.map((bar, idx) => {
		const meta = barMetaList[idx];
		const stopsPerBatch = meta.onsetBatches.map(
			() => solvedStops[globalBatchCursor++] ?? [],
		);

		const explicitMarks = bar.harmonies ?? [];
		let primaryHarmony =
			(explicitMarks.length > 0
				? resolveExplicitChordSymbol(
						explicitMarks[0].chordSymbol,
						keyInfo.keySlot,
						keyInfo.keyMode,
						keyAnalysis,
					)
				: null) ??
			inferHarmonyForWindow(
				bar.notes,
				keyInfo.keySlot,
				keyInfo.keyMode,
				0,
				tpq,
				keyAnalysis,
			);

		let harmonyMarks: Array<{
			offsetTicks: number;
			harmony: InferredHarmony;
		}> = [{ offsetTicks: 0, harmony: primaryHarmony }];

		if (explicitMarks.length > 1) {
			harmonyMarks = explicitMarks.map((mark) => ({
				offsetTicks: Math.max(0, mark.offsetTicks),
				harmony:
					resolveExplicitChordSymbol(
						mark.chordSymbol,
						keyInfo.keySlot,
						keyInfo.keyMode,
						keyAnalysis,
					) ?? primaryHarmony,
			}));
		} else if (
			options.splitHalfBarHarmony &&
			meta.barDurationTicks >= tpq * 2 &&
			bar.notes.length >= 4
		) {
			const halfOffset = Math.round(meta.barDurationTicks / 2);
			const firstHalf = bar.notes.filter((n) => n.offsetTicks < halfOffset);
			const secondHalf = bar.notes.filter((n) => n.offsetTicks >= halfOffset);
			if (firstHalf.length > 0 && secondHalf.length > 0) {
				const h1 = inferHarmonyForWindow(
					firstHalf,
					keyInfo.keySlot,
					keyInfo.keyMode,
					0,
					tpq,
					keyAnalysis,
				);
				const h2 = inferHarmonyForWindow(
					secondHalf,
					keyInfo.keySlot,
					keyInfo.keyMode,
					halfOffset,
					tpq,
					keyAnalysis,
				);
				if (h1.chordSymbol !== h2.chordSymbol) {
					primaryHarmony = h1;
					harmonyMarks = [
						{ offsetTicks: 0, harmony: h1 },
						{ offsetTicks: halfOffset, harmony: h2 },
					];
				}
			}
		}

		guideInput.push({
			barNumber: idx + 1,
			sectionMarker: bar.sectionMarker,
			harmony: primaryHarmony,
		});

		return {
			barStartTick: meta.barStartTick,
			barDurationTicks: meta.barDurationTicks,
			ts: meta.ts,
			onsetBatches: meta.onsetBatches,
			stopsPerBatch,
			primaryHarmony,
			harmonyMarks,
		};
	});

	const title = options.title ?? track.title;
	const id = options.id ?? track.id;
	const idPrefix =
		options.idPrefix ??
		(id
			.replace(/[^a-zA-Z0-9]/g, "")
			.slice(0, 6)
			.toLowerCase() ||
			"song");
	const chords: Record<string, SongChordPaletteEntry> = {};

	const rawBars: SongBar[] = linearBars.map((bar, idx) => {
		const meta = preparedBars[idx];
		const harmony: Array<[number, string]> = meta.harmonyMarks.map((mark) => [
			mark.offsetTicks,
			registerChordInPalette(chords, mark.harmony),
		]);
		const notes: SongNoteTuple[] = [];
		meta.onsetBatches.forEach((batch, bIdx) => {
			const stops = meta.stopsPerBatch[bIdx] ?? [];
			batch.notes.forEach((n, nIdx) => {
				notes.push(encodeNoteTuple(n, track.instrument, stops[nIdx]));
			});
		});

		const barTs = `${meta.ts.numerator}/${meta.ts.denominator}`;
		const expectedTicks = defaultBarTicks(tpq, meta.ts);
		const customCue =
			bar.cue ||
			(bar.sectionMarker
				? `[${bar.sectionMarker}] ${harmony[0][1]}`
				: undefined);

		return {
			...(barTs !== firstTs ? { ts: barTs } : {}),
			...(meta.barDurationTicks !== expectedTicks
				? { barTicks: meta.barDurationTicks }
				: {}),
			harmony,
			...(customCue ? { cue: customCue } : {}),
			notes,
		};
	});

	const { uniqueBars, form } = dedupeBarsToForm(rawBars);

	return {
		version: 2,
		id,
		idPrefix,
		title,
		composerOrSource: options.composerOrSource ?? track.composerOrSource,
		subtitle:
			options.subtitle ??
			track.subtitle ??
			`${keyInfo.keyLabel} (${firstTs}) · ${track.instrument} MusicXML`,
		instruments: [track.instrument],
		tpq,
		keySlot: keyInfo.keySlot,
		keyMode: keyInfo.keyMode,
		keyLabel: keyInfo.keyLabel,
		timeSignature: firstTs,
		tempoMap,
		...(track.tuningMidi ? { tuning: track.tuningMidi } : {}),
		...(track.capo ? { capo: track.capo } : {}),
		theorySummary: `Ingested from MusicXML in ${keyInfo.keyLabel} (${firstTs}, ${initialBpm} BPM) with polyphonic timing, dynamics, and ergonomic ${track.instrument} fingerings.`,
		studyGuide:
			options.studyGuide ??
			inferSectionGuide(guideInput, title, keyInfo.keyLabel, track.instrument),
		chords,
		...(form ? { form } : {}),
		bars: uniqueBars,
	};
}

export function formatSongDocumentModule(
	doc: SongDocument,
	exportName = "SONG_DOC",
	runtimeImportPath = "../songRuntime",
): string {
	if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportName)) {
		throw new Error(`Invalid TypeScript export identifier "${exportName}".`);
	}
	return `import type { SongDocument } from ${JSON.stringify(runtimeImportPath)};\n\nexport const ${exportName}: SongDocument = ${JSON.stringify(doc, null, "\t")};\n`;
}
