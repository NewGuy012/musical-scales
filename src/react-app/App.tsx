import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	SoundPreset,
	playChordNotes,
	playSingleNote,
	playStepSequence,
} from "./audio/synth";
import { ChordVoicingMode, ChordsPanel } from "./components/ChordsPanel";
import { CircleWheel } from "./components/CircleWheel";
import { FifthsFourthsPanel } from "./components/FifthsFourthsPanel";
import { GuitarFretboard } from "./components/GuitarFretboard";
import { KeySignatureStaff } from "./components/KeySignatureStaff";
import { PianoKeyboard } from "./components/PianoKeyboard";
import {
	AccidentalPreference,
	ChordProgression,
	ChordQuality,
	DiatonicChord,
	EnharmonicSide,
	KeyMode,
	analyzeKey,
	mod12,
	noteToPitchClass,
} from "./theory/circleOfFifths";
import {
	GuitarChordKind,
	GuitarVoicing,
	getGuitarVoicings,
	inferGuitarChordKind,
} from "./theory/guitarFretboard";
import "./App.css";

interface ActiveVoicing {
	id: string | null;
	label: string;
	quality: ChordQuality;
	guitarKind: GuitarChordKind | null;
	midi: number[];
	notes: string[];
	chord: DiatonicChord | null;
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
	const [soundPreset, setSoundPreset] = useState<SoundPreset>("keys");
	const [rotateToSelected, setRotateToSelected] = useState<boolean>(false);
	const [theme, setTheme] = useState<"dark" | "light">("dark");
	const [instrumentView, setInstrumentView] = useState<"piano" | "guitar">(
		"piano",
	);
	const [selectedGuitarVoicingId, setSelectedGuitarVoicingId] = useState<
		string | null
	>(null);

	// Active audition / playback highlight state
	const [auditionOverride, setAuditionOverride] =
		useState<ActiveVoicing | null>(null);
	const [activeScaleIndex, setActiveScaleIndex] = useState<number | null>(null);
	const [activeProgressionId, setActiveProgressionId] = useState<string | null>(
		null,
	);
	const [walkingDirection, setWalkingDirection] = useState<
		"fourth" | "fifth" | null
	>(null);

	const cancelSequenceRef = useRef<(() => void) | null>(null);

	const analysis = useMemo(
		() => analyzeKey(selectedSlot, mode, preference, slotOverrides),
		[selectedSlot, mode, preference, slotOverrides],
	);

	const stopActiveSequence = useCallback(() => {
		if (cancelSequenceRef.current) {
			cancelSequenceRef.current();
			cancelSequenceRef.current = null;
		}
		setActiveScaleIndex(null);
		setActiveProgressionId(null);
		setWalkingDirection(null);
	}, []);

	useEffect(() => {
		document.documentElement.setAttribute("data-theme", theme);
	}, [theme]);

	useEffect(() => {
		return () => {
			cancelSequenceRef.current?.();
		};
	}, []);

	const getChordMidi = useCallback(
		(chord: DiatonicChord) =>
			voicingMode === "seventh" ? chord.seventhMidi : chord.triadMidi,
		[voicingMode],
	);

	const getChordNotes = useCallback(
		(chord: DiatonicChord) =>
			voicingMode === "seventh" ? chord.seventhNotes : chord.triadNotes,
		[voicingMode],
	);

	const getChordSymbol = useCallback(
		(chord: DiatonicChord) =>
			voicingMode === "seventh" ? chord.seventhSymbol : chord.symbol,
		[voicingMode],
	);

	// Default piano display falls back to the Tonic chord of the active key
	const tonicChord = analysis.chords[0];
	const activeVoicing = useMemo<ActiveVoicing>(() => {
		if (auditionOverride) {
			if (auditionOverride.chord) {
				const c = auditionOverride.chord;
				return {
					id: auditionOverride.id,
					label: `${getChordSymbol(c)} (${c.roman})`,
					quality: c.quality,
					guitarKind: inferGuitarChordKind(
						c,
						c.quality,
						voicingMode === "seventh",
					),
					midi: getChordMidi(c),
					notes: getChordNotes(c),
					chord: c,
				};
			}
			return auditionOverride;
		}
		return {
			id: `${tonicChord.roman}-${tonicChord.symbol}`,
			label: `${getChordSymbol(tonicChord)} (${tonicChord.roman})`,
			quality: tonicChord.quality,
			guitarKind: inferGuitarChordKind(
				tonicChord,
				tonicChord.quality,
				voicingMode === "seventh",
			),
			midi: getChordMidi(tonicChord),
			notes: getChordNotes(tonicChord),
			chord: null,
		};
	}, [
		auditionOverride,
		tonicChord,
		voicingMode,
		getChordSymbol,
		getChordMidi,
		getChordNotes,
	]);

