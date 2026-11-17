import { useState } from "react";
import {
	BOWED_TUNINGS,
	type BowedInstrument,
	type BowedVoicing,
	MAX_BOWED_SEMITONE,
} from "../theory/celloFingerboard";
import {
	type ChordQuality,
	getGuitarQualityClass,
	handleSvgButtonKeyDown,
	mod12,
	noteToPitchClass,
} from "../theory/circleOfFifths";
import {
	type GuitarChordKind,
	createPitchClassNameResolver,
	getIntervalLabel,
} from "../theory/guitarFretboard";
import type { BowedSongStop } from "../theory/songExamples";
import { IconChevronDown, IconPlay } from "./Icons";

export type BowedOverlayMode = "voicing" | "all-tones" | "scale";
export type BowedLabelMode = "notes" | "intervals" | "fingers";

export interface BowedFingerboardProps {
	instrument: BowedInstrument;
	chordLabel: string;
	chordQuality: ChordQuality;
	chordKind: GuitarChordKind | null;
	chordNotes: string[];
	scaleNotes: string[];
	keyRootName?: string;
	preferFlats: boolean;
	voicings: BowedVoicing[];
	activeVoicing: BowedVoicing | null;
	activeSongStops?: BowedSongStop[] | null;
	onSelectVoicing: (voicing: BowedVoicing) => void;
	onRollVoicing: (voicing: BowedVoicing) => void;
	onPlayNote: (midi: number, noteName: string) => void;
}

const BOWED_PRESETS: Record<
	BowedInstrument,
	{
		title: string;
		stringSubscripts: readonly [string, string, string, string];
		stringOctaveLabels: readonly [string, string, string, string];
		stringWidths: readonly [number, number, number, number];
	}
> = {
	cello: {
		title: "Cello",
		stringSubscripts: ["IV · C", "III · G", "II · D", "I · A"],
		stringOctaveLabels: ["C2", "G2", "D3", "A3"],
		stringWidths: [2.84, 2.36, 1.88, 1.4],
	},
	violin: {
		title: "Violin",
		stringSubscripts: ["IV · G", "III · D", "II · A", "I · E"],
		stringOctaveLabels: ["G3", "D4", "A4", "E5"],
		stringWidths: [1.95, 1.65, 1.35, 1.08],
	},
};

const INTONATION_GUIDE_SEMITONES = new Set([2, 4, 5, 7, 9, 12]);
const HARMONIC_DOT_SEMITONES = new Set([5, 7, 12]);
const VISUAL_ROWS = [3, 2, 1, 0] as const;

const SVG_WIDTH = 900;
const SVG_HEIGHT = 238;
const OPEN_COL_X = 68;
const NUT_X = 96;
const NECK_RIGHT = 878;
const TOP_PAD = 42;
const BOTTOM_PAD = 34;
const ROW_STEP = (SVG_HEIGHT - TOP_PAD - BOTTOM_PAD) / 3;

