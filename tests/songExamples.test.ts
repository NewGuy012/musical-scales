import { describe, expect, test } from "bun:test";
import { compileMusicXml } from "../src/react-app/musicxml";
import {
	SONG_CATALOG,
	createCatalogStubSong,
	getCatalogEntriesForInstrument,
} from "../src/react-app/songs/songCatalog";
import {
	type SongDocument,
	describeRomanFunction,
	findSongSectionForBar,
	flattenSongPlaybackSteps,
	getSongBarStartTimes,
	hydrateSong,
	scaleSongExampleSpeed,
} from "../src/react-app/songs/songRuntime";
import {
	MAX_BOWED_SEMITONE,
	MAX_SONG_BOWED_SEMITONE,
} from "../src/react-app/theory/celloFingerboard";
import {
	MAX_GUITAR_FRET,
	MAX_SONG_GUITAR_FRET,
	STANDARD_TUNING,
} from "../src/react-app/theory/guitarFretboard";

const CELLO_STUDY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>G Major Bariolage Study</work-title></work>
  <identification><creator type="composer">MusicXML Fixture</creator></identification>
  <part-list><score-part id="P1"><part-name>Violoncello</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>1</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction><sound tempo="96"/></direction>
      <direction><direction-type><rehearsal>Theme A</rehearsal></direction-type></direction>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <harmony><root><root-step>C</root-step></root><kind>major</kind><bass><bass-step>G</bass-step></bass></harmony>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
    <measure number="3">
      <direction><direction-type><rehearsal>Dominant Lift</rehearsal></direction-type></direction>
      <harmony><root><root-step>D</root-step></root><kind>dominant</kind></harmony>
      <note><pitch><step>F</step><alter>1</alter><octave>3</octave></pitch><duration>8</duration><type>half</type></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><type>half</type></note>
    </measure>
    <measure number="4">
      <direction><direction-type><rehearsal>Resolution</rehearsal></direction-type></direction>
      <harmony><root><root-step>G</root-step></root><kind>major</kind></harmony>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>16</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

const GUITAR_HARMONIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>E Major Bell Harmonics</work-title></work>
  <part-list><score-part id="P1"><part-name>Acoustic Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>4</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>TAB</sign><line>5</line></clef>
        <staff-details>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
        </staff-details>
      </attributes>
      <direction><sound tempo="100"/></direction>
      <note><pitch><step>E</step><octave>2</octave></pitch><duration>4</duration><type>quarter</type><notations><technical><string>6</string><fret>0</fret></technical></notations></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type><notations><technical><harmonic><natural/></harmonic><string>1</string><fret>12</fret></technical></notations></note>
      <note><pitch><step>G</step><alter>1</alter><octave>4</octave></pitch><duration>8</duration><type>half</type><notations><technical><hammer-on type="stop"/><string>1</string><fret>4</fret></technical></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>2</octave></pitch><duration>16</duration><type>whole</type><notations><technical><string>6</string><fret>0</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

const PIANO_GRAND_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>D♭ Moonlight Sketch</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>-5</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction><sound tempo="60"/></direction>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/><pitch><step>A</step><alter>-1</alter><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><pitch><step>D</step><alter>-1</alter><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>D</step><alter>-1</alter><octave>3</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

const VIOLIN_LYRIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>D Major Lyric Phrase</work-title></work>
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>2</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction><sound tempo="72"/></direction>
      <note><pitch><step>F</step><alter>1</alter><octave>5</octave></pitch><duration>8</duration><type>half</type></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>6</octave></pitch><duration>4</duration><type>quarter</type><notations><technical><harmonic><natural/></harmonic></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

