import * as alphaTab from "@coderline/alphatab";
import { Midi } from "@tonejs/midi";
import {
	CELLO_TUNING,
	VIOLIN_TUNING,
} from "../../src/react-app/theory/celloFingerboard";
import {
	mod12,
	noteToPitchClass,
} from "../../src/react-app/theory/circleOfFifths";
import { DEFAULT_GUITAR_TUNING_MIDI } from "../../src/react-app/theory/guitarFretboard";
import type {
	CompactSongSpec,
	InstrumentTab,
	SongNoteTechnique,
} from "../../src/react-app/theory/songExamples";
import { resolveKeySignatureFromRootPc } from "./harmonicAnalyzer";
import {
	type CompileScoreOptions,
	type ScoreBarIR,
	type ScoreHarmonyMark,
	type ScoreNoteIR,
	type ScoreTempoEvent,
	type ScoreTrackIR,
	compileScoreTrackToSongSpec,
} from "./scoreIr";

const ALPHATAB_TICKS_PER_QUARTER = 960;

const STANDARD_CELLO_MIDI = CELLO_TUNING.map((s) => s.openMidi);
const STANDARD_VIOLIN_MIDI = VIOLIN_TUNING.map((s) => s.openMidi);

const DYNAMIC_VELOCITY_TABLE: Readonly<Record<number, number>> = {
	[alphaTab.model.DynamicValue.PPP]: 0.25,
	[alphaTab.model.DynamicValue.PP]: 0.35,
	[alphaTab.model.DynamicValue.P]: 0.48,
	[alphaTab.model.DynamicValue.MP]: 0.62,
	[alphaTab.model.DynamicValue.MF]: 0.75,
	[alphaTab.model.DynamicValue.F]: 0.86,
	[alphaTab.model.DynamicValue.FF]: 0.94,
	[alphaTab.model.DynamicValue.FFF]: 1.0,
	[alphaTab.model.DynamicValue.PPPP]: 0.2,
	[alphaTab.model.DynamicValue.PPPPP]: 0.16,
	[alphaTab.model.DynamicValue.PPPPPP]: 0.12,
	[alphaTab.model.DynamicValue.FFFF]: 1.0,
	[alphaTab.model.DynamicValue.FFFFF]: 1.0,
	[alphaTab.model.DynamicValue.FFFFFF]: 1.0,
};

export interface TrackSummary {
	index: number;
	name: string;
	isPercussion: boolean;
	isStringed: boolean;
	stringCount: number;
	midiProgram: number;
	noteCount: number;
	suggestedInstrument: InstrumentTab | null;
}

export interface CommonImportOptions {
	trackIndex?: number;
	instrument?: InstrumentTab;
	id?: string;
	title?: string;
	composerOrSource?: string;
	subtitle?: string;
	splitHalfBarHarmony?: boolean;
	/** Quantize MIDI note offsets/durations to `4 / subdivision` quarter-note grid (0 disables). */
	quantizeSubdivision?: number;
}

export interface ImportedSongResult {
	trackIr: ScoreTrackIR;
	songSpec: CompactSongSpec;
	selectedTrack: TrackSummary;
	availableTracks: TrackSummary[];
}

