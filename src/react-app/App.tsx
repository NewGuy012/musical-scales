import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	SoundPreset,
	getDefaultChordSpread,
	playChordNotes,
	playSingleNote,
	playStepSequence,
	playTimedSequence,
	stopAllAudio,
} from "./audio/synth";
import { BowedFingerboard } from "./components/BowedFingerboard";
import { ChordVoicingMode, ChordsPanel } from "./components/ChordsPanel";
import { CircleWheel, WheelChordHighlight } from "./components/CircleWheel";
import { ColorHarmonyPanel } from "./components/ColorHarmonyPanel";
import { FifthsFourthsPanel } from "./components/FifthsFourthsPanel";
import { GuitarFretboard } from "./components/GuitarFretboard";
import {
	IconChevronDown,
	IconKeyboard,
	IconMoon,
	IconMusic,
	IconPlay,
	IconSliders,
	IconStop,
	IconSun,
	IconSwap,
	IconVolume,
	IconVolumeMute,
} from "./components/Icons";
import { KeySignatureStaff } from "./components/KeySignatureStaff";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { SongExamplesPanel } from "./components/SongExamplesPanel";
import { BowedVoicing, getBowedVoicings } from "./theory/celloFingerboard";
import {
	HarmonyChordSpec,
	analyzeColorHarmony,
} from "./theory/chromaticHarmony";
import {
	AccidentalPreference,
	CIRCLE_SLOTS,
	ChordProgression,
	ChordQuality,
	DiatonicChord,
	EnharmonicSide,
	KeyAnalysis,
	KeyMode,
	ProgressionCategory,
	analyzeKey,
	getChordCardId,
	getPianoBadgeClass,
	mod12,
	noteToPitchClass,
} from "./theory/circleOfFifths";
import {
	CHORD_VARIATION_SPECS,
	GuitarChordKind,
	GuitarVoicing,
	buildChordVariation,
	createPitchClassNameResolver,
	getGuitarVoicings,
	inferGuitarChordKind,
} from "./theory/guitarFretboard";
import {
	FlattenedSongStep,
	InstrumentTab,
	SongChordStep,
	SongExample,
	findPlaybackEventAtTime,
	flattenSongPlaybackSteps,
	getSongBarStartTimes,
	getSongsForInstrument,
} from "./theory/songExamples";
import "./App.css";

interface ActiveVoicing {
	id: string | null;
	label: string;
	quality: ChordQuality;
	guitarKind: GuitarChordKind | null;
	midi: number[];
	notes: string[];
	diatonicChord: DiatonicChord | null;
	wheelHighlight: WheelChordHighlight | null;
}

const MAJOR_DEGREES = ["1", "2", "3", "4", "5", "6", "7"] as const;
const MINOR_DEGREES = ["1", "2", "♭3", "4", "5", "♭6", "♭7"] as const;
const PROGRESSION_CATEGORIES: readonly ProgressionCategory[] = [
	"Classics & Cadences",
	"Pop & Rock",
	"Jazz & Circle",
	"Classical & Sequence",
] as const;

const INSTRUMENT_TABS: readonly InstrumentTab[] = [
	"piano",
	"guitar",
	"violin",
	"cello",
] as const;

type MainSectionId = "section-circle" | "section-neighbors";
type WorkspaceTab = "chords" | "color" | "songs";

const INSTRUMENT_META: Record<
	InstrumentTab,
	{ label: string; repertoire: string; tuning: string }
> = {
	piano: { label: "Piano", repertoire: "Piano Repertoire", tuning: "C4–B5" },
	guitar: {
		label: "Guitar",
		repertoire: "Guitar Repertoire",
		tuning: "E A D G B e",
	},
	violin: {
		label: "Violin",
		repertoire: "Violin Repertoire",
		tuning: "G3–D4–A4–E5",
	},
	cello: {
		label: "Cello",
		repertoire: "Cello Repertoire",
		tuning: "C2–G2–D3–A3",
	},
};

function InstrumentTabList({
	activeTab,
	onSelect,
	idPrefix,
	ariaLabel,
	controlsId,
}: {
	activeTab: InstrumentTab;
	onSelect: (tabId: InstrumentTab) => void;
	idPrefix: string;
	ariaLabel: string;
	controlsId: string;
}) {
	return (
		<div className="instrument-tablist" role="tablist" aria-label={ariaLabel}>
			{INSTRUMENT_TABS.map((tabId) => (
				<button
					key={tabId}
					type="button"
					role="tab"
					id={`${idPrefix}-${tabId}`}
					aria-selected={activeTab === tabId}
					aria-controls={controlsId}
					className={`instrument-tab ${activeTab === tabId ? "is-active" : ""}`}
					onClick={() => onSelect(tabId)}
				>
					{INSTRUMENT_META[tabId].label}
				</button>
			))}
		</div>
	);
}

function getInstrumentVoicings(
	instrument: InstrumentTab,
	notes: string[],
	guitarKind: GuitarChordKind | null,
	flatBias: boolean,
): (GuitarVoicing | BowedVoicing)[] {
	if (instrument === "piano" || !guitarKind || notes.length < 3) return [];
	return instrument === "guitar"
		? getGuitarVoicings(notes[0], guitarKind, notes, flatBias)
		: getBowedVoicings(instrument, notes[0], guitarKind, notes, flatBias);
}

