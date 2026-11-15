import {
	DiatonicChord,
	KeyAnalysis,
	getChordCardId,
} from "../theory/circleOfFifths";

export type ChordVoicingMode = "triad" | "seventh";

interface ChordsPanelProps {
	analysis: KeyAnalysis;
	voicingMode: ChordVoicingMode;
	arpeggiate: boolean;
	activeChordId: string | null;
	onChangeVoicingMode: (mode: ChordVoicingMode) => void;
	onToggleArpeggiate: () => void;
	onSelectChord: (chord: DiatonicChord, id: string) => void;
	onPlayRootPairChord: (kind: "major" | "minor") => void;
}

export function ChordsPanel({
	analysis,
	voicingMode,
	arpeggiate,
	activeChordId,
	onChangeVoicingMode,
	onToggleArpeggiate,
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
					<span className="chord-roman">{chord.roman}</span>
					<span className={`quality-pill quality-pill-${chord.quality}`}>
						{chord.quality === "major"
							? "Major"
							: chord.quality === "minor"
								? "Minor"
								: "Dim"}
					</span>
				</div>
				<div className="chord-symbol">{getSymbol(chord)}</div>
				<div className="chord-notes">
					{getNotes(chord).map((n, idx) => (
						<span key={idx} className="chord-note-chip">
							{n}
						</span>
					))}
				</div>
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
		<section className="panel-card" aria-labelledby="chords-heading">
			<div className="panel-header-row">
				<div>
					<h2 id="chords-heading" className="panel-title">
						Major &amp; Minor Chords in {analysis.shortName}
					</h2>
					<p className="panel-subtitle">
						Click any chord to hear its voicing and light up the wheel &amp;
						keyboard.
					</p>
				</div>

				<div className="chord-toolbar">
					<div
						className="segmented-control"
						role="group"
						aria-label="Chord extension"
					>
						<button
							type="button"
							className={`seg-btn ${voicingMode === "triad" ? "is-active" : ""}`}
							onClick={() => onChangeVoicingMode("triad")}
						>
							Triads
						</button>
						<button
							type="button"
							className={`seg-btn ${isSeventh ? "is-active" : ""}`}
							onClick={() => onChangeVoicingMode("seventh")}
						>
							7ths
						</button>
					</div>

					<button
						type="button"
						className={`chip-btn ${arpeggiate ? "is-on" : ""}`}
						onClick={onToggleArpeggiate}
						title="Roll chord notes one by one vs. playing together"
					>
						{arpeggiate ? "Arpeggio On" : "Block Chord"}
					</button>
				</div>
			</div>

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
					`Diminished (${analysis.diminishedChord.roman})`,
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
					<span className="extra-label">
						Root {analysis.root} Parallel Pair
					</span>
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
									title={target.noteLabel}
								>
									<strong>{target.symbol}</strong>
									<span>{target.notes.join("·")}</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>
		</section>
	);
}
