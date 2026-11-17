import {
	SHARP_CHROMATIC,
	ascendingNotesToMidi,
} from "../../src/react-app/theory/circleOfFifths";
import type {
	BowedSongStop,
	CompactSongBar,
	CompactSongSpec,
	GuitarSongStop,
	InstrumentTab,
	SongBarV2,
	SongChordPaletteEntry,
	SongDocumentV2,
	SongHand,
	SongNoteEvent,
	SongNoteTechnique,
	SongNoteTupleV2,
	SongPerformanceNote,
	SongStopTupleV2,
	SongStudyGuide,
	SongSubBarChord,
} from "../../src/react-app/theory/songExamples";
import { type SolverOnsetGroup, solveInstrumentStops } from "./ergonomicSolver";
import {
	type InferredHarmony,
	detectKeyFromEvents,
	inferHarmonyForWindow,
	resolveExplicitChordSymbol,
} from "./harmonicAnalyzer";

export interface ScoreTempoEvent {
	atTick: number;
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
	voiceIndex?: number;
	stringIndex?: number;
	fret?: number;
	finger?: number;
	technique?: SongNoteTechnique;
	slideFromMidi?: number;
	slurToNext?: boolean;
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

function midiToLabel(midi: number): string {
	const pc = ((midi % 12) + 12) % 12;
	const oct = Math.floor(midi / 12) - 1;
	return `${SHARP_CHROMATIC[pc]}${oct}`;
}

/**
 * Unrolls repeat signs and 1st/2nd endings (voltas) into a linear performance order.
 */
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
	const maxBars = bars.length * 6;

