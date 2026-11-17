import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { playTimedSequence } from "../src/react-app/audio/synth";
import { BowedFingerboard } from "../src/react-app/components/BowedFingerboard";
import { GuitarFretboard } from "../src/react-app/components/GuitarFretboard";
import { PianoKeyboard } from "../src/react-app/components/PianoKeyboard";
import { SongExamplesPanel } from "../src/react-app/components/SongExamplesPanel";
import { compileMusicXml } from "../src/react-app/musicxml";
import {
	findPlaybackEventAtTime,
	flattenSongPlaybackSteps,
	formatSongTime,
	getSongBarStartTimes,
	hydrateSong,
	scaleSongExampleSpeed,
} from "../src/react-app/songs/songRuntime";
import { getBowedVoicings } from "../src/react-app/theory/celloFingerboard";
import { analyzeKey } from "../src/react-app/theory/circleOfFifths";
import { getGuitarVoicings } from "../src/react-app/theory/guitarFretboard";

const noop = () => {};

function buildSampleCelloXml(barsCount = 16): string {
	const measures = Array.from({ length: barsCount }, (_, i) => {
		const isFirst = i === 0;
		const attrs = isFirst
			? `<attributes>
        <divisions>4</divisions>
        <key><fifths>1</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction><sound tempo="96"/></direction>`
			: "";
		const rehearsal =
			i === 0
				? `<direction><direction-type><rehearsal>Opening</rehearsal></direction-type></direction>`
				: i === 8
					? `<direction><direction-type><rehearsal>Development</rehearsal></direction-type></direction>`
					: "";
		return `<measure number="${i + 1}">
      ${attrs}
      ${rehearsal}
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>`;
	}).join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Cello Suite Prelude Sample</work-title></work>
  <identification><creator type="composer">J.S. Bach</creator></identification>
  <part-list><score-part id="P1"><part-name>Cello</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`;
}

describe("songPlayback helpers and synchronized UI", () => {
	test("bar start times, binary search lookup, and time formatting stay aligned", async () => {
		const { songDoc } = await compileMusicXml(
			new TextEncoder().encode(buildSampleCelloXml(16)),
		);
		const celloSong = hydrateSong(songDoc);
		const flat = flattenSongPlaybackSteps(celloSong);
		const barStarts = getSongBarStartTimes(celloSong);

		expect(barStarts).toHaveLength(16);
		expect(barStarts[0]).toBe(0);
		for (let i = 1; i < barStarts.length; i++) {
			expect(barStarts[i]).toBeGreaterThan(barStarts[i - 1]);
		}

		expect(findPlaybackEventAtTime([], 500)).toEqual({
			eventIndex: -1,
			event: null,
		});
		expect(findPlaybackEventAtTime(flat.events, -20).eventIndex).toBe(0);

		const midBar1 = findPlaybackEventAtTime(flat.events, 700);
		expect(midBar1.eventIndex).toBe(1);
		expect(midBar1.event?.chordStepIndex).toBe(0);

		const bar10 = findPlaybackEventAtTime(flat.events, barStarts[9]);
		expect(bar10.event?.chordStepIndex).toBe(9);

		const pastEnd = findPlaybackEventAtTime(
			flat.events,
			flat.totalDurationMs + 5000,
		);
		expect(pastEnd.eventIndex).toBe(flat.events.length - 1);
		expect(pastEnd.event?.chordStepIndex).toBe(15);

		expect(formatSongTime(0)).toBe("0:00");
		expect(formatSongTime(-400)).toBe("0:00");
		expect(formatSongTime(65400)).toBe("1:05");
		expect(formatSongTime(flat.totalDurationMs)).toMatch(/^\d+:\d{2}$/);
	});

	test("SongExamplesPanel renders empty MusicXML prompt, transport bar, local preview badge, and speed controls", async () => {
		const emptyHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={[]}
				activeInstrumentLabel="Guitar"
				otherInstrumentsWithSongs={[
					{ instrument: "piano", label: "Piano", count: 2 },
				]}
				playingSongId={null}
				activeChordStepIndex={null}
				activeNoteLabel={null}
				selectedPreviewStepId={null}
				onRequestImportMusicXml={noop}
				onSelectInstrument={noop}
				onTogglePlaySong={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(emptyHtml).toContain("No Guitar MusicXML scores ingested yet");
		expect(emptyHtml).toContain("Load MusicXML File");
		expect(emptyHtml).toContain("songs/songs.txt");
		expect(emptyHtml).toContain("Piano (2)");

		const { songDoc } = await compileMusicXml(
			new TextEncoder().encode(buildSampleCelloXml(16)),
		);
		const celloSong = { ...hydrateSong(songDoc), isLocalPreview: true };
		const flat = flattenSongPlaybackSteps(celloSong);
		const barStarts = getSongBarStartTimes(celloSong);

		const idleHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={[celloSong]}
				playingSongId={null}
				cuedSongId={null}
				songPositionMs={0}
				playbackSpeed={0.75}
				activeChordStepIndex={null}
				activeNoteLabel={null}
				selectedPreviewStepId={null}
				onRemoveLocalPreview={noop}
				onChangePlaybackSpeed={noop}
				onTogglePlaySong={noop}
				onStopSong={noop}
				onSeekSong={noop}
				onSkipSongBar={noop}
				onPlayFromSongBar={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(idleHtml).toContain("16 Bars");
		expect(idleHtml).toContain("Local Preview");
		expect(idleHtml).toContain("Remove");
		expect(idleHtml).toContain('type="range"');
		expect(idleHtml).toContain("song-scrubber");
		expect(idleHtml).toContain("Bar 1/16");
		expect(idleHtml).toContain(
			`0:00 / ${formatSongTime(flat.totalDurationMs)}`,
		);
		expect(idleHtml).toContain("song-timeline is-long");
		expect(idleHtml).toContain("practice speed");
		expect(idleHtml).toContain("0.5x");
		expect(idleHtml).toContain("0.75x");
		expect(idleHtml).toContain("1.25x");

		const playingHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={[celloSong]}
				playingSongId={celloSong.id}
				cuedSongId={celloSong.id}
				songPositionMs={barStarts[4]}
				activeChordStepIndex={4}
				activeNoteLabel="D3 (Open II)"
				selectedPreviewStepId={null}
				onTogglePlaySong={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(playingHtml).toContain("song-card is-playing");
		expect(playingHtml).toContain("❚❚ Pause");
		expect(playingHtml).toContain("Playing");
		expect(playingHtml).toContain("Bar 5");
		expect(playingHtml).toContain("Bar 5/16");
		expect(playingHtml).toContain("Note: D3 (Open II)");

		const pausedHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={[celloSong]}
				playingSongId={null}
				cuedSongId={celloSong.id}
				songPositionMs={barStarts[8]}
				activeChordStepIndex={8}
				activeNoteLabel="B3"
				selectedPreviewStepId={null}
				onTogglePlaySong={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(pausedHtml).toContain("song-card is-paused");
		expect(pausedHtml).toContain("▶ Resume");
		expect(pausedHtml).toContain("Paused");
		expect(pausedHtml).toContain("Bar 9/16");

		const previewHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={[celloSong]}
				playingSongId={null}
				cuedSongId={null}
				songPositionMs={0}
				activeChordStepIndex={null}
				activeNoteLabel={null}
				selectedPreviewStepId={celloSong.steps[2].id}
				onTogglePlaySong={noop}
				onPlayFromSongBar={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(previewHtml).toContain("Previewing");
		expect(previewHtml).toContain("Play from Bar 3");
		expect(previewHtml).toContain("Sound &amp; Feel");
		expect(previewHtml).toContain("Harmony Hook");
		expect(previewHtml).toContain("Practice Tips");

		const slowSong = scaleSongExampleSpeed(celloSong, 0.5);
		expect(slowSong.bpm).toBe(Math.round(celloSong.bpm * 0.5));
		expect(flattenSongPlaybackSteps(slowSong).totalDurationMs).toBeCloseTo(
			flat.totalDurationMs * 2,
			-1,
		);
	});

	test("instrument visualizers render live song-hit markers and halos", () => {
		const gMajor = analyzeKey(1, "major", "standard");
		const celloVoicings = getBowedVoicings(
			"cello",
			"G",
			"major",
			["G", "B", "D"],
			false,
		);
		const celloHtml = renderToStaticMarkup(
			<BowedFingerboard
				instrument="cello"
				chordLabel="G (I)"
				chordQuality="major"
				chordKind="major"
				chordNotes={["G", "B", "D"]}
				scaleNotes={gMajor.scaleNotes}
				preferFlats={false}
				voicings={celloVoicings}
				activeVoicing={celloVoicings[0] ?? null}
				activeSongStops={[{ stringIndex: 3, semitone: 10, finger: 4 }]}
				onSelectVoicing={noop}
				onRollVoicing={noop}
				onPlayNote={noop}
			/>,
		);
		expect(celloHtml).toContain("is-song-hit");
		expect(celloHtml).toContain("song-hit-halo");

		const pianoHtml = renderToStaticMarkup(
			<PianoKeyboard
				activeMidiNotes={[60, 64, 67]}
				activeSongMidi={[62]}
				activeQuality="major"
				scalePitchClasses={[0, 2, 4, 5, 7, 9, 11]}
				onPlayNote={noop}
			/>,
		);
		expect(pianoHtml).toContain("is-song-hit");

		const guitarVoicings = getGuitarVoicings(
			"G",
			"major",
			["G", "B", "D"],
			false,
		);
		const guitarHtml = renderToStaticMarkup(
			<GuitarFretboard
				activeQuality="major"
				chordNotes={["G", "B", "D"]}
				chordKind="major"
				voicings={guitarVoicings}
				selectedVoicing={guitarVoicings[0] ?? null}
				activeSongMidi={[52]}
				scalePitchClasses={[2, 4, 6, 7, 9, 11, 0]}
				scaleNoteNames={gMajor.scaleNotes}
				preferFlats={false}
				onSelectVoicing={noop}
				onStrumVoicing={noop}
				onPlayFretNote={noop}
			/>,
		);
		expect(guitarHtml).toContain("is-song-hit");
		expect(guitarHtml).toContain("song-hit-halo");

		const dMajor = analyzeKey(2, "major", "standard");
		const violinVoicings = getBowedVoicings(
			"violin",
			"D",
			"major",
			["D", "F♯", "A"],
			false,
		);
		const violinHtml = renderToStaticMarkup(
			<BowedFingerboard
				instrument="violin"
				chordLabel="D (I)"
				chordQuality="major"
				chordKind="major"
				chordNotes={["D", "F♯", "A"]}
				scaleNotes={dMajor.scaleNotes}
				preferFlats={false}
				voicings={violinVoicings}
				activeVoicing={violinVoicings[0] ?? null}
				activeSongStops={[
					{ stringIndex: 3, semitone: 14, finger: 3, technique: "harmonic" },
				]}
				onSelectVoicing={noop}
				onRollVoicing={noop}
				onPlayNote={noop}
			/>,
		);
		expect(violinHtml).toContain("is-song-hit");
		expect(violinHtml).toContain("is-harmonic");
		expect(violinHtml).toContain("song-hit-harmonic");
	});

	test("playTimedSequence supports startOffsetMs, onProgress updates, and cancellation", async () => {
		const seenSteps: number[] = [];
		const progressValues: number[] = [];
		let doneCount = 0;

		await new Promise<void>((resolve) => {
			playTimedSequence(
				[
					{ midi: [60], atMs: 0, durationSec: 0.04 },
					{ midi: [62], atMs: 40, durationSec: 0.04 },
					{ midi: [64], atMs: 80, durationSec: 0.04 },
				],
				{
					preset: "muted",
					totalDurationMs: 120,
					startOffsetMs: 30,
					onStep: (idx) => seenSteps.push(idx),
					onProgress: (ms) => progressValues.push(ms),
					onDone: () => {
						doneCount++;
						resolve();
					},
				},
			);
		});

		expect(seenSteps).toEqual([0, 1, 2]);
		expect(doneCount).toBe(1);
		expect(progressValues.length).toBeGreaterThanOrEqual(2);
		expect(progressValues[progressValues.length - 1]).toBe(120);

		let cancelledDone = false;
		const cancel = playTimedSequence(
			[{ midi: [60], atMs: 0, durationSec: 0.08 }],
			{
				preset: "muted",
				totalDurationMs: 80,
				onDone: () => {
					cancelledDone = true;
				},
			},
		);
		cancel();
		await new Promise((r) => setTimeout(r, 110));
		expect(cancelledDone).toBe(false);
	});

	test("PianoKeyboard folds sub-C4 arpeggio events only when no key in C4..B5 is struck and preserves flat labels", () => {
		const dbMajor = analyzeKey(7, "major");
		const bassOnlyHtml = renderToStaticMarkup(
			<PianoKeyboard
				activeMidiNotes={[]}
				activeSongMidi={[49, 56]}
				activeQuality="major"
				scalePitchClasses={dbMajor.scaleNotes.map(() => 0)}
				activeNoteNamesByMidi={{ 61: "D♭", 68: "A♭" }}
				onPlayNote={noop}
			/>,
		);
		expect(bassOnlyHtml).toContain("is-song-hit");
		expect(bassOnlyHtml).toContain(">D♭</text>");
		expect(bassOnlyHtml).toContain(">A♭</text>");

		const mixedHtml = renderToStaticMarkup(
			<PianoKeyboard
				activeMidiNotes={[]}
				activeSongMidi={[49, 68]}
				activeQuality="major"
				scalePitchClasses={[]}
				activeNoteNamesByMidi={{ 61: "D♭", 68: "A♭" }}
				onPlayNote={noop}
			/>,
		);
		expect(mixedHtml).toContain(">A♭</text>");
		expect(mixedHtml).not.toContain(">D♭</text>");
	});

	test("GuitarFretboard renders explicit activeSongStops including diamond harmonic markers and extended frets", () => {
		const eMajor = analyzeKey(4, "major");
		const voicings = getGuitarVoicings("E", "major", ["E", "G♯", "B"], false);
		const harmonicHtml = renderToStaticMarkup(
			<GuitarFretboard
				activeQuality="major"
				chordNotes={["E", "G♯", "B"]}
				chordKind="major"
				voicings={voicings}
				selectedVoicing={voicings[0] ?? null}
				activeSongMidi={[40, 76]}
				activeSongStops={[
					{ stringIndex: 0, fret: 0 },
					{ stringIndex: 5, fret: 12, technique: "harmonic" },
				]}
				scalePitchClasses={[4, 6, 8, 9, 11, 1, 3]}
				scaleNoteNames={eMajor.scaleNotes}
				preferFlats={false}
				onSelectVoicing={noop}
				onStrumVoicing={noop}
				onPlayFretNote={noop}
			/>,
		);
		expect(harmonicHtml).toContain("song-hit-halo");
		expect(harmonicHtml).toContain("is-harmonic");
		expect(harmonicHtml).toContain("song-hit-harmonic");

		const extendedGuitarHtml = renderToStaticMarkup(
			<GuitarFretboard
				activeQuality="major"
				chordNotes={["E", "G♯", "B"]}
				chordKind="major"
				voicings={voicings}
				selectedVoicing={voicings[0] ?? null}
				activeSongMidi={[83]}
				activeSongStops={[{ stringIndex: 5, fret: 19 }]}
				scalePitchClasses={[4, 6, 8, 9, 11, 1, 3]}
				scaleNoteNames={eMajor.scaleNotes}
				preferFlats={false}
				onSelectVoicing={noop}
				onStrumVoicing={noop}
				onPlayFretNote={noop}
			/>,
		);
		expect(extendedGuitarHtml).toContain(">19<");
		expect(extendedGuitarHtml).toContain("is-song-hit");
	});
});
