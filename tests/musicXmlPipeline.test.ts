import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	encodeWavPcm16,
	renderTimedSequenceOfflineSamples,
} from "../src/react-app/audio/synth";
import {
	type ScoreBarIR,
	compileMusicXml,
	compileScoreTrackToSongDocument,
	detectKeyFromEvents,
	formatSongDocumentModule,
	inferHarmonyForWindow,
	inspectMusicXml,
	isMxlBuffer,
	linearizeRepeatedBars,
	parseXml,
	readMusicXmlTextFromBytes,
	resolveExplicitChordSymbol,
	solveInstrumentStops,
} from "../src/react-app/musicxml";
import {
	formatSongRegistryText,
	parseSongRegistryText,
	syncSongRegistryText,
} from "../src/react-app/songs/songRegistry";
import {
	flattenSongPlaybackSteps,
	getSongBarStartTimes,
	hydrateSong,
} from "../src/react-app/songs/songRuntime";
import {
	CELLO_TUNING,
	MAX_SONG_BOWED_SEMITONE,
} from "../src/react-app/theory/celloFingerboard";
import { MAX_SONG_GUITAR_FRET } from "../src/react-app/theory/guitarFretboard";

async function deflateRaw(input: Uint8Array): Promise<Uint8Array> {
	const cs = new CompressionStream("deflate-raw");
	const writer = cs.writable.getWriter();
	const reader = cs.readable.getReader();
	const chunks: Uint8Array[] = [];
	await Promise.all([
		(async () => {
			await writer.write(input);
			await writer.close();
		})(),
		(async () => {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) chunks.push(value);
			}
		})(),
	]);
	const total = chunks.reduce((s, c) => s + c.byteLength, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.byteLength;
	}
	return out;
}

async function buildTestMxlArchive(
	entries: Array<{ name: string; content: string; compress?: boolean }>,
): Promise<Uint8Array> {
	const encoder = new TextEncoder();
	const localChunks: Uint8Array[] = [];
	const centralChunks: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBytes = encoder.encode(entry.name);
		const rawBytes = encoder.encode(entry.content);
		const method = entry.compress ? 8 : 0;
		const payload = entry.compress ? await deflateRaw(rawBytes) : rawBytes;

		const localHeader = new Uint8Array(30 + nameBytes.length);
		const lv = new DataView(localHeader.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true);
		lv.setUint16(8, method, true);
		lv.setUint32(18, payload.length, true);
		lv.setUint32(22, rawBytes.length, true);
		lv.setUint16(26, nameBytes.length, true);
		localHeader.set(nameBytes, 30);

		const centralHeader = new Uint8Array(46 + nameBytes.length);
		const cv = new DataView(centralHeader.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(10, method, true);
		cv.setUint32(20, payload.length, true);
		cv.setUint32(24, rawBytes.length, true);
		cv.setUint16(28, nameBytes.length, true);
		cv.setUint32(42, offset, true);
		centralHeader.set(nameBytes, 46);

		localChunks.push(localHeader, payload);
		centralChunks.push(centralHeader);
		offset += localHeader.length + payload.length;
	}

	const cdSize = centralChunks.reduce((s, c) => s + c.length, 0);
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, cdSize, true);
	ev.setUint32(16, offset, true);

	const all = [...localChunks, ...centralChunks, eocd];
	const total = all.reduce((s, c) => s + c.length, 0);
	const archive = new Uint8Array(total);
	let pos = 0;
	for (const c of all) {
		archive.set(c, pos);
		pos += c.length;
	}
	return archive;
}

