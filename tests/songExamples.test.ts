import { describe, expect, test } from "bun:test";
import {
	SONG_EXAMPLES,
	flattenSongPlaybackSteps,
	getSongsForInstrument,
} from "../src/react-app/theory/songExamples";

describe("songExamples", () => {
	test("maps curated songs exclusively to each instrument tab", () => {
		const pianoSongs = getSongsForInstrument("piano");
		const guitarSongs = getSongsForInstrument("guitar");
		const celloSongs = getSongsForInstrument("cello");

		expect(pianoSongs.map((s) => s.id)).toEqual(["sound-of-music-doremi"]);
		expect(guitarSongs.map((s) => s.id)).toEqual(["amazing-grace-guitar"]);
		expect(celloSongs.map((s) => s.id)).toEqual(["bach-cello-suite-1"]);

		// Bach Cello Suite #1 must only be exposed for Cello View
		expect(pianoSongs.some((s) => s.id === "bach-cello-suite-1")).toBe(false);
		expect(guitarSongs.some((s) => s.id === "bach-cello-suite-1")).toBe(false);
	});

	test("all song progressions flatten with valid timestamps and playable MIDI notes", () => {
		for (const song of SONG_EXAMPLES) {
			expect(song.steps.length).toBeGreaterThanOrEqual(4);
			expect(song.keySlot).toBeGreaterThanOrEqual(0);
			expect(song.keySlot).toBeLessThanOrEqual(11);

			const { events, totalDurationMs } = flattenSongPlaybackSteps(song);
			expect(events.length).toBeGreaterThan(0);
			expect(totalDurationMs).toBeGreaterThan(0);

			let prevAtMs = -1;
			for (const ev of events) {
				expect(ev.atMs).toBeGreaterThan(prevAtMs);
				prevAtMs = ev.atMs;
				expect(ev.durationSec).toBeGreaterThan(0);
				expect(ev.midi.length).toBeGreaterThanOrEqual(1);
				for (const m of ev.midi) {
					expect(m).toBeGreaterThanOrEqual(36);
					expect(m).toBeLessThanOrEqual(84);
				}
			}
		}
	});

	test("Bach Cello Suite No. 1 begins with exact G2-D3-B3-A3 bariolage pattern", () => {
		const bach = getSongsForInstrument("cello")[0];
		expect(bach.keyLabel).toBe("G Major");
		const bar1Midi = bach.steps[0].events.slice(0, 8).flatMap((e) => e.midi);
		expect(bar1Midi).toEqual([43, 50, 59, 57, 59, 50, 59, 50]);
		expect(bach.steps.slice(0, 4).map((s) => s.chordSymbol)).toEqual([
			"G",
			"C/G",
			"D7/G",
			"G",
		]);
	});

	test("Bach Cello Suite No. 1 contains the full 42-bar Prelude with valid cello stops and final G chord", () => {
		const bach = getSongsForInstrument("cello")[0];
		expect(bach.steps).toHaveLength(42);
		expect(bach.steps[0].barLabel).toBe("Bar 1");
		expect(bach.steps[41].barLabel).toBe("Bar 42");
		expect(bach.steps[41].chordSymbol).toBe("G");

		const flat = flattenSongPlaybackSteps(bach);
		expect(flat.events.length).toBeGreaterThan(600);
		expect(flat.totalDurationMs).toBeGreaterThan(95000);
		for (const ev of flat.events) {
			expect(ev.celloStops).toBeDefined();
			expect(ev.celloStops?.length).toBeGreaterThan(0);
			for (const stop of ev.celloStops ?? []) {
				expect(stop.stringIndex).toBeGreaterThanOrEqual(0);
				expect(stop.stringIndex).toBeLessThanOrEqual(3);
				expect(stop.semitone).toBeGreaterThanOrEqual(0);
				expect(stop.semitone).toBeLessThanOrEqual(14);
				expect(stop.finger).toBeGreaterThanOrEqual(0);
				expect(stop.finger).toBeLessThanOrEqual(4);
			}
		}
	});
});