	const preferFlats = useMemo(
		() =>
			analysis.accidentalsCount < 0 ||
			activeVoicing.notes.some((n) => n.includes("♭")),
		[analysis.accidentalsCount, activeVoicing.notes],
	);

	const guitarVoicings = useMemo(() => {
		if (!activeVoicing.guitarKind || activeVoicing.notes.length < 3) {
			return [];
		}
		return getGuitarVoicings(
			activeVoicing.notes[0],
			activeVoicing.guitarKind,
			activeVoicing.notes,
			preferFlats,
		);
	}, [activeVoicing.guitarKind, activeVoicing.notes, preferFlats]);

	const activeGuitarVoicing = useMemo(() => {
		if (guitarVoicings.length === 0) return null;
		return (
			guitarVoicings.find((v) => v.id === selectedGuitarVoicingId) ??
			guitarVoicings[0]
		);
	}, [guitarVoicings, selectedGuitarVoicingId]);

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
					voicings.find((v) => v.id === selectedGuitarVoicingId) ??
					voicings[0];
				if (chosen) {
					return {
						midi: chosen.soundingMidi,
						spreadSec: arpeggiate ? 0.075 : 0.032,
					};
				}
			}
			return { midi: pianoMidi };
		},
		[instrumentView, selectedGuitarVoicingId, arpeggiate],
	);

	const activeNoteNamesByMidi = useMemo(() => {
		const map: Record<number, string> = {};
		activeVoicing.midi.forEach((m, i) => {
			if (activeVoicing.notes[i]) {
				map[m] = activeVoicing.notes[i];
			}
		});
		return map;
	}, [activeVoicing]);

	const scalePitchClasses = useMemo(
		() => analysis.scaleNotes.map(noteToPitchClass),
		[analysis.scaleNotes],
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
				const chord = nextAnalysis.chords[0];
				const pianoMidi =
					voicingMode === "seventh" ? chord.seventhMidi : chord.triadMidi;
				const notes =
					voicingMode === "seventh" ? chord.seventhNotes : chord.triadNotes;
				const guitarKind = inferGuitarChordKind(
					chord,
					chord.quality,
					voicingMode === "seventh",
				);
				const playback = resolvePlaybackForInstrument(
					notes,
					guitarKind,
					pianoMidi,
					nextAnalysis.accidentalsCount < 0,
				);
				playChordNotes(playback.midi, {
					preset: soundPreset,
					arpeggiate,
					spreadSec: playback.spreadSec,
				});
			}
		},
		[
			stopActiveSequence,
			preference,
			slotOverrides,
			voicingMode,
			resolvePlaybackForInstrument,
			soundPreset,
			arpeggiate,
		],
	);

	const handlePlayTonic = useCallback(() => {
		stopActiveSequence();
		setAuditionOverride(null);
		const guitarKind = inferGuitarChordKind(
			tonicChord,
			tonicChord.quality,
			voicingMode === "seventh",
		);
		const playback = resolvePlaybackForInstrument(
			getChordNotes(tonicChord),
			guitarKind,
			getChordMidi(tonicChord),
			analysis.accidentalsCount < 0,
		);
		playChordNotes(playback.midi, {
			preset: soundPreset,
			arpeggiate,
			spreadSec: playback.spreadSec,
		});
	}, [
		stopActiveSequence,
		tonicChord,
		voicingMode,
		resolvePlaybackForInstrument,
		getChordNotes,
		getChordMidi,
		analysis.accidentalsCount,
		soundPreset,
		arpeggiate,
	]);

	const handleSelectChord = useCallback(
		(chord: DiatonicChord, id: string) => {
			stopActiveSequence();
			const midi = getChordMidi(chord);
			const notes = getChordNotes(chord);
			const guitarKind = inferGuitarChordKind(
				chord,
				chord.quality,
				voicingMode === "seventh",
			);
			setAuditionOverride({
				id,
				label: `${getChordSymbol(chord)} (${chord.roman})`,
				quality: chord.quality,
				guitarKind,
				midi,
				notes,
				chord,
			});
			const playback = resolvePlaybackForInstrument(
				notes,
				guitarKind,
				midi,
				analysis.accidentalsCount < 0 || notes.some((n) => n.includes("♭")),
			);
			playChordNotes(playback.midi, {
				preset: soundPreset,
				arpeggiate,
				spreadSec: playback.spreadSec,
			});
		},
		[
			stopActiveSequence,
			getChordMidi,
			getChordNotes,
			getChordSymbol,
			voicingMode,
			resolvePlaybackForInstrument,
			analysis.accidentalsCount,
			soundPreset,
			arpeggiate,
		],
	);

	const handlePlayRootPairChord = useCallback(
		(kind: "major" | "minor") => {
			stopActiveSequence();
			const target =
				kind === "major" ? analysis.tonicPair.major : analysis.tonicPair.minor;
			setAuditionOverride({
				id: `tonic-pair-${kind}-${target.symbol}`,
				label: `${target.symbol} (${kind === "major" ? "Major" : "Minor"})`,
				quality: kind,
				guitarKind: kind,
				midi: target.midi,
				notes: target.notes,
				chord: null,
			});
			const playback = resolvePlaybackForInstrument(
				target.notes,
				kind,
				target.midi,
				target.notes.some((n) => n.includes("♭")),
			);
			playChordNotes(playback.midi, {
				preset: soundPreset,
				arpeggiate,
				spreadSec: playback.spreadSec,
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
				const noteLabel =
					analysis.scaleNotes[idx % analysis.scaleNotes.length];
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
			const targetDegree = direction === "fourth" ? 4 : 5;
			const targetChord = analysis.chords[targetDegree - 1];
			const cadence = [tonicChord, targetChord, tonicChord];

			cancelSequenceRef.current = playStepSequence(
				cadence.map((c) => {
					const gKind = inferGuitarChordKind(
						c,
						c.quality,
						voicingMode === "seventh",
					);
					const pb = resolvePlaybackForInstrument(
						getChordNotes(c),
						gKind,
						getChordMidi(c),
						analysis.accidentalsCount < 0,
					);
					return {
						midi: pb.midi,
						durationSec: 0.72,
					};
				}),
				{
					preset: soundPreset,
					stepMs: 680,
					arpeggiate,
					spreadSec:
						instrumentView === "guitar"
							? arpeggiate
								? 0.075
								: 0.032
							: undefined,
					onStep: (idx) => {
						const c = cadence[idx];
						setAuditionOverride({
							id: `${c.roman}-${c.symbol}`,
							label: `${getChordSymbol(c)} (${c.roman})`,
							quality: c.quality,
							guitarKind: inferGuitarChordKind(
								c,
								c.quality,
								voicingMode === "seventh",
							),
							midi: getChordMidi(c),
							notes: getChordNotes(c),
							chord: c,
						});
					},
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
			voicingMode,
			resolvePlaybackForInstrument,
			getChordMidi,
			getChordNotes,
			getChordSymbol,
			soundPreset,
			arpeggiate,
			instrumentView,
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

			const chordSteps = prog.degrees.map((deg) => {
				if (deg === -5 && analysis.harmonicMinorV) {
					return {
						chord: analysis.harmonicMinorV,
						suffix: "-harmonic",
					};
				}
				return {
					chord: analysis.chords[deg - 1],
					suffix: "",
				};
			});

			cancelSequenceRef.current = playStepSequence(
				chordSteps.map(({ chord }) => {
					const gKind = inferGuitarChordKind(
						chord,
						chord.quality,
						voicingMode === "seventh",
					);
					const pb = resolvePlaybackForInstrument(
						getChordNotes(chord),
						gKind,
						getChordMidi(chord),
						analysis.accidentalsCount < 0,
					);
					return {
						midi: pb.midi,
						durationSec: 0.85,
					};
				}),
				{
					preset: soundPreset,
					stepMs: 780,
					arpeggiate,
					spreadSec:
						instrumentView === "guitar"
							? arpeggiate
								? 0.075
								: 0.032
							: undefined,
					onStep: (idx) => {
						const { chord, suffix } = chordSteps[idx];
						setAuditionOverride({
							id: `${chord.roman}-${chord.symbol}${suffix}`,
							label: `${getChordSymbol(chord)} (${chord.roman})`,
							quality: chord.quality,
							guitarKind: inferGuitarChordKind(
								chord,
								chord.quality,
								voicingMode === "seventh",
							),
							midi: getChordMidi(chord),
							notes: getChordNotes(chord),
							chord,
						});
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
			voicingMode,
			resolvePlaybackForInstrument,
			getChordMidi,
			getChordNotes,
			getChordSymbol,
			soundPreset,
			arpeggiate,
			instrumentView,
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
			const startSlot = selectedSlot;
			const steps = Array.from({ length: 13 }).map((_, stepIdx) => {
				const slot = mod12(startSlot + stepIdx * delta);
				const stepAnalysis = analyzeKey(
					slot,
					mode,
					preference,
					slotOverrides,
				);
				const chord = stepAnalysis.chords[0];
				const pianoMidi =
					voicingMode === "seventh" ? chord.seventhMidi : chord.triadMidi;
				const notes =
					voicingMode === "seventh" ? chord.seventhNotes : chord.triadNotes;
				const gKind = inferGuitarChordKind(
					chord,
					chord.quality,
					voicingMode === "seventh",
				);
				const pb = resolvePlaybackForInstrument(
					notes,
					gKind,
					pianoMidi,
					stepAnalysis.accidentalsCount < 0,
				);
				return { slot, midi: pb.midi, durationSec: 0.65 };
			});

			cancelSequenceRef.current = playStepSequence(steps, {
				preset: soundPreset,
				stepMs: 650,
				arpeggiate,
				spreadSec:
					instrumentView === "guitar"
						? arpeggiate
							? 0.075
							: 0.032
						: undefined,
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
			voicingMode,
			resolvePlaybackForInstrument,
			soundPreset,
			arpeggiate,
			instrumentView,
		],
	);

	const handleSelectGuitarVoicing = useCallback(
		(voicing: GuitarVoicing) => {
			setSelectedGuitarVoicingId(voicing.id);
			playChordNotes(voicing.soundingMidi, {
				preset: soundPreset,
				spreadSec: arpeggiate ? 0.075 : 0.032,
			});
		},
		[soundPreset, arpeggiate],
	);

	const handleStrumGuitarVoicing = useCallback(
		(voicing: GuitarVoicing) => {
			playChordNotes(voicing.soundingMidi, {
				preset: soundPreset,
				spreadSec: arpeggiate ? 0.075 : 0.032,
			});
		},
		[soundPreset, arpeggiate],
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

	// Global keyboard shortcuts for fast Circle exploration
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement | null)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

			if (e.key === "ArrowLeft") {
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
	}, [selectedSlot, mode, selectKey, handlePlayTonic]);

	const scaleDegreeLabels = mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES;

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
					<div>
						<h1 className="brand-title">Circle of Fifths</h1>
						<p className="brand-subtitle">
							Interactive Fifths, Fourths &amp; Diatonic Chord Explorer
						</p>
					</div>
				</div>

				<div className="header-controls">
					{/* Major / Minor Mode Toggle */}
					<div
						className="segmented-control"
						role="group"
						aria-label="Scale mode"
					>
						<button
							type="button"
							className={`seg-btn ${mode === "major" ? "is-active" : ""}`}
							onClick={() => selectKey(selectedSlot, "major")}
						>
							Major
						</button>
						<button
							type="button"
							className={`seg-btn ${mode === "minor" ? "is-active" : ""}`}
							onClick={() => selectKey(selectedSlot, "minor")}
						>
							Minor
						</button>
					</div>

					{/* Enharmonic Spelling Preference */}
					<div
						className="segmented-control"
						role="group"
						aria-label="Accidental spelling preference"
					>
						<button
							type="button"
							className={`seg-btn ${preference === "standard" ? "is-active" : ""}`}
							onClick={() => handlePreferenceChange("standard")}
							title="Balanced standard spellings (B, F♯, D♭)"
						>
							Standard
						</button>
						<button
							type="button"
							className={`seg-btn ${preference === "sharps" ? "is-active" : ""}`}
							onClick={() => handlePreferenceChange("sharps")}
							title="Prefer sharp keys (B, F♯, C♯)"
						>
							Sharps ♯
						</button>
						<button
							type="button"
							className={`seg-btn ${preference === "flats" ? "is-active" : ""}`}
							onClick={() => handlePreferenceChange("flats")}
							title="Prefer flat keys (C♭, G♭, D♭)"
						>
							Flats ♭
						</button>
					</div>

					{/* Sound Preset */}
					<div
						className="segmented-control"
						role="group"
						aria-label="Audio sound preset"
					>
						<button
							type="button"
							className={`seg-btn ${soundPreset === "keys" ? "is-active" : ""}`}
							onClick={() => setSoundPreset("keys")}
						>
							Keys
						</button>
						<button
							type="button"
							className={`seg-btn ${soundPreset === "pad" ? "is-active" : ""}`}
							onClick={() => setSoundPreset("pad")}
						>
							Pad
						</button>
						<button
							type="button"
							className={`seg-btn ${soundPreset === "muted" ? "is-active" : ""}`}
							onClick={() => {
								stopActiveSequence();
								setSoundPreset("muted");
							}}
						>
							Mute
						</button>
					</div>

					{/* Theme Toggle */}
					<button
						type="button"
						className="icon-toggle-btn"
						onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
						aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
						title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
					>
						{theme === "dark" ? "☀ Light" : "☾ Dark"}
					</button>
				</div>
			</header>

			<main className="studio-layout">
				{/* Left Column: Interactive Circle of Fifths Wheel */}
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

					<p className="keyboard-shortcuts-hint">
						Shortcuts: <kbd>←</kbd> 4th · <kbd>→</kbd> 5th ·{" "}
						<kbd>Space</kbd> Play · <kbd>M</kbd> Major/Minor
					</p>
				</section>

				{/* Right Column: Key Inspector, Relationships, Chords & Keyboard */}
				<div className="inspector-column">
					{/* 1. Key Overview & Scale */}
					<section className="panel-card hero-card" aria-labelledby="key-title">
						<div className="hero-top">
							<div className="hero-identity">
								<div className="hero-eyebrow-row">
									<span className={`mode-pill mode-pill-${mode}`}>
										{mode === "major" ? "Major Key" : "Natural Minor Key"}
									</span>
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
											⇄ {analysis.enharmonicTwin.shortName}
										</button>
									)}
								</div>

								<h2 id="key-title" className="hero-key-title">
									{analysis.name}
								</h2>

								<div className="related-keys-row">
									<button
										type="button"
										className="jump-pill"
										onClick={() =>
											selectKey(
												analysis.relativeKey.slotIndex,
												analysis.relativeKey.mode,
											)
										}
										title="Shares the exact same key signature and notes"
									>
										Relative{" "}
										{analysis.relativeKey.mode === "major"
											? "Major"
											: "Minor"}
										: <strong>{analysis.relativeKey.shortName}</strong>
									</button>

									<button
										type="button"
										className="jump-pill"
										onClick={() =>
											selectKey(
												analysis.parallelKey.slotIndex,
												analysis.parallelKey.mode,
											)
										}
										title="Shares the same tonic root note (±3 steps on circle)"
									>
										Parallel{" "}
										{analysis.parallelKey.mode === "major"
											? "Major"
											: "Minor"}
										: <strong>{analysis.parallelKey.shortName}</strong>
									</button>
								</div>
							</div>

							<KeySignatureStaff
								accidentalsCount={analysis.accidentalsCount}
								accidentals={analysis.accidentals}
							/>
						</div>

						{/* Scale Notes Strip */}
						<div className="scale-strip-wrap">
							<div className="scale-strip-header">
								<span className="scale-strip-label">
									{analysis.name} Scale
									{analysis.accidentals.length > 0 && (
										<span className="scale-acc-list">
											{" "}
											· Accidentals: {analysis.accidentals.join(" ")}
										</span>
									)}
								</span>
								<button
									type="button"
									className={`pill-action-btn ${activeScaleIndex !== null ? "is-playing" : ""}`}
									onClick={handlePlayScale}
								>
									{activeScaleIndex !== null ? "■ Stop Scale" : "▶ Play Scale"}
								</button>
							</div>

							<div className="scale-notes-row">
								{analysis.scaleNotes.map((note, idx) => {
									const isLit =
										activeScaleIndex === idx ||
										(activeScaleIndex === 7 && idx === 0);
									return (
										<button
											key={`${note}-${idx}`}
											type="button"
											className={`scale-note-pill ${idx === 0 ? "is-root" : ""} ${
												isLit ? "is-lit" : ""
											}`}
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

					{/* 2. Fifths & Fourths Relationship Explorer */}
					<FifthsFourthsPanel
						analysis={analysis}
						walkingDirection={walkingDirection}
						onSelectKey={(slot, nextMode) => selectKey(slot, nextMode)}
						onAuditionRelationship={handleAuditionRelationship}
						onToggleWalk={handleToggleWalk}
					/>

					{/* 3. Major & Minor Chords */}
					<ChordsPanel
						analysis={analysis}
						voicingMode={voicingMode}
						arpeggiate={arpeggiate}
						activeChordId={activeVoicing.id}
						onChangeVoicingMode={setVoicingMode}
						onToggleArpeggiate={() => setArpeggiate((a) => !a)}
						onSelectChord={handleSelectChord}
						onPlayRootPairChord={handlePlayRootPairChord}
					/>

					{/* 4. Interactive Instrument View (Piano / Guitar) & Chord Progressions */}
					<section
						className="panel-card"
						aria-label="Instrument view and progressions"
					>
						<div className="instrument-tabs-bar">
							<div
								className="instrument-tablist"
								role="tablist"
								aria-label="Instrument view"
							>
								<button
									type="button"
									role="tab"
									id="tab-piano"
									aria-selected={instrumentView === "piano"}
									aria-controls="panel-instrument"
									className={`instrument-tab ${
										instrumentView === "piano" ? "is-active" : ""
									}`}
									onClick={() => setInstrumentView("piano")}
								>
									Piano View
								</button>
								<button
									type="button"
									role="tab"
									id="tab-guitar"
									aria-selected={instrumentView === "guitar"}
									aria-controls="panel-instrument"
									className={`instrument-tab ${
										instrumentView === "guitar" ? "is-active" : ""
									}`}
									onClick={() => setInstrumentView("guitar")}
								>
									Guitar View
								</button>
							</div>
							<span className="instrument-tab-meta">
								{instrumentView === "piano"
									? "2-Octave Keyboard (C4–B5)"
									: "Standard Tuning · E A D G B e"}
							</span>
						</div>

						<div
							id="panel-instrument"
							role="tabpanel"
							aria-labelledby={
								instrumentView === "piano" ? "tab-piano" : "tab-guitar"
							}
						>
							{instrumentView === "piano" ? (
								<PianoKeyboard
									activeMidiNotes={activeVoicing.midi}
									activeLabel={activeVoicing.label}
									activeQuality={activeVoicing.quality}
									scalePitchClasses={scalePitchClasses}
									activeNoteNamesByMidi={activeNoteNamesByMidi}
									onPlayNote={(midi) => playSingleNote(midi, soundPreset)}
								/>
							) : (
								<GuitarFretboard
									activeLabel={activeVoicing.label}
									activeQuality={activeVoicing.quality}
									chordNotes={activeVoicing.notes}
									chordKind={activeVoicing.guitarKind}
									voicings={guitarVoicings}
									selectedVoicing={activeGuitarVoicing}
									scalePitchClasses={scalePitchClasses}
									scaleNoteNames={analysis.scaleNotes}
									preferFlats={preferFlats}
									onSelectVoicing={handleSelectGuitarVoicing}
									onStrumVoicing={handleStrumGuitarVoicing}
									onPlayFretNote={(midi) =>
										playSingleNote(midi, soundPreset, 0.7)
									}
								/>
							)}
						</div>

						<div className="progressions-wrap">
							<div className="progressions-header">
								<span className="progressions-title">
									Quick Chord Progressions in {analysis.shortName}
								</span>
								<span className="progressions-hint">
									Plays &amp; traces the path on the circle
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
													{isPlaying ? "■" : "▶"}
												</span>
											</span>
											<span className="prog-label">{prog.label}</span>
										</button>
									);
								})}
							</div>
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}

export default App;
