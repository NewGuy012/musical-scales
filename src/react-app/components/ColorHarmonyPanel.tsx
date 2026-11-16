import { useState } from "react";
import {
	ColorHarmonyAnalysis,
	ColorHarmonyPattern,
	HarmonyChordSpec,
	TritoneSubPair,
} from "../theory/chromaticHarmony";
import { IconPlay, IconStop } from "./Icons";

export type ColorHarmonyTopic =
	"chromatic" | "diminished" | "secondary" | "tritone";

interface ColorHarmonyPanelProps {
	colorAnalysis: ColorHarmonyAnalysis;
	activeChordId: string | null;
	activeSequenceId: string | null;
	activeSequenceStepIdx: number | null;
	onSelectChord: (chord: HarmonyChordSpec) => void;
	onPlaySequence: (sequenceId: string, steps: HarmonyChordSpec[]) => void;
}

const TOPICS: readonly { id: ColorHarmonyTopic; label: string }[] = [
	{ id: "chromatic", label: "Chromatic Passing" },
	{ id: "diminished", label: "Diminished Chords" },
	{ id: "secondary", label: "Secondary Dominants" },
	{ id: "tritone", label: "Tritone Subs" },
];

export function ColorHarmonyPanel({
	colorAnalysis,
	activeChordId,
	activeSequenceId,
	activeSequenceStepIdx,
	onSelectChord,
	onPlaySequence,
}: ColorHarmonyPanelProps) {
	const [topic, setTopic] = useState<ColorHarmonyTopic>("chromatic");

	const renderStepChip = (
		chord: HarmonyChordSpec,
		seqId: string,
		stepIdx: number,
		isHighlightTarget: boolean,
	) => {
		const isPlayingStep =
			activeSequenceId === seqId && activeSequenceStepIdx === stepIdx;
		const isSelected = activeChordId === chord.id && !activeSequenceId;

		return (
			<button
				key={`${seqId}-step-${stepIdx}-${chord.id}`}
				type="button"
				className={`color-step-chip chord-quality-${chord.quality} ${
					isHighlightTarget ? "is-highlight-target" : ""
				} ${isPlayingStep || isSelected ? "is-active-step" : ""}`}
				onClick={() => onSelectChord(chord)}
				title={`${chord.symbol} (${chord.romanLabel}): ${chord.notes.join(" · ")}${
					chord.borrowedNotes.length > 0
						? ` · Out-of-key: ${chord.borrowedNotes.join(", ")}`
						: ""
				}`}
			>
				<span className="csc-top">
					<span className="csc-roman">{chord.romanLabel}</span>
					{isHighlightTarget && chord.roleTag && (
						<span className="csc-badge">{chord.roleTag}</span>
					)}
				</span>
				<span className="csc-sym">{chord.symbol}</span>
				<span className="csc-notes">{chord.notes.join("·")}</span>
				{chord.borrowedNotes.length > 0 && (
					<span className="csc-borrowed">
						+{chord.borrowedNotes.join(", ")}
					</span>
				)}
			</button>
		);
	};

	const renderPatternCard = (pattern: ColorHarmonyPattern) => {
		const {
			id,
			title,
			kindLabel,
			formula,
			explanation,
			steps,
			targetStepIndex,
		} = pattern;
		const isPlaying = activeSequenceId === id;

		return (
			<article key={id} className="color-pattern-card">
				<div className="color-pattern-head">
					<div className="color-pattern-titles">
						<span className="color-kind-badge">{kindLabel}</span>
						<h3 className="color-pattern-title">{title}</h3>
						<span className="color-pattern-formula">{formula}</span>
					</div>
					<button
						type="button"
						className={`pill-action-btn pill-action-sm ${
							isPlaying ? "is-playing" : ""
						}`}
						onClick={() => onPlaySequence(id, steps)}
					>
						{isPlaying ? (
							<>
								<IconStop size={10} /> Stop
							</>
						) : (
							<>
								<IconPlay size={10} /> Play
							</>
						)}
					</button>
				</div>

				<div
					className="color-steps-row"
					role="group"
					aria-label={`${title} chords`}
				>
					{steps.map((step, idx) =>
						renderStepChip(step, id, idx, idx === targetStepIndex),
					)}
				</div>

				<p className="color-pattern-desc">{explanation}</p>
			</article>
		);
	};

	const renderTritoneComparisonCard = (
		pair: TritoneSubPair,
		compact = false,
	) => {
		const origId = `${pair.id}-orig`;
		const subId = `${pair.id}-sub`;
		const isPlayingOrig = activeSequenceId === origId;
		const isPlayingSub = activeSequenceId === subId;

		return (
			<article
				key={pair.id}
				className={`color-pattern-card ${compact ? "is-compact" : ""}`}
			>
				<div className="color-pattern-head">
					<div className="color-pattern-titles">
						<h3 className="color-pattern-title">{pair.label}</h3>
						<span className="tritone-guide-pill">
							Shared tritone: {pair.sharedTritoneNotes.join(" & ")}
						</span>
					</div>
				</div>

				<div className="tritone-ab-grid">
					<div className="tritone-branch">
						<div className="tritone-branch-head">
							<span className="tritone-branch-label">
								Standard V7 ({pair.originalDominant.symbol})
							</span>
							<button
								type="button"
								className={`pill-action-btn pill-action-sm ${
									isPlayingOrig ? "is-playing" : ""
								}`}
								onClick={() => onPlaySequence(origId, pair.originalProgression)}
							>
								{isPlayingOrig ? (
									<>
										<IconStop size={10} /> Stop
									</>
								) : (
									<>
										<IconPlay size={10} /> Hear V7
									</>
								)}
							</button>
						</div>
						<div className="color-steps-row">
							{pair.originalProgression.map((step, idx) =>
								renderStepChip(step, origId, idx, idx === 1),
							)}
						</div>
					</div>

					<div className="tritone-branch is-sub">
						<div className="tritone-branch-head">
							<span className="tritone-branch-label">
								Tritone Sub ({pair.tritoneSubChord.symbol})
							</span>
							<button
								type="button"
								className={`pill-action-btn pill-action-sm ${
									isPlayingSub ? "is-playing" : ""
								}`}
								onClick={() => onPlaySequence(subId, pair.subProgression)}
							>
								{isPlayingSub ? (
									<>
										<IconStop size={10} /> Stop
									</>
								) : (
									<>
										<IconPlay size={10} /> Hear ♭II7
									</>
								)}
							</button>
						</div>
						<div className="color-steps-row">
							{pair.subProgression.map((step, idx) =>
								renderStepChip(step, subId, idx, idx === 1),
							)}
						</div>
					</div>
				</div>

				<p className="color-pattern-desc">
					{pair.tritoneMathNote} {pair.bassMotionComparison}
				</p>
			</article>
		);
	};

	return (
		<div className="color-harmony-wrap">
			<div
				className="color-topic-pills"
				role="tablist"
				aria-label="Color and passing harmony concepts"
			>
				{TOPICS.map((item) => (
					<button
						key={item.id}
						type="button"
						role="tab"
						aria-selected={topic === item.id}
						className={`color-topic-pill ${
							topic === item.id ? "is-active" : ""
						}`}
						onClick={() => setTopic(item.id)}
					>
						{item.label}
					</button>
				))}
			</div>

			{topic === "chromatic" && (
				<div className="color-topic-body">
					<p className="color-topic-overview">
						{colorAnalysis.chromaticPassing.overview}
					</p>
					<div className="color-cards-stack">
						{colorAnalysis.chromaticPassing.patterns.map(renderPatternCard)}
					</div>
				</div>
			)}

			{topic === "diminished" && (
				<div className="color-topic-body">
					<p className="color-topic-overview">
						{colorAnalysis.diminishedHarmony.overview}
					</p>

					<section className="dim-symmetry-box">
						<div className="color-pattern-head">
							<div className="color-pattern-titles">
								<span className="color-kind-badge">Symmetry Engine</span>
								<h3 className="color-pattern-title">
									{colorAnalysis.diminishedHarmony.symmetryFamilyTitle}
								</h3>
							</div>
							<button
								type="button"
								className={`pill-action-btn pill-action-sm ${
									activeSequenceId === "dim-symmetry-walk" ? "is-playing" : ""
								}`}
								onClick={() =>
									onPlaySequence(
										"dim-symmetry-walk",
										colorAnalysis.diminishedHarmony.symmetryFamilyChords,
									)
								}
							>
								{activeSequenceId === "dim-symmetry-walk" ? (
									<>
										<IconStop size={10} /> Stop
									</>
								) : (
									<>
										<IconPlay size={10} /> Hear 3-Fret Shift
									</>
								)}
							</button>
						</div>
						<p className="color-pattern-desc">
							{colorAnalysis.diminishedHarmony.symmetryNote}
						</p>
						<div className="dim-symmetry-grid">
							{colorAnalysis.diminishedHarmony.symmetryFamilyChords.map(
								(chord, idx) =>
									renderStepChip(chord, "dim-symmetry-walk", idx, idx === 0),
							)}
						</div>
					</section>

					<div className="color-cards-stack">
						{colorAnalysis.diminishedHarmony.patterns.map(renderPatternCard)}
					</div>
				</div>
			)}

			{topic === "secondary" && (
				<div className="color-topic-body">
					<p className="color-topic-overview">
						{colorAnalysis.secondaryDominants.overview}
					</p>
					<div className="sec-dom-grid">
						{colorAnalysis.secondaryDominants.items.map((item) => {
							const seqId = `secdom-seq-${item.id}`;
							const isPlaying = activeSequenceId === seqId;
							return (
								<article key={item.id} className="sec-dom-card">
									<div className="sec-dom-head">
										<div className="sec-dom-title-group">
											<span className="sec-dom-roman">{item.romanLabel}</span>
											<span className="sec-dom-arrow">
												→ {item.targetChord.symbol} ({item.targetRoman})
											</span>
										</div>
										<button
											type="button"
											className={`pill-action-btn pill-action-sm ${
												isPlaying ? "is-playing" : ""
											}`}
											onClick={() =>
												onPlaySequence(seqId, item.resolutionSteps)
											}
										>
											{isPlaying ? (
												<>
													<IconStop size={10} /> Stop
												</>
											) : (
												<>
													<IconPlay size={10} /> Resolve
												</>
											)}
										</button>
									</div>

									<div className="color-steps-row">
										{item.resolutionSteps.map((step, idx) =>
											renderStepChip(step, seqId, idx, idx === 0),
										)}
									</div>

									<p className="color-pattern-desc">
										<strong>Pull:</strong> {item.leadingToneMove}{" "}
										{item.circleMotionNote}
									</p>
								</article>
							);
						})}
					</div>
				</div>
			)}

			{topic === "tritone" && (
				<div className="color-topic-body">
					<p className="color-topic-overview">
						{colorAnalysis.tritoneSubstitutions.overview}
					</p>

					{renderTritoneComparisonCard(
						colorAnalysis.tritoneSubstitutions.primary,
					)}

					{colorAnalysis.tritoneSubstitutions.secondarySubs.length > 0 && (
						<div className="secondary-tritones-wrap">
							<h3 className="secondary-tritones-heading">
								Secondary Tritone Substitutions (subV7 / target)
							</h3>
							<div className="color-cards-stack">
								{colorAnalysis.tritoneSubstitutions.secondarySubs.map((pair) =>
									renderTritoneComparisonCard(pair, true),
								)}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
