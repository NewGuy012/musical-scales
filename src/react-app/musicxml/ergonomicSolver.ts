import type { InstrumentTab } from "../songs/songRuntime";
import {
	BOWED_TUNINGS,
	type BowedInstrument,
	MAX_SONG_BOWED_SEMITONE,
} from "../theory/celloFingerboard";
import {
	DEFAULT_GUITAR_TUNING_MIDI,
	MAX_SONG_GUITAR_FRET,
} from "../theory/guitarFretboard";

export interface SolvedStop {
	stringIndex: number;
	fret: number; // guitar fret or bowed semitone
	finger?: number;
}

interface SolverNoteInput {
	midi: number;
	stringIndex?: number;
	fret?: number;
	finger?: number;
}

export interface SolverOnsetGroup {
	notes: SolverNoteInput[];
}

interface CandidateState {
	stops: SolvedStop[];
	handPos: number;
	intraCost: number;
}

function inferBowedFingerInFrame(semitone: number, handPos: number): number {
	if (semitone <= 0) return 0;
	const offset = semitone - handPos;
	if (semitone >= 12) {
		if (offset <= 0) return 1;
		if (offset <= 2) return 2;
		return 3;
	}
	if (offset <= 0) return 1;
	if (offset === 1) return 2;
	if (offset === 2) return 3;
	return 4;
}

function clampToInstrumentRange(
	midi: number,
	minOpen: number,
	maxTop: number,
): number {
	let m = midi;
	while (m < minOpen && m + 12 <= maxTop) m += 12;
	while (m > maxTop && m - 12 >= minOpen) m -= 12;
	return Math.max(minOpen, Math.min(maxTop, m));
}

function scoreGripIntraCost(
	stops: readonly SolvedStop[],
	handPos: number,
	numStrings: number,
	span: number,
	widePenalty: number,
): number {
	let cost = span * 1.4 + handPos * 0.12 + widePenalty;
	for (const st of stops) {
		if (st.fret === 0) {
			cost -= 1.4;
		} else {
			cost += st.fret * 0.28;
			if (st.fret > 12) {
				cost += (st.fret - 12) * 0.65;
			}
			// Discourage playing high up on thick lower strings when top strings work
			if (st.fret > 9 && st.stringIndex < numStrings - 1) {
				cost += (numStrings - 1 - st.stringIndex) * 0.75;
			}
		}
	}
	return cost;
}

function expandHandPositions(
	stops: readonly SolvedStop[],
	windowSpan: number,
	numStrings: number,
	isBowed: boolean,
	widePenalty: number,
): CandidateState[] {
	const nonZero = stops.map((s) => s.fret).filter((f) => f > 0);
	if (nonZero.length === 0) {
		const finalized = stops.map((s) =>
			isBowed ? { ...s, finger: s.finger ?? 0 } : { ...s },
		);
		return [
			{
				stops: finalized,
				handPos: 1,
				intraCost: scoreGripIntraCost(finalized, 1, numStrings, 0, widePenalty),
			},
		];
	}

	const minNZ = Math.min(...nonZero);
	const maxNZ = Math.max(...nonZero);
	const span = maxNZ - minNZ;
	const minAnchor = Math.max(1, maxNZ - windowSpan);
	const maxAnchor = minNZ;
	const positions =
		minAnchor <= maxAnchor
			? Array.from(
					{ length: maxAnchor - minAnchor + 1 },
					(_, i) => minAnchor + i,
				)
			: [minNZ];

	return positions.map((pos) => {
		const finalized = stops.map((s) =>
			isBowed
				? {
						...s,
						finger: s.finger ?? inferBowedFingerInFrame(s.fret, pos),
					}
				: { ...s },
		);
		return {
			stops: finalized,
			handPos: pos,
			intraCost: scoreGripIntraCost(
				finalized,
				pos,
				numStrings,
				span,
				widePenalty,
			),
		};
	});
}

