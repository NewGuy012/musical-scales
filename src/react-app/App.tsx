import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
	IconChords,
	IconKeyboard,
	IconMoon,
	IconSliders,
	IconSun,
	IconSwap,
	IconVolume,
	IconVolumeMute,
	SegmentedControl,
	SequencePlayButton,
	getQualityClass,
} from "./components/Icons";
import { KeySignatureStaff } from "./components/KeySignatureStaff";
import {
	MusicTeacherSection,
	type PendingMusicXmlPartChoice,
} from "./components/MusicTeacherSection";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { SectionHeader } from "./components/SectionHeader";
import type { MusicXmlPartSummary, XmlNode } from "./musicxml";
import {
	getCatalogEntriesForInstrument,
	getCatalogStubSongsForInstrument,
	loadSongById,
	subscribeSongCatalogUpdates,
} from "./songs/songCatalog";
import {
	FlattenedSongStep,
	INSTRUMENT_TABS,
	InstrumentTab,
	SongChordStep,
	SongExample,
	SongSubBarChord,
	clampPlaybackSpeed,
	findPlaybackEventAtTime,
	flattenSongPlaybackSteps,
	getSongBarStartTimes,
	hydrateSong,
	scaleSongExampleSpeed,
	slugifyId,
} from "./songs/songRuntime";
import { BowedVoicing, getBowedVoicings } from "./theory/celloFingerboard";
import {
	HarmonyChordSpec,
	analyzeColorHarmony,
} from "./theory/chromaticHarmony";
import {
	AccidentalPreference,
	ChordProgression,
	ChordQuality,
	DiatonicChord,
	EnharmonicSide,
	KeyAnalysis,
	KeyMode,
	ProgressionCategory,
	analyzeKey,
	getChordCardId,
	mod12,
	noteToPitchClass,
	pcToCircleIndex,
	tryNoteToPitchClass,
} from "./theory/circleOfFifths";
import {
	CHORD_VARIATION_BY_KIND,
	CHORD_VARIATION_SPECS,
	GuitarChordKind,
	GuitarVoicing,
	buildChordVariation,
	createPitchClassNameResolver,
	getGuitarVoicings,
	inferGuitarChordKind,
} from "./theory/guitarFretboard";
import logoUrl from "../../public/logo.png";
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

type ActiveSequenceState =
	| { kind: "scale"; stepIndex: number }
	| { kind: "progression"; id: string; stepIndex: number }
	| { kind: "walk"; direction: "fourth" | "fifth" }
	| { kind: "guitarRun"; midi: number }
	| { kind: "color"; id: string; stepIndex: number }
	| null;

interface SongPlaybackState {
	playingId: string | null;
	cuedId: string | null;
	positionMs: number;
	stepIndex: number | null;
	noteLabel: string | null;
	event: FlattenedSongStep | null;
}

const INITIAL_SONG_PLAYBACK: SongPlaybackState = {
	playingId: null,
	cuedId: null,
	positionMs: 0,
	stepIndex: null,
	noteLabel: null,
	event: null,
};

const MAJOR_DEGREES = ["1", "2", "3", "4", "5", "6", "7"] as const;
const MINOR_DEGREES = ["1", "2", "♭3", "4", "5", "♭6", "♭7"] as const;
const PROGRESSION_CATEGORIES: readonly ProgressionCategory[] = [
	"Classics & Cadences",
	"Pop & Rock",
	"Jazz & Circle",
	"Classical & Sequence",
] as const;

const MAX_MUSICXML_FILE_BYTES = 10 * 1024 * 1024;

type MainSectionId =
	| "section-circle"
	| "section-neighbors"
	| "section-chords"
	| "section-music-teacher";
type WorkspaceTab = "chords" | "color";

const INSTRUMENT_META: Record<
	InstrumentTab,
	{ label: string; tuning: string }
> = {
	piano: { label: "Piano", tuning: "C4–B5" },
	guitar: { label: "Guitar", tuning: "E A D G B e" },
	violin: { label: "Violin", tuning: "G3–D4–A4–E5" },
	cello: { label: "Cello", tuning: "C2–G2–D3–A3" },
};

const useIsomorphicLayoutEffect =
	typeof document !== "undefined" ? useLayoutEffect : useEffect;