	while (i < bars.length && guard < maxBars) {
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

interface TempoSegment {
	atTick: number;
	atMs: number;
	msPerTick: number;
}

export function buildTempoConverter(
	ticksPerQuarter: number,
	tempoEvents: readonly ScoreTempoEvent[],
): {
	tickToMs: (tick: number) => number;
	initialBpm: number;
} {
	const sorted = [...tempoEvents]
		.filter((t) => Number.isFinite(t.bpm) && t.bpm > 0)
		.sort((a, b) => a.atTick - b.atTick);

	if (sorted.length === 0) {
		sorted.push({ atTick: 0, bpm: 120 });
	} else if (sorted[0].atTick > 0) {
		sorted.unshift({ atTick: 0, bpm: sorted[0].bpm });
	}

	const segments: TempoSegment[] = [];
	let curMs = 0;
	for (let i = 0; i < sorted.length; i++) {
		const ev = sorted[i];
		if (i > 0) {
			const prev = segments[i - 1];
			curMs = prev.atMs + (ev.atTick - prev.atTick) * prev.msPerTick;
		}
		const msPerTick = 60000 / (ev.bpm * ticksPerQuarter);
		segments.push({ atTick: ev.atTick, atMs: curMs, msPerTick });
	}

	const tickToMs = (tick: number): number => {
		let seg = segments[0];
		for (let i = 1; i < segments.length; i++) {
			if (segments[i].atTick <= tick) seg = segments[i];
			else break;
		}
		return (
			Math.round((seg.atMs + (tick - seg.atTick) * seg.msPerTick) * 1000) / 1000
		);
	};

	return { tickToMs, initialBpm: Math.round(sorted[0].bpm) };
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
		vibeAndSound: `Imported ${instrument} performance of ${title} in ${keyLabel} with polyphonic timing, dynamics, and instrument fingerings.`,
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

interface PreparedScorePlan {
	tpq: number;
	firstTs: string;
	title: string;
	id: string;
	idPrefix: string;
	composerOrSource: string;
	subtitle: string;
	keyInfo: ReturnType<typeof detectKeyFromEvents>;
	initialBpm: number;
	tempoMap: Array<[number, number]>;
	tickToMs: (tick: number) => number;
	linearBars: ScoreBarIR[];
	bars: PreparedBarPlan[];
	guideInput: {
		barNumber: number;
		sectionMarker?: string;
		harmony: InferredHarmony;
	}[];
}

function prepareScoreCompilationPlan(
	track: ScoreTrackIR,
	options: CompileScoreOptions = {},
): PreparedScorePlan {
	const linearBars = linearizeRepeatedBars(track.bars);
	const tpq = Math.max(1, track.ticksPerQuarter);
	const { tickToMs, initialBpm } = buildTempoConverter(tpq, track.tempoEvents);

	const rawTempos = [...track.tempoEvents]
		.filter((t) => t.bpm > 0 && Number.isFinite(t.bpm))
		.sort((a, b) => a.atTick - b.atTick);
	const tempoMap: Array<[number, number]> =
		rawTempos.length === 0 || rawTempos[0].atTick > 0
			? [
					[0, initialBpm],
					...rawTempos.map((t): [number, number] => [t.atTick, t.bpm]),
				]
			: rawTempos.map((t): [number, number] => [t.atTick, t.bpm]);

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
	const keyInfo =
		track.keySignature ?? detectKeyFromEvents(allWeightedNotes, false);

	const barMetaList: {
		barStartTick: number;
		barDurationTicks: number;
		ts: { numerator: number; denominator: number };
		onsetBatches: PreparedOnsetBatch[];
	}[] = [];
	const allOnsetGroups: SolverOnsetGroup[] = [];
	let curBarTick = 0;

	linearBars.forEach((bar, barIdx) => {
		if (bar.timeSignature) activeTs = bar.timeSignature;
		const barDurTicks = bar.durationTicks ?? defaultBarTicks(tpq, activeTs);
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

	const solvedStops = solveInstrumentStops(
		allOnsetGroups,
		track.instrument,
		track.tuningMidi,
		track.capo ?? 0,
	);
	let globalBatchCursor = 0;

	const guideInput: PreparedScorePlan["guideInput"] = [];
	const bars: PreparedBarPlan[] = linearBars.map((bar, idx) => {
		const meta = barMetaList[idx];
		const stopsPerBatch = meta.onsetBatches.map(
			() => solvedStops[globalBatchCursor++] ?? [],
		);

		let primaryHarmony: InferredHarmony;
		const explicitMarks = bar.harmonies ?? [];
		if (explicitMarks.length > 0) {
			primaryHarmony =
				resolveExplicitChordSymbol(
					explicitMarks[0].chordSymbol,
					keyInfo.keySlot,
					keyInfo.keyMode,
				) ??
				inferHarmonyForWindow(
					bar.notes,
					keyInfo.keySlot,
					keyInfo.keyMode,
					0,
					tpq,
				);
		} else {
			primaryHarmony = inferHarmonyForWindow(
				bar.notes,
				keyInfo.keySlot,
				keyInfo.keyMode,
				0,
				tpq,
			);
		}

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
				);
				const h2 = inferHarmonyForWindow(
					secondHalf,
					keyInfo.keySlot,
					keyInfo.keyMode,
					halfOffset,
					tpq,
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

	return {
		tpq,
		firstTs,
		title,
		id,
		idPrefix,
		composerOrSource: options.composerOrSource ?? track.composerOrSource,
		subtitle:
			options.subtitle ??
			track.subtitle ??
			`${keyInfo.keyLabel} (${firstTs}) · Imported ${track.instrument} score`,
		keyInfo,
		initialBpm,
		tempoMap,
		tickToMs,
		linearBars,
		bars,
		guideInput,
	};
}

export function compileScoreTrackToSongSpec(
	track: ScoreTrackIR,
	options: CompileScoreOptions = {},
): CompactSongSpec {
	const plan = prepareScoreCompilationPlan(track, options);
	const compactBars: CompactSongBar[] = plan.linearBars.map((bar, idx) => {
		const meta = plan.bars[idx];
		const harmony = meta.primaryHarmony;
		const barStartMs = plan.tickToMs(meta.barStartTick);
		const barEndMs = plan.tickToMs(meta.barStartTick + meta.barDurationTicks);
		const barDurationMs = Math.max(1, Math.round(barEndMs - barStartMs));

		const subBarChords: SongSubBarChord[] | undefined =
			meta.harmonyMarks.length > 1
				? meta.harmonyMarks.map((mark) => ({
						offsetMs: Math.max(
							0,
							Math.round(
								plan.tickToMs(meta.barStartTick + mark.offsetTicks) -
									barStartMs,
							),
						),
						chordSymbol: mark.harmony.chordSymbol,
						roman: mark.harmony.roman,
						quality: mark.harmony.quality,
						guitarKind: mark.harmony.guitarKind,
						chordNotes: mark.harmony.chordNotes,
						circleDegree: mark.harmony.circleDegree,
						circleSlotIndex: mark.harmony.circleSlotIndex,
					}))
				: undefined;

		const events: SongNoteEvent[] = meta.onsetBatches.map((batch, bIdx) => {
			const stops = meta.stopsPerBatch[bIdx] ?? [];
			const absStartTick = meta.barStartTick + batch.offsetTicks;
			const onsetMs = Math.max(
				0,
				Math.round(plan.tickToMs(absStartTick) - barStartMs),
			);
			const perfNotes: SongPerformanceNote[] = batch.notes.map((n) => {
				const noteStartMs = plan.tickToMs(meta.barStartTick + n.offsetTicks);
				const noteEndMs = plan.tickToMs(
					meta.barStartTick + n.offsetTicks + Math.max(1, n.durationTicks),
				);
				const durationSec = Number(
					Math.max(0.06, (noteEndMs - noteStartMs) / 1000).toFixed(3),
				);
				return {
					midi: n.midi,
					durationSec,
					velocity: Number(n.velocity.toFixed(2)),
					...(n.technique && n.technique !== "normal"
						? { technique: n.technique }
						: {}),
					...(n.slideFromMidi !== undefined
						? { slideFromMidi: n.slideFromMidi }
						: {}),
					...(n.slurToNext ? { slurToNext: true } : {}),
					...(n.hand ? { hand: n.hand } : {}),
				};
			});

			const maxDurSec = Math.max(...perfNotes.map((n) => n.durationSec));
			const maxTicks = Math.max(...batch.notes.map((n) => n.durationTicks));
			const stepDurationMs = Math.max(
				40,
				Math.round(
					plan.tickToMs(absStartTick + maxTicks) - plan.tickToMs(absStartTick),
				),
			);
			const topMidi = Math.max(...batch.notes.map((n) => n.midi));
			const noteLabel =
				batch.notes.length >= 3
					? `${midiToLabel(batch.notes[0].midi)}–${midiToLabel(topMidi)}`
					: batch.notes.map((n) => midiToLabel(n.midi)).join("+");

			const event: SongNoteEvent = {
				midi: batch.notes.map((n) => n.midi),
				offsetMs: onsetMs,
				durationSec: maxDurSec,
				stepDurationMs,
				notes: perfNotes,
				velocity: Number(
					(
						batch.notes.reduce((s, n) => s + n.velocity, 0) / batch.notes.length
					).toFixed(2),
				),
				noteLabel,
				...(batch.notes.length >= 3 ? { spreadSec: 0.015 } : { spreadSec: 0 }),
			};

			if (track.instrument === "guitar" && stops.length > 0) {
				event.guitarStops = stops.map((st, sIdx): GuitarSongStop => {
					const tech = batch.notes[sIdx]?.technique;
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
						stringIndex: st.stringIndex,
						fret: st.fret,
						...(mappedTech && mappedTech !== "normal"
							? { technique: mappedTech }
							: {}),
					};
				});
			} else if (
				(track.instrument === "cello" || track.instrument === "violin") &&
				stops.length > 0
			) {
				const bowedStops: BowedSongStop[] = stops.map((st, sIdx) => {
					const tech = batch.notes[sIdx]?.technique;
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
						stringIndex: st.stringIndex,
						semitone: st.fret,
						finger: st.finger ?? 1,
						...(mappedTech && mappedTech !== "normal"
							? { technique: mappedTech }
							: {}),
					};
				});
				if (track.instrument === "cello") event.celloStops = bowedStops;
				else event.violinStops = bowedStops;
			}

			return event;
		});

		const barNumber = idx + 1;
		const displayMidi =
			events[0]?.midi.length > 0
				? events[0].midi
				: ascendingNotesToMidi(harmony.chordNotes);
		const cue =
			bar.cue ||
			`${bar.sectionMarker ? `[${bar.sectionMarker}] ` : ""}${harmony.chordSymbol} (${harmony.roman})`;

		return [
			barNumber,
			harmony.chordSymbol,
			harmony.roman,
			harmony.quality,
			harmony.guitarKind,
			harmony.chordNotes,
			displayMidi,
			harmony.circleDegree,
			cue,
			events,
			harmony.circleSlotIndex,
			{
				barDurationMs,
				...(subBarChords ? { subBarChords } : {}),
			},
		];
	});

	return {
		id: plan.id,
		idPrefix: plan.idPrefix,
		title: plan.title,
		composerOrSource: plan.composerOrSource,
		subtitle: plan.subtitle,
		instruments: [track.instrument],
		keySlot: plan.keyInfo.keySlot,
		keyMode: plan.keyInfo.keyMode,
		keyLabel: plan.keyInfo.keyLabel,
		timeSignature: plan.firstTs,
		bpm: plan.initialBpm,
		...(track.tuningMidi ? { tuning: track.tuningMidi } : {}),
		...(track.capo ? { capo: track.capo } : {}),
		theorySummary: `Compiled from canonical score data in ${plan.keyInfo.keyLabel} (${plan.firstTs}, ${plan.initialBpm} BPM) with polyphonic timing, dynamics, and ergonomic ${track.instrument} fingerings.`,
		studyGuide:
			options.studyGuide ??
			inferSectionGuide(
				plan.guideInput,
				plan.title,
				plan.keyInfo.keyLabel,
				track.instrument,
			),
		bars: compactBars,
	};
}

function registerChordInPalette(
	palette: Record<string, SongChordPaletteEntry>,
	harmony: InferredHarmony,
): string {
	const base = harmony.chordSymbol;
	const existing = palette[base];
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
	if (!palette[key]) {
		palette[key] = {
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
		};
	}
	return key;
}

function encodeNoteTupleV2(
	note: ScoreNoteIR,
	instrument: InstrumentTab,
	stop: ReturnType<typeof solveInstrumentStops>[number][number] | undefined,
): SongNoteTupleV2 {
	const velPct = Math.max(5, Math.min(100, Math.round(note.velocity * 100)));
	let tupleStop: SongStopTupleV2 | undefined;
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

	if (note.slideFromMidi !== undefined) {
		return [
			note.offsetTicks,
			Math.max(1, note.durationTicks),
			note.midi,
			velPct,
			tech ?? null,
			tupleStop ?? null,
			note.slideFromMidi,
		];
	}
	if (tupleStop !== undefined) {
		return [
			note.offsetTicks,
			Math.max(1, note.durationTicks),
			note.midi,
			velPct,
			tech ?? null,
			tupleStop,
		];
	}
	if (tech !== undefined) {
		return [
			note.offsetTicks,
			Math.max(1, note.durationTicks),
			note.midi,
			velPct,
			tech,
		];
	}
	return [note.offsetTicks, Math.max(1, note.durationTicks), note.midi, velPct];
}

function dedupeBarsToForm(bars: readonly SongBarV2[]): {
	uniqueBars: SongBarV2[];
	form?: number[];
} {
	const uniqueBars: SongBarV2[] = [];
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
 * Compiles canonical `ScoreTrackIR` into a normalized tick-based `SongDocumentV2`.
 */
export function compileScoreTrackToSongDocumentV2(
	track: ScoreTrackIR,
	options: CompileScoreOptions = {},
): SongDocumentV2 {
	const plan = prepareScoreCompilationPlan(track, options);
	const chords: Record<string, SongChordPaletteEntry> = {};

	const rawBarsV2: SongBarV2[] = plan.linearBars.map((bar, idx) => {
		const meta = plan.bars[idx];
		const harmony: Array<[number, string]> = meta.harmonyMarks.map((mark) => [
			mark.offsetTicks,
			registerChordInPalette(chords, mark.harmony),
		]);
		const notes: SongNoteTupleV2[] = [];
		meta.onsetBatches.forEach((batch, bIdx) => {
			const stops = meta.stopsPerBatch[bIdx] ?? [];
			batch.notes.forEach((n, nIdx) => {
				notes.push(encodeNoteTupleV2(n, track.instrument, stops[nIdx]));
			});
		});

		const barTs = `${meta.ts.numerator}/${meta.ts.denominator}`;
		const expectedTicks = defaultBarTicks(plan.tpq, meta.ts);
		const customCue =
			bar.cue ||
			(bar.sectionMarker
				? `[${bar.sectionMarker}] ${harmony[0][1]}`
				: undefined);

		return {
			...(barTs !== plan.firstTs ? { ts: barTs } : {}),
			...(meta.barDurationTicks !== expectedTicks
				? { barTicks: meta.barDurationTicks }
				: {}),
			harmony,
			...(customCue ? { cue: customCue } : {}),
			notes,
		};
	});

	const { uniqueBars, form } = dedupeBarsToForm(rawBarsV2);

	return {
		version: 2,
		id: plan.id,
		idPrefix: plan.idPrefix,
		title: plan.title,
		composerOrSource: plan.composerOrSource,
		subtitle: plan.subtitle,
		instruments: [track.instrument],
		tpq: plan.tpq,
		keySlot: plan.keyInfo.keySlot,
		keyMode: plan.keyInfo.keyMode,
		keyLabel: plan.keyInfo.keyLabel,
		timeSignature: plan.firstTs,
		tempoMap: plan.tempoMap,
		...(track.tuningMidi ? { tuning: track.tuningMidi } : {}),
		...(track.capo ? { capo: track.capo } : {}),
		theorySummary: `Compiled from canonical score data in ${plan.keyInfo.keyLabel} (${plan.firstTs}, ${plan.initialBpm} BPM) with polyphonic timing, dynamics, and ergonomic ${track.instrument} fingerings.`,
		studyGuide:
			options.studyGuide ??
			inferSectionGuide(
				plan.guideInput,
				plan.title,
				plan.keyInfo.keyLabel,
				track.instrument,
			),
		chords,
		...(form ? { form } : {}),
		bars: uniqueBars,
	};
}

export function formatSongSpecModule(
	spec: CompactSongSpec | SongDocumentV2,
	exportName: string,
): string {
	const typeName =
		(spec as SongDocumentV2).version === 2
			? "SongDocumentV2"
			: "CompactSongSpec";
	return `import type { ${typeName} } from "./songExamples";\n\nexport const ${exportName}: ${typeName} = ${JSON.stringify(spec, null, "\t")};\n`;
}