function slugifyId(raw: string, fallback = "imported-song"): string {
	const cleaned = raw
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return cleaned || fallback;
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function defaultTuningForInstrument(
	instrument: InstrumentTab,
): readonly number[] {
	switch (instrument) {
		case "cello":
			return STANDARD_CELLO_MIDI;
		case "violin":
			return STANDARD_VIOLIN_MIDI;
		case "guitar":
		default:
			return DEFAULT_GUITAR_TUNING_MIDI;
	}
}

function inferInstrument(
	name: string,
	midiProgram: number,
	lowToHighTuning?: readonly number[],
	isPercussion = false,
): InstrumentTab | null {
	if (isPercussion) return null;
	if (lowToHighTuning && lowToHighTuning.length === 4) {
		if (arraysEqual(lowToHighTuning, STANDARD_CELLO_MIDI)) return "cello";
		if (arraysEqual(lowToHighTuning, STANDARD_VIOLIN_MIDI)) return "violin";
	}
	const lower = name.toLowerCase();
	if (/\bcello\b|violoncello|\bvc\b/.test(lower)) return "cello";
	if (/\bviolin\b|\bfiddle\b|\bvln\b/.test(lower)) return "violin";
	if (
		/\bguitar\b|\bgtr\b|acoustic|nylon|steel|electric|fingerstyle/.test(lower)
	) {
		return "guitar";
	}
	if (midiProgram === 42) return "cello";
	if (midiProgram === 40) return "violin";
	if (midiProgram >= 24 && midiProgram <= 31) return "guitar";
	return "guitar";
}

function selectBestTrack(
	tracks: readonly TrackSummary[],
	explicitIndex?: number,
	requestedInstrument?: InstrumentTab,
): TrackSummary {
	if (tracks.length === 0) {
		throw new Error("Input file contains no tracks.");
	}
	if (explicitIndex !== undefined) {
		const found = tracks.find((t) => t.index === explicitIndex);
		if (!found) {
			throw new Error(
				`Track index ${explicitIndex} out of range (available: 0..${tracks.length - 1}).`,
			);
		}
		return found;
	}

	const pitched = tracks.filter((t) => !t.isPercussion && t.noteCount > 0);
	const candidates =
		pitched.length > 0 ? pitched : tracks.filter((t) => t.noteCount > 0);
	const pool = candidates.length > 0 ? candidates : tracks;

	if (requestedInstrument) {
		const matching = pool.filter(
			(t) => t.suggestedInstrument === requestedInstrument,
		);
		if (matching.length > 0) {
			return [...matching].sort((a, b) => {
				if (requestedInstrument === "guitar" && a.isStringed !== b.isStringed) {
					return a.isStringed ? -1 : 1;
				}
				return b.noteCount - a.noteCount;
			})[0];
		}
	}

	return [...pool].sort((a, b) => b.noteCount - a.noteCount)[0];
}

function summarizeAlphaTabTrack(track: alphaTab.model.Track): TrackSummary {
	const staff = track.staves[0];
	const isPercussion = Boolean(
		staff?.isPercussion || track.playbackInfo.primaryChannel === 9,
	);
	const isStringed = Boolean(staff?.isStringed);
	const reversedTuning =
		staff && staff.tuning.length > 0 ? [...staff.tuning].reverse() : [];
	let noteCount = 0;
	for (const s of track.staves) {
		for (const bar of s.bars) {
			for (const voice of bar.voices) {
				if (voice.isEmpty) continue;
				for (const beat of voice.beats) {
					for (const note of beat.notes) {
						if (!note.isTieDestination) noteCount++;
					}
				}
			}
		}
	}
	return {
		index: track.index,
		name: track.name || `Track ${track.index + 1}`,
		isPercussion,
		isStringed,
		stringCount: reversedTuning.length,
		midiProgram: track.playbackInfo.program,
		noteCount,
		suggestedInstrument: inferInstrument(
			track.name,
			track.playbackInfo.program,
			reversedTuning,
			isPercussion,
		),
	};
}

/**
 * Inspects tracks and metadata of a Guitar Pro or MusicXML binary buffer.
 */
export function inspectAlphaTabScore(bytes: Uint8Array): {
	title: string;
	artist: string;
	tempo: number;
	tracks: TrackSummary[];
} {
	const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
		bytes,
		new alphaTab.Settings(),
	);
	return {
		title: score.title || "",
		artist: score.artist || score.music || "",
		tempo: score.tempo > 0 ? score.tempo : 120,
		tracks: score.tracks.map(summarizeAlphaTabTrack),
	};
}

function dynamicToVelocity(
	dynamic: alphaTab.model.DynamicValue,
	isGhost: boolean,
	isDead: boolean,
): number {
	const base = DYNAMIC_VELOCITY_TABLE[dynamic] ?? 0.78;
	if (isDead) return Math.min(base, 0.38);
	if (isGhost) return Math.max(0.25, base * 0.65);
	return base;
}