function InstrumentTabList({
	activeTab,
	onSelect,
	idPrefix,
	ariaLabel,
	controlsId,
}: {
	activeTab: InstrumentTab;
	onSelect: (tabId: InstrumentTab, anchorEl?: HTMLElement | null) => void;
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
					onClick={(e) => onSelect(tabId, e.currentTarget)}
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
	const [openPopover, setOpenPopover] = useState<
		"settings" | "shortcuts" | null
	>(null);
	const settingsOpen = openPopover === "settings";
	const shortcutsOpen = openPopover === "shortcuts";
	const settingsContainerRef = useRef<HTMLDivElement | null>(null);
	const shortcutsContainerRef = useRef<HTMLDivElement | null>(null);
	const soundPreset: SoundPreset =
		soundMode === "auto" ? instrumentView : soundMode;
	const [selectedVoicingByInstrument, setSelectedVoicingByInstrument] =
		useState<Partial<Record<InstrumentTab, string>>>({});

	const [auditionOverride, setAuditionOverride] =
		useState<ActiveVoicing | null>(null);
	const [selectedProgressionId, setSelectedProgressionId] =
		useState<string>("maj-1451");
	const [activeSequence, setActiveSequence] =
		useState<ActiveSequenceState>(null);
	const activeScaleIndex =
		activeSequence?.kind === "scale" ? activeSequence.stepIndex : null;
	const activeProgressionId =
		activeSequence?.kind === "progression" ? activeSequence.id : null;
	const activeProgressionStepIdx =
		activeSequence?.kind === "progression" ? activeSequence.stepIndex : null;
	const walkingDirection =
		activeSequence?.kind === "walk" ? activeSequence.direction : null;
	const activeGuitarRunMidi =
		activeSequence?.kind === "guitarRun" ? activeSequence.midi : null;
	const activeColorSeqId =
		activeSequence?.kind === "color" ? activeSequence.id : null;
	const activeColorStepIdx =
		activeSequence?.kind === "color" ? activeSequence.stepIndex : null;

	const [songPlayback, setSongPlayback] = useState<SongPlaybackState>(
		INITIAL_SONG_PLAYBACK,
	);
	const {
		playingId: playingSongId,
		cuedId: cuedSongId,
		positionMs: songPositionMs,
		stepIndex: activeSongStepIndex,
		noteLabel: activeSongNoteLabel,
		event: activeSongEvent,
	} = songPlayback;
	const [selectedSongPreviewId, setSelectedSongPreviewId] = useState<
		string | null
	>(null);
	const [selectedSongByInstrument, setSelectedSongByInstrument] = useState<
		Partial<Record<InstrumentTab, string>>
	>({});
	const [loadedSongsById, setLoadedSongsById] = useState<
		Record<string, SongExample>
	>({});
	const [localPreviewSongs, setLocalPreviewSongs] = useState<SongExample[]>([]);
	const [isImportingMusicXml, setIsImportingMusicXml] = useState(false);
	const [musicXmlImportError, setMusicXmlImportError] = useState<string | null>(
		null,
	);
	const [pendingMusicXmlFile, setPendingMusicXmlFile] = useState<{
		fileName: string;
		xmlRoot: XmlNode;
		title: string;
		parts: MusicXmlPartSummary[];
		selectedPartId: string;
		instrument: InstrumentTab;
		localId: string;
	} | null>(null);
	const [songPlaybackSpeed, setSongPlaybackSpeed] = useState<number>(1);
	const [collapsedSections, setCollapsedSections] = useState<
		Partial<Record<MainSectionId, boolean>>
	>({
		"section-neighbors": true,
		"section-chords": true,
		"section-music-teacher": true,
	});

	const cancelSequenceRef = useRef<(() => void) | null>(null);
	const songPositionMsRef = useRef<number>(0);
	const lastUiProgressMsRef = useRef<number>(-100);
	const songPlayRequestIdRef = useRef<number>(0);
	const importRequestIdRef = useRef<number>(0);
	const pendingInstrumentAnchorRef = useRef<{
		element: HTMLElement;
		top: number;
	} | null>(null);

	const toggleSectionCollapsed = useCallback((sectionId: MainSectionId) => {
		setCollapsedSections((prev) => ({
			...prev,
			[sectionId]: !prev[sectionId],
		}));
	}, []);

	const updateSongPosition = useCallback((ms: number) => {
		songPositionMsRef.current = ms;
		lastUiProgressMsRef.current = ms;
		setSongPlayback((prev) => ({ ...prev, positionMs: ms }));
	}, []);

	const analysis = useMemo(
		() => analyzeKey(selectedSlot, mode, preference, slotOverrides),
		[selectedSlot, mode, preference, slotOverrides],
	);
	const analyzeSongKey = useCallback(
		(song: SongExample) =>
			analyzeKey(song.keySlot, song.keyMode, preference, slotOverrides),
		[preference, slotOverrides],
	);
	const colorAnalysis = useMemo(
		() => analyzeColorHarmony(analysis),
		[analysis],
	);

	const cancelActivePlaybackEngine = useCallback(() => {
		songPlayRequestIdRef.current += 1;
		if (cancelSequenceRef.current) {
			cancelSequenceRef.current();
			cancelSequenceRef.current = null;
		} else {
			stopAllAudio();
		}
	}, []);

	const clearTransientSequences = useCallback(() => {
		setActiveSequence(null);
		setSelectedSongPreviewId(null);
	}, []);

	const resetSongPlaybackState = useCallback(() => {
		songPositionMsRef.current = 0;
		lastUiProgressMsRef.current = -100;
		setSongPlayback(INITIAL_SONG_PLAYBACK);
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

	const runStepSequence = useCallback(
		(
			steps: { midi: number[]; durationSec: number }[],
			options: {
				stepMs: number;
				arpeggiate?: boolean;
				clearOverrideOnDone?: boolean;
				onStep: (stepIndex: number) => void;
			},
		) => {
			cancelSequenceRef.current = playStepSequence(steps, {
				preset: soundPreset,
				stepMs: options.stepMs,
				arpeggiate: options.arpeggiate,
				spreadSec: options.arpeggiate ? instrumentSpreadSec : undefined,
				onStep: options.onStep,
				onDone: () => {
					setActiveSequence(null);
					if (options.clearOverrideOnDone) setAuditionOverride(null);
					cancelSequenceRef.current = null;
				},
			});
		},
		[soundPreset, instrumentSpreadSec],
	);

	const resolveProgressionStep = useCallback(
		(deg: number) =>
			deg === -5 && analysis.harmonicMinorV !== null
				? { chord: analysis.harmonicMinorV, suffix: "-harmonic" }
				: { chord: analysis.chords[deg - 1], suffix: "" },
		[analysis.chords, analysis.harmonicMinorV],
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

		runStepSequence(steps, {
			stepMs: 260,
			clearOverrideOnDone: true,
			onStep: (idx) => {
				setActiveSequence({ kind: "scale", stepIndex: idx });
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
		});
	}, [
		activeScaleIndex,
		stopActiveSequence,
		runStepSequence,
		analysis.scaleMidi,
		analysis.scaleNotes,
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
			runStepSequence(steps, {
				stepMs,
				onStep: (idx) => {
					const midi = midiNotes[idx];
					setActiveSequence(
						midi !== undefined ? { kind: "guitarRun", midi } : null,
					);
				},
			});
		},
		[stopActiveSequence, runStepSequence],
	);

	const handleAuditionRelationship = useCallback(
		(direction: "fourth" | "fifth") => {
			stopActiveSequence();
			const targetChord = analysis.chords[direction === "fourth" ? 3 : 4];
			const cadence = [tonicChord, targetChord, tonicChord];

			runStepSequence(
				cadence.map((c) => ({
					midi: resolveDiatonicPlayback(c, analysis.accidentalsCount < 0).midi,
					durationSec: 0.72,
				})),
				{
					stepMs: 680,
					arpeggiate,
					clearOverrideOnDone: true,
					onStep: (idx) => setAuditionOverride(toChordVoicing(cadence[idx])),
				},
			);
		},
		[
			stopActiveSequence,
			runStepSequence,
			analysis.chords,
			analysis.accidentalsCount,
			tonicChord,
			resolveDiatonicPlayback,
			toChordVoicing,
			arpeggiate,
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
			const targetSlotMatch = pcToCircleIndex(
				noteToPitchClass(activeRootNote),
				variation.quality,
			);

			const spec = CHORD_VARIATION_BY_KIND[kind];
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
		[stopActiveSequence, activeRootNote, preferFlats, playInstrumentChord],
	);

	const handlePlayProgression = useCallback(
		(prog: ChordProgression, forcePlay = false) => {
			if (!forcePlay && activeProgressionId === prog.id) {
				stopActiveSequence();
				return;
			}
			stopActiveSequence();
			setSelectedProgressionId(prog.id);
			setActiveSequence({ kind: "progression", id: prog.id, stepIndex: 0 });

			const chordSteps = prog.degrees.map(resolveProgressionStep);

			runStepSequence(
				chordSteps.map(({ chord }) => ({
					midi: resolveDiatonicPlayback(chord, analysis.accidentalsCount < 0)
						.midi,
					durationSec: 0.85,
				})),
				{
					stepMs: 780,
					arpeggiate,
					clearOverrideOnDone: true,
					onStep: (idx) => {
						setActiveSequence({
							kind: "progression",
							id: prog.id,
							stepIndex: idx,
						});
						const { chord, suffix } = chordSteps[idx];
						setAuditionOverride(
							toChordVoicing(chord, getChordCardId(chord, suffix)),
						);
					},
				},
			);
		},
		[
			activeProgressionId,
			stopActiveSequence,
			runStepSequence,
			resolveProgressionStep,
			analysis.accidentalsCount,
			resolveDiatonicPlayback,
			toChordVoicing,
			arpeggiate,
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

			setActiveSequence({ kind: "color", id: seqId, stepIndex: 0 });

			runStepSequence(
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
					stepMs: 800,
					arpeggiate,
					clearOverrideOnDone: true,
					onStep: (idx) => {
						setActiveSequence({ kind: "color", id: seqId, stepIndex: idx });
						setAuditionOverride(toColorChordVoicing(steps[idx]));
					},
				},
			);
		},
		[
			activeColorSeqId,
			stopActiveSequence,
			runStepSequence,
			resolvePlaybackForInstrument,
			arpeggiate,
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
			setActiveSequence({ kind: "walk", direction });

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

			runStepSequence(steps, {
				stepMs: 650,
				arpeggiate,
				onStep: (idx) => {
					setSelectedSlot(steps[idx].slot);
					setAuditionOverride(null);
				},
			});
		},
		[
			walkingDirection,
			stopActiveSequence,
			runStepSequence,
			selectedSlot,
			mode,
			preference,
			slotOverrides,
			resolveDiatonicPlayback,
			arpeggiate,
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

	const songsForInstrument = useMemo(() => {
		const localSongs = localPreviewSongs
			.filter((s) => s.instruments.includes(instrumentView))
			.map((s) => scaleSongExampleSpeed(s, songPlaybackSpeed));
		const catalogSongs = getCatalogStubSongsForInstrument(instrumentView).map(
			(stub) => {
				const loaded = Object.hasOwn(loadedSongsById, stub.id)
					? loadedSongsById[stub.id]
					: undefined;
				return loaded ? scaleSongExampleSpeed(loaded, songPlaybackSpeed) : stub;
			},
		);
		return [...localSongs, ...catalogSongs];
	}, [instrumentView, localPreviewSongs, loadedSongsById, songPlaybackSpeed]);

	const otherInstrumentsWithSongs = useMemo(
		() =>
			INSTRUMENT_TABS.filter((tab) => tab !== instrumentView)
				.map((tab) => {
					const localCount = localPreviewSongs.filter((s) =>
						s.instruments.includes(tab),
					).length;
					const catalogCount = getCatalogEntriesForInstrument(tab).length;
					return {
						instrument: tab,
						label: INSTRUMENT_META[tab].label,
						count: localCount + catalogCount,
					};
				})
				.filter((item) => item.count > 0),
		[instrumentView, localPreviewSongs],
	);

	const ensureSongLoaded = useCallback(
		async (songId: string): Promise<SongExample> => {
			const localMatch = localPreviewSongs.find((s) => s.id === songId);
			if (localMatch)
				return scaleSongExampleSpeed(localMatch, songPlaybackSpeed);
			const cached = Object.hasOwn(loadedSongsById, songId)
				? loadedSongsById[songId]
				: undefined;
			if (cached) return scaleSongExampleSpeed(cached, songPlaybackSpeed);
			const loaded = await loadSongById(songId);
			setLoadedSongsById((prev) =>
				Object.hasOwn(prev, songId) ? prev : { ...prev, [songId]: loaded },
			);
			return scaleSongExampleSpeed(loaded, songPlaybackSpeed);
		},
		[localPreviewSongs, loadedSongsById, songPlaybackSpeed],
	);

	const applySongStepHighlight = useCallback(
		(
			songAnalysis: KeyAnalysis,
			step: SongChordStep,
			subBarChord?: SongSubBarChord,
		) => {
			const effectiveSymbol = subBarChord?.chordSymbol ?? step.chordSymbol;
			const effectiveRoman = subBarChord?.roman ?? step.roman;
			const effectiveQuality = subBarChord?.quality ?? step.quality;
			const effectiveKind = subBarChord?.guitarKind ?? step.guitarKind;
			const effectiveNotes = subBarChord?.chordNotes ?? step.chordNotes;
			const effectiveDegree = subBarChord?.circleDegree ?? step.circleDegree;
			const effectiveSlotIndex =
				subBarChord?.circleSlotIndex ?? step.circleSlotIndex;

			const candidateChord = songAnalysis.chords[effectiveDegree - 1] ?? null;
			const candidateRootPc = tryNoteToPitchClass(
				candidateChord?.triadNotes[0] ?? "",
			);
			const effectiveRootPc = tryNoteToPitchClass(effectiveNotes[0] ?? "");
			const isDiatonicCardMatch =
				candidateChord !== null &&
				candidateChord.quality === effectiveQuality &&
				(effectiveSlotIndex === undefined ||
					candidateChord.circleIndex === effectiveSlotIndex) &&
				candidateRootPc !== null &&
				candidateRootPc === effectiveRootPc;

			const wheelHighlight: WheelChordHighlight | null = isDiatonicCardMatch
				? candidateChord
				: candidateChord && effectiveSlotIndex !== undefined
					? {
							circleIndex: effectiveSlotIndex,
							quality: effectiveQuality,
							roman: effectiveRoman,
							symbol: effectiveSymbol,
						}
					: candidateChord;

			setAuditionOverride({
				id: isDiatonicCardMatch ? getChordCardId(candidateChord) : step.id,
				label: `${effectiveSymbol} (${effectiveRoman})`,
				quality: effectiveQuality,
				guitarKind: effectiveKind,
				midi: step.displayMidi,
				notes: effectiveNotes,
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
			songPositionMsRef.current = clampedMs;
			lastUiProgressMsRef.current = clampedMs;
			setSongPlayback((prev) => ({
				...prev,
				positionMs: clampedMs,
				...(event
					? {
							stepIndex: event.chordStepIndex,
							noteLabel: event.noteLabel,
							event,
						}
					: {}),
			}));
			if (event) {
				applySongStepHighlight(
					songAnalysis,
					event.chordStep,
					event.subBarChord,
				);
			}
			return clampedMs;
		},
		[applySongStepHighlight],
	);

	const prepareSongContext = useCallback(
		(song: SongExample, isPlaying: boolean) => {
			cancelActivePlaybackEngine();
			clearTransientSequences();
			setSelectedVoicingByInstrument({});
			setSongPlayback((prev) => ({
				...prev,
				playingId: isPlaying ? song.id : null,
				cuedId: song.id,
			}));
			setSelectedSlot(song.keySlot);
			setMode(song.keyMode);
		},
		[cancelActivePlaybackEngine, clearTransientSequences],
	);

	const startSongPlaybackFrom = useCallback(
		(song: SongExample, startMs: number) => {
			prepareSongContext(song, true);

			const songAnalysis = analyzeSongKey(song);
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
					setSongPlayback((prev) => ({
						...prev,
						stepIndex: ev.chordStepIndex,
						noteLabel: ev.noteLabel,
						event: ev,
					}));
					applySongStepHighlight(songAnalysis, ev.chordStep, ev.subBarChord);
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
			analyzeSongKey,
			syncSongStateAtTime,
			soundPreset,
			applySongStepHighlight,
			updateSongPosition,
			resetSongPlaybackState,
		],
	);

	const handleTogglePlaySong = useCallback(
		(song: SongExample) => {
			const requestId = ++songPlayRequestIdRef.current;
			if (playingSongId === song.id) {
				cancelActivePlaybackEngine();
				setSongPlayback((prev) => ({ ...prev, playingId: null }));
				return;
			}
			const resumePos = cuedSongId === song.id ? songPositionMsRef.current : 0;
			const launch = async () => {
				try {
					const ready =
						song.steps.length > 0 ? song : await ensureSongLoaded(song.id);
					if (songPlayRequestIdRef.current !== requestId) return;
					startSongPlaybackFrom(ready, resumePos);
				} catch (err) {
					if (songPlayRequestIdRef.current === requestId) {
						setMusicXmlImportError(
							err instanceof Error ? err.message : "Failed to load song.",
						);
					}
				}
			};
			void launch();
		},
		[
			playingSongId,
			cuedSongId,
			cancelActivePlaybackEngine,
			ensureSongLoaded,
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
			if (song.steps.length === 0) return;
			if (resumePlayback) {
				startSongPlaybackFrom(song, timeMs);
				return;
			}
			prepareSongContext(song, false);
			syncSongStateAtTime(song, timeMs, analyzeSongKey(song));
		},
		[
			startSongPlaybackFrom,
			prepareSongContext,
			analyzeSongKey,
			syncSongStateAtTime,
		],
	);

	const playSongStepAudition = useCallback(
		(song: SongExample, step: SongChordStep) => {
			const songAnalysis = analyzeSongKey(song);
			playInstrumentChord(
				step.chordNotes,
				step.guitarKind,
				step.displayMidi,
				songAnalysis.accidentalsCount < 0,
			);
			return songAnalysis;
		},
		[analyzeSongKey, playInstrumentChord],
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
		(nextTab: InstrumentTab, anchorEl?: HTMLElement | null) => {
			if (nextTab === instrumentView) return;
			if (typeof window !== "undefined" && anchorEl) {
				const target =
					anchorEl.closest<HTMLElement>(
						".songs-instrument-bar, #section-music-teacher, #section-instruments",
					) ?? anchorEl;
				pendingInstrumentAnchorRef.current = {
					element: target,
					top: target.getBoundingClientRect().top,
				};
			}
			resetSongContext();
			setInstrumentView(nextTab);
		},
		[instrumentView, resetSongContext],
	);

	useIsomorphicLayoutEffect(() => {
		const anchor = pendingInstrumentAnchorRef.current;
		pendingInstrumentAnchorRef.current = null;
		if (!anchor || typeof window === "undefined") return;
		if (!anchor.element.isConnected) return;
		const nextTop = anchor.element.getBoundingClientRect().top;
		const delta = nextTop - anchor.top;
		if (Math.abs(delta) > 0.5) {
			window.scrollTo(window.scrollX, Math.max(0, window.scrollY + delta));
		}
	}, [instrumentView]);

	const selectedSongId = useMemo(() => {
		const candidate = selectedSongByInstrument[instrumentView];
		if (candidate && songsForInstrument.some((s) => s.id === candidate)) {
			return candidate;
		}
		return songsForInstrument[0]?.id ?? null;
	}, [selectedSongByInstrument, instrumentView, songsForInstrument]);

	useEffect(
		() =>
			subscribeSongCatalogUpdates(() => {
				setLoadedSongsById({});
			}),
		[],
	);

	useEffect(() => {
		if (
			!selectedSongId ||
			Object.hasOwn(loadedSongsById, selectedSongId) ||
			localPreviewSongs.some((s) => s.id === selectedSongId)
		) {
			return;
		}
		let cancelled = false;
		void loadSongById(selectedSongId)
			.then((loaded) => {
				if (!cancelled) {
					setLoadedSongsById((prev) =>
						Object.hasOwn(prev, selectedSongId)
							? prev
							: { ...prev, [selectedSongId]: loaded },
					);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [selectedSongId, loadedSongsById, localPreviewSongs]);

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

	const applyLocalPreviewSong = useCallback(
		(
			songDoc: Parameters<typeof hydrateSong>[0],
			targetInstrument: InstrumentTab,
		) => {
			const hydrated: SongExample = {
				...hydrateSong(songDoc),
				isLocalPreview: true,
			};
			resetSongContext();
			setLocalPreviewSongs((prev) => [
				hydrated,
				...prev.filter((s) => s.id !== hydrated.id),
			]);
			setInstrumentView(targetInstrument);
			setSelectedSongByInstrument((prev) => ({
				...prev,
				[targetInstrument]: hydrated.id,
			}));
			setCollapsedSections((prev) => ({
				...prev,
				"section-music-teacher": false,
			}));
		},
		[resetSongContext],
	);

	const runImportTask = useCallback(
		async (fallbackMsg: string, task: (requestId: number) => Promise<void>) => {
			const requestId = ++importRequestIdRef.current;
			setIsImportingMusicXml(true);
			setMusicXmlImportError(null);
			try {
				await task(requestId);
			} catch (err) {
				if (importRequestIdRef.current === requestId) {
					setMusicXmlImportError(
						err instanceof Error ? err.message : fallbackMsg,
					);
				}
			} finally {
				if (importRequestIdRef.current === requestId) {
					setIsImportingMusicXml(false);
				}
			}
		},
		[],
	);

	const handleImportMusicXmlFile = useCallback(
		async (file: File) => {
			const lowerName = file.name.toLowerCase();
			if (
				!lowerName.endsWith(".musicxml") &&
				!lowerName.endsWith(".xml") &&
				!lowerName.endsWith(".mxl")
			) {
				setMusicXmlImportError(
					`Unsupported file "${file.name}". Please select a .musicxml, .xml, or .mxl file.`,
				);
				return;
			}
			if (file.size > MAX_MUSICXML_FILE_BYTES) {
				setMusicXmlImportError(
					`File "${file.name}" exceeds the 10 MB browser preview limit.`,
				);
				return;
			}
			await runImportTask(
				"Failed to parse MusicXML file.",
				async (requestId) => {
					const bytes = new Uint8Array(await file.arrayBuffer());
					const { compileMusicXml, parseMusicXmlDocument } =
						await import("./musicxml");
					const xmlRoot = await parseMusicXmlDocument(bytes);
					if (importRequestIdRef.current !== requestId) return;

					const slugBase = slugifyId(
						file.name.replace(/\.(musicxml|xml|mxl)$/i, ""),
						"musicxml",
					);
					const localId = `local-${slugBase}-${Date.now().toString(36)}`;
					const { songDoc, selectedPart, availableParts } =
						await compileMusicXml(xmlRoot, {
							id: localId,
							preferredInstrument: instrumentView,
						});
					if (importRequestIdRef.current !== requestId) return;

					const playableParts = availableParts.filter(
						(p) => !p.isPercussion && p.noteCount > 0,
					);
					const pool =
						playableParts.length > 0 ? playableParts : availableParts;
					const targetInstrument = songDoc.instruments[0] ?? instrumentView;

					applyLocalPreviewSong(songDoc, targetInstrument);

					if (pool.length > 1) {
						setPendingMusicXmlFile({
							fileName: file.name,
							xmlRoot,
							title: songDoc.title,
							parts: pool,
							selectedPartId: selectedPart.partId,
							instrument: targetInstrument,
							localId,
						});
					} else {
						setPendingMusicXmlFile(null);
					}
				},
			);
		},
		[instrumentView, applyLocalPreviewSong, runImportTask],
	);

	const handleConfirmPartChoice = useCallback(
		async (partId: string, targetInstrument: InstrumentTab) => {
			if (!pendingMusicXmlFile) return;
			await runImportTask(
				"Failed to load selected MusicXML part.",
				async (requestId) => {
					const { compileMusicXml } = await import("./musicxml");
					const { songDoc } = await compileMusicXml(
						pendingMusicXmlFile.xmlRoot,
						{
							id: pendingMusicXmlFile.localId,
							partId,
							instrument: targetInstrument,
						},
					);
					if (importRequestIdRef.current !== requestId) return;

					applyLocalPreviewSong(songDoc, targetInstrument);
					setPendingMusicXmlFile((prev) =>
						prev
							? {
									...prev,
									selectedPartId: partId,
									instrument: targetInstrument,
								}
							: null,
					);
				},
			);
		},
		[pendingMusicXmlFile, applyLocalPreviewSong, runImportTask],
	);

	const handleRemoveLocalPreview = useCallback(
		(songId: string) => {
			if (playingSongId === songId || cuedSongId === songId) {
				stopActiveSequence();
				setAuditionOverride(null);
			}
			setLocalPreviewSongs((prev) => prev.filter((s) => s.id !== songId));
			setPendingMusicXmlFile((prev) =>
				prev?.localId === songId ? null : prev,
			);
		},
		[playingSongId, cuedSongId, stopActiveSequence],
	);

	const handleChangePlaybackSpeed = useCallback(
		(nextSpeed: number) => {
			const clamped = clampPlaybackSpeed(nextSpeed);
			if (Math.abs(clamped - songPlaybackSpeed) < 0.001) return;
			const ratio = songPlaybackSpeed / clamped;
			setSongPlaybackSpeed(clamped);

			const activeId = playingSongId ?? cuedSongId;
			if (!activeId) return;
			const baseSong =
				localPreviewSongs.find((s) => s.id === activeId) ??
				(Object.hasOwn(loadedSongsById, activeId)
					? loadedSongsById[activeId]
					: undefined);
			if (!baseSong) return;
			const scaledSong = scaleSongExampleSpeed(baseSong, clamped);
			const scaledPosMs = Math.max(0, songPositionMsRef.current * ratio);

			if (playingSongId === activeId) {
				startSongPlaybackFrom(scaledSong, scaledPosMs);
			} else if (cuedSongId === activeId) {
				syncSongStateAtTime(
					scaledSong,
					scaledPosMs,
					analyzeSongKey(scaledSong),
				);
			}
		},
		[
			songPlaybackSpeed,
			playingSongId,
			cuedSongId,
			localPreviewSongs,
			loadedSongsById,
			startSongPlaybackFrom,
			analyzeSongKey,
			syncSongStateAtTime,
		],
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
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			const tag = el?.tagName;
			if (
				tag === "INPUT" ||
				tag === "TEXTAREA" ||
				tag === "SELECT" ||
				el?.isContentEditable
			) {
				return;
			}

			if (e.key === "Escape") {
				if (openPopover !== null) {
					setOpenPopover(null);
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
		openPopover,
		selectKey,
		handlePlayTonic,
		stopActiveSequence,
	]);

	useEffect(() => {
		if (openPopover === null) return;
		const handlePointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			const activeContainer =
				openPopover === "settings"
					? settingsContainerRef.current
					: shortcutsContainerRef.current;
			if (activeContainer && !activeContainer.contains(target)) {
				setOpenPopover(null);
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [openPopover]);

	const scaleDegreeLabels = mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES;
	const activeQualityBadgeClass = getQualityClass(activeVoicing.quality);
	const isSongActive = playingSongId !== null || cuedSongId !== null;
	const liveSongEvent = isSongActive ? activeSongEvent : null;
	const activeSongForInstrument =
		isSongActive || selectedSongPreviewId !== null
			? (songsForInstrument.find(
					(s) => s.id === (playingSongId ?? cuedSongId ?? selectedSongId),
				) ?? null)
			: null;
	const isVariationActive = Boolean(activeVoicing.id?.startsWith("var-"));
	const showVariations = variationsOpen || isVariationActive;
	const hasCustomSettings = preference !== "standard" || soundMode === "pad";
	const isChordsCollapsed = Boolean(collapsedSections["section-chords"]);
	const isMusicTeacherCollapsed = Boolean(
		collapsedSections["section-music-teacher"],
	);
	const isChordsSequenceActive =
		activeScaleIndex !== null ||
		activeProgressionId !== null ||
		activeColorSeqId !== null;
	const pendingPartChoice: PendingMusicXmlPartChoice | null =
		pendingMusicXmlFile
			? {
					fileName: pendingMusicXmlFile.fileName,
					title: pendingMusicXmlFile.title,
					parts: pendingMusicXmlFile.parts,
					selectedPartId: pendingMusicXmlFile.selectedPartId,
					instrument: pendingMusicXmlFile.instrument,
				}
			: null;

	return (
		<div className="app-shell">
			<header className="top-bar">
				<div className="brand-cluster">
					<div className="brand-emblem">
						<img
							src={logoUrl}
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
							onClick={() =>
								setOpenPopover((prev) =>
									prev === "settings" ? null : "settings",
								)
							}
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
								<SegmentedControl
									ariaLabel="Audio sound preset"
									value={soundMode}
									onChange={handleSelectSoundMode}
									options={[
										{
											value: "auto",
											label: "Instrument",
											title:
												"Match active instrument sound (Piano, Acoustic Guitar, Solo Violin, or Bowed Cello)",
										},
										{ value: "pad", label: "Pad" },
										{ value: "muted", label: "Mute" },
									]}
								/>
							</div>

							<div className="settings-popover-group">
								<div className="shortcuts-popover-title">
									Enharmonic Spelling
								</div>
								<SegmentedControl
									ariaLabel="Accidental spelling preference"
									value={preference}
									onChange={handlePreferenceChange}
									options={[
										{
											value: "standard",
											label: "Standard",
											title: "Balanced standard spellings (B, F♯, D♭)",
										},
										{
											value: "sharps",
											label: "Sharps ♯",
											title: "Prefer sharp keys (B, F♯, C♯)",
										},
										{
											value: "flats",
											label: "Flats ♭",
											title: "Prefer flat keys (C♭, G♭, D♭)",
										},
									]}
								/>
							</div>
						</div>
					</div>

					<div className="shortcuts-popover-anchor" ref={shortcutsContainerRef}>
						<button
							type="button"
							className={`icon-square-btn ${shortcutsOpen ? "is-on" : ""}`}
							onClick={() =>
								setOpenPopover((prev) =>
									prev === "shortcuts" ? null : "shortcuts",
								)
							}
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
				</div>

				<div className="inspector-column">
					<section
						id="section-instruments"
						className="panel-card"
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
											className={`var-pill ${getQualityClass(spec.quality)} ${
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
							className="instrument-panel"
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
									tuningMidi={activeSongForInstrument?.tuning ?? null}
									capo={activeSongForInstrument?.capo ?? 0}
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

					<FifthsFourthsPanel
						analysis={analysis}
						walkingDirection={walkingDirection}
						isCollapsed={Boolean(collapsedSections["section-neighbors"])}
						onSelectKey={(slot, nextMode) => selectKey(slot, nextMode)}
						onAuditionRelationship={handleAuditionRelationship}
						onToggleWalk={handleToggleWalk}
						onToggleCollapse={() => toggleSectionCollapsed("section-neighbors")}
					/>

					<section
						id="section-chords"
						className={`panel-card${isChordsCollapsed ? " is-collapsed" : ""}`}
						aria-labelledby="section-chords-heading"
					>
						<SectionHeader
							headingId="section-chords-heading"
							title="Chords"
							bodyId="section-chords-body"
							titlePrefix={<IconChords size={14} />}
							titleBadge={
								isChordsSequenceActive ? (
									<span className="tab-live-dot" aria-hidden="true" />
								) : undefined
							}
							actions={
								isChordsCollapsed || harmonyTab === "color" ? (
									<span className="workspace-collapsed-key">
										{analysis.name}
									</span>
								) : undefined
							}
							isCollapsed={isChordsCollapsed}
							onToggleCollapse={() => toggleSectionCollapsed("section-chords")}
						/>

						<div
							id="section-chords-body"
							className="section-body"
							hidden={isChordsCollapsed}
						>
							<div className="harmony-tabs-bar">
								<div
									className="instrument-tablist"
									role="tablist"
									aria-label="Chords workspace"
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
								</div>

								<div className="chord-toolbar">
									{harmonyTab === "chords" && (
										<SegmentedControl
											ariaLabel="Chord extension"
											value={voicingMode}
											onChange={setVoicingMode}
											options={[
												{ value: "triad", label: "Triads" },
												{ value: "seventh", label: "7ths" },
											]}
										/>
									)}

									<button
										type="button"
										className={`chip-btn ${arpeggiate ? "is-on" : ""}`}
										aria-pressed={arpeggiate}
										onClick={() => setArpeggiate((a) => !a)}
										title="Roll chord notes sequentially vs. block chord"
									>
										Arpeggio
									</button>
								</div>
							</div>

							<div
								id="panel-harmony-chords"
								role="tabpanel"
								aria-labelledby="tab-harmony-chords"
								hidden={harmonyTab !== "chords"}
							>
								<div className="hero-top">
									<div className="hero-identity">
										<div className="hero-title-row">
											<h3 id="key-title" className="hero-key-title">
												{analysis.name}
											</h3>

											<SegmentedControl
												ariaLabel="Scale mode"
												value={mode}
												onChange={(nextMode) =>
													selectKey(selectedSlot, nextMode)
												}
												options={[
													{ value: "major", label: "Major" },
													{ value: "minor", label: "Minor" },
												]}
											/>
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
										<SequencePlayButton
											isPlaying={activeScaleIndex !== null}
											idleLabel="Play Scale"
											onClick={handlePlayScale}
										/>
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

										<SequencePlayButton
											isPlaying={activeProgressionId === selectedProgression.id}
											idleLabel="Play Progression"
											onClick={() => handlePlayProgression(selectedProgression)}
											title={selectedProgression.description}
										/>
									</div>

									<div className="progression-steps-row">
										<div
											className="progression-steps-chips"
											role="group"
											aria-label={`${selectedProgression.name} chord steps`}
										>
											{selectedProgression.degrees.map((deg, idx) => {
												const { chord: stepChord, suffix } =
													resolveProgressionStep(deg);
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
														className={`prog-step-chip ${getQualityClass(stepChord.quality)} ${
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
						</div>
					</section>

					<MusicTeacherSection
						instrumentView={instrumentView}
						instrumentLabel={INSTRUMENT_META[instrumentView].label}
						instrumentTabList={
							<InstrumentTabList
								activeTab={instrumentView}
								onSelect={handleSelectInstrumentTab}
								idPrefix="songs-tab"
								ariaLabel="Learn with Real Songs instrument"
								controlsId="panel-real-songs"
							/>
						}
						songs={songsForInstrument}
						otherInstrumentsWithSongs={otherInstrumentsWithSongs}
						selectedSongId={selectedSongId}
						playingSongId={playingSongId}
						cuedSongId={cuedSongId}
						songPositionMs={songPositionMs}
						playbackSpeed={songPlaybackSpeed}
						activeChordStepIndex={activeSongStepIndex}
						activeNoteLabel={activeSongNoteLabel}
						selectedPreviewStepId={selectedSongPreviewId}
						isCollapsed={isMusicTeacherCollapsed}
						isImporting={isImportingMusicXml}
						importError={musicXmlImportError}
						pendingPartChoice={pendingPartChoice}
						onToggleCollapse={() =>
							toggleSectionCollapsed("section-music-teacher")
						}
						onSelectInstrument={handleSelectInstrumentTab}
						onSelectSong={handleSelectSong}
						onImportMusicXmlFile={handleImportMusicXmlFile}
						onConfirmPartChoice={handleConfirmPartChoice}
						onCancelPartChoice={() => setPendingMusicXmlFile(null)}
						onDismissImportError={() => setMusicXmlImportError(null)}
						onRemoveLocalPreview={handleRemoveLocalPreview}
						onChangePlaybackSpeed={handleChangePlaybackSpeed}
						onTogglePlaySong={handleTogglePlaySong}
						onStopSong={handleStopSong}
						onSeekSong={handleSeekSong}
						onBeginScrubSong={handleBeginScrubSong}
						onSkipSongBar={handleSkipSongBar}
						onPlayFromSongBar={handlePlayFromSongBar}
						onSelectSongChordStep={handleSelectSongChordStep}
					/>
				</div>
			</main>
		</div>
	);
}

export default App;
