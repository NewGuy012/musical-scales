import { useState, type KeyboardEvent } from "react";
import {
	CELLO_TUNING,
	MAX_CELLO_SEMITONE,
	type CelloVoicing,
} from "../theory/celloFingerboard";
import {
	mod12,
	noteToPitchClass,
	type ChordQuality,
} from "../theory/circleOfFifths";
import {
	getChordToneNameMap,
	getIntervalLabel,
	type GuitarChordKind,
} from "../theory/guitarFretboard";

export type CelloOverlayMode = "voicing" | "all-tones" | "scale";
export type CelloLabelMode = "notes" | "intervals" | "fingers";

export interface CelloFingerboardProps {
	chordLabel: string;
	chordQuality: ChordQuality;
	chordKind: GuitarChordKind | null;
	chordRoleLabel?: string;
	chordNotes: string[];
	scaleNotes: string[];
	keyRootName?: string;
	preferFlats: boolean;
	voicings: CelloVoicing[];
	activeVoicing: CelloVoicing | null;
	onSelectVoicing: (voicing: CelloVoicing) => void;
	onRollVoicing: (voicing: CelloVoicing) => void;
	onPlayNote: (midi: number, noteName: string) => void;
}

const STRING_SUBSCRIPTS = ["IV · C", "III · G", "II · D", "I · A"];
const STRING_OCTAVE_LABELS = ["C2", "G2", "D3", "A3"];
// Classic pedagogical cello intonation & harmonic reference semitones
const INTONATION_GUIDE_SEMITONES = new Set([2, 4, 5, 7, 9, 12]);
const HARMONIC_DOT_SEMITONES = new Set([5, 7, 12]);

const SVG_WIDTH = 900;
const SVG_HEIGHT = 238;
const OPEN_COL_X = 68;
const NUT_X = 96;
const NECK_RIGHT = 878;
const TOP_PAD = 42;
const BOTTOM_PAD = 34;
const ROW_STEP = (SVG_HEIGHT - TOP_PAD - BOTTOM_PAD) / 3;
const SEMI_STEP = (NECK_RIGHT - NUT_X) / MAX_CELLO_SEMITONE;

function semitoneX(semitone: number): number {
	if (semitone <= 0) return OPEN_COL_X;
	return NUT_X + (semitone - 0.5) * SEMI_STEP;
}

function getQualityClass(quality: ChordQuality): string {
	if (quality === "major") return "guitar-active-major";
	if (quality === "minor") return "guitar-active-minor";
	return "guitar-active-dim";
}

function getPianoBadgeClass(quality: ChordQuality): string {
	if (quality === "major") return "piano-active-major";
	if (quality === "minor") return "piano-active-minor";
	return "piano-active-dim";
}

function buildScalePcMap(scaleNotes: string[]): Map<number, string> {
	const map = new Map<number, string>();
	for (const note of scaleNotes) {
		map.set(noteToPitchClass(note), note);
	}
	return map;
}

