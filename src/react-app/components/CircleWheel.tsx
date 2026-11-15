import { useState } from "react";
import {
	AccidentalPreference,
	CIRCLE_SLOTS,
	DiatonicChord,
	EnharmonicSide,
	KeyAnalysis,
	KeyMode,
	formatShortSignature,
	mod12,
	resolveSlotVariant,
} from "../theory/circleOfFifths";

interface CircleWheelProps {
	analysis: KeyAnalysis;
	selectedSlot: number;
	mode: KeyMode;
	preference: AccidentalPreference;
	slotOverrides: Partial<Record<number, EnharmonicSide>>;
	highlightedChord: DiatonicChord | null;
	rotateToSelected: boolean;
	onSelectKey: (slotIndex: number, mode: KeyMode) => void;
	onPlayTonic: () => void;
	onStepFourth: () => void;
	onStepFifth: () => void;
	onToggleRotate: () => void;
}

function polarToCartesian(radius: number, angleDeg: number) {
	// 0 deg = 12 o'clock, increasing clockwise
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
	const sweep = sweepClockwise ? 1 : 0;
	return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 0 ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function CircleWheel({
	analysis,
	selectedSlot,
	mode,
	preference,
	slotOverrides,
	highlightedChord,
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
		label: string;
	} | null>(null);

	// Track shortest-path cumulative wheel rotation so crossing 12 o'clock never spins backwards
	const [rotState, setRotState] = useState({
		slot: selectedSlot,
		cum: -selectedSlot,
	});
	if (rotState.slot !== selectedSlot) {
		const delta = ((selectedSlot - rotState.slot + 18) % 12) - 6;
		setRotState({ slot: selectedSlot, cum: rotState.cum - delta });
	}
	const cumStep = rotState.cum;

	const wheelRotation = rotateToSelected ? cumStep * 30 : 0;
	const fourthSlot = mod12(selectedSlot - 1);
	const fifthSlot = mod12(selectedSlot + 1);
	const dimSlot = mod12(selectedSlot + 5);

	// Determine Roman numeral overlay for the 6 active neighborhood wedges
	const getRomanBadge = (
		slotIdx: number,
		ringMode: KeyMode,
	): string | null => {
		const chord = analysis.chords.find(
			(c) =>
				c.circleIndex === slotIdx &&
				((ringMode === "major" && c.quality === "major") ||
					(ringMode === "minor" && c.quality === "minor")),
		);
		return chord ? chord.roman : null;
	};

	const activeCenterDeg = selectedSlot * 30;
	const fifthArcPath = describeArcPath(
		244,
		activeCenterDeg + 5,
		activeCenterDeg + 27,
		true,
	);
	const fourthArcPath = describeArcPath(
		244,
		activeCenterDeg - 5,
		activeCenterDeg - 27,
		false,
	);

	// Arrowhead points for 5th (clockwise) and 4th (counter-clockwise)
	const fifthTip = polarToCartesian(244, activeCenterDeg + 29);
	const fourthTip = polarToCartesian(244, activeCenterDeg - 29);
	const fifthLabelPos = polarToCartesian(262, activeCenterDeg + 16);
	const fourthLabelPos = polarToCartesian(262, activeCenterDeg - 16);

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
						4th (↺)
					</span>
					<span className="legend-item">
						<span className="legend-dot legend-fifth" />
						5th (↻)
					</span>
					<span className="legend-item">
						<span className="legend-dot legend-diatonic" />
						Key Chords
					</span>
				</div>
				<button
					type="button"
					className="chip-btn"
					onClick={onToggleRotate}
					title="Choose whether C stays pinned at 12 o'clock or the selected key rotates to the top"
				>
					{rotateToSelected ? "Selected at 12:00" : "C Pinned at 12:00"}
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
						<filter
							id="softGlow"
							x="-25%"
							y="-25%"
							width="150%"
							height="150%"
						>
							<feGaussianBlur stdDeviation="3.5" result="blur" />
							<feMerge>
								<feMergeNode in="blur" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>

					{/* Subtle outer compass ring */}
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

					{/* Rotatable Wheel Group */}
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
							const variant = resolveSlotVariant(
								i,
								preference,
								slotOverrides,
							);

							const isSelectedSlot = i === selectedSlot;
							const isFourth = i === fourthSlot;
							const isFifth = i === fifthSlot;
							const isDimNeighbor = i === dimSlot;

							const isOuterSelected = isSelectedSlot && mode === "major";
							const isInnerSelected = isSelectedSlot && mode === "minor";

							const isChordHighlightedOuter =
								highlightedChord !== null &&
								highlightedChord.circleIndex === i &&
								highlightedChord.quality === "major";
							const isChordHighlightedInner =
								highlightedChord !== null &&
								highlightedChord.circleIndex === i &&
								highlightedChord.quality === "minor";
							const isChordHighlightedDim =
								highlightedChord !== null &&
								highlightedChord.quality === "diminished" &&
								isDimNeighbor;

							const outerRoman = getRomanBadge(i, "major");
							const innerRoman = getRomanBadge(i, "minor");

							const outerLabelPos = polarToCartesian(176, centerDeg);
							const innerLabelPos = polarToCartesian(111, centerDeg);
							const sigPos = polarToCartesian(223, centerDeg);
							const dimPos = polarToCartesian(141, centerDeg);

							const outerStateClass = isChordHighlightedOuter
								? "wedge-chord-active"
								: isOuterSelected
									? "wedge-tonic"
									: isFourth && mode === "major"
										? "wedge-fourth"
										: isFifth && mode === "major"
											? "wedge-fifth"
											: outerRoman
												? "wedge-diatonic"
												: "wedge-idle";

							const innerStateClass = isChordHighlightedInner
								? "wedge-chord-active"
								: isInnerSelected
									? "wedge-tonic"
									: isFourth && mode === "minor"
										? "wedge-fourth"
										: isFifth && mode === "minor"
											? "wedge-fifth"
											: innerRoman
												? "wedge-diatonic"
												: "wedge-idle";

							const majorName = variant.majorRoot;
							const minorName = `${variant.minorRoot}m`;
							const sigText = formatShortSignature(variant.accidentalsCount);

							return (
								<g key={i}>
									{/* Outer Ring: Major Key */}
									<g
										role="button"
										tabIndex={0}
										aria-label={`${majorName} Major (${sigText === "0" ? "natural" : sigText})`}
										aria-pressed={isOuterSelected}
										className={`wedge-group ${outerStateClass}`}
										onClick={() => onSelectKey(i, "major")}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												onSelectKey(i, "major");
											}
										}}
										onMouseEnter={() =>
											setHoveredKey({
												slot: i,
												ring: "major",
												label: `${majorName} Major`,
											})
										}
										onMouseLeave={() => setHoveredKey(null)}
									>
										<path
											d={describeAnnularWedge(144, 208, startDeg, endDeg)}
											className="wedge-path"
										/>
										<g
											transform={`translate(${outerLabelPos.x.toFixed(2)}, ${outerLabelPos.y.toFixed(2)})`}
										>
											<g
												className="label-counter-rotator"
												style={{
													transform: `rotate(${-wheelRotation}deg)`,
												}}
											>
												<text
													x="0"
													y={outerRoman ? "-3" : "2"}
													textAnchor="middle"
													dominantBaseline="central"
													className="wedge-major-text"
												>
													{majorName}
												</text>
												{outerRoman && (
													<text
														x="0"
														y="14"
														textAnchor="middle"
														dominantBaseline="central"
														className="wedge-roman-text"
													>
														{outerRoman}
													</text>
												)}
											</g>
										</g>
									</g>

									{/* Inner Ring: Relative Minor Key */}
									<g
										role="button"
										tabIndex={0}
										aria-label={`${variant.minorRoot} Minor (relative minor of ${majorName})`}
										aria-pressed={isInnerSelected}
										className={`wedge-group ${innerStateClass}`}
										onClick={() => onSelectKey(i, "minor")}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												onSelectKey(i, "minor");
											}
										}}
										onMouseEnter={() =>
											setHoveredKey({
												slot: i,
												ring: "minor",
												label: `${variant.minorRoot} Minor`,
											})
										}
										onMouseLeave={() => setHoveredKey(null)}
									>
										<path
											d={describeAnnularWedge(84, 138, startDeg, endDeg)}
											className="wedge-path"
										/>
										<g
											transform={`translate(${innerLabelPos.x.toFixed(2)}, ${innerLabelPos.y.toFixed(2)})`}
										>
											<g
												className="label-counter-rotator"
												style={{
													transform: `rotate(${-wheelRotation}deg)`,
												}}
											>
												<text
													x="0"
													y={innerRoman ? "-4" : "1"}
													textAnchor="middle"
													dominantBaseline="central"
													className="wedge-minor-text"
												>
													{minorName}
												</text>
												{innerRoman && (
													<text
														x="0"
														y="11"
														textAnchor="middle"
														dominantBaseline="central"
														className="wedge-roman-text"
													>
														{innerRoman}
													</text>
												)}
											</g>
										</g>
									</g>

									{/* Outer Key Signature Track */}
									<g
										transform={`translate(${sigPos.x.toFixed(2)}, ${sigPos.y.toFixed(2)})`}
										className={
											isSelectedSlot
												? "sig-tick sig-tick-active"
												: "sig-tick"
										}
									>
										<g
											className="label-counter-rotator"
											style={{
												transform: `rotate(${-wheelRotation}deg)`,
											}}
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

									{/* Diminished neighbor dot for active key */}
									{isDimNeighbor && (
										<g
											transform={`translate(${dimPos.x.toFixed(2)}, ${dimPos.y.toFixed(2)})`}
											className={
												isChordHighlightedDim
													? "dim-marker dim-marker-active"
													: "dim-marker"
											}
										>
											<g
												className="label-counter-rotator"
												style={{
													transform: `rotate(${-wheelRotation}deg)`,
												}}
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

						{/* Directional 4th (Counter-Clockwise) & 5th (Clockwise) Arcs */}
						<g className="relationship-arcs" filter="url(#softGlow)">
							{/* 4th Arc */}
							<path
								d={fourthArcPath}
								fill="none"
								stroke="var(--color-fourth)"
								strokeWidth="3"
								strokeLinecap="round"
							/>
							<g
								transform={`translate(${fourthTip.x.toFixed(2)}, ${fourthTip.y.toFixed(2)}) rotate(${activeCenterDeg - 29 + 180})`}
							>
								<polygon
									points="-4,-4.5 -4,4.5 5.5,0"
									fill="var(--color-fourth)"
								/>
							</g>
							<g
								transform={`translate(${fourthLabelPos.x.toFixed(2)}, ${fourthLabelPos.y.toFixed(2)})`}
								className="arc-clickable"
								onClick={onStepFourth}
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
										className="arc-badge arc-badge-fourth"
									/>
									<text
										x="0"
										y="0.5"
										textAnchor="middle"
										dominantBaseline="central"
										className="arc-badge-text arc-badge-text-fourth"
									>
										↺ 4th
									</text>
								</g>
							</g>

							{/* 5th Arc */}
							<path
								d={fifthArcPath}
								fill="none"
								stroke="var(--color-fifth)"
								strokeWidth="3"
								strokeLinecap="round"
							/>
							<g
								transform={`translate(${fifthTip.x.toFixed(2)}, ${fifthTip.y.toFixed(2)}) rotate(${activeCenterDeg + 29})`}
							>
								<polygon
									points="-4,-4.5 -4,4.5 5.5,0"
									fill="var(--color-fifth)"
								/>
							</g>
							<g
								transform={`translate(${fifthLabelPos.x.toFixed(2)}, ${fifthLabelPos.y.toFixed(2)})`}
								className="arc-clickable"
								onClick={onStepFifth}
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
										className="arc-badge arc-badge-fifth"
									/>
									<text
										x="0"
										y="0.5"
										textAnchor="middle"
										dominantBaseline="central"
										className="arc-badge-text arc-badge-text-fifth"
									>
										5th ↻
									</text>
								</g>
							</g>
						</g>
					</g>

					{/* Stationary Center Hub */}
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
								<text
									x="0"
									y="-30"
									textAnchor="middle"
									className="hub-eyebrow"
								>
									AUDITIONING · {highlightedChord.roman}
								</text>
								<text
									x="0"
									y="-2"
									textAnchor="middle"
									dominantBaseline="central"
									className="hub-key-name"
								>
									{highlightedChord.symbol}
								</text>
								<text
									x="0"
									y="24"
									textAnchor="middle"
									className="hub-subline"
								>
									{highlightedChord.triadNotes.join(" · ")}
								</text>
							</>
						) : hoveredKey ? (
							<>
								<text
									x="0"
									y="-28"
									textAnchor="middle"
									className="hub-eyebrow"
								>
									CLICK TO EXPLORE
								</text>
								<text
									x="0"
									y="0"
									textAnchor="middle"
									dominantBaseline="central"
									className="hub-key-name"
								>
									{hoveredKey.ring === "major"
										? hoveredKey.label.split(" ")[0]
										: `${hoveredKey.label.split(" ")[0]}m`}
								</text>
								<text
									x="0"
									y="25"
									textAnchor="middle"
									className="hub-subline"
								>
									{hoveredKey.ring === "major"
										? "Major Key"
										: "Minor Key"}
								</text>
							</>
						) : (
							<>
								<text
									x="0"
									y="-31"
									textAnchor="middle"
									className="hub-eyebrow"
								>
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
								<text
									x="0"
									y="22"
									textAnchor="middle"
									className="hub-subline"
								>
									{analysis.signatureLabel}
								</text>
							</>
						)}

						{/* Hub Play & Step Pills */}
						<g
							role="button"
							tabIndex={0}
							aria-label={`Play ${analysis.name} tonic chord`}
							className="hub-play-btn"
							transform="translate(0, 46)"
							onClick={onPlayTonic}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onPlayTonic();
								}
							}}
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

			<div className="wheel-quick-nav">
				<button
					type="button"
					className="step-btn step-btn-fourth"
					onClick={onStepFourth}
				>
					<span className="step-arrow">↺</span>
					<span className="step-copy">
						<span className="step-label">Perfect 4th</span>
						<span className="step-value">
							{analysis.fourthNeighbor.shortName}
						</span>
					</span>
				</button>

				<button
					type="button"
					className="step-btn step-btn-play"
					onClick={onPlayTonic}
					title="Play tonic chord (Space)"
				>
					<span className="step-label">Tonic</span>
					<span className="step-value">{analysis.shortName}</span>
				</button>

				<button
					type="button"
					className="step-btn step-btn-fifth"
					onClick={onStepFifth}
				>
					<span className="step-copy step-copy-right">
						<span className="step-label">Perfect 5th</span>
						<span className="step-value">
							{analysis.fifthNeighbor.shortName}
						</span>
					</span>
					<span className="step-arrow">↻</span>
				</button>
			</div>
		</div>
	);
}
