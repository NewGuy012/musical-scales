import { useState } from "react";
import {
	AccidentalPreference,
	CIRCLE_SLOTS,
	DiatonicChord,
	EnharmonicSide,
	KeyAnalysis,
	KeyMode,
	formatShortSignature,
	handleSvgButtonKeyDown,
	mod12,
	resolveSlotVariant,
} from "../theory/circleOfFifths";
import { IconPin, IconRotate } from "./Icons";

interface CircleWheelProps {
	analysis: KeyAnalysis;
	selectedSlot: number;
	mode: KeyMode;
	preference: AccidentalPreference;
	slotOverrides: Partial<Record<number, EnharmonicSide>>;
	highlightedChord: DiatonicChord | null;
	highlightedNotes?: string[] | null;
	rotateToSelected: boolean;
	onSelectKey: (slotIndex: number, mode: KeyMode) => void;
	onPlayTonic: () => void;
	onStepFourth: () => void;
	onStepFifth: () => void;
	onToggleRotate: () => void;
}

function polarToCartesian(radius: number, angleDeg: number) {
	const rad = ((angleDeg - 90) * Math.PI) / 180;
	return {
		x: radius * Math.cos(rad),
		y: radius * Math.sin(rad),
	};
}

function describeAnnularWedge(
	innerR: number,
	outerR: number,
	startDeg: number,
	endDeg: number,
): string {
	const outerStart = polarToCartesian(outerR, startDeg);
	const outerEnd = polarToCartesian(outerR, endDeg);
	const innerEnd = polarToCartesian(innerR, endDeg);
	const innerStart = polarToCartesian(innerR, startDeg);
	const largeArc = endDeg - startDeg > 180 ? 1 : 0;

	return [
		`M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
		`A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
		`L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
		`A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
		"Z",
	].join(" ");
}

