import type {
	BarTheoryInsight,
	BarTheoryOverride,
	SongChordStep,
	SongStudyGuide,
	SongSubBarChord,
} from "../songs/songRuntime";
import {
	type ChordQuality,
	type KeyAnalysis,
	type KeyMode,
	analyzeKey,
	mod12,
	noteToPitchClass,
} from "./circleOfFifths";
import type { GuitarChordKind } from "./guitarFretboard";

export interface AnalyzeSongTheoryInput {
	keySlot: number;
	keyMode: KeyMode;
	keyLabel: string;
	steps: readonly SongChordStep[];
	studyGuide?: SongStudyGuide;
	barNotes?: Record<string, BarTheoryOverride>;
}

type BassRole =
	"root" | "third" | "fifth" | "seventh" | "iv-over-5" | "ninth" | "pedal";

interface ChordAtom {
	chordSymbol: string;
	baseSymbol: string;
	bassNote: string | null;
	roman: string;
	quality: ChordQuality;
	guitarKind: GuitarChordKind;
	chordNotes: string[];
	rootName: string;
	rootPc: number;
	bassPc: number;
	chordPcs: Set<number>;
	keyOffset: number;
	bassKeyOffset: number;
	bassRole: BassRole;
	outOfKeyNotes: string[];
	bassOutOfKey: boolean;
	isPower: boolean;
	isSus: boolean;
	isDom7: boolean;
	isMaj7: boolean;
	isMin7: boolean;
	isDim: boolean;
	isAug: boolean;
	isAdd9: boolean;
}

interface BarChordSpan {
	first: ChordAtom;
	last: ChordAtom;
	atoms: ChordAtom[];
}

interface BassRunInfo {
	startIdx: number;
	endIdx: number;
	length: number;
	bassName: string;
}

const CHORD_ROOT_RE = /^([A-G][♯♭]?)(.*)$/;