function mapAlphaTabNoteArticulation(
	note: alphaTab.model.Note,
	beat: alphaTab.model.Beat,
	instrument: InstrumentTab,
): {
	technique?: SongNoteTechnique;
	slideFromMidi?: number;
	slurToNext?: boolean;
} {
	const slurToNext =
		Boolean(note.isHammerPullOrigin || note.slurDestination !== null) ||
		undefined;

	let slideFromMidi: number | undefined;
	if (note.slideOrigin && Number.isFinite(note.slideOrigin.realValue)) {
		slideFromMidi = Math.round(note.slideOrigin.realValue);
	} else if (note.slideInType === alphaTab.model.SlideInType.IntoFromBelow) {
		slideFromMidi = Math.round(note.realValue) - 2;
	} else if (note.slideInType === alphaTab.model.SlideInType.IntoFromAbove) {
		slideFromMidi = Math.round(note.realValue) + 2;
	}

	if (note.harmonicType !== alphaTab.model.HarmonicType.None) {
		return { technique: "harmonic", slideFromMidi, slurToNext };
	}

	if (slideFromMidi !== undefined) {
		return {
			technique: instrument === "guitar" ? "slide" : "portamento",
			slideFromMidi,
			slurToNext,
		};
	}

	if (instrument === "guitar") {
		if (note.isDead || note.isPalmMute || beat.isPalmMute) {
			return { technique: "palmMute", slurToNext };
		}
		if (note.isHammerPullDestination && note.hammerPullOrigin) {
			return {
				technique:
					note.realValue >= note.hammerPullOrigin.realValue ? "hammer" : "pull",
				slurToNext,
			};
		}
		if (note.isSlurDestination || note.isHammerPullDestination) {
			return { technique: "hammer", slurToNext };
		}
		if (note.isStaccato) return { technique: "staccato", slurToNext };
		if (note.isLetRing || beat.isLetRing) {
			return { technique: "letRing", slurToNext };
		}
		return slurToNext ? { slurToNext } : {};
	}

	// Bowed strings (cello / violin)
	if (
		note.isPalmMute ||
		beat.isPalmMute ||
		(beat.text && /\bpizz\.?/i.test(beat.text))
	) {
		return { technique: "pizzicato", slurToNext };
	}
	if (note.isStaccato) return { technique: "staccato", slurToNext };
	if (note.isSlurDestination || note.isHammerPullDestination) {
		return { technique: "slur", slurToNext };
	}
	return slurToNext ? { slurToNext } : {};
}

function collectTieChainDurationTicks(origin: alphaTab.model.Note): number {
	let total = Math.max(1, origin.beat.playbackDuration);
	let cur = origin.tieDestination;
	const seen = new Set<alphaTab.model.Note>([origin]);
	while (cur && !seen.has(cur)) {
		seen.add(cur);
		total += Math.max(1, cur.beat.playbackDuration);
		cur = cur.tieDestination;
	}
	return total;
}

function decodeAlternateEndings(bitmask: number): number[] {
	if (!bitmask) return [];
	const endings: number[] = [];
	for (let bit = 0; bit < 16; bit++) {
		if ((bitmask & (1 << bit)) !== 0) {
			endings.push(bit + 1);
		}
	}
	return endings;
}

function dedupeTempoEvents(events: ScoreTempoEvent[]): ScoreTempoEvent[] {
	const byTick = new Map<number, number>();
	for (const ev of events) {
		if (ev.bpm > 0 && Number.isFinite(ev.bpm)) {
			byTick.set(Math.max(0, Math.round(ev.atTick)), ev.bpm);
		}
	}
	if (!byTick.has(0)) {
		byTick.set(0, 120);
	}
	return Array.from(byTick.entries())
		.sort((a, b) => a[0] - b[0])
		.map(([atTick, bpm]) => ({ atTick, bpm }));
}

