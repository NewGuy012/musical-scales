import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/react-app/App";
import { BowedFingerboard } from "../src/react-app/components/BowedFingerboard";
import { ChordsPanel } from "../src/react-app/components/ChordsPanel";
import { CircleWheel } from "../src/react-app/components/CircleWheel";
import { ColorHarmonyPanel } from "../src/react-app/components/ColorHarmonyPanel";
import { FifthsFourthsPanel } from "../src/react-app/components/FifthsFourthsPanel";
import { GuitarFretboard } from "../src/react-app/components/GuitarFretboard";
import { MusicTeacherSection } from "../src/react-app/components/MusicTeacherSection";
import { getBowedVoicings } from "../src/react-app/theory/celloFingerboard";
import { analyzeColorHarmony } from "../src/react-app/theory/chromaticHarmony";
import { analyzeKey } from "../src/react-app/theory/circleOfFifths";
import { getGuitarVoicings } from "../src/react-app/theory/guitarFretboard";

const noop = () => {};

describe("Musical Scales UI rendering", () => {
	test("renders App with Instruments dock, collapsed Chords workspace below it, and collapsed Music Teacher -> Learn with Real Songs at bottom", () => {
		const html = renderToStaticMarkup(<App />);
		expect(html).toContain("Musical Scales");
		expect(html).toContain("Circle of Fifths");
		expect(html).toContain("Key Signature");
		expect(html).toContain("C Major");
		expect(html).toContain("Neighbors");
		expect(html).toContain("F Major");
		expect(html).toContain("G Major");
		expect(html).toContain(
			'id="section-chords-heading" class="section-title">Chords</h2>',
		);
		expect(html).not.toContain(
			"Chords &amp; Progressions · Passing &amp; Substitutions",
		);
		expect(html).toContain("Diatonic Chords in C");
		expect(html).toContain("Chords &amp; Progressions");
		expect(html).toContain("Passing &amp; Substitutions");
		expect(html).toContain("Music Teacher");
		expect(html).toContain("Learn with Real Songs");
		expect(html).toContain("Import MusicXML");
		expect(html).toContain("diatonic-chords-grid");
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
		expect(html).toContain("Violin");
		expect(html).toContain("Cello");
		expect(html).toContain("Instrument");
		expect(html).toContain("is-in-chord");
		expect(html).toContain("is-chord-root");
		expect(html).toContain("Keyboard shortcuts");
		expect(html).toContain('aria-label="Audio and spelling preferences"');

		// Left column: Circle of Fifths is expanded; Right column: Neighbors, Chords, and Music Teacher are collapsed by default
		expect(html).toContain('aria-label="Collapse Circle of Fifths"');
		expect(html).toContain('aria-label="Expand Neighbors"');
		expect(html).toContain('aria-label="Expand Chords"');
		expect(html).toContain('aria-controls="section-chords-body"');
		expect(html).toContain(
			'id="section-chords-body" class="section-body" hidden=""',
		);
		expect(html).toContain('aria-label="Expand Music Teacher"');
		expect(html).toContain('aria-controls="section-music-teacher-body"');
		expect(html).toContain(
			'id="section-music-teacher-body" class="section-body" hidden=""',
		);
		expect(html).toContain("↺ F");
		expect(html).toContain("G ↻");

		// Progressive disclosure drawers are hidden by default
		expect(html).toContain('id="settings-popover"');
		expect(html).toContain('id="chords-extras-drawer"');
		expect(html).toContain('id="chord-variations-drawer"');

		// Right column order: Instruments dock -> Neighbors -> Chords -> Music Teacher (Learn with Real Songs)
		const instrumentsSectionIdx = html.indexOf('id="section-instruments"');
		const neighborsSectionIdx = html.indexOf('id="section-neighbors"');
		const chordsSectionIdx = html.indexOf('id="section-chords"');
		const musicTeacherIdx = html.indexOf('id="section-music-teacher"');
		expect(instrumentsSectionIdx).toBeGreaterThan(-1);
		expect(neighborsSectionIdx).toBeGreaterThan(instrumentsSectionIdx);
		expect(chordsSectionIdx).toBeGreaterThan(neighborsSectionIdx);
		expect(musicTeacherIdx).toBeGreaterThan(chordsSectionIdx);

		// Music Teacher -> Learn with Real Songs controls & empty MusicXML state
		expect(html).toContain('id="panel-instrument" class="instrument-panel"');
		expect(html).toContain("songs-instrument-bar");
		expect(html).toContain('id="songs-tab-piano"');
		expect(html).toContain("Synced with Piano above");
		expect(html).toContain("No Piano scores yet");
		expect(html).not.toContain("Load MusicXML File");
		expect(html).not.toContain("Piano Repertoire");
	});

	test("renders MusicTeacherSection collapsed, error alert, and multi-part picker states", () => {
		const html = renderToStaticMarkup(
			<MusicTeacherSection
				instrumentView="guitar"
				instrumentLabel="Guitar"
				instrumentTabList={<div data-tabs="1" />}
				songs={[]}
				otherInstrumentsWithSongs={[]}
				selectedSongId={null}
				playingSongId={null}
				cuedSongId={null}
				songPositionMs={0}
				playbackSpeed={1}
				activeChordStepIndex={null}
				activeNoteLabel={null}
				selectedPreviewStepId={null}
				isCollapsed={true}
				isImporting={false}
				importError="Invalid XML"
				pendingPartChoice={{
					fileName: "duet.mxl",
					title: "Duet",
					parts: [
						{
							index: 0,
							partId: "P1",
							name: "Acoustic Guitar",
							isPercussion: false,
							isStringed: true,
							stringCount: 6,
							staffCount: 1,
							midiProgram: 25,
							noteCount: 42,
							suggestedInstrument: "guitar",
						},
						{
							index: 1,
							partId: "P2",
							name: "Violin",
							isPercussion: false,
							isStringed: false,
							stringCount: 0,
							staffCount: 1,
							midiProgram: 41,
							noteCount: 36,
							suggestedInstrument: "violin",
						},
					],
					selectedPartId: "P1",
					instrument: "guitar",
				}}
				onToggleCollapse={noop}
				onSelectInstrument={noop}
				onSelectSong={noop}
				onImportMusicXmlFile={noop}
				onConfirmPartChoice={noop}
				onCancelPartChoice={noop}
				onDismissImportError={noop}
				onRemoveLocalPreview={noop}
				onChangePlaybackSpeed={noop}
				onTogglePlaySong={noop}
				onStopSong={noop}
				onSeekSong={noop}
				onBeginScrubSong={noop}
				onSkipSongBar={noop}
				onPlayFromSongBar={noop}
				onSelectSongChordStep={noop}
			/>,
		);
		expect(html).toContain('aria-label="Expand Music Teacher"');
		expect(html).toContain('id="section-music-teacher-body"');
		expect(html).toContain('hidden=""');
		expect(html).toContain("Invalid XML");
		expect(html).toContain("Multiple parts detected");
		expect(html).toContain("Acoustic Guitar (guitar · 42 notes)");
	});

	test("renders collapsed state cleanly for collapsible section panels", () => {
		const cMaj = analyzeKey(0, "major");
		const collapsedHtml = renderToStaticMarkup(
			<>
				<CircleWheel
					analysis={cMaj}
					selectedSlot={0}
					mode="major"
					preference="standard"
					slotOverrides={{}}
					highlightedChord={null}
					rotateToSelected={false}
					isCollapsed={true}
					onSelectKey={noop}
					onPlayTonic={noop}
					onStepFourth={noop}
					onStepFifth={noop}
					onToggleRotate={noop}
					onToggleCollapse={noop}
				/>
				<FifthsFourthsPanel
					analysis={cMaj}
					walkingDirection={null}
					isCollapsed={true}
					onSelectKey={noop}
					onAuditionRelationship={noop}
					onToggleWalk={noop}
					onToggleCollapse={noop}
				/>
			</>,
		);
		expect(collapsedHtml).toContain('aria-label="Expand Circle of Fifths"');
		expect(collapsedHtml).toContain('aria-label="Expand Neighbors"');
		expect(collapsedHtml).toContain('aria-expanded="false"');
		expect(collapsedHtml).toContain('id="section-circle-body"');
		expect(collapsedHtml).toContain('id="section-neighbors-body"');
		expect(collapsedHtml).toContain('hidden=""');
		expect(collapsedHtml).not.toContain("Walk 4ths");
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
				onSelectVoicing={noop}
				onStrumVoicing={noop}
				onPlayFretNote={noop}
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
				onSelectVoicing={noop}
				onStrumVoicing={noop}
				onPlayFretNote={noop}
			/>,
		);
		expect(dmHtml).toContain("Pentatonic scale basis");
		expect(dmHtml).toContain("Key");
		expect(dmHtml).toContain("Chord");
	});

	test("renders BowedFingerboard (cello) with fretless positions, left-hand frame, and minor/7th chords", () => {
		const cMaj = analyzeKey(0, "major");
		const tonic = cMaj.chords[0];
		const cVoicings = getBowedVoicings(
			"cello",
			tonic.root,
			"major",
			tonic.triadNotes,
			false,
		);
		const cHtml = renderToStaticMarkup(
			<BowedFingerboard
				instrument="cello"
				chordLabel="C (I)"
				chordQuality="major"
				chordKind="major"
				chordNotes={tonic.triadNotes}
				scaleNotes={cMaj.scaleNotes}
				keyRootName="C"
				preferFlats={false}
				voicings={cVoicings}
				activeVoicing={cVoicings[0]}
				onSelectVoicing={noop}
				onRollVoicing={noop}
				onPlayNote={noop}
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
		const m7Voicings = getBowedVoicings(
			"cello",
			amTonic.root,
			"m7",
			amTonic.seventhNotes,
			false,
		);
		const dmHtml = renderToStaticMarkup(
			<BowedFingerboard
				instrument="cello"
				chordLabel="Am7 (i)"
				chordQuality="minor"
				chordKind="m7"
				chordNotes={amTonic.seventhNotes}
				scaleNotes={aMin.scaleNotes}
				keyRootName="A"
				preferFlats={false}
				voicings={m7Voicings}
				activeVoicing={m7Voicings[0]}
				onSelectVoicing={noop}
				onRollVoicing={noop}
				onPlayNote={noop}
			/>,
		);
		expect(dmHtml).toContain("5th-Bass m7");
		expect(dmHtml).toContain("Upper Shell (R-♭7-♭3)");
		expect(dmHtml).toContain("LH Frame");
	});

	test("renders BowedFingerboard (violin) with G3-D4-A4-E5 tuning, open voicings, and left-hand frame", () => {
		const dMaj = analyzeKey(2, "major");
		const dTonic = dMaj.chords[0];
		const dVoicings = getBowedVoicings(
			"violin",
			dTonic.root,
			"major",
			dTonic.triadNotes,
			false,
		);
		const dHtml = renderToStaticMarkup(
			<BowedFingerboard
				instrument="violin"
				chordLabel="D (I)"
				chordQuality="major"
				chordKind="major"
				chordNotes={dTonic.triadNotes}
				scaleNotes={dMaj.scaleNotes}
				keyRootName="D"
				preferFlats={false}
				voicings={dVoicings}
				activeVoicing={dVoicings[0] ?? null}
				onSelectVoicing={noop}
				onRollVoicing={noop}
				onPlayNote={noop}
			/>,
		);
		expect(dHtml).toContain("Open D-Str");
		expect(dHtml).toContain("G3");
		expect(dHtml).toContain("D4");
		expect(dHtml).toContain("A4");
		expect(dHtml).toContain("E5");
		expect(dHtml).toContain("Strings IV → I");
		expect(dHtml).toContain("Bow Roll");
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
					onSelectKey={noop}
					onPlayTonic={noop}
					onStepFourth={noop}
					onStepFifth={noop}
					onToggleRotate={noop}
				/>
				<FifthsFourthsPanel
					analysis={fsMaj}
					walkingDirection={null}
					onSelectKey={noop}
					onAuditionRelationship={noop}
					onToggleWalk={noop}
				/>
				<ChordsPanel
					analysis={fsMaj}
					voicingMode="triad"
					activeChordId={null}
					onSelectChord={noop}
					onPlayRootPairChord={noop}
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
				onSelectChord={noop}
				onPlayRootPairChord={noop}
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
				onSelectChord={noop}
				onPlaySequence={noop}
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
		expect(html).toContain("color-cards-grid");

		const dimHtml = renderToStaticMarkup(
			<ColorHarmonyPanel
				colorAnalysis={color}
				activeChordId={null}
				activeSequenceId={null}
				activeSequenceStepIdx={null}
				initialTopic="diminished"
				onSelectChord={noop}
				onPlaySequence={noop}
			/>,
		);
		expect(dimHtml).toContain("dim-symmetry-split");
		expect(dimHtml).toContain("C♯dim7");

		const secHtml = renderToStaticMarkup(
			<ColorHarmonyPanel
				colorAnalysis={color}
				activeChordId={null}
				activeSequenceId={null}
				activeSequenceStepIdx={null}
				initialTopic="secondary"
				onSelectChord={noop}
				onPlaySequence={noop}
			/>,
		);
		expect(secHtml).toContain("sec-dom-grid");
		expect(secHtml).toContain("V7/V");

		const triHtml = renderToStaticMarkup(
			<ColorHarmonyPanel
				colorAnalysis={color}
				activeChordId={null}
				activeSequenceId={null}
				activeSequenceStepIdx={null}
				initialTopic="tritone"
				onSelectChord={noop}
				onPlaySequence={noop}
			/>,
		);
		expect(triHtml).toContain("tritone-secondary-grid");
		expect(triHtml).toContain("D♭7");
	});
});
