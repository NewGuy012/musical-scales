import {
	type InstrumentTab,
	type SongDocument,
	type SongNoteTechnique,
	slugifyId,
} from "../songs/songRuntime";
import { CELLO_TUNING, VIOLIN_TUNING } from "../theory/celloFingerboard";
import { NATURAL_PC, mod12, spellNoteOffset } from "../theory/circleOfFifths";
import { DEFAULT_GUITAR_TUNING_MIDI } from "../theory/guitarFretboard";
import { resolveKeySignatureFromRootPc } from "./harmonicAnalyzer";
import { readMusicXmlTextFromBytes } from "./mxlUnpack";
import {
	type CompileScoreOptions,
	type ScoreBarIR,
	type ScoreBarTempoChange,
	type ScoreHarmonyMark,
	type ScoreNoteIR,
	type ScoreTrackIR,
	compileScoreTrackToSongDocument,
} from "./scoreCompiler";
import {
	type XmlNode,
	findChild,
	findChildren,
	getChildText,
	parseXml,
} from "./xmlParser";

const TARGET_TPQ = 960;
const STANDARD_CELLO_MIDI = CELLO_TUNING.map((s) => s.openMidi);
const STANDARD_VIOLIN_MIDI = VIOLIN_TUNING.map((s) => s.openMidi);

const DYNAMIC_VELOCITY_BY_TAG: Readonly<Record<string, number>> = {
	pppppp: 0.12,
	ppppp: 0.16,
	pppp: 0.2,
	ppp: 0.25,
	pp: 0.35,
	p: 0.48,
	mp: 0.62,
	mf: 0.75,
	f: 0.86,
	ff: 0.94,
	fff: 1.0,
	ffff: 1.0,
	fffff: 1.0,
	ffffff: 1.0,
	fp: 0.84,
	sf: 0.94,
	sfz: 0.95,
	sffz: 0.98,
	rf: 0.88,
	rfz: 0.9,
};

const BEAT_UNIT_QUARTERS: Readonly<Record<string, number>> = {
	maxima: 32,
	long: 16,
	breve: 8,
	whole: 4,
	half: 2,
	quarter: 1,
	eighth: 0.5,
	"16th": 0.25,
	"32nd": 0.125,
	"64th": 0.0625,
};

const MUSICXML_KIND_SUFFIX: Readonly<Record<string, string>> = {
	major: "",
	minor: "m",
	augmented: "aug",
	diminished: "dim",
	dominant: "7",
	"major-seventh": "maj7",
	"minor-seventh": "m7",
	"diminished-seventh": "dim7",
	"augmented-seventh": "7♯5",
	"half-diminished": "m7♭5",
	"major-minor": "m(maj7)",
	"major-sixth": "6",
	"minor-sixth": "m6",
	"dominant-ninth": "9",
	"major-ninth": "maj9",
	"minor-ninth": "m9",
	"dominant-11th": "11",
	"major-11th": "maj11",
	"minor-11th": "m11",
	"dominant-13th": "13",
	"major-13th": "maj13",
	"minor-13th": "m13",
	"suspended-second": "sus2",
	"suspended-fourth": "sus4",
	power: "5",
	none: "",
};

export interface MusicXmlPartSummary {
	index: number;
	partId: string;
	name: string;
	isPercussion: boolean;
	isStringed: boolean;
	stringCount: number;
	staffCount: number;
	midiProgram: number;
	noteCount: number;
	suggestedInstrument: InstrumentTab | null;
}

export interface MusicXmlInspection {
	title: string;
	composerOrSource: string;
	subtitle?: string;
	tempo: number;
	parts: MusicXmlPartSummary[];
}

export interface MusicXmlImportOptions {
	partIndex?: number;
	partId?: string;
	instrument?: InstrumentTab;
	id?: string;
	title?: string;
	composerOrSource?: string;
	subtitle?: string;
	splitHalfBarHarmony?: boolean;
	/** Snap note offsets/durations to `4 / subdivision` quarter-note grid (0 = lossless). */
	quantizeSubdivision?: number;
	studyGuide?: CompileScoreOptions["studyGuide"];
}

export interface ImportedMusicXmlResult {
	trackIr: ScoreTrackIR;
	songDoc: SongDocument;
	selectedPart: MusicXmlPartSummary;
	availableParts: MusicXmlPartSummary[];
}

