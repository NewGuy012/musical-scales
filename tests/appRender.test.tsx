import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/react-app/App";
import { ChordsPanel } from "../src/react-app/components/ChordsPanel";
import { CircleWheel } from "../src/react-app/components/CircleWheel";
import { FifthsFourthsPanel } from "../src/react-app/components/FifthsFourthsPanel";
import { analyzeKey } from "../src/react-app/theory/circleOfFifths";

describe("Circle of Fifths UI rendering", () => {
	test("renders App with C Major default state, fifths/fourths relationships, and major/minor chords", () => {
		const html = renderToStaticMarkup(<App />);
		expect(html).toContain("Circle of Fifths");
		expect(html).toContain("C Major");
		expect(html).toContain("F Major");
		expect(html).toContain("G Major");
		expect(html).toContain("Major Chords");
		expect(html).toContain("Minor Chords");
		expect(html).toContain("Dm");
		expect(html).toContain("Em");
		expect(html).toContain("Am");
		expect(html).toContain("B°");
		expect(html).toContain("Piano Voicing");
	});

	test("renders F♯ Major and E♭ Minor cleanly with proper accidentals and harmonic minor V", () => {
		const fsMaj = analyzeKey(6, "major", "sharps");
		const fsHtml = renderToStaticMarkup(
			<>
				<CircleWheel
					analysis={fsMaj}
					selectedSlot={6}
					mode="major"
					preference="sharps"
					slotOverrides={{}}
					highlightedChord={null}
					rotateToSelected={false}
					onSelectKey={() => {}}
					onPlayTonic={() => {}}
					onStepFourth={() => {}}
					onStepFifth={() => {}}
					onToggleRotate={() => {}}
				/>
				<FifthsFourthsPanel
					analysis={fsMaj}
					walkingDirection={null}
					onSelectKey={() => {}}
					onAuditionRelationship={() => {}}
					onToggleWalk={() => {}}
				/>
				<ChordsPanel
					analysis={fsMaj}
					voicingMode="triad"
					arpeggiate={false}
					activeChordId={null}
					onChangeVoicingMode={() => {}}
					onToggleArpeggiate={() => {}}
					onSelectChord={() => {}}
					onPlayRootPairChord={() => {}}
				/>
			</>,
		);

		expect(fsHtml).toContain("F♯");
		expect(fsHtml).toContain("C♯");
		expect(fsHtml).toContain("G♯m");
		expect(fsHtml).toContain("A♯m");
		expect(fsHtml).toContain("D♯m");
		expect(fsHtml).toContain("E♯°");

		const ebMin = analyzeKey(6, "minor", "flats");
		const ebHtml = renderToStaticMarkup(
			<ChordsPanel
				analysis={ebMin}
				voicingMode="seventh"
				arpeggiate={false}
				activeChordId={null}
				onChangeVoicingMode={() => {}}
				onToggleArpeggiate={() => {}}
				onSelectChord={() => {}}
				onPlayRootPairChord={() => {}}
			/>,
		);
		expect(ebHtml).toContain("E♭m7");
		expect(ebHtml).toContain("A♭m7");
		expect(ebHtml).toContain("B♭m7");
		expect(ebHtml).toContain("G♭maj7");
		expect(ebHtml).toContain("C♭maj7");
		expect(ebHtml).toContain("D♭7");
		expect(ebHtml).toContain("Harmonic V");
	});
});
