import type { InstrumentTab, SongExample } from "../theory/songExamples";

export interface SongExamplesPanelProps {
	instrumentView: InstrumentTab;
	songs: SongExample[];
	playingSongId: string | null;
	activeChordStepIndex: number | null;
	activeNoteLabel: string | null;
	selectedPreviewStepId: string | null;
	onTogglePlaySong: (song: SongExample) => void;
	onSelectSongChordStep: (song: SongExample, stepIndex: number) => void;
}

const INSTRUMENT_BADGE_LABELS: Record<InstrumentTab, string> = {
	piano: "Piano Repertoire",
	guitar: "Guitar Repertoire",
	cello: "Cello Only · Baroque Solo",
};

export function SongExamplesPanel({
	instrumentView,
	songs,
	playingSongId,
	activeChordStepIndex,
	activeNoteLabel,
	selectedPreviewStepId,
	onTogglePlaySong,
	onSelectSongChordStep,
}: SongExamplesPanelProps) {
	if (songs.length === 0) return null;

	return (
		<div className="songs-wrap" aria-label="Real song chord examples">
			<div className="songs-header">
				<div className="songs-title-group">
					<span className="songs-title">Learn from Real Songs</span>
					<span className="songs-instrument-badge">
						{INSTRUMENT_BADGE_LABELS[instrumentView]}
					</span>
				</div>
				<span className="songs-hint">
					Play an arrangement or click any bar to inspect chords &amp; hand
					placement
				</span>
			</div>

			<div className="songs-list">
				{songs.map((song) => {
					const isPlayingThis = playingSongId === song.id;
					const liveStep =
						isPlayingThis && activeChordStepIndex !== null
							? song.steps[activeChordStepIndex]
							: null;

					return (
						<article
							key={song.id}
							className={`song-card${isPlayingThis ? " is-playing" : ""}`}
						>
							<div className="song-card-top">
								<div className="song-heading">
									<div className="song-title-row">
										<h3 className="song-name">{song.title}</h3>
										<span className="song-composer">
											{song.composerOrSource}
										</span>
									</div>
									<div className="song-meta-row">
										<span className="song-meta-chip">{song.keyLabel}</span>
										<span className="song-meta-chip">{song.timeSignature}</span>
										<span className="song-meta-chip">{song.bpm} BPM</span>
										<span className="song-subtitle">{song.subtitle}</span>
									</div>
								</div>

								<button
									type="button"
									className={`song-play-btn${isPlayingThis ? " is-playing" : ""}`}
									aria-pressed={isPlayingThis}
									onClick={() => onTogglePlaySong(song)}
								>
									{isPlayingThis ? "■ Stop Song" : "▶ Play Song"}
								</button>
							</div>

							<p className="song-theory-note">{song.theorySummary}</p>

							{liveStep && (
								<div className="song-live-status" aria-live="polite">
									<span className="song-live-dot" aria-hidden="true" />
									<span>
										Playing <strong>{liveStep.barLabel}</strong> ·{" "}
										<strong>
											{liveStep.chordSymbol} ({liveStep.roman})
										</strong>
										{activeNoteLabel ? ` · Note: ${activeNoteLabel}` : ""}
									</span>
								</div>
							)}

							<div
								className="song-timeline"
								role="group"
								aria-label={`${song.title} chord progression bars`}
							>
								{song.steps.map((step, idx) => {
									const isLiveActive =
										isPlayingThis && activeChordStepIndex === idx;
									const isSelectedPreview =
										!isPlayingThis && selectedPreviewStepId === step.id;
									const isHighlighted = isLiveActive || isSelectedPreview;
									const qualityClass =
										step.quality === "minor"
											? "is-minor"
											: step.quality === "diminished"
												? "is-dim"
												: "is-major";

									return (
										<button
											key={step.id}
											type="button"
											className={`song-step-btn ${qualityClass}${
												isHighlighted ? " is-active" : ""
											}`}
											aria-pressed={isHighlighted}
											onClick={() => onSelectSongChordStep(song, idx)}
										>
											<span className="song-step-top">
												<span className="song-step-bar">{step.barLabel}</span>
												<span className="song-step-roman">{step.roman}</span>
											</span>
											<span className="song-step-chord">
												{step.chordSymbol}
											</span>
											<span className="song-step-notes">
												{step.chordNotes.join(" · ")}
											</span>
											<span className="song-step-cue">{step.cue}</span>
										</button>
									);
								})}
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
}