function hasValidExplicitStop(
	note: SolverNoteInput,
	numStrings: number,
	maxFret: number,
): note is SolverNoteInput & { stringIndex: number; fret: number } {
	return (
		note.stringIndex !== undefined &&
		note.fret !== undefined &&
		note.stringIndex >= 0 &&
		note.stringIndex < numStrings &&
		note.fret >= 0 &&
		note.fret <= maxFret
	);
}

function buildCandidatesForOnset(
	group: SolverOnsetGroup,
	openMidiPerString: readonly number[],
	maxFret: number,
	windowSpan: number,
	isBowed: boolean,
): CandidateState[] {
	const numStrings = openMidiPerString.length;
	const minOpen = Math.min(...openMidiPerString);
	const maxTop = Math.max(...openMidiPerString) + maxFret;

	if (group.notes.every((n) => hasValidExplicitStop(n, numStrings, maxFret))) {
		const explicitStops: SolvedStop[] = group.notes.map((n) => ({
			stringIndex: n.stringIndex!,
			fret: n.fret!,
			...(n.finger !== undefined ? { finger: n.finger } : {}),
		}));
		return expandHandPositions(
			explicitStops,
			windowSpan,
			numStrings,
			isBowed,
			0,
		);
	}

	const targetNotes = group.notes.slice(0, numStrings);
	const optionsPerNote: SolvedStop[][] = targetNotes.map((n) => {
		if (hasValidExplicitStop(n, numStrings, maxFret)) {
			return [{ stringIndex: n.stringIndex, fret: n.fret, finger: n.finger }];
		}
		const targetMidi = clampToInstrumentRange(n.midi, minOpen, maxTop);
		const opts: SolvedStop[] = [];
		for (let s = 0; s < numStrings; s++) {
			const f = targetMidi - openMidiPerString[s];
			if (f >= 0 && f <= maxFret) {
				opts.push({ stringIndex: s, fret: f });
			}
		}
		if (opts.length === 0) {
			let bestS = 0;
			let bestF = 0;
			let bestDist = Infinity;
			for (let s = 0; s < numStrings; s++) {
				const rawF = targetMidi - openMidiPerString[s];
				const clampedF = Math.max(0, Math.min(maxFret, rawF));
				const dist = Math.abs(rawF - clampedF);
				if (dist < bestDist) {
					bestDist = dist;
					bestS = s;
					bestF = clampedF;
				}
			}
			opts.push({ stringIndex: bestS, fret: bestF });
		}
		return opts;
	});

	const rawGrips: {
		stops: SolvedStop[];
		widePenalty: number;
		baseCost: number;
	}[] = [];
	const usedStrings = new Set<number>();
	const chosen: SolvedStop[] = [];

	function search(idx: number, allowWideFallback: boolean) {
		if (rawGrips.length >= 24) return;
		if (idx === optionsPerNote.length) {
			const nonZero = chosen.map((c) => c.fret).filter((f) => f > 0);
			const span =
				nonZero.length > 1 ? Math.max(...nonZero) - Math.min(...nonZero) : 0;
			const spanLimit = allowWideFallback ? windowSpan + 2 : windowSpan;
			if (nonZero.length > 1 && span > spanLimit) return;

			const widePenalty = allowWideFallback && span > windowSpan ? 12 : 0;
			const basePos = nonZero.length > 0 ? Math.min(...nonZero) : 1;
			rawGrips.push({
				stops: chosen.map((c) => ({ ...c })),
				widePenalty,
				baseCost: scoreGripIntraCost(
					chosen,
					basePos,
					numStrings,
					span,
					widePenalty,
				),
			});
			return;
		}

		for (const opt of optionsPerNote[idx]) {
			if (
				usedStrings.has(opt.stringIndex) &&
				targetNotes.length <= numStrings
			) {
				continue;
			}
			usedStrings.add(opt.stringIndex);
			chosen.push(opt);
			search(idx + 1, allowWideFallback);
			chosen.pop();
			usedStrings.delete(opt.stringIndex);
		}
	}

	search(0, false);
	if (rawGrips.length === 0) {
		search(0, true);
	}
	if (rawGrips.length === 0) {
		const fallbackStops = optionsPerNote.map((opts) => ({ ...opts[0] }));
		return expandHandPositions(
			fallbackStops,
			windowSpan,
			numStrings,
			isBowed,
			25,
		);
	}

	rawGrips.sort((a, b) => a.baseCost - b.baseCost);
	const topGrips = rawGrips.slice(0, 10);
	const expanded: CandidateState[] = [];
	for (const g of topGrips) {
		expanded.push(
			...expandHandPositions(
				g.stops,
				windowSpan,
				numStrings,
				isBowed,
				g.widePenalty,
			),
		);
	}
	return expanded;
}

