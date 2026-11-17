import { KeyAnalysis, KeyMode } from "../theory/circleOfFifths";
import {
	IconNeighbors,
	IconPlay,
	IconRotate,
	IconRotateCcw,
	IconStop,
} from "./Icons";
import { SectionHeader } from "./SectionHeader";

interface FifthsFourthsPanelProps {
	analysis: KeyAnalysis;
	walkingDirection: "fourth" | "fifth" | null;
	isCollapsed?: boolean;
	onSelectKey: (slotIndex: number, mode: KeyMode) => void;
	onAuditionRelationship: (direction: "fourth" | "fifth") => void;
	onToggleWalk: (direction: "fourth" | "fifth") => void;
	onToggleCollapse?: () => void;
}

export function FifthsFourthsPanel({
	analysis,
	walkingDirection,
	isCollapsed = false,
	onSelectKey,
	onAuditionRelationship,
	onToggleWalk,
	onToggleCollapse,
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

	const walkControls = (
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
	);

	const collapsedQuickNav = (
		<div className="neighbors-quick-pills">
			<button
				type="button"
				className="mini-btn mini-btn-accent-fourth"
				onClick={() =>
					onSelectKey(fourthNeighbor.slotIndex, fourthNeighbor.mode)
				}
				title={`Step counter-clockwise to 4th (${fourthNeighbor.name})`}
			>
				↺ {fourthNeighbor.shortName}
			</button>
			<button
				type="button"
				className="mini-btn mini-btn-accent-fifth"
				onClick={() => onSelectKey(fifthNeighbor.slotIndex, fifthNeighbor.mode)}
				title={`Step clockwise to 5th (${fifthNeighbor.name})`}
			>
				{fifthNeighbor.shortName} ↻
			</button>
		</div>
	);

	return (
		<section
			id="section-neighbors"
			className={`panel-card neighbors-panel${isCollapsed ? " is-collapsed" : ""}`}
			aria-labelledby="rel-heading"
		>
			<SectionHeader
				headingId="rel-heading"
				title="Neighbors"
				description="4th & 5th · 6/7 notes shared"
				bodyId="section-neighbors-body"
				titlePrefix={<IconNeighbors size={14} />}
				compact
				className="neighbors-header"
				isCollapsed={isCollapsed}
				onToggleCollapse={onToggleCollapse}
				actions={!isCollapsed ? walkControls : collapsedQuickNav}
			/>

			<div
				id="section-neighbors-body"
				className="section-body"
				hidden={isCollapsed}
			>
				<div className="rel-grid">
					{neighbors.map(({ info, badge, moveLabel }) => {
						const dir = info.direction;
						return (
							<div key={dir} className={`rel-card rel-card-${dir}`}>
								<div className="rel-card-info">
									<div className="rel-meta-row">
										<span className={`rel-badge rel-badge-${dir}`}>
											{badge}
										</span>
										<span className="rel-pitch-shift">
											<span className="rel-shift-note">{info.removedNote}</span>
											<span aria-hidden="true">→</span>
											<strong className={`shift-${dir}`}>
												{info.addedNote}
											</strong>
										</span>
										<span className="rel-meta-sep" aria-hidden="true">
											·
										</span>
										<span className="rel-sig-delta">
											{info.signatureDeltaLabel}
										</span>
									</div>

									<div className="rel-key-row">
										<span className="rel-key-name">{info.name}</span>
										<span className="rel-roman-chip">{info.chordRoman}</span>
									</div>
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
										title={`Switch key to ${info.name}`}
									>
										{moveLabel}
									</button>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
