import { describe, expect, test } from "bun:test";
import { getSongsForInstrument } from "../src/react-app/theory/songExamples";

const MAX_GUITAR_FRET = 15;

describe("cannonballRag", () => {
	test("provides Merle Travis Cannonball Rag (75 bars) as the second guitar piece", () => {
		const guitarSongs = getSongsForInstrument("guitar");
		expect(guitarSongs.map((song) => song.id)).toEqual([
			"amazing-grace-guitar",
			"cannonball-rag-guitar",
		]);

		const cannonball = guitarSongs[1];
		expect(cannonball.keySlot).toBe(1);
		expect(cannonball.keyMode).toBe("major");
		expect(cannonball.keyLabel).toBe("G Major");
		expect(cannonball.timeSignature).toBe("4/4");
		expect(cannonball.bpm).toBe(188);
		expect(cannonball.steps.length).toBe(75);

		// Bar 1 walking pickup: G3 (D:5) - F#3 (D:4) - G3 (D:5 slide)
		expect(cannonball.steps[0].events.map((event) => event.midi[0])).toEqual([
			55, 54, 55,
		]);
		expect(cannonball.steps[0].events[2].guitarStops?.[0]).toEqual({
			stringIndex: 2,
			fret: 5,
			technique: "slide",
		});

		// Bar 75 iconic 12th-fret natural harmonics finale
		const lastEvent = cannonball.steps[74].events[0];
		expect(lastEvent.midi).toEqual([67, 71, 76]);
		expect(lastEvent.guitarStops).toEqual([
			{ stringIndex: 3, fret: 12, technique: "harmonic" },
			{ stringIndex: 4, fret: 12, technique: "harmonic" },
			{ stringIndex: 5, fret: 12, technique: "harmonic" },
		]);

		for (const step of cannonball.steps) {
			const barMs = step.events.reduce(
				(sum, event) => sum + event.stepDurationMs,
				0,
			);
			expect(barMs).toBe(1280);
			for (const event of step.events) {
				expect(event.guitarStops?.length).toBeGreaterThan(0);
				for (const stop of event.guitarStops ?? []) {
					expect(stop.stringIndex).toBeGreaterThanOrEqual(0);
					expect(stop.stringIndex).toBeLessThanOrEqual(5);
					expect(stop.fret).toBeGreaterThanOrEqual(0);
					expect(stop.fret).toBeLessThanOrEqual(MAX_GUITAR_FRET);
				}
			}
		}

		const sections = cannonball.studyGuide.sections;
		expect(sections.length).toBe(4);
		expect(sections[0].startStepIndex).toBe(0);
		expect(sections[sections.length - 1].endStepIndex).toBe(74);
		for (let i = 1; i < sections.length; i += 1) {
			expect(sections[i].startStepIndex).toBe(sections[i - 1].endStepIndex + 1);
		}
	});
});
