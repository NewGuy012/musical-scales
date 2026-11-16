import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/react-app/App";
import { CelloFingerboard } from "../src/react-app/components/CelloFingerboard";
import { ChordsPanel } from "../src/react-app/components/ChordsPanel";
import { CircleWheel } from "../src/react-app/components/CircleWheel";
import { ColorHarmonyPanel } from "../src/react-app/components/ColorHarmonyPanel";
import { FifthsFourthsPanel } from "../src/react-app/components/FifthsFourthsPanel";
import { GuitarFretboard } from "../src/react-app/components/GuitarFretboard";
import { getCelloVoicings } from "../src/react-app/theory/celloFingerboard";
import { analyzeColorHarmony } from "../src/react-app/theory/chromaticHarmony";
import { analyzeKey } from "../src/react-app/theory/circleOfFifths";
import { getGuitarVoicings } from "../src/react-app/theory/guitarFretboard";

describe("Circle of Fifths UI rendering", () => {
	test("renders App with C Major default state, circle neighbors, chords/progressions, and clean instrument dock", () => {
		const html = renderToStaticMarkup(<App />);
		expect(html).toContain("Circle of Fifths");
		expect(html).toContain("C Major");
		expect(html).toContain("Neighbors");
		expect(html).toContain("F Major");
		expect(html).toContain("G Major");
		expect(html).toContain("Chords &amp; Progressions");
		expect(html).toContain("Passing &amp; Substitutions");
		expect(html).toContain("Real Songs");
		expect(html).toContain("Major Chords");
		expect(html).toContain("Minor Chords");
		expect(html).toContain("Dm");
		expect(html).toContain("Em");
		expect(html).toContain("Am");
		expect(html).toContain("B°");
		expect(html).toContain("Progressions in C");
		expect(html).toContain("progression-select");
		expect(html).toContain("I – IV – V – I");
		expect(html).toContain("Pachelbel Canon Sequence");
		expect(html).toContain("Jazz &amp; Circle");
		expect(html).toContain("prog-step-chip");
		expect(html).toContain("C Variations:");
		expect(html).toContain("aug");
		expect(html).toContain("add9");
		expect(html).toContain("dim7");
		expect(html).toContain("sus4");
		expect(html).toContain("Piano");
		expect(html).toContain("Guitar");
		expect(html).toContain("Cello");
		expect(html).toContain("Instrument");
		expect(html).toContain("is-in-chord");
		expect(html).toContain("is-chord-root");
		expect(html).toContain("Keyboard shortcuts");
		// Real Songs are cleanly separated into the Real Songs tab by default
		expect(html).not.toContain("Clair de lune");
		expect(html).not.toContain("Cello Suite No. 1");
		expect(html).not.toContain("Amazing Grace");
	});

	test("renders GuitarFretboard with C major CAGED voicings and 15-fret neck markers", () => {
		const cMaj = analyzeKey(0, "major");
		const tonic = cMaj.chords[0];
		const voicings = getGuitarVoicings(
			tonic.root,
			"major",
			tonic.triadNotes,
			false,
		);
		const html = renderToStaticMarkup(
			<GuitarFretboard
				activeQuality="major"
				chordNotes={tonic.triadNotes}
				chordKind="major"
				voicings={voicings}
				selectedVoicing={voicings[0]}
				scalePitchClasses={[0, 2, 4, 5, 7, 9, 11]}
				scaleNoteNames={cMaj.scaleNotes}
				preferFlats={false}
				onSelectVoicing={() => {}}
				onStrumVoicing={() => {}}
				onPlayFretNote={() => {}}
			/>,
		);
		expect(html).toContain("Open C");
		expect(html).toContain("A-Shape Barre");
		expect(html).toContain("E-Shape Barre");
		expect(html).toContain("D-Shape Upper");
		expect(html).toContain("Voicing");
		expect(html).toContain("All Notes");
		expect(html).toContain("Pentatonic");
		expect(html).toContain("+ Chromatic");
		expect(html).toContain("Scale");
		expect(html).toContain("Strings (6 → 1):");
		expect(html).toContain("C Major Pentatonic");
		expect(html).toContain("A Minor Pentatonic");
		expect(html).toContain("1 · 2 · 3 · 5 · 6");
		expect(html).toContain("Passing Notes");
		expect(html).toContain("♭3 → 3 Scoop");

		const dmChord = cMaj.chords[1];
		const dmVoicings = getGuitarVoicings(
			dmChord.root,
			"minor",
			dmChord.triadNotes,
			false,
		);
		const dmHtml = renderToStaticMarkup(
			<GuitarFretboard
				activeQuality="minor"
				chordNotes={dmChord.triadNotes}
				chordKind="minor"
				voicings={dmVoicings}
				selectedVoicing={dmVoicings[0]}
				scalePitchClasses={[0, 2, 4, 5, 7, 9, 11]}
				scaleNoteNames={cMaj.scaleNotes}
				keyRootName="C"
				keyMode="major"
				preferFlats={false}
				onSelectVoicing={() => {}}
				onStrumVoicing={() => {}}
				onPlayFretNote={() => {}}
			/>,
		);
		expect(dmHtml).toContain("Pentatonic scale basis");
		expect(dmHtml).toContain("Key");
		expect(dmHtml).toContain("Chord");
	});

	test("renders CelloFingerboard with fretless positions, left-hand frame, and minor/7th chords", () => {
		const cMaj = analyzeKey(0, "major");
		const tonic = cMaj.chords[0];
		const cVoicings = getCelloVoicings(
			tonic.root,
			"major",
			tonic.triadNotes,
			false,
		);
		const cHtml = renderToStaticMarkup(
			<CelloFingerboard
				chordLabel="C (I)"
				chordQuality="major"
				chordKind="major"
				chordNotes={tonic.triadNotes}
				scaleNotes={cMaj.scaleNotes}
				keyRootName="C"
				preferFlats={false}
				voicings={cVoicings}
				activeVoicing={cVoicings[0]}
				onSelectVoicing={() => {}}
				onRollVoicing={() => {}}
				onPlayNote={() => {}}
			/>,
		);
		expect(cHtml).toContain("Open 4-Str");
		expect(cHtml).toContain("1st Inv (3rd Bass)");
		expect(cHtml).toContain("Voicing");
		expect(cHtml).toContain("All Notes");
		expect(cHtml).toContain("Scale");
		expect(cHtml).toContain("Fingers");
		expect(cHtml).toContain("Bow Roll");
		expect(cHtml).toContain("Strings IV → I");
		expect(cHtml).toContain("Open · 0");
		expect(cHtml).toContain("Semi 2 · F1");
		expect(cHtml).toContain("Semi 3 · F2");

		const aMin = analyzeKey(0, "minor");
		const amTonic = aMin.chords[0];
		const m7Voicings = getCelloVoicings(
			amTonic.root,
			"m7",
			amTonic.seventhNotes,
			false,
		);
		const dmHtml = renderToStaticMarkup(
			<CelloFingerboard
				chordLabel="Am7 (i)"
				chordQuality="minor"
				chordKind="m7"
				chordNotes={amTonic.seventhNotes}
				scaleNotes={aMin.scaleNotes}
				keyRootName="A"
				preferFlats={false}
				voicings={m7Voicings}
				activeVoicing={m7Voicings[0]}
				onSelectVoicing={() => {}}
				onRollVoicing={() => {}}
				onPlayNote={() => {}}
			/>,
		);
		expect(dmHtml).toContain("5th-Bass m7");
		expect(dmHtml).toContain("Upper Shell (R-♭7-♭3)");
		expect(dmHtml).toContain("LH Frame");
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
					activeChordId={null}
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
				activeChordId={null}
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

	test("renders ColorHarmonyPanel with Chromatic Passing, Diminished, Secondary Dominants, and Tritone Sub topics", () => {
		const cMaj = analyzeKey(0, "major");
		const color = analyzeColorHarmony(cMaj);
		const html = renderToStaticMarkup(
			<ColorHarmonyPanel
				colorAnalysis={color}
				activeChordId={null}
				activeSequenceId={null}
				activeSequenceStepIdx={null}
				onSelectChord={() => {}}
				onPlaySequence={() => {}}
			/>,
		);
		expect(html).toContain("Chromatic Passing");
		expect(html).toContain("Diminished Chords");
		expect(html).toContain("Secondary Dominants");
		expect(html).toContain("Tritone Subs");
		expect(html).toContain("Parallel m7 Half-Step Slide");
		expect(html).toContain("Em7");
		expect(html).toContain("E♭m7");
		expect(html).toContain("F♯m7♭5");
	});
});