function buildScoreIrFromAlphaTab(
	score: alphaTab.model.Score,
	selectedSummary: TrackSummary,
	options: CommonImportOptions,
): ScoreTrackIR {
	const track = score.tracks[selectedSummary.index];
	const staff = track.staves[0];
	const instrument: InstrumentTab =
		options.instrument ?? selectedSummary.suggestedInstrument ?? "guitar";

	const reversedTuning =
		staff && staff.tuning.length > 0 ? [...staff.tuning].reverse() : undefined;
	const isStandardTuning =
		reversedTuning !== undefined &&
		arraysEqual(reversedTuning, defaultTuningForInstrument(instrument));

	// Tempo map from Score.tempo + MasterBar.tempoAutomations + Beat.automations
	const tempoEvents: ScoreTempoEvent[] = [
		{ atTick: 0, bpm: score.tempo > 0 ? score.tempo : 120 },
	];
	for (const mb of score.masterBars) {
		const mbDur = mb.calculateDuration(true);
		for (const auto of mb.tempoAutomations) {
			if (auto.type === alphaTab.model.AutomationType.Tempo) {
				tempoEvents.push({
					atTick: mb.start + Math.round((auto.ratioPosition ?? 0) * mbDur),
					bpm: auto.value,
				});
			}
		}
	}

	const firstBar = staff.bars[0];
	const firstMb = score.masterBars[0];
	const keyFifths = firstBar?.keySignature ?? firstMb?.keySignature ?? 0;
	const keyType =
		firstBar?.keySignatureType ??
		firstMb?.keySignatureType ??
		alphaTab.model.KeySignatureType.Major;
	const keyMode =
		keyType === alphaTab.model.KeySignatureType.Minor ? "minor" : "major";
	const rootPc = mod12((keyMode === "major" ? 0 : 9) + keyFifths * 7);
	const keySignature = resolveKeySignatureFromRootPc(
		rootPc,
		keyMode,
		keyFifths < 0,
	);

	const quantizeStepTicks =
		options.quantizeSubdivision && options.quantizeSubdivision > 0
			? Math.max(
					1,
					Math.round(
						(4 / options.quantizeSubdivision) * ALPHATAB_TICKS_PER_QUARTER,
					),
				)
			: 0;

	const barsIR: ScoreBarIR[] = [];
	const totalBars = Math.min(score.masterBars.length, staff.bars.length);

	for (let bIdx = 0; bIdx < totalBars; bIdx++) {
		const mb = score.masterBars[bIdx];
		const bar = staff.bars[bIdx];
		const barDurationTicks = Math.max(1, mb.calculateDuration(true));
		const notes: ScoreNoteIR[] = [];
		const harmonyMap = new Map<number, ScoreHarmonyMark>();

		for (let vIdx = 0; vIdx < bar.voices.length; vIdx++) {
			const voice = bar.voices[vIdx];
			if (voice.isEmpty) continue;

			for (const beat of voice.beats) {
				for (const auto of beat.automations) {
					if (auto.type === alphaTab.model.AutomationType.Tempo) {
						tempoEvents.push({
							atTick:
								mb.start +
								beat.playbackStart +
								Math.round((auto.ratioPosition ?? 0) * beat.playbackDuration),
							bpm: auto.value,
						});
					}
				}

				const rawOffset = Math.max(0, beat.playbackStart);
				const offsetTicks =
					quantizeStepTicks > 0
						? Math.min(
								Math.max(0, barDurationTicks - quantizeStepTicks),
								Math.round(rawOffset / quantizeStepTicks) * quantizeStepTicks,
							)
						: rawOffset;

				if (beat.hasChord && beat.chord?.name) {
					harmonyMap.set(offsetTicks, {
						offsetTicks,
						chordSymbol: beat.chord.name.trim(),
					});
				}

				if (beat.isRest) continue;

				for (const note of beat.notes) {
					if (note.isTieDestination) continue;
					const midi = Math.round(note.realValue);
					if (!Number.isFinite(midi) || midi <= 0 || midi > 127) continue;

					let durationTicks = collectTieChainDurationTicks(note);
					if (quantizeStepTicks > 0) {
						durationTicks = Math.max(
							quantizeStepTicks,
							Math.round(durationTicks / quantizeStepTicks) * quantizeStepTicks,
						);
					}
					if (
						(note.isLetRing || beat.isLetRing) &&
						durationTicks < ALPHATAB_TICKS_PER_QUARTER
					) {
						durationTicks = ALPHATAB_TICKS_PER_QUARTER;
					}

					const art = mapAlphaTabNoteArticulation(note, beat, instrument);
					const stringIndex =
						staff.isStringed &&
						Number.isFinite(note.string) &&
						note.string >= 1 &&
						reversedTuning &&
						note.string - 1 < reversedTuning.length
							? note.string - 1
							: undefined;
					const fret =
						stringIndex !== undefined &&
						Number.isFinite(note.fret) &&
						note.fret >= 0
							? note.fret
							: undefined;
					const finger =
						note.leftHandFinger >= 0 && note.leftHandFinger <= 4
							? note.leftHandFinger
							: undefined;

					notes.push({
						midi,
						offsetTicks,
						durationTicks,
						velocity: dynamicToVelocity(
							note.dynamics ?? beat.dynamics,
							note.isGhost,
							note.isDead,
						),
						voiceIndex: vIdx,
						...(stringIndex !== undefined ? { stringIndex } : {}),
						...(fret !== undefined ? { fret } : {}),
						...(finger !== undefined ? { finger } : {}),
						...art,
					});
				}
			}
		}

		const endingNumbers = decodeAlternateEndings(mb.alternateEndings);
		const sectionMarker = mb.section?.text || mb.section?.marker || undefined;

		barsIR.push({
			barNumber: bIdx + 1,
			...(sectionMarker ? { sectionMarker } : {}),
			timeSignature: {
				numerator: mb.timeSignatureNumerator || 4,
				denominator: mb.timeSignatureDenominator || 4,
			},
			durationTicks: barDurationTicks,
			...(mb.isRepeatStart ? { repeatStart: true } : {}),
			...(mb.isRepeatEnd && mb.repeatCount > 1
				? { repeatEndCount: mb.repeatCount }
				: {}),
			...(endingNumbers.length > 0 ? { endingNumbers } : {}),
			notes,
			...(harmonyMap.size > 0
				? {
						harmonies: Array.from(harmonyMap.values()).sort(
							(a, b) => a.offsetTicks - b.offsetTicks,
						),
					}
				: {}),
		});
	}

	const title =
		options.title || score.title || selectedSummary.name || "Imported Score";
	const composerOrSource =
		options.composerOrSource ||
		score.artist ||
		score.music ||
		score.tab ||
		"Imported Score";

	return {
		id: options.id || slugifyId(`${title}-${instrument}`),
		title,
		composerOrSource,
		...(options.subtitle || score.subTitle
			? { subtitle: options.subtitle || score.subTitle }
			: {}),
		instrument,
		...(!isStandardTuning && reversedTuning && reversedTuning.length > 0
			? { tuningMidi: reversedTuning }
			: {}),
		...(staff.capo > 0 ? { capo: staff.capo } : {}),
		ticksPerQuarter: ALPHATAB_TICKS_PER_QUARTER,
		tempoEvents: dedupeTempoEvents(tempoEvents),
		keySignature,
		bars: barsIR,
	};
}

