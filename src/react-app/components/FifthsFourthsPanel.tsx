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
						{walkingDirection === "fourth"
							? "■ Stop 4ths"
							: "↺ Walk 4ths"}
					</button>
					<button
						type="button"
						className={`pill-action-btn ${walkingDirection === "fifth" ? "is-walking-fifth" : ""}`}
						onClick={() => onToggleWalk("fifth")}
						title="Step continuously clockwise through the Circle of Fifths"
					>
						{walkingDirection === "fifth"
							? "■ Stop 5ths"
							: "Walk 5ths ↻"}
					</button>
				</div>
			</div>

			<div className="rel-grid">
				{/* Counter-Clockwise: Ascending 4th */}
				<div className="rel-card rel-card-fourth">
					<div className="rel-card-top">
						<span className="rel-badge rel-badge-fourth">
							↺ 4th · +5 semitones
						</span>
						<span className="rel-sig-delta">
							{fourthNeighbor.signatureDeltaLabel}
						</span>
					</div>

					<div className="rel-key-row">
						<span className="rel-key-name">{fourthNeighbor.name}</span>
						<span className="rel-roman-chip">{fourthNeighbor.chordRoman}</span>
					</div>

					<div className="rel-pitch-shift">
						<span>{fourthNeighbor.sharedCount}/7 shared</span>
						<span className="shift-dot">·</span>
						<span>
							<strong>{fourthNeighbor.removedNote}</strong> →{" "}
							<strong className="shift-fourth">
								{fourthNeighbor.addedNote}
							</strong>
						</span>
					</div>

					<div className="rel-actions">
						<button
							type="button"
							className="mini-btn"
							onClick={() => onAuditionRelationship("fourth")}
							title={`Hear ${analysis.shortName} → ${fourthNeighbor.shortName} → ${analysis.shortName}`}
						>
							▶ Hear {tonicRoman}–{fourthNeighbor.chordRoman}–{tonicRoman}
						</button>
						<button
							type="button"
							className="mini-btn mini-btn-accent-fourth"
							onClick={() =>
								onSelectKey(fourthNeighbor.slotIndex, fourthNeighbor.mode)
							}
						>
							Move to {fourthNeighbor.shortName} ↺
						</button>
					</div>
				</div>

				{/* Clockwise: Ascending 5th */}
				<div className="rel-card rel-card-fifth">
					<div className="rel-card-top">
						<span className="rel-badge rel-badge-fifth">
							5th ↻ · +7 semitones
						</span>
						<span className="rel-sig-delta">
							{fifthNeighbor.signatureDeltaLabel}
						</span>
					</div>

					<div className="rel-key-row">
						<span className="rel-key-name">{fifthNeighbor.name}</span>
						<span className="rel-roman-chip">{fifthNeighbor.chordRoman}</span>
					</div>

					<div className="rel-pitch-shift">
						<span>{fifthNeighbor.sharedCount}/7 shared</span>
						<span className="shift-dot">·</span>
						<span>
							<strong>{fifthNeighbor.removedNote}</strong> →{" "}
							<strong className="shift-fifth">
								{fifthNeighbor.addedNote}
							</strong>
						</span>
					</div>

					<div className="rel-actions">
						<button
							type="button"
							className="mini-btn"
							onClick={() => onAuditionRelationship("fifth")}
							title={`Hear ${analysis.shortName} → ${fifthNeighbor.shortName} → ${analysis.shortName}`}
						>
							▶ Hear {tonicRoman}–{fifthNeighbor.chordRoman}–{tonicRoman}
						</button>
						<button
							type="button"
							className="mini-btn mini-btn-accent-fifth"
							onClick={() =>
								onSelectKey(fifthNeighbor.slotIndex, fifthNeighbor.mode)
							}
						>
							Move to {fifthNeighbor.shortName} ↻
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
