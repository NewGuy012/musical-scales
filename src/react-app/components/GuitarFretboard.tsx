import { useState } from "react";
import {
	ChordQuality,
	KeyMode,
	mod12,
	noteToPitchClass,
} from "../theory/circleOfFifths";
import {
	FretboardOverlayMode as GuitarFretboardOverlayMode,
	GuitarChordKind,
	GuitarVoicing,
	MAX_GUITAR_FRET,
	MAX_SONG_GUITAR_FRET,
	PentatonicScope,
	STANDARD_TUNING,
	buildGuitarScalePassGuide,
	createPitchClassNameResolver,
	getChromaticDegreeLabel,
	getIntervalLabel,
} from "../theory/guitarFretboard";
import type { GuitarSongStop } from "../songs/songRuntime";
import {
	IconChevronDown,
	IconPlay,
	getQualityClass,
	handleSvgButtonKeyDown,
} from "./Icons";

export type FretboardOverlayMode = GuitarFretboardOverlayMode;
export type FretboardLabelMode = "notes" | "intervals";

interface GuitarFretboardProps {
	activeQuality: ChordQuality;
	chordNotes: string[];
	chordKind: GuitarChordKind | null;
	voicings: GuitarVoicing[];
	selectedVoicing: GuitarVoicing | null;
	activeSongMidi?: number[] | null;
	activeSongStops?: GuitarSongStop[] | null;
	activeRunMidi?: number | null;
	tuningMidi?: number[] | null;
	capo?: number;
	scalePitchClasses: number[];
	scaleNoteNames: string[];
	keyRootName?: string;
	keyMode?: KeyMode;
	preferFlats: boolean;
	onSelectVoicing: (voicing: GuitarVoicing) => void;
	onStrumVoicing: (voicing: GuitarVoicing) => void;
	onPlayFretNote: (midi: number) => void;
	onPlayNoteSequence?: (midiNotes: number[], stepMs?: number) => void;
}

const SINGLE_INLAY_FRETS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const VISUAL_ROWS = [5, 4, 3, 2, 1, 0] as const;

type DotKind =
	"primary" | "ghost-chord" | "pentatonic" | "scale" | "chromatic" | "none";

const DOT_STYLE_BY_KIND: Record<
	Exclude<DotKind, "none">,
	{
		radius: number;
		bgClass: string;
		textClass: string;
		supportsRootRing?: boolean;
		ariaSuffix: string;
	}
> = {
	primary: {
		radius: 10.5,
		bgClass: "fret-dot-bg",
		textClass: "fret-dot-text",
		supportsRootRing: true,
		ariaSuffix: "",
	},
	"ghost-chord": {
		radius: 8.5,
		bgClass: "fret-dot-ghost-bg",
		textClass: "fret-dot-ghost-text",
		supportsRootRing: true,
		ariaSuffix: "",
	},
	pentatonic: {
		radius: 8.2,
		bgClass: "fret-dot-pentatonic-bg",
		textClass: "fret-dot-pentatonic-text",
		ariaSuffix: " (pentatonic)",
	},
	scale: {
		radius: 7.5,
		bgClass: "fret-dot-scale-bg",
		textClass: "fret-dot-scale-text",
		ariaSuffix: " (scale)",
	},
	chromatic: {
		radius: 7.1,
		bgClass: "fret-dot-chromatic-bg",
		textClass: "fret-dot-chromatic-text",
		ariaSuffix: " (chromatic passing)",
	},
};

function getDotGroupClass(
	dotState: Exclude<DotKind, "none">,
	qualityClass: string,
	isSongHit: boolean,
	isHarmonicHit: boolean,
): string {
	if (dotState === "primary") {
		return `fret-dot-primary ${qualityClass}${
			isSongHit
				? isHarmonicHit
					? " is-song-hit is-harmonic"
					: " is-song-hit"
				: ""
		}`;
	}
	if (dotState === "ghost-chord") return `fret-dot-ghost ${qualityClass}`;
	return `fret-dot-${dotState}`;
}

