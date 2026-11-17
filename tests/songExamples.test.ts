import { describe, expect, test } from "bun:test";
import {
	MAX_BOWED_SEMITONE,
	MAX_SONG_BOWED_SEMITONE,
} from "../src/react-app/theory/celloFingerboard";
import {
	GUITAR_HARMONIC_OFFSETS,
	GUITAR_TUNING_PRESETS,
	MAX_GUITAR_FRET,
	MAX_SONG_GUITAR_FRET,
	STANDARD_TUNING,
	parseGuitarStops,
} from "../src/react-app/theory/guitarFretboard";
import {
	SONG_EXAMPLES,
	describeRomanFunction,
	findSongSectionForBar,
	flattenSongPlaybackSteps,
	getSongBarStartTimes,
	getSongsForInstrument,
	hydrateSong,
} from "../src/react-app/theory/songExamples";

describe("songExamples", () => {
	test("maps curated songs exclusively to each instrument tab", () => {
		const pianoSongs = getSongsForInstrument("piano");
		const guitarSongs = getSongsForInstrument("guitar");
		const violinSongs = getSongsForInstrument("violin");
		const celloSongs = getSongsForInstrument("cello");

		expect(pianoSongs.map((s) => s.id)).toEqual([
			"schubert-moment-musicaux-3",
			"debussy-clair-de-lune",
		]);
		expect(guitarSongs.map((s) => s.id)).toEqual([
			"cannonball-rag-guitar",
			"amazing-grace-guitar",
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
				for (const stop of ev.guitarStops ?? []) {
					expect(stop.stringIndex).toBeGreaterThanOrEqual(0);
					expect(stop.stringIndex).toBeLessThan(STANDARD_TUNING.length);
					expect(stop.fret).toBeGreaterThanOrEqual(0);
					expect(stop.fret).toBeLessThanOrEqual(MAX_SONG_GUITAR_FRET);
				}
				for (const stop of [
					...(ev.celloStops ?? []),
					...(ev.violinStops ?? []),
				]) {
					expect(stop.stringIndex).toBeGreaterThanOrEqual(0);
					expect(stop.stringIndex).toBeLessThanOrEqual(3);
					expect(stop.semitone).toBeGreaterThanOrEqual(0);
					expect(stop.semitone).toBeLessThanOrEqual(MAX_SONG_BOWED_SEMITONE);
					expect(stop.finger).toBeGreaterThanOrEqual(0);
					expect(stop.finger).toBeLessThanOrEqual(4);
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
			expect(ev.celloStops?.length).toBeGreaterThan(0);
		}
	});
});

describe("Curated piano, guitar, violin, and cello arrangements", () => {
	test("Clair de lune includes all 72 bars in D♭ Major (9/8) with modulated C♯m7 section", () => {
		const [, clair] = getSongsForInstrument("piano");
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

	test("Tommy Emmanuel Amazing Grace spans Verse 1, Verse 2, and Bell Harmonics Finale in E Major (9/8)", () => {
		const [, grace] = getSongsForInstrument("guitar");
		expect(grace).toBeDefined();
		expect(grace.id).toBe("amazing-grace-guitar");
		expect(grace.composerOrSource).toContain("Tommy Emmanuel");
		expect(grace.keyLabel).toBe("E Major");
		expect(grace.keySlot).toBe(4);
		expect(grace.timeSignature).toBe("9/8");
		expect(grace.steps).toHaveLength(36);

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
					const openMidi = STANDARD_TUNING[stop.stringIndex].openMidi;
					const harmonicOffset =
						stop.technique === "harmonic"
							? (GUITAR_HARMONIC_OFFSETS[stop.fret] ?? stop.fret)
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
		const [schubert] = getSongsForInstrument("piano");
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
			expect(ev.violinStops?.length).toBeGreaterThan(0);
		}

		const lastEvent = flat.events[flat.events.length - 1];
		expect(lastEvent?.midi).toEqual([86]);
		expect(lastEvent?.violinStops?.[0]?.technique).toBe("harmonic");
	});

	test("Cannonball Rag (58 bars, 2/2, G Major) and Haydn Cello Concerto No. 2 Mvt. I (28 bars, 4/4, D Major) preserve exact bars & stops", () => {
		const [cannonball] = getSongsForInstrument("guitar");
		expect(cannonball.keySlot).toBe(1);
		expect(cannonball.keyMode).toBe("major");
		expect(cannonball.timeSignature).toBe("2/2");
		expect(cannonball.bpm).toBe(120);
		expect(cannonball.steps).toHaveLength(58);
		expect(cannonball.steps[0].events.map((e) => e.midi[0])).toEqual([
			50, 49, 50,
		]);
		expect(cannonball.steps[0].events[2].guitarStops?.[0]).toEqual({
			stringIndex: 1,
			fret: 5,
			technique: "slide",
		});
		const cbLast = cannonball.steps[57].events[0];
		expect(cbLast.midi).toEqual([43, 50, 55, 62, 67]);
		expect(cbLast.guitarStops).toEqual([
			{ stringIndex: 0, fret: 3 },
			{ stringIndex: 2, fret: 0 },
			{ stringIndex: 3, fret: 0 },
			{ stringIndex: 4, fret: 3 },
			{ stringIndex: 5, fret: 3 },
		]);
		for (const step of cannonball.steps) {
			expect(step.events.reduce((sum, ev) => sum + ev.stepDurationMs, 0)).toBe(
				1000,
			);
			for (const ev of step.events) {
				expect(ev.guitarStops?.length).toBeGreaterThan(0);
			}
		}

		const [, haydn] = getSongsForInstrument("cello");
		expect(haydn.title).toContain("Allegro moderato");
		expect(haydn.keySlot).toBe(2);
		expect(haydn.keyMode).toBe("major");
		expect(haydn.timeSignature).toBe("4/4");
		expect(haydn.bpm).toBe(91);
		expect(haydn.steps).toHaveLength(28);
		expect(haydn.steps[0].events.map((e) => e.midi[0])).toEqual([
			66, 66, 67, 68, 69, 69, 66, 62, 69,
		]);
		expect(haydn.steps[6].events.map((e) => e.midi[0])).toEqual([
			66, 66, 67, 67, 69, 69, 66, 69,
		]);
		expect(haydn.steps[6].events[0].celloStops?.[0]).toEqual({
			stringIndex: 3,
			semitone: 9,
			finger: 2,
		});
		for (const step of haydn.steps) {
			expect(step.events.reduce((sum, ev) => sum + ev.stepDurationMs, 0)).toBe(
				2640,
			);
		}
		expect(MAX_GUITAR_FRET).toBe(15);
		expect(MAX_BOWED_SEMITONE).toBe(14);
	});

	test("polyphonic timestamp flattening supports independent voice durations, rests, custom tunings, and sub-bar chords", () => {
		const dropD = parseGuitarStops("0:0m+4:3r", GUITAR_TUNING_PRESETS.dropD, 2);
		expect(dropD.midi).toEqual([40, 64]);
		expect(dropD.guitarStops).toEqual([
			{ stringIndex: 0, fret: 0, technique: "palmMute" },
			{ stringIndex: 4, fret: 3, technique: "letRing" },
		]);

		const polySong = hydrateSong({
			id: "poly-test",
			idPrefix: "pt",
			title: "Poly Test",
			composerOrSource: "Test",
			subtitle: "Polyphonic voices",
			instruments: ["guitar"],
			keySlot: 1,
			keyMode: "major",
			keyLabel: "G Major",
			timeSignature: "4/4",
			bpm: 120,
			tuning: [...GUITAR_TUNING_PRESETS.dropD],
			capo: 2,
			theorySummary: "Test polyphonic spec",
			bars: [
				[
					1,
					"G",
					"I",
					"major",
					"major",
					["G", "B", "D"],
					[43, 55, 59],
					1,
					"Bar 1 polyphonic bass + melody",
					[
						{
							midi: [43],
							offsetMs: 0,
							durationSec: 0.25,
							stepDurationMs: 500,
							velocity: 0.55,
							noteLabel: "G2 bass",
							notes: [
								{
									midi: 43,
									durationSec: 0.25,
									velocity: 0.55,
									technique: "palmMute",
								},
							],
							guitarStops: [{ stringIndex: 0, fret: 5, technique: "palmMute" }],
						},
						{
							midi: [67],
							offsetMs: 0,
							durationSec: 0.9,
							stepDurationMs: 500,
							velocity: 0.92,
							noteLabel: "G4 melody",
							notes: [
								{
									midi: 67,
									durationSec: 0.9,
									velocity: 0.92,
									technique: "letRing",
								},
							],
							guitarStops: [{ stringIndex: 5, fret: 3, technique: "letRing" }],
						},
						{
							midi: [62],
							offsetMs: 750,
							durationSec: 0.4,
							stepDurationMs: 250,
							velocity: 0.85,
							noteLabel: "D4 syncopation",
						},
					],
					1,
					{
						barDurationMs: 1500,
						subBarChords: [
							{
								offsetMs: 0,
								chordSymbol: "G",
								roman: "I",
								quality: "major",
								circleDegree: 1,
								circleSlotIndex: 1,
							},
							{
								offsetMs: 750,
								chordSymbol: "D7",
								roman: "V7",
								quality: "major",
								circleDegree: 5,
								circleSlotIndex: 2,
							},
						],
					},
				],
				[
					2,
					"G",
					"I",
					"major",
					"major",
					["G", "B", "D"],
					[43, 55, 59],
					1,
					"Bar 2 after quarter rest",
					[
						{
							midi: [55],
							offsetMs: 250,
							durationSec: 0.5,
							stepDurationMs: 250,
							noteLabel: "G3",
						},
					],
					1,
					{ barDurationMs: 1000 },
				],
			],
		});

		const barStarts = getSongBarStartTimes(polySong);
		expect(barStarts).toEqual([0, 1500]);

		const flat = flattenSongPlaybackSteps(polySong);
		expect(flat.totalDurationMs).toBe(2500);
		expect(flat.events).toHaveLength(3);
		expect(flat.events[0].atMs).toBe(0);
		expect(flat.events[0].midi).toEqual([43, 67]);
		expect(flat.events[0].notes?.map((n) => n.technique)).toEqual([
			"palmMute",
			"letRing",
		]);
		expect(flat.events[0].subBarChord?.chordSymbol).toBe("G");
		expect(flat.events[1].atMs).toBe(750);
		expect(flat.events[1].subBarChord?.chordSymbol).toBe("D7");
		expect(flat.events[2].atMs).toBe(1750);
	});
});
