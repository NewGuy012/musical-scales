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
import { CelloFingerboard } from "./components/CelloFingerboard";
import { ChordVoicingMode, ChordsPanel } from "./components/ChordsPanel";
import { CircleWheel } from "./components/CircleWheel";
import { FifthsFourthsPanel } from "./components/FifthsFourthsPanel";
import { GuitarFretboard } from "./components/GuitarFretboard";
import {
	IconKeyboard,
	IconMoon,
	IconPlay,
	IconStop,
	IconSun,
	IconSwap,
	IconVolume,
	IconVolumeMute,
} from "./components/Icons";
import { KeySignatureStaff } from "./components/KeySignatureStaff";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { SongExamplesPanel } from "./components/SongExamplesPanel";
import { CelloVoicing, getCelloVoicings } from "./theory/celloFingerboard";
import {
	AccidentalPreference,
	ChordProgression,
	ChordQuality,
	DiatonicChord,
	EnharmonicSide,
	KeyAnalysis,
	KeyMode,
	analyzeKey,
	getChordCardId,
	mod12,
	noteToPitchClass,
} from "./theory/circleOfFifths";
import {
	GuitarChordKind,
	GuitarVoicing,
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
	chord: DiatonicChord | null;
	preserveVoicing?: boolean;
}

const MAJOR_DEGREES = ["1", "2", "3", "4", "5", "6", "7"] as const;
const MINOR_DEGREES = ["1", "2", "♭3", "4", "5", "♭6", "♭7"] as const;

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
	const [rotateToSelected, setRotateToSelected] = useState<boolean>(false);
	const [theme, setTheme] = useState<"dark" | "light">("dark");
	const [instrumentView, setInstrumentView] = useState<InstrumentTab>("piano");
	const [harmonyTab, setHarmonyTab] = useState<"chords" | "songs">("chords");
	const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);
	const shortcutsContainerRef = useRef<HTMLDivElement | null>(null);
	const soundPreset: SoundPreset =
		soundMode === "auto" ? instrumentView : soundMode;
	const [selectedGuitarVoicingId, setSelectedGuitarVoicingId] = useState<
		string | null
	>(null);
	const [selectedCelloVoicingId, setSelectedCelloVoicingId] = useState<
		string | null
	>(null);

	const [auditionOverride, setAuditionOverride] =
		useState<ActiveVoicing | null>(null);
	const [activeScaleIndex, setActiveScaleIndex] = useState<number | null>(null);
	const [activeProgressionId, setActiveProgressionId] = useState<string | null>(
		null,
	);
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

	const cancelSequenceRef = useRef<(() => void) | null>(null);
	const songPositionMsRef = useRef<number>(0);
	const lastUiProgressMsRef = useRef<number>(-100);

	const updateSongPosition = useCallback((ms: number) => {
		songPositionMsRef.current = ms;
		lastUiProgressMsRef.current = ms;
		setSongPositionMs(ms);
	}, []);

	const analysis = useMemo(
		() => analyzeKey(selectedSlot, mode, preference, slotOverrides),
		[selectedSlot, mode, preference, slotOverrides],
	);

	const cancelActivePlaybackEngine = useCallback(() => {
		if (cancelSequenceRef.current) {
			cancelSequenceRef.current();
			cancelSequenceRef.current = null;
		} else {
			stopAllAudio();
		}
	}, []);

	const stopActiveSequence = useCallback(() => {
		cancelActivePlaybackEngine();
		setActiveScaleIndex(null);
		setActiveProgressionId(null);
		setWalkingDirection(null);
		setPlayingSongId(null);
		setCuedSongId(null);
		songPositionMsRef.current = 0;
		setSongPositionMs(0);
		lastUiProgressMsRef.current = -100;
		setActiveSongStepIndex(null);
		setActiveSongNoteLabel(null);
		setActiveSongEvent(null);
		setSelectedSongPreviewId(null);
	}, [cancelActivePlaybackEngine]);

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
			includeChordRef = true,
		): ActiveVoicing => {
			const symbol = isSeventh ? chord.seventhSymbol : chord.symbol;
			return {
				id: idOverride ?? getChordCardId(chord),
				label: `${symbol} (${chord.roman})`,
				quality: chord.quality,
				guitarKind: inferGuitarChordKind(chord, chord.quality, isSeventh),
				midi: isSeventh ? chord.seventhMidi : chord.triadMidi,
				notes: isSeventh ? chord.seventhNotes : chord.triadNotes,
				chord: includeChordRef ? chord : null,
			};
		},
		[isSeventh],
	);

	const tonicChord = analysis.chords[0];
	const activeVoicing = useMemo<ActiveVoicing>(() => {
		if (auditionOverride) {
			if (auditionOverride.chord && !auditionOverride.preserveVoicing) {
				return toChordVoicing(
					auditionOverride.chord,
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

	const guitarVoicings = useMemo(() => {
		if (!activeVoicing.guitarKind || activeVoicing.notes.length < 3) return [];
		return getGuitarVoicings(
			activeVoicing.notes[0],
			activeVoicing.guitarKind,
			activeVoicing.notes,
			preferFlats,
		);
	}, [activeVoicing.guitarKind, activeVoicing.notes, preferFlats]);

	const activeGuitarVoicing = useMemo(
		() =>
			guitarVoicings.find((v) => v.id === selectedGuitarVoicingId) ??
			guitarVoicings[0] ??
			null,
		[guitarVoicings, selectedGuitarVoicingId],
	);

	const celloVoicings = useMemo(() => {
		if (!activeVoicing.guitarKind || activeVoicing.notes.length < 3) return [];
		return getCelloVoicings(
			activeVoicing.notes[0],
			activeVoicing.guitarKind,
			activeVoicing.notes,
			preferFlats,
		);
	}, [activeVoicing.guitarKind, activeVoicing.notes, preferFlats]);

	const activeCelloVoicing = useMemo(
		() =>
			celloVoicings.find((v) => v.id === selectedCelloVoicingId) ??
			celloVoicings[0] ??
			null,
		[celloVoicings, selectedCelloVoicingId],
	);

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
			if (instrumentView === "guitar" && guitarKind && notes.length >= 3) {
				const voicings = getGuitarVoicings(
					notes[0],
					guitarKind,
					notes,
					flatBias,
				);
				const chosen =
					voicings.find((v) => v.id === selectedGuitarVoicingId) ?? voicings[0];
				if (chosen) {
					return { midi: chosen.soundingMidi, spreadSec: instrumentSpreadSec };
				}
			}
			if (instrumentView === "cello" && guitarKind && notes.length >= 3) {
				const voicings = getCelloVoicings(
					notes[0],
					guitarKind,
					notes,
					flatBias,
				);
				const chosen =
					voicings.find((v) => v.id === selectedCelloVoicingId) ?? voicings[0];
				if (chosen) {
					return { midi: chosen.soundingMidi, spreadSec: instrumentSpreadSec };
				}
			}
			return { midi: pianoMidi };
		},
		[
			instrumentView,
			selectedGuitarVoicingId,
			selectedCelloVoicingId,
			instrumentSpreadSec,
		],
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
				const pb = resolveDiatonicPlayback(
					nextAnalysis.chords[0],
					nextAnalysis.accidentalsCount < 0,
				);
				playChordNotes(pb.midi, {
					preset: soundPreset,
					arpeggiate,
					spreadSec: pb.spreadSec,
				});
			}
		},
		[
			stopActiveSequence,
			preference,
			slotOverrides,
			resolveDiatonicPlayback,
			soundPreset,
			arpeggiate,
		],
	);

	const handlePlayTonic = useCallback(() => {
		stopActiveSequence();
		setAuditionOverride(null);
		const pb = resolveDiatonicPlayback(
			tonicChord,
			analysis.accidentalsCount < 0,
		);
		playChordNotes(pb.midi, {
			preset: soundPreset,
			arpeggiate,
			spreadSec: pb.spreadSec,
		});
	}, [
		stopActiveSequence,
		resolveDiatonicPlayback,
		tonicChord,
		analysis.accidentalsCount,
		soundPreset,
		arpeggiate,
	]);

	const handleSelectChord = useCallback(
		(chord: DiatonicChord, id: string) => {
			stopActiveSequence();
			const v = toChordVoicing(chord, id);
			setAuditionOverride(v);
			const pb = resolvePlaybackForInstrument(
				v.notes,
				v.guitarKind,
				v.midi,
				analysis.accidentalsCount < 0 || v.notes.some((n) => n.includes("♭")),
			);
			playChordNotes(pb.midi, {
				preset: soundPreset,
				arpeggiate,
				spreadSec: pb.spreadSec,
			});
		},
		[
			stopActiveSequence,
			toChordVoicing,
			resolvePlaybackForInstrument,
			analysis.accidentalsCount,
			soundPreset,
			arpeggiate,
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
				chord: null,
			});
			const pb = resolvePlaybackForInstrument(
				target.notes,
				kind,
				target.midi,
				target.notes.some((n) => n.includes("♭")),
			);
			playChordNotes(pb.midi, {
				preset: soundPreset,
				arpeggiate,
				spreadSec: pb.spreadSec,
			});
		},
		[
			stopActiveSequence,
			analysis.tonicPair,
			resolvePlaybackForInstrument,
			soundPreset,
			arpeggiate,
		],
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
					chord: null,
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

	const handlePlayProgression = useCallback(
		(prog: ChordProgression) => {
			if (activeProgressionId === prog.id) {
				stopActiveSequence();
				return;
			}
			stopActiveSequence();
			setActiveProgressionId(prog.id);

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
						const { chord, suffix } = chordSteps[idx];
						setAuditionOverride(
							toChordVoicing(chord, getChordCardId(chord, suffix)),
						);
					},
					onDone: () => {
						setActiveProgressionId(null);
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

	const handleStrumGuitarVoicing = useCallback(
		(voicing: GuitarVoicing) => {
			playChordNotes(voicing.soundingMidi, {
				preset: soundPreset,
				spreadSec: getDefaultChordSpread("guitar", arpeggiate),
			});
		},
		[soundPreset, arpeggiate],
	);

	const handleSelectGuitarVoicing = useCallback(
		(voicing: GuitarVoicing) => {
			setSelectedGuitarVoicingId(voicing.id);
			handleStrumGuitarVoicing(voicing);
		},
		[handleStrumGuitarVoicing],
	);

	const handleRollCelloVoicing = useCallback(
		(voicing: CelloVoicing) => {
			playChordNotes(voicing.soundingMidi, {
				preset: soundPreset,
				spreadSec: getDefaultChordSpread("cello", arpeggiate),
			});
		},
		[soundPreset, arpeggiate],
	);

	const handleSelectCelloVoicing = useCallback(
		(voicing: CelloVoicing) => {
			setSelectedCelloVoicingId(voicing.id);
			handleRollCelloVoicing(voicing);
		},
		[handleRollCelloVoicing],
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

			const wheelChord: DiatonicChord | null = isDiatonicCardMatch
				? candidateChord
				: candidateChord && step.circleSlotIndex !== undefined
					? {
							...candidateChord,
							degree: step.circleDegree,
							roman: step.roman,
							quality: step.quality,
							symbol: step.chordSymbol,
							triadNotes: [
								step.chordNotes[0] ?? candidateChord.triadNotes[0],
								step.chordNotes[1] ?? candidateChord.triadNotes[1],
								step.chordNotes[2] ?? candidateChord.triadNotes[2],
							],
							seventhNotes: [
								step.chordNotes[0] ?? candidateChord.seventhNotes[0],
								step.chordNotes[1] ?? candidateChord.seventhNotes[1],
								step.chordNotes[2] ?? candidateChord.seventhNotes[2],
								step.chordNotes[3] ?? candidateChord.seventhNotes[3],
							],
							circleIndex: step.circleSlotIndex,
						}
					: candidateChord;

			setAuditionOverride({
				id: isDiatonicCardMatch ? getChordCardId(candidateChord) : step.id,
				label: `${step.chordSymbol} (${step.roman})`,
				quality: step.quality,
				guitarKind: step.guitarKind,
				midi: step.displayMidi,
				notes: step.chordNotes,
				chord: wheelChord,
				preserveVoicing: true,
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

	const startSongPlaybackFrom = useCallback(
		(song: SongExample, startMs: number) => {
			cancelActivePlaybackEngine();
			setActiveScaleIndex(null);
			setActiveProgressionId(null);
			setWalkingDirection(null);
			setSelectedSongPreviewId(null);
			setSelectedGuitarVoicingId(null);
			setSelectedCelloVoicingId(null);
			setSelectedSlot(song.keySlot);
			setMode(song.keyMode);

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
			setCuedSongId(song.id);
			setPlayingSongId(song.id);

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
					songPositionMsRef.current = 0;
					lastUiProgressMsRef.current = -100;
					setPlayingSongId(null);
					setCuedSongId(null);
					setSongPositionMs(0);
					setActiveSongStepIndex(null);
					setActiveSongNoteLabel(null);
					setActiveSongEvent(null);
					setAuditionOverride(null);
				},
			});
		},
		[
			cancelActivePlaybackEngine,
			preference,
			slotOverrides,
			syncSongStateAtTime,
			soundPreset,
			applySongStepHighlight,
			updateSongPosition,
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
			cancelActivePlaybackEngine();
			setActiveScaleIndex(null);
			setActiveProgressionId(null);
			setWalkingDirection(null);
			setSelectedSongPreviewId(null);
			setPlayingSongId(null);
			setCuedSongId(song.id);
			setSelectedSlot(song.keySlot);
			setMode(song.keyMode);
		},
		[cancelActivePlaybackEngine],
	);

	const handleSeekSong = useCallback(
		(song: SongExample, timeMs: number, resumePlayback = false) => {
			if (resumePlayback) {
				startSongPlaybackFrom(song, timeMs);
				return;
			}
			cancelActivePlaybackEngine();
			setActiveScaleIndex(null);
			setActiveProgressionId(null);
			setWalkingDirection(null);
			setSelectedSongPreviewId(null);
			setSelectedGuitarVoicingId(null);
			setSelectedCelloVoicingId(null);
			setPlayingSongId(null);
			setCuedSongId(song.id);
			setSelectedSlot(song.keySlot);
			setMode(song.keyMode);

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
			cancelActivePlaybackEngine,
			preference,
			slotOverrides,
			syncSongStateAtTime,
		],
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
				const songAnalysis = analyzeKey(
					song.keySlot,
					song.keyMode,
					preference,
					slotOverrides,
				);
				const pb = resolvePlaybackForInstrument(
					step.chordNotes,
					step.guitarKind,
					step.displayMidi,
					songAnalysis.accidentalsCount < 0,
				);
				playChordNotes(pb.midi, {
					preset: soundPreset,
					arpeggiate,
					spreadSec: pb.spreadSec,
				});
			}
		},
		[
			cuedSongId,
			playingSongId,
			activeSongStepIndex,
			selectedSongPreviewId,
			startSongPlaybackFrom,
			handleSeekSong,
			preference,
			slotOverrides,
			resolvePlaybackForInstrument,
			soundPreset,
			arpeggiate,
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
					const songAnalysis = analyzeKey(
						song.keySlot,
						song.keyMode,
						preference,
						slotOverrides,
					);
					const pb = resolvePlaybackForInstrument(
						step.chordNotes,
						step.guitarKind,
						step.displayMidi,
						songAnalysis.accidentalsCount < 0,
					);
					playChordNotes(pb.midi, {
						preset: soundPreset,
						arpeggiate,
						spreadSec: pb.spreadSec,
					});
				}
				return;
			}

			stopActiveSequence();
			setSelectedSongPreviewId(step.id);
			setSelectedGuitarVoicingId(null);
			setSelectedCelloVoicingId(null);
			setSelectedSlot(song.keySlot);
			setMode(song.keyMode);

			const songAnalysis = analyzeKey(
				song.keySlot,
				song.keyMode,
				preference,
				slotOverrides,
			);
			applySongStepHighlight(songAnalysis, step);

			const pb = resolvePlaybackForInstrument(
				step.chordNotes,
				step.guitarKind,
				step.displayMidi,
				songAnalysis.accidentalsCount < 0,
			);
			playChordNotes(pb.midi, {
				preset: soundPreset,
				arpeggiate,
				spreadSec: pb.spreadSec,
			});
		},
		[
			playingSongId,
			cuedSongId,
			handleSeekSong,
			stopActiveSequence,
			applySongStepHighlight,
			preference,
			slotOverrides,
			resolvePlaybackForInstrument,
			soundPreset,
			arpeggiate,
		],
	);

	const handleSelectInstrumentTab = useCallback(
		(nextTab: InstrumentTab) => {
			if (nextTab === instrumentView) return;
			if (playingSongId || cuedSongId) {
				stopActiveSequence();
				setAuditionOverride(null);
			}
			setSelectedSongPreviewId(null);
			setInstrumentView(nextTab);
		},
		[instrumentView, playingSongId, cuedSongId, stopActiveSequence],
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

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement | null)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

			if (e.key === "Escape") {
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
		shortcutsOpen,
		selectKey,
		handlePlayTonic,
		stopActiveSequence,
	]);

	useEffect(() => {
		if (!shortcutsOpen) return;
		const handlePointerDown = (e: PointerEvent) => {
			if (
				shortcutsContainerRef.current &&
				!shortcutsContainerRef.current.contains(e.target as Node)
			) {
				setShortcutsOpen(false);
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [shortcutsOpen]);

	const scaleDegreeLabels = mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES;
	const activeQualityBadgeClass =
		activeVoicing.quality === "minor"
			? "piano-active-minor"
			: activeVoicing.quality === "diminished"
				? "piano-active-dim"
				: "piano-active-major";

	return (
		<div className="app-shell">
			<header className="top-bar">
				<div className="brand-cluster">
					<div className="brand-emblem">
						<img
							src="/logo.png"
							alt="Circle of Fifths logo"
							className="brand-logo-img"
						/>
					</div>
					<div className="brand-copy">
						<h1 className="brand-title">Circle of Fifths</h1>
						<p className="brand-subtitle">Keys, Harmony &amp; Voicings</p>
					</div>
				</div>

				<div className="header-controls">
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

					<div
						className="segmented-control audio-control-group"
						role="group"
						aria-label="Audio sound preset"
					>
						<span className="control-prefix-icon" aria-hidden="true">
							{soundMode === "muted" ? (
								<IconVolumeMute size={14} />
							) : (
								<IconVolume size={14} />
							)}
						</span>
						<button
							type="button"
							className={`seg-btn ${soundMode === "auto" ? "is-active" : ""}`}
							onClick={() => setSoundMode("auto")}
							title="Match active instrument sound (Piano, Acoustic Guitar, or Bowed Cello)"
						>
							Instrument
						</button>
						<button
							type="button"
							className={`seg-btn ${soundMode === "pad" ? "is-active" : ""}`}
							onClick={() => setSoundMode("pad")}
						>
							Pad
						</button>
						<button
							type="button"
							className={`seg-btn ${soundMode === "muted" ? "is-active" : ""}`}
							onClick={() => {
								stopActiveSequence();
								setSoundMode("muted");
							}}
						>
							Mute
						</button>
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
				<section
					className="wheel-column"
					aria-label="Interactive Circle of Fifths"
				>
					<CircleWheel
						analysis={analysis}
						selectedSlot={selectedSlot}
						mode={mode}
						preference={preference}
						slotOverrides={slotOverrides}
						highlightedChord={activeVoicing.chord}
						rotateToSelected={rotateToSelected}
						onSelectKey={(slot, nextMode) => selectKey(slot, nextMode)}
						onPlayTonic={handlePlayTonic}
						onStepFourth={() => selectKey(selectedSlot - 1, mode)}
						onStepFifth={() => selectKey(selectedSlot + 1, mode)}
						onToggleRotate={() => setRotateToSelected((r) => !r)}
					/>

					<FifthsFourthsPanel
						analysis={analysis}
						walkingDirection={walkingDirection}
						onSelectKey={(slot, nextMode) => selectKey(slot, nextMode)}
						onAuditionRelationship={handleAuditionRelationship}
						onToggleWalk={handleToggleWalk}
					/>
				</section>

				<div className="inspector-column">
					<section className="panel-card hero-card" aria-labelledby="key-title">
						<div className="hero-top">
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
					</section>

					<section
						className="panel-card harmony-card"
						aria-label="Harmony and Repertoire"
					>
						<div className="harmony-tabs-bar">
							<div
								className="instrument-tablist"
								role="tablist"
								aria-label="Harmony workspace"
							>
								<button
									type="button"
									role="tab"
									id="tab-harmony-chords"
									aria-selected={harmonyTab === "chords"}
									aria-controls="panel-harmony"
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
									id="tab-harmony-songs"
									aria-selected={harmonyTab === "songs"}
									aria-controls="panel-harmony"
									className={`instrument-tab ${
										harmonyTab === "songs" ? "is-active" : ""
									}`}
									onClick={() => setHarmonyTab("songs")}
								>
									<span>Real Songs</span>
									<span className="tab-count-pill">
										{songsForInstrument.length}
									</span>
									{(playingSongId !== null || cuedSongId !== null) && (
										<span className="tab-live-dot" aria-hidden="true" />
									)}
								</button>
							</div>

							{harmonyTab === "chords" ? (
								<div className="chord-toolbar">
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
							) : (
								<span className="instrument-tab-meta">
									{instrumentView === "piano"
										? "Piano Repertoire"
										: instrumentView === "guitar"
											? "Guitar Repertoire"
											: "Cello Repertoire"}
								</span>
							)}
						</div>

						<div
							id="panel-harmony"
							role="tabpanel"
							aria-labelledby={`tab-harmony-${harmonyTab}`}
						>
							{harmonyTab === "chords" ? (
								<>
									<ChordsPanel
										analysis={analysis}
										voicingMode={voicingMode}
										arpeggiate={arpeggiate}
										activeChordId={activeVoicing.id}
										embedded
										onChangeVoicingMode={setVoicingMode}
										onToggleArpeggiate={() => setArpeggiate((a) => !a)}
										onSelectChord={handleSelectChord}
										onPlayRootPairChord={handlePlayRootPairChord}
									/>

									<div className="progressions-wrap">
										<div className="progressions-header">
											<span className="progressions-title">
												Progressions in {analysis.shortName}
											</span>
											<span className="progressions-hint">
												Traces harmonic path on wheel
											</span>
										</div>
										<div className="progressions-grid">
											{analysis.progressions.map((prog) => {
												const isPlaying = activeProgressionId === prog.id;
												return (
													<button
														key={prog.id}
														type="button"
														className={`prog-btn ${isPlaying ? "is-playing" : ""}`}
														onClick={() => handlePlayProgression(prog)}
														title={prog.description}
													>
														<span className="prog-top">
															<strong>{prog.name}</strong>
															<span className="prog-play-tag">
																{isPlaying ? (
																	<IconStop size={10} />
																) : (
																	<IconPlay size={10} />
																)}
															</span>
														</span>
														<span className="prog-label">{prog.label}</span>
													</button>
												);
											})}
										</div>
									</div>
								</>
							) : (
								<SongExamplesPanel
									instrumentView={instrumentView}
									songs={songsForInstrument}
									playingSongId={playingSongId}
									cuedSongId={cuedSongId}
									songPositionMs={songPositionMs}
									activeChordStepIndex={activeSongStepIndex}
									activeNoteLabel={activeSongNoteLabel}
									selectedPreviewStepId={selectedSongPreviewId}
									embedded
									onTogglePlaySong={handleTogglePlaySong}
									onStopSong={handleStopSong}
									onSeekSong={handleSeekSong}
									onBeginScrubSong={handleBeginScrubSong}
									onSkipSongBar={handleSkipSongBar}
									onPlayFromSongBar={handlePlayFromSongBar}
									onSelectSongChordStep={handleSelectSongChordStep}
								/>
							)}
						</div>
					</section>

					<section
						className="panel-card instrument-card"
						aria-label="Instrument visualizer"
					>
						<div className="instrument-tabs-bar">
							<div
								className="instrument-tablist"
								role="tablist"
								aria-label="Instrument view"
							>
								{(
									[
										["piano", "Piano"],
										["guitar", "Guitar"],
										["cello", "Cello"],
									] as const
								).map(([tabId, label]) => (
									<button
										key={tabId}
										type="button"
										role="tab"
										id={`tab-${tabId}`}
										aria-selected={instrumentView === tabId}
										aria-controls="panel-instrument"
										className={`instrument-tab ${
											instrumentView === tabId ? "is-active" : ""
										}`}
										onClick={() => handleSelectInstrumentTab(tabId)}
									>
										{label}
									</button>
								))}
							</div>

							<div className="instrument-status-cluster">
								{activeVoicing.label && (
									<span className={`piano-badge ${activeQualityBadgeClass}`}>
										{activeVoicing.label}
									</span>
								)}
								<span className="instrument-tab-meta">
									{instrumentView === "piano"
										? "C4–B5 · Dots = scale"
										: instrumentView === "guitar"
											? "E A D G B e"
											: "C2–G2–D3–A3"}
								</span>
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
									activeSongMidi={
										playingSongId !== null || cuedSongId !== null
											? (activeSongEvent?.midi ?? null)
											: null
									}
									activeLabel={activeVoicing.label}
									activeQuality={activeVoicing.quality}
									scalePitchClasses={scalePitchClasses}
									activeNoteNamesByMidi={activeNoteNamesByMidi}
									embedded
									onPlayNote={(midi) => playSingleNote(midi, soundPreset, 0.72)}
								/>
							) : instrumentView === "guitar" ? (
								<GuitarFretboard
									activeLabel={activeVoicing.label}
									activeQuality={activeVoicing.quality}
									chordNotes={activeVoicing.notes}
									chordKind={activeVoicing.guitarKind}
									voicings={guitarVoicings}
									selectedVoicing={activeGuitarVoicing}
									activeSongMidi={
										playingSongId !== null || cuedSongId !== null
											? (activeSongEvent?.midi ?? null)
											: null
									}
									activeSongStops={
										playingSongId !== null || cuedSongId !== null
											? (activeSongEvent?.guitarStops ?? null)
											: null
									}
									scalePitchClasses={scalePitchClasses}
									scaleNoteNames={analysis.scaleNotes}
									preferFlats={preferFlats}
									embedded
									onSelectVoicing={handleSelectGuitarVoicing}
									onStrumVoicing={handleStrumGuitarVoicing}
									onPlayFretNote={(midi) =>
										playSingleNote(midi, soundPreset, 0.78)
									}
								/>
							) : (
								<CelloFingerboard
									chordLabel={activeVoicing.label}
									chordQuality={activeVoicing.quality}
									chordKind={activeVoicing.guitarKind}
									chordRoleLabel={
										activeVoicing.chord
											? `${activeVoicing.chord.roman} · ${analysis.shortName}`
											: analysis.shortName
									}
									chordNotes={activeVoicing.notes}
									scaleNotes={analysis.scaleNotes}
									keyRootName={analysis.scaleNotes[0]}
									preferFlats={preferFlats}
									voicings={celloVoicings}
									activeVoicing={activeCelloVoicing}
									activeSongStops={
										playingSongId !== null || cuedSongId !== null
											? (activeSongEvent?.celloStops ?? null)
											: null
									}
									embedded
									onSelectVoicing={handleSelectCelloVoicing}
									onRollVoicing={handleRollCelloVoicing}
									onPlayNote={(midi) => playSingleNote(midi, soundPreset, 0.85)}
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
