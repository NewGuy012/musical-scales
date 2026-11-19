import { describe, expect, test } from "bun:test";
import { compileMusicXml } from "../src/react-app/musicxml";
import { SONG_CATALOG, loadSongById } from "../src/react-app/songs/songCatalog";
import { hydrateSong } from "../src/react-app/songs/songRuntime";

describe("Bar-by-bar music theory analyzer & catalog invariants", () => {
	test("hydrates all catalog songs with complete theory, non-redundant cues, contiguous sections, and zero Roman quality anomalies", async () => {
		expect(SONG_CATALOG.length).toBeGreaterThan(0);

		let totalBars = 0;
		for (const entry of SONG_CATALOG) {
			const song = await loadSongById(entry.id);
			totalBars += song.steps.length;

			const sections = song.studyGuide?.sections ?? [];
			expect(sections.length).toBeGreaterThanOrEqual(2);
			expect(sections[0].startStepIndex).toBe(0);
			expect(sections[sections.length - 1].endStepIndex).toBe(
				song.steps.length - 1,
			);
			for (let i = 1; i < sections.length; i++) {
				expect(sections[i].startStepIndex).toBe(
					sections[i - 1].endStepIndex + 1,
				);
			}

			for (const step of song.steps) {
				expect(step.theory).toBeDefined();
				expect(step.theory?.roleLabel.length).toBeGreaterThan(2);
				expect(step.theory?.cardSummary.length).toBeGreaterThan(5);
				expect(step.theory?.whatItDoes.length).toBeGreaterThan(15);
				expect(step.theory?.biggerPicture.length).toBeGreaterThan(10);
				expect(step.theory?.whyItWorks.length).toBeGreaterThan(15);
				expect(step.cue).not.toBe(`${step.chordSymbol} (${step.roman})`);

				// Keep Roman badges beginner-friendly (no classical figured-bass fractions)
				expect(step.roman).not.toMatch(/(?:4\/2|6\/5|6\/4|4\/3)/);

				const chordItems = step.subBarChords ?? [
					{
						chordSymbol: step.chordSymbol,
						roman: step.roman,
						quality: step.quality,
					},
				];
				for (const item of chordItems) {
					const stripped = item.roman.replace(/^[♯♭]+/, "");
					if (item.quality === "diminished") {
						expect(item.roman.includes("°") || item.roman.includes("ø")).toBe(
							true,
						);
					} else {
						expect(item.roman.includes("°") || item.roman.includes("ø")).toBe(
							false,
						);
					}
					if (item.quality === "major") {
						expect(/^[iv]+/.test(stripped)).toBe(false);
					}
					if (item.quality === "minor") {
						expect(/^[IV]+/.test(stripped)).toBe(false);
					}
				}
			}
		}
		const expectedBars = SONG_CATALOG.reduce((sum, e) => sum + e.barCount, 0);
		expect(totalBars).toBe(expectedBars);
	});

	test("Bach BWV 846 Bars 1–4 & 20 teach pedal bass, 7th-in-bass, tritone resolution, and V7/IV", async () => {
		const bwv846 = await loadSongById("prelude-in-c-major-bwv-846-piano");
		const [bar1, bar2, bar3, bar4] = bwv846.steps;

		expect(bar1.chordSymbol).toBe("C");
		expect(bar1.roman).toBe("I");
		expect(bar1.theory?.roleLabel).toContain("Pedal");
		expect(bar1.theory?.whatItDoes).toContain("C Major");

		expect(bar2.chordSymbol).toBe("Dm7/C");
		expect(bar2.roman).toBe("ii7");
		expect(bar2.theory?.whatItDoes).toContain("7th (C)");
		expect(bar2.theory?.whatItDoes).toContain("in the bass");
		expect(bar2.theory?.biggerPicture).toContain("ii–V–I");
		expect(bar2.theory?.whyItWorks).toContain("pedal bass");

		expect(bar3.chordSymbol).toBe("G7/B");
		expect(bar3.roman).toBe("V7");
		expect(bar3.theory?.whatItDoes).toContain("leading tone");
		expect(bar3.theory?.whyItWorks).toContain("B rises a half-step to C");

		expect(bar4.chordSymbol).toBe("C");
		expect(bar4.theory?.biggerPicture).toContain("authentic cadence");

		const bar20 = bwv846.steps[19];
		expect(bar20.chordSymbol).toBe("C7");
		expect(bar20.roman).toBe("V7/IV");
		expect(bar20.theory?.whatItDoes).toContain("B♭");
		expect(bar20.theory?.whyItWorks).toContain("E–B♭ tritone");
	});

	test("Chopin Op. 28 No. 20, Bach Cello Suite 1, Lágrima, Cannonball Rag, and How Deep Is Your Love surface authentic harmony insights", async () => {
		const chopin = await loadSongById("prelude-in-c-minor-op-28-no-20-piano");
		expect(chopin.steps[0].subBarChords?.map((c) => c.chordSymbol)).toEqual([
			"Cm",
			"Fm7",
			"G",
			"Cm",
		]);
		expect(chopin.steps[0].theory?.subBarFlow).toContain(
			"Cm (i) → Fm7 (iv7) → G (V) → Cm (i)",
		);
		expect(chopin.steps[1].roman).toBe("VI");
		expect(chopin.steps[1].theory?.roleLabel).toContain("Sequential Echo");
		expect(chopin.steps[5].theory?.biggerPicture).toContain("chromatic bass");

		const bachCello = await loadSongById(
			"cello-suite-no-1-prelude-bwv-1007-cello",
		);
		expect(bachCello.steps[0].roman).toBe("I");
		expect(bachCello.steps[5].roman).toBe("V7/V");
		expect(bachCello.steps[12].roman).toBe("♯v°");
		expect(bachCello.steps[21].theory?.roleLabel).toContain("Cadenza");

		const lagrima = await loadSongById("lagrima-guitar");
		expect(lagrima.steps[4].theory?.roleLabel).toContain("Deceptive");
		expect(lagrima.steps[16].theory?.roleLabel).toContain("Parallel Minor");

		const cannonball = await loadSongById("cannonball-rag-guitar");
		expect(cannonball.steps[1].roman).toBe("V/ii");
		expect(cannonball.steps[3].roman).toBe("V7/V");
		expect(cannonball.steps[5].roman).toBe("V7");

		const howDeep = await loadSongById("how-deep-is-your-love-guitar");
		expect(howDeep.keyLabel).toBe("B Major");
		expect(howDeep.steps[1].theory?.whatItDoes).toContain("A♯");
		expect(howDeep.steps[11].theory?.whatItDoes).toContain("F♯");
		expect(howDeep.steps[19].roman).toBe("♭VII");
		expect(howDeep.steps[28].roman).toBe("V7/ii");
		expect(howDeep.steps[31].theory?.roleLabel).toContain("Minor Plagal");
		// Enharmonic A♭m7 in B Major must not falsely flag G♯/B/D♯/F♯ as chromatic
		expect(howDeep.steps[13].theory?.whatItDoes).not.toContain(
			"Introduces chromatic",
		);
	});

	test("arbitrary local MusicXML imports receive full contextual bar theory without annotations.json", async () => {
		const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Local Teacher Etude</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration></note>
    </measure>
    <measure number="2">
      <harmony><root><root-step>C</root-step></root><kind>dominant</kind></harmony>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration></note>
      <note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>8</duration></note>
    </measure>
    <measure number="3">
      <harmony><root><root-step>F</root-step></root><kind>major</kind></harmony>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>16</duration></note>
    </measure>
    <measure number="4">
      <harmony><root><root-step>G</root-step></root><kind>dominant</kind></harmony>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>16</duration></note>
    </measure>
  </part>
</score-partwise>`;

		const { songDoc } = await compileMusicXml(
			new TextEncoder().encode(sampleXml),
		);
		const hydrated = hydrateSong(songDoc);
		expect(hydrated.steps[1].roman).toBe("V7/IV");
		expect(hydrated.steps[1].theory?.whatItDoes).toContain(
			"secondary dominant",
		);
		expect(hydrated.steps[1].theory?.whyItWorks).toContain("tritone");
		expect(hydrated.steps[2].theory?.biggerPicture).toContain("F (IV)");
		expect(hydrated.steps[3].theory?.roleLabel).toContain("Half Cadence");
	});
});
