import { useState } from "react";
import { ChordQuality, mod12, noteToPitchClass } from "../theory/circleOfFifths";
import {
	GuitarChordKind,
	GuitarVoicing,
	MAX_GUITAR_FRET,
	STANDARD_TUNING,
	getChordToneNameMap,
	getIntervalLabel,
} from "../theory/guitarFretboard";

export type FretboardOverlayMode = "voicing" | "chordTones" | "scale";
export type FretboardLabelMode = "notes" | "intervals";

interface GuitarFretboardProps {
	activeLabel: string;
	activeQuality: ChordQuality;
	chordNotes: string[];
	chordKind: GuitarChordKind | null;
	voicings: GuitarVoicing[];
	selectedVoicing: GuitarVoicing | null;
	scalePitchClasses: number[];
	scaleNoteNames: string[];
	preferFlats: boolean;
	onSelectVoicing: (voicing: GuitarVoicing) => void;
	onStrumVoicing: (voicing: GuitarVoicing) => void;
	onPlayFretNote: (midi: number) => void;
}

const SINGLE_INLAY_FRETS = new Set([3, 5, 7, 9, 15]);
const FRET_NUMBERS = Array.from({ length: MAX_GUITAR_FRET }, (_, i) => i + 1);

export function GuitarFretboard({
	activeLabel,
	activeQuality,
	chordNotes,
	chordKind,
	voicings,
	selectedVoicing,
	scalePitchClasses,
	scaleNoteNames,
	preferFlats,
	onSelectVoicing,
	onStrumVoicing,
	onPlayFretNote,
}: GuitarFretboardProps) {
	const [overlayMode, setOverlayMode] =
		useState<FretboardOverlayMode>("voicing");
	const [labelMode, setLabelMode] = useState<FretboardLabelMode>("notes");

	const qualityClass =
		activeQuality === "minor"
			? "guitar-active-minor"
			: activeQuality === "diminished"
				? "guitar-active-dim"
				: "guitar-active-major";

	const rootNote = chordNotes[0] ?? "C";
	const rootPc = noteToPitchClass(rootNote);
	const chordPcSet = new Set(chordNotes.map(noteToPitchClass));
	const scalePcSet = new Set(scalePitchClasses);

	// Resolve spelled note name for any pitch class, preferring chord spelling then scale spelling
	const chordNameLookup = getChordToneNameMap(chordNotes, preferFlats);
	const scalePcToName = new Map<number, string>();
	scaleNoteNames.forEach((n) => {
		scalePcToName.set(noteToPitchClass(n), n);
	});
	const resolveFretNoteName = (pc: number) => {
		const norm = mod12(pc);
		if (chordPcSet.has(norm)) return chordNameLookup(norm);
		return scalePcToName.get(norm) ?? chordNameLookup(norm);
	};

	// SVG geometry
	const nutX = 64;
	const fretWidth = 48;
	const topY = 22;
	const stringGap = 24;
	const totalWidth = 812;
	const totalHeight = 178;
	const bottomY = topY + 5 * stringGap;

	// Visual string order top-to-bottom: 1st string (high e, index 5) -> 6th string (low E, index 0)
	const visualRows = [5, 4, 3, 2, 1, 0];

	return (
		<div className="guitar-wrap">
			<div className="guitar-top-bar">
				<div className="guitar-title-group">
					<span className="guitar-title">
						Guitar Fretboard{" "}
						{activeLabel && (
							<span className={`piano-badge ${qualityClass}`}>
								{activeLabel}
							</span>
						)}
					</span>
					{selectedVoicing && (
						<span className="guitar-voicing-summary">
							{selectedVoicing.name} ·{" "}
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
						<button
							type="button"
							className={`seg-btn ${overlayMode === "voicing" ? "is-active" : ""}`}
							onClick={() => setOverlayMode("voicing")}
							title="Highlight selected chord shape and faintly map all other chord tones"
						>
							Voicing + Neck
						</button>
						<button
							type="button"
							className={`seg-btn ${overlayMode === "chordTones" ? "is-active" : ""}`}
							onClick={() => setOverlayMode("chordTones")}
							title="Highlight every occurrence of the chord's notes across frets 0–15"
						>
							All Positions
						</button>
						<button
							type="button"
							className={`seg-btn ${overlayMode === "scale" ? "is-active" : ""}`}
							onClick={() => setOverlayMode("scale")}
							title="Show full key scale across the fretboard with chord tones accented"
						>
							Key Scale
						</button>
					</div>

					<button
						type="button"
						className={`chip-btn ${labelMode === "intervals" ? "is-on" : ""}`}
						onClick={() =>
							setLabelMode((m) => (m === "notes" ? "intervals" : "notes"))
						}
						title="Toggle fret markers between note names and chord intervals"
					>
						{labelMode === "notes" ? "Notes" : "Intervals"}
					</button>

					{selectedVoicing && (
						<button
							type="button"
							className="pill-action-btn"
							onClick={() => onStrumVoicing(selectedVoicing)}
							title="Strum the selected guitar chord voicing"
						>
							▶ Strum
						</button>
					)}
				</div>
			</div>

			{/* Voicing Selector Pills */}
			{voicings.length > 0 && (
				<div
					className="voicing-pills-row"
					role="group"
					aria-label="Chord fretboard voicings"
				>
					{voicings.map((v) => {
						const isCurrent = selectedVoicing?.id === v.id;
						return (
							<button
								key={v.id}
								type="button"
								className={`voicing-pill ${qualityClass} ${
									isCurrent ? "is-selected" : ""
								}`}
								onClick={() => onSelectVoicing(v)}
							>
								<span className="voicing-pill-name">{v.name}</span>
								<span className="voicing-pill-pos">{v.positionLabel}</span>
							</button>
						);
					})}
				</div>
			)}

			{/* Horizontal 0–15 Fretboard SVG */}
			<div className="fretboard-scroll">
				<svg
					viewBox={`0 0 ${totalWidth} ${totalHeight}`}
					className="fretboard-svg"
					role="group"
					aria-label="Interactive 15-fret guitar fretboard in standard tuning E A D G B E"
				>
					{/* Fretboard Wood / Neck Surface */}
					<rect
						x={nutX}
						y={topY - 12}
						width={MAX_GUITAR_FRET * fretWidth}
						height={bottomY - topY + 24}
						rx={6}
						className="fretboard-neck"
					/>

					{/* Inlay Dots */}
					{FRET_NUMBERS.map((fret) => {
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

					{/* Nut & Fret Wires */}
					<line
						x1={nutX}
						y1={topY - 12}
						x2={nutX}
						y2={bottomY + 12}
						className="fret-nut"
					/>
					{FRET_NUMBERS.map((fret) => {
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

					{/* Fret Numbers */}
					<text
						x={nutX - 18}
						y={bottomY + 28}
						textAnchor="middle"
						className="fret-num-label"
					>
						0
					</text>
					{FRET_NUMBERS.map((fret) => (
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

					{/* Guitar Strings + Interactive Fret Targets */}
					{visualRows.map((stringIdx, rowIdx) => {
						const info = STANDARD_TUNING[stringIdx];
						const y = topY + rowIdx * stringGap;
						const strokeW = 1.0 + rowIdx * 0.28;
						const voicedFret = selectedVoicing
							? selectedVoicing.frets[stringIdx]
							: -99;

						return (
							<g key={`str-${info.stringNumber}`}>
								{/* String tuning label */}
								<text
									x={14}
									y={y}
									textAnchor="middle"
									dominantBaseline="central"
									className="string-tuning-label"
								>
									{info.label}
								</text>

								{/* Muted indicator for selected voicing */}
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

								{/* String horizontal line */}
								<line
									x1={nutX}
									y1={y}
									x2={nutX + MAX_GUITAR_FRET * fretWidth}
									y2={y}
									strokeWidth={strokeW}
									className="guitar-string-line"
								/>

								{/* Clickable Fret Cells 0..15 */}
								{Array.from(
									{ length: MAX_GUITAR_FRET + 1 },
									(_, fret) => {
										const cx =
											fret === 0
												? nutX - 18
												: nutX + (fret - 0.5) * fretWidth;
										const midi = info.openMidi + fret;
										const pc = mod12(info.openPc + fret);
										const isVoicedHere =
											selectedVoicing !== null && voicedFret === fret;
										const isChordTone = chordPcSet.has(pc);
										const isRoot = pc === rootPc;
										const isScaleTone = scalePcSet.has(pc);

										const noteName = resolveFretNoteName(pc);
										const intervalName =
											chordKind && isChordTone
												? getIntervalLabel(rootPc, pc, chordKind)
												: null;
										const displayLabel =
											labelMode === "intervals" && intervalName
												? intervalName
												: noteName;

										// Determine visual prominence
										let dotState:
											| "primary"
											| "ghost-chord"
											| "scale"
											| "none" = "none";

										if (overlayMode === "voicing" && selectedVoicing) {
											if (isVoicedHere) {
												dotState = "primary";
											} else if (
												isChordTone &&
												!(fret === 0 && voicedFret === -1)
											) {
												dotState = "ghost-chord";
											}
										} else if (overlayMode === "chordTones") {
											if (isChordTone) dotState = "primary";
										} else if (overlayMode === "scale") {
											if (isChordTone) dotState = "primary";
											else if (isScaleTone) dotState = "scale";
										} else if (isChordTone) {
											// Fallback for single-note scale highlight
											dotState = "primary";
										}

										return (
											<g
												key={`cell-${stringIdx}-${fret}`}
												role="button"
												tabIndex={0}
												aria-label={`String ${info.stringNumber} (${info.label}) fret ${fret}: ${noteName}`}
												className="fret-hit-cell"
												onClick={() => onPlayFretNote(midi)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														onPlayFretNote(midi);
													}
												}}
											>
												<rect
													x={
														fret === 0
															? nutX - 31
															: nutX + (fret - 1) * fretWidth
													}
													y={y - stringGap / 2}
													width={fret === 0 ? 28 : fretWidth}
													height={stringGap}
													fill="transparent"
												/>

												{dotState === "primary" && (
													<g className={`fret-dot-primary ${qualityClass}`}>
														<circle
															cx={cx}
															cy={y}
															r={10.5}
															className={`fret-dot-bg ${
																isRoot ? "is-root-ring" : ""
															}`}
														/>
														<text
															x={cx}
															y={y + 0.5}
															textAnchor="middle"
															dominantBaseline="central"
															className="fret-dot-text"
														>
															{displayLabel}
														</text>
													</g>
												)}

												{dotState === "ghost-chord" && (
													<g className={`fret-dot-ghost ${qualityClass}`}>
														<circle
															cx={cx}
															cy={y}
															r={8.5}
															className={`fret-dot-ghost-bg ${
																isRoot ? "is-root-ring" : ""
															}`}
														/>
														<text
															x={cx}
															y={y + 0.5}
															textAnchor="middle"
															dominantBaseline="central"
															className="fret-dot-ghost-text"
														>
															{displayLabel}
														</text>
													</g>
												)}

												{dotState === "scale" && (
													<g className="fret-dot-scale">
														<circle
															cx={cx}
															cy={y}
															r={7.5}
															className="fret-dot-scale-bg"
														/>
														<text
															x={cx}
															y={y + 0.5}
															textAnchor="middle"
															dominantBaseline="central"
															className="fret-dot-scale-text"
														>
															{noteName}
														</text>
													</g>
												)}
											</g>
										);
									},
								)}
							</g>
						);
					})}
				</svg>
			</div>

			{/* Compact 6-String Tab & Interval Breakdown */}
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
									className={`breakdown-cell ${
										isMuted ? "is-muted" : ""
									} ${n.intervalLabel === "R" ? "is-root" : ""}`}
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
									<span className="bd-fret">
										{isMuted ? "×" : n.fret}
									</span>
									<span className="bd-meta">
										{isMuted
											? "—"
											: `${n.noteName} · ${n.intervalLabel}`}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
