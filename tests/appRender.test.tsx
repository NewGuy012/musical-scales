import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/react-app/App";
import { CelloFingerboard } from "../src/react-app/components/CelloFingerboard";
import { ChordsPanel } from "../src/react-app/components/ChordsPanel";
import { CircleWheel } from "../src/react-app/components/CircleWheel";
import { FifthsFourthsPanel } from "../src/react-app/components/FifthsFourthsPanel";
import { GuitarFretboard } from "../src/react-app/components/GuitarFretboard";
import { SongExamplesPanel } from "../src/react-app/components/SongExamplesPanel";
import { getCelloVoicings } from "../src/react-app/theory/celloFingerboard";
import { analyzeKey } from "../src/react-app/theory/circleOfFifths";
import { getGuitarVoicings } from "../src/react-app/theory/guitarFretboard";
import { getSongsForInstrument } from "../src/react-app/theory/songExamples";

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
		expect(html).toContain("Piano View");
		expect(html).toContain("Guitar View");
		expect(html).toContain("Cello View");
		expect(html).toContain("Instrument");
		expect(html).toContain("Grand Piano");
		expect(html).toContain("Learn from Real Songs");
		expect(html).toContain("Do-Re-Mi (from The Sound of Music)");
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
				activeLabel="C (I)"
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
		expect(html).toContain("Guitar Fretboard");
		expect(html).toContain("Open C");
		expect(html).toContain("A-Shape Barre");
		expect(html).toContain("E-Shape Barre");
		expect(html).toContain("D-Shape Upper");
		expect(html).toContain("Voicing + Neck");
		expect(html).toContain("All Positions");
		expect(html).toContain("Key Scale");
		expect(html).toContain("Strings (6 → 1):");
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
				chordRoleLabel="I · C Major"
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
		expect(cHtml).toContain("Voicing + Neck");
		expect(cHtml).toContain("All Positions");
		expect(cHtml).toContain("Key Scale");
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
				chordRoleLabel="i · A Minor"
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
		expect(dmHtml).toContain("Am7 (i)");
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

	test("renders SongExamplesPanel per instrument (Guitar Amazing Grace, Cello-only Bach Suite)", () => {
		const guitarHtml = renderToStaticMarkup(
			<SongExamplesPanel
				instrumentView="guitar"
				songs={getSongsForInstrument("guitar")}
				playingSongId={null}
				activeChordStepIndex={null}
				activeNoteLabel={null}
				selectedPreviewStepId={null}
				onTogglePlaySong={() => {}}
				onSelectSongChordStep={() => {}}
			/>,
		);
		expect(guitarHtml).toContain("Amazing Grace");
		expect(guitarHtml).toContain("Em");
		expect(guitarHtml).toContain("D7");
		expect(guitarHtml).not.toContain("Cello Suite No. 1");

		const celloSongs = getSongsForInstrument("cello");
		const celloHtml = renderToStaticMarkup(
			<SongExamplesPanel
				instrumentView="cello"
				songs={celloSongs}
				playingSongId={celloSongs[0].id}
				activeChordStepIndex={1}
				activeNoteLabel="C4 (I · F2)"
				selectedPreviewStepId={null}
				onTogglePlaySong={() => {}}
				onSelectSongChordStep={() => {}}
			/>,
		);
		expect(celloHtml).toContain("Cello Suite No. 1 — Prelude (BWV 1007)");
		expect(celloHtml).toContain("J.S. Bach");
		expect(celloHtml).toContain("C/G");
		expect(celloHtml).toContain("D7/G");
		expect(celloHtml).toContain("Playing");
		expect(celloHtml).toContain("C4 (I · F2)");
	});
});