export function BowedFingerboard({
	instrument,
	chordLabel,
	chordQuality,
	chordKind,
	chordNotes,
	scaleNotes,
	keyRootName,
	preferFlats,
	voicings,
	activeVoicing,
	activeSongStops = null,
	onSelectVoicing,
	onRollVoicing,
	onPlayNote,
}: BowedFingerboardProps) {
	const {
		title: instrumentTitle,
		stringSubscripts,
		stringOctaveLabels,
		stringWidths,
	} = BOWED_PRESETS[instrument];
	const instrumentSlug = instrument;
	const tuning = BOWED_TUNINGS[instrument];
	const maxSemitone = MAX_BOWED_SEMITONE;
	const [overlayMode, setOverlayMode] = useState<BowedOverlayMode>("voicing");
	const [labelMode, setLabelMode] = useState<BowedLabelMode>("notes");
	const [breakdownOpen, setBreakdownOpen] = useState<boolean>(false);

	const semitones = Array.from({ length: maxSemitone + 1 }, (_, idx) => idx);
	const semiStep = (NECK_RIGHT - NUT_X) / maxSemitone;
	const semitoneX = (semitone: number) =>
		semitone <= 0 ? OPEN_COL_X : NUT_X + (semitone - 0.5) * semiStep;

	const rootNote = chordNotes[0] ?? keyRootName ?? scaleNotes[0] ?? "C";
	const rootPc = noteToPitchClass(rootNote);
	const resolvedKind = chordKind ?? "major";
	const qualityClass = getGuitarQualityClass(chordQuality);
	const chordPcSet = new Set(chordNotes.map(noteToPitchClass));
	const scalePcSet = new Set(scaleNotes.map(noteToPitchClass));
	const resolveNoteName = createPitchClassNameResolver(
		chordNotes,
		scaleNotes,
		preferFlats,
	);

	const activeByString = new Map(
		activeVoicing?.notes.map((vn) => [vn.stringIndex, vn]),
	);

	const frameSummary = activeVoicing
		? activeVoicing.handBaseSemitone > 0
			? `LH Frame: semitones ${activeVoicing.handBaseSemitone}–${Math.min(
					maxSemitone,
					activeVoicing.handBaseSemitone + 3,
				)}`
			: "Open string position"
		: "No voicing";

	return (
		<div className="cello-panel">
			<div className="cello-toolbar">
				<div className="cello-chord-summary">
					<span className="cello-notes-readout">
						<strong>{chordNotes.join(" – ")}</strong>
						{activeVoicing
							? ` · ${activeVoicing.name} (${activeVoicing.positionLabel}) · ${frameSummary}`
							: ""}
					</span>
				</div>

				<div className="cello-controls-group">
					<div
						className="segmented-control"
						role="group"
						aria-label={`${instrumentTitle} fingerboard overlay mode`}
					>
						{(
							[
								["voicing", "Voicing"],
								["all-tones", "All Notes"],
								["scale", "Scale"],
							] as const
						).map(([modeKey, label]) => (
							<button
								key={modeKey}
								type="button"
								className={`seg-btn${overlayMode === modeKey ? " is-active" : ""}`}
								onClick={() => setOverlayMode(modeKey)}
							>
								{label}
							</button>
						))}
					</div>

					<div
						className="segmented-control"
						role="group"
						aria-label={`${instrumentTitle} marker label mode`}
					>
						{(
							[
								["notes", "Notes"],
								["intervals", "Intervals"],
								["fingers", "Fingers"],
							] as const
						).map(([modeKey, label]) => (
							<button
								key={modeKey}
								type="button"
								className={`seg-btn${labelMode === modeKey ? " is-active" : ""}`}
								onClick={() => setLabelMode(modeKey)}
							>
								{label}
							</button>
						))}
					</div>

					<button
						type="button"
						className="pill-action-btn cello-roll-btn"
						disabled={!activeVoicing}
						onClick={() => activeVoicing && onRollVoicing(activeVoicing)}
						aria-label={`Bow roll ${chordLabel} ${instrumentSlug} chord`}
					>
						<IconPlay size={11} />
						<span>Bow Roll</span>
					</button>
				</div>
			</div>

			<div
				className="voicing-pills-row"
				role="group"
				aria-label={`${instrumentTitle} chord voicings`}
			>
				<span className="voicing-row-label">Voicings:</span>
				{voicings.map((voicing) => {
					const isSelected = activeVoicing?.id === voicing.id;
					return (
						<button
							key={voicing.id}
							type="button"
							className={`voicing-pill ${qualityClass}${isSelected ? " is-selected" : ""}`}
							aria-pressed={isSelected}
							onClick={() => onSelectVoicing(voicing)}
						>
							<span className="voicing-pill-name">{voicing.name}</span>
							<span className="voicing-pill-meta">{voicing.positionLabel}</span>
						</button>
					);
				})}
			</div>

			<div className="cello-neck-scroll">
				<svg
					className="cello-svg"
					viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
					role="img"
					aria-label={`Fretless ${instrumentSlug} fingerboard showing ${chordLabel} (${activeVoicing?.name ?? "notes"})`}
				>
					<rect
						x={NUT_X}
						y={TOP_PAD - 20}
						width={NECK_RIGHT - NUT_X}
						height={ROW_STEP * 3 + 40}
						rx={8}
						className="fretboard-neck"
					/>

					{activeVoicing && activeVoicing.handBaseSemitone > 0 && (
						<g>
							<rect
								x={NUT_X + (activeVoicing.handBaseSemitone - 1) * semiStep + 3}
								y={TOP_PAD - 16}
								width={
									Math.min(
										4,
										maxSemitone - activeVoicing.handBaseSemitone + 1,
									) *
										semiStep -
									6
								}
								height={ROW_STEP * 3 + 32}
								rx={7}
								className="cello-hand-frame"
							/>
							<text
								x={NUT_X + (activeVoicing.handBaseSemitone - 1) * semiStep + 9}
								y={SVG_HEIGHT - 8}
								className="cello-frame-caption"
							>
								LH Frame ({activeVoicing.positionLabel})
							</text>
						</g>
					)}

					{semitones.map((semi) => {
						const centerX = semitoneX(semi);
						const dividerX = NUT_X + semi * semiStep;
						const isGuide = INTONATION_GUIDE_SEMITONES.has(semi);

						return (
							<g key={`semi-${semi}`}>
								{semi === 0 ? (
									<text
										x={OPEN_COL_X}
										y={17}
										textAnchor="middle"
										className="cello-semi-label is-guide"
									>
										Open
									</text>
								) : (
									<>
										<line
											x1={dividerX}
											y1={TOP_PAD - 18}
											x2={dividerX}
											y2={TOP_PAD + ROW_STEP * 3 + 18}
											className={
												isGuide
													? "cello-guide-line is-major-guide"
													: "cello-guide-line"
											}
										/>
										<text
											x={centerX}
											y={17}
											textAnchor="middle"
											className={
												isGuide
													? "cello-semi-label is-guide"
													: "cello-semi-label"
											}
										>
											{semi}
										</text>
									</>
								)}
								{HARMONIC_DOT_SEMITONES.has(semi) && (
									<circle
										cx={centerX}
										cy={TOP_PAD + ROW_STEP * 1.5}
										r={3.5}
										className="cello-harmonic-marker"
									/>
								)}
							</g>
						);
					})}

					<rect
						x={NUT_X - 3}
						y={TOP_PAD - 20}
						width={6}
						height={ROW_STEP * 3 + 40}
						rx={2}
						className="fret-nut"
					/>

					{VISUAL_ROWS.map((stringIndex, visualIdx) => {
						const info = tuning[stringIndex];
						const y = TOP_PAD + visualIdx * ROW_STEP;
						const strokeWidth = stringWidths[stringIndex];
						const activeForString = activeByString.get(stringIndex);
						const isUnplayed = activeForString?.semitone === -1;

						return (
							<g key={`string-${info.stringNumber}`}>
								<text x={16} y={y + 4} className="cello-string-label">
									{stringOctaveLabels[stringIndex]}
								</text>

								<line
									x1={OPEN_COL_X}
									y1={y}
									x2={NECK_RIGHT}
									y2={y}
									strokeWidth={strokeWidth}
									className="guitar-string-line"
								/>

								{isUnplayed && (
									<text
										x={OPEN_COL_X - 20}
										y={y + 4}
										textAnchor="middle"
										className="cello-mute-x"
									>
										×
									</text>
								)}

								{semitones.map((semi) => {
									const x = semitoneX(semi);
									const midi = info.openMidi + semi;
									const pc = mod12(info.openPc + semi);
									const isRoot = pc === rootPc;
									const isChordTone = chordPcSet.has(pc);
									const isScaleTone = scalePcSet.has(pc);
									const isActiveStop = activeForString?.semitone === semi;
									const songHitStop =
										activeSongStops?.find(
											(stop) =>
												stop.stringIndex === stringIndex &&
												stop.semitone === semi,
										) ?? null;
									const isSongHit = songHitStop !== null;
									const isHarmonicHit = songHitStop?.technique === "harmonic";

									const displayNote = resolveNoteName(pc);
									const interval =
										getIntervalLabel(rootPc, pc, resolvedKind) ?? "";

									const showSingleNoteHighlight =
										!activeVoicing && overlayMode === "voicing" && isChordTone;
									const showGhostChord =
										!isActiveStop &&
										!isSongHit &&
										(showSingleNoteHighlight ||
											(overlayMode === "all-tones" && isChordTone));
									const showScaleDot =
										!isActiveStop &&
										!isSongHit &&
										overlayMode === "scale" &&
										(isChordTone || isScaleTone);

									let markerText = displayNote;
									if (labelMode === "intervals" && interval) {
										markerText = interval;
									} else if (labelMode === "fingers") {
										if (isActiveStop && activeForString.finger !== null) {
											markerText = String(activeForString.finger);
										} else if (songHitStop) {
											markerText = String(songHitStop.finger);
										} else if (semi === 0) {
											markerText = "0";
										} else {
											markerText = interval || displayNote;
										}
									}

									const secondaryText =
										labelMode === "intervals" && interval
											? interval
											: displayNote;

									return (
										<g
											key={`cell-${stringIndex}-${semi}`}
											role="button"
											tabIndex={0}
											className="cello-hit-cell"
											aria-label={`${info.label} string ${
												semi === 0 ? "open" : `semitone ${semi}`
											}, note ${displayNote}${interval ? ` (${interval})` : ""}`}
											onClick={() => onPlayNote(midi, displayNote)}
											onKeyDown={(e) =>
												handleSvgButtonKeyDown(e, () =>
													onPlayNote(midi, displayNote),
												)
											}
										>
											<rect
												x={semi === 0 ? OPEN_COL_X - 18 : x - semiStep / 2}
												y={y - ROW_STEP / 2}
												width={semi === 0 ? 36 : semiStep}
												height={ROW_STEP}
												fill="transparent"
											/>

											{showGhostChord && (
												<g className={`fret-dot-ghost ${qualityClass}`}>
													<circle
														cx={x}
														cy={y}
														r={11.5}
														className={`fret-dot-ghost-bg${isRoot ? " is-root-ring" : ""}`}
													/>
													<text
														x={x}
														y={y + 3.5}
														textAnchor="middle"
														className="fret-dot-ghost-text"
													>
														{secondaryText}
													</text>
												</g>
											)}

											{showScaleDot && (
												<g className={`fret-dot-scale ${qualityClass}`}>
													<circle
														cx={x}
														cy={y}
														r={isChordTone ? 11.5 : 9.5}
														className={
															isChordTone
																? `fret-dot-ghost-bg${isRoot ? " is-root-ring" : ""}`
																: "fret-dot-scale-bg"
														}
													/>
													<text
														x={x}
														y={y + 3.5}
														textAnchor="middle"
														className={
															isChordTone
																? "fret-dot-ghost-text"
																: "fret-dot-scale-text"
														}
													>
														{secondaryText}
													</text>
												</g>
											)}

											{(isActiveStop || isSongHit) && (
												<g
													className={`fret-dot-primary ${qualityClass}${
														isSongHit
															? isHarmonicHit
																? " is-song-hit is-harmonic"
																: " is-song-hit"
															: ""
													}`}
												>
													{isSongHit &&
														(isHarmonicHit ? (
															<polygon
																points={`${x},${y - 17} ${x + 17},${y} ${x},${y + 17} ${x - 17},${y}`}
																className="song-hit-harmonic"
															/>
														) : (
															<circle
																cx={x}
																cy={y}
																r={17}
																className="song-hit-halo"
															/>
														))}
													<circle
														cx={x}
														cy={y}
														r={13.5}
														className={`fret-dot-bg${isRoot ? " is-root-ring" : ""}`}
													/>
													<text
														x={x}
														y={y + 4}
														textAnchor="middle"
														className="fret-dot-text"
													>
														{markerText}
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

			{activeVoicing && (
				<>
					<div className="fretboard-footer-bar">
						<span className="cello-breakdown-hint">
							Fingers 1–4 span a 4-semitone LH frame ({frameSummary})
						</span>
						<button
							type="button"
							className={`drawer-toggle-btn ${breakdownOpen ? "is-open" : ""}`}
							aria-expanded={breakdownOpen}
							aria-controls={`${instrumentSlug}-breakdown-drawer`}
							onClick={() => setBreakdownOpen((open) => !open)}
						>
							<span>Strings IV → I Breakdown</span>
							<IconChevronDown size={12} />
						</button>
					</div>
					<div
						id={`${instrumentSlug}-breakdown-drawer`}
						className="voicing-breakdown cello-breakdown-wrap"
						hidden={!breakdownOpen}
					>
						<div className="cello-breakdown-strings">
							{activeVoicing.notes.map((vn) => {
								const isRoot = vn.pc !== null && vn.pc === rootPc;
								return (
									<div
										key={`bd-${vn.stringIndex}`}
										className={`breakdown-cell${
											vn.semitone === -1 ? " is-muted" : ""
										}${isRoot ? " is-root" : ""}`}
									>
										<span className="bd-str">
											{stringSubscripts[vn.stringIndex]}
										</span>
										{vn.semitone === -1 ? (
											<>
												<span className="bd-fret">×</span>
												<span className="bd-meta">Skip</span>
											</>
										) : (
											<>
												<span className="bd-fret">
													{vn.semitone === 0
														? "Open · 0"
														: `Semi ${vn.semitone} · F${vn.finger}`}
												</span>
												<span className="bd-meta">
													{vn.noteName} ({vn.intervalLabel})
												</span>
											</>
										)}
									</div>
								);
							})}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
