import {
	DiatonicChord,
	KeyAnalysis,
	getChordCardId,
} from "../theory/circleOfFifths";

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
	const isSeventh = voicingMode === "seventh";
	const getSymbol = (c: DiatonicChord) =>
		isSeventh ? c.seventhSymbol : c.symbol;
	const getNotes = (c: DiatonicChord) =>
		isSeventh ? c.seventhNotes : c.triadNotes;

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

	const groups = [
		{ title: "Major Chords", dot: "major", chords: analysis.majorChords },
		{ title: "Minor Chords", dot: "minor", chords: analysis.minorChords },
	] as const;

	return (
		<>
			<div className="chord-groups">
				{groups.map(({ title, dot, chords }) => (
					<div key={dot} className="chord-group">
						<div className="chord-group-header">
							<span className={`group-dot group-dot-${dot}`} />
							<h3 className="group-title">{title}</h3>
							<span className="group-count">
								{chords.map((c) => c.roman).join(" · ")}
							</span>
						</div>
						<div className="chord-grid">
							{chords.map((chord) => renderChordCard(chord))}
						</div>
					</div>
				))}
			</div>

			<div className="chords-extras-row">
				{renderExtraPill(
					analysis.diminishedChord,
					`Dim (${analysis.diminishedChord.roman})`,
					"extra-dim",
				)}
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
		</>
	);
}
