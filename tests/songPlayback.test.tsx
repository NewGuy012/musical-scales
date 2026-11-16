import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { playTimedSequence } from "../src/react-app/audio/synth";
import { BowedFingerboard } from "../src/react-app/components/BowedFingerboard";
import { GuitarFretboard } from "../src/react-app/components/GuitarFretboard";
import { PianoKeyboard } from "../src/react-app/components/PianoKeyboard";
import { SongExamplesPanel } from "../src/react-app/components/SongExamplesPanel";
import { getBowedVoicings } from "../src/react-app/theory/celloFingerboard";
import { analyzeKey } from "../src/react-app/theory/circleOfFifths";
import { getGuitarVoicings } from "../src/react-app/theory/guitarFretboard";
import {
	findPlaybackEventAtTime,
	flattenSongPlaybackSteps,
	formatSongTime,
	getSongBarStartTimes,
	getSongsForInstrument,
} from "../src/react-app/theory/songExamples";

const noop = () => {};

describe("songPlayback helpers and synchronized UI", () => {
	test("bar start times, binary search lookup, and time formatting stay aligned", () => {
		const bach = getSongsForInstrument("cello")[0];
		const flat = flattenSongPlaybackSteps(bach);
		const barStarts = getSongBarStartTimes(bach);

		expect(barStarts).toHaveLength(42);
		expect(barStarts[0]).toBe(0);
		for (let i = 1; i < barStarts.length; i++) {
			expect(barStarts[i]).toBeGreaterThan(barStarts[i - 1]);
		}

		expect(findPlaybackEventAtTime([], 500)).toEqual({
			eventIndex: -1,
			event: null,
		});
		expect(findPlaybackEventAtTime(flat.events, -20).eventIndex).toBe(0);

		const midBar1 = findPlaybackEventAtTime(flat.events, 160);
		expect(midBar1.eventIndex).toBe(1);
		expect(midBar1.event?.chordStepIndex).toBe(0);

		const bar22 = findPlaybackEventAtTime(flat.events, barStarts[21]);
		expect(bar22.event?.chordStepIndex).toBe(21);

		const pastEnd = findPlaybackEventAtTime(
			flat.events,
			flat.totalDurationMs + 5000,
		);
		expect(pastEnd.eventIndex).toBe(flat.events.length - 1);
		expect(pastEnd.event?.chordStepIndex).toBe(41);

		expect(formatSongTime(0)).toBe("0:00");
		expect(formatSongTime(-400)).toBe("0:00");
		expect(formatSongTime(65400)).toBe("1:05");
		expect(formatSongTime(flat.totalDurationMs)).toMatch(/^\d+:\d{2}$/);
	});

	test("SongExamplesPanel renders transport bar, slider scrubber, paused state, and preview jump button", () => {
		const bach = getSongsForInstrument("cello")[0];
		const flat = flattenSongPlaybackSteps(bach);
		const barStarts = getSongBarStartTimes(bach);

		const idleHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={[bach]}
				playingSongId={null}
				cuedSongId={null}
				songPositionMs={0}
				activeChordStepIndex={null}
				activeNoteLabel={null}
				selectedPreviewStepId={null}
				onTogglePlaySong={noop}
				onStopSong={noop}
				onSeekSong={noop}
				onSkipSongBar={noop}
				onPlayFromSongBar={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(idleHtml).toContain("42 Bars");
		expect(idleHtml).toContain('type="range"');
		expect(idleHtml).toContain("song-scrubber");
		expect(idleHtml).toContain("Bar 1/42");
		expect(idleHtml).toContain(
			`0:00 / ${formatSongTime(flat.totalDurationMs)}`,
		);
		expect(idleHtml).toContain("song-timeline is-long");
		expect(idleHtml).toContain("Previous bar in");
		expect(idleHtml).toContain("Next bar in");

		const playingHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={[bach]}
				playingSongId={bach.id}
				cuedSongId={bach.id}
				songPositionMs={barStarts[12]}
				activeChordStepIndex={12}
				activeNoteLabel="D♯3 (II · F1)"
				selectedPreviewStepId={null}
				onTogglePlaySong={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(playingHtml).toContain("song-card is-playing");
		expect(playingHtml).toContain("❚❚ Pause");
		expect(playingHtml).toContain("Playing");
		expect(playingHtml).toContain("Bar 13");
		expect(playingHtml).toContain("B7/D♯");
		expect(playingHtml).toContain("Bar 13/42");
		expect(playingHtml).toContain("Note: D♯3 (II · F1)");

		const pausedHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={[bach]}
				playingSongId={null}
				cuedSongId={bach.id}
				songPositionMs={barStarts[20]}
				activeChordStepIndex={20}
				activeNoteLabel="D3 (Open II)"
				selectedPreviewStepId={null}
				onTogglePlaySong={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(pausedHtml).toContain("song-card is-paused");
		expect(pausedHtml).toContain("▶ Resume");
		expect(pausedHtml).toContain("Paused");
		expect(pausedHtml).toContain("Bar 21/42");

		const previewHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={[bach]}
				playingSongId={null}
				cuedSongId={null}
				songPositionMs={0}
				activeChordStepIndex={null}
				activeNoteLabel={null}
				selectedPreviewStepId={bach.steps[4].id}
				onTogglePlaySong={noop}
				onPlayFromSongBar={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(previewHtml).toContain("Previewing");
		expect(previewHtml).toContain("Play from Bar 5");
		expect(previewHtml).toContain("Bar 5/42");
		expect(previewHtml).toContain("Sound &amp; Feel");
		expect(previewHtml).toContain("Harmony Hook");
		expect(previewHtml).toContain("Practice Tips");
		expect(previewHtml).toContain("2. Circle Climb to D &amp; Em");
		expect(previewHtml).toContain("Play Section");
		expect(previewHtml).toContain("song-live-fn");

		const guitarHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={getSongsForInstrument("guitar")}
				playingSongId={null}
				activeChordStepIndex={null}
				activeNoteLabel={null}
				selectedPreviewStepId={null}
				onTogglePlaySong={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(guitarHtml).toContain("Amazing Grace");
		expect(guitarHtml).toContain("Tommy Emmanuel");
		expect(guitarHtml).toContain("song-select");
		expect(guitarHtml).toContain("1 of 2 pieces");
		expect(guitarHtml).toContain("Cannonball Rag");

		const pianoSongs = getSongsForInstrument("piano");
		const pianoSelectHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={pianoSongs}
				selectedSongId="schubert-moment-musicaux-3"
				playingSongId={null}
				activeChordStepIndex={null}
				activeNoteLabel={null}
				selectedPreviewStepId={null}
				onTogglePlaySong={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(pianoSelectHtml).toContain("2 of 2 pieces");
		expect(pianoSelectHtml).toContain("Moment Musicaux No. 3");
		expect(pianoSelectHtml).toContain("Franz Schubert");
		expect(pianoSelectHtml).toContain("78 Bars");
		expect(pianoSelectHtml).toContain("Clair de lune");
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
				onSelectVoicing={() => {}}
				onRollVoicing={() => {}}
				onPlayNote={() => {}}
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
				onPlayNote={() => {}}
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
				onSelectVoicing={() => {}}
				onStrumVoicing={() => {}}
				onPlayFretNote={() => {}}
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
				onSelectVoicing={() => {}}
				onRollVoicing={() => {}}
				onPlayNote={() => {}}
			/>,
		);
		expect(violinHtml).toContain("is-song-hit");
		expect(violinHtml).toContain("is-harmonic");
		expect(violinHtml).toContain("song-hit-harmonic");

		const violinSongs = getSongsForInstrument("violin");
		const thaisHtml = renderToStaticMarkup(
			<SongExamplesPanel
				songs={violinSongs}
				playingSongId={null}
				activeChordStepIndex={null}
				activeNoteLabel={null}
				selectedPreviewStepId={null}
				onTogglePlaySong={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(thaisHtml).toContain("Méditation (from Thaïs)");
		expect(thaisHtml).toContain("Jules Massenet");
	});

	test("playTimedSequence supports startOffsetMs, onProgress updates, and cancellation", async () => {
		const prevWindow = (globalThis as { window?: unknown }).window;
		(globalThis as { window: unknown }).window = {
			setTimeout: globalThis.setTimeout.bind(globalThis),
			clearTimeout: globalThis.clearTimeout.bind(globalThis),
			setInterval: globalThis.setInterval.bind(globalThis),
			clearInterval: globalThis.clearInterval.bind(globalThis),
		};

		try {
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
		} finally {
			if (prevWindow === undefined) {
				delete (globalThis as { window?: unknown }).window;
			} else {
				(globalThis as { window: unknown }).window = prevWindow;
			}
		}
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
				onPlayNote={() => {}}
			/>,
		);
		expect(bassOnlyHtml).toContain("is-song-hit");
		expect(bassOnlyHtml).toContain(">D♭</text>");
		expect(bassOnlyHtml).toContain(">A♭</text>");

		// When an in-range RH note (68) is present alongside bass 49, do not fold 49 -> 61.
		const mixedHtml = renderToStaticMarkup(
			<PianoKeyboard
				activeMidiNotes={[]}
				activeSongMidi={[49, 68]}
				activeQuality="major"
				scalePitchClasses={[]}
				activeNoteNamesByMidi={{ 61: "D♭", 68: "A♭" }}
				onPlayNote={() => {}}
			/>,
		);
		expect(mixedHtml).toContain(">A♭</text>");
		expect(mixedHtml).not.toContain(">D♭</text>");
	});

	test("GuitarFretboard renders explicit activeSongStops including diamond harmonic markers", () => {
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
	});
});