export function App() {
	const [selectedSlot, setSelectedSlot] = useState<number>(0);
	const [mode, setMode] = useState<KeyMode>("major");
	const [preference, setPreference] =
		useState<AccidentalPreference>("standard");
	const [slotOverrides, setSlotOverrides] = useState<
		Partial<Record<number, EnharmonicSide>>
	>({});
	const [voicingMode, setVoicingMode] = useState<ChordVoicingMode>("triad");
	const [arpeggiate, setArpeggiate] = useState<boolean>(false);
	const [soundMode, setSoundMode] = useState<"auto" | "pad" | "muted">("auto");
	const [lastUnmutedSoundMode, setLastUnmutedSoundMode] = useState<
		"auto" | "pad"
	>("auto");
	const [rotateToSelected, setRotateToSelected] = useState<boolean>(false);
	const [theme, setTheme] = useState<"dark" | "light">("dark");
	const [instrumentView, setInstrumentView] = useState<InstrumentTab>("piano");
	const [harmonyTab, setHarmonyTab] = useState<WorkspaceTab>("chords");
	const [variationsOpen, setVariationsOpen] = useState<boolean>(false);
	const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
	const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);
	const settingsContainerRef = useRef<HTMLDivElement | null>(null);
	const shortcutsContainerRef = useRef<HTMLDivElement | null>(null);
	const soundPreset: SoundPreset =
		soundMode === "auto" ? instrumentView : soundMode;
	const [selectedVoicingByInstrument, setSelectedVoicingByInstrument] =
		useState<Partial<Record<InstrumentTab, string>>>({});

	const [auditionOverride, setAuditionOverride] =
		useState<ActiveVoicing | null>(null);
	const [activeScaleIndex, setActiveScaleIndex] = useState<number | null>(null);
	const [selectedProgressionId, setSelectedProgressionId] =
		useState<string>("maj-1451");
	const [activeProgressionId, setActiveProgressionId] = useState<string | null>(
		null,
	);
	const [activeProgressionStepIdx, setActiveProgressionStepIdx] = useState<
		number | null
	>(null);
	const [walkingDirection, setWalkingDirection] = useState<
		"fourth" | "fifth" | null
	>(null);
	const [playingSongId, setPlayingSongId] = useState<string | null>(null);
	const [cuedSongId, setCuedSongId] = useState<string | null>(null);
	const [songPositionMs, setSongPositionMs] = useState<number>(0);
	const [activeSongStepIndex, setActiveSongStepIndex] = useState<number | null>(
		null,
	);
	const [activeSongNoteLabel, setActiveSongNoteLabel] = useState<string | null>(
		null,
	);
	const [activeSongEvent, setActiveSongEvent] =
		useState<FlattenedSongStep | null>(null);
	const [selectedSongPreviewId, setSelectedSongPreviewId] = useState<
		string | null
	>(null);
	const [selectedSongByInstrument, setSelectedSongByInstrument] = useState<
		Partial<Record<InstrumentTab, string>>
	>({});
	const [activeGuitarRunMidi, setActiveGuitarRunMidi] = useState<number | null>(
		null,
	);
	const [activeColorSeqId, setActiveColorSeqId] = useState<string | null>(null);
	const [activeColorStepIdx, setActiveColorStepIdx] = useState<number | null>(
		null,
	);
	const [collapsedSections, setCollapsedSections] = useState<
		Partial<Record<MainSectionId, boolean>>
	>({
		"section-neighbors": true,
	});

	const cancelSequenceRef = useRef<(() => void) | null>(null);
	const songPositionMsRef = useRef<number>(0);
	const lastUiProgressMsRef = useRef<number>(-100);

	const toggleSectionCollapsed = useCallback((sectionId: MainSectionId) => {
		setCollapsedSections((prev) => ({
			...prev,
			[sectionId]: !prev[sectionId],
		}));
	}, []);

	const updateSongPosition = useCallback((ms: number) => {
		songPositionMsRef.current = ms;
		lastUiProgressMsRef.current = ms;
		setSongPositionMs(ms);
	}, []);

	const analysis = useMemo(
		() => analyzeKey(selectedSlot, mode, preference, slotOverrides),
		[selectedSlot, mode, preference, slotOverrides],
	);
	const colorAnalysis = useMemo(
		() => analyzeColorHarmony(analysis),
		[analysis],
	);

	const cancelActivePlaybackEngine = useCallback(() => {
		if (cancelSequenceRef.current) {
			cancelSequenceRef.current();
			cancelSequenceRef.current = null;
		} else {
			stopAllAudio();
		}
	}, []);

	const clearTransientSequences = useCallback(() => {
		setActiveScaleIndex(null);
		setActiveProgressionId(null);
		setActiveProgressionStepIdx(null);
		setWalkingDirection(null);
		setSelectedSongPreviewId(null);
		setActiveGuitarRunMidi(null);
		setActiveColorSeqId(null);
		setActiveColorStepIdx(null);
	}, []);

	const resetSongPlaybackState = useCallback(() => {
		setPlayingSongId(null);
		setCuedSongId(null);
		songPositionMsRef.current = 0;
		setSongPositionMs(0);
		lastUiProgressMsRef.current = -100;
		setActiveSongStepIndex(null);
		setActiveSongNoteLabel(null);
		setActiveSongEvent(null);
	}, []);

	const stopActiveSequence = useCallback(() => {
		cancelActivePlaybackEngine();
		clearTransientSequences();
		resetSongPlaybackState();
	}, [
		cancelActivePlaybackEngine,
		clearTransientSequences,
		resetSongPlaybackState,
	]);

	useEffect(() => {
		document.documentElement.setAttribute("data-theme", theme);
	}, [theme]);

	useEffect(() => {
		return () => {
			cancelSequenceRef.current?.();
		};
	}, []);

	const isSeventh = voicingMode === "seventh";

	const toChordVoicing = useCallback(
		(
			chord: DiatonicChord,
			idOverride?: string,
			highlightWheel = true,
		): ActiveVoicing => {
			const symbol = isSeventh ? chord.seventhSymbol : chord.symbol;
			return {
				id: idOverride ?? getChordCardId(chord),
				label: `${symbol} (${chord.roman})`,
				quality: chord.quality,
				guitarKind: inferGuitarChordKind(chord, chord.quality, isSeventh),
				midi: isSeventh ? chord.seventhMidi : chord.triadMidi,
				notes: isSeventh ? chord.seventhNotes : chord.triadNotes,
				diatonicChord: chord,
				wheelHighlight: highlightWheel
					? {
							circleIndex: chord.circleIndex,
							quality: chord.quality,
							roman: chord.roman,
							symbol,
						}
					: null,
			};
		},
		[isSeventh],
	);

	const tonicChord = analysis.chords[0];
	const activeVoicing = useMemo<ActiveVoicing>(() => {
		if (auditionOverride) {
			if (auditionOverride.diatonicChord) {
				return toChordVoicing(
					auditionOverride.diatonicChord,
					auditionOverride.id ?? undefined,
				);
			}
			return auditionOverride;
		}
		return toChordVoicing(tonicChord, undefined, false);
	}, [auditionOverride, tonicChord, toChordVoicing]);

	const preferFlats = useMemo(
		() =>
			analysis.accidentalsCount < 0 ||
			activeVoicing.notes.some((n) => n.includes("♭")),
		[analysis.accidentalsCount, activeVoicing.notes],
	);

	const activeInstrumentVoicings = useMemo(
		() =>
			getInstrumentVoicings(
				instrumentView,
				activeVoicing.notes,
				activeVoicing.guitarKind,
				preferFlats,
			),
		[
			instrumentView,
			activeVoicing.notes,
			activeVoicing.guitarKind,
			preferFlats,
		],
	);

	const activeInstrumentVoicing = useMemo(() => {
		const selectedId = selectedVoicingByInstrument[instrumentView];
		return (
			activeInstrumentVoicings.find((v) => v.id === selectedId) ??
			activeInstrumentVoicings[0] ??
			null
		);
	}, [activeInstrumentVoicings, selectedVoicingByInstrument, instrumentView]);

	const instrumentSpreadSec =
		instrumentView === "piano"
			? undefined
			: getDefaultChordSpread(instrumentView, arpeggiate);

	const resolvePlaybackForInstrument = useCallback(
		(
			notes: string[],
			guitarKind: GuitarChordKind | null,
			pianoMidi: number[],
			flatBias: boolean,
		): { midi: number[]; spreadSec?: number } => {
			const voicings = getInstrumentVoicings(
				instrumentView,
				notes,
				guitarKind,
				flatBias,
			);
			const selectedId = selectedVoicingByInstrument[instrumentView];
			const chosen = voicings.find((v) => v.id === selectedId) ?? voicings[0];
			return chosen
				? { midi: chosen.soundingMidi, spreadSec: instrumentSpreadSec }
				: { midi: pianoMidi };
		},
		[instrumentView, selectedVoicingByInstrument, instrumentSpreadSec],
	);

	const playInstrumentChord = useCallback(
		(
			notes: string[],
			guitarKind: GuitarChordKind | null,
			pianoMidi: number[],
			flatBias: boolean,
		) => {
			const pb = resolvePlaybackForInstrument(
				notes,
				guitarKind,
				pianoMidi,
				flatBias,
			);
			playChordNotes(pb.midi, {
				preset: soundPreset,
				arpeggiate,
				spreadSec: pb.spreadSec,
			});
		},
		[resolvePlaybackForInstrument, soundPreset, arpeggiate],
	);

	const resolveDiatonicPlayback = useCallback(
		(chord: DiatonicChord, flatBias: boolean) => {
			const v = toChordVoicing(chord);
			return resolvePlaybackForInstrument(
				v.notes,
				v.guitarKind,
				v.midi,
				flatBias,
			);
		},
		[toChordVoicing, resolvePlaybackForInstrument],
	);

	const activeNoteNamesByMidi = useMemo(() => {
		const map: Record<number, string> = {};
		const resolvePitchName = createPitchClassNameResolver(
			activeVoicing.notes,
			analysis.scaleNotes,
			preferFlats,
		);
		for (let m = 60; m <= 83; m++) {
			map[m] = resolvePitchName(mod12(m));
		}
		activeVoicing.midi.forEach((m, i) => {
			if (activeVoicing.notes[i]) map[m] = activeVoicing.notes[i];
		});
		return map;
	}, [activeVoicing, analysis.scaleNotes, preferFlats]);

	const scalePitchClasses = useMemo(
		() => analysis.scaleNotes.map(noteToPitchClass),
		[analysis.scaleNotes],
	);

	const activeChordPitchClasses = useMemo(
		() => new Set(activeVoicing.notes.map(noteToPitchClass)),
		[activeVoicing.notes],
	);

	const activeChordRootPc = useMemo(
		() =>
			activeVoicing.notes[0] ? noteToPitchClass(activeVoicing.notes[0]) : null,
		[activeVoicing.notes],
	);

	const selectKey = useCallback(
		(
			nextSlot: number,
			nextMode: KeyMode,
			options: { playSound?: boolean } = { playSound: true },
		) => {
			stopActiveSequence();
			const normSlot = mod12(nextSlot);
			setSelectedSlot(normSlot);
			setMode(nextMode);
			setAuditionOverride(null);

			if (options.playSound !== false) {
				const nextAnalysis = analyzeKey(
					normSlot,
					nextMode,
					preference,
					slotOverrides,
				);
				const v = toChordVoicing(nextAnalysis.chords[0]);
				playInstrumentChord(
					v.notes,
					v.guitarKind,
					v.midi,
					nextAnalysis.accidentalsCount < 0,
				);
			}
		},
		[
			stopActiveSequence,
			preference,
			slotOverrides,
			toChordVoicing,
			playInstrumentChord,
		],
	);

	const handlePlayTonic = useCallback(() => {
		stopActiveSequence();
		setAuditionOverride(null);
		const v = toChordVoicing(tonicChord);
		playInstrumentChord(
			v.notes,
			v.guitarKind,
			v.midi,
			analysis.accidentalsCount < 0,
		);
	}, [
		stopActiveSequence,
		toChordVoicing,
		tonicChord,
		playInstrumentChord,
		analysis.accidentalsCount,
	]);

	const handleSelectChord = useCallback(
		(chord: DiatonicChord, id: string) => {
			stopActiveSequence();
			const v = toChordVoicing(chord, id);
			setAuditionOverride(v);
			playInstrumentChord(
				v.notes,
				v.guitarKind,
				v.midi,
				analysis.accidentalsCount < 0 || v.notes.some((n) => n.includes("♭")),
			);
		},
		[
			stopActiveSequence,
			toChordVoicing,
			playInstrumentChord,
			analysis.accidentalsCount,
		],
	);

	const handlePlayRootPairChord = useCallback(
		(kind: "major" | "minor") => {
			stopActiveSequence();
			const target = analysis.tonicPair[kind];
			setAuditionOverride({
				id: `tonic-pair-${kind}-${target.symbol}`,
				label: `${target.symbol} (${kind === "major" ? "Major" : "Minor"})`,
				quality: kind,
				guitarKind: kind,
				midi: target.midi,
				notes: target.notes,
				diatonicChord: null,
				wheelHighlight: null,
			});
			playInstrumentChord(
				target.notes,
				kind,
				target.midi,
				target.notes.some((n) => n.includes("♭")),
			);
		},
		[stopActiveSequence, analysis.tonicPair, playInstrumentChord],
	);

	const handlePlayScale = useCallback(() => {
		if (activeScaleIndex !== null) {
			stopActiveSequence();
			return;
		}
		stopActiveSequence();

		const steps = analysis.scaleMidi.map((midi) => ({
			midi: [midi],
			durationSec: 0.34,
		}));

		cancelSequenceRef.current = playStepSequence(steps, {
			preset: soundPreset,
			stepMs: 260,
			onStep: (idx) => {
				setActiveScaleIndex(idx);
				const noteLabel = analysis.scaleNotes[idx % analysis.scaleNotes.length];
				setAuditionOverride({
					id: null,
					label: `${noteLabel} (Degree ${idx === 7 ? "8" : idx + 1})`,
					quality: mode === "major" ? "major" : "minor",
					guitarKind: null,
					midi: [analysis.scaleMidi[idx]],
					notes: [noteLabel],
					diatonicChord: null,
					wheelHighlight: null,
				});
			},
			onDone: () => {
				setActiveScaleIndex(null);
				setAuditionOverride(null);
				cancelSequenceRef.current = null;
			},
		});
	}, [
		activeScaleIndex,
		stopActiveSequence,
		analysis.scaleMidi,
		analysis.scaleNotes,
		soundPreset,
		mode,
	]);

	const handlePlayGuitarNoteSequence = useCallback(
		(midiNotes: number[], stepMs = 220) => {
			if (midiNotes.length === 0) return;
			stopActiveSequence();
			const steps = midiNotes.map((midi, idx) => ({
				midi: [midi],
				durationSec: idx === midiNotes.length - 1 ? 0.65 : 0.34,
			}));
			cancelSequenceRef.current = playStepSequence(steps, {
				preset: soundPreset,
				stepMs,
				onStep: (idx) => {
					setActiveGuitarRunMidi(midiNotes[idx] ?? null);
				},
				onDone: () => {
					setActiveGuitarRunMidi(null);
					cancelSequenceRef.current = null;
				},
			});
		},
		[stopActiveSequence, soundPreset],
	);

	const handleAuditionRelationship = useCallback(
		(direction: "fourth" | "fifth") => {
			stopActiveSequence();
			const targetChord = analysis.chords[direction === "fourth" ? 3 : 4];
			const cadence = [tonicChord, targetChord, tonicChord];

			cancelSequenceRef.current = playStepSequence(
				cadence.map((c) => ({
					midi: resolveDiatonicPlayback(c, analysis.accidentalsCount < 0).midi,
					durationSec: 0.72,
				})),
				{
					preset: soundPreset,
					stepMs: 680,
					arpeggiate,
					spreadSec: instrumentSpreadSec,
					onStep: (idx) => setAuditionOverride(toChordVoicing(cadence[idx])),
					onDone: () => {
						setAuditionOverride(null);
						cancelSequenceRef.current = null;
					},
				},
			);
		},
		[
			stopActiveSequence,
			analysis.chords,
			analysis.accidentalsCount,
			tonicChord,
			resolveDiatonicPlayback,
			toChordVoicing,
			soundPreset,
			arpeggiate,
			instrumentSpreadSec,
		],
	);

	const selectedProgression = useMemo(
		() =>
			analysis.progressions.find((p) => p.id === selectedProgressionId) ??
			analysis.progressions[0],
		[analysis.progressions, selectedProgressionId],
	);

	const progressionGroups = useMemo(
		() =>
			PROGRESSION_CATEGORIES.map((category) => ({
				category,
				items: analysis.progressions.filter((p) => p.category === category),
			})).filter((g) => g.items.length > 0),
		[analysis.progressions],
	);

	const activeRootNote = activeVoicing.notes[0] ?? analysis.root;

	const handleSelectChordVariation = useCallback(
		(kind: GuitarChordKind) => {
			stopActiveSequence();
			const variation = buildChordVariation(activeRootNote, kind, preferFlats);
			const rootPc = noteToPitchClass(activeRootNote);
			const targetSlotMatch =
				CIRCLE_SLOTS.find(
					(s) =>
						noteToPitchClass(
							variation.quality === "minor"
								? s.primary.minorRoot
								: s.primary.majorRoot,
						) === rootPc,
				)?.index ??
				activeVoicing.wheelHighlight?.circleIndex ??
				selectedSlot;

			const spec = CHORD_VARIATION_SPECS.find((s) => s.kind === kind);
			setAuditionOverride({
				id: `var-${activeRootNote}-${kind}`,
				label: variation.symbol,
				quality: variation.quality,
				guitarKind: kind,
				midi: variation.midi,
				notes: variation.notes,
				diatonicChord: null,
				wheelHighlight: {
					circleIndex: targetSlotMatch,
					quality: variation.quality,
					roman: spec ? spec.label : variation.symbol,
					symbol: variation.symbol,
				},
			});

			playInstrumentChord(
				variation.notes,
				kind,
				variation.midi,
				preferFlats || activeRootNote.includes("♭"),
			);
		},
		[
			stopActiveSequence,
			activeRootNote,
			preferFlats,
			activeVoicing.wheelHighlight,
			selectedSlot,
			playInstrumentChord,
		],
	);

	const handlePlayProgression = useCallback(
		(prog: ChordProgression, forcePlay = false) => {
			if (!forcePlay && activeProgressionId === prog.id) {
				stopActiveSequence();
				return;
			}
			stopActiveSequence();
			setSelectedProgressionId(prog.id);
			setActiveProgressionId(prog.id);
			setActiveProgressionStepIdx(0);

			const chordSteps = prog.degrees.map((deg) =>
				deg === -5 && analysis.harmonicMinorV
					? { chord: analysis.harmonicMinorV, suffix: "-harmonic" }
					: { chord: analysis.chords[deg - 1], suffix: "" },
			);

			cancelSequenceRef.current = playStepSequence(
				chordSteps.map(({ chord }) => ({
					midi: resolveDiatonicPlayback(chord, analysis.accidentalsCount < 0)
						.midi,
					durationSec: 0.85,
				})),
				{
					preset: soundPreset,
					stepMs: 780,
					arpeggiate,
					spreadSec: instrumentSpreadSec,
					onStep: (idx) => {
						setActiveProgressionStepIdx(idx);
						const { chord, suffix } = chordSteps[idx];
						setAuditionOverride(
							toChordVoicing(chord, getChordCardId(chord, suffix)),
						);
					},
					onDone: () => {
						setActiveProgressionId(null);
						setActiveProgressionStepIdx(null);
						setAuditionOverride(null);
						cancelSequenceRef.current = null;
					},
				},
			);
		},
		[
			activeProgressionId,
			stopActiveSequence,
			analysis.chords,
			analysis.harmonicMinorV,
			analysis.accidentalsCount,
			resolveDiatonicPlayback,
			toChordVoicing,
			soundPreset,
			arpeggiate,
			instrumentSpreadSec,
		],
	);

	const handleSelectProgressionFromDropdown = useCallback(
		(nextId: string) => {
			setSelectedProgressionId(nextId);
			const nextProg = analysis.progressions.find((p) => p.id === nextId);
			if (nextProg) {
				handlePlayProgression(nextProg, true);
			}
		},
		[analysis.progressions, handlePlayProgression],
	);

	const toColorChordVoicing = useCallback(
		(chord: HarmonyChordSpec): ActiveVoicing => ({
			id: chord.id,
			label: `${chord.symbol} (${chord.romanLabel})`,
			quality: chord.quality,
			guitarKind: chord.guitarKind,
			midi: chord.midi,
			notes: chord.notes,
			diatonicChord: null,
			wheelHighlight: {
				circleIndex: chord.circleIndex,
				quality: chord.quality,
				roman: chord.romanLabel,
				symbol: chord.symbol,
			},
		}),
		[],
	);

	const handleSelectColorChord = useCallback(
		(chord: HarmonyChordSpec) => {
			stopActiveSequence();
			setAuditionOverride(toColorChordVoicing(chord));
			playInstrumentChord(
				chord.notes,
				chord.guitarKind,
				chord.midi,
				chord.root.includes("♭") || chord.notes.some((n) => n.includes("♭")),
			);
		},
		[stopActiveSequence, toColorChordVoicing, playInstrumentChord],
	);

	const handlePlayColorSequence = useCallback(
		(seqId: string, steps: HarmonyChordSpec[]) => {
			if (activeColorSeqId === seqId) {
				stopActiveSequence();
				return;
			}
			stopActiveSequence();
			if (steps.length === 0) return;

			setActiveColorSeqId(seqId);
			setActiveColorStepIdx(0);

			cancelSequenceRef.current = playStepSequence(
				steps.map((chord) => ({
					midi: resolvePlaybackForInstrument(
						chord.notes,
						chord.guitarKind,
						chord.midi,
						chord.root.includes("♭") ||
							chord.notes.some((n) => n.includes("♭")),
					).midi,
					durationSec: 0.85,
				})),
				{
					preset: soundPreset,
					stepMs: 800,
					arpeggiate,
					spreadSec: instrumentSpreadSec,
					onStep: (idx) => {
						setActiveColorStepIdx(idx);
						setAuditionOverride(toColorChordVoicing(steps[idx]));
					},
					onDone: () => {
						setActiveColorSeqId(null);
						setActiveColorStepIdx(null);
						setAuditionOverride(null);
						cancelSequenceRef.current = null;
					},
				},
			);
		},
		[
			activeColorSeqId,
			stopActiveSequence,
			resolvePlaybackForInstrument,
			soundPreset,
			arpeggiate,
			instrumentSpreadSec,
			toColorChordVoicing,
		],
	);

	const handleToggleWalk = useCallback(
		(direction: "fourth" | "fifth") => {
			if (walkingDirection === direction) {
				stopActiveSequence();
				return;
			}
			stopActiveSequence();
			setWalkingDirection(direction);

			const delta = direction === "fifth" ? 1 : -1;
			const steps = Array.from({ length: 13 }, (_, stepIdx) => {
				const slot = mod12(selectedSlot + stepIdx * delta);
				const stepAnalysis = analyzeKey(slot, mode, preference, slotOverrides);
				const pb = resolveDiatonicPlayback(
					stepAnalysis.chords[0],
					stepAnalysis.accidentalsCount < 0,
				);
				return { slot, midi: pb.midi, durationSec: 0.65 };
			});

			cancelSequenceRef.current = playStepSequence(steps, {
				preset: soundPreset,
				stepMs: 650,
				arpeggiate,
				spreadSec: instrumentSpreadSec,
				onStep: (idx) => {
					setSelectedSlot(steps[idx].slot);
					setAuditionOverride(null);
				},
				onDone: () => {
					setWalkingDirection(null);
					cancelSequenceRef.current = null;
				},
			});
		},
		[
			walkingDirection,
			stopActiveSequence,
			selectedSlot,
			mode,
			preference,
			slotOverrides,
			resolveDiatonicPlayback,
			soundPreset,
			arpeggiate,
			instrumentSpreadSec,
		],
	);

	const handleAuditionInstrumentVoicing = useCallback(
		(voicing: GuitarVoicing | BowedVoicing) => {
			playChordNotes(voicing.soundingMidi, {
				preset: soundPreset,
				spreadSec: instrumentSpreadSec,
			});
		},
		[soundPreset, instrumentSpreadSec],
	);

	const handleSelectInstrumentVoicing = useCallback(
		(voicing: GuitarVoicing | BowedVoicing) => {
			setSelectedVoicingByInstrument((prev) => ({
				...prev,
				[instrumentView]: voicing.id,
			}));
			handleAuditionInstrumentVoicing(voicing);
		},
		[instrumentView, handleAuditionInstrumentVoicing],
	);

	const songsForInstrument = useMemo(
		() => getSongsForInstrument(instrumentView),
		[instrumentView],
	);

	const applySongStepHighlight = useCallback(
		(songAnalysis: KeyAnalysis, step: SongChordStep) => {
			const candidateChord = songAnalysis.chords[step.circleDegree - 1] ?? null;
			const isDiatonicCardMatch =
				candidateChord !== null &&
				candidateChord.quality === step.quality &&
				(step.circleSlotIndex === undefined ||
					candidateChord.circleIndex === step.circleSlotIndex) &&
				noteToPitchClass(candidateChord.triadNotes[0] ?? "") ===
					noteToPitchClass(step.chordNotes[0] ?? "");

			const wheelHighlight: WheelChordHighlight | null = isDiatonicCardMatch
				? candidateChord
				: candidateChord && step.circleSlotIndex !== undefined
					? {
							circleIndex: step.circleSlotIndex,
							quality: step.quality,
							roman: step.roman,
							symbol: step.chordSymbol,
						}
					: candidateChord;

			setAuditionOverride({
				id: isDiatonicCardMatch ? getChordCardId(candidateChord) : step.id,
				label: `${step.chordSymbol} (${step.roman})`,
				quality: step.quality,
				guitarKind: step.guitarKind,
				midi: step.displayMidi,
				notes: step.chordNotes,
				diatonicChord: null,
				wheelHighlight,
			});
		},
		[],
	);

	const syncSongStateAtTime = useCallback(
		(
			song: SongExample,
			timeMs: number,
			songAnalysis: KeyAnalysis,
			plan = flattenSongPlaybackSteps(song),
		) => {
			const clampedMs = Math.max(0, Math.min(timeMs, plan.totalDurationMs));
			const { event } = findPlaybackEventAtTime(plan.events, clampedMs);
			updateSongPosition(clampedMs);
			if (event) {
				setActiveSongStepIndex(event.chordStepIndex);
				setActiveSongNoteLabel(event.noteLabel);
				setActiveSongEvent(event);
				applySongStepHighlight(songAnalysis, event.chordStep);
			}
			return clampedMs;
		},
		[applySongStepHighlight, updateSongPosition],
	);

	const prepareSongContext = useCallback(
		(song: SongExample, isPlaying: boolean) => {
			cancelActivePlaybackEngine();
			clearTransientSequences();
			setSelectedVoicingByInstrument({});
			setPlayingSongId(isPlaying ? song.id : null);
			setCuedSongId(song.id);
			setSelectedSlot(song.keySlot);
			setMode(song.keyMode);
		},
		[cancelActivePlaybackEngine, clearTransientSequences],
	);

	const startSongPlaybackFrom = useCallback(
		(song: SongExample, startMs: number) => {
			prepareSongContext(song, true);

			const songAnalysis = analyzeKey(
				song.keySlot,
				song.keyMode,
				preference,
				slotOverrides,
			);
			const plan = flattenSongPlaybackSteps(song);
			const offsetMs =
				startMs >= plan.totalDurationMs - 25 ? 0 : Math.max(0, startMs);

			syncSongStateAtTime(song, offsetMs, songAnalysis, plan);

			cancelSequenceRef.current = playTimedSequence(plan.events, {
				preset: soundPreset,
				arpeggiate: false,
				totalDurationMs: plan.totalDurationMs,
				startOffsetMs: offsetMs,
				onStep: (idx) => {
					const ev = plan.events[idx];
					if (!ev) return;
					setActiveSongStepIndex(ev.chordStepIndex);
					setActiveSongNoteLabel(ev.noteLabel);
					setActiveSongEvent(ev);
					applySongStepHighlight(songAnalysis, ev.chordStep);
				},
				onProgress: (elapsedMs) => {
					if (
						Math.abs(elapsedMs - lastUiProgressMsRef.current) >= 40 ||
						elapsedMs >= plan.totalDurationMs
					) {
						updateSongPosition(elapsedMs);
					}
				},
				onDone: () => {
					cancelSequenceRef.current = null;
					resetSongPlaybackState();
					setAuditionOverride(null);
				},
			});
		},
		[
			prepareSongContext,
			preference,
			slotOverrides,
			syncSongStateAtTime,
			soundPreset,
			applySongStepHighlight,
			updateSongPosition,
			resetSongPlaybackState,
		],
	);

	const handleTogglePlaySong = useCallback(
		(song: SongExample) => {
			if (playingSongId === song.id) {
				cancelActivePlaybackEngine();
				setPlayingSongId(null);
				return;
			}
			if (cuedSongId === song.id) {
				startSongPlaybackFrom(song, songPositionMsRef.current);
				return;
			}
			startSongPlaybackFrom(song, 0);
		},
		[
			playingSongId,
			cuedSongId,
			cancelActivePlaybackEngine,
			startSongPlaybackFrom,
		],
	);

	const handleStopSong = useCallback(() => {
		stopActiveSequence();
		setAuditionOverride(null);
	}, [stopActiveSequence]);

	const handleBeginScrubSong = useCallback(
		(song: SongExample) => {
			prepareSongContext(song, false);
		},
		[prepareSongContext],
	);

	const handleSeekSong = useCallback(
		(song: SongExample, timeMs: number, resumePlayback = false) => {
			if (resumePlayback) {
				startSongPlaybackFrom(song, timeMs);
				return;
			}
			prepareSongContext(song, false);

			const songAnalysis = analyzeKey(
				song.keySlot,
				song.keyMode,
				preference,
				slotOverrides,
			);
			syncSongStateAtTime(song, timeMs, songAnalysis);
		},
		[
			startSongPlaybackFrom,
			prepareSongContext,
			preference,
			slotOverrides,
			syncSongStateAtTime,
		],
	);

	const playSongStepAudition = useCallback(
		(song: SongExample, step: SongChordStep) => {
			const songAnalysis = analyzeKey(
				song.keySlot,
				song.keyMode,
				preference,
				slotOverrides,
			);
			playInstrumentChord(
				step.chordNotes,
				step.guitarKind,
				step.displayMidi,
				songAnalysis.accidentalsCount < 0,
			);
			return songAnalysis;
		},
		[preference, slotOverrides, playInstrumentChord],
	);

	const handleSkipSongBar = useCallback(
		(song: SongExample, deltaBars: number) => {
			if (song.steps.length === 0) return;
			const barStarts = getSongBarStartTimes(song);
			const isSameCuedSong =
				cuedSongId === song.id || playingSongId === song.id;
			const currentIdx = isSameCuedSong
				? (activeSongStepIndex ?? 0)
				: Math.max(
						0,
						song.steps.findIndex((s) => s.id === selectedSongPreviewId),
					);

			// Standard transport behavior: skipping back mid-bar restarts the current bar first
			let targetIdx = currentIdx + deltaBars;
			if (
				deltaBars < 0 &&
				playingSongId === song.id &&
				songPositionMsRef.current - (barStarts[currentIdx] ?? 0) > 700
			) {
				targetIdx = currentIdx;
			}
			targetIdx = Math.max(0, Math.min(song.steps.length - 1, targetIdx));
			const targetMs = barStarts[targetIdx] ?? 0;

			if (playingSongId === song.id) {
				startSongPlaybackFrom(song, targetMs);
				return;
			}

			handleSeekSong(song, targetMs, false);
			const step = song.steps[targetIdx];
			if (step) {
				playSongStepAudition(song, step);
			}
		},
		[
			cuedSongId,
			playingSongId,
			activeSongStepIndex,
			selectedSongPreviewId,
			startSongPlaybackFrom,
			handleSeekSong,
			playSongStepAudition,
		],
	);

	const handlePlayFromSongBar = useCallback(
		(song: SongExample, stepIndex: number) => {
			const barStarts = getSongBarStartTimes(song);
			const targetMs = barStarts[stepIndex] ?? 0;
			startSongPlaybackFrom(song, targetMs);
		},
		[startSongPlaybackFrom],
	);

	const handleSelectSongChordStep = useCallback(
		(song: SongExample, stepIndex: number) => {
			const step = song.steps[stepIndex];
			if (!step) return;

			if (playingSongId === song.id || cuedSongId === song.id) {
				const barStarts = getSongBarStartTimes(song);
				const targetMs = barStarts[stepIndex] ?? 0;
				const shouldPlay = playingSongId === song.id;
				handleSeekSong(song, targetMs, shouldPlay);
				if (!shouldPlay) {
					playSongStepAudition(song, step);
				}
				return;
			}

			stopActiveSequence();
			setSelectedSongPreviewId(step.id);
			setSelectedVoicingByInstrument({});
			setSelectedSlot(song.keySlot);
			setMode(song.keyMode);

			const songAnalysis = playSongStepAudition(song, step);
			applySongStepHighlight(songAnalysis, step);
		},
		[
			playingSongId,
			cuedSongId,
			handleSeekSong,
			playSongStepAudition,
			stopActiveSequence,
			applySongStepHighlight,
		],
	);

	const resetSongContext = useCallback(() => {
		if (playingSongId || cuedSongId) {
			stopActiveSequence();
			setAuditionOverride(null);
		}
		setSelectedSongPreviewId(null);
	}, [playingSongId, cuedSongId, stopActiveSequence]);

	const handleSelectInstrumentTab = useCallback(
		(nextTab: InstrumentTab) => {
			if (nextTab === instrumentView) return;
			resetSongContext();
			setInstrumentView(nextTab);
		},
		[instrumentView, resetSongContext],
	);

	const selectedSongId =
		selectedSongByInstrument[instrumentView] ??
		songsForInstrument[0]?.id ??
		null;

	const handleSelectSong = useCallback(
		(nextSongId: string) => {
			resetSongContext();
			setSelectedSongByInstrument((prev) => ({
				...prev,
				[instrumentView]: nextSongId,
			}));
		},
		[resetSongContext, instrumentView],
	);

	const handleFlipEnharmonic = useCallback(() => {
		if (!analysis.enharmonicTwin) return;
		const nextSide = analysis.enharmonicTwin.side;
		setSlotOverrides((prev) => ({
			...prev,
			[selectedSlot]: nextSide,
		}));
		setAuditionOverride(null);
	}, [analysis.enharmonicTwin, selectedSlot]);

	const handlePreferenceChange = useCallback(
		(nextPref: AccidentalPreference) => {
			setPreference(nextPref);
			setSlotOverrides({});
			setAuditionOverride(null);
		},
		[],
	);

	const handleToggleMute = useCallback(() => {
		if (soundMode === "muted") {
			setSoundMode(lastUnmutedSoundMode);
		} else {
			stopActiveSequence();
			setLastUnmutedSoundMode(soundMode);
			setSoundMode("muted");
		}
	}, [soundMode, lastUnmutedSoundMode, stopActiveSequence]);

	const handleSelectSoundMode = useCallback(
		(nextMode: "auto" | "pad" | "muted") => {
			if (nextMode === "muted") {
				stopActiveSequence();
			} else {
				setLastUnmutedSoundMode(nextMode);
			}
			setSoundMode(nextMode);
		},
		[stopActiveSequence],
	);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement | null)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

			if (e.key === "Escape") {
				if (settingsOpen) {
					setSettingsOpen(false);
					return;
				}
				if (shortcutsOpen) {
					setShortcutsOpen(false);
					return;
				}
				stopActiveSequence();
				setAuditionOverride(null);
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				selectKey(selectedSlot - 1, mode);
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				selectKey(selectedSlot + 1, mode);
			} else if (e.key === "m" || e.key === "M") {
				e.preventDefault();
				selectKey(selectedSlot, mode === "major" ? "minor" : "major");
			} else if (e.key === " " && tag !== "BUTTON") {
				e.preventDefault();
				handlePlayTonic();
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		selectedSlot,
		mode,
		settingsOpen,
		shortcutsOpen,
		selectKey,
		handlePlayTonic,
		stopActiveSequence,
	]);

	useEffect(() => {
		if (!shortcutsOpen && !settingsOpen) return;
		const handlePointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (
				shortcutsOpen &&
				shortcutsContainerRef.current &&
				!shortcutsContainerRef.current.contains(target)
			) {
				setShortcutsOpen(false);
			}
			if (
				settingsOpen &&
				settingsContainerRef.current &&
				!settingsContainerRef.current.contains(target)
			) {
				setSettingsOpen(false);
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [shortcutsOpen, settingsOpen]);

	const scaleDegreeLabels = mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES;
	const activeQualityBadgeClass = getPianoBadgeClass(activeVoicing.quality);
	const isSongActive = playingSongId !== null || cuedSongId !== null;
	const liveSongEvent = isSongActive ? activeSongEvent : null;
	const isVariationActive = Boolean(activeVoicing.id?.startsWith("var-"));
	const showVariations = variationsOpen || isVariationActive;
	const hasCustomSettings = preference !== "standard" || soundMode === "pad";

	return (
		<div className="app-shell">
			<header className="top-bar">
				<div className="brand-cluster">
					<div className="brand-emblem">
						<img
							src="/logo.png"
							alt="Musical Scales logo"
							className="brand-logo-img"
						/>
					</div>
					<div className="brand-copy">
						<h1 className="brand-title">Musical Scales</h1>
						<p className="brand-subtitle">
							Circle of Fifths, Harmony &amp; Instruments
						</p>
					</div>
				</div>

				<div className="header-controls">
					<button
						type="button"
						className={`chip-btn chip-btn-compact ${
							soundMode === "muted" ? "is-muted-pill" : ""
						}`}
						aria-pressed={soundMode === "muted"}
						onClick={handleToggleMute}
						title={
							soundMode === "muted"
								? "Audio muted — click to unmute"
								: `Sound: ${soundMode === "pad" ? "Warm Pad" : INSTRUMENT_META[instrumentView].label} (click to mute)`
						}
					>
						{soundMode === "muted" ? (
							<>
								<IconVolumeMute size={14} />
								<span>Muted</span>
							</>
						) : (
							<>
								<IconVolume size={14} />
								<span>
									{soundMode === "pad"
										? "Pad"
										: INSTRUMENT_META[instrumentView].label}
								</span>
							</>
						)}
					</button>

					<div className="shortcuts-popover-anchor" ref={settingsContainerRef}>
						<button
							type="button"
							className={`icon-square-btn ${
								settingsOpen || hasCustomSettings ? "is-on" : ""
							}`}
							onClick={() => setSettingsOpen((open) => !open)}
							aria-expanded={settingsOpen}
							aria-controls="settings-popover"
							aria-label="Audio and spelling preferences"
							title="Audio & accidental spelling preferences"
						>
							<IconSliders size={15} />
						</button>
						<div
							id="settings-popover"
							className="settings-popover"
							role="dialog"
							aria-label="Audio and spelling preferences"
							hidden={!settingsOpen}
						>
							<div className="settings-popover-group">
								<div className="shortcuts-popover-title">Audio Output</div>
								<div
									className="segmented-control"
									role="group"
									aria-label="Audio sound preset"
								>
									<button
										type="button"
										className={`seg-btn ${soundMode === "auto" ? "is-active" : ""}`}
										onClick={() => handleSelectSoundMode("auto")}
										title="Match active instrument sound (Piano, Acoustic Guitar, Solo Violin, or Bowed Cello)"
									>
										Instrument
									</button>
									<button
										type="button"
										className={`seg-btn ${soundMode === "pad" ? "is-active" : ""}`}
										onClick={() => handleSelectSoundMode("pad")}
									>
										Pad
									</button>
									<button
										type="button"
										className={`seg-btn ${soundMode === "muted" ? "is-active" : ""}`}
										onClick={() => handleSelectSoundMode("muted")}
									>
										Mute
									</button>
								</div>
							</div>

							<div className="settings-popover-group">
								<div className="shortcuts-popover-title">
									Enharmonic Spelling
								</div>
								<div
									className="segmented-control"
									role="group"
									aria-label="Accidental spelling preference"
								>
									{(
										[
											[
												"standard",
												"Standard",
												"Balanced standard spellings (B, F♯, D♭)",
											],
											["sharps", "Sharps ♯", "Prefer sharp keys (B, F♯, C♯)"],
											["flats", "Flats ♭", "Prefer flat keys (C♭, G♭, D♭)"],
										] as const
									).map(([pref, label, title]) => (
										<button
											key={pref}
											type="button"
											className={`seg-btn ${preference === pref ? "is-active" : ""}`}
											onClick={() => handlePreferenceChange(pref)}
											title={title}
										>
											{label}
										</button>
									))}
								</div>
							</div>
						</div>
					</div>

					<div className="shortcuts-popover-anchor" ref={shortcutsContainerRef}>
						<button
							type="button"
							className={`icon-square-btn ${shortcutsOpen ? "is-on" : ""}`}
							onClick={() => setShortcutsOpen((open) => !open)}
							aria-expanded={shortcutsOpen}
							aria-label="Keyboard shortcuts"
							title="Keyboard shortcuts"
						>
							<IconKeyboard size={15} />
						</button>
						{shortcutsOpen && (
							<div
								className="shortcuts-popover"
								role="dialog"
								aria-label="Keyboard shortcuts"
							>
								<div className="shortcuts-popover-title">Shortcuts</div>
								<ul className="shortcuts-list">
									<li>
										<span>Step 4th / 5th</span>
										<span className="kbd-pair">
											<kbd>←</kbd>
											<kbd>→</kbd>
										</span>
									</li>
									<li>
										<span>Play tonic chord</span>
										<kbd>Space</kbd>
									</li>
									<li>
										<span>Major / Minor</span>
										<kbd>M</kbd>
									</li>
									<li>
										<span>Stop playback</span>
										<kbd>Esc</kbd>
									</li>
								</ul>
							</div>
						)}
					</div>

					<button
						type="button"
						className="icon-square-btn"
						onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
						aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
						title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
					>
						{theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
					</button>
				</div>
			</header>

			<main className="studio-layout">
				<div className="wheel-column">
					<CircleWheel
						analysis={analysis}
						selectedSlot={selectedSlot}
						mode={mode}
						preference={preference}
						slotOverrides={slotOverrides}
						highlightedChord={activeVoicing.wheelHighlight}
						highlightedNotes={
							activeVoicing.wheelHighlight ? activeVoicing.notes : null
						}
						rotateToSelected={rotateToSelected}
						isCollapsed={Boolean(collapsedSections["section-circle"])}
						onSelectKey={(slot, nextMode) => selectKey(slot, nextMode)}
						onPlayTonic={handlePlayTonic}
						onStepFourth={() => selectKey(selectedSlot - 1, mode)}
						onStepFifth={() => selectKey(selectedSlot + 1, mode)}
						onToggleRotate={() => setRotateToSelected((r) => !r)}
						onToggleCollapse={() => toggleSectionCollapsed("section-circle")}
					/>

					<FifthsFourthsPanel
						analysis={analysis}
						walkingDirection={walkingDirection}
						isCollapsed={Boolean(collapsedSections["section-neighbors"])}
						onSelectKey={(slot, nextMode) => selectKey(slot, nextMode)}
						onAuditionRelationship={handleAuditionRelationship}
						onToggleWalk={handleToggleWalk}
						onToggleCollapse={() => toggleSectionCollapsed("section-neighbors")}
					/>
				</div>

				<div className="inspector-column">
					<section
						id="section-exploration"
						className="panel-card workspace-card"
						aria-label="Harmony and repertoire workspace"
					>
						<div className="harmony-tabs-bar">
							<div
								className="instrument-tablist"
								role="tablist"
								aria-label="Studio workspace"
							>
								<button
									type="button"
									role="tab"
									id="tab-harmony-chords"
									aria-selected={harmonyTab === "chords"}
									aria-controls="panel-harmony-chords"
									className={`instrument-tab ${
										harmonyTab === "chords" ? "is-active" : ""
									}`}
									onClick={() => setHarmonyTab("chords")}
								>
									Chords &amp; Progressions
								</button>
								<button
									type="button"
									role="tab"
									id="tab-harmony-color"
									aria-selected={harmonyTab === "color"}
									aria-controls="panel-harmony-color"
									className={`instrument-tab ${
										harmonyTab === "color" ? "is-active" : ""
									}`}
									onClick={() => setHarmonyTab("color")}
								>
									<span>Passing &amp; Substitutions</span>
									{activeColorSeqId !== null && (
										<span className="tab-live-dot" aria-hidden="true" />
									)}
								</button>
								<button
									type="button"
									role="tab"
									id="tab-harmony-songs"
									aria-selected={harmonyTab === "songs"}
									aria-controls="section-real-songs"
									className={`instrument-tab ${
										harmonyTab === "songs" ? "is-active" : ""
									}`}
									onClick={() => setHarmonyTab("songs")}
								>
									<IconMusic size={12} />
									<span>Real Songs</span>
									<span className="tab-count-pill">
										{songsForInstrument.length}
									</span>
									{isSongActive && (
										<span className="tab-live-dot" aria-hidden="true" />
									)}
								</button>
							</div>

							<div className="chord-toolbar">
								{harmonyTab === "chords" && (
									<div
										className="segmented-control"
										role="group"
										aria-label="Chord extension"
									>
										<button
											type="button"
											className={`seg-btn ${voicingMode === "triad" ? "is-active" : ""}`}
											onClick={() => setVoicingMode("triad")}
										>
											Triads
										</button>
										<button
											type="button"
											className={`seg-btn ${isSeventh ? "is-active" : ""}`}
											onClick={() => setVoicingMode("seventh")}
										>
											7ths
										</button>
									</div>
								)}

								{harmonyTab !== "songs" && (
									<button
										type="button"
										className={`chip-btn ${arpeggiate ? "is-on" : ""}`}
										aria-pressed={arpeggiate}
										onClick={() => setArpeggiate((a) => !a)}
										title="Roll chord notes sequentially vs. block chord"
									>
										Arpeggio
									</button>
								)}
							</div>
						</div>

						<div
							id="panel-harmony-chords"
							role="tabpanel"
							aria-labelledby="tab-harmony-chords"
							hidden={harmonyTab !== "chords"}
						>
							<div id="section-key-scale" className="hero-top">
								<div className="hero-identity">
									<div className="hero-title-row">
										<h2 id="key-title" className="hero-key-title">
											{analysis.name}
										</h2>

										<div
											className="segmented-control"
											role="group"
											aria-label="Scale mode"
										>
											{(["major", "minor"] as const).map((m) => (
												<button
													key={m}
													type="button"
													className={`seg-btn ${mode === m ? "is-active" : ""}`}
													onClick={() => selectKey(selectedSlot, m)}
												>
													{m === "major" ? "Major" : "Minor"}
												</button>
											))}
										</div>
									</div>

									<div className="hero-meta-row">
										<span className="sig-summary-pill">
											{analysis.signatureLabel}
										</span>
										{analysis.enharmonicTwin && (
											<button
												type="button"
												className="enharmonic-btn"
												onClick={handleFlipEnharmonic}
												title={`Switch to enharmonic spelling ${analysis.enharmonicTwin.name}`}
											>
												<IconSwap size={12} />
												<span>{analysis.enharmonicTwin.shortName}</span>
											</button>
										)}
										{(
											[
												[
													"Relative",
													analysis.relativeKey,
													"Shares the exact same key signature and notes",
												],
												[
													"Parallel",
													analysis.parallelKey,
													"Shares the same tonic root note (±3 steps on circle)",
												],
											] as const
										).map(([relType, targetKey, title]) => (
											<button
												key={relType}
												type="button"
												className="jump-pill"
												onClick={() =>
													selectKey(targetKey.slotIndex, targetKey.mode)
												}
												title={title}
											>
												{relType}: <strong>{targetKey.shortName}</strong>
											</button>
										))}
									</div>
								</div>

								<KeySignatureStaff
									accidentalsCount={analysis.accidentalsCount}
									accidentals={analysis.accidentals}
								/>
							</div>

							<div className="scale-strip-wrap">
								<div className="scale-strip-header">
									<span className="scale-strip-label">
										{analysis.name} Scale
										{analysis.accidentals.length > 0 && (
											<span className="scale-acc-list">
												{" "}
												· {analysis.accidentals.join(" ")}
											</span>
										)}
									</span>
									<button
										type="button"
										className={`pill-action-btn pill-action-sm ${activeScaleIndex !== null ? "is-playing" : ""}`}
										onClick={handlePlayScale}
									>
										{activeScaleIndex !== null ? (
											<>
												<IconStop size={10} /> Stop
											</>
										) : (
											<>
												<IconPlay size={10} /> Play Scale
											</>
										)}
									</button>
								</div>

								<div className="scale-notes-row">
									{analysis.scaleNotes.map((note, idx) => {
										const pc = scalePitchClasses[idx];
										const isInChord = activeChordPitchClasses.has(pc);
										const isChordRoot = activeChordRootPc === pc;
										const isLit =
											activeScaleIndex === idx ||
											(activeScaleIndex === 7 && idx === 0);
										return (
											<button
												key={`${note}-${idx}`}
												type="button"
												className={`scale-note-pill ${idx === 0 ? "is-root" : ""} ${
													isInChord ? "is-in-chord" : ""
												} ${isChordRoot ? "is-chord-root" : ""} ${
													isLit ? "is-lit" : ""
												}`}
												title={
													isChordRoot
														? `${note} · Active chord root`
														: isInChord
															? `${note} · In active chord`
															: `Play ${note}`
												}
												onClick={() =>
													playSingleNote(analysis.scaleMidi[idx], soundPreset)
												}
											>
												<span className="scale-deg">
													{scaleDegreeLabels[idx]}
												</span>
												<span className="scale-note">{note}</span>
											</button>
										);
									})}
								</div>
							</div>

							<div className="chords-matrix-section">
								<div className="sub-section-head">
									<h3 className="sub-section-title">
										Diatonic Chords in {analysis.shortName}
									</h3>
									<span className="sub-section-hint">
										Aligned 1–7 with scale degrees above
									</span>
								</div>
								<ChordsPanel
									analysis={analysis}
									voicingMode={voicingMode}
									activeChordId={activeVoicing.id}
									onSelectChord={handleSelectChord}
									onPlayRootPairChord={handlePlayRootPairChord}
								/>
							</div>

							<div className="progressions-wrap">
								<div className="progressions-bar">
									<div className="progressions-select-group">
										<label
											htmlFor="progression-select"
											className="progressions-title"
										>
											Progressions in {analysis.shortName}
										</label>
										<select
											id="progression-select"
											className="progression-select"
											aria-label={`Choose chord progression in ${analysis.shortName}`}
											value={selectedProgression.id}
											onChange={(e) =>
												handleSelectProgressionFromDropdown(e.target.value)
											}
										>
											{progressionGroups.map((group) => (
												<optgroup key={group.category} label={group.category}>
													{group.items.map((prog) => (
														<option key={prog.id} value={prog.id}>
															{prog.name} — {prog.label}
														</option>
													))}
												</optgroup>
											))}
										</select>
									</div>

									<button
										type="button"
										className={`pill-action-btn pill-action-sm ${
											activeProgressionId === selectedProgression.id
												? "is-playing"
												: ""
										}`}
										onClick={() => handlePlayProgression(selectedProgression)}
										title={selectedProgression.description}
									>
										{activeProgressionId === selectedProgression.id ? (
											<>
												<IconStop size={10} /> Stop
											</>
										) : (
											<>
												<IconPlay size={10} /> Play Progression
											</>
										)}
									</button>
								</div>

								<div className="progression-steps-row">
									<div
										className="progression-steps-chips"
										role="group"
										aria-label={`${selectedProgression.name} chord steps`}
									>
										{selectedProgression.degrees.map((deg, idx) => {
											const isHarmonicV =
												deg === -5 && analysis.harmonicMinorV !== null;
											const stepChord = isHarmonicV
												? analysis.harmonicMinorV!
												: analysis.chords[deg - 1];
											const suffix = isHarmonicV ? "-harmonic" : "";
											const cardId = getChordCardId(stepChord, suffix);
											const isCurrentStep =
												activeProgressionId === selectedProgression.id &&
												activeProgressionStepIdx === idx;
											const symbol = isSeventh
												? stepChord.seventhSymbol
												: stepChord.symbol;
											return (
												<button
													key={`${selectedProgression.id}-step-${idx}`}
													type="button"
													className={`prog-step-chip chord-quality-${stepChord.quality} ${
														isCurrentStep ? "is-active-step" : ""
													}`}
													onClick={() => handleSelectChord(stepChord, cardId)}
													title={`Play ${symbol} (${stepChord.roman})`}
												>
													<span className="prog-step-roman">
														{stepChord.roman}
													</span>
													<span className="prog-step-sym">{symbol}</span>
												</button>
											);
										})}
									</div>
									<span className="progression-desc">
										{selectedProgression.description}
									</span>
								</div>
							</div>
						</div>

						{harmonyTab === "color" && (
							<div
								id="panel-harmony-color"
								role="tabpanel"
								aria-labelledby="tab-harmony-color"
							>
								<ColorHarmonyPanel
									colorAnalysis={colorAnalysis}
									activeChordId={activeVoicing.id}
									activeSequenceId={activeColorSeqId}
									activeSequenceStepIdx={activeColorStepIdx}
									onSelectChord={handleSelectColorChord}
									onPlaySequence={handlePlayColorSequence}
								/>
							</div>
						)}

						<div
							id="section-real-songs"
							role="tabpanel"
							aria-labelledby="tab-harmony-songs"
							hidden={harmonyTab !== "songs"}
						>
							<div className="instrument-tabs-bar songs-instrument-bar">
								<InstrumentTabList
									activeTab={instrumentView}
									onSelect={handleSelectInstrumentTab}
									idPrefix="songs-tab"
									ariaLabel="Real Songs instrument"
									controlsId="panel-real-songs"
								/>
								<span className="instrument-tab-meta">
									{INSTRUMENT_META[instrumentView].repertoire} · Synced with{" "}
									{INSTRUMENT_META[instrumentView].label} below
								</span>
							</div>

							<div
								id="panel-real-songs"
								role="tabpanel"
								aria-labelledby={`songs-tab-${instrumentView}`}
							>
								<SongExamplesPanel
									songs={songsForInstrument}
									selectedSongId={selectedSongId}
									playingSongId={playingSongId}
									cuedSongId={cuedSongId}
									songPositionMs={songPositionMs}
									activeChordStepIndex={activeSongStepIndex}
									activeNoteLabel={activeSongNoteLabel}
									selectedPreviewStepId={selectedSongPreviewId}
									onSelectSong={handleSelectSong}
									onTogglePlaySong={handleTogglePlaySong}
									onStopSong={handleStopSong}
									onSeekSong={handleSeekSong}
									onBeginScrubSong={handleBeginScrubSong}
									onSkipSongBar={handleSkipSongBar}
									onPlayFromSongBar={handlePlayFromSongBar}
									onSelectSongChordStep={handleSelectSongChordStep}
								/>
							</div>
						</div>
					</section>

					<section
						id="section-instruments"
						className="panel-card instrument-card"
						aria-label="Interactive instruments dock"
					>
						<div className="instrument-tabs-bar">
							<InstrumentTabList
								activeTab={instrumentView}
								onSelect={handleSelectInstrumentTab}
								idPrefix="tab"
								ariaLabel="Instrument view"
								controlsId="panel-instrument"
							/>

							<div className="instrument-status-cluster">
								{activeVoicing.label && (
									<span className={`piano-badge ${activeQualityBadgeClass}`}>
										{activeVoicing.label}
									</span>
								)}
								<span className="instrument-notes-pill">
									{activeVoicing.notes.join(" · ")}
								</span>
								<span className="instrument-tab-meta">
									{INSTRUMENT_META[instrumentView].tuning}
								</span>
								<button
									type="button"
									className={`drawer-toggle-btn ${showVariations ? "is-open" : ""}`}
									aria-expanded={showVariations}
									aria-controls="chord-variations-drawer"
									onClick={() => setVariationsOpen((open) => !open)}
									title={`Explore 13 chord variations on root ${activeRootNote}`}
								>
									<span>{activeRootNote} Variations</span>
									<IconChevronDown size={12} />
								</button>
							</div>
						</div>

						<div
							id="chord-variations-drawer"
							className="chord-variations-bar"
							role="group"
							aria-label={`Chord variations for root ${activeRootNote}`}
							hidden={!showVariations}
						>
							<span className="variations-root-label">
								{activeRootNote} Variations:
							</span>
							<div className="variations-pills-scroll">
								{CHORD_VARIATION_SPECS.map((spec) => {
									const isSelected = activeVoicing.guitarKind === spec.kind;
									return (
										<button
											key={spec.kind}
											type="button"
											className={`var-pill var-quality-${spec.quality} ${
												isSelected ? "is-selected" : ""
											}`}
											aria-pressed={isSelected}
											onClick={() => handleSelectChordVariation(spec.kind)}
											title={`${activeRootNote}${spec.suffix} — ${spec.description} (${spec.formula})`}
										>
											{spec.label}
										</button>
									);
								})}
							</div>
						</div>

						<div
							id="panel-instrument"
							role="tabpanel"
							aria-labelledby={`tab-${instrumentView}`}
						>
							{instrumentView === "piano" ? (
								<PianoKeyboard
									activeMidiNotes={activeVoicing.midi}
									activeSongMidi={liveSongEvent?.midi ?? null}
									activeQuality={activeVoicing.quality}
									scalePitchClasses={scalePitchClasses}
									activeNoteNamesByMidi={activeNoteNamesByMidi}
									onPlayNote={(midi) => playSingleNote(midi, soundPreset, 0.72)}
								/>
							) : instrumentView === "guitar" ? (
								<GuitarFretboard
									activeQuality={activeVoicing.quality}
									chordNotes={activeVoicing.notes}
									chordKind={activeVoicing.guitarKind}
									voicings={activeInstrumentVoicings as GuitarVoicing[]}
									selectedVoicing={
										activeInstrumentVoicing as GuitarVoicing | null
									}
									activeSongMidi={liveSongEvent?.midi ?? null}
									activeSongStops={liveSongEvent?.guitarStops ?? null}
									activeRunMidi={activeGuitarRunMidi}
									scalePitchClasses={scalePitchClasses}
									scaleNoteNames={analysis.scaleNotes}
									keyRootName={analysis.scaleNotes[0]}
									keyMode={mode}
									preferFlats={preferFlats}
									onSelectVoicing={handleSelectInstrumentVoicing}
									onStrumVoicing={handleAuditionInstrumentVoicing}
									onPlayFretNote={(midi) =>
										playSingleNote(midi, soundPreset, 0.78)
									}
									onPlayNoteSequence={handlePlayGuitarNoteSequence}
								/>
							) : (
								<BowedFingerboard
									instrument={instrumentView}
									chordLabel={activeVoicing.label}
									chordQuality={activeVoicing.quality}
									chordKind={activeVoicing.guitarKind}
									chordNotes={activeVoicing.notes}
									scaleNotes={analysis.scaleNotes}
									keyRootName={analysis.scaleNotes[0]}
									preferFlats={preferFlats}
									voicings={activeInstrumentVoicings as BowedVoicing[]}
									activeVoicing={activeInstrumentVoicing as BowedVoicing | null}
									activeSongStops={
										(instrumentView === "violin"
											? liveSongEvent?.violinStops
											: liveSongEvent?.celloStops) ?? null
									}
									onSelectVoicing={handleSelectInstrumentVoicing}
									onRollVoicing={handleAuditionInstrumentVoicing}
									onPlayNote={(midi) =>
										playSingleNote(
											midi,
											soundPreset,
											instrumentView === "violin" ? 0.8 : 0.85,
										)
									}
								/>
							)}
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}

export default App;
