import { DiatonicChord, KeyAnalysis } from "../theory/circleOfFifths";

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

function getChordCardId(chord: DiatonicChord, suffix = ""): string {
	return `${chord.roman}-${chord.symbol}${suffix}`;
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
	const renderChordCard = (chord: DiatonicChord, extraSuffix = "") => {
		const id = getChordCardId(chord, extraSuffix);
		const isActive = activeChordId === id;
		const displaySymbol =
			voicingMode === "seventh" ? chord.seventhSymbol : chord.symbol;
		const notes =
			voicingMode === "seventh" ? chord.seventhNotes : chord.triadNotes;

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
				<div className="chord-symbol">{displaySymbol}</div>
				<div className="chord-notes">
					{notes.map((n, idx) => (
						<span key={idx} className="chord-note-chip">
							{n}
						</span>
					))}
				</div>
				<div className="chord-fn">{chord.functionLabel}</div>
			</button>
		);
	};

	const dimId = getChordCardId(analysis.diminishedChord);
	const harmonicVId = analysis.harmonicMinorV
		? getChordCardId(analysis.harmonicMinorV, "-harmonic")
		: null;
	const tonicMajorId = `tonic-pair-major-${analysis.tonicPair.major.symbol}`;
	const tonicMinorId = `tonic-pair-minor-${analysis.tonicPair.minor.symbol}`;

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
					<div className="segmented-control" role="group" aria-label="Chord extension">
						<button
							type="button"
							className={`seg-btn ${voicingMode === "triad" ? "is-active" : ""}`}
							onClick={() => onChangeVoicingMode("triad")}
						>
							Triads
						</button>
						<button
							type="button"
							className={`seg-btn ${voicingMode === "seventh" ? "is-active" : ""}`}
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
				{/* Major Chords Group */}
				<div className="chord-group">
					<div className="chord-group-header">
						<span className="group-dot group-dot-major" />
						<h3 className="group-title">Major Chords</h3>
						<span className="group-count">
							{analysis.majorChords.map((c) => c.roman).join(" · ")}
						</span>
					</div>
					<div className="chord-grid">
						{analysis.majorChords.map((chord) => renderChordCard(chord))}
					</div>
				</div>

				{/* Minor Chords Group */}
				<div className="chord-group">
					<div className="chord-group-header">
						<span className="group-dot group-dot-minor" />
						<h3 className="group-title">Minor Chords</h3>
						<span className="group-count">
							{analysis.minorChords.map((c) => c.roman).join(" · ")}
						</span>
					</div>
					<div className="chord-grid">
						{analysis.minorChords.map((chord) => renderChordCard(chord))}
					</div>
				</div>
			</div>

			{/* Secondary Row: Diminished Chord + Harmonic Minor V (when Minor) + Direct Root Major/Minor */}
			<div className="chords-extras-row">
				<button
					type="button"
					className={`extra-chord-pill extra-dim ${
						activeChordId === dimId ? "is-selected" : ""
					}`}
					onClick={() => onSelectChord(analysis.diminishedChord, dimId)}
				>
					<span className="extra-label">
						Diminished ({analysis.diminishedChord.roman})
					</span>
					<span className="extra-main">
						{voicingMode === "seventh"
							? analysis.diminishedChord.seventhSymbol
							: analysis.diminishedChord.symbol}
					</span>
					<span className="extra-notes">
						{(voicingMode === "seventh"
							? analysis.diminishedChord.seventhNotes
							: analysis.diminishedChord.triadNotes
						).join(" · ")}
					</span>
				</button>

				{analysis.harmonicMinorV && harmonicVId && (
					<button
						type="button"
						className={`extra-chord-pill extra-harmonic ${
							activeChordId === harmonicVId ? "is-selected" : ""
						}`}
						onClick={() =>
							onSelectChord(analysis.harmonicMinorV!, harmonicVId)
						}
						title="Raised 7th harmonic minor dominant chord"
					>
						<span className="extra-label">Harmonic V</span>
						<span className="extra-main">
							{voicingMode === "seventh"
								? analysis.harmonicMinorV.seventhSymbol
								: analysis.harmonicMinorV.symbol}
						</span>
						<span className="extra-notes">
							{(voicingMode === "seventh"
								? analysis.harmonicMinorV.seventhNotes
								: analysis.harmonicMinorV.triadNotes
							).join(" · ")}
						</span>
					</button>
				)}

				<div className="root-pair-box">
					<span className="extra-label">
						Root {analysis.root} Parallel Pair
					</span>
					<div className="root-pair-btns">
						<button
							type="button"
							className={`root-pair-btn pair-maj ${
								activeChordId === tonicMajorId ? "is-selected" : ""
							}`}
							onClick={() => onPlayRootPairChord("major")}
							title={analysis.tonicPair.major.noteLabel}
						>
							<strong>{analysis.tonicPair.major.symbol}</strong>
							<span>{analysis.tonicPair.major.notes.join("·")}</span>
						</button>
						<button
							type="button"
							className={`root-pair-btn pair-min ${
								activeChordId === tonicMinorId ? "is-selected" : ""
							}`}
							onClick={() => onPlayRootPairChord("minor")}
							title={analysis.tonicPair.minor.noteLabel}
						>
							<strong>{analysis.tonicPair.minor.symbol}</strong>
							<span>{analysis.tonicPair.minor.notes.join("·")}</span>
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