function describeArcPath(
	radius: number,
	startDeg: number,
	endDeg: number,
	sweepClockwise: boolean,
): string {
	const start = polarToCartesian(radius, startDeg);
	const end = polarToCartesian(radius, endDeg);
	return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 0 ${sweepClockwise ? 1 : 0} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function CircleWheel({
	analysis,
	selectedSlot,
	mode,
	preference,
	slotOverrides,
	highlightedChord,
	highlightedNotes = null,
	rotateToSelected,
	onSelectKey,
	onPlayTonic,
	onStepFourth,
	onStepFifth,
	onToggleRotate,
}: CircleWheelProps) {
	const [hoveredKey, setHoveredKey] = useState<{
		slot: number;
		ring: KeyMode;
		shortName: string;
	} | null>(null);

	// Shortest-path cumulative rotation so crossing 12 o'clock never spins backwards
	const [rotState, setRotState] = useState({
		slot: selectedSlot,
		cum: -selectedSlot,
	});
	if (rotState.slot !== selectedSlot) {
		const delta = ((selectedSlot - rotState.slot + 18) % 12) - 6;
		setRotState({ slot: selectedSlot, cum: rotState.cum - delta });
	}

	const wheelRotation = rotateToSelected ? rotState.cum * 30 : 0;
	const fourthSlot = mod12(selectedSlot - 1);
	const fifthSlot = mod12(selectedSlot + 1);
	const dimSlot = mod12(selectedSlot + 5);

	const getRomanBadge = (slotIdx: number, ringMode: KeyMode): string | null => {
		const chord = analysis.chords.find(
			(c) =>
				c.circleIndex === slotIdx &&
				((ringMode === "major" && c.quality === "major") ||
					(ringMode === "minor" && c.quality === "minor")),
		);
		return chord ? chord.roman : null;
	};

	const activeCenterDeg = selectedSlot * 30;
	const arcs = [
		{
			key: "fourth",
			color: "var(--color-fourth)",
			path: describeArcPath(
				244,
				activeCenterDeg - 5,
				activeCenterDeg - 27,
				false,
			),
			tip: polarToCartesian(244, activeCenterDeg - 29),
			tipRot: activeCenterDeg - 29 + 180,
			labelPos: polarToCartesian(262, activeCenterDeg - 16),
			text: "↺ 4th",
			onClick: onStepFourth,
		},
		{
			key: "fifth",
			color: "var(--color-fifth)",
			path: describeArcPath(
				244,
				activeCenterDeg + 5,
				activeCenterDeg + 27,
				true,
			),
			tip: polarToCartesian(244, activeCenterDeg + 29),
			tipRot: activeCenterDeg + 29,
			labelPos: polarToCartesian(262, activeCenterDeg + 16),
			text: "5th ↻",
			onClick: onStepFifth,
		},
	] as const;

	return (
		<div className="wheel-shell">
			<div className="wheel-toolbar">
				<div className="wheel-legend" aria-label="Color legend">
					<span className="legend-item">
						<span className="legend-dot legend-tonic" />
						Tonic
					</span>
					<span className="legend-item">
						<span className="legend-dot legend-fourth" />
						4th
					</span>
					<span className="legend-item">
						<span className="legend-dot legend-fifth" />
						5th
					</span>
					<span className="legend-item">
						<span className="legend-dot legend-diatonic" />
						In Key
					</span>
				</div>
				<button
					type="button"
					className={`chip-btn chip-btn-compact ${rotateToSelected ? "is-on" : ""}`}
					onClick={onToggleRotate}
					aria-pressed={rotateToSelected}
					title="Keep C pinned at 12 o'clock or rotate the selected key to the top"
				>
					{rotateToSelected ? <IconRotate size={12} /> : <IconPin size={12} />}
					<span>{rotateToSelected ? "Key at 12:00" : "C Pinned"}</span>
				</button>
			</div>

			<div className="wheel-stage">
				<svg
					viewBox="-296 -296 592 592"
					className="circle-svg"
					role="img"
					aria-label={`Interactive Circle of Fifths centered on ${analysis.name}`}
				>
					<defs>
						<radialGradient id="hubGlow" cx="50%" cy="45%" r="60%">
							<stop offset="0%" stopColor="var(--hub-glow-start)" />
							<stop offset="100%" stopColor="var(--hub-glow-end)" />
						</radialGradient>
						<filter id="softGlow" x="-25%" y="-25%" width="150%" height="150%">
							<feGaussianBlur stdDeviation="3.5" result="blur" />
							<feMerge>
								<feMergeNode in="blur" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>

					<circle
						cx="0"
						cy="0"
						r="233"
						fill="none"
						stroke="var(--wheel-hairline)"
						strokeWidth="1"
						strokeDasharray="2 5"
					/>
					<circle
						cx="0"
						cy="0"
						r="141"
						fill="none"
						stroke="var(--wheel-hairline)"
						strokeWidth="1"
					/>

					<g
						className="wheel-rotator"
						style={{
							transform: `rotate(${wheelRotation}deg)`,
							transformOrigin: "0px 0px",
						}}
					>
						{CIRCLE_SLOTS.map((slot) => {
							const i = slot.index;
							const centerDeg = i * 30;
							const startDeg = centerDeg - 14.3;
							const endDeg = centerDeg + 14.3;
							const variant = resolveSlotVariant(i, preference, slotOverrides);

							const isSelectedSlot = i === selectedSlot;
							const isFourth = i === fourthSlot;
							const isFifth = i === fifthSlot;
							const isDimNeighbor = i === dimSlot;
							const sigText = formatShortSignature(variant.accidentalsCount);
							const sigPos = polarToCartesian(223, centerDeg);
							const dimPos = polarToCartesian(141, centerDeg);

							const rings = [
								{
									ringMode: "major" as const,
									innerR: 144,
									outerR: 208,
									labelR: 176,
									displayName: variant.majorRoot,
									ariaLabel: `${variant.majorRoot} Major (${sigText === "0" ? "natural" : sigText})`,
									textClass: "wedge-major-text",
									yWithRoman: "-3",
									yNoRoman: "2",
									romanY: "14",
								},
								{
									ringMode: "minor" as const,
									innerR: 84,
									outerR: 138,
									labelR: 111,
									displayName: `${variant.minorRoot}m`,
									ariaLabel: `${variant.minorRoot} Minor (relative minor of ${variant.majorRoot})`,
									textClass: "wedge-minor-text",
									yWithRoman: "-4",
									yNoRoman: "1",
									romanY: "11",
								},
							];

							return (
								<g key={i}>
									{rings.map((ring) => {
										const isSelected = isSelectedSlot && mode === ring.ringMode;
										const isChordHighlighted =
											highlightedChord !== null &&
											highlightedChord.circleIndex === i &&
											highlightedChord.quality === ring.ringMode;
										const roman = getRomanBadge(i, ring.ringMode);
										const labelPos = polarToCartesian(ring.labelR, centerDeg);

										const stateClass = isChordHighlighted
											? "wedge-chord-active"
											: isSelected
												? "wedge-tonic"
												: isFourth && mode === ring.ringMode
													? "wedge-fourth"
													: isFifth && mode === ring.ringMode
														? "wedge-fifth"
														: roman
															? "wedge-diatonic"
															: "wedge-idle";

										return (
											<g
												key={ring.ringMode}
												role="button"
												tabIndex={0}
												aria-label={ring.ariaLabel}
												aria-pressed={isSelected}
												className={`wedge-group ${stateClass}`}
												onClick={() => onSelectKey(i, ring.ringMode)}
												onKeyDown={(e) =>
													handleSvgButtonKeyDown(e, () =>
														onSelectKey(i, ring.ringMode),
													)
												}
												onMouseEnter={() =>
													setHoveredKey({
														slot: i,
														ring: ring.ringMode,
														shortName: ring.displayName,
													})
												}
												onMouseLeave={() => setHoveredKey(null)}
											>
												<path
													d={describeAnnularWedge(
														ring.innerR,
														ring.outerR,
														startDeg,
														endDeg,
													)}
													className="wedge-path"
												/>
												<g
													transform={`translate(${labelPos.x.toFixed(2)}, ${labelPos.y.toFixed(2)})`}
												>
													<g
														className="label-counter-rotator"
														style={{
															transform: `rotate(${-wheelRotation}deg)`,
														}}
													>
														<text
															x="0"
															y={roman ? ring.yWithRoman : ring.yNoRoman}
															textAnchor="middle"
															dominantBaseline="central"
															className={ring.textClass}
														>
															{ring.displayName}
														</text>
														{roman && (
															<text
																x="0"
																y={ring.romanY}
																textAnchor="middle"
																dominantBaseline="central"
																className="wedge-roman-text"
															>
																{roman}
															</text>
														)}
													</g>
												</g>
											</g>
										);
									})}

									<g
										transform={`translate(${sigPos.x.toFixed(2)}, ${sigPos.y.toFixed(2)})`}
										className={
											isSelectedSlot ? "sig-tick sig-tick-active" : "sig-tick"
										}
									>
										<g
											className="label-counter-rotator"
											style={{ transform: `rotate(${-wheelRotation}deg)` }}
										>
											<text
												x="0"
												y="0"
												textAnchor="middle"
												dominantBaseline="central"
												className="sig-text"
											>
												{sigText}
											</text>
										</g>
									</g>

									{isDimNeighbor && (
										<g
											transform={`translate(${dimPos.x.toFixed(2)}, ${dimPos.y.toFixed(2)})`}
											className={
												highlightedChord?.quality === "diminished" &&
												highlightedChord.circleIndex === i
													? "dim-marker dim-marker-active"
													: "dim-marker"
											}
										>
											<g
												className="label-counter-rotator"
												style={{ transform: `rotate(${-wheelRotation}deg)` }}
											>
												<rect
													x="-13"
													y="-8"
													width="26"
													height="16"
													rx="8"
													className="dim-pill-bg"
												/>
												<text
													x="0"
													y="0.5"
													textAnchor="middle"
													dominantBaseline="central"
													className="dim-pill-text"
												>
													{analysis.diminishedChord.roman}
												</text>
											</g>
										</g>
									)}
								</g>
							);
						})}

						<g className="relationship-arcs" filter="url(#softGlow)">
							{arcs.map((arc) => (
								<g key={arc.key}>
									<path
										d={arc.path}
										fill="none"
										stroke={arc.color}
										strokeWidth="3"
										strokeLinecap="round"
									/>
									<g
										transform={`translate(${arc.tip.x.toFixed(2)}, ${arc.tip.y.toFixed(2)}) rotate(${arc.tipRot})`}
									>
										<polygon points="-4,-4.5 -4,4.5 5.5,0" fill={arc.color} />
									</g>
									<g
										transform={`translate(${arc.labelPos.x.toFixed(2)}, ${arc.labelPos.y.toFixed(2)})`}
										className="arc-clickable"
										onClick={arc.onClick}
									>
										<g
											className="label-counter-rotator"
											style={{ transform: `rotate(${-wheelRotation}deg)` }}
										>
											<rect
												x="-22"
												y="-10"
												width="44"
												height="20"
												rx="10"
												className={`arc-badge arc-badge-${arc.key}`}
											/>
											<text
												x="0"
												y="0.5"
												textAnchor="middle"
												dominantBaseline="central"
												className={`arc-badge-text arc-badge-text-${arc.key}`}
											>
												{arc.text}
											</text>
										</g>
									</g>
								</g>
							))}
						</g>
					</g>

					<g className="wheel-hub">
						<circle
							cx="0"
							cy="0"
							r="76"
							fill="url(#hubGlow)"
							stroke="var(--wheel-hub-border)"
							strokeWidth="1.5"
						/>
						{highlightedChord ? (
							<>
								<text x="0" y="-30" textAnchor="middle" className="hub-eyebrow">
									AUDITIONING · {highlightedChord.roman}
								</text>
								<text
									x="0"
									y="-2"
									textAnchor="middle"
									dominantBaseline="central"
									className="hub-key-name"
									style={
										highlightedChord.symbol.length > 5
											? {
													fontSize:
														highlightedChord.symbol.length > 7
															? "17px"
															: "21px",
												}
											: undefined
									}
								>
									{highlightedChord.symbol}
								</text>
								<text x="0" y="24" textAnchor="middle" className="hub-subline">
									{(highlightedNotes && highlightedNotes.length > 0
										? highlightedNotes
										: highlightedChord.triadNotes
									).join(" · ")}
								</text>
							</>
						) : hoveredKey ? (
							<>
								<text x="0" y="-28" textAnchor="middle" className="hub-eyebrow">
									CLICK TO EXPLORE
								</text>
								<text
									x="0"
									y="0"
									textAnchor="middle"
									dominantBaseline="central"
									className="hub-key-name"
								>
									{hoveredKey.shortName}
								</text>
								<text x="0" y="25" textAnchor="middle" className="hub-subline">
									{hoveredKey.ring === "major" ? "Major Key" : "Minor Key"}
								</text>
							</>
						) : (
							<>
								<text x="0" y="-31" textAnchor="middle" className="hub-eyebrow">
									{mode === "major" ? "MAJOR KEY" : "NATURAL MINOR"}
								</text>
								<text
									x="0"
									y="-4"
									textAnchor="middle"
									dominantBaseline="central"
									className="hub-key-name"
								>
									{analysis.shortName}
								</text>
								<text x="0" y="22" textAnchor="middle" className="hub-subline">
									{analysis.signatureLabel}
								</text>
							</>
						)}

						<g
							role="button"
							tabIndex={0}
							aria-label={`Play ${analysis.name} tonic chord`}
							className="hub-play-btn"
							transform="translate(0, 46)"
							onClick={onPlayTonic}
							onKeyDown={(e) => handleSvgButtonKeyDown(e, onPlayTonic)}
						>
							<rect x="-28" y="-12" width="56" height="24" rx="12" />
							<text
								x="0"
								y="0.5"
								textAnchor="middle"
								dominantBaseline="central"
							>
								▶ Play
							</text>
						</g>
					</g>
				</svg>
			</div>
		</div>
	);
}