describe("MusicXML parser, .mxl unpacker, compiler, and registry", () => {
	test("parseXml handles DOCTYPE internal subsets, comments, CDATA, and XML entities", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd" [
  <!ENTITY copy "&#xA9;">
]>
<!-- sample comment -->
<score-partwise version="3.1" __proto__="polluted">
  <work><work-title><![CDATA[Prelude & Fugue]]> &#x266F;1 &#x110000;&#0;</work-title></work>
</score-partwise>`;

		const root = parseXml(xml);
		expect(root.tag).toBe("score-partwise");
		expect(Object.getPrototypeOf(root.attrs)).toBeNull();
		expect(root.attrs.version).toBe("3.1");
		const title = root.children[0]?.children[0]?.text.trim();
		expect(title).toBe("Prelude & Fugue ♯1 &#x110000;&#0;");
	});

	test("readMusicXmlTextFromBytes extracts compressed .mxl via META-INF/container.xml", async () => {
		const innerScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Compressed MXL Piece</work-title></work>
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

		const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="score/main.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>
  </rootfiles>
</container>`;

		const mxlBytes = await buildTestMxlArchive([
			{
				name: "META-INF/container.xml",
				content: containerXml,
				compress: false,
			},
			{ name: "score/main.musicxml", content: innerScore, compress: true },
		]);

		expect(isMxlBuffer(mxlBytes)).toBe(true);
		const extracted = await readMusicXmlTextFromBytes(mxlBytes);
		expect(extracted).toContain("Compressed MXL Piece");

		const { songDoc } = await compileMusicXml(mxlBytes);
		expect(songDoc.title).toBe("Compressed MXL Piece");
		expect(songDoc.instruments).toEqual(["violin"]);
		expect(songDoc.bars[0].notes[0][2]).toBe(69);

		const traversalMxl = await buildTestMxlArchive([
			{
				name: "META-INF/container.xml",
				content: `<container><rootfiles><rootfile full-path="../secret.xml"/></rootfiles></container>`,
			},
			{ name: "../secret.xml", content: innerScore },
		]);
		await expect(readMusicXmlTextFromBytes(traversalMxl)).rejects.toThrow();
	});

	test("linearizeRepeatedBars and hydrateSong unroll repeats and tempo shifts cleanly", () => {
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

		const doc = compileScoreTrackToSongDocument({
			id: "tempo-shift",
			title: "Tempo Shift",
			composerOrSource: "Test",
			instrument: "cello",
			ticksPerQuarter: 480,
			tempoEvents: [
				{ atTick: 0, bpm: 120 },
				{ atTick: 1920, bpm: 60 },
			],
			bars: [
				{
					barNumber: 1,
					durationTicks: 1920,
					notes: [
						{ midi: 48, offsetTicks: 0, durationTicks: 480, velocity: 0.8 },
					],
				},
				{
					barNumber: 2,
					durationTicks: 1920,
					notes: [
						{ midi: 50, offsetTicks: 0, durationTicks: 480, velocity: 0.8 },
					],
				},
			],
		});
		const hydrated = hydrateSong(doc);
		expect(getSongBarStartTimes(hydrated)).toEqual([0, 2000]);
		expect(hydrated.steps[1].barDurationMs).toBe(4000);
	});

	test("Viterbi guitar and cello solvers respect Drop-D + capo and thumb position", () => {
		const guitarSolved = solveInstrumentStops(
			[
				{ notes: [{ midi: 69 }] },
				{ notes: [{ midi: 72 }] },
				{ notes: [{ midi: 71 }] },
				{ notes: [{ midi: 69 }] },
			],
			"guitar",
		);
		expect(guitarSolved).toHaveLength(4);
		for (const group of guitarSolved) {
			expect(group[0].fret).toBeGreaterThanOrEqual(0);
			expect(group[0].fret).toBeLessThanOrEqual(MAX_SONG_GUITAR_FRET);
		}
		const frets = guitarSolved.map((g) => g[0].fret);
		expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);

		const dropDCapo2 = solveInstrumentStops(
			[{ notes: [{ midi: 40 }, { midi: 59 }] }],
			"guitar",
			[38, 45, 50, 55, 59, 64],
			2,
		);
		expect(dropDCapo2[0][0]).toEqual({ stringIndex: 0, fret: 0 });

		const celloSolved = solveInstrumentStops(
			[
				{ notes: [{ midi: 43 }] },
				{ notes: [{ midi: 50 }] },
				{ notes: [{ midi: 59 }] },
				{ notes: [{ midi: 57 }] },
				{ notes: [{ midi: 74 }] },
				{ notes: [{ midi: 43 }, { midi: 59 }] },
			],
			"cello",
		);
		expect(celloSolved[0][0]).toEqual({ stringIndex: 1, fret: 0, finger: 0 });
		expect(celloSolved[1][0]).toEqual({ stringIndex: 2, fret: 0, finger: 0 });
		expect(celloSolved[3][0]).toEqual({ stringIndex: 3, fret: 0, finger: 0 });
		expect(celloSolved[4][0].stringIndex).toBe(3);
		expect(celloSolved[4][0].fret).toBe(74 - CELLO_TUNING[3].openMidi);
		expect(celloSolved[4][0].fret).toBeLessThanOrEqual(MAX_SONG_BOWED_SEMITONE);
		expect(celloSolved[5][0].stringIndex).not.toBe(
			celloSolved[5][1].stringIndex,
		);
	});

	test("harmonic analyzer detects keys, bar chords, and explicit slash symbols", () => {
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

		const slash = resolveExplicitChordSymbol("D7/F#", 1, "major");
		expect(slash?.chordSymbol).toBe("D7/F♯");
		expect(slash?.guitarKind).toBe("7");
	});

	test("compiles Drop-D guitar MusicXML with TAB stops, repeats, ties, harmonics, and renders PCM WAV", async () => {
		const guitarXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Drop D Study</work-title></work>
  <identification><creator type="composer">Test Suite</creator></identification>
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
    </measure>
    <measure number="2">
      <barline location="left"><ending number="1" type="start"/></barline>
      <note><pitch><step>A</step><octave>2</octave></pitch><duration>16</duration><type>whole</type><notations><technical><string>5</string><fret>0</fret></technical></notations></note>
      <barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>
    </measure>
    <measure number="3">
      <barline location="left"><ending number="2" type="start"/></barline>
      <note><pitch><step>D</step><octave>2</octave></pitch><duration>16</duration><type>whole</type><notations><technical><string>6</string><fret>0</fret></technical></notations></note>
      <barline location="right"><ending number="2" type="stop"/></barline>
    </measure>
  </part>
</score-partwise>`;

		const bytes = new TextEncoder().encode(guitarXml);
		const inspected = await inspectMusicXml(bytes);
		expect(inspected.parts).toHaveLength(1);
		expect(inspected.parts[0].isStringed).toBe(true);
		expect(inspected.parts[0].suggestedInstrument).toBe("guitar");

		const { trackIr, songDoc } = await compileMusicXml(bytes, {
			id: "drop-d-study",
		});
		expect(songDoc.version).toBe(2);
		expect(trackIr.tuningMidi).toEqual([38, 45, 50, 55, 59, 64]);
		expect(songDoc.tuning).toEqual([38, 45, 50, 55, 59, 64]);
		expect(songDoc.keyLabel).toBe("D Major");
		expect(songDoc.bars).toHaveLength(3);
		expect(songDoc.form).toEqual([0, 1, 0, 2]);
		expect(trackIr.bars[0].notes).toHaveLength(3);
		expect(trackIr.bars[0].notes[0].durationTicks).toBe(1920);
		expect(trackIr.bars[0].notes[1].technique).toBe("harmonic");

		const roundtripped = JSON.parse(JSON.stringify(songDoc));
		const song = hydrateSong(roundtripped);
		expect(song.steps).toHaveLength(4);
		const flat = flattenSongPlaybackSteps(song);
		const halfSpeedSong = hydrateSong(roundtripped, { speed: 0.5 });
		expect(halfSpeedSong.steps[0].barDurationMs).toBe(
			(song.steps[0].barDurationMs ?? 0) * 2,
		);
		const pcm = renderTimedSequenceOfflineSamples(flat.events, {
			preset: "guitar",
			sampleRate: 22050,
			totalDurationMs: flat.totalDurationMs,
		});
		const wav = encodeWavPcm16(pcm, 22050);
		expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
		expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
	});

	test("compiles non-TAB cello MusicXML with thumb position and explicit harmony slash chords", async () => {
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
      <harmony><root><root-step>D</root-step></root><kind>dominant</kind><bass><bass-step>F</bass-step><bass-alter>1</bass-alter></bass></harmony>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><notations><articulations><staccato/></articulations></notations></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

		const { trackIr, songDoc } = await compileMusicXml(
			new TextEncoder().encode(celloXml),
		);
		expect(trackIr.instrument).toBe("cello");
		expect(songDoc.keyLabel).toBe("G Major");
		const song = hydrateSong(songDoc);
		expect(song.steps[0].chordSymbol).toBe("D7/F♯");
		expect(song.steps[0].events).toHaveLength(3);
		const thumbStop = song.steps[0].events[2].celloStops?.[0];
		expect(thumbStop?.stringIndex).toBe(3);
		expect(thumbStop?.semitone).toBe(17);
		expect(song.steps[0].events[1].notes?.[0].technique).toBe("staccato");
	});

	test("compiles grand-staff Piano MusicXML with pedal sustain and hand tags, plus score-timewise & transposition", async () => {
		const pianoXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Grand Staff Prelude</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction><sound tempo="108"/></direction>
      <direction><direction-type><pedal type="start"/></direction-type><staff>2</staff></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>
      <forward><duration>8</duration></forward>
      <direction><direction-type><pedal type="stop"/></direction-type><staff>2</staff></direction>
    </measure>
  </part>
</score-partwise>`;

		const { trackIr, songDoc } = await compileMusicXml(
			new TextEncoder().encode(pianoXml),
		);
		expect(trackIr.instrument).toBe("piano");
		expect(songDoc.instruments).toEqual(["piano"]);
		// C3 quarter note (960 ticks) extended by sustain pedal to tick 12*240 = 2880 ticks
		expect(
			trackIr.bars[0].notes.find((n) => n.midi === 48)?.durationTicks,
		).toBe(2880);

		const song = hydrateSong(songDoc);
		expect(song.steps[0].events[0].midi).toEqual([48, 72, 76]);
		expect(song.steps[0].events[0].notes?.map((n) => n.hand)).toEqual([
			"lh",
			"rh",
			"rh",
		]);
		expect(song.steps[0].events[1].midi).toEqual([79]);

		const timewiseXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-timewise version="3.1">
  <work><work-title>Timewise Pickup</work-title></work>
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <measure number="0" implicit="yes">
    <part id="P1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <transpose><chromatic>-2</chromatic></transpose>
      </attributes>
      <direction><sound tempo="120"/></direction>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
    </part>
  </measure>
</score-timewise>`;

		const tw = await compileMusicXml(new TextEncoder().encode(timewiseXml));
		expect(tw.trackIr.instrument).toBe("violin");
		// B4 (71) transposed by -2 -> A4 (69); pickup bar duration = 1 quarter (960 ticks)
		expect(tw.songDoc.bars[0].barTicks).toBe(960);
		expect(tw.songDoc.bars[0].notes[0][2]).toBe(69);
	});

	test("compileScoreTrackToSongDocument deduplicates repeated bars into form sequence", () => {
		const doc = compileScoreTrackToSongDocument({
			id: "form-repeat-test",
			title: "Form Repeat Test",
			composerOrSource: "Test",
			instrument: "guitar",
			ticksPerQuarter: 480,
			tempoEvents: [{ atTick: 0, bpm: 120 }],
			bars: [
				{
					barNumber: 1,
					repeatStart: true,
					repeatEndCount: 2,
					notes: [
						{ midi: 43, offsetTicks: 0, durationTicks: 480, velocity: 0.8 },
						{ midi: 59, offsetTicks: 480, durationTicks: 480, velocity: 0.75 },
					],
				},
				{
					barNumber: 2,
					notes: [
						{ midi: 48, offsetTicks: 0, durationTicks: 960, velocity: 0.85 },
					],
				},
			],
		});
		expect(doc.bars).toHaveLength(2);
		expect(doc.form).toEqual([0, 0, 1]);
		const hydrated = hydrateSong(doc);
		expect(hydrated.steps).toHaveLength(3);
		expect(getSongBarStartTimes(hydrated)).toEqual([0, 2000, 4000]);
		expect(formatSongDocumentModule(doc, "FORM_REPEAT_SPEC")).toContain(
			"export const FORM_REPEAT_SPEC: SongDocument",
		);
	});

	test("songs/songs.txt parses cleanly and promotes [PENDING] songs to [INGESTED]", async () => {
		const registryPath = resolve(import.meta.dir, "../songs/songs.txt");
		const rawRegistry = await readFile(registryPath, "utf8");
		const parsed = parseSongRegistryText(rawRegistry);
		expect(parsed).toHaveLength(7);
		expect(parsed.every((e) => e.status === "PENDING")).toBe(true);
		expect(parsed.map((e) => e.id)).toContain("bach-cello-suite-1");

		const synced = syncSongRegistryText(rawRegistry, [
			{
				id: "bach-cello-suite-1",
				instrument: "cello",
				title: "Cello Suite No. 1 — Prelude (BWV 1007)",
				composerOrSource: "J.S. Bach",
				keyLabel: "G Major",
				timeSignature: "4/4",
				source: "cello/bach-cello-suite-1.musicxml",
			},
			{
				id: "custom-etude-piano",
				instrument: "piano",
				title: "Custom Etude",
				composerOrSource: "User",
				keyLabel: "C Major",
				timeSignature: "4/4",
				source: "piano/custom-etude.mxl",
			},
		]);

		const nextEntries = parseSongRegistryText(synced);
		expect(nextEntries).toHaveLength(8);
		const bachEntry = nextEntries.find((e) => e.id === "bach-cello-suite-1");
		expect(bachEntry?.status).toBe("INGESTED");
		expect(bachEntry?.source).toBe("cello/bach-cello-suite-1.musicxml");
		expect(nextEntries.filter((e) => e.status === "PENDING")).toHaveLength(6);
		expect(nextEntries.find((e) => e.id === "custom-etude-piano")?.status).toBe(
			"INGESTED",
		);

		const formattedAgain = formatSongRegistryText(nextEntries);
		expect(formattedAgain).toBe(synced);
	});
});
