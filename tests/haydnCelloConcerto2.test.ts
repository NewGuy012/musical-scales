import { describe, expect, test } from "bun:test";
import { MAX_CELLO_SEMITONE } from "../src/react-app/theory/celloFingerboard";
import { getSongsForInstrument } from "../src/react-app/theory/songExamples";

describe("haydnCelloConcerto2", () => {
	test("provides Haydn Cello Concerto No. 2 Rondo (50 bars) as the second cello piece", () => {
		const celloSongs = getSongsForInstrument("cello");
		expect(celloSongs.map((song) => song.id)).toEqual([
			"bach-cello-suite-1",
			"haydn-cello-concerto-2",
		]);

		const haydn = celloSongs[1];
		expect(haydn.keySlot).toBe(2);
		expect(haydn.keyMode).toBe("major");
		expect(haydn.keyLabel).toBe("D Major");
		expect(haydn.timeSignature).toBe("6/8");
		expect(haydn.bpm).toBe(80);
		expect(haydn.steps.length).toBe(50);

		// Opening solo refrain Bar 1: F#4 E4 F#4 G4 F#4 G4
		expect(haydn.steps[0].events.map((event) => event.midi[0])).toEqual([
			66, 64, 66, 67, 66, 67,
		]);
		// Bar 2 octave harmonics: A4 (touch 12 on A), F#4, D4 (touch 12 on D)
		expect(haydn.steps[1].events.map((event) => event.midi[0])).toEqual([
			69, 66, 62,
		]);
		expect(haydn.steps[1].events[0].celloStops?.[0]).toEqual({
			stringIndex: 3,
			semitone: 12,
			finger: 3,
		});
		expect(haydn.steps[1].events[2].celloStops?.[0]).toEqual({
			stringIndex: 2,
			semitone: 12,
			finger: 3,
		});

		for (const step of haydn.steps) {
			const barMs = step.events.reduce(
				(sum, event) => sum + event.stepDurationMs,
				0,
			);
			expect(barMs).toBe(1500);
			for (const event of step.events) {
				for (const stop of event.celloStops ?? []) {
					expect(stop.stringIndex).toBeGreaterThanOrEqual(0);
					expect(stop.stringIndex).toBeLessThanOrEqual(3);
					expect(stop.semitone).toBeGreaterThanOrEqual(0);
					expect(stop.semitone).toBeLessThanOrEqual(MAX_CELLO_SEMITONE);
					expect(stop.finger).toBeGreaterThanOrEqual(0);
					expect(stop.finger).toBeLessThanOrEqual(4);
				}
			}
		}

		const sections = haydn.studyGuide.sections;
		expect(sections.length).toBe(4);
		expect(sections[0].startStepIndex).toBe(0);
		expect(sections[sections.length - 1].endStepIndex).toBe(49);
		for (let i = 1; i < sections.length; i += 1) {
			expect(sections[i].startStepIndex).toBe(sections[i - 1].endStepIndex + 1);
		}
	});
});
