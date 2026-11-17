import { describe, expect, test } from "bun:test";
import { Midi } from "@tonejs/midi";
import { solveInstrumentStops } from "../scripts/transcription/ergonomicSolver";
import {
	detectKeyFromEvents,
	inferHarmonyForWindow,
	resolveExplicitChordSymbol,
} from "../scripts/transcription/harmonicAnalyzer";
import {
	importMidiBuffer,
	importScoreWithAlphaTab,
	inspectAlphaTabScore,
	inspectMidiFile,
} from "../scripts/transcription/importers";
import {
	type ScoreBarIR,
	type ScoreTrackIR,
	buildTempoConverter,
	compileScoreTrackToSongSpec,
	formatSongSpecModule,
	linearizeRepeatedBars,
} from "../scripts/transcription/scoreIr";
import {
	encodeWavPcm16,
	renderTimedSequenceOfflineSamples,
} from "../src/react-app/audio/synth";
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

	test("imports Drop-D guitar MusicXML with TAB stops, repeats, ties, harmonics, and renders PCM WAV", () => {
		const guitarXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Drop D Study</work-title></work>
  <part-list><score-part id="P1"><part-name>Acoustic Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>2</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>TAB</sign><line>5</line></clef>
        <staff-details>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1"><tuning-step>D</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
        </staff-details>
      </attributes>
      <barline location="left"><repeat direction="forward"/></barline>
      <direction><sound tempo="120"/></direction>
      <note><pitch><step>D</step><octave>2</octave></pitch><duration>4</duration><type>quarter</type><tie type="start"/><notations><tied type="start"/><technical><string>6</string><fret>0</fret></technical></notations></note>
      <note><pitch><step>D</step><octave>2</octave></pitch><duration>4</duration><type>quarter</type><tie type="stop"/><notations><tied type="stop"/><technical><string>6</string><fret>0</fret></technical></notations></note>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type><notations><technical><harmonic><natural/></harmonic><string>6</string><fret>12</fret></technical></notations></note>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><type>quarter</type><notations><technical><string>1</string><fret>2</fret></technical></notations></note>
      <barline location="right"><ending number="1" type="start"/><ending number="1" type="stop"/><repeat direction="backward"/></barline>
    </measure>
    <measure number="2">
      <barline location="left"><ending number="2" type="start"/></barline>
      <note><pitch><step>D</step><octave>2</octave></pitch><duration>16</duration><type>whole</type><notations><technical><string>6</string><fret>0</fret></technical></notations></note>
      <barline location="right"><ending number="2" type="stop"/></barline>
    </measure>
  </part>
</score-partwise>`;

		const bytes = new TextEncoder().encode(guitarXml);
		const inspected = inspectAlphaTabScore(bytes);
		expect(inspected.tracks).toHaveLength(1);
		expect(inspected.tracks[0].isStringed).toBe(true);
		expect(inspected.tracks[0].suggestedInstrument).toBe("guitar");

		const imported = importScoreWithAlphaTab(bytes, {
			id: "drop-d-study",
			composerOrSource: "Test Suite",
		});
		const { trackIr, songSpec } = imported;
		expect(trackIr.tuningMidi).toEqual([38, 45, 50, 55, 59, 64]);
		expect(songSpec.tuning).toEqual([38, 45, 50, 55, 59, 64]);
		expect(songSpec.keyLabel).toBe("D Major");
		// Bar 1 repeated (pass 1 = 1st ending), then skipped into Bar 2 (2nd ending) => 2 or 3 linear bars depending on ending structure;
		// specifically Bar 1 is both body+1st ending so repeat unrolls cleanly to [Bar 1, Bar 2] or [Bar 1, Bar 1, Bar 2]
		expect(songSpec.bars.length).toBeGreaterThanOrEqual(2);
		// Tied quarter + quarter merges into half-note durationTicks (1920 ticks) on Beat 1
		expect(trackIr.bars[0].notes).toHaveLength(3);
		expect(trackIr.bars[0].notes[0].durationTicks).toBe(1920);
		expect(trackIr.bars[0].notes[1].technique).toBe("harmonic");

		const song = hydrateSong(songSpec);
		const flat = flattenSongPlaybackSteps(song);
		const pcm = renderTimedSequenceOfflineSamples(flat.events, {
			preset: "guitar",
			sampleRate: 22050,
			totalDurationMs: flat.totalDurationMs,
		});
		const wav = encodeWavPcm16(pcm, 22050);
		expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
		expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
		expect(wav.length).toBeGreaterThan(44);
	});

	test("imports non-TAB orchestral cello MusicXML and solves thumb-position bowed stops", () => {
		const celloXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Cello Thumb Position Test</work-title></work>
  <part-list><score-part id="P1"><part-name>Violoncello</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>1</fifths><mode>major</mode></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction><sound tempo="96"/></direction>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><notations><articulations><staccato/></articulations></notations></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

		const bytes = new TextEncoder().encode(celloXml);
		const { trackIr, songSpec } = importScoreWithAlphaTab(bytes);
		expect(trackIr.instrument).toBe("cello");
		expect(songSpec.keyLabel).toBe("G Major");
		const song = hydrateSong(songSpec);
		expect(song.steps[0].events).toHaveLength(3);
		// D5 (MIDI 74) = 17 semitones above Cello A3 (57) -> needs extended MAX_SONG_BOWED_SEMITONE
		const thumbStop = song.steps[0].events[2].celloStops?.[0];
		expect(thumbStop?.stringIndex).toBe(3);
		expect(thumbStop?.semitone).toBe(17);
		expect(song.steps[0].events[1].notes?.[0].technique).toBe("staccato");
	});

	test("imports multi-track MIDI buffer with quantization, tempo change, key detection, and Viterbi guitar solver", () => {
		const midi = new Midi();
		midi.name = "Fingerstyle MIDI";
		midi.header.tempos.push({ ticks: 0, bpm: 100 });
		midi.header.tempos.push({ ticks: midi.header.ppq * 4, bpm: 150 });
		midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
		midi.header.keySignatures.push({ ticks: 0, key: "A", scale: "minor" });

		// Drum track on channel 9 should be skipped automatically
		const drumTrack = midi.addTrack();
		drumTrack.channel = 9;
		drumTrack.name = "Drums";
		drumTrack.addNote({
			midi: 36,
			ticks: 0,
			durationTicks: 240,
			velocity: 0.9,
		});

		// Acoustic guitar track with slight 10-tick audio-to-MIDI chord jitter
		const gtrTrack = midi.addTrack();
		gtrTrack.name = "Acoustic Guitar";
		gtrTrack.instrument.number = 24;
		gtrTrack.channel = 0;
		const ppq = midi.header.ppq;
		gtrTrack.addNote({
			midi: 45,
			ticks: 0,
			durationTicks: ppq * 2,
			velocity: 0.85,
		});
		gtrTrack.addNote({
			midi: 64,
			ticks: 10,
			durationTicks: ppq,
			velocity: 0.8,
		});
		gtrTrack.addNote({
			midi: 60,
			ticks: ppq * 2,
			durationTicks: ppq * 2,
			velocity: 0.78,
		});
		gtrTrack.addNote({
			midi: 57,
			ticks: ppq * 4,
			durationTicks: ppq * 4,
			velocity: 0.82,
		});

		const bytes = midi.toArray();
		const inspected = inspectMidiFile(bytes);
		expect(inspected.tracks).toHaveLength(2);
		expect(inspected.tracks[0].isPercussion).toBe(true);

		const { songSpec, selectedTrack } = importMidiBuffer(bytes, {
			quantizeSubdivision: 16,
		});
		expect(selectedTrack.index).toBe(1);
		expect(songSpec.instruments).toEqual(["guitar"]);
		expect(songSpec.keyLabel).toBe("A Minor");

		const song = hydrateSong(songSpec);
		expect(song.steps).toHaveLength(2);
		// Quantizer should align staggered 0-tick and 10-tick attacks into a single dyad
		expect(song.steps[0].events[0].midi).toEqual([45, 64]);
		expect(song.steps[0].events[0].guitarStops).toHaveLength(2);
		// Tempo increases from 100 BPM in bar 1 (2400ms) to 150 BPM in bar 2 (1600ms)
		expect(song.steps[0].barDurationMs).toBe(2400);
		expect(song.steps[1].barDurationMs).toBe(1600);
	});
});