function transitionCost(prev: CandidateState, next: CandidateState): number {
	const shift = Math.abs(next.handPos - prev.handPos);
	let cost = shift * 2.2;
	if (prev.stops.length === 1 && next.stops.length === 1) {
		const strJump = Math.abs(
			next.stops[0].stringIndex - prev.stops[0].stringIndex,
		);
		if (strJump >= 3) cost += 1.0;
	}
	return cost;
}

/**
 * Solves minimum-shift left-hand stops across an ordered sequence of onset groups
 * for Guitar, Cello, or Violin using Viterbi dynamic programming.
 */
export function solveInstrumentStops(
	groups: readonly SolverOnsetGroup[],
	instrument: InstrumentTab,
	tuningMidi?: readonly number[],
	capo = 0,
): SolvedStop[][] {
	if (instrument === "piano" || groups.length === 0) {
		return groups.map(() => []);
	}

	const isBowed = instrument === "cello" || instrument === "violin";
	const openMidiPerString = isBowed
		? (tuningMidi ??
			BOWED_TUNINGS[instrument as BowedInstrument].map((s) => s.openMidi))
		: (tuningMidi ?? DEFAULT_GUITAR_TUNING_MIDI).map((m) => m + capo);
	const maxFret = isBowed ? MAX_SONG_BOWED_SEMITONE : MAX_SONG_GUITAR_FRET;
	const windowSpan = 3; // 4-fret / 4-semitone closed hand frame (fingers 1..4)

	const trellis = groups.map((g) =>
		buildCandidatesForOnset(g, openMidiPerString, maxFret, windowSpan, isBowed),
	);

	const dp: number[][] = trellis.map((cands) => cands.map(() => Infinity));
	const back: number[][] = trellis.map((cands) => cands.map(() => 0));

	for (let c = 0; c < trellis[0].length; c++) {
		dp[0][c] = trellis[0][c].intraCost;
	}

	for (let t = 1; t < trellis.length; t++) {
		for (let c = 0; c < trellis[t].length; c++) {
			let bestCost = Infinity;
			let bestPrev = 0;
			for (let p = 0; p < trellis[t - 1].length; p++) {
				const cost =
					dp[t - 1][p] +
					transitionCost(trellis[t - 1][p], trellis[t][c]) +
					trellis[t][c].intraCost;
				if (cost < bestCost) {
					bestCost = cost;
					bestPrev = p;
				}
			}
			dp[t][c] = bestCost;
			back[t][c] = bestPrev;
		}
	}

	let lastBest = 0;
	let minFinal = Infinity;
	const lastRow = dp[dp.length - 1];
	for (let c = 0; c < lastRow.length; c++) {
		if (lastRow[c] < minFinal) {
			minFinal = lastRow[c];
			lastBest = c;
		}
	}

	const result: SolvedStop[][] = new Array(groups.length);
	let curIdx = lastBest;
	for (let t = groups.length - 1; t >= 0; t--) {
		result[t] = trellis[t][curIdx].stops;
		curIdx = back[t][curIdx];
	}
	return result;
}