export function GuitarFretboard({
	activeQuality,
	chordNotes,
	chordKind,
	voicings,
	selectedVoicing,
	activeSongMidi = null,
	activeSongStops = null,
	activeRunMidi = null,
	tuningMidi = null,
	capo = 0,
	scalePitchClasses,
	scaleNoteNames,
	keyRootName,
	keyMode,
	preferFlats,
	onSelectVoicing,
	onStrumVoicing,
	onPlayFretNote,
	onPlayNoteSequence,
}: GuitarFretboardProps) {
	const [overlayMode, setOverlayMode] =
		useState<FretboardOverlayMode>("voicing");
	const [showChromaticPassing, setShowChromaticPassing] =
		useState<boolean>(false);
	const [labelMode, setLabelMode] = useState<FretboardLabelMode>("notes");
	const [pentatonicScope, setPentatonicScope] =
		useState<PentatonicScope>("auto");
	const [selectedPhraseId, setSelectedPhraseId] = useState<string | null>(null);
	const [detailsOpen, setDetailsOpen] = useState<boolean>(false);

	const qualityClass = getQualityClass(activeQuality);
	const rootNote = chordNotes[0] ?? "C";
	const rootPc = noteToPitchClass(rootNote);
	const chordPcSet = new Set(chordNotes.map(noteToPitchClass));
	const scalePcSet = new Set(scalePitchClasses);
	const effectiveKeyRoot = keyRootName ?? scaleNoteNames[0] ?? rootNote;
	const effectiveKeyRootPc = noteToPitchClass(effectiveKeyRoot);
	const inferredKeyMode: KeyMode =
		keyMode ??
		(scalePitchClasses.length >= 3 &&
		mod12(scalePitchClasses[2] - effectiveKeyRootPc) === 3
			? "minor"
			: "major");

	const guide = buildGuitarScalePassGuide({
		keyRootNote: effectiveKeyRoot,
		keyMode: inferredKeyMode,
		scaleNotes: scaleNoteNames,
		chordRootNote: rootNote,
		chordQuality: activeQuality,
		chordKind,
		chordNotes,
		selectedVoicing,
		scope: pentatonicScope,
		overlayMode,
		preferFlats,
	});

	const pentatonicPcSet = new Set(guide.pentatonicPcs);
	const passingPcSet = new Set(guide.overlayPassingPcs);
	const resolveFretNoteName = createPitchClassNameResolver(
		chordNotes,
		scaleNoteNames,
		preferFlats,
	);

	let voicingMinFret = 0;
	let voicingMaxFret = 4;
	if (selectedVoicing) {
		const nonZeroFrets = selectedVoicing.frets.filter((f) => f > 0);
		if (selectedVoicing.baseFret === 0) {
			voicingMinFret = 0;
			voicingMaxFret = Math.max(
				4,
				...(nonZeroFrets.length > 0 ? nonZeroFrets : [3]),
			);
		} else if (nonZeroFrets.length > 0) {
			voicingMinFret = Math.max(1, Math.min(...nonZeroFrets) - 1);
			voicingMaxFret = Math.min(MAX_GUITAR_FRET, Math.max(...nonZeroFrets) + 1);
		}
	}

	const maxSongFret =
		activeSongStops && activeSongStops.length > 0
			? Math.max(...activeSongStops.map((s) => s.fret))
			: 0;
	const displayMaxFret = Math.min(
		MAX_SONG_GUITAR_FRET,
		Math.max(MAX_GUITAR_FRET, maxSongFret),
	);
	const fretNumbers = Array.from({ length: displayMaxFret }, (_, i) => i + 1);
	const getEffectiveOpenMidi = (stringIdx: number) =>
		(tuningMidi?.[stringIdx] ?? STANDARD_TUNING[stringIdx].openMidi) + capo;

	const songHitKeys = new Set<string>();
	const harmonicKeys = new Set<string>();
	const combinedSongMidi =
		activeSongMidi && activeSongMidi.length > 0
			? activeSongMidi
			: activeRunMidi !== null
				? [activeRunMidi]
				: null;

	if (activeSongStops && activeSongStops.length > 0) {
		for (const stop of activeSongStops) {
			if (
				stop.stringIndex >= 0 &&
				stop.stringIndex < STANDARD_TUNING.length &&
				stop.fret >= 0 &&
				stop.fret <= displayMaxFret
			) {
				const key = `${stop.stringIndex}-${stop.fret}`;
				songHitKeys.add(key);
				if (stop.technique === "harmonic") {
					harmonicKeys.add(key);
				}
			}
		}
	} else if (combinedSongMidi && combinedSongMidi.length > 0) {
		for (const midi of combinedSongMidi) {
			let matchedVoiced = false;
			if (selectedVoicing && activeSongMidi && activeSongMidi.length > 0) {
				selectedVoicing.notes.forEach((n, idx) => {
					if (n.midi === midi && n.fret >= 0) {
						songHitKeys.add(`${idx}-${n.fret}`);
						matchedVoiced = true;
					}
				});
			}
			if (!matchedVoiced) {
				let bestCell: { stringIdx: number; fret: number } | null = null;
				for (let sIdx = 0; sIdx < STANDARD_TUNING.length; sIdx++) {
					const fret = midi - getEffectiveOpenMidi(sIdx);
					if (fret >= 0 && fret <= displayMaxFret) {
						if (!bestCell || fret < bestCell.fret) {
							bestCell = { stringIdx: sIdx, fret };
						}
					}
				}
				if (bestCell) {
					songHitKeys.add(`${bestCell.stringIdx}-${bestCell.fret}`);
				}
			}
		}
	}

	const playSequence = (midiNotes: number[], stepMs = 220) => {
		if (onPlayNoteSequence) {
			onPlayNoteSequence(midiNotes, stepMs);
		} else if (midiNotes.length > 0) {
			onPlayFretNote(midiNotes[0]);
		}
	};

	const activePhrase =
		guide.passingPhrases.find((p) => p.id === selectedPhraseId) ??
		guide.passingPhrases[0];

	const nutX = 64;
	const fretWidth = displayMaxFret > MAX_GUITAR_FRET ? 38 : 48;
	const topY = 22;
	const stringGap = 24;
	const totalWidth = nutX + displayMaxFret * fretWidth + 28;
	const totalHeight = 178;
	const bottomY = topY + 5 * stringGap;

	return (
		<div className="guitar-wrap">
			<div className="guitar-top-bar">
				<div className="guitar-title-group">
					{selectedVoicing && (
						<span className="guitar-voicing-summary">
							<strong>{selectedVoicing.name}</strong> ·{" "}
							<code>
								{selectedVoicing.frets
									.map((f) => (f < 0 ? "x" : String(f)))
									.join(" ")}
							</code>
						</span>
					)}
				</div>

				<div className="guitar-controls">
					<div
						className="segmented-control"
						role="group"
						aria-label="Fretboard display mode"
					>
						{(
							[
								["voicing", "Voicing"],
								["chordTones", "All Notes"],
								["pentatonic", "Pentatonic"],
								["scale", "Scale"],
							] as const
						).map(([modeKey, label]) => (
							<button
								key={modeKey}
								type="button"
								className={`seg-btn ${overlayMode === modeKey ? "is-active" : ""}`}
								onClick={() => setOverlayMode(modeKey)}
							>
								{label}
							</button>
						))}
					</div>

					<button
						type="button"
						className={`guitar-passing-toggle ${
							showChromaticPassing ? "is-active" : ""
						}`}
						aria-pressed={showChromaticPassing}
						onClick={() => setShowChromaticPassing((prev) => !prev)}
						title="Overlay chromatic passing notes (1-fret bridges between scale tones)"
					>
						+ Chromatic
					</button>

					<div
						className="segmented-control"
						role="group"
						aria-label="Fret marker label mode"
					>
						{(
							[
								["notes", "Notes"],
								["intervals", "Intervals"],
							] as const
						).map(([modeKey, label]) => (
							<button
								key={modeKey}
								type="button"
								className={`seg-btn ${labelMode === modeKey ? "is-active" : ""}`}
								onClick={() => setLabelMode(modeKey)}
							>
								{label}
							</button>
						))}
					</div>

					{selectedVoicing && (
						<button
							type="button"
							className="pill-action-btn"
							onClick={() => onStrumVoicing(selectedVoicing)}
							title="Strum the selected guitar chord voicing"
						>
							<IconPlay size={11} />
							<span>Strum</span>
						</button>
					)}
				</div>
			</div>

			{voicings.length > 0 && (
				<div
					className="voicing-pills-row"
					role="group"
					aria-label="Chord fretboard voicings"
				>
					<span className="voicing-row-label">Voicings:</span>
					{voicings.map((v) => (
						<button
							key={v.id}
							type="button"
							className={`voicing-pill ${qualityClass} ${
								selectedVoicing?.id === v.id ? "is-selected" : ""
							}`}
							onClick={() => onSelectVoicing(v)}
						>
							<span className="voicing-pill-name">{v.name}</span>
							<span className="voicing-pill-pos">{v.positionLabel}</span>
						</button>
					))}
				</div>
			)}

			<div className="fretboard-scroll">
				<svg
					viewBox={`0 0 ${totalWidth} ${totalHeight}`}
					className="fretboard-svg"
					role="group"
					aria-label="Interactive 15-fret guitar fretboard in standard tuning E A D G B E"
				>
					<rect
						x={nutX}
						y={topY - 12}
						width={displayMaxFret * fretWidth}
						height={bottomY - topY + 24}
						rx={6}
						className="fretboard-neck"
					/>

					{fretNumbers.map((fret) => {
						const cx = nutX + (fret - 0.5) * fretWidth;
						if (fret === 12) {
							return (
								<g key={`inlay-${fret}`}>
									<circle
										cx={cx}
										cy={topY + 1.5 * stringGap}
										r={4.2}
										className="fret-inlay"
									/>
									<circle
										cx={cx}
										cy={topY + 3.5 * stringGap}
										r={4.2}
										className="fret-inlay"
									/>
								</g>
							);
						}
						if (SINGLE_INLAY_FRETS.has(fret)) {
							return (
								<circle
									key={`inlay-${fret}`}
									cx={cx}
									cy={topY + 2.5 * stringGap}
									r={4.2}
									className="fret-inlay"
								/>
							);
						}
						return null;
					})}

					<line
						x1={nutX}
						y1={topY - 12}
						x2={nutX}
						y2={bottomY + 12}
						className="fret-nut"
					/>
					{fretNumbers.map((fret) => {
						const x = nutX + fret * fretWidth;
						return (
							<line
								key={`wire-${fret}`}
								x1={x}
								y1={topY - 12}
								x2={x}
								y2={bottomY + 12}
								className="fret-wire"
							/>
						);
					})}

					<text
						x={nutX - 18}
						y={bottomY + 28}
						textAnchor="middle"
						className="fret-num-label"
					>
						0
					</text>
					{fretNumbers.map((fret) => (
						<text
							key={`fnum-${fret}`}
							x={nutX + (fret - 0.5) * fretWidth}
							y={bottomY + 28}
							textAnchor="middle"
							className={`fret-num-label ${
								SINGLE_INLAY_FRETS.has(fret) || fret === 12
									? "is-marker-fret"
									: ""
							}`}
						>
							{fret}
						</text>
					))}

					{VISUAL_ROWS.map((stringIdx, rowIdx) => {
						const info = STANDARD_TUNING[stringIdx];
						const y = topY + rowIdx * stringGap;
						const strokeW = 1.0 + rowIdx * 0.28;
						const voicedFret = selectedVoicing
							? selectedVoicing.frets[stringIdx]
							: -99;
						const effectiveOpenMidi = getEffectiveOpenMidi(stringIdx);
						const effectiveOpenPc = mod12(effectiveOpenMidi);

						return (
							<g key={`str-${info.stringNumber}`}>
								<text
									x={14}
									y={y}
									textAnchor="middle"
									dominantBaseline="central"
									className="string-tuning-label"
								>
									{info.label}
								</text>

								{overlayMode === "voicing" &&
									selectedVoicing &&
									voicedFret === -1 && (
										<text
											x={30}
											y={y}
											textAnchor="middle"
											dominantBaseline="central"
											className="fret-muted-x"
										>
											×
										</text>
									)}

								<line
									x1={nutX}
									y1={y}
									x2={nutX + displayMaxFret * fretWidth}
									y2={y}
									strokeWidth={strokeW}
									className="guitar-string-line"
								/>

								{Array.from({ length: displayMaxFret + 1 }, (_, fret) => {
									const cx =
										fret === 0 ? nutX - 18 : nutX + (fret - 0.5) * fretWidth;
									const midi = effectiveOpenMidi + fret;
									const pc = mod12(effectiveOpenPc + fret);
									const isVoicedHere =
										selectedVoicing !== null && voicedFret === fret;
									const isChordTone = chordPcSet.has(pc);
									const isRoot = pc === rootPc;
									const isPentatonicTone = pentatonicPcSet.has(pc);
									const isScaleTone = scalePcSet.has(pc);
									const isPassingTone = passingPcSet.has(pc);
									const inVoicingWindow =
										fret >= voicingMinFret && fret <= voicingMaxFret;

									const noteName = resolveFretNoteName(pc);
									const chordIntervalName =
										chordKind && isChordTone
											? getIntervalLabel(rootPc, pc, chordKind)
											: null;

									const cellKey = `${stringIdx}-${fret}`;
									const isSongHit = songHitKeys.has(cellKey);
									const isHarmonicHit = harmonicKeys.has(cellKey);

									let dotState: DotKind = "none";
									if (isSongHit) {
										dotState = "primary";
									} else if (overlayMode === "voicing" && selectedVoicing) {
										if (isVoicedHere) {
											dotState = "primary";
										} else if (!(fret === 0 && voicedFret === -1)) {
											if (isChordTone) {
												dotState = "ghost-chord";
											} else if (
												showChromaticPassing &&
												isPassingTone &&
												inVoicingWindow
											) {
												dotState = "chromatic";
											}
										}
									} else if (isChordTone) {
										dotState = "primary";
									} else if (overlayMode === "pentatonic" && isPentatonicTone) {
										dotState = "pentatonic";
									} else if (overlayMode === "scale" && isScaleTone) {
										dotState = "scale";
									} else if (showChromaticPassing && isPassingTone) {
										dotState = "chromatic";
									}

									let dotLabel = noteName;
									if (labelMode === "intervals") {
										if (dotState === "primary" || dotState === "ghost-chord") {
											dotLabel =
												chordIntervalName ??
												getChromaticDegreeLabel(rootPc, pc, preferFlats);
										} else if (dotState !== "none") {
											const refRootPc =
												dotState === "scale" ||
												(dotState === "chromatic" && overlayMode === "scale")
													? effectiveKeyRootPc
													: guide.pentatonicRootPc;
											dotLabel = getChromaticDegreeLabel(
												refRootPc,
												pc,
												preferFlats,
											);
										}
									}

									const dotStyle =
										dotState === "none" ? null : DOT_STYLE_BY_KIND[dotState];

									return (
										<g
											key={`cell-${stringIdx}-${fret}`}
											role="button"
											tabIndex={0}
											aria-label={`String ${info.stringNumber} (${info.label}) fret ${fret}: ${noteName}${dotStyle?.ariaSuffix ?? ""}`}
											className="fret-hit-cell"
											onClick={() => onPlayFretNote(midi)}
											onKeyDown={(e) =>
												handleSvgButtonKeyDown(e, () => onPlayFretNote(midi))
											}
										>
											<rect
												x={
													fret === 0 ? nutX - 31 : nutX + (fret - 1) * fretWidth
												}
												y={y - stringGap / 2}
												width={fret === 0 ? 28 : fretWidth}
												height={stringGap}
												fill="transparent"
											/>

											{dotState !== "none" && dotStyle && (
												<g
													className={getDotGroupClass(
														dotState,
														qualityClass,
														isSongHit,
														isHarmonicHit,
													)}
												>
													{isSongHit &&
														(isHarmonicHit ? (
															<polygon
																points={`${cx},${y - 15} ${cx + 15},${y} ${cx},${y + 15} ${cx - 15},${y}`}
																className="song-hit-harmonic"
															/>
														) : (
															<circle
																cx={cx}
																cy={y}
																r={14}
																className="song-hit-halo"
															/>
														))}
													<circle
														cx={cx}
														cy={y}
														r={dotStyle.radius}
														className={`${dotStyle.bgClass}${
															dotStyle.supportsRootRing && isRoot
																? " is-root-ring"
																: ""
														}`}
													/>
													<text
														x={cx}
														y={y + 0.5}
														textAnchor="middle"
														dominantBaseline="central"
														className={dotStyle.textClass}
													>
														{dotLabel}
													</text>
												</g>
											)}
										</g>
									);
								})}
							</g>
						);
					})}
				</svg>
			</div>

			<div className="fretboard-footer-bar">
				<div className="fretboard-legend" aria-label="Fretboard marker legend">
					<span className="legend-chip">
						<span className={`legend-dot is-primary ${qualityClass}`} />
						<span>Chord tone</span>
					</span>
					{overlayMode === "voicing" && (
						<span className="legend-chip">
							<span className={`legend-dot is-ghost ${qualityClass}`} />
							<span>Other chord octave</span>
						</span>
					)}
					{overlayMode === "pentatonic" && (
						<span className="legend-chip">
							<span className="legend-dot is-pentatonic" />
							<span>Pentatonic ({guide.formula})</span>
						</span>
					)}
					{overlayMode === "scale" && (
						<span className="legend-chip">
							<span className="legend-dot is-scale" />
							<span>Diatonic scale</span>
						</span>
					)}
					{showChromaticPassing && (
						<span className="legend-chip">
							<span className="legend-dot is-chromatic" />
							<span>
								Chromatic passing (
								{overlayMode === "voicing" ? "around grip" : "1-fret bridges"})
							</span>
						</span>
					)}
				</div>

				<button
					type="button"
					className={`drawer-toggle-btn ${detailsOpen ? "is-open" : ""}`}
					aria-expanded={detailsOpen}
					aria-controls="guitar-details-drawer"
					onClick={() => setDetailsOpen((open) => !open)}
				>
					<span>Guide &amp; String Breakdown</span>
					<IconChevronDown size={12} />
				</button>
			</div>

			<div
				id="guitar-details-drawer"
				className="guitar-details-drawer"
				hidden={!detailsOpen}
			>
				{selectedVoicing && (
					<div className="voicing-breakdown">
						<span className="breakdown-label">Strings (6 → 1):</span>
						<div className="breakdown-strings">
							{selectedVoicing.notes.map((n, idx) => {
								const info = STANDARD_TUNING[idx];
								const isMuted = n.fret < 0;
								return (
									<button
										key={info.stringNumber}
										type="button"
										disabled={isMuted}
										className={`breakdown-cell ${isMuted ? "is-muted" : ""} ${
											n.intervalLabel === "R" ? "is-root" : ""
										}`}
										onClick={() => {
											if (n.midi !== null) onPlayFretNote(n.midi);
										}}
										title={
											isMuted
												? `String ${info.stringNumber} (${info.label}) muted`
												: `Play ${n.noteName} (fret ${n.fret})`
										}
									>
										<span className="bd-str">{info.label}</span>
										<span className="bd-fret">{isMuted ? "×" : n.fret}</span>
										<span className="bd-meta">
											{isMuted ? "—" : `${n.noteName} · ${n.intervalLabel}`}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				)}

				<div
					className="guitar-scale-guide"
					aria-label="Pentatonic scale and chromatic passing notes guide"
				>
					<section className="guitar-guide-card">
						<div className="guitar-guide-head">
							<div className="guitar-guide-title-row">
								<span className="guitar-guide-kicker is-pent">Pentatonic</span>
								<strong className="guitar-guide-title">
									{guide.pentatonicName}
								</strong>
								<span className="guitar-guide-formula">{guide.formula}</span>
							</div>

							<div className="guitar-guide-actions">
								{guide.hasDistinctChordPentatonic && (
									<div
										className="segmented-control segmented-xs"
										role="group"
										aria-label="Pentatonic scale basis"
									>
										<button
											type="button"
											className={`seg-btn ${guide.activeScope === "key" ? "is-active" : ""}`}
											onClick={() => setPentatonicScope("key")}
											title={guide.keyPentatonicName}
										>
											Key
										</button>
										<button
											type="button"
											className={`seg-btn ${guide.activeScope === "chord" ? "is-active" : ""}`}
											onClick={() => setPentatonicScope("chord")}
											title={guide.chordPentatonicName}
										>
											Chord
										</button>
									</div>
								)}
								<button
									type="button"
									className={`guitar-mini-btn ${
										overlayMode === "pentatonic" ? "is-active" : ""
									}`}
									onClick={() =>
										setOverlayMode((m) =>
											m === "pentatonic" ? "voicing" : "pentatonic",
										)
									}
									title="Toggle Pentatonic notes on the guitar fretboard"
								>
									{overlayMode === "pentatonic" ? "On Neck ✓" : "View on Neck"}
								</button>
								<button
									type="button"
									className="guitar-mini-btn is-play"
									onClick={() => playSequence(guide.pentatonicMidi, 220)}
									title={`Play ${guide.pentatonicName} ascending on guitar`}
								>
									<IconPlay size={10} />
									<span>Hear</span>
								</button>
							</div>
						</div>

						<div className="guitar-pent-notes">
							{guide.pentatonicNotes.map((note, idx) => {
								const isChordTone = chordPcSet.has(guide.pentatonicPcs[idx]);
								return (
									<button
										key={`${note}-${guide.degrees[idx]}`}
										type="button"
										className={`guitar-pent-pill ${
											isChordTone ? "is-chord-tone" : ""
										}`}
										onClick={() =>
											onPlayFretNote(guide.pentatonicMidi[idx] ?? 48)
										}
										title={`Play ${note} (${guide.degrees[idx]} of ${guide.pentatonicName})`}
									>
										<span className="pent-deg">{guide.degrees[idx]}</span>
										<span className="pent-note">{note}</span>
									</button>
								);
							})}
						</div>

						<p className="guitar-guide-desc">
							<strong>Relative twin:</strong> {guide.relativeTwinName}.{" "}
							{guide.omittedSummary}
						</p>
						<p className="guitar-guide-meta">
							<strong>Neck pocket:</strong> {guide.cagedBoxTip}
						</p>
					</section>

					<section className="guitar-guide-card">
						<div className="guitar-guide-head">
							<div className="guitar-guide-title-row">
								<span className="guitar-guide-kicker is-pass">Chromatic</span>
								<strong className="guitar-guide-title">Passing Notes</strong>
								<span className="guitar-guide-formula">1-fret bridges</span>
							</div>

							<div className="guitar-guide-actions">
								<button
									type="button"
									className={`guitar-mini-btn ${
										showChromaticPassing ? "is-active" : ""
									}`}
									aria-pressed={showChromaticPassing}
									onClick={() => setShowChromaticPassing((prev) => !prev)}
									title="Highlight chromatic passing frets on the guitar neck"
								>
									{showChromaticPassing ? "On Neck ✓" : "Show on Neck"}
								</button>
							</div>
						</div>

						<p className="guitar-guide-desc">
							Dashed frets lie halfway inside pentatonic &amp; scale gaps — step
							through them on weak beats and resolve onto a nearby chord tone.
						</p>

						<div
							className="chromatic-phrases-row"
							role="group"
							aria-label="Playable chromatic passing examples"
						>
							{guide.passingPhrases.map((phrase) => {
								const isSelected = activePhrase?.id === phrase.id;
								return (
									<button
										key={phrase.id}
										type="button"
										className={`chromatic-phrase-btn ${
											isSelected ? "is-selected" : ""
										}`}
										onClick={() => {
											setSelectedPhraseId(phrase.id);
											playSequence(phrase.midi, 230);
										}}
										title={`Play ${phrase.label}: ${phrase.notes.join(" → ")}`}
									>
										<span className="cp-top">
											<IconPlay size={9} />
											<span className="cp-label">{phrase.label}</span>
										</span>
										<span className="cp-notes">{phrase.notes.join(" → ")}</span>
										<span className="cp-tag">{phrase.tag}</span>
									</button>
								);
							})}
						</div>

						{activePhrase && (
							<p className="guitar-guide-meta">
								<strong>Tip ({activePhrase.label}):</strong> {activePhrase.tip}
							</p>
						)}
					</section>
				</div>
			</div>
		</div>
	);
}