/**
 * Imports a Guitar Pro (.gp, .gp3-.gp8, .gpx) or MusicXML (.xml, .musicxml, .mxl)
 * buffer into canonical `ScoreTrackIR` and compiled `CompactSongSpec`.
 */
export function importScoreWithAlphaTab(
	bytes: Uint8Array,
	options: CommonImportOptions = {},
): ImportedSongResult {
	const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
		bytes,
		new alphaTab.Settings(),
	);
	const availableTracks = score.tracks.map(summarizeAlphaTabTrack);
	const selectedTrack = selectBestTrack(
		availableTracks,
		options.trackIndex,
		options.instrument,
	);
	const trackIr = buildScoreIrFromAlphaTab(score, selectedTrack, options);
	const compileOpts: CompileScoreOptions = {
		...(options.id ? { id: options.id } : {}),
		...(options.title ? { title: options.title } : {}),
		...(options.composerOrSource
			? { composerOrSource: options.composerOrSource }
			: {}),
		...(options.subtitle ? { subtitle: options.subtitle } : {}),
		splitHalfBarHarmony: options.splitHalfBarHarmony,
	};
	const songSpec = compileScoreTrackToSongSpec(trackIr, compileOpts);
	return { trackIr, songSpec, selectedTrack, availableTracks };
}

