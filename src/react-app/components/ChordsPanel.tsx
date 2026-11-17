import { useState } from "react";
import {
	DiatonicChord,
	KeyAnalysis,
	getChordCardId,
} from "../theory/circleOfFifths";
import { IconChevronDown } from "./Icons";

export type ChordVoicingMode = "triad" | "seventh";

interface ChordsPanelProps {
	analysis: KeyAnalysis;
	voicingMode: ChordVoicingMode;
	activeChordId: string | null;
	onSelectChord: (chord: DiatonicChord, id: string) => void;
	onPlayRootPairChord: (kind: "major" | "minor") => void;
}

export function ChordsPanel({
	analysis,
	voicingMode,
	activeChordId,
	onSelectChord,
	onPlayRootPairChord,
}: ChordsPanelProps) {
	const [extrasOpen, setExtrasOpen] = useState(false);
	const isSeventh = voicingMode === "seventh";
	const getSymbol = (c: DiatonicChord) =>
		isSeventh ? c.seventhSymbol : c.symbol;
	const getNotes = (c: DiatonicChord) =>
		isSeventh ? c.seventhNotes : c.triadNotes;

	const harmonicVId = analysis.harmonicMinorV
		? getChordCardId(analysis.harmonicMinorV, "-harmonic")
		: null;
	const isExtraChordActive =
		(harmonicVId !== null && activeChordId === harmonicVId) ||
		(activeChordId !== null && activeChordId.startsWith("tonic-pair-"));
	const showExtras = extrasOpen || isExtraChordActive;

	const renderChordCard = (chord: DiatonicChord, extraSuffix = "") => {
		const id = getChordCardId(chord, extraSuffix);
		const isActive = activeChordId === id;

		return (
			<button
				key={id}
				type="button"
				className={`chord-card chord-quality-${chord.quality} ${
					isActive ? "is-selected" : ""
				}`}
				onClick={() => onSelectChord(chord, id)}
			>
				<div className="chord-card-top">
					<span className={`chord-roman chord-roman-${chord.quality}`}>
						{chord.roman}
					</span>
				</div>
				<div className="chord-symbol">{getSymbol(chord)}</div>
				<div className="chord-notes-line">{getNotes(chord).join(" · ")}</div>
				<div className="chord-fn">{chord.functionLabel}</div>
			</button>
		);
	};

	const renderExtraPill = (
		chord: DiatonicChord,
		label: string,
		variantClass: string,
		suffix = "",
		title?: string,
	) => {
		const id = getChordCardId(chord, suffix);
		return (
			<button
				key={id}
				type="button"
				className={`extra-chord-pill ${variantClass} ${
					activeChordId === id ? "is-selected" : ""
				}`}
				onClick={() => onSelectChord(chord, id)}
				title={title}
			>
				<span className="extra-label">{label}</span>
				<span className="extra-main">{getSymbol(chord)}</span>
				<span className="extra-notes">{getNotes(chord).join(" · ")}</span>
			</button>
		);
	};

	return (
		<div className="chords-panel-wrap">
			<div
				className="diatonic-chords-grid"
				role="group"
				aria-label={`Diatonic chords in ${analysis.shortName}`}
			>
				{analysis.chords.map((chord) => renderChordCard(chord))}
			</div>

			<div className="chords-footer-bar">
				<div className="chord-quality-legend" aria-label="Chord quality groups">
					<span className="quality-legend-item">
						<span className="group-dot group-dot-major" />
						<span>
							Major Chords (
							{analysis.majorChords.map((c) => c.roman).join(" · ")})
						</span>
					</span>
					<span className="quality-legend-item">
						<span className="group-dot group-dot-minor" />
						<span>
							Minor Chords (
							{analysis.minorChords.map((c) => c.roman).join(" · ")})
						</span>
					</span>
					<span className="quality-legend-item">
						<span className="group-dot group-dot-dim" />
						<span>Dim ({analysis.diminishedChord.roman})</span>
					</span>
				</div>

				<button
					type="button"
					className={`drawer-toggle-btn ${showExtras ? "is-open" : ""}`}
					aria-expanded={showExtras}
					aria-controls="chords-extras-drawer"
					onClick={() => setExtrasOpen((open) => !open)}
				>
					<span>
						{analysis.harmonicMinorV
							? `Harmonic V & Parallel ${analysis.root}`
							: `Parallel ${analysis.root} (Major / Minor)`}
					</span>
					<IconChevronDown size={12} />
				</button>
			</div>

			<div
				id="chords-extras-drawer"
				className="chords-extras-row"
				hidden={!showExtras}
			>
				{analysis.harmonicMinorV &&
					renderExtraPill(
						analysis.harmonicMinorV,
						"Harmonic V",
						"extra-harmonic",
						"-harmonic",
						"Raised 7th harmonic minor dominant chord",
					)}

				<div className="root-pair-box">
					<span className="extra-label">Parallel {analysis.root}</span>
					<div className="root-pair-btns">
						{(["major", "minor"] as const).map((kind) => {
							const target = analysis.tonicPair[kind];
							const id = `tonic-pair-${kind}-${target.symbol}`;
							return (
								<button
									key={kind}
									type="button"
									className={`root-pair-btn pair-${kind.slice(0, 3)} ${
										activeChordId === id ? "is-selected" : ""
									}`}
									onClick={() => onPlayRootPairChord(kind)}
									title={target.noteLabel ?? target.notes.join(" · ")}
								>
									<strong>{target.symbol}</strong>
									<span>{target.notes.join("·")}</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