describe("Song runtime and MusicXML-derived SongDocument behavior", () => {
	test("hydrates MusicXML-compiled scores across piano, guitar, violin, and cello with valid stops and study guides", async () => {
		const fixtures = [
			CELLO_STUDY_XML,
			GUITAR_HARMONIC_XML,
			PIANO_GRAND_XML,
			VIOLIN_LYRIC_XML,
		];
		const enc = new TextEncoder();

		for (const xml of fixtures) {
			const { songDoc } = await compileMusicXml(enc.encode(xml));
			const song = hydrateSong(songDoc);
			expect(song.steps.length).toBeGreaterThanOrEqual(1);
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

			const guide = song.studyGuide!;
			expect(guide).toBeDefined();
			expect(guide.sections[0].startStepIndex).toBe(0);
			expect(guide.sections[guide.sections.length - 1].endStepIndex).toBe(
				song.steps.length - 1,
			);
			expect(findSongSectionForBar(guide, 0)?.id).toBe(guide.sections[0].id);
		}
	});

	test("preserves exact guitar harmonic stops and MIDI equivalence", async () => {
		const { songDoc } = await compileMusicXml(
			new TextEncoder().encode(GUITAR_HARMONIC_XML),
		);
		const song = hydrateSong(songDoc);
		const allStops = song.steps.flatMap((s) =>
			s.events.flatMap((e) => e.guitarStops ?? []),
		);
		expect(allStops.some((st) => st.technique === "harmonic")).toBe(true);
		expect(allStops.some((st) => st.technique === "hammer")).toBe(true);

		for (const step of song.steps) {
			for (const evt of step.events) {
				expect(evt.guitarStops?.length).toBe(evt.midi.length);
				evt.guitarStops?.forEach((stop, idx) => {
					const openMidi = STANDARD_TUNING[stop.stringIndex].openMidi;
					const offset =
						stop.technique === "harmonic" && stop.fret === 12 ? 12 : stop.fret;
					expect(evt.midi[idx]).toBe(openMidi + offset);
				});
			}
		}
	});

	test("describeRomanFunction covers harmonic roles cleanly", () => {
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

	test("polyphonic SongDocument hydration supports custom tunings, capo, sub-bar chords, and speed scaling", () => {
		const polyDoc: SongDocument = {
			version: 2,
			id: "poly-test",
			idPrefix: "pt",
			title: "Poly Test",
			composerOrSource: "Test",
			subtitle: "Polyphonic voices",
			instruments: ["guitar"],
			tpq: 480,
			keySlot: 1,
			keyMode: "major",
			keyLabel: "G Major",
			timeSignature: "4/4",
			tempoMap: [[0, 120]],
			tuning: [38, 45, 50, 55, 59, 64],
			capo: 2,
			theorySummary: "Test polyphonic SongDocument",
			chords: {
				G: {
					roman: "I",
					quality: "major",
					notes: ["G", "B", "D"],
					degree: 1,
					slot: 1,
				},
				D7: {
					roman: "V7",
					quality: "major",
					notes: ["D", "F♯", "A", "C"],
					degree: 5,
					slot: 2,
					guitarKind: "7",
				},
			},
			bars: [
				{
					barTicks: 1440,
					harmony: [
						[0, "G"],
						[720, "D7"],
					],
					cue: "Bar 1 polyphonic bass + melody",
					notes: [
						[0, 240, 43, 55, "palmMute", [0, 5]],
						[0, 864, 67, 92, "letRing", [5, 3]],
						[720, 480, 62, 85, null, [3, 2]],
					],
				},
				{
					barTicks: 960,
					harmony: [[0, "G"]],
					cue: "Bar 2 after quarter rest",
					notes: [[240, 480, 55, 80, null, [3, 0]]],
				},
			],
		};

		const song = hydrateSong(polyDoc);
		expect(getSongBarStartTimes(song)).toEqual([0, 1500]);

		const flat = flattenSongPlaybackSteps(song);
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

		const halfSpeed = scaleSongExampleSpeed(song, 0.5);
		expect(halfSpeed.bpm).toBe(60);
		expect(flattenSongPlaybackSteps(halfSpeed).totalDurationMs).toBe(5000);

		// Mixed stops on the same onset align each tuple stop with its matching note technique
		const mixedStopSong = hydrateSong({
			...polyDoc,
			id: "mixed-stop-alignment",
			bars: [
				{
					barTicks: 480,
					harmony: [[0, "G"]],
					cue: "Mixed stops",
					notes: [
						[0, 480, 40, 80, "normal"],
						[0, 480, 76, 80, "harmonic", [0, 12]],
					],
				},
			],
		});
		expect(mixedStopSong.steps[0].events[0].guitarStops).toEqual([
			{ stringIndex: 0, fret: 12, technique: "harmonic" },
		]);
	});

	test("catalog stub helper and instrument range constants remain consistent", () => {
		expect(Array.isArray(SONG_CATALOG)).toBe(true);
		expect(getCatalogEntriesForInstrument("piano")).toEqual(
			SONG_CATALOG.filter((e) => e.instruments.includes("piano")),
		);

		const stub = createCatalogStubSong({
			id: "sample-musicxml-stub",
			title: "Sample Stub",
			composerOrSource: "MusicXML",
			subtitle: "C Major (4/4)",
			instruments: ["piano"],
			keySlot: 0,
			keyMode: "major",
			keyLabel: "C Major",
			timeSignature: "4/4",
			bpm: 120,
			barCount: 16,
			theorySummary: "Stub summary",
		});
		expect(stub.barCount).toBe(16);
		expect(stub.steps).toEqual([]);
		expect(MAX_GUITAR_FRET).toBe(15);
		expect(MAX_BOWED_SEMITONE).toBe(14);
	});
});