function summarizeMidiTrack(
	track: Midi["tracks"][number],
	index: number,
): TrackSummary {
	const isPercussion = track.channel === 9;
	const name = track.name || track.instrument.name || `Track ${index + 1}`;
	const program = track.instrument.number;
	return {
		index,
		name,
		isPercussion,
		isStringed: false,
		stringCount: 0,
		midiProgram: program,
		noteCount: track.notes.length,
		suggestedInstrument: inferInstrument(
			name,
			program,
			undefined,
			isPercussion,
		),
	};
}

/**
 * Inspects tracks and header metadata of a Standard MIDI binary buffer.
 */
export function inspectMidiFile(bytes: Uint8Array): {
	name: string;
	ppq: number;
	bpm: number;
	tracks: TrackSummary[];
} {
	const midi = new Midi(bytes);
	return {
		name: midi.name || midi.header.name || "",
		ppq: midi.header.ppq || 480,
		bpm: midi.header.tempos[0]?.bpm ?? 120,
		tracks: midi.tracks.map((tr, idx) => summarizeMidiTrack(tr, idx)),
	};
}

function resolveMidiKeySignature(
	midi: Midi,
): ScoreTrackIR["keySignature"] | undefined {
	const ks = midi.header.keySignatures[0];
	if (!ks?.key) return undefined;
	try {
		const pc = noteToPitchClass(ks.key.trim());
		const mode = ks.scale?.toLowerCase().includes("minor") ? "minor" : "major";
		const preferFlats = ks.key.includes("b") || ks.key === "F";
		return resolveKeySignatureFromRootPc(pc, mode, preferFlats);
	} catch {
		return undefined;
	}
}

/**
 * Imports a Standard MIDI (.mid/.midi) binary buffer into canonical `ScoreTrackIR`
 * and compiled `CompactSongSpec`, running the Viterbi ergonomic solver & harmonic analyzer.
 */
