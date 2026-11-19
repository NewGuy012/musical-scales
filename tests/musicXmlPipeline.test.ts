import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	loadCuratedOverrides,
	mirrorSourceMusicXml,
	resolveImportOptions,
	syncFromMusicXmlFolder,
} from "../scripts/ingest-songs";
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
	SONG_CATALOG,
	getCatalogEntriesForInstrument,
	loadSongById,
} from "../src/react-app/songs/songCatalog";
import {
	compareSongCatalogOrder,
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

describe("MusicXML parser, .mxl unpacker, and compiler", () => {
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

	test("XML parser and .mxl unpacker reject malformed roots, oversized trees, path escapes, and corrupt EOCD", async () => {
		expect(() => parseXml("<score-partwise/><extra/>")).toThrow(/extra root/i);
		expect(() => parseXml(`<r>${"<a/>".repeat(250_005)}</r>`)).toThrow(
			/element limit/i,
		);

		const driveZip = await buildTestMxlArchive([
			{ name: "C:\\score.musicxml", content: "<score-partwise/>" },
		]);
		await expect(readMusicXmlTextFromBytes(driveZip)).rejects.toThrow(
			/unsafe path/i,
		);

		const traversalZip = await buildTestMxlArchive([
			{ name: "sub/../../escape.musicxml", content: "<score-partwise/>" },
		]);
		await expect(readMusicXmlTextFromBytes(traversalZip)).rejects.toThrow(
			/unsafe path/i,
		);

		const validZip = await buildTestMxlArchive([
			{ name: "score.musicxml", content: "<score-partwise/>" },
		]);
		const trailingGarbage = new Uint8Array(validZip.length + 4);
		trailingGarbage.set(validZip, 0);
		await expect(readMusicXmlTextFromBytes(trailingGarbage)).rejects.toThrow(
			/End of Central Directory/i,
		);
	});

	test("linked notation+TAB emits Staff 2 only, inherits Staff 1 dynamics, preserves unison double-stops, and honors <degree> add9", async () => {
		const linkedTabXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Linked TAB Study</work-title></work>
  <part-list><score-part id="P1"><part-name>Acoustic Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
        <transpose number="1"><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>
        <staff-details number="2">
          <staff-lines>6</staff-lines>
          <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
        </staff-details>
      </attributes>
      <harmony><root><root-step>E</root-step></root><kind>major</kind><degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree></harmony>
      <forward><duration>8</duration></forward>
      <harmony><root><root-step>A</root-step></root><kind>minor</kind><degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree></harmony>
      <backup><duration>8</duration></backup>
      <direction><direction-type><dynamics><p/></dynamics></direction-type><staff>1</staff></direction>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff></note>
      <direction><direction-type><dynamics><f/></dynamics></direction-type><staff>1</staff></direction>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>16</duration><voice>2</voice><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><voice>5</voice><staff>2</staff>
        <notations><technical><string>2</string><fret>5</fret></technical></notations>
      </note>
      <note>
        <chord/><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><voice>5</voice><staff>2</staff>
        <notations><technical><string>1</string><fret>0</fret></technical></notations>
      </note>
      <note>
        <pitch><step>B</step><octave>3</octave></pitch><duration>8</duration><voice>5</voice><staff>2</staff>
        <notations><technical><string>2</string><fret>0</fret></technical></notations>
      </note>
      <backup><duration>16</duration></backup>
      <note>
        <pitch><step>A</step><octave>2</octave></pitch><duration>16</duration><voice>6</voice><staff>2</staff>
        <notations><technical><string>5</string><fret>0</fret></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;

		const bytes = new TextEncoder().encode(linkedTabXml);
		const inspected = await inspectMusicXml(bytes);
		expect(inspected.parts[0].noteCount).toBe(4);

		const { trackIr, songDoc } = await compileMusicXml(bytes);
		expect(trackIr.bars[0].notes).toHaveLength(4);
		expect(trackIr.bars[0].harmonies?.map((h) => h.chordSymbol)).toEqual([
			"Eadd9",
			"Am(add9)",
		]);
		// Inherited intra-bar dynamics from Staff 1: p (0.48) at beat 1, f (0.86) at beat 3
		const atBeat1 = trackIr.bars[0].notes.filter((n) => n.offsetTicks === 0);
		const atBeat3 = trackIr.bars[0].notes.filter((n) => n.offsetTicks === 1920);
		expect(atBeat1.every((n) => Math.abs(n.velocity - 0.48) < 0.01)).toBe(true);
		expect(atBeat3[0].velocity).toBeCloseTo(0.86, 2);

		const hydrated = hydrateSong(songDoc);
		expect(hydrated.steps[0].chordSymbol).toBe("Eadd9");
		expect(hydrated.steps[0].subBarChords?.[1].chordSymbol).toBe("Am(add9)");
		// Unison E4 double-stop preserved on both B string fret 5 (stringIndex 4) and high e fret 0 (stringIndex 5)
		expect(hydrated.steps[0].events[0].guitarStops).toEqual([
			{ stringIndex: 1, fret: 0 },
			{ stringIndex: 4, fret: 5 },
			{ stringIndex: 5, fret: 0 },
		]);
	});

	test("P.M. without release applies per-onset only, while P.M. + open toggles spans", async () => {
		const perOnsetPmXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
      <direction><direction-type><words>P.M.</words></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>A</step><octave>2</octave></pitch><duration>4</duration><voice>5</voice><staff>2</staff><notations><technical><string>5</string><fret>0</fret></technical></notations></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><staff>2</staff><notations><technical><string>5</string><fret>3</fret></technical></notations></note>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>8</duration><voice>5</voice><staff>2</staff><notations><technical><string>4</string><fret>2</fret></technical></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>A</step><octave>2</octave></pitch><duration>16</duration><voice>5</voice><staff>2</staff><notations><technical><string>5</string><fret>0</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

		const perOnset = await compileMusicXml(
			new TextEncoder().encode(perOnsetPmXml),
		);
		expect(perOnset.trackIr.bars[0].notes.map((n) => n.technique)).toEqual([
			undefined,
			"palmMute",
			undefined,
		]);
		expect(perOnset.trackIr.bars[1].notes[0].technique).toBeUndefined();

		const togglePmXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <direction><direction-type><words>P.M.</words></direction-type></direction>
      <note><pitch><step>E</step><octave>2</octave></pitch><duration>4</duration><notations><technical><string>6</string><fret>0</fret></technical></notations></note>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><notations><technical><string>6</string><fret>3</fret></technical></notations></note>
      <direction><direction-type><words>open</words></direction-type></direction>
      <note><pitch><step>A</step><octave>2</octave></pitch><duration>8</duration><notations><technical><string>5</string><fret>0</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

		const toggled = await compileMusicXml(
			new TextEncoder().encode(togglePmXml),
		);
		expect(toggled.trackIr.bars[0].notes.map((n) => n.technique)).toEqual([
			"palmMute",
			"palmMute",
			undefined,
		]);
	});

	test("resolves relative keys, TAB <fifths>0</fifths> placeholders with harmonies, key overrides, and sanitizes metadata", async () => {
		const chopinLikeXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Prelude Op. 28 No. 20</work-title></work>
  <movement-title>chopin_prelude_op28_no20_c_minor.mxl</movement-title>
  <identification><creator type="composer">Music21</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>-3</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <harmony><root><root-step>C</root-step></root><kind>minor</kind></harmony>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>8</duration><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><staff>2</staff></note>
    </measure>
    <measure number="2">
      <harmony><root><root-step>G</root-step></root><kind>dominant</kind></harmony>
      <forward><duration>8</duration></forward>
      <harmony><root><root-step>C</root-step></root><kind>minor</kind></harmony>
      <backup><duration>8</duration></backup>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>8</duration><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

		const chopinRes = await compileMusicXml(
			new TextEncoder().encode(chopinLikeXml),
		);
		expect(chopinRes.songDoc.keyLabel).toBe("C Minor");
		expect(chopinRes.songDoc.composerOrSource).toBe("MusicXML Score");
		expect(chopinRes.trackIr.subtitle).toBeUndefined();
		expect(chopinRes.songDoc.subtitle).toBe("C Minor (4/4) · piano MusicXML");

		const tabPlaceholderXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <harmony><root><root-step>A</root-step></root><kind>minor</kind></harmony>
      <note><pitch><step>A</step><octave>2</octave></pitch><duration>8</duration><notations><technical><string>5</string><fret>0</fret></technical></notations></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><notations><technical><string>1</string><fret>0</fret></technical></notations></note>
    </measure>
    <measure number="2">
      <attributes><key><fifths>3</fifths></key></attributes>
      <harmony><root><root-step>E</root-step></root><kind>dominant</kind></harmony>
      <note><pitch><step>E</step><octave>2</octave></pitch><duration>8</duration><notations><technical><string>6</string><fret>0</fret></technical></notations></note>
      <note><pitch><step>G</step><alter>1</alter><octave>3</octave></pitch><duration>8</duration><notations><technical><string>3</string><fret>1</fret></technical></notations></note>
    </measure>
    <measure number="3">
      <harmony><root><root-step>A</root-step></root><kind>minor</kind></harmony>
      <note><pitch><step>A</step><octave>2</octave></pitch><duration>16</duration><notations><technical><string>5</string><fret>0</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

		const tabRes = await compileMusicXml(
			new TextEncoder().encode(tabPlaceholderXml),
		);
		expect(tabRes.songDoc.keyLabel).toBe("A Minor");

		const pinned = await compileMusicXml(
			new TextEncoder().encode(tabPlaceholderXml),
			{ key: "F# Minor" },
		);
		expect(pinned.songDoc.keyLabel).toBe("F♯ Minor");
	});

	test("mirrors *.musicxml only, prunes deleted source files safely, honors override precedence, and caches builds", async () => {
		const tmpRoot = await mkdtemp(join(tmpdir(), "musicxml-sync-test-"));
		try {
			const sourceDir = join(tmpRoot, "source");
			const musicXmlDir = join(tmpRoot, "songs", "musicxml");
			const overridesPath = join(tmpRoot, "songs", "overrides.json");
			const generatedDir = join(tmpRoot, "generated");
			const catalogPath = join(tmpRoot, "songCatalog.generated.ts");

			await mkdir(sourceDir, { recursive: true });
			await mkdir(musicXmlDir, { recursive: true });

			const makeScore = (
				title: string,
				step: string,
			) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>${title}</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>${step}</step><octave>4</octave></pitch><duration>16</duration></note>
  </measure></part>
</score-partwise>`;

			// Populate source dir with 2 converted .musicxml files and ignored raw files
			await writeFile(
				join(sourceDir, "alpha_piece.musicxml"),
				makeScore("Raw Alpha", "C"),
			);
			await writeFile(
				join(sourceDir, "beta_piece.musicxml"),
				makeScore("Raw Beta", "D"),
			);
			await writeFile(join(sourceDir, "raw_ignore.mxl"), "zip");
			await writeFile(join(sourceDir, "raw_ignore.xml"), "<score-partwise/>");
			await writeFile(join(sourceDir, "raw_ignore.gp5"), "gp5");

			// Add a manual file inside songs/musicxml that must survive pruning
			await writeFile(
				join(musicXmlDir, "manual_score.musicxml"),
				makeScore("Manual Score", "E"),
			);

			await writeFile(
				overridesPath,
				JSON.stringify({
					alpha_piece: {
						title: "Curated Alpha",
						composerOrSource: "Override Composer",
					},
					beta_piece: {
						title: "Curated Beta",
					},
				}),
			);
			// Sidecar overrides overrides.json, CLI overrides both
			await writeFile(
				join(musicXmlDir, "beta_piece.meta.json"),
				JSON.stringify({ title: "Sidecar Beta" }),
			);

			const loadedOverrides = await loadCuratedOverrides(overridesPath);
			const cliResolved = await resolveImportOptions(
				join(musicXmlDir, "beta_piece.musicxml"),
				loadedOverrides,
				{ title: "CLI Beta" },
			);
			expect(cliResolved.title).toBe("CLI Beta");

			const sync1 = await syncFromMusicXmlFolder({
				sourceDir,
				musicXmlDir,
				overridesPath,
				generatedSongsDir: generatedDir,
				generatedCatalogPath: catalogPath,
			});
			expect(sync1.mirror).toEqual({
				skipped: false,
				copied: 2,
				unchanged: 0,
				pruned: 0,
			});
			expect(sync1.ingestedCount).toBe(3);
			expect(sync1.compiledCount).toBe(3);
			expect(sync1.cachedCount).toBe(0);

			const mirroredEntries = await readdir(musicXmlDir);
			expect(mirroredEntries).toContain("alpha_piece.musicxml");
			expect(mirroredEntries).toContain("beta_piece.musicxml");
			expect(mirroredEntries).toContain("manual_score.musicxml");
			expect(mirroredEntries).not.toContain("raw_ignore.mxl");
			expect(mirroredEntries).not.toContain("raw_ignore.xml");
			expect(mirroredEntries).not.toContain("raw_ignore.gp5");

			// No-op rerun hits cache completely
			const sync2 = await syncFromMusicXmlFolder({
				sourceDir,
				musicXmlDir,
				overridesPath,
				generatedSongsDir: generatedDir,
				generatedCatalogPath: catalogPath,
			});
			expect(sync2.mirror.copied).toBe(0);
			expect(sync2.mirror.unchanged).toBe(2);
			expect(sync2.compiledCount).toBe(0);
			expect(sync2.cachedCount).toBe(3);
			expect(sync2.catalogUpdated).toBe(false);

			// Delete beta_piece from source -> pruned from musicXmlDir, manual_score kept
			await rm(join(sourceDir, "beta_piece.musicxml"));
			const sync3 = await syncFromMusicXmlFolder({
				sourceDir,
				musicXmlDir,
				overridesPath,
				generatedSongsDir: generatedDir,
				generatedCatalogPath: catalogPath,
			});
			expect(sync3.mirror.pruned).toBe(1);
			expect(sync3.ingestedCount).toBe(2);
			expect(sync3.compiledCount).toBe(0);
			expect(sync3.cachedCount).toBe(2);
			expect(sync3.removedCount).toBe(1);
			expect(await readdir(musicXmlDir)).toContain("manual_score.musicxml");
			expect(await readdir(musicXmlDir)).not.toContain("beta_piece.musicxml");

			// Missing sourceDir gracefully skips mirroring without pruning
			const skipRes = await mirrorSourceMusicXml(
				join(tmpRoot, "does-not-exist"),
				musicXmlDir,
			);
			expect(skipRes.skipped).toBe(true);
			expect(await readdir(musicXmlDir)).toContain("alpha_piece.musicxml");
		} finally {
			await rm(tmpRoot, { recursive: true, force: true });
		}
	});

	test("syncFromMusicXmlFolder sorts classical before modern descending by bar count and validates category overrides", async () => {
		const tmpRoot = await mkdtemp(join(tmpdir(), "musicxml-order-test-"));
		try {
			const musicXmlDir = join(tmpRoot, "songs", "musicxml");
			const overridesPath = join(tmpRoot, "songs", "overrides.json");
			const generatedDir = join(tmpRoot, "generated");
			const catalogPath = join(tmpRoot, "songCatalog.generated.ts");
			await mkdir(musicXmlDir, { recursive: true });

			const makeMultiBarScore = (title: string, bars: number) => {
				const measures = Array.from({ length: bars }, (_, idx) => {
					const attrs =
						idx === 0
							? `<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`
							: "";
					return `<measure number="${idx + 1}">${attrs}<note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration></note></measure>`;
				}).join("");
				return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>${title}</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`;
			};

			await writeFile(
				join(musicXmlDir, "a_short_classical.musicxml"),
				makeMultiBarScore("Short Classical", 2),
			);
			await writeFile(
				join(musicXmlDir, "b_long_modern.musicxml"),
				makeMultiBarScore("Long Modern", 8),
			);
			await writeFile(
				join(musicXmlDir, "c_long_classical.musicxml"),
				makeMultiBarScore("Long Classical", 5),
			);
			await writeFile(
				join(musicXmlDir, "d_short_modern.musicxml"),
				makeMultiBarScore("Short Modern", 3),
			);
			await writeFile(
				join(musicXmlDir, "e_uncategorized.musicxml"),
				makeMultiBarScore("Uncategorized", 4),
			);

			await writeFile(
				overridesPath,
				JSON.stringify({
					a_short_classical: { category: "classical" },
					b_long_modern: { category: "modern" },
					c_long_classical: { category: "classical" },
					d_short_modern: { category: "modern" },
				}),
			);

			await syncFromMusicXmlFolder({
				sourceDir: "",
				musicXmlDir,
				overridesPath,
				generatedSongsDir: generatedDir,
				generatedCatalogPath: catalogPath,
			});

			const generatedCatalogText = await Bun.file(catalogPath).text();
			const ids = [...generatedCatalogText.matchAll(/id:\s*"([^"]+)"/g)].map(
				(m) => m[1],
			);
			expect(ids).toEqual([
				"long-classical-piano",
				"short-classical-piano",
				"long-modern-piano",
				"uncategorized-piano",
				"short-modern-piano",
			]);

			const badOverridesPath = join(tmpRoot, "songs", "bad-overrides.json");
			await writeFile(
				badOverridesPath,
				JSON.stringify({ bad: { category: "baroque" } }),
			);
			await expect(loadCuratedOverrides(badOverridesPath)).rejects.toThrow(
				/Invalid --category "baroque"/,
			);
		} finally {
			await rm(tmpRoot, { recursive: true, force: true });
		}
	});

	test("synced 15-song catalog orders classical before modern descending by bar count and preserves metadata & harmonies", async () => {
		expect(SONG_CATALOG).toHaveLength(15);
		const byInst = {
			piano: getCatalogEntriesForInstrument("piano"),
			guitar: getCatalogEntriesForInstrument("guitar"),
			violin: getCatalogEntriesForInstrument("violin"),
			cello: getCatalogEntriesForInstrument("cello"),
		};
		expect(byInst.piano).toHaveLength(3);
		expect(byInst.guitar).toHaveLength(7);
		expect(byInst.violin).toHaveLength(3);
		expect(byInst.cello).toHaveLength(2);

		expect(byInst.guitar.map((e) => [e.id, e.category, e.barCount])).toEqual([
			["etude-no-1-in-e-minor-guitar", "classical", 61],
			["lagrima-guitar", "classical", 32],
			["classical-gas-guitar", "modern", 165],
			["cannonball-rag-guitar", "modern", 113],
			["windy-and-warm-guitar", "modern", 84],
			["amazing-grace-guitar", "modern", 77],
			["how-deep-is-your-love-guitar", "modern", 74],
		]);
		expect(byInst.piano.map((e) => [e.id, e.category, e.barCount])).toEqual([
			["moment-musicaux-no-3-op-94-d-780-piano", "classical", 78],
			["prelude-in-c-major-bwv-846-piano", "classical", 35],
			["prelude-in-c-minor-op-28-no-20-piano", "classical", 13],
		]);
		expect(byInst.violin.map((e) => [e.id, e.category, e.barCount])).toEqual([
			["string-quartet-no-3-k-156-ii-adagio-violin", "classical", 88],
			["meditation-from-thais-violin", "classical", 71],
			["sonata-da-chiesa-op-3-no-1-grave-violin", "classical", 19],
		]);
		expect(byInst.cello.map((e) => [e.id, e.category, e.barCount])).toEqual([
			["cello-suite-no-1-prelude-bwv-1007-cello", "classical", 42],
			["le-cygne-the-swan-cello", "classical", 27],
		]);
		expect(SONG_CATALOG).toEqual(
			[...SONG_CATALOG].sort(compareSongCatalogOrder),
		);

		const keyById = Object.fromEntries(
			SONG_CATALOG.map((e) => [e.id, e.keyLabel]),
		);
		expect(keyById["cello-suite-no-1-prelude-bwv-1007-cello"]).toBe("G Major");
		expect(keyById["prelude-in-c-major-bwv-846-piano"]).toBe("C Major");
		expect(keyById["prelude-in-c-minor-op-28-no-20-piano"]).toBe("C Minor");
		expect(keyById["moment-musicaux-no-3-op-94-d-780-piano"]).toBe("F Minor");
		expect(keyById["sonata-da-chiesa-op-3-no-1-grave-violin"]).toBe("F Major");
		expect(keyById["meditation-from-thais-violin"]).toBe("D Major");
		expect(keyById["string-quartet-no-3-k-156-ii-adagio-violin"]).toBe(
			"E Minor",
		);
		expect(keyById["le-cygne-the-swan-cello"]).toBe("G Major");
		expect(keyById["lagrima-guitar"]).toBe("E Major");
		expect(keyById["amazing-grace-guitar"]).toBe("E Major");
		expect(keyById["how-deep-is-your-love-guitar"]).toBe("B Major");
		expect(keyById["classical-gas-guitar"]).toBe("A Minor");
		expect(keyById["windy-and-warm-guitar"]).toBe("A Minor");
		expect(keyById["cannonball-rag-guitar"]).toBe("G Major");
		expect(keyById["etude-no-1-in-e-minor-guitar"]).toBe("E Minor");

		// Lágrima preserves Eadd9
		const lagrima = await loadSongById("lagrima-guitar");
		expect(lagrima.steps[0].chordSymbol).toBe("Eadd9");

		// Classical Gas has add9 chords and only note-local palm mutes (not latched for the rest of the score)
		const classicalGas = await loadSongById("classical-gas-guitar");
		const cgAllNotes = classicalGas.steps.flatMap((s) =>
			s.events.flatMap((ev) => ev.notes ?? []),
		);
		const cgPalmMuted = cgAllNotes.filter((n) => n.technique === "palmMute");
		expect(cgPalmMuted.length).toBeGreaterThan(0);
		expect(cgPalmMuted.length).toBeLessThan(cgAllNotes.length * 0.15);
		expect(
			classicalGas.steps.some(
				(s) =>
					s.chordSymbol.includes("add9") ||
					s.subBarChords?.some((sc) => sc.chordSymbol.includes("add9")),
			),
		).toBe(true);

		// Windy and Warm preserves unison TAB double-stops (same MIDI played on 2 strings)
		const windyAndWarm = await loadSongById("windy-and-warm-guitar");
		const unisonEvents = windyAndWarm.steps.flatMap((s) =>
			s.events.filter((ev) => {
				if (!ev.guitarStops || ev.guitarStops.length < 2) return false;
				return new Set(ev.midi).size < ev.midi.length;
			}),
		);
		expect(unisonEvents.length).toBeGreaterThanOrEqual(4);
	});
});
