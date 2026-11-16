import { KeyAnalysis, KeyMode } from "../theory/circleOfFifths";
import { IconPlay, IconRotate, IconRotateCcw, IconStop } from "./Icons";

interface FifthsFourthsPanelProps {
	analysis: KeyAnalysis;
	walkingDirection: "fourth" | "fifth" | null;
	isTargeted?: boolean;
	onSelectKey: (slotIndex: number, mode: KeyMode) => void;
	onAuditionRelationship: (direction: "fourth" | "fifth") => void;
	onToggleWalk: (direction: "fourth" | "fifth") => void;
}

export function FifthsFourthsPanel({
	analysis,
	walkingDirection,
	isTargeted = false,
	onSelectKey,
	onAuditionRelationship,
	onToggleWalk,
}: FifthsFourthsPanelProps) {
	const { fourthNeighbor, fifthNeighbor } = analysis;
	const tonicRoman = analysis.mode === "major" ? "I" : "i";
	const neighbors = [
		{
			info: fourthNeighbor,
			badge: "↺ 4th · +5st",
			moveLabel: `Go to ${fourthNeighbor.shortName} ↺`,
		},
		{
			info: fifthNeighbor,
			badge: "5th ↻ · +7st",
			moveLabel: `Go to ${fifthNeighbor.shortName} ↻`,
		},
	] as const;

	return (
		<section
			id="section-neighbors"
			className={`panel-card neighbors-panel${isTargeted ? " is-toc-targeted" : ""}`}
			aria-labelledby="rel-heading"
		>
			<div className="section-header section-header-compact neighbors-header">
				<div className="section-heading">
					<h2 id="rel-heading" className="section-title">
						Neighbors
					</h2>
					<p className="section-desc">
						Adjacent 4th &amp; 5th keys · 6/7 notes shared · 1 half-step
					</p>
				</div>
				<div className="walk-controls">
					<button
						type="button"
						className={`pill-action-btn pill-action-sm ${walkingDirection === "fourth" ? "is-walking-fourth" : ""}`}
						onClick={() => onToggleWalk("fourth")}
						title="Walk counter-clockwise through the Circle of Fourths"
					>
						{walkingDirection === "fourth" ? (
							<>
								<IconStop size={10} /> Stop
							</>
						) : (
							<>
								<IconRotateCcw size={11} /> Walk 4ths
							</>
						)}
					</button>
					<button
						type="button"
						className={`pill-action-btn pill-action-sm ${walkingDirection === "fifth" ? "is-walking-fifth" : ""}`}
						onClick={() => onToggleWalk("fifth")}
						title="Walk clockwise through the Circle of Fifths"
					>
						{walkingDirection === "fifth" ? (
							<>
								<IconStop size={10} /> Stop
							</>
						) : (
							<>
								Walk 5ths <IconRotate size={11} />
							</>
						)}
					</button>
				</div>
			</div>

			<div className="rel-grid">
				{neighbors.map(({ info, badge, moveLabel }) => {
					const dir = info.direction;
					return (
						<div key={dir} className={`rel-card rel-card-${dir}`}>
							<div className="rel-card-top">
								<span className={`rel-badge rel-badge-${dir}`}>{badge}</span>
								<span className="rel-sig-delta">
									{info.signatureDeltaLabel}
								</span>
							</div>

							<div className="rel-key-row">
								<span className="rel-key-name">{info.name}</span>
								<span className="rel-roman-chip">{info.chordRoman}</span>
							</div>

							<div className="rel-pitch-shift">
								<span className="rel-shift-note">{info.removedNote}</span>
								<span aria-hidden="true">→</span>
								<strong className={`shift-${dir}`}>{info.addedNote}</strong>
							</div>

							<div className="rel-actions">
								<button
									type="button"
									className="mini-btn"
									onClick={() => onAuditionRelationship(dir)}
									title={`Hear ${analysis.shortName} → ${info.shortName} → ${analysis.shortName}`}
								>
									<IconPlay size={10} />
									<span>
										{tonicRoman}–{info.chordRoman}–{tonicRoman}
									</span>
								</button>
								<button
									type="button"
									className={`mini-btn mini-btn-accent-${dir}`}
									onClick={() => onSelectKey(info.slotIndex, info.mode)}
								>
									{moveLabel}
								</button>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}