export function importMidiBuffer(
	bytes: Uint8Array,
	options: CommonImportOptions = {},
): ImportedSongResult {
	const midi = new Midi(bytes);
	const availableTracks = midi.tracks.map((tr, idx) =>
		summarizeMidiTrack(tr, idx),
	);
	const selectedTrack = selectBestTrack(
		availableTracks,
		options.trackIndex,
		options.instrument,
	);
	const track = midi.tracks[selectedTrack.index];
	const instrument: InstrumentTab =
		options.instrument ?? selectedTrack.suggestedInstrument ?? "guitar";
	const ppq = midi.header.ppq || 480;

	// Default MIDI quantization is 16th note so audio-to-MIDI chord jitter aligns cleanly.
	const subdivision = options.quantizeSubdivision ?? 16;
	const quantStepTicks =
		subdivision > 0 ? Math.max(1, Math.round((4 / subdivision) * ppq)) : 0;

	const normalizedNotes = track.notes.map((n) => {
		const ticks =
			quantStepTicks > 0
				? Math.round(n.ticks / quantStepTicks) * quantStepTicks
				: n.ticks;
		const durationTicks =
			quantStepTicks > 0
				? Math.max(
						quantStepTicks,
						Math.round(n.durationTicks / quantStepTicks) * quantStepTicks,
					)
				: Math.max(1, n.durationTicks);
		return {
			midi: Math.round(n.midi),
			ticks: Math.max(0, ticks),
			durationTicks,
			velocity: Math.max(0.15, Math.min(1, n.velocity || 0.78)),
		};
	});

	// Merge identical pitches snapped onto the exact same tick
	const dedupedByTickAndPitch = new Map<
		string,
		(typeof normalizedNotes)[number]
	>();
	for (const n of normalizedNotes) {
		const key = `${n.ticks}:${n.midi}`;
		const prev = dedupedByTickAndPitch.get(key);
		if (!prev) {
			dedupedByTickAndPitch.set(key, n);
		} else {
			dedupedByTickAndPitch.set(key, {
				midi: n.midi,
				ticks: n.ticks,
				durationTicks: Math.max(prev.durationTicks, n.durationTicks),
				velocity: Math.max(prev.velocity, n.velocity),
			});
		}
	}
	const sortedNotes = Array.from(dedupedByTickAndPitch.values()).sort(
		(a, b) => a.ticks - b.ticks || a.midi - b.midi,
	);

	// Slice into bars along time signature changes
	const timeSigs =
		midi.header.timeSignatures.length > 0
			? [...midi.header.timeSignatures].sort((a, b) => a.ticks - b.ticks)
			: [{ ticks: 0, timeSignature: [4, 4] }];
	const maxNoteTick = sortedNotes.reduce(
		(mx, n) =>
			Math.max(mx, n.ticks + Math.min(n.durationTicks, quantStepTicks || 1)),
		0,
	);

	const barsIR: ScoreBarIR[] = [];
	let barStartTick = 0;
	let noteCursor = 0;
	let tsIdx = 0;

	do {
		while (
			tsIdx + 1 < timeSigs.length &&
			timeSigs[tsIdx + 1].ticks <= barStartTick
		) {
			tsIdx++;
		}
		const ts = timeSigs[tsIdx].timeSignature;
		const num = ts[0] > 0 ? ts[0] : 4;
		const den = ts[1] > 0 ? ts[1] : 4;
		const barLen = Math.max(1, Math.round(num * (4 / den) * ppq));
		const barEndTick = barStartTick + barLen;

		const barNotes: ScoreNoteIR[] = [];
		while (
			noteCursor < sortedNotes.length &&
			sortedNotes[noteCursor].ticks < barEndTick
		) {
			const n = sortedNotes[noteCursor++];
			if (n.midi >= 21 && n.midi <= 108) {
				barNotes.push({
					midi: n.midi,
					offsetTicks: Math.max(0, n.ticks - barStartTick),
					durationTicks: n.durationTicks,
					velocity: n.velocity,
				});
			}
		}

		barsIR.push({
			barNumber: barsIR.length + 1,
			timeSignature: { numerator: num, denominator: den },
			durationTicks: barLen,
			notes: barNotes,
		});
		barStartTick = barEndTick;
	} while (noteCursor < sortedNotes.length || barStartTick <= maxNoteTick);

	// Trim trailing empty bars produced after the last note, preserving >= 1 bar
	while (barsIR.length > 1 && barsIR[barsIR.length - 1].notes.length === 0) {
		barsIR.pop();
	}

	const tempoEvents = dedupeTempoEvents(
		midi.header.tempos.map((t) => ({ atTick: t.ticks, bpm: t.bpm })),
	);
	const keySignature = resolveMidiKeySignature(midi);
	const title =
		options.title ||
		midi.name ||
		midi.header.name ||
		selectedTrack.name ||
		"Imported MIDI";

	const trackIr: ScoreTrackIR = {
		id: options.id || slugifyId(`${title}-${instrument}`),
		title,
		composerOrSource: options.composerOrSource || "MIDI Transcription",
		...(options.subtitle ? { subtitle: options.subtitle } : {}),
		instrument,
		ticksPerQuarter: ppq,
		tempoEvents,
		...(keySignature ? { keySignature } : {}),
		bars: barsIR,
	};

	const compileOpts: CompileScoreOptions = {
		...(options.id ? { id: options.id } : {}),
		...(options.title ? { title: options.title } : {}),
		...(options.composerOrSource
			? { composerOrSource: options.composerOrSource }
			: {}),
		...(options.subtitle ? { subtitle: options.subtitle } : {}),
		splitHalfBarHarmony: options.splitHalfBarHarmony,
	};
	const songSpec = compileScoreTrackToSongSpec(trackIr, compileOpts);
	return { trackIr, songSpec, selectedTrack, availableTracks };
}