function normalizeAcc(raw: string): string {
	return raw.trim().replace(/#/g, "♯").replace(/b/g, "♭");
}

function safePitchClass(note: string): number {
	try {
		return noteToPitchClass(note);
	} catch {
		return 0;
	}
}

function parseChordAtom(
	input: {
		chordSymbol: string;
		roman: string;
		quality: ChordQuality;
		guitarKind?: GuitarChordKind;
		chordNotes?: string[];
	},
	keyAnalysis: KeyAnalysis,
	tonicPc: number,
	scalePcSet: ReadonlySet<number>,
): ChordAtom {
	const normalized = normalizeAcc(input.chordSymbol);
	const [baseRaw, bassRaw] = normalized.split("/");
	const baseSymbol = baseRaw?.trim() || normalized;
	const bassNote = bassRaw?.trim() || null;

	const match = CHORD_ROOT_RE.exec(baseSymbol);
	const parsedRoot = match?.[1] ?? input.chordNotes?.[0] ?? keyAnalysis.root;
	const suffix = match?.[2] ?? "";
	const rootName = input.chordNotes?.[0] || parsedRoot;
	const rootPc = safePitchClass(parsedRoot);
	const bassPc = bassNote ? safePitchClass(bassNote) : rootPc;

	const chordNotes =
		input.chordNotes && input.chordNotes.length > 0
			? input.chordNotes
			: [rootName];
	const chordPcs = new Set(chordNotes.map(safePitchClass));
	const guitarKind = input.guitarKind ?? input.quality;
	const keyOffset = mod12(rootPc - tonicPc);
	const bassKeyOffset = mod12(bassPc - tonicPc);
	const bassInt = mod12(bassPc - rootPc);

	const isPower = suffix === "5";
	const isSus = guitarKind === "sus4" || guitarKind === "sus2";
	const isDom7 = guitarKind === "7";
	const isMaj7 = guitarKind === "maj7";
	const isMin7 = guitarKind === "m7";
	const isDim = input.quality === "diminished";
	const isAug = guitarKind === "aug";
	const isAdd9 = guitarKind === "add9" || guitarKind === "madd9";

	let bassRole: BassRole = "root";
	if (bassNote && bassPc !== rootPc) {
		if (bassInt === 3 || bassInt === 4) {
			bassRole = "third";
		} else if (bassInt === 7 || (isDim && bassInt === 6)) {
			bassRole = "fifth";
		} else if (
			bassInt === 10 ||
			bassInt === 11 ||
			(guitarKind === "dim7" && bassInt === 9)
		) {
			bassRole = "seventh";
		} else if (keyOffset === 5 && bassKeyOffset === 7) {
			bassRole = "iv-over-5";
		} else if (bassInt === 2) {
			bassRole = "ninth";
		} else {
			bassRole = "pedal";
		}
	}

	const outOfKeyNotes = chordNotes.filter(
		(n) => !scalePcSet.has(safePitchClass(n)),
	);
	const bassOutOfKey = Boolean(bassNote && !scalePcSet.has(bassPc));

	return {
		chordSymbol: normalized,
		baseSymbol,
		bassNote,
		roman: input.roman,
		quality: input.quality,
		guitarKind,
		chordNotes,
		rootName,
		rootPc,
		bassPc,
		chordPcs,
		keyOffset,
		bassKeyOffset,
		bassRole,
		outOfKeyNotes,
		bassOutOfKey,
		isPower,
		isSus,
		isDom7,
		isMaj7,
		isMin7,
		isDim,
		isAug,
		isAdd9,
	};
}

function buildSubBarAtom(
	sub: SongSubBarChord,
	fallbackStep: SongChordStep,
	keyAnalysis: KeyAnalysis,
	tonicPc: number,
	scalePcSet: ReadonlySet<number>,
): ChordAtom {
	return parseChordAtom(
		{
			chordSymbol: sub.chordSymbol,
			roman: sub.roman,
			quality: sub.quality,
			guitarKind: sub.guitarKind ?? sub.quality,
			chordNotes:
				sub.chordNotes && sub.chordNotes.length > 0
					? sub.chordNotes
					: fallbackStep.chordNotes,
		},
		keyAnalysis,
		tonicPc,
		scalePcSet,
	);
}

function isDominantFunction(atom: ChordAtom): boolean {
	return (
		atom.quality === "major" &&
		!atom.isMaj7 &&
		!atom.isAdd9 &&
		!atom.isPower &&
		atom.keyOffset === 7
	);
}

function resolvesByFifthDown(dom: ChordAtom, target: ChordAtom): boolean {
	return (
		dom.quality === "major" &&
		!dom.isMaj7 &&
		mod12(dom.rootPc - target.rootPc) === 7
	);
}

function isAppliedDominantTo(dom: ChordAtom, target: ChordAtom): boolean {
	return (
		resolvesByFifthDown(dom, target) &&
		target.keyOffset !== 0 &&
		(dom.isDom7 || dom.quality === "major")
	);
}

function isTritoneSubTo(dom: ChordAtom, target: ChordAtom): boolean {
	return dom.isDom7 && mod12(dom.rootPc - target.rootPc) === 1;
}

function isLeadingToneDimTo(dim: ChordAtom, target: ChordAtom): boolean {
	return dim.isDim && mod12(target.rootPc - dim.rootPc) === 1;
}

function formatNoteList(notes: readonly string[]): string {
	if (notes.length <= 1) return notes[0] ?? "";
	if (notes.length === 2) return `${notes[0]} and ${notes[1]}`;
	return `${notes.slice(0, -1).join(", ")} and ${notes[notes.length - 1]}`;
}

function stripSlashRomanTarget(roman: string): string {
	return roman.replace(/maj7|sus4|sus2|dim7|°7|ø7|°|5|7|\+/g, "").trim();
}

function deriveContextualRoman(
	currFirst: ChordAtom,
	currLast: ChordAtom,
	hasSubBars: boolean,
	secondSub: ChordAtom | null,
	nextFirst: ChordAtom | null,
): string {
	// If single-chord bar resolves directly down a 5th to a non-tonic target,
	// clarify ambiguous I7/III7/VI7 numerals as applied V(7)/target.
	if (!hasSubBars && nextFirst) {
		if (
			!currFirst.roman.includes("/") &&
			isAppliedDominantTo(currFirst, nextFirst)
		) {
			const targetStem = stripSlashRomanTarget(nextFirst.roman);
			if (targetStem) {
				const tag = currFirst.isDom7 ? "V7" : "V";
				return `${tag}/${targetStem}`;
			}
		}
		if (isTritoneSubTo(currFirst, nextFirst)) {
			const targetStem = stripSlashRomanTarget(nextFirst.roman);
			if (targetStem && !currFirst.roman.startsWith("V")) {
				return `subV7/${targetStem}`;
			}
		}
	} else if (
		hasSubBars &&
		secondSub &&
		!currFirst.roman.includes("/") &&
		(currFirst.isDom7 || currLast.rootPc !== currFirst.rootPc) &&
		isAppliedDominantTo(currFirst, secondSub)
	) {
		const targetStem = stripSlashRomanTarget(secondSub.roman);
		if (targetStem) {
			const tag = currFirst.isDom7 ? "V7" : "V";
			return `${tag}/${targetStem}`;
		}
	}

	return currFirst.roman;
}

function computeBassRuns(spans: readonly BarChordSpan[]): BassRunInfo[] {
	const runs: BassRunInfo[] = new Array(spans.length);
	let i = 0;
	while (i < spans.length) {
		const pc = spans[i].first.bassPc;
		let end = i;
		while (end + 1 < spans.length && spans[end + 1].first.bassPc === pc) {
			end++;
		}
		const bassName = spans[i].first.bassNote ?? spans[i].first.rootName;
		const info: BassRunInfo = {
			startIdx: i,
			endIdx: end,
			length: end - i + 1,
			bassName,
		};
		for (let k = i; k <= end; k++) {
			runs[k] = info;
		}
		i = end + 1;
	}
	return runs;
}

function computeSameChordRuns(
	spans: readonly BarChordSpan[],
): Array<{ startIdx: number; endIdx: number; length: number }> {
	const runs: Array<{ startIdx: number; endIdx: number; length: number }> =
		new Array(spans.length);
	let i = 0;
	while (i < spans.length) {
		const base = spans[i].first.baseSymbol;
		let end = i;
		while (end + 1 < spans.length && spans[end + 1].first.baseSymbol === base) {
			end++;
		}
		const info = { startIdx: i, endIdx: end, length: end - i + 1 };
		for (let k = i; k <= end; k++) {
			runs[k] = info;
		}
		i = end + 1;
	}
	return runs;
}

function getSharedToneNames(a: ChordAtom, b: ChordAtom): string[] {
	const seenPcs = new Set<number>();
	const shared: string[] = [];
	for (const note of b.chordNotes) {
		const pc = safePitchClass(note);
		if (a.chordPcs.has(pc) && !seenPcs.has(pc)) {
			seenPcs.add(pc);
			shared.push(note);
		}
	}
	return shared;
}

function findNoteByPc(atom: ChordAtom, pc: number): string | null {
	for (const note of atom.chordNotes) {
		if (safePitchClass(note) === mod12(pc)) return note;
	}
	return null;
}

function describeTritoneResolution(
	dom: ChordAtom,
	target: ChordAtom,
): string | null {
	if (!dom.isDom7 || mod12(dom.rootPc - target.rootPc) !== 7) return null;
	const thirdPc = mod12(dom.rootPc + 4);
	const seventhPc = mod12(dom.rootPc + 10);
	const thirdNote = findNoteByPc(dom, thirdPc);
	const seventhNote = findNoteByPc(dom, seventhPc);
	const targetRoot = target.rootName;
	const targetThird =
		findNoteByPc(target, mod12(target.rootPc + 4)) ??
		findNoteByPc(target, mod12(target.rootPc + 3));
	if (!thirdNote || !seventhNote || !targetThird) return null;

	const seventhDropsHalf = mod12(seventhPc - safePitchClass(targetThird)) === 1;
	return `${dom.baseSymbol}'s tritone (${thirdNote} and ${seventhNote}) resolves naturally: ${thirdNote} steps up a half-step to ${targetRoot} while ${seventhNote} drops ${seventhDropsHalf ? "a half-step" : "down"} to ${targetThird}`;
}

function describeBassMotion(from: ChordAtom, to: ChordAtom): string | null {
	const delta = mod12(to.bassPc - from.bassPc);
	const fromBass = from.bassNote ?? from.rootName;
	const toBass = to.bassNote ?? to.rootName;
	if (delta === 0) {
		return `keeps ${toBass} anchored in the bass`;
	}
	if (delta === 1) {
		return `walks up a half-step in the bass (${fromBass} → ${toBass})`;
	}
	if (delta === 11) {
		return `steps down a half-step in the bass (${fromBass} → ${toBass})`;
	}
	if (delta === 2) {
		return `steps up smoothly in the bass (${fromBass} → ${toBass})`;
	}
	if (delta === 10) {
		return `steps down smoothly in the bass (${fromBass} → ${toBass})`;
	}
	if (delta === 5) {
		return `moves counter-clockwise by 5th (${fromBass} → ${toBass}) on the Circle of Fifths`;
	}
	if (delta === 7) {
		return `moves clockwise by 5th (${fromBass} → ${toBass}) on the Circle of Fifths`;
	}
	return null;
}

function describeChordQualityColor(atom: ChordAtom): string {
	if (atom.isPower) {
		return "an open power chord (root + 5th with no 3rd), giving a lean, neutral anchor";
	}
	if (atom.guitarKind === "sus4") {
		return "a suspended 4th chord replacing the 3rd with a tense 4th eager to step down";
	}
	if (atom.guitarKind === "sus2") {
		return "an airy sus2 chord substituting a bright 2nd for the 3rd";
	}
	if (atom.guitarKind === "dim7") {
		return "a fully diminished 7th (stacked minor 3rds), packing two unstable tritones that pull inward";
	}
	if (atom.isDim) {
		return "a diminished chord built on tight minor 3rds and a tritone that begs to resolve";
	}
	if (atom.isAug) {
		return "an augmented triad with a raised 5th leaning upward into the next harmony";
	}
	if (atom.isDom7) {
		return "a dominant 7th whose major 3rd and ♭7 form an urgent, forward-pulling tritone";
	}
	if (atom.isMaj7) {
		return "a major 7th adding lyrical warmth and a gentle half-step shimmer beneath the root";
	}
	if (atom.isMin7) {
		return "a minor 7th softening the triad with a warm, soulful ♭7";
	}
	if (atom.isAdd9) {
		return "an add9 voicing floating a singing 9th over the triad for extra sparkle";
	}
	return atom.quality === "minor"
		? "a minor triad with a darker, reflective color"
		: "a clean major triad with bright, focused resonance";
}

function describeBassInversionPlain(atom: ChordAtom): string | null {
	if (!atom.bassNote || atom.bassRole === "root") return null;
	const bass = atom.bassNote;
	switch (atom.bassRole) {
		case "third":
			return atom.keyOffset === 7
				? `with the 3rd (${bass} — the key's leading tone) in the bass so it wants to step straight up to the tonic`
				: `with its 3rd (${bass}) in the bass (1st inversion), lightening the root weight for a melodic bass line`;
		case "fifth":
			return atom.keyOffset === 0
				? `with its 5th (${bass}) in the bass (2nd inversion), creating a suspended pre-dominant feel rather than settled rest`
				: `with its 5th (${bass}) in the bass (2nd inversion) for smooth alternating or stepwise bass motion`;
		case "seventh":
			return `with its 7th (${bass}) in the bass (3rd inversion), creating a restless downward pull where the bass wants to resolve by step`;
		case "iv-over-5":
			return `voicing the IV chord over the 5th degree (${bass}) in the bass — a signature pop/gospel suspended dominant sound`;
		case "ninth":
			return `with the color 9th (${bass}) placed in the bass for a rich, suspended wash`;
		case "pedal":
			return `anchoring a non-chord bass note (${bass}) underneath as a pedal or passing tone`;
	}
}

function describeHarmonicFunctionBase(
	atom: ChordAtom,
	contextualRoman: string,
	keyMode: KeyMode,
	keyLabel: string,
): string {
	if (contextualRoman.startsWith("subV7/")) {
		const target = contextualRoman.slice("subV7/".length);
		return `Acts as a chromatic tritone substitute pointing a half-step down into ${target}`;
	}
	if (contextualRoman.includes("/")) {
		const target = contextualRoman.split("/")[1] ?? "the next chord";
		return `Works as a secondary dominant, temporarily spotlighting ${target} as a mini home key`;
	}
	if (atom.keyOffset === 0 && atom.quality === "minor" && keyMode === "major") {
		return `Flips the tonic into borrowed parallel minor, casting a sudden shadow over ${keyLabel}`;
	}
	if (
		atom.keyOffset === 0 &&
		atom.quality === "major" &&
		!atom.isPower &&
		!atom.isSus &&
		!atom.isDom7 &&
		keyMode === "minor"
	) {
		return `Brightens the minor tonic into a Picardy major chord, letting warm light break into ${keyLabel}`;
	}
	if (atom.keyOffset === 0) {
		return `Grounds the ${keyLabel} tonic (${contextualRoman}) as harmonic home base`;
	}
	if (atom.keyOffset === 7 && atom.quality === "major") {
		return `Builds peak dominant (${contextualRoman}) tension aimed squarely back at the tonic`;
	}
	if (atom.keyOffset === 7 && atom.quality === "minor") {
		return `Visits the softer natural-minor dominant (${contextualRoman}) without a raised leading tone`;
	}
	if (atom.keyOffset === 5 && atom.quality === "minor" && keyMode === "major") {
		return `Borrows minor iv from the parallel minor key for a bittersweet, aching subdominant lift`;
	}
	if (atom.keyOffset === 5 && atom.quality === "major" && keyMode === "minor") {
		return `Borrows bright Dorian IV (${atom.baseSymbol}), raising the 6th degree for a warm folk/classical lift`;
	}
	if (atom.keyOffset === 5) {
		return `Opens outward onto the subdominant 4th (${contextualRoman}), expanding space away from home`;
	}
	if (atom.keyOffset === 2) {
		return atom.isDim
			? `Pre-dominant ${contextualRoman} narrows tightly toward V with its diminished 5th`
			: `Pre-dominant ${contextualRoman} steps away from home to set up the dominant`;
	}
	if (atom.keyOffset === 10 && atom.quality === "major") {
		return keyMode === "major"
			? `Borrows the rock/pop flat-VII (${atom.baseSymbol}) a whole step below tonic for wide modal color`
			: `Steps onto natural-minor VII (${atom.baseSymbol}), the dominant of the relative major`;
	}
	if (atom.keyOffset === 1) {
		return `Introduces Neapolitan ♭II color just a half-step above tonic for dramatic tension`;
	}
	if (atom.keyOffset === 3 && keyMode === "minor") {
		return `Lifts into the bright relative major (III), offering fresh major-key relief`;
	}
	if (atom.keyOffset === 8 && keyMode === "minor") {
		return `Swells into the warm submediant VI chord, balancing dark minor tension with major breadth`;
	}
	if (atom.keyOffset === 9 && keyMode === "major") {
		return `Turns inward to the relative minor (vi), sharing two notes with tonic while darkening the mood`;
	}
	if (atom.keyOffset === 4 && keyMode === "major") {
		return `Shades into the mediant (iii), bridging between tonic brightness and relative minor warmth`;
	}
	if (atom.isDim) {
		return `Injects tight chromatic diminished tension (${contextualRoman}) to push voices forward by half-step`;
	}
	return `Colors the harmony with ${contextualRoman} (${atom.baseSymbol})`;
}

function summarizeSubBarSequence(
	atoms: readonly ChordAtom[],
	keyMode: KeyMode,
): string | undefined {
	if (atoms.length < 2) return undefined;
	const chain = atoms.map((a) => `${a.chordSymbol} (${a.roman})`).join(" → ");
	const first = atoms[0];
	const last = atoms[atoms.length - 1];

	// Full mini-cadence inside one bar (e.g. Cm -> Fm7 -> G -> Cm)
	if (
		atoms.length >= 3 &&
		first.keyOffset === 0 &&
		last.keyOffset === 0 &&
		atoms.some((a) => a.keyOffset === 7 && a.quality === "major")
	) {
		return `Inside this bar (${chain}): packs a complete ${keyMode} tonic–tension–resolution mini-cadence into a single measure.`;
	}

	// Same root chord changing bass or extension inside the bar
	if (atoms.every((a) => a.rootPc === first.rootPc)) {
		const sameBase = atoms.every((a) => a.baseSymbol === first.baseSymbol);
		if (sameBase) {
			const bassPath = atoms.map((a) => a.bassNote ?? a.rootName).join(" → ");
			return `Inside this bar (${chain}): keeps the same chord ringing while walking the bass line (${bassPath}).`;
		}
		return `Inside this bar (${chain}): enriches the same root chord by shifting extensions/color mid-bar.`;
	}

	// Minor plagal inside bar (e.g. Em -> B)
	if (
		atoms.length === 2 &&
		first.keyOffset === 5 &&
		first.quality === "minor" &&
		last.keyOffset === 0 &&
		last.quality === "major"
	) {
		return `Inside this bar (${chain}): resolves a borrowed minor iv directly home to I (a classic bittersweet minor plagal sigh).`;
	}

	// Applied dominant inside bar (e.g. C7 -> Fm)
	for (let i = 0; i < atoms.length - 1; i++) {
		if (isAppliedDominantTo(atoms[i], atoms[i + 1])) {
			return `Inside this bar (${chain}): fires a quick fifth-resolving dominant push (${atoms[i].baseSymbol} → ${atoms[i + 1].baseSymbol}) mid-measure.`;
		}
	}

	// Bass-line walk across changing chords
	const bassDelta = mod12(last.bassPc - first.bassPc);
	if (bassDelta === 1 || bassDelta === 11) {
		return `Inside this bar (${chain}): pivots smoothly through a half-step bass move (${first.bassNote ?? first.rootName} → ${last.bassNote ?? last.rootName}).`;
	}

	return `Inside this bar (${chain}): moves through ${atoms.length} chord shapes to keep harmonic motion active before the next barline.`;
}

function findCurrentSection(
	studyGuide: SongStudyGuide | undefined,
	stepIndex: number,
) {
	if (!studyGuide || studyGuide.sections.length === 0) return null;
	return (
		studyGuide.sections.find(
			(s) => stepIndex >= s.startStepIndex && stepIndex <= s.endStepIndex,
		) ?? null
	);
}

function buildDevicesList(params: {
	atom: ChordAtom;
	contextualRoman: string;
	bassRun: BassRunInfo;
	isCadenceArrival: boolean;
	isHalfCadence: boolean;
	isDeceptiveArrival: boolean;
	isMinorPlagal: boolean;
	isCadential64: boolean;
	isIiVI: boolean;
	isChromaticBass: boolean;
	isSecondaryDom: boolean;
	hasTritoneRes: boolean;
	sharedTonesCount: number;
	hasSubBars: boolean;
}): string[] {
	const tags: string[] = [];
	if (params.bassRun.length >= 2) {
		tags.push(`${params.bassRun.bassName} Bass Pedal`);
	}
	if (params.atom.bassRole === "third") tags.push("3rd in Bass");
	else if (params.atom.bassRole === "fifth") tags.push("5th in Bass");
	else if (params.atom.bassRole === "seventh") tags.push("7th in Bass");
	else if (params.atom.bassRole === "iv-over-5")
		tags.push("IV/5 Dominant Susp.");

	if (params.isSecondaryDom) {
		tags.push(`Secondary Dom. (${params.contextualRoman})`);
	}
	if (params.isMinorPlagal) tags.push("Minor Plagal (iv→I)");
	else if (params.isCadential64) tags.push("Cadential I/5");
	else if (params.isDeceptiveArrival) tags.push("Deceptive Cadence");
	else if (params.isCadenceArrival) tags.push("Authentic Cadence");
	else if (params.isHalfCadence) tags.push("Half Cadence");

	if (params.isIiVI) tags.push("ii–V–I Turnaround");
	if (params.isChromaticBass) tags.push("Chromatic Bass Walk");
	if (params.hasTritoneRes) tags.push("Tritone Resolution");
	if (params.atom.outOfKeyNotes.length > 0) {
		tags.push(`Chromatic: ${params.atom.outOfKeyNotes.join(", ")}`);
	}
	if (params.hasSubBars) tags.push("Multi-Chord Bar");
	if (tags.length < 3 && params.sharedTonesCount > 0) {
		tags.push(
			`${params.sharedTonesCount} Shared Tone${params.sharedTonesCount > 1 ? "s" : ""}`,
		);
	}
	return tags.slice(0, 4);
}

function buildRoleLabel(params: {
	idx: number;
	totalBars: number;
	atom: ChordAtom;
	contextualRoman: string;
	bassRun: BassRunInfo;
	isCadenceArrival: boolean;
	isPlagalArrival: boolean;
	isMinorPlagal: boolean;
	isDeceptiveArrival: boolean;
	isHalfCadence: boolean;
	isCadential64: boolean;
	isPicardy: boolean;
	isParallelMinor: boolean;
	isSecondaryDom: boolean;
	isTritoneSub: boolean;
	isPassingDim: boolean;
}): string {
	const { atom, bassRun } = params;
	const hasPedal = bassRun.length >= 2;
	const pedalSuffix = hasPedal ? ` · ${bassRun.bassName} Pedal` : "";

	if (params.isPicardy) return "Picardy Major Turn";
	if (params.isParallelMinor) return "Parallel Minor Flip";
	if (params.isMinorPlagal) return "Minor Plagal Cadence";
	if (params.isDeceptiveArrival) return "Deceptive Cadence";
	if (params.isCadenceArrival && params.idx === params.totalBars - 1) {
		return "Final Cadence Home";
	}
	if (params.isCadenceArrival) return `Cadence Arrival${pedalSuffix}`;
	if (params.isPlagalArrival) return "Plagal Amen Cadence";
	if (params.isCadential64)
		return `Suspended Cadential ${atom.baseSymbol}/${atom.bassNote}`;
	if (atom.bassRole === "iv-over-5") return "IV/5 Dominant Susp.";
	if (params.isTritoneSub)
		return `Tritone Sub → ${params.contextualRoman.split("/")[1] ?? "Target"}`;
	if (params.isSecondaryDom) {
		const target = params.contextualRoman.split("/")[1] ?? "Next";
		return `Secondary Dom. → ${target}`;
	}
	if (params.isPassingDim) return "Passing Diminished Bridge";
	if (params.idx === 0 && atom.keyOffset === 0) {
		return hasPedal
			? `Tonic · Launches ${bassRun.bassName} Pedal`
			: "Tonic Home Base";
	}
	if (params.isHalfCadence) return `Half Cadence · Pause on V${pedalSuffix}`;
	if (isDominantFunction(atom)) {
		if (atom.bassRole === "third") return "Dominant · Leading Bass";
		return `Dominant Tension${pedalSuffix}`;
	}
	if (atom.keyOffset === 2) return `Pre-Dominant${pedalSuffix}`;
	if (atom.keyOffset === 5) {
		return atom.quality === "minor"
			? `Borrowed Minor iv${pedalSuffix}`
			: `Subdominant Lift${pedalSuffix}`;
	}
	if (atom.keyOffset === 0) {
		return atom.bassRole === "root"
			? `Tonic Anchor${pedalSuffix}`
			: `Tonic Inversion${pedalSuffix}`;
	}
	if (atom.outOfKeyNotes.length > 0) return `Chromatic Color${pedalSuffix}`;
	return `${atom.bassRole === "seventh" ? "3rd Inv. Bridge" : "Harmonic Bridge"}${pedalSuffix}`;
}

function buildCardSummary(params: {
	idx: number;
	totalBars: number;
	atom: ChordAtom;
	lastAtom: ChordAtom;
	subAtoms: readonly ChordAtom[];
	prevLast: ChordAtom | null;
	nextFirst: ChordAtom | null;
	contextualRoman: string;
	bassRun: BassRunInfo;
	sameChordRun: { startIdx: number; endIdx: number; length: number };
	isCadenceArrival: boolean;
	isPlagalArrival: boolean;
	isMinorPlagal: boolean;
	isDeceptiveArrival: boolean;
	isHalfCadence: boolean;
	isCadential64: boolean;
	isPicardy: boolean;
	isParallelMinor: boolean;
	isSecondaryDom: boolean;
	isTritoneSub: boolean;
	isPassingDim: boolean;
	isIiVI: boolean;
}): string {
	const { atom, prevLast, nextFirst, bassRun, sameChordRun } = params;

	if (
		params.subAtoms.length >= 3 &&
		atom.keyOffset === 0 &&
		params.lastAtom.keyOffset === 0
	) {
		return `Full ${atom.roman}–…–${params.lastAtom.roman} cadence inside one bar`;
	}
	if (params.isPicardy) return "Brightens minor key into major tonic";
	if (params.isParallelMinor) return "Flips major tonic into parallel minor";
	if (params.isMinorPlagal) {
		return `Borrowed ${atom.baseSymbol} sighs softly home to ${nextFirst?.baseSymbol ?? "I"}`;
	}
	if (params.isCadential64 && nextFirst) {
		return `5th (${atom.bassNote}) in bass suspends arrival into ${nextFirst.chordSymbol}`;
	}
	if (atom.bassRole === "iv-over-5" && nextFirst) {
		return `Lush IV over ${atom.bassNote} bass acts as suspended V`;
	}
	if (params.isDeceptiveArrival && prevLast) {
		return `Surprises ${prevLast.baseSymbol} by landing on ${atom.baseSymbol} instead of home`;
	}
	if (params.isCadenceArrival && prevLast) {
		if (params.idx === params.totalBars - 1) {
			return `Final release of ${prevLast.chordSymbol} tension home`;
		}
		return nextFirst
			? `Resolves ${prevLast.chordSymbol} home; leads to ${nextFirst.chordSymbol}`
			: `Resolves ${prevLast.chordSymbol} tension cleanly home`;
	}
	if (params.isPlagalArrival && prevLast) {
		return `Warm plagal release from ${prevLast.chordSymbol} home`;
	}
	if (params.isTritoneSub && nextFirst) {
		return `Half-step tritone sub sliding down into ${nextFirst.chordSymbol}`;
	}
	if (params.isSecondaryDom && nextFirst) {
		return atom.outOfKeyNotes.length > 0
			? `Borrowed ${atom.outOfKeyNotes[0]} aims straight at ${nextFirst.chordSymbol}`
			: `Fifth-pulling dominant aimed at ${nextFirst.chordSymbol}`;
	}
	if (params.isPassingDim && prevLast && nextFirst) {
		return `Chromatic dim bridge (${prevLast.baseSymbol} → ${nextFirst.baseSymbol})`;
	}
	if (atom.bassRole === "seventh" && nextFirst) {
		return `7th (${atom.bassNote}) in bass leans down to ${nextFirst.chordSymbol}`;
	}
	if (
		atom.bassRole === "third" &&
		atom.keyOffset === 7 &&
		nextFirst &&
		nextFirst.keyOffset === 0 &&
		nextFirst.bassPc === mod12(nextFirst.rootPc)
	) {
		return `Leading-tone bass (${atom.bassNote}) pulls up to ${nextFirst.chordSymbol}`;
	}
	if (
		atom.bassRole === "third" &&
		atom.keyOffset === 7 &&
		nextFirst &&
		nextFirst.bassPc === atom.bassPc
	) {
		return `Holds ${atom.bassNote} bass pedal into ${nextFirst.chordSymbol}`;
	}
	if (params.idx === 0) {
		return bassRun.length >= 2
			? `Sets home key; starts ${bassRun.bassName} bass pedal`
			: `Establishes home key (${atom.baseSymbol}) at the downbeat`;
	}
	if (sameChordRun.length >= 2 && params.idx > sameChordRun.startIdx) {
		if (atom.bassNote && prevLast?.bassNote !== atom.bassNote) {
			return `Inverts ${atom.baseSymbol} over ${atom.bassNote} to keep motion alive`;
		}
		if (nextFirst && nextFirst.baseSymbol !== atom.baseSymbol) {
			return `Holds ${atom.baseSymbol} before moving to ${nextFirst.chordSymbol}`;
		}
		return `Sustains ${atom.baseSymbol} (${params.idx - sameChordRun.startIdx + 1} of ${sameChordRun.length} bars)`;
	}
	if (prevLast?.baseSymbol === atom.baseSymbol) {
		if (atom.bassNote && prevLast.bassNote !== atom.bassNote) {
			return `Re-voices ${atom.baseSymbol} over ${atom.bassNote} in the bass`;
		}
		if (nextFirst && nextFirst.baseSymbol !== atom.baseSymbol) {
			return `Extends ${atom.baseSymbol} before shifting to ${nextFirst.chordSymbol}`;
		}
		return `Continues ${atom.baseSymbol} across the barline`;
	}
	if (params.isHalfCadence && nextFirst) {
		return `Holds dominant tension before shifting to ${nextFirst.chordSymbol}`;
	}
	if (params.isIiVI && nextFirst) {
		return `Pre-dominant step leaning into ${nextFirst.chordSymbol}`;
	}
	if (atom.outOfKeyNotes.length > 0 && nextFirst) {
		return `Introduces ${formatNoteList(atom.outOfKeyNotes)} color toward ${nextFirst.chordSymbol}`;
	}
	if (prevLast && nextFirst) {
		if (prevLast.chordSymbol === nextFirst.chordSymbol) {
			return `Steps away from ${prevLast.chordSymbol} and turns back`;
		}
		return `Links ${prevLast.chordSymbol} smoothly toward ${nextFirst.chordSymbol}`;
	}
	if (nextFirst) {
		return `Sets up ${nextFirst.chordSymbol} (${nextFirst.roman})`;
	}
	return `Closes on ${atom.chordSymbol} (${params.contextualRoman})`;
}

/**
 * Generates contextual, bar-by-bar music-teacher analysis across an entire
 * linearized song, merging optional curated `barNotes` overrides on top.
 */
export function analyzeSongBarTheory(
	input: AnalyzeSongTheoryInput,
): BarTheoryInsight[] {
	const { keySlot, keyMode, keyLabel, steps, studyGuide, barNotes } = input;
	if (steps.length === 0) return [];

	const keyAnalysis = analyzeKey(keySlot, keyMode);
	const tonicPc = safePitchClass(keyAnalysis.root);
	const scalePcSet = new Set(keyAnalysis.scaleNotes.map(safePitchClass));

	const spans: BarChordSpan[] = steps.map((step) => {
		const primary = parseChordAtom(step, keyAnalysis, tonicPc, scalePcSet);
		if (step.subBarChords && step.subBarChords.length > 1) {
			const atoms = step.subBarChords.map((sub) =>
				buildSubBarAtom(sub, step, keyAnalysis, tonicPc, scalePcSet),
			);
			return {
				first: atoms[0] ?? primary,
				last: atoms[atoms.length - 1] ?? primary,
				atoms,
			};
		}
		return {
			first: primary,
			last: primary,
			atoms: [primary],
		};
	});

	const bassRuns = computeBassRuns(spans);
	const sameChordRuns = computeSameChordRuns(spans);

	return steps.map((_step, idx) => {
		const span = spans[idx];
		const first = span.first;
		const last = span.last;
		const prevLast = idx > 0 ? spans[idx - 1].last : null;
		const prev2Last = idx > 1 ? spans[idx - 2].last : null;
		const nextFirst = idx + 1 < spans.length ? spans[idx + 1].first : null;
		const next2First = idx + 2 < spans.length ? spans[idx + 2].first : null;
		const bassRun = bassRuns[idx];
		const sameChordRun = sameChordRuns[idx];
		const hasSubBars = span.atoms.length > 1;
		const secondSub = span.atoms[1] ?? null;

		const contextualRoman = deriveContextualRoman(
			first,
			last,
			hasSubBars,
			secondSub,
			nextFirst,
		);

		const isSecondaryDomCrossBar = Boolean(
			nextFirst &&
			isAppliedDominantTo(last, nextFirst) &&
			!(hasSubBars && last.rootPc === first.rootPc && last.keyOffset === 8),
		);
		const isSecondaryDom =
			isSecondaryDomCrossBar || (!hasSubBars && contextualRoman.includes("/"));
		const isTritoneSub = Boolean(
			nextFirst &&
			isTritoneSubTo(last, nextFirst) &&
			!last.roman.startsWith("V"),
		);
		const isPassingDim = Boolean(
			first.isDim &&
			((nextFirst && isLeadingToneDimTo(first, nextFirst)) ||
				(prevLast &&
					nextFirst &&
					mod12(first.bassPc - prevLast.bassPc) === 1 &&
					mod12(nextFirst.bassPc - first.bassPc) === 1)),
		);

		const isCadenceArrival = Boolean(
			prevLast &&
			isDominantFunction(prevLast) &&
			first.keyOffset === 0 &&
			(keyMode === "major"
				? first.quality === "major"
				: first.quality === "minor"),
		);
		const isPlagalArrival = Boolean(
			prevLast && prevLast.keyOffset === 5 && first.keyOffset === 0,
		);
		const isMinorPlagal = Boolean(
			(first.keyOffset === 5 &&
				first.quality === "minor" &&
				keyMode === "major" &&
				nextFirst?.keyOffset === 0) ||
			(span.atoms.length === 2 &&
				first.keyOffset === 5 &&
				first.quality === "minor" &&
				last.keyOffset === 0 &&
				keyMode === "major"),
		);
		const isDeceptiveArrival = Boolean(
			prevLast &&
			isDominantFunction(prevLast) &&
			((keyMode === "major" &&
				first.keyOffset === 9 &&
				first.quality === "minor") ||
				(keyMode === "minor" &&
					first.keyOffset === 8 &&
					first.quality === "major")),
		);
		const isCadential64 = Boolean(
			first.keyOffset === 0 &&
			first.bassRole === "fifth" &&
			nextFirst &&
			isDominantFunction(nextFirst),
		);
		const isHalfCadence = Boolean(
			isDominantFunction(last) &&
			nextFirst?.keyOffset !== 0 &&
			nextFirst?.baseSymbol !== last.baseSymbol,
		);
		const isPicardy = Boolean(
			keyMode === "minor" &&
			first.keyOffset === 0 &&
			first.quality === "major" &&
			!first.isPower &&
			!first.isSus &&
			!first.isDom7 &&
			!isSecondaryDom,
		);
		const isParallelMinor = Boolean(
			keyMode === "major" && first.keyOffset === 0 && first.quality === "minor",
		);
		const isIiVI = Boolean(
			(first.keyOffset === 2 &&
				first.quality !== "major" &&
				nextFirst &&
				isDominantFunction(nextFirst) &&
				next2First?.keyOffset === 0) ||
			(prevLast?.keyOffset === 2 &&
				prevLast.quality !== "major" &&
				isDominantFunction(first) &&
				nextFirst?.keyOffset === 0) ||
			(prev2Last?.keyOffset === 2 &&
				prev2Last.quality !== "major" &&
				prevLast &&
				isDominantFunction(prevLast) &&
				first.keyOffset === 0),
		);
		const isSecDomChainCadence = Boolean(
			(first.keyOffset === 2 &&
				first.quality === "major" &&
				nextFirst &&
				isDominantFunction(nextFirst) &&
				next2First?.keyOffset === 0) ||
			(prevLast?.keyOffset === 2 &&
				prevLast.quality === "major" &&
				isDominantFunction(first) &&
				nextFirst?.keyOffset === 0),
		);

		const isChromaticBass = Boolean(
			(prevLast &&
				(mod12(first.bassPc - prevLast.bassPc) === 1 ||
					mod12(first.bassPc - prevLast.bassPc) === 11)) ||
			(nextFirst &&
				(mod12(nextFirst.bassPc - last.bassPc) === 1 ||
					mod12(nextFirst.bassPc - last.bassPc) === 11)),
		);

		const section = findCurrentSection(studyGuide, idx);
		const hasMultipleSections = (studyGuide?.sections.length ?? 0) > 1;
		const subBarFlow = summarizeSubBarSequence(span.atoms, keyMode);

		// --- Lens 1: What it's doing ---
		const fnDesc = describeHarmonicFunctionBase(
			first,
			contextualRoman,
			keyMode,
			keyLabel,
		);
		const qualityColor = describeChordQualityColor(first);
		const invDesc = describeBassInversionPlain(first);
		const borrowedClause =
			first.outOfKeyNotes.length > 0
				? ` Introduces chromatic ${formatNoteList(first.outOfKeyNotes)} outside ${keyLabel}.`
				: "";
		const whatItDoes = `${fnDesc}. Built as ${qualityColor}${invDesc ? `, ${invDesc}` : ""}.${borrowedClause}`;

		// --- Lens 2: Bigger picture ---
		const bigParts: string[] = [];
		if (
			section &&
			(hasMultipleSections || idx === 0 || idx === steps.length - 1)
		) {
			const posText =
				idx === section.startStepIndex
					? `Opens "${section.title}" (${section.barRange})`
					: idx === section.endStepIndex
						? `Closes "${section.title}" (${section.barRange})`
						: `Part of "${section.title}" (${section.barRange})`;
			bigParts.push(posText);
		} else if (idx === 0) {
			bigParts.push("Opens the piece");
		} else if (idx === steps.length - 1) {
			bigParts.push("Brings the progression to its final close");
		}

		if (isCadenceArrival && prevLast) {
			bigParts.push(
				`delivers an authentic cadence resolving ${prevLast.chordSymbol} back home${nextFirst ? ` before moving to ${nextFirst.chordSymbol}` : ""}`,
			);
		} else if (isPlagalArrival && prevLast) {
			bigParts.push(
				`completes a ${prevLast.quality === "minor" ? "minor " : ""}plagal cadence from ${prevLast.chordSymbol}${nextFirst ? `, then turns toward ${nextFirst.chordSymbol}` : ""}`,
			);
		} else if (isDeceptiveArrival && prevLast) {
			bigParts.push(
				`creates a deceptive twist—${prevLast.chordSymbol} expects tonic, so landing on ${first.chordSymbol} extends the phrase`,
			);
		} else if (isSecondaryDomCrossBar && nextFirst) {
			bigParts.push(
				`${prevLast ? `following ${prevLast.chordSymbol}, ` : ""}pushes the harmony directly toward ${nextFirst.chordSymbol} (${nextFirst.roman}) as a temporary tonic`,
			);
		} else if (isCadential64 && nextFirst) {
			bigParts.push(
				`suspends the tonic triad over the dominant bass (${first.bassNote}) right before ${nextFirst.chordSymbol}`,
			);
		} else if (isSecDomChainCadence) {
			bigParts.push(
				`drives a secondary-dominant cadence chain (${prevLast ? `${prevLast.chordSymbol} → ` : ""}${first.chordSymbol}${nextFirst ? ` → ${nextFirst.chordSymbol}` : ""})`,
			);
		} else if (isIiVI) {
			bigParts.push(
				`participates in a textbook ii–V–I cadence arc (${prevLast ? `${prevLast.chordSymbol} → ` : ""}${first.chordSymbol}${nextFirst ? ` → ${nextFirst.chordSymbol}` : ""})`,
			);
		} else if (sameChordRun.length >= 2) {
			const barPos = idx - sameChordRun.startIdx + 1;
			bigParts.push(
				`holds ${first.baseSymbol} for bar ${barPos} of ${sameChordRun.length}${nextFirst && idx === sameChordRun.endIdx ? ` before moving to ${nextFirst.chordSymbol}` : ""}`,
			);
		} else if (prevLast && nextFirst) {
			bigParts.push(
				`bridges ${prevLast.chordSymbol} (${prevLast.roman}) into ${nextFirst.chordSymbol} (${nextFirst.roman})`,
			);
		} else if (nextFirst) {
			bigParts.push(`sets up ${nextFirst.chordSymbol} (${nextFirst.roman})`);
		} else if (prevLast) {
			bigParts.push(`follows ${prevLast.chordSymbol} (${prevLast.roman})`);
		}

		const leadText = bigParts[0] ?? "Advances the phrase";
		const capLead = leadText[0].toUpperCase() + leadText.slice(1);
		let biggerPicture =
			bigParts.length > 1
				? `${capLead} and ${bigParts.slice(1).join(", ")}.`
				: `${capLead}.`;
		if (subBarFlow) {
			biggerPicture += ` ${subBarFlow}`;
		}

		// --- Lens 3: Why it works ---
		const whyParts: string[] = [];
		const tritoneToNext =
			nextFirst && last.baseSymbol !== nextFirst.baseSymbol
				? describeTritoneResolution(last, nextFirst)
				: null;
		const tritoneFromPrev =
			prevLast && prevLast.baseSymbol !== first.baseSymbol
				? describeTritoneResolution(prevLast, first)
				: null;
		if (tritoneToNext) {
			whyParts.push(`${tritoneToNext}.`);
		} else if (tritoneFromPrev) {
			whyParts.push(`${tritoneFromPrev}.`);
		}

		const sameAsPrev = prevLast?.baseSymbol === first.baseSymbol;
		const sameAsNext = nextFirst?.baseSymbol === last.baseSymbol;
		const sharedPrev =
			prevLast && !sameAsPrev ? getSharedToneNames(prevLast, first) : [];
		const sharedNext =
			nextFirst && !sameAsNext ? getSharedToneNames(last, nextFirst) : [];

		if (sameAsPrev) {
			whyParts.push(
				`Carries ${first.baseSymbol} across the barline while refreshing the bass or voicing.`,
			);
		} else if (sameAsNext && nextFirst) {
			whyParts.push(
				`Links ${last.baseSymbol} directly across the barline into ${nextFirst.chordSymbol} with zero harmonic seam.`,
			);
		}
		if (sharedPrev.length > 0 && sharedNext.length > 0) {
			whyParts.push(
				`Keeps ${formatNoteList(sharedPrev)} from ${prevLast?.baseSymbol} and carries ${formatNoteList(sharedNext)} into ${nextFirst?.baseSymbol} for seamless voice leading.`,
			);
		} else if (sharedNext.length > 0) {
			whyParts.push(
				`Shares ${formatNoteList(sharedNext)} as smooth anchor tone${sharedNext.length > 1 ? "s" : ""} into ${nextFirst?.chordSymbol}.`,
			);
		} else if (sharedPrev.length > 0) {
			whyParts.push(
				`Holds ${formatNoteList(sharedPrev)} over from ${prevLast?.chordSymbol} so the shift sounds effortless.`,
			);
		}

		if (bassRun.length >= 2) {
			whyParts.push(
				`Holds ${bassRun.bassName} steady as a bass pedal across Bars ${bassRun.startIdx + 1}–${bassRun.endIdx + 1}, letting upper voices move freely without losing harmonic grounding.`,
			);
		} else {
			const bassPrev = prevLast ? describeBassMotion(prevLast, first) : null;
			const bassNext = nextFirst ? describeBassMotion(last, nextFirst) : null;
			if (bassNext) {
				whyParts.push(
					`Its bass line ${bassNext}${bassPrev ? `, after it ${bassPrev}` : ""}.`,
				);
			} else if (bassPrev) {
				whyParts.push(`Its bass line ${bassPrev}.`);
			}
		}

		if (whyParts.length === 0) {
			whyParts.push(
				`Its chord tones (${first.chordNotes.join(" · ")}) fit tightly within ${keyLabel} voice leading.`,
			);
		}
		const whyItWorks = whyParts.slice(0, 2).join(" ");

		const roleLabel = buildRoleLabel({
			idx,
			totalBars: steps.length,
			atom: first,
			contextualRoman,
			bassRun,
			isCadenceArrival,
			isPlagalArrival,
			isMinorPlagal,
			isDeceptiveArrival,
			isHalfCadence,
			isCadential64,
			isPicardy,
			isParallelMinor,
			isSecondaryDom,
			isTritoneSub,
			isPassingDim,
		});

		const cardSummary = buildCardSummary({
			idx,
			totalBars: steps.length,
			atom: first,
			lastAtom: last,
			subAtoms: span.atoms,
			prevLast,
			nextFirst,
			contextualRoman,
			bassRun,
			sameChordRun,
			isCadenceArrival,
			isPlagalArrival,
			isMinorPlagal,
			isDeceptiveArrival,
			isHalfCadence,
			isCadential64,
			isPicardy,
			isParallelMinor,
			isSecondaryDom,
			isTritoneSub,
			isPassingDim,
			isIiVI,
		});

		const devices = buildDevicesList({
			atom: first,
			contextualRoman,
			bassRun,
			isCadenceArrival: isCadenceArrival || isPlagalArrival,
			isHalfCadence,
			isDeceptiveArrival,
			isMinorPlagal,
			isCadential64,
			isIiVI,
			isChromaticBass,
			isSecondaryDom,
			hasTritoneRes: Boolean(tritoneToNext || tritoneFromPrev),
			sharedTonesCount: Math.max(sharedPrev.length, sharedNext.length),
			hasSubBars,
		});

		const override = barNotes?.[String(idx + 1)];
		return {
			roleLabel: override?.roleLabel ?? roleLabel,
			contextualRoman: override?.contextualRoman ?? contextualRoman,
			cardSummary: override?.cardSummary ?? cardSummary,
			whatItDoes: override?.whatItDoes ?? whatItDoes,
			biggerPicture: override?.biggerPicture ?? biggerPicture,
			whyItWorks: override?.whyItWorks ?? whyItWorks,
			...(subBarFlow ? { subBarFlow } : {}),
			devices: override?.devices ?? devices,
		};
	});
}