interface PartMetadata {
	id: string;
	name: string;
	instrumentSound: string;
	midiProgram: number;
	midiChannel: number;
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

function pitchToMidi(
	step: string,
	alter: number,
	octave: number,
): number | null {
	const key = step.toUpperCase();
	const basePc = Object.hasOwn(NATURAL_PC, key) ? NATURAL_PC[key] : undefined;
	if (basePc === undefined || !Number.isFinite(octave)) return null;
	return (octave + 1) * 12 + basePc + alter;
}

interface NormalizedScore {
	partMetaList: PartMetadata[];
	parts: XmlNode[];
	title: string;
	composerOrSource: string;
	subtitle?: string;
}

function normalizeScorePartwise(root: XmlNode): NormalizedScore {
	if (root.tag !== "score-partwise" && root.tag !== "score-timewise") {
		throw new Error(
			`Expected MusicXML <score-partwise> or <score-timewise>, found <${root.tag}>.`,
		);
	}

	const partListNode = findChild(root, "part-list");
	const partMetaList: PartMetadata[] = [];
	if (partListNode) {
		for (const sp of findChildren(partListNode, "score-part")) {
			const id = sp.attrs.id || `P${partMetaList.length + 1}`;
			const scoreInst = findChild(sp, "score-instrument");
			const midiInst = findChild(sp, "midi-instrument");
			const partName =
				getChildText(sp, "part-name") ||
				(scoreInst ? getChildText(scoreInst, "instrument-name") : undefined) ||
				`Part ${partMetaList.length + 1}`;
			const instrumentSound =
				(scoreInst ? getChildText(scoreInst, "instrument-sound") : undefined) ??
				"";
			const midiProgramRaw = midiInst
				? Number.parseInt(getChildText(midiInst, "midi-program") ?? "0", 10)
				: 0;
			const midiChannelRaw = midiInst
				? Number.parseInt(getChildText(midiInst, "midi-channel") ?? "0", 10)
				: 0;

			partMetaList.push({
				id,
				name: partName,
				instrumentSound,
				midiProgram: Number.isFinite(midiProgramRaw) ? midiProgramRaw : 0,
				midiChannel: Number.isFinite(midiChannelRaw) ? midiChannelRaw : 0,
			});
		}
	}

	let parts: XmlNode[];
	if (root.tag === "score-partwise") {
		parts = findChildren(root, "part");
	} else {
		// Convert <score-timewise> (<measure><part>...) into partwise <part><measure>...
		const timewiseMeasures = findChildren(root, "measure");
		const byPartId = new Map<string, XmlNode[]>();
		for (const m of timewiseMeasures) {
			for (const p of findChildren(m, "part")) {
				const pid = p.attrs.id || "P1";
				let list = byPartId.get(pid);
				if (!list) {
					list = [];
					byPartId.set(pid, list);
				}
				list.push({
					tag: "measure",
					attrs: { ...m.attrs },
					children: p.children,
					text: p.text,
				});
			}
		}
		const orderedIds =
			partMetaList.length > 0
				? partMetaList.map((m) => m.id)
				: Array.from(byPartId.keys());
		parts = orderedIds.map((pid) => ({
			tag: "part",
			attrs: { id: pid },
			children: byPartId.get(pid) ?? [],
			text: "",
		}));
	}

	const work = findChild(root, "work");
	const workTitle = work ? getChildText(work, "work-title") : undefined;
	const workNumber = work ? getChildText(work, "work-number") : undefined;
	const movementTitle = getChildText(root, "movement-title");
	const title = workTitle || movementTitle || "Imported MusicXML";
	const subtitle =
		workTitle && movementTitle && movementTitle !== workTitle
			? movementTitle
			: workNumber;

	const identification = findChild(root, "identification");
	let composerOrSource = "MusicXML Score";
	if (identification) {
		const creators = findChildren(identification, "creator");
		const composer =
			creators.find((c) => c.attrs.type === "composer") ??
			creators.find((c) => c.attrs.type === "arranger") ??
			creators[0];
		if (composer && composer.text.trim()) {
			composerOrSource = composer.text.trim();
		}
	}

	return { partMetaList, parts, title, composerOrSource, subtitle };
}

function parseStaffTuningNode(staffDetails: XmlNode): number[] {
	const entries: Array<{ line: number; midi: number }> = [];
	for (const st of findChildren(staffDetails, "staff-tuning")) {
		const line = Number.parseInt(
			st.attrs.line ?? String(entries.length + 1),
			10,
		);
		const step = getChildText(st, "tuning-step");
		const alter = Number.parseInt(getChildText(st, "tuning-alter") ?? "0", 10);
		const octave = Number.parseInt(
			getChildText(st, "tuning-octave") ?? "4",
			10,
		);
		if (!step) continue;
		const midi = pitchToMidi(step, Number.isFinite(alter) ? alter : 0, octave);
		if (midi !== null) {
			entries.push({
				line: Number.isFinite(line) ? line : entries.length + 1,
				midi,
			});
		}
	}
	if (entries.length === 0) return [];
	entries.sort((a, b) => a.line - b.line);
	const midiList = entries.map((e) => e.midi);
	// Normalize low-to-high string order
	if (midiList.length > 1 && midiList[0] > midiList[midiList.length - 1]) {
		midiList.reverse();
	}
	return midiList;
}

function inferInstrumentForPart(
	meta: PartMetadata,
	lowToHighTuning: readonly number[],
	isPercussion: boolean,
	staffCount: number,
	isStringed: boolean,
	minMidi: number,
	maxMidi: number,
): InstrumentTab | null {
	if (isPercussion) return null;

	if (lowToHighTuning.length === 4) {
		if (arraysEqual(lowToHighTuning, STANDARD_CELLO_MIDI)) return "cello";
		if (arraysEqual(lowToHighTuning, STANDARD_VIOLIN_MIDI)) return "violin";
	}
	if (lowToHighTuning.length >= 6) {
		return "guitar";
	}

	const combined = `${meta.name} ${meta.instrumentSound}`.toLowerCase();
	if (/\bcello\b|violoncello|\bvc\b|strings\.cello/.test(combined)) {
		return "cello";
	}
	if (/\bviolin\b|\bfiddle\b|\bvln\b|strings\.violin/.test(combined)) {
		return "violin";
	}
	if (
		/\bguitar\b|\bgtr\b|nylon|steel|fingerstyle|pluck\.guitar/.test(combined)
	) {
		return "guitar";
	}
	if (
		/\bpiano\b|keyboard|\bklavier\b|\bpno\b|\bgrand\b|\bharpsichord\b|\brhodes\b|keyboard\.piano/.test(
			combined,
		)
	) {
		return "piano";
	}

	if (!isStringed && staffCount >= 2) return "piano";
	// MusicXML <midi-program> is 1-based (1..128)
	if (meta.midiProgram >= 1 && meta.midiProgram <= 8) return "piano";
	if (meta.midiProgram >= 25 && meta.midiProgram <= 32) return "guitar";
	if (meta.midiProgram === 41) return "violin";
	if (meta.midiProgram === 43) return "cello";

	if (isStringed) return "guitar";
	if (Number.isFinite(minMidi) && Number.isFinite(maxMidi)) {
		if (minMidi < 55 && maxMidi <= 81) return "cello";
		if (minMidi >= 55 && maxMidi >= 76) return "violin";
	}
	return "piano";
}

function summarizePart(
	partNode: XmlNode,
	index: number,
	partMetaList: readonly PartMetadata[],
): MusicXmlPartSummary {
	const partId = partNode.attrs.id || `P${index + 1}`;
	const meta = partMetaList.find((m) => m.id === partId) ??
		partMetaList[index] ?? {
			id: partId,
			name: `Part ${index + 1}`,
			instrumentSound: "",
			midiProgram: 0,
			midiChannel: 0,
		};

	let isPercussion = meta.midiChannel === 10;
	let isStringed = false;
	let staffCount = 1;
	let tuning: number[] = [];
	let noteCount = 0;
	let minMidi = Infinity;
	let maxMidi = -Infinity;

	for (const measure of findChildren(partNode, "measure")) {
		const attrs = findChild(measure, "attributes");
		if (attrs) {
			const stavesVal = Number.parseInt(
				getChildText(attrs, "staves") ?? "0",
				10,
			);
			if (stavesVal > staffCount) staffCount = stavesVal;

			for (const clef of findChildren(attrs, "clef")) {
				const sign = (getChildText(clef, "sign") ?? "").toUpperCase();
				if (sign === "TAB") isStringed = true;
				if (sign === "PERCUSSION") isPercussion = true;
			}

			for (const sd of findChildren(attrs, "staff-details")) {
				const parsedTuning = parseStaffTuningNode(sd);
				if (parsedTuning.length > 0 && tuning.length === 0) {
					tuning = parsedTuning;
					isStringed = true;
				}
			}
		}

		for (const note of findChildren(measure, "note")) {
			if (findChild(note, "unpitched")) isPercussion = true;
			if (findChild(note, "rest")) continue;
			const notations = findChild(note, "notations");
			const hasTieStop =
				findChildren(note, "tie").some((t) => t.attrs.type === "stop") ||
				(notations
					? findChildren(notations, "tied").some((t) => t.attrs.type === "stop")
					: false);
			if (!hasTieStop) noteCount++;
			const pitch = findChild(note, "pitch");
			if (pitch) {
				const step = getChildText(pitch, "step") ?? "C";
				const alter = Number.parseFloat(getChildText(pitch, "alter") ?? "0");
				const octave = Number.parseInt(
					getChildText(pitch, "octave") ?? "4",
					10,
				);
				const midi = pitchToMidi(
					step,
					Number.isFinite(alter) ? Math.round(alter) : 0,
					octave,
				);
				if (midi !== null) {
					if (midi < minMidi) minMidi = midi;
					if (midi > maxMidi) maxMidi = midi;
				}
			}
		}
	}

	return {
		index,
		partId,
		name: meta.name,
		isPercussion,
		isStringed,
		stringCount: tuning.length,
		staffCount,
		midiProgram: meta.midiProgram,
		noteCount,
		suggestedInstrument: inferInstrumentForPart(
			meta,
			tuning,
			isPercussion,
			staffCount,
			isStringed,
			minMidi,
			maxMidi,
		),
	};
}

function selectBestPart(
	parts: readonly MusicXmlPartSummary[],
	options: MusicXmlImportOptions,
): MusicXmlPartSummary {
	if (parts.length === 0) {
		throw new Error("MusicXML document contains no <part> elements.");
	}
	if (options.partId !== undefined) {
		const byId = parts.find((p) => p.partId === options.partId);
		if (!byId) {
			throw new Error(
				`Part ID "${options.partId}" not found (available: ${parts.map((p) => p.partId).join(", ")}).`,
			);
		}
		return byId;
	}
	if (options.partIndex !== undefined) {
		const byIdx = parts.find((p) => p.index === options.partIndex);
		if (!byIdx) {
			throw new Error(
				`Part index ${options.partIndex} out of range (available: 0..${parts.length - 1}).`,
			);
		}
		return byIdx;
	}

	const pitched = parts.filter((p) => !p.isPercussion && p.noteCount > 0);
	const nonEmpty = parts.filter((p) => p.noteCount > 0);
	const pool =
		pitched.length > 0 ? pitched : nonEmpty.length > 0 ? nonEmpty : parts;

	if (options.instrument) {
		const matching = pool.filter(
			(p) => p.suggestedInstrument === options.instrument,
		);
		if (matching.length > 0) {
			return [...matching].sort((a, b) => {
				if (options.instrument === "guitar" && a.isStringed !== b.isStringed) {
					return a.isStringed ? -1 : 1;
				}
				return b.noteCount - a.noteCount;
			})[0];
		}
	}

	return [...pool].sort((a, b) => b.noteCount - a.noteCount)[0];
}

function parseHarmonyNode(harmonyNode: XmlNode): string | null {
	const root = findChild(harmonyNode, "root");
	if (!root) return null;
	const rootStep = getChildText(root, "root-step");
	if (!rootStep) return null;
	const rootAlter = Number.parseFloat(getChildText(root, "root-alter") ?? "0");
	const rootLetter = rootStep.toUpperCase();
	const rootName =
		spellNoteOffset(
			rootLetter,
			Number.isFinite(rootAlter) ? Math.round(rootAlter) : 0,
		) ?? rootLetter;

	const kindNode = findChild(harmonyNode, "kind");
	let suffix = "";
	if (kindNode) {
		const textAttr = kindNode.attrs.text?.trim();
		const kindName = kindNode.text.trim().toLowerCase();
		if (textAttr && kindName !== "none") {
			suffix = textAttr;
		} else if (Object.hasOwn(MUSICXML_KIND_SUFFIX, kindName)) {
			suffix = MUSICXML_KIND_SUFFIX[kindName];
		}
	}

	const bass = findChild(harmonyNode, "bass");
	let bassSuffix = "";
	if (bass) {
		const bassStep = getChildText(bass, "bass-step");
		if (bassStep) {
			const bassAlter = Number.parseFloat(
				getChildText(bass, "bass-alter") ?? "0",
			);
			const bassLetter = bassStep.toUpperCase();
			bassSuffix = `/${
				spellNoteOffset(
					bassLetter,
					Number.isFinite(bassAlter) ? Math.round(bassAlter) : 0,
				) ?? bassLetter
			}`;
		}
	}

	return `${rootName}${suffix}${bassSuffix}`;
}

function parseMetronomeQuarterBpm(metronomeNode: XmlNode): number | null {
	const perMinRaw = getChildText(metronomeNode, "per-minute");
	if (!perMinRaw) return null;
	const perMin = Number.parseFloat(perMinRaw);
	if (!Number.isFinite(perMin) || perMin <= 0) return null;

	const beatUnit = (
		getChildText(metronomeNode, "beat-unit") ?? "quarter"
	).toLowerCase();
	const baseQuarters = Object.hasOwn(BEAT_UNIT_QUARTERS, beatUnit)
		? BEAT_UNIT_QUARTERS[beatUnit]
		: 1;
	const dotCount = findChildren(metronomeNode, "beat-unit-dot").length;
	let dotMult = 1;
	for (let d = 1; d <= dotCount; d++) {
		dotMult += 1 / 2 ** d;
	}
	return Math.round(perMin * baseQuarters * dotMult * 100) / 100;
}

function parseSoundTempo(node: XmlNode): number | null {
	const raw = node.attrs.tempo;
	if (!raw) return null;
	const bpm = Number.parseFloat(raw);
	return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

function applyPianoPedalIntervals(
	bars: readonly ScoreBarIR[],
	pedalIntervals: readonly { start: number; end: number }[],
	maxExtendTicks: number,
): void {
	if (pedalIntervals.length === 0) return;
	let barAbsTick = 0;
	for (const bar of bars) {
		for (const note of bar.notes) {
			const absStart = barAbsTick + note.offsetTicks;
			const absEnd = absStart + note.durationTicks;
			for (const iv of pedalIntervals) {
				if (absStart < iv.end && absEnd >= iv.start && absEnd < iv.end) {
					const extendedEnd = Math.min(iv.end, absStart + maxExtendTicks);
					if (extendedEnd > absEnd) {
						note.durationTicks = extendedEnd - absStart;
					}
					break;
				}
			}
		}
		barAbsTick += bar.durationTicks ?? TARGET_TPQ * 4;
	}
}

function buildTrackIrFromPart(
	score: NormalizedScore,
	selectedSummary: MusicXmlPartSummary,
	options: MusicXmlImportOptions,
): ScoreTrackIR {
	const {
		parts,
		title: scoreTitle,
		composerOrSource: scoreComposer,
		subtitle: scoreSubtitle,
	} = score;
	const partNode = parts[selectedSummary.index];
	const instrument: InstrumentTab =
		options.instrument ?? selectedSummary.suggestedInstrument ?? "piano";

	const quantizeStepTicks =
		options.quantizeSubdivision && options.quantizeSubdivision > 0
			? Math.max(1, Math.round((4 / options.quantizeSubdivision) * TARGET_TPQ))
			: 0;

	let divisions = 1;
	let activeTs = { numerator: 4, denominator: 4 };
	let staffCount = selectedSummary.staffCount;
	let tuningMidi: number[] | undefined;
	let capo = 0;
	let keySignature: ScoreTrackIR["keySignature"] | undefined;
	const transposeByStaff = new Map<number, number>();
	let initialBpm = 120;
	let hasInitialTempo = false;

	const activeVelocityByStaff = new Map<number, number>();
	const activeTies = new Map<string, ScoreNoteIR>();
	const activeSlides = new Map<string, number>();

	let pizzActive = false;
	let palmMuteActive = false;
	let letRingActive = false;

	let pedalDownTick: number | null = null;
	const pedalIntervals: Array<{ start: number; end: number }> = [];

	const barsIR: ScoreBarIR[] = [];
	const measures = findChildren(partNode, "measure");
	let absTickCursor = 0;

	for (let mIdx = 0; mIdx < measures.length; mIdx++) {
		const measure = measures[mIdx];
		const barNotes: ScoreNoteIR[] = [];
		const harmonyMap = new Map<number, ScoreHarmonyMark>();
		const tempoChanges: ScoreBarTempoChange[] = [];

		let repeatStart = false;
		let repeatEndCount: number | undefined;
		let endingNumbers: number[] = [];
		let sectionMarker: string | undefined;

		const recordTempo = (tick: number, bpm: number | null) => {
			if (bpm === null) return;
			tempoChanges.push({ offsetTicks: tick, bpm });
			if (!hasInitialTempo) {
				initialBpm = bpm;
				hasInitialTempo = true;
			}
		};

		let cursorTicks = 0;
		let lastNonChordOnset = 0;
		let maxCursorTicks = 0;
		let currentBarDurationEstimate = Math.round(
			(TARGET_TPQ * 4 * activeTs.numerator) / activeTs.denominator,
		);

		const toTicks = (rawDuration: number): number =>
			Math.max(
				1,
				Math.round((rawDuration * TARGET_TPQ) / Math.max(1, divisions)),
			);

		const snapOffset = (rawOffset: number): number => {
			if (quantizeStepTicks <= 0) return Math.max(0, rawOffset);
			return Math.max(
				0,
				Math.round(rawOffset / quantizeStepTicks) * quantizeStepTicks,
			);
		};

		const snapDuration = (rawDur: number): number => {
			if (quantizeStepTicks <= 0) return Math.max(1, rawDur);
			return Math.max(
				quantizeStepTicks,
				Math.round(rawDur / quantizeStepTicks) * quantizeStepTicks,
			);
		};

		for (const child of measure.children) {
			if (child.tag === "attributes") {
				const divText = getChildText(child, "divisions");
				if (divText) {
					const parsedDiv = Number.parseFloat(divText);
					if (Number.isFinite(parsedDiv) && parsedDiv > 0)
						divisions = parsedDiv;
				}

				const stavesText = getChildText(child, "staves");
				if (stavesText) {
					const s = Number.parseInt(stavesText, 10);
					if (Number.isFinite(s) && s > 0) staffCount = s;
				}

				const keyNode = findChild(child, "key");
				if (keyNode && !keySignature) {
					const fifths = Number.parseInt(
						getChildText(keyNode, "fifths") ?? "0",
						10,
					);
					const modeRaw = (
						getChildText(keyNode, "mode") ?? "major"
					).toLowerCase();
					const keyMode = modeRaw === "minor" ? "minor" : "major";
					const rootPc = mod12((keyMode === "major" ? 0 : 9) + fifths * 7);
					keySignature = resolveKeySignatureFromRootPc(
						rootPc,
						keyMode,
						fifths < 0,
					);
				}

				const timeNode = findChild(child, "time");
				if (timeNode) {
					const beats = Number.parseInt(
						getChildText(timeNode, "beats") ?? "4",
						10,
					);
					const beatType = Number.parseInt(
						getChildText(timeNode, "beat-type") ?? "4",
						10,
					);
					if (
						Number.isFinite(beats) &&
						beats > 0 &&
						Number.isFinite(beatType) &&
						beatType > 0
					) {
						activeTs = { numerator: beats, denominator: beatType };
						currentBarDurationEstimate = Math.round(
							(TARGET_TPQ * 4 * activeTs.numerator) / activeTs.denominator,
						);
					}
				}

				for (const tr of findChildren(child, "transpose")) {
					const staffNum = Number.parseInt(tr.attrs.number ?? "0", 10) || 0;
					const chromatic = Number.parseInt(
						getChildText(tr, "chromatic") ?? "0",
						10,
					);
					const octChange = Number.parseInt(
						getChildText(tr, "octave-change") ?? "0",
						10,
					);
					transposeByStaff.set(
						staffNum,
						(Number.isFinite(chromatic) ? chromatic : 0) +
							(Number.isFinite(octChange) ? octChange * 12 : 0),
					);
				}

				for (const sd of findChildren(child, "staff-details")) {
					const parsedTuning = parseStaffTuningNode(sd);
					if (parsedTuning.length > 0 && !tuningMidi) {
						tuningMidi = parsedTuning;
					}
					const capoText = getChildText(sd, "capo");
					if (capoText) {
						const parsedCapo = Number.parseInt(capoText, 10);
						if (Number.isFinite(parsedCapo) && parsedCapo > 0) {
							capo = parsedCapo;
						}
					}
				}
				continue;
			}

			if (child.tag === "barline") {
				const repeat = findChild(child, "repeat");
				if (repeat) {
					if (repeat.attrs.direction === "forward") repeatStart = true;
					if (repeat.attrs.direction === "backward") {
						const times = Number.parseInt(repeat.attrs.times ?? "2", 10);
						repeatEndCount = Number.isFinite(times) && times > 1 ? times : 2;
					}
				}
				for (const ending of findChildren(child, "ending")) {
					const nums = (ending.attrs.number ?? "")
						.split(",")
						.map((s) => Number.parseInt(s.trim(), 10))
						.filter((n) => Number.isFinite(n) && n > 0);
					for (const n of nums) {
						if (!endingNumbers.includes(n)) endingNumbers.push(n);
					}
				}
				continue;
			}

			if (child.tag === "sound") {
				recordTempo(cursorTicks, parseSoundTempo(child));
				continue;
			}

			if (child.tag === "direction") {
				const staffNum =
					Number.parseInt(getChildText(child, "staff") ?? "1", 10) || 1;
				const offsetDivs = Number.parseFloat(
					getChildText(child, "offset") ?? "0",
				);
				const dirTick = Math.max(
					0,
					cursorTicks +
						(Number.isFinite(offsetDivs) && offsetDivs !== 0
							? Math.round((offsetDivs * TARGET_TPQ) / Math.max(1, divisions))
							: 0),
				);

				const soundNode = findChild(child, "sound");
				if (soundNode) {
					recordTempo(dirTick, parseSoundTempo(soundNode));
					const dynAttr = Number.parseFloat(soundNode.attrs.dynamics ?? "");
					if (Number.isFinite(dynAttr) && dynAttr > 0) {
						activeVelocityByStaff.set(
							staffNum,
							Math.max(0.15, Math.min(1, (dynAttr * 0.9) / 127)),
						);
					}
				}

				for (const dt of findChildren(child, "direction-type")) {
					const metro = findChild(dt, "metronome");
					if (metro) {
						recordTempo(dirTick, parseMetronomeQuarterBpm(metro));
					}

					const dynNode = findChild(dt, "dynamics");
					if (dynNode) {
						for (const dChild of dynNode.children) {
							const dKey = dChild.tag.toLowerCase();
							if (Object.hasOwn(DYNAMIC_VELOCITY_BY_TAG, dKey)) {
								activeVelocityByStaff.set(
									staffNum,
									DYNAMIC_VELOCITY_BY_TAG[dKey],
								);
							}
						}
					}

					const reh = getChildText(dt, "rehearsal");
					if (reh && !sectionMarker) {
						sectionMarker = reh;
					}

					const words = getChildText(dt, "words");
					if (words) {
						const lower = words.toLowerCase();
						if (/\bpizz\.?\b/.test(lower)) pizzActive = true;
						else if (/\barco\b/.test(lower)) pizzActive = false;
						if (/palm\s*mute|\bp\.?\s*m\.?\b/.test(lower))
							palmMuteActive = true;
						else if (/\bopen\b|\bnat\.?\b|\bord\.?\b/.test(lower))
							palmMuteActive = false;
						if (/let\s*ring/.test(lower)) letRingActive = true;
					}

					const pedal = findChild(dt, "pedal");
					if (pedal && instrument === "piano") {
						const pType = (pedal.attrs.type ?? "").toLowerCase();
						const absDirTick = absTickCursor + dirTick;
						if (pType === "start") {
							if (pedalDownTick === null) pedalDownTick = absDirTick;
						} else if (pType === "change") {
							if (pedalDownTick !== null && absDirTick > pedalDownTick) {
								pedalIntervals.push({ start: pedalDownTick, end: absDirTick });
							}
							pedalDownTick = absDirTick;
						} else if (pType === "stop") {
							if (pedalDownTick !== null && absDirTick > pedalDownTick) {
								pedalIntervals.push({ start: pedalDownTick, end: absDirTick });
							}
							pedalDownTick = null;
						}
					}
				}
				continue;
			}

			if (child.tag === "harmony") {
				const symbol = parseHarmonyNode(child);
				if (symbol) {
					const offDivs = Number.parseFloat(
						getChildText(child, "offset") ?? "0",
					);
					const offTicks =
						cursorTicks +
						(Number.isFinite(offDivs) && offDivs !== 0
							? Math.round((offDivs * TARGET_TPQ) / Math.max(1, divisions))
							: 0);
					const snappedOff = snapOffset(offTicks);
					harmonyMap.set(snappedOff, {
						offsetTicks: snappedOff,
						chordSymbol: symbol,
					});
				}
				continue;
			}

			if (child.tag === "backup") {
				const durRaw = Number.parseFloat(
					getChildText(child, "duration") ?? "0",
				);
				if (Number.isFinite(durRaw) && durRaw > 0) {
					cursorTicks = Math.max(0, cursorTicks - toTicks(durRaw));
				}
				continue;
			}

			if (child.tag === "forward") {
				const durRaw = Number.parseFloat(
					getChildText(child, "duration") ?? "0",
				);
				if (Number.isFinite(durRaw) && durRaw > 0) {
					cursorTicks += toTicks(durRaw);
					if (cursorTicks > maxCursorTicks) maxCursorTicks = cursorTicks;
				}
				continue;
			}

			if (child.tag === "note") {
				const isGrace = Boolean(findChild(child, "grace"));
				const isChord = Boolean(findChild(child, "chord"));
				const isRest = Boolean(findChild(child, "rest"));
				const durRaw = Number.parseFloat(
					getChildText(child, "duration") ?? "0",
				);
				const rawDurTicks = isGrace
					? Math.round(TARGET_TPQ / 8)
					: Number.isFinite(durRaw) && durRaw > 0
						? toTicks(durRaw)
						: TARGET_TPQ;

				let onsetTicks: number;
				if (isGrace) {
					onsetTicks = Math.max(
						0,
						Math.min(cursorTicks, currentBarDurationEstimate - 60),
					);
				} else if (isChord) {
					onsetTicks = lastNonChordOnset;
				} else {
					onsetTicks = cursorTicks;
					lastNonChordOnset = cursorTicks;
					cursorTicks += rawDurTicks;
					if (cursorTicks > maxCursorTicks) maxCursorTicks = cursorTicks;
				}

				if (isRest) continue;

				const pitchNode = findChild(child, "pitch");
				if (!pitchNode) continue;

				const step = getChildText(pitchNode, "step") ?? "C";
				const alter = Number.parseFloat(
					getChildText(pitchNode, "alter") ?? "0",
				);
				const octave = Number.parseInt(
					getChildText(pitchNode, "octave") ?? "4",
					10,
				);
				const writtenMidi = pitchToMidi(
					step,
					Number.isFinite(alter) ? Math.round(alter) : 0,
					octave,
				);
				if (writtenMidi === null) continue;

				const staffNum =
					Number.parseInt(getChildText(child, "staff") ?? "1", 10) || 1;
				const voiceNum =
					Number.parseInt(getChildText(child, "voice") ?? "1", 10) || 1;
				const transposeOffset =
					transposeByStaff.get(staffNum) ?? transposeByStaff.get(0) ?? 0;
				const midi = writtenMidi + transposeOffset;
				if (midi <= 0 || midi > 127) continue;

				const notations = findChild(child, "notations");
				const tieElements = [
					...findChildren(child, "tie"),
					...(notations ? findChildren(notations, "tied") : []),
				];
				const hasTieStart = tieElements.some((t) => t.attrs.type === "start");
				const hasTieStop = tieElements.some((t) => t.attrs.type === "stop");

				const durTicks = snapDuration(rawDurTicks);
				const tieKey = `${staffNum}:${voiceNum}:${midi}`;
				const tieFallbackKey = `${staffNum}:*:${midi}`;

				if (hasTieStop) {
					const origin =
						activeTies.get(tieKey) ?? activeTies.get(tieFallbackKey);
					if (origin) {
						origin.durationTicks += durTicks;
						if (!hasTieStart) {
							activeTies.delete(tieKey);
							activeTies.delete(tieFallbackKey);
						}
						continue;
					}
				}

				const noteHead = findChild(child, "notehead");
				const isGhost = noteHead?.attrs.parentheses === "yes";
				const isDead = noteHead?.text.trim().toLowerCase() === "x";

				let velocity = activeVelocityByStaff.get(staffNum) ?? 0.78;
				if (isGrace) velocity *= 0.88;
				if (isDead) velocity = Math.min(velocity, 0.38);
				else if (isGhost) velocity = Math.max(0.25, velocity * 0.65);

				// Articulations & Technical notation
				let technique: SongNoteTechnique | undefined;
				let slideFromMidi: number | undefined;
				let stringIndex: number | undefined;
				let fret: number | undefined;
				let finger: number | undefined;

				const technical = notations
					? findChild(notations, "technical")
					: undefined;
				const articulations = notations
					? findChild(notations, "articulations")
					: undefined;

				if (technical) {
					const numStrings =
						tuningMidi?.length ??
						(instrument === "guitar" ? 6 : instrument === "piano" ? 0 : 4);
					const strText = getChildText(technical, "string");
					if (strText && numStrings > 0) {
						const strNum = Number.parseInt(strText, 10);
						if (
							Number.isFinite(strNum) &&
							strNum >= 1 &&
							strNum <= numStrings
						) {
							stringIndex = numStrings - strNum;
						}
					}
					const fretText = getChildText(technical, "fret");
					if (fretText) {
						const parsedFret = Number.parseInt(fretText, 10);
						if (Number.isFinite(parsedFret) && parsedFret >= 0) {
							fret = parsedFret;
						}
					}
					if (findChild(technical, "open-string")) {
						finger = 0;
					} else {
						const fingText = getChildText(technical, "fingering");
						if (fingText) {
							const parsedFinger = Number.parseInt(fingText, 10);
							if (
								Number.isFinite(parsedFinger) &&
								parsedFinger >= 0 &&
								parsedFinger <= 4
							) {
								finger = parsedFinger;
							}
						}
					}

					if (findChild(technical, "harmonic")) {
						technique = "harmonic";
					}
					for (const ho of findChildren(technical, "hammer-on")) {
						if (ho.attrs.type === "stop" && !technique) technique = "hammer";
					}
					for (const po of findChildren(technical, "pull-off")) {
						if (po.attrs.type === "stop" && !technique) technique = "pull";
					}
				}

				let slurs: XmlNode[] = [];
				if (notations) {
					slurs = findChildren(notations, "slur");

					const slides = [
						...findChildren(notations, "slide"),
						...findChildren(notations, "glissando"),
					];
					for (const sd of slides) {
						const key = `${staffNum}:${sd.attrs.number ?? "1"}`;
						if (sd.attrs.type === "start") {
							activeSlides.set(key, midi);
						} else if (sd.attrs.type === "stop") {
							const originMidi = activeSlides.get(key);
							activeSlides.delete(key);
							slideFromMidi = originMidi ?? midi - 2;
							if (!technique) {
								technique = instrument === "guitar" ? "slide" : "portamento";
							}
						}
					}

					if (!technique && articulations) {
						if (
							findChild(articulations, "staccato") ||
							findChild(articulations, "staccatissimo")
						) {
							technique = "staccato";
						}
					}
				}
				if (!technique) {
					if (instrument === "guitar" && (isDead || palmMuteActive)) {
						technique = "palmMute";
					} else if (
						(instrument === "violin" || instrument === "cello") &&
						pizzActive
					) {
						technique = "pizzicato";
					} else if (instrument === "guitar" && letRingActive) {
						technique = "letRing";
					} else if (slurs.some((sl) => sl.attrs.type === "stop")) {
						technique = instrument === "guitar" ? "hammer" : "slur";
					}
				}

				let effectiveDur = durTicks;
				if (technique === "letRing" && effectiveDur < TARGET_TPQ) {
					effectiveDur = TARGET_TPQ;
				}

				const noteIr: ScoreNoteIR = {
					midi,
					offsetTicks: snapOffset(onsetTicks),
					durationTicks: effectiveDur,
					velocity,
					...(instrument === "piano" && staffCount >= 2
						? { hand: staffNum === 1 ? ("rh" as const) : ("lh" as const) }
						: {}),
					...(stringIndex !== undefined ? { stringIndex } : {}),
					...(fret !== undefined ? { fret } : {}),
					...(finger !== undefined ? { finger } : {}),
					...(technique ? { technique } : {}),
					...(slideFromMidi !== undefined ? { slideFromMidi } : {}),
				};

				barNotes.push(noteIr);

				if (hasTieStart) {
					activeTies.set(tieKey, noteIr);
					activeTies.set(tieFallbackKey, noteIr);
				}
			}
		}

		const isImplicitPickup =
			measure.attrs.implicit === "yes" ||
			(mIdx === 0 &&
				maxCursorTicks > 0 &&
				maxCursorTicks < currentBarDurationEstimate);
		const barDurationTicks = Math.max(
			1,
			isImplicitPickup ? maxCursorTicks : currentBarDurationEstimate,
		);
		absTickCursor += barDurationTicks;

		barsIR.push({
			barNumber: mIdx + 1,
			...(sectionMarker ? { sectionMarker } : {}),
			timeSignature: { ...activeTs },
			durationTicks: barDurationTicks,
			...(repeatStart ? { repeatStart: true } : {}),
			...(repeatEndCount ? { repeatEndCount } : {}),
			...(endingNumbers.length > 0 ? { endingNumbers } : {}),
			notes: barNotes,
			...(harmonyMap.size > 0
				? {
						harmonies: Array.from(harmonyMap.values()).sort(
							(a, b) => a.offsetTicks - b.offsetTicks,
						),
					}
				: {}),
			...(tempoChanges.length > 0 ? { tempoChanges } : {}),
		});
	}

	if (
		instrument === "piano" &&
		pedalDownTick !== null &&
		absTickCursor > pedalDownTick
	) {
		pedalIntervals.push({ start: pedalDownTick, end: absTickCursor });
	}
	if (instrument === "piano" && pedalIntervals.length > 0) {
		applyPianoPedalIntervals(barsIR, pedalIntervals, TARGET_TPQ * 4);
	}

	const isStandardTuning =
		tuningMidi !== undefined &&
		arraysEqual(tuningMidi, defaultTuningForInstrument(instrument));

	const title =
		options.title || scoreTitle || selectedSummary.name || "MusicXML Score";
	const composerOrSource =
		options.composerOrSource || scoreComposer || "MusicXML Score";

	return {
		id: slugifyId(options.id || `${title}-${instrument}`, "musicxml-song"),
		title,
		composerOrSource,
		...(options.subtitle || scoreSubtitle
			? { subtitle: options.subtitle || scoreSubtitle }
			: {}),
		instrument,
		...(!isStandardTuning && tuningMidi && tuningMidi.length > 0
			? { tuningMidi }
			: {}),
		...(capo > 0 ? { capo } : {}),
		ticksPerQuarter: TARGET_TPQ,
		tempoEvents: [{ atTick: 0, bpm: initialBpm }],
		...(keySignature ? { keySignature } : {}),
		bars: barsIR,
	};
}

function inspectParsedMusicXml(score: NormalizedScore): MusicXmlInspection {
	const { partMetaList, parts, title, composerOrSource, subtitle } = score;

	let initialTempo = 120;
	outer: for (const p of parts) {
		for (const m of findChildren(p, "measure")) {
			for (const c of m.children) {
				if (c.tag === "sound") {
					const t = parseSoundTempo(c);
					if (t !== null) {
						initialTempo = t;
						break outer;
					}
				}
				if (c.tag === "direction") {
					const s = findChild(c, "sound");
					const t = s ? parseSoundTempo(s) : null;
					if (t !== null) {
						initialTempo = t;
						break outer;
					}
					for (const dt of findChildren(c, "direction-type")) {
						const metro = findChild(dt, "metronome");
						if (metro) {
							const qBpm = parseMetronomeQuarterBpm(metro);
							if (qBpm !== null) {
								initialTempo = qBpm;
								break outer;
							}
						}
					}
				}
			}
		}
	}

	return {
		title,
		composerOrSource,
		...(subtitle ? { subtitle } : {}),
		tempo: initialTempo,
		parts: parts.map((p, idx) => summarizePart(p, idx, partMetaList)),
	};
}

/** Parses a `.musicxml`, `.xml`, or `.mxl` buffer once into a MusicXML AST. */
export async function parseMusicXmlDocument(
	bytes: Uint8Array,
): Promise<XmlNode> {
	const xmlText = await readMusicXmlTextFromBytes(bytes);
	return parseXml(xmlText);
}

async function resolveMusicXmlRoot(
	source: Uint8Array | XmlNode,
): Promise<XmlNode> {
	return source instanceof Uint8Array ? parseMusicXmlDocument(source) : source;
}

/**
 * Inspects parts and header metadata of a `.musicxml`, `.xml`, or `.mxl` buffer or parsed AST.
 */
export async function inspectMusicXml(
	source: Uint8Array | XmlNode,
): Promise<MusicXmlInspection> {
	const root = await resolveMusicXmlRoot(source);
	return inspectParsedMusicXml(normalizeScorePartwise(root));
}

/**
 * Compiles a `.musicxml`, `.xml`, or `.mxl` buffer or parsed AST into canonical `ScoreTrackIR`
 * and normalized tick-based `SongDocument`.
 */
export async function compileMusicXml(
	source: Uint8Array | XmlNode,
	options: MusicXmlImportOptions = {},
): Promise<ImportedMusicXmlResult> {
	const root = await resolveMusicXmlRoot(source);
	const score = normalizeScorePartwise(root);
	const inspection = inspectParsedMusicXml(score);
	const selectedPart = selectBestPart(inspection.parts, options);
	const trackIr = buildTrackIrFromPart(score, selectedPart, options);

	const compileOpts: CompileScoreOptions = {
		...(options.id ? { id: options.id } : {}),
		...(options.title ? { title: options.title } : {}),
		...(options.composerOrSource
			? { composerOrSource: options.composerOrSource }
			: {}),
		...(options.subtitle ? { subtitle: options.subtitle } : {}),
		splitHalfBarHarmony: options.splitHalfBarHarmony,
		...(options.studyGuide ? { studyGuide: options.studyGuide } : {}),
	};
	const songDoc = compileScoreTrackToSongDocument(trackIr, compileOpts);
	return {
		trackIr,
		songDoc,
		selectedPart,
		availableParts: inspection.parts,
	};
}
