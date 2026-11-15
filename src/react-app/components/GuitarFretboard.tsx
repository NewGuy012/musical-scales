import { useState } from "react";
import {
	ChordQuality,
	getGuitarQualityClass,
	handleSvgButtonKeyDown,
	mod12,
	noteToPitchClass,
} from "../theory/circleOfFifths";
import {
	GuitarChordKind,
	GuitarVoicing,
	MAX_GUITAR_FRET,
	STANDARD_TUNING,
	createPitchClassNameResolver,
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
	activeSongMidi?: number[] | null;
	scalePitchClasses: number[];
	scaleNoteNames: string[];
	preferFlats: boolean;
	onSelectVoicing: (voicing: GuitarVoicing) => void;
	onStrumVoicing: (voicing: GuitarVoicing) => void;
	onPlayFretNote: (midi: number) => void;
}

const SINGLE_INLAY_FRETS = new Set([3, 5, 7, 9, 15]);
const FRET_NUMBERS = Array.from({ length: MAX_GUITAR_FRET }, (_, i) => i + 1);
const VISUAL_ROWS = [5, 4, 3, 2, 1, 0] as const;

export function GuitarFretboard({
	activeLabel,
	activeQuality,
	chordNotes,
	chordKind,
	voicings,
	selectedVoicing,
	activeSongMidi = null,
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

	const qualityClass = getGuitarQualityClass(activeQuality);
	const rootNote = chordNotes[0] ?? "C";
	const rootPc = noteToPitchClass(rootNote);
	const chordPcSet = new Set(chordNotes.map(noteToPitchClass));
	const scalePcSet = new Set(scalePitchClasses);
	const resolveFretNoteName = createPitchClassNameResolver(
		chordNotes,
		scaleNoteNames,
		preferFlats,
	);
	const songHitKeys = new Set<string>();
	if (activeSongMidi && activeSongMidi.length > 0) {
		for (const midi of activeSongMidi) {
			let matchedVoiced = false;
			if (selectedVoicing) {
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
					const fret = midi - STANDARD_TUNING[sIdx].openMidi;
					if (fret >= 0 && fret <= MAX_GUITAR_FRET) {
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

	const nutX = 64;
	const fretWidth = 48;
	const topY = 22;
	const stringGap = 24;
	const totalWidth = 812;
	const totalHeight = 178;
	const bottomY = topY + 5 * stringGap;

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
						{(
							[
								["voicing", "Voicing + Neck"],
								["chordTones", "All Positions"],
								["scale", "Key Scale"],
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

			{voicings.length > 0 && (
				<div
					className="voicing-pills-row"
					role="group"
					aria-label="Chord fretboard voicings"
				>
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
						width={MAX_GUITAR_FRET * fretWidth}
						height={bottomY - topY + 24}
						rx={6}
						className="fretboard-neck"
					/>

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

					{VISUAL_ROWS.map((stringIdx, rowIdx) => {
						const info = STANDARD_TUNING[stringIdx];
						const y = topY + rowIdx * stringGap;
						const strokeW = 1.0 + rowIdx * 0.28;
						const voicedFret = selectedVoicing
							? selectedVoicing.frets[stringIdx]
							: -99;

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
									x2={nutX + MAX_GUITAR_FRET * fretWidth}
									y2={y}
									strokeWidth={strokeW}
									className="guitar-string-line"
								/>

								{Array.from({ length: MAX_GUITAR_FRET + 1 }, (_, fret) => {
									const cx =
										fret === 0 ? nutX - 18 : nutX + (fret - 0.5) * fretWidth;
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

									const isSongHit = songHitKeys.has(`${stringIdx}-${fret}`);
									let dotState: "primary" | "ghost-chord" | "scale" | "none" =
										"none";
									if (isSongHit) {
										dotState = "primary";
									} else if (overlayMode === "voicing" && selectedVoicing) {
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

											{dotState !== "none" && (
												<g
													className={
														dotState === "primary"
															? `fret-dot-primary ${qualityClass}${
																	isSongHit ? " is-song-hit" : ""
																}`
															: dotState === "ghost-chord"
																? `fret-dot-ghost ${qualityClass}`
																: "fret-dot-scale"
													}
												>
													{isSongHit && (
														<circle
															cx={cx}
															cy={y}
															r={14}
															className="song-hit-halo"
														/>
													)}
													<circle
														cx={cx}
														cy={y}
														r={
															dotState === "primary"
																? 10.5
																: dotState === "ghost-chord"
																	? 8.5
																	: 7.5
														}
														className={
															dotState === "primary"
																? `fret-dot-bg ${isRoot ? "is-root-ring" : ""}`
																: dotState === "ghost-chord"
																	? `fret-dot-ghost-bg ${isRoot ? "is-root-ring" : ""}`
																	: "fret-dot-scale-bg"
														}
													/>
													<text
														x={cx}
														y={y + 0.5}
														textAnchor="middle"
														dominantBaseline="central"
														className={
															dotState === "primary"
																? "fret-dot-text"
																: dotState === "ghost-chord"
																	? "fret-dot-ghost-text"
																	: "fret-dot-scale-text"
														}
													>
														{dotState === "scale" ? noteName : displayLabel}
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
		</div>
	);
}
