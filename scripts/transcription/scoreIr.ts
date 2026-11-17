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
	SongNoteEvent,
	SongNoteTechnique,
	SongPerformanceNote,
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

export function compileScoreTrackToSongSpec(
	track: ScoreTrackIR,
	options: CompileScoreOptions = {},
): CompactSongSpec {
	const linearBars = linearizeRepeatedBars(track.bars);
	const tpq = Math.max(1, track.ticksPerQuarter);
	const { tickToMs, initialBpm } = buildTempoConverter(tpq, track.tempoEvents);

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

	// 1. Assign exact bar start ticks and onset groups for the ergonomic solver
	interface OnsetBatch {
		barIdx: number;
		offsetTicks: number;
		notes: ScoreNoteIR[];
	}
	const barMetaList: {
		barStartTick: number;
		barDurationTicks: number;
		ts: { numerator: number; denominator: number };
		onsetBatches: OnsetBatch[];
	}[] = [];
	const allOnsetGroups: SolverOnsetGroup[] = [];
	let curBarTick = 0;

	linearBars.forEach((bar, barIdx) => {
		if (bar.timeSignature) activeTs = bar.timeSignature;
		const barDurTicks = bar.durationTicks ?? defaultBarTicks(tpq, activeTs);
		const sortedNotes = [...bar.notes].sort(
			(a, b) => a.offsetTicks - b.offsetTicks || a.midi - b.midi,
		);
		const batches: OnsetBatch[] = [];
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

	// 2. Solve ergonomic stops across the entire piece continuously
	const solvedStops = solveInstrumentStops(
		allOnsetGroups,
		track.instrument,
		track.tuningMidi,
		track.capo ?? 0,
	);
	let globalBatchCursor = 0;

	// 3. Build CompactSongBar entries + harmony
	const compactBars: CompactSongBar[] = [];
	const guideInput: {
		barNumber: number;
		sectionMarker?: string;
		harmony: InferredHarmony;
	}[] = [];

	linearBars.forEach((bar, idx) => {
		const meta = barMetaList[idx];
		const barStartMs = tickToMs(meta.barStartTick);
		const barEndMs = tickToMs(meta.barStartTick + meta.barDurationTicks);
		const barDurationMs = Math.max(1, Math.round(barEndMs - barStartMs));

		// Resolve bar harmony (explicit harmony mark or beat-weighted inference)
		let harmony: InferredHarmony;
		const explicitMarks = bar.harmonies ?? [];
		if (explicitMarks.length > 0) {
			harmony =
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
			harmony = inferHarmonyForWindow(
				bar.notes,
				keyInfo.keySlot,
				keyInfo.keyMode,
				0,
				tpq,
			);
		}

		let subBarChords: SongSubBarChord[] | undefined;
		if (explicitMarks.length > 1) {
			subBarChords = explicitMarks.map((mark) => {
				const resolved =
					resolveExplicitChordSymbol(
						mark.chordSymbol,
						keyInfo.keySlot,
						keyInfo.keyMode,
					) ?? harmony;
				const absTick = meta.barStartTick + mark.offsetTicks;
				return {
					offsetMs: Math.max(0, Math.round(tickToMs(absTick) - barStartMs)),
					chordSymbol: resolved.chordSymbol,
					roman: resolved.roman,
					quality: resolved.quality,
					guitarKind: resolved.guitarKind,
					chordNotes: resolved.chordNotes,
					circleDegree: resolved.circleDegree,
					circleSlotIndex: resolved.circleSlotIndex,
				};
			});
		} else if (
			options.splitHalfBarHarmony &&
			meta.barDurationTicks >= tpq * 2 &&
			bar.notes.length >= 4
		) {
			const midTick = Math.round(meta.barStartTick + meta.barDurationTicks / 2);
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
					harmony = h1;
					subBarChords = [
						{
							offsetMs: 0,
							chordSymbol: h1.chordSymbol,
							roman: h1.roman,
							quality: h1.quality,
							guitarKind: h1.guitarKind,
							chordNotes: h1.chordNotes,
							circleDegree: h1.circleDegree,
							circleSlotIndex: h1.circleSlotIndex,
						},
						{
							offsetMs: Math.max(0, Math.round(tickToMs(midTick) - barStartMs)),
							chordSymbol: h2.chordSymbol,
							roman: h2.roman,
							quality: h2.quality,
							guitarKind: h2.guitarKind,
							chordNotes: h2.chordNotes,
							circleDegree: h2.circleDegree,
							circleSlotIndex: h2.circleSlotIndex,
						},
					];
				}
			}
		}

		const events: SongNoteEvent[] = meta.onsetBatches.map((batch) => {
			const stops = solvedStops[globalBatchCursor++] ?? [];
			const absStartTick = meta.barStartTick + batch.offsetTicks;
			const onsetMs = Math.max(
				0,
				Math.round(tickToMs(absStartTick) - barStartMs),
			);
			const perfNotes: SongPerformanceNote[] = batch.notes.map((n) => {
				const noteStartMs = tickToMs(meta.barStartTick + n.offsetTicks);
				const noteEndMs = tickToMs(
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
				};
			});

			const maxDurSec = Math.max(...perfNotes.map((n) => n.durationSec));
			const maxTicks = Math.max(...batch.notes.map((n) => n.durationTicks));
			const stepDurationMs = Math.max(
				40,
				Math.round(tickToMs(absStartTick + maxTicks) - tickToMs(absStartTick)),
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

		compactBars.push([
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
		]);
		guideInput.push({
			barNumber,
			sectionMarker: bar.sectionMarker,
			harmony,
		});
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
		id,
		idPrefix,
		title,
		composerOrSource: options.composerOrSource ?? track.composerOrSource,
		subtitle:
			options.subtitle ??
			track.subtitle ??
			`${keyInfo.keyLabel} (${firstTs}) · Imported ${track.instrument} score`,
		instruments: [track.instrument],
		keySlot: keyInfo.keySlot,
		keyMode: keyInfo.keyMode,
		keyLabel: keyInfo.keyLabel,
		timeSignature: firstTs,
		bpm: initialBpm,
		...(track.tuningMidi ? { tuning: track.tuningMidi } : {}),
		...(track.capo ? { capo: track.capo } : {}),
		theorySummary: `Compiled from canonical score data in ${keyInfo.keyLabel} (${firstTs}, ${initialBpm} BPM) with polyphonic timing, dynamics, and ergonomic ${track.instrument} fingerings.`,
		studyGuide:
			options.studyGuide ??
			inferSectionGuide(guideInput, title, keyInfo.keyLabel, track.instrument),
		bars: compactBars,
	};
}

export function formatSongSpecModule(
	spec: CompactSongSpec,
	exportName: string,
): string {
	return `import type { CompactSongSpec } from "./songExamples";\n\nexport const ${exportName}: CompactSongSpec = ${JSON.stringify(spec, null, "\t")};\n`;
}
