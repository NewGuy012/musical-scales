import { describe, expect, test } from "bun:test";
import { solveInstrumentStops } from "../scripts/transcription/ergonomicSolver";
import {
	detectKeyFromEvents,
	inferHarmonyForWindow,
	resolveExplicitChordSymbol,
} from "../scripts/transcription/harmonicAnalyzer";
import {
	type ScoreBarIR,
	type ScoreTrackIR,
	buildTempoConverter,
	compileScoreTrackToSongSpec,
	formatSongSpecModule,
	linearizeRepeatedBars,
} from "../scripts/transcription/scoreIr";
import { renderTimedSequenceOfflineSamples } from "../src/react-app/audio/synth";
import {
	CELLO_TUNING,
	MAX_SONG_BOWED_SEMITONE,
} from "../src/react-app/theory/celloFingerboard";
import {
	GUITAR_TUNING_PRESETS,
	MAX_SONG_GUITAR_FRET,
} from "../src/react-app/theory/guitarFretboard";
import {
	flattenSongPlaybackSteps,
	getSongBarStartTimes,
	hydrateSong,
} from "../src/react-app/theory/songExamples";

describe("Score IR compiler, ergonomic solver, and harmonic analyzer", () => {
	test("linearizeRepeatedBars unrolls repeat signs and 1st/2nd endings cleanly", () => {
		const bars: ScoreBarIR[] = [
			{
				barNumber: 1,
				repeatStart: true,
				notes: [
					{ midi: 55, offsetTicks: 0, durationTicks: 480, velocity: 0.8 },
				],
			},
			{
				barNumber: 2,
				endingNumbers: [1],
				repeatEndCount: 2,
				notes: [
					{ midi: 57, offsetTicks: 0, durationTicks: 480, velocity: 0.8 },
				],
			},
			{
				barNumber: 3,
				endingNumbers: [2],
				notes: [
					{ midi: 59, offsetTicks: 0, durationTicks: 480, velocity: 0.8 },
				],
			},
		];

		const unrolled = linearizeRepeatedBars(bars);
		expect(unrolled.map((b) => b.barNumber)).toEqual([1, 2, 1, 3]);
	});

	test("buildTempoConverter handles tempo shifts accurately without drift", () => {
		const { tickToMs, initialBpm } = buildTempoConverter(480, [
			{ atTick: 0, bpm: 120 }, // 500ms per quarter
			{ atTick: 960, bpm: 60 }, // 1000ms per quarter after 2 quarters
		]);
		expect(initialBpm).toBe(120);
		expect(tickToMs(0)).toBe(0);
		expect(tickToMs(960)).toBeCloseTo(1000, 4);
		expect(tickToMs(1440)).toBeCloseTo(2000, 4);
	});

	test("Viterbi guitar solver chooses minimum-shift playable stops across standard and Drop-D + capo", () => {
		const solved = solveInstrumentStops(
			[
				{ notes: [{ midi: 69 }] },
				{ notes: [{ midi: 72 }] },
				{ notes: [{ midi: 71 }] },
				{ notes: [{ midi: 69 }] },
			],
			"guitar",
		);
		expect(solved).toHaveLength(4);
		for (const group of solved) {
			expect(group).toHaveLength(1);
			expect(group[0].fret).toBeGreaterThanOrEqual(0);
			expect(group[0].fret).toBeLessThanOrEqual(MAX_SONG_GUITAR_FRET);
		}
		const frets = solved.map((g) => g[0].fret);
		expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);

		// Drop D + Capo 2: open low string sounds E2 (MIDI 40)
		const dropDCapo2 = solveInstrumentStops(
			[{ notes: [{ midi: 40 }, { midi: 59 }] }],
			"guitar",
			GUITAR_TUNING_PRESETS.dropD,
			2,
		);
		expect(dropDCapo2[0][0]).toEqual({ stringIndex: 0, fret: 0 });
	});

	test("Viterbi cello solver handles open strings, double stops, and thumb position cleanly", () => {
		const solved = solveInstrumentStops(
			[
				{ notes: [{ midi: 43 }] }, // open G2
				{ notes: [{ midi: 50 }] }, // open D3
				{ notes: [{ midi: 59 }] }, // B3 on A string
				{ notes: [{ midi: 57 }] }, // open A3
				{ notes: [{ midi: 74 }] }, // thumb-position D5 on A string (semitone 17)
				{ notes: [{ midi: 43 }, { midi: 59 }] }, // G2 + B3 double stop
			],
			"cello",
		);
		expect(solved[0][0]).toEqual({ stringIndex: 1, fret: 0, finger: 0 });
		expect(solved[1][0]).toEqual({ stringIndex: 2, fret: 0, finger: 0 });
		expect(solved[3][0]).toEqual({ stringIndex: 3, fret: 0, finger: 0 });
		expect(solved[4][0].stringIndex).toBe(3);
		expect(solved[4][0].fret).toBe(74 - CELLO_TUNING[3].openMidi);
		expect(solved[4][0].fret).toBeLessThanOrEqual(MAX_SONG_BOWED_SEMITONE);
		expect(solved[5][0].stringIndex).not.toBe(solved[5][1].stringIndex);
	});

	test("harmonic analyzer detects key signature, bar chords, and explicit chord symbols", () => {
		const key = detectKeyFromEvents([
			{ midi: 43, offsetTicks: 0, durationTicks: 960 },
			{ midi: 59, offsetTicks: 0, durationTicks: 480 },
			{ midi: 62, offsetTicks: 480, durationTicks: 480 },
			{ midi: 66, offsetTicks: 960, durationTicks: 480 },
			{ midi: 55, offsetTicks: 1440, durationTicks: 960 },
		]);
		expect(key.keySlot).toBe(1);
		expect(key.keyMode).toBe("major");
		expect(key.keyLabel).toBe("G Major");

		const e7 = inferHarmonyForWindow(
			[
				{ midi: 40, offsetTicks: 0, durationTicks: 480 },
				{ midi: 56, offsetTicks: 0, durationTicks: 480 },
				{ midi: 59, offsetTicks: 480, durationTicks: 480 },
				{ midi: 62, offsetTicks: 480, durationTicks: 480 },
			],
			1,
			"major",
			0,
			480,
		);
		expect(e7.chordSymbol).toBe("E7");
		expect(e7.quality).toBe("major");

		const cSharpDim = resolveExplicitChordSymbol("C#dim7", 1, "major");
		expect(cSharpDim?.chordSymbol).toBe("C♯dim7");
		expect(cSharpDim?.quality).toBe("diminished");
	});

	test("compileScoreTrackToSongSpec compiles polyphonic ScoreTrackIR into playable hydrated SongExample & offline audio", () => {
		const track: ScoreTrackIR = {
			id: "ir-demo-guitar",
			title: "Demo Rag",
			composerOrSource: "Pipeline Test",
			instrument: "guitar",
			ticksPerQuarter: 480,
			tempoEvents: [{ atTick: 0, bpm: 120 }],
			keySignature: { keySlot: 1, keyMode: "major", keyLabel: "G Major" },
			bars: [
				{
					barNumber: 1,
					sectionMarker: "Theme",
					timeSignature: { numerator: 4, denominator: 4 },
					notes: [
						// Steady thumb bass (palm-muted) + sustained syncopated melody
						{
							midi: 40,
							offsetTicks: 0,
							durationTicks: 240,
							velocity: 0.55,
							technique: "palmMute",
						},
						{
							midi: 71,
							offsetTicks: 0,
							durationTicks: 720,
							velocity: 0.92,
							technique: "letRing",
						},
						{
							midi: 56,
							offsetTicks: 480,
							durationTicks: 240,
							velocity: 0.58,
							technique: "palmMute",
						},
						{
							midi: 64,
							offsetTicks: 720,
							durationTicks: 480,
							velocity: 0.9,
						},
						{
							midi: 40,
							offsetTicks: 960,
							durationTicks: 240,
							velocity: 0.55,
							technique: "palmMute",
						},
						{
							midi: 56,
							offsetTicks: 1440,
							durationTicks: 240,
							velocity: 0.58,
							technique: "palmMute",
						},
					],
				},
			],
		};

		const spec = compileScoreTrackToSongSpec(track, {
			splitHalfBarHarmony: true,
		});
		expect(spec.bars).toHaveLength(1);
		const tsModule = formatSongSpecModule(spec, "DEMO_RAG_SPEC");
		expect(tsModule).toContain("export const DEMO_RAG_SPEC: CompactSongSpec");

		const song = hydrateSong(spec);
		expect(getSongBarStartTimes(song)).toEqual([0]);
		const flat = flattenSongPlaybackSteps(song);
		expect(flat.totalDurationMs).toBe(2000);
		expect(flat.events).toHaveLength(5);
		expect(flat.events[0].midi).toEqual([40, 71]);
		expect(flat.events[0].notes?.map((n) => n.technique)).toEqual([
			"palmMute",
			"letRing",
		]);
		expect(flat.events[0].guitarStops).toHaveLength(2);

		const samples = renderTimedSequenceOfflineSamples(flat.events, {
			preset: "guitar",
			sampleRate: 22050,
			totalDurationMs: flat.totalDurationMs,
		});
		expect(samples.length).toBeGreaterThan(44100);
	});
});
