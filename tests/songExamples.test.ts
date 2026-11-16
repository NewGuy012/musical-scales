import { describe, expect, test } from "bun:test";
import {
	MAX_GUITAR_FRET,
	STANDARD_TUNING,
} from "../src/react-app/theory/guitarFretboard";
import {
	SONG_EXAMPLES,
	describeRomanFunction,
	findSongSectionForBar,
	flattenSongPlaybackSteps,
	getSongsForInstrument,
} from "../src/react-app/theory/songExamples";

describe("songExamples", () => {
	test("maps curated songs exclusively to each instrument tab", () => {
		const pianoSongs = getSongsForInstrument("piano");
		const guitarSongs = getSongsForInstrument("guitar");
		const violinSongs = getSongsForInstrument("violin");
		const celloSongs = getSongsForInstrument("cello");

		expect(pianoSongs.map((s) => s.id)).toEqual([
			"debussy-clair-de-lune",
			"schubert-moment-musicaux-3",
		]);
		expect(guitarSongs.map((s) => s.id)).toEqual([
			"amazing-grace-guitar",
			"cannonball-rag-guitar",
		]);
		expect(violinSongs.map((s) => s.id)).toEqual(["massenet-meditation-thais"]);
		expect(celloSongs.map((s) => s.id)).toEqual([
			"bach-cello-suite-1",
			"haydn-cello-concerto-2",
		]);

		// Bach Cello Suite #1 must only be exposed for Cello View
		expect(pianoSongs.some((s) => s.id === "bach-cello-suite-1")).toBe(false);
		expect(guitarSongs.some((s) => s.id === "bach-cello-suite-1")).toBe(false);
		expect(violinSongs.some((s) => s.id === "bach-cello-suite-1")).toBe(false);
		expect(celloSongs.some((s) => s.id === "massenet-meditation-thais")).toBe(
			false,
		);
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
					expect(m).toBeLessThanOrEqual(96);
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

describe("Clair de lune and Tommy Emmanuel Amazing Grace arrangements", () => {
	test("Clair de lune includes all 72 bars in D♭ Major (9/8) with modulated C♯m7 section", () => {
		const [clair] = getSongsForInstrument("piano");
		expect(clair).toBeDefined();
		expect(clair.id).toBe("debussy-clair-de-lune");
		expect(clair.title).toBe("Clair de lune");
		expect(clair.keyLabel).toBe("D♭ Major");
		expect(clair.keySlot).toBe(7);
		expect(clair.timeSignature).toBe("9/8");
		expect(clair.steps).toHaveLength(72);

		const flat = flattenSongPlaybackSteps(clair);
		expect(flat.events).toHaveLength(763);
		expect(flat.totalDurationMs).toBeGreaterThan(220000);
		expect(
			clair.steps.some(
				(s) => s.chordSymbol.includes("C♯m") && s.circleSlotIndex === 4,
			),
		).toBe(true);
	});

	test("Tommy Emmanuel Amazing Grace spans Intro, Verse 1 & 2, and Harp Harmonic Outro in E Major", () => {
		const [grace] = getSongsForInstrument("guitar");
		expect(grace).toBeDefined();
		expect(grace.id).toBe("amazing-grace-guitar");
		expect(grace.composerOrSource).toContain("Tommy Emmanuel");
		expect(grace.keyLabel).toBe("E Major");
		expect(grace.keySlot).toBe(4);
		expect(grace.timeSignature).toBe("3/4");
		expect(grace.steps).toHaveLength(34);

		const allStops = grace.steps.flatMap((s) =>
			s.events.flatMap((e) => e.guitarStops ?? []),
		);
		expect(allStops.length).toBeGreaterThan(200);
		expect(allStops.some((st) => st.technique === "harmonic")).toBe(true);
		expect(allStops.some((st) => st.technique === "hammer")).toBe(true);
		expect(allStops.some((st) => st.technique === "slide")).toBe(true);

		for (const step of grace.steps) {
			for (const evt of step.events) {
				expect(evt.guitarStops?.length).toBe(evt.midi.length);
				evt.guitarStops?.forEach((stop, idx) => {
					expect(stop.stringIndex).toBeGreaterThanOrEqual(0);
					expect(stop.stringIndex).toBeLessThan(STANDARD_TUNING.length);
					expect(stop.fret).toBeGreaterThanOrEqual(0);
					expect(stop.fret).toBeLessThanOrEqual(MAX_GUITAR_FRET);
					const openMidi = STANDARD_TUNING[stop.stringIndex].openMidi;
					const harmonicOffset =
						stop.technique === "harmonic"
							? ({ 12: 12, 7: 19, 5: 24 }[stop.fret] ?? stop.fret)
							: stop.fret;
					expect(evt.midi[idx]).toBe(openMidi + harmonicOffset);
				});
			}
		}
	});

	test("all curated songs expose a complete studyGuide covering every bar and beginner helper descriptions", () => {
		for (const song of SONG_EXAMPLES) {
			expect(song.studyGuide).toBeDefined();
			const guide = song.studyGuide!;
			expect(guide.vibeAndSound.length).toBeGreaterThan(20);
			expect(guide.harmonyHook.length).toBeGreaterThan(20);
			expect(guide.practiceTips.length).toBeGreaterThanOrEqual(3);
			expect(guide.sections.length).toBeGreaterThanOrEqual(3);

			// Sections must cover bars continuously from 0 to steps.length - 1
			expect(guide.sections[0].startStepIndex).toBe(0);
			expect(guide.sections[guide.sections.length - 1].endStepIndex).toBe(
				song.steps.length - 1,
			);
			for (let i = 0; i < guide.sections.length; i++) {
				const sec = guide.sections[i];
				expect(sec.startStepIndex).toBeLessThanOrEqual(sec.endStepIndex);
				if (i > 0) {
					expect(sec.startStepIndex).toBe(
						guide.sections[i - 1].endStepIndex + 1,
					);
				}
			}

			expect(findSongSectionForBar(guide, 0)?.id).toBe(guide.sections[0].id);
			expect(findSongSectionForBar(guide, song.steps.length - 1)?.id).toBe(
				guide.sections[guide.sections.length - 1].id,
			);
		}

		expect(describeRomanFunction("I6", "major")).toContain("Tonic");
		expect(describeRomanFunction("IVmaj7", "major")).toContain("Subdominant");
		expect(describeRomanFunction("V7/vi", "major")).toContain(
			"Secondary dominant",
		);
		expect(describeRomanFunction("V7/ii", "major")).toContain(
			"Secondary dominant",
		);
		expect(describeRomanFunction("i", "minor")).toContain("Minor tonic");
		expect(describeRomanFunction("III", "major")).toContain("Relative major");
		expect(describeRomanFunction("I (Picardy)", "major")).toContain("Picardy");
		expect(describeRomanFunction("i♭", "minor")).toContain("Borrowed");
	});

	test("Schubert Moment Musicaux No. 3 covers 78 bars in F Minor (2/4) with A♭ episode and Picardy F Major coda", () => {
		const [, schubert] = getSongsForInstrument("piano");
		expect(schubert).toBeDefined();
		expect(schubert.id).toBe("schubert-moment-musicaux-3");
		expect(schubert.title).toBe("Moment Musicaux No. 3");
		expect(schubert.composerOrSource).toContain("Franz Schubert");
		expect(schubert.keyLabel).toBe("F Minor");
		expect(schubert.keySlot).toBe(8);
		expect(schubert.keyMode).toBe("minor");
		expect(schubert.timeSignature).toBe("2/4");
		expect(schubert.steps).toHaveLength(78);

		// Bar 1 intro vamp and Bar 3 Air Russe entrance
		expect(schubert.steps[0].events[0].midi).toEqual([53]);
		expect(schubert.steps[2].events[0].midi).toEqual([53, 68]);
		expect(schubert.steps[18].chordSymbol).toBe("A♭");
		expect(schubert.steps[64].chordSymbol).toBe("F");
		expect(schubert.steps[64].roman).toContain("Picardy");

		for (let i = 0; i < 77; i++) {
			const barMs = schubert.steps[i].events.reduce(
				(sum, ev) => sum + ev.stepDurationMs,
				0,
			);
			expect(Math.abs(barMs - 1500)).toBeLessThanOrEqual(4);
		}
	});

	test("Massenet Méditation from Thaïs covers 71 bars in D Major with authentic melody, valid violin stops, and final harmonic", () => {
		const [thais] = getSongsForInstrument("violin");
		expect(thais).toBeDefined();
		expect(thais.id).toBe("massenet-meditation-thais");
		expect(thais.title).toContain("Méditation");
		expect(thais.composerOrSource).toContain("Jules Massenet");
		expect(thais.keyLabel).toBe("D Major");
		expect(thais.keySlot).toBe(2);
		expect(thais.timeSignature).toBe("4/4");
		expect(thais.steps).toHaveLength(71);
		expect(thais.steps[2].cue).toContain("F♯5");

		// Authentic Bar 3–4 opening solo violin melody: F♯5 -> D5 -> A4–D5–F♯5 -> B5–C♯6–D6
		expect(thais.steps[2].events.flatMap((e) => e.midi)).toEqual([
			78, 74, 69, 74, 78,
		]);
		expect(thais.steps[3].events.flatMap((e) => e.midi)).toEqual([83, 85, 86]);
		expect(thais.steps[58].chordSymbol).toBe("C♯7");
		expect(thais.steps[59].chordSymbol).toBe("D");
		expect(thais.steps[60].chordSymbol).toBe("E♭7");

		for (let i = 0; i < 70; i++) {
			const barMs = thais.steps[i].events.reduce(
				(sum, ev) => sum + ev.stepDurationMs,
				0,
			);
			expect(Math.abs(barMs - 3600)).toBeLessThanOrEqual(2);
		}

		const flat = flattenSongPlaybackSteps(thais);
		expect(flat.events.length).toBeGreaterThan(300);
		expect(flat.totalDurationMs).toBeGreaterThan(240000);
		for (const ev of flat.events) {
			expect(ev.violinStops).toBeDefined();
			expect(ev.violinStops?.length).toBeGreaterThan(0);
			for (const stop of ev.violinStops ?? []) {
				expect(stop.stringIndex).toBeGreaterThanOrEqual(0);
				expect(stop.stringIndex).toBeLessThanOrEqual(3);
				expect(stop.semitone).toBeGreaterThanOrEqual(0);
				expect(stop.semitone).toBeLessThanOrEqual(14);
				expect(stop.finger).toBeGreaterThanOrEqual(0);
				expect(stop.finger).toBeLessThanOrEqual(4);
			}
		}

		const lastEvent = flat.events[flat.events.length - 1];
		expect(lastEvent?.midi).toEqual([86]);
		expect(lastEvent?.violinStops?.[0]?.technique).toBe("harmonic");
	});
});