export function CelloFingerboard({
	chordLabel,
	chordQuality,
	chordKind,
	chordRoleLabel,
	chordNotes,
	scaleNotes,
	keyRootName,
	preferFlats,
	voicings,
	activeVoicing,
	onSelectVoicing,
	onRollVoicing,
	onPlayNote,
}: CelloFingerboardProps) {
	const [overlayMode, setOverlayMode] = useState<CelloOverlayMode>("voicing");
	const [labelMode, setLabelMode] = useState<CelloLabelMode>("notes");

	const rootNote = chordNotes[0] ?? keyRootName ?? scaleNotes[0] ?? "C";
	const rootPc = noteToPitchClass(rootNote);
	const resolvedKind = chordKind ?? "major";
	const resolveChordNote = getChordToneNameMap(chordNotes, preferFlats);
	const chordPcSet = new Set(chordNotes.map((n) => noteToPitchClass(n)));
	const scalePcMap = buildScalePcMap(scaleNotes);

	const activeByString = new Map<number, (typeof CELLO_TUNING)[number] & {
		semitone: number;
		finger: number | null;
		intervalLabel: string;
		noteName: string | null;
	}>();

	if (activeVoicing) {
		for (const vn of activeVoicing.notes) {
			activeByString.set(vn.stringIndex, {
				...CELLO_TUNING[vn.stringIndex],
				semitone: vn.semitone,
				finger: vn.finger,
				intervalLabel: vn.intervalLabel,
				noteName: vn.noteName,
			});
		}
	}

	const frameSummary = activeVoicing
		? activeVoicing.handBaseSemitone > 0
			? `LH Frame: semitones ${activeVoicing.handBaseSemitone}–${Math.min(
					MAX_CELLO_SEMITONE,
					activeVoicing.handBaseSemitone + 3,
				)}`
			: "Open string position"
		: "No voicing";

	const handleCellKeyDown = (
		event: KeyboardEvent<SVGGElement>,
		midi: number,
		noteName: string,
	) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onPlayNote(midi, noteName);
		}
	};

	const semitones = Array.from(
		{ length: MAX_CELLO_SEMITONE + 1 },
		(_, idx) => idx,
	);

	// Strings rendered top-to-bottom from highest pitch (I: A3) to lowest (IV: C2)
	const visualRows = [3, 2, 1, 0];

	return (
		<div className="cello-panel">
			<div className="cello-toolbar">
				<div className="cello-chord-summary">
					<span className={`piano-badge ${getPianoBadgeClass(chordQuality)}`}>
						{chordLabel}
					</span>
					{chordRoleLabel && (
						<span className="cello-role-pill">{chordRoleLabel}</span>
					)}
					<span className="cello-notes-readout">
						{chordNotes.join(" – ")}
						{activeVoicing
							? ` · ${activeVoicing.name} (${activeVoicing.positionLabel}) · ${frameSummary}`
							: ""}
					</span>
				</div>

				<div className="cello-controls-group">
					<button
						type="button"
						className="secondary-btn cello-roll-btn"
						disabled={!activeVoicing}
						onClick={() => activeVoicing && onRollVoicing(activeVoicing)}
						aria-label={`Bow roll ${chordLabel} cello chord`}
					>
						▶ Bow Roll
					</button>

					<div
						className="segmented-control"
						role="group"
						aria-label="Cello fingerboard overlay mode"
					>
						<button
							type="button"
							className={`seg-btn${overlayMode === "voicing" ? " is-active" : ""}`}
							onClick={() => setOverlayMode("voicing")}
						>
							Voicing + Neck
						</button>
						<button
							type="button"
							className={`seg-btn${overlayMode === "all-tones" ? " is-active" : ""}`}
							onClick={() => setOverlayMode("all-tones")}
						>
							All Positions
						</button>
						<button
							type="button"
							className={`seg-btn${overlayMode === "scale" ? " is-active" : ""}`}
							onClick={() => setOverlayMode("scale")}
						>
							Key Scale
						</button>
					</div>

					<div
						className="segmented-control"
						role="group"
						aria-label="Cello marker label mode"
					>
						<button
							type="button"
							className={`seg-btn${labelMode === "notes" ? " is-active" : ""}`}
							onClick={() => setLabelMode("notes")}
						>
							Notes
						</button>
						<button
							type="button"
							className={`seg-btn${labelMode === "intervals" ? " is-active" : ""}`}
							onClick={() => setLabelMode("intervals")}
						>
							Intervals
						</button>
						<button
							type="button"
							className={`seg-btn${labelMode === "fingers" ? " is-active" : ""}`}
							onClick={() => setLabelMode("fingers")}
						>
							Fingers
						</button>
					</div>
				</div>
			</div>

			<div
				className="voicing-pills-row"
				role="group"
				aria-label="Cello chord voicings"
			>
				{voicings.map((voicing) => {
					const isSelected = activeVoicing?.id === voicing.id;
					return (
						<button
							key={voicing.id}
							type="button"
							className={`voicing-pill${isSelected ? " is-active" : ""}`}
							aria-pressed={isSelected}
							onClick={() => onSelectVoicing(voicing)}
						>
							<span>{voicing.name}</span>
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
					aria-label={`Fretless cello fingerboard showing ${chordLabel} (${activeVoicing?.name ?? "notes"})`}
				>
					{/* Smooth ebony fretless fingerboard from nut to semitone 14 */}
					<rect
						x={NUT_X}
						y={TOP_PAD - 20}
						width={NECK_RIGHT - NUT_X}
						height={ROW_STEP * 3 + 40}
						rx={8}
						className="fretboard-neck"
					/>

					{/* Highlighted closed 4-semitone left-hand frame */}
					{activeVoicing && activeVoicing.handBaseSemitone > 0 && (
						<g>
							<rect
								x={
									NUT_X +
									(activeVoicing.handBaseSemitone - 1) * SEMI_STEP +
									3
								}
								y={TOP_PAD - 16}
								width={
									Math.min(
										4,
										MAX_CELLO_SEMITONE -
											activeVoicing.handBaseSemitone +
											1,
									) *
										SEMI_STEP -
									6
								}
								height={ROW_STEP * 3 + 32}
								rx={7}
								className="cello-hand-frame"
							/>
							<text
								x={
									NUT_X +
									(activeVoicing.handBaseSemitone - 1) * SEMI_STEP +
									9
								}
								y={SVG_HEIGHT - 8}
								className="cello-frame-caption"
							>
								LH Frame ({activeVoicing.positionLabel})
							</text>
						</g>
					)}

					{/* Semitone numbers & subtle dashed intonation guides (no frets) */}
					{semitones.map((semi) => {
						const centerX = semitoneX(semi);
						const dividerX = NUT_X + semi * SEMI_STEP;
						const isGuide = INTONATION_GUIDE_SEMITONES.has(semi);
						const isHarmonic = HARMONIC_DOT_SEMITONES.has(semi);

						return (
							<g key={`semi-${semi}`}>
								{semi === 0 && (
									<text x={OPEN_COL_X} y={17} textAnchor="middle" className="cello-semi-label is-guide">
										Open
									</text>
								)}
								{semi > 0 && (
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
												isGuide ? "cello-semi-label is-guide" : "cello-semi-label"
											}
										>
											{semi}
										</text>
									</>
								)}
								{isHarmonic && (
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

					{/* Bone/ebony nut at semitone 0 boundary */}
					<rect
						x={NUT_X - 3}
						y={TOP_PAD - 20}
						width={6}
						height={ROW_STEP * 3 + 40}
						rx={2}
						className="fret-nut"
					/>

					{/* Strings (top = I A3, bottom = IV C2) + clickable fingerboard stops */}
					{visualRows.map((stringIndex, visualIdx) => {
						const info = CELLO_TUNING[stringIndex];
						const y = TOP_PAD + visualIdx * ROW_STEP;
						const strokeWidth = 1.4 + (3 - stringIndex) * 0.48;
						const activeForString = activeByString.get(stringIndex);
						const isUnplayed = activeForString?.semitone === -1;

						return (
							<g key={`string-${info.stringNumber}`}>
								<text
									x={16}
									y={y + 4}
									className="cello-string-label"
								>
									{STRING_OCTAVE_LABELS[stringIndex]}
								</text>

								<line
									x1={OPEN_COL_X}
									y1={y}
									x2={NECK_RIGHT}
									y2={y}
									strokeWidth={strokeWidth}
									className="guitar-string-line"
								/>

								{/* Open-string status indicator when string is skipped */}
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
									const isScaleTone = scalePcMap.has(pc);
									const isActiveStop =
										activeForString !== undefined &&
										activeForString.semitone === semi;

									const chordSpell = resolveChordNote(pc);
									const scaleSpell = scalePcMap.get(pc) ?? chordSpell;
									const displayNote = isChordTone ? chordSpell : scaleSpell;
									const interval =
										getIntervalLabel(rootPc, pc, resolvedKind) ?? "";

									const showSingleNoteHighlight =
										!activeVoicing &&
										overlayMode === "voicing" &&
										isChordTone;
									const showGhostChord =
										!isActiveStop &&
										(showSingleNoteHighlight ||
											(overlayMode === "all-tones" && isChordTone));
									const showScaleDot =
										!isActiveStop &&
										overlayMode === "scale" &&
										(isChordTone || isScaleTone);

									let markerText = displayNote;
									if (labelMode === "intervals" && interval) {
										markerText = interval;
									} else if (labelMode === "fingers") {
										if (isActiveStop && activeForString.finger !== null) {
											markerText = String(activeForString.finger);
										} else if (semi === 0) {
											markerText = "0";
										} else {
											markerText = interval || displayNote;
										}
									}

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
											onKeyDown={(e) => handleCellKeyDown(e, midi, displayNote)}
										>
											<rect
												x={semi === 0 ? OPEN_COL_X - 18 : x - SEMI_STEP / 2}
												y={y - ROW_STEP / 2}
												width={semi === 0 ? 36 : SEMI_STEP}
												height={ROW_STEP}
												fill="transparent"
											/>

											{showGhostChord && (
												<g
													className={`fret-dot-ghost ${getQualityClass(chordQuality)}`}
												>
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
														{labelMode === "intervals" && interval
															? interval
															: displayNote}
													</text>
												</g>
											)}

											{showScaleDot && (
												<g
													className={`fret-dot-scale ${getQualityClass(chordQuality)}`}
												>
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
														{labelMode === "intervals" && interval
															? interval
															: displayNote}
													</text>
												</g>
											)}

											{isActiveStop && (
												<g
													className={`fret-dot-primary ${getQualityClass(chordQuality)}`}
												>
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
				<div className="voicing-breakdown cello-breakdown-wrap">
					<div className="cello-breakdown-header">
						<span className="breakdown-label">
							Hand placement &amp; string breakdown (Strings IV → I)
						</span>
						<span className="cello-breakdown-hint">
							Click any string position above to audition pitch · Fingers 1–4 span
							a closed 4-semitone frame
						</span>
					</div>
					<div className="cello-breakdown-strings">
						{activeVoicing.notes.map((vn) => {
							const isRoot =
								vn.pc !== null && vn.pc === rootPc;
							return (
								<div
									key={`bd-${vn.stringIndex}`}
									className={`breakdown-cell${
										vn.semitone === -1 ? " is-muted" : ""
									}${isRoot ? " is-root" : ""}`}
								>
									<span className="bd-str">
										{STRING_SUBSCRIPTS[vn.stringIndex]}
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
			)}
		</div>
	);
}
