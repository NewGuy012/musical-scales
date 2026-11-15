import { KeyAnalysis, KeyMode } from "../theory/circleOfFifths";

interface FifthsFourthsPanelProps {
	analysis: KeyAnalysis;
	walkingDirection: "fourth" | "fifth" | null;
	onSelectKey: (slotIndex: number, mode: KeyMode) => void;
	onAuditionRelationship: (direction: "fourth" | "fifth") => void;
	onToggleWalk: (direction: "fourth" | "fifth") => void;
}

export function FifthsFourthsPanel({
	analysis,
	walkingDirection,
	onSelectKey,
	onAuditionRelationship,
	onToggleWalk,
}: FifthsFourthsPanelProps) {
	const { fourthNeighbor, fifthNeighbor } = analysis;
	const tonicRoman = analysis.mode === "major" ? "I" : "i";
	const neighbors = [
		{
			info: fourthNeighbor,
			badge: "↺ 4th · +5 semitones",
			moveLabel: `Move to ${fourthNeighbor.shortName} ↺`,
		},
		{
			info: fifthNeighbor,
			badge: "5th ↻ · +7 semitones",
			moveLabel: `Move to ${fifthNeighbor.shortName} ↻`,
		},
	] as const;

	return (
		<section className="panel-card" aria-labelledby="rel-heading">
			<div className="panel-header-row">
				<div>
					<h2 id="rel-heading" className="panel-title">
						Fifths &amp; Fourths Relationships
					</h2>
					<p className="panel-subtitle">
						Adjacent keys share 6 of 7 notes — shifting only 1 pitch by a
						half-step.
					</p>
				</div>
				<div className="walk-controls">
					<button
						type="button"
						className={`pill-action-btn ${walkingDirection === "fourth" ? "is-walking-fourth" : ""}`}
						onClick={() => onToggleWalk("fourth")}
						title="Step continuously counter-clockwise through the Circle of Fourths"
					>
						{walkingDirection === "fourth" ? "■ Stop 4ths" : "↺ Walk 4ths"}
					</button>
					<button
						type="button"
						className={`pill-action-btn ${walkingDirection === "fifth" ? "is-walking-fifth" : ""}`}
						onClick={() => onToggleWalk("fifth")}
						title="Step continuously clockwise through the Circle of Fifths"
					>
						{walkingDirection === "fifth" ? "■ Stop 5ths" : "Walk 5ths ↻"}
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
								<span>{info.sharedCount}/7 shared</span>
								<span className="shift-dot">·</span>
								<span>
									<strong>{info.removedNote}</strong> →{" "}
									<strong className={`shift-${dir}`}>{info.addedNote}</strong>
								</span>
							</div>

							<div className="rel-actions">
								<button
									type="button"
									className="mini-btn"
									onClick={() => onAuditionRelationship(dir)}
									title={`Hear ${analysis.shortName} → ${info.shortName} → ${analysis.shortName}`}
								>
									▶ Hear {tonicRoman}–{info.chordRoman}–{tonicRoman}
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
