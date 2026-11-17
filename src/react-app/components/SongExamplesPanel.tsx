import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
	type SongExample,
	describeRomanFunction,
	findPlaybackEventAtTime,
	findSongSectionForBar,
	flattenSongPlaybackSteps,
	formatSongTime,
	getSongBarStartTimes,
} from "../theory/songExamples";
import { IconChevronDown } from "./Icons";

export interface SongExamplesPanelProps {
	songs: SongExample[];
	selectedSongId?: string | null;
	playingSongId: string | null;
	cuedSongId?: string | null;
	songPositionMs?: number;
	activeChordStepIndex: number | null;
	activeNoteLabel: string | null;
	selectedPreviewStepId: string | null;
	onSelectSong?: (songId: string) => void;
	onTogglePlaySong: (song: SongExample) => void;
	onStopSong?: () => void;
	onSeekSong?: (
		song: SongExample,
		timeMs: number,
		resumePlayback?: boolean,
	) => void;
	onBeginScrubSong?: (song: SongExample) => void;
	onSkipSongBar?: (song: SongExample, deltaBars: number) => void;
	onPlayFromSongBar?: (song: SongExample, stepIndex: number) => void;
	onSelectSongChordStep: (song: SongExample, stepIndex: number) => void;
}

type SongCardProps = Omit<
	SongExamplesPanelProps,
	"songs" | "selectedSongId" | "onSelectSong"
> & {
	song: SongExample;
	cuedSongId: string | null;
	songPositionMs: number;
};

function SongCard({
	song,
	playingSongId,
	cuedSongId,
	songPositionMs,
	activeChordStepIndex,
	activeNoteLabel,
	selectedPreviewStepId,
	onTogglePlaySong,
	onStopSong,
	onSeekSong,
	onBeginScrubSong,
	onSkipSongBar,
	onPlayFromSongBar,
	onSelectSongChordStep,
}: SongCardProps) {
	const timelineRef = useRef<HTMLDivElement | null>(null);
	const stepButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const isScrubbingRef = useRef(false);
	const wasPlayingOnScrubRef = useRef(false);
	const latestScrubMsRef = useRef(0);
	const scrubCleanupRef = useRef<(() => void) | null>(null);
	const [studyGuideOpen, setStudyGuideOpen] = useState(false);
	const [tipsOpen, setTipsOpen] = useState(false);

	const playbackPlan = useMemo(() => flattenSongPlaybackSteps(song), [song]);
	const barStartTimes = useMemo(() => getSongBarStartTimes(song), [song]);
	const totalDurationMs = playbackPlan.totalDurationMs;

	const isPlayingThis = playingSongId === song.id;
	const isCuedThis = cuedSongId === song.id || isPlayingThis;
	const isPausedThis = isCuedThis && !isPlayingThis;

	const previewIndex = useMemo(() => {
		if (!selectedPreviewStepId) return -1;
		return song.steps.findIndex((s) => s.id === selectedPreviewStepId);
	}, [song.steps, selectedPreviewStepId]);

	const displayMs = useMemo(() => {
		if (isCuedThis) {
			return Math.max(0, Math.min(songPositionMs, totalDurationMs));
		}
		if (previewIndex >= 0) {
			return barStartTimes[previewIndex] ?? 0;
		}
		return 0;
	}, [
		isCuedThis,
		songPositionMs,
		totalDurationMs,
		previewIndex,
		barStartTimes,
	]);

	const activeBarIndex = useMemo(() => {
		if (isCuedThis && activeChordStepIndex !== null) {
			return activeChordStepIndex;
		}
		if (isCuedThis) {
			const match = findPlaybackEventAtTime(playbackPlan.events, displayMs);
			return match.event ? match.event.chordStepIndex : 0;
		}
		if (previewIndex >= 0) return previewIndex;
		return 0;
	}, [
		isCuedThis,
		activeChordStepIndex,
		playbackPlan.events,
		displayMs,
		previewIndex,
	]);

	const liveStep =
		isCuedThis && activeBarIndex >= 0
			? (song.steps[activeBarIndex] ?? null)
			: null;
	const previewStep =
		!isCuedThis && previewIndex >= 0
			? (song.steps[previewIndex] ?? null)
			: null;

	useEffect(() => {
		return () => {
			scrubCleanupRef.current?.();
			scrubCleanupRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!isCuedThis && previewIndex < 0) return;
		const container = timelineRef.current;
		const targetIdx = isCuedThis ? activeBarIndex : previewIndex;
		const activeBtn = stepButtonRefs.current[targetIdx];
		if (!container || !activeBtn) return;
		if (container.scrollHeight <= container.clientHeight + 2) return;

		const btnTop = activeBtn.offsetTop;
		const btnBottom = btnTop + activeBtn.offsetHeight;
		const viewTop = container.scrollTop;
		const viewBottom = viewTop + container.clientHeight;
		if (btnTop < viewTop + 6) {
			container.scrollTop = Math.max(0, btnTop - 6);
		} else if (btnBottom > viewBottom - 6) {
			container.scrollTop = btnBottom - container.clientHeight + 6;
		}
	}, [isCuedThis, activeBarIndex, previewIndex]);

	const handleScrubPointerDown = () => {
		scrubCleanupRef.current?.();
		isScrubbingRef.current = true;
		wasPlayingOnScrubRef.current = isPlayingThis;
		latestScrubMsRef.current = displayMs;
		onBeginScrubSong?.(song);

		if (typeof window === "undefined") return;
		const finishScrub = () => {
			if (!isScrubbingRef.current) return;
			isScrubbingRef.current = false;
			const shouldResume = wasPlayingOnScrubRef.current;
			wasPlayingOnScrubRef.current = false;
			scrubCleanupRef.current?.();
			scrubCleanupRef.current = null;
			onSeekSong?.(song, latestScrubMsRef.current, shouldResume);
		};
		window.addEventListener("pointerup", finishScrub, { once: true });
		window.addEventListener("pointercancel", finishScrub, { once: true });
		scrubCleanupRef.current = () => {
			window.removeEventListener("pointerup", finishScrub);
			window.removeEventListener("pointercancel", finishScrub);
		};
	};

	const progressPct =
		totalDurationMs > 0
			? Math.min(100, Math.max(0, (displayMs / totalDurationMs) * 100))
			: 0;
	const primaryToggleLabel = isPlayingThis
		? "❚❚ Pause"
		: isPausedThis
			? "▶ Resume"
			: "▶ Play Song";
	const canStop = isCuedThis || displayMs > 0;
	const isLongTimeline = song.steps.length > 12;
	const activeSection = findSongSectionForBar(song.studyGuide, activeBarIndex);

	return (
		<article
			className={`song-card${isPlayingThis ? " is-playing" : ""}${
				isPausedThis ? " is-paused" : ""
			}`}
		>
			<div className="song-card-top">
				<div className="song-heading">
					<div className="song-title-row">
						<h3 className="song-name">{song.title}</h3>
						<span className="song-composer">{song.composerOrSource}</span>
					</div>
					<div className="song-meta-row">
						<span className="song-meta-chip">{song.keyLabel}</span>
						<span className="song-meta-chip">{song.timeSignature}</span>
						<span className="song-meta-chip">{song.bpm} BPM</span>
						<span className="song-meta-chip">{song.steps.length} Bars</span>
						<span className="song-subtitle">{song.subtitle}</span>
					</div>
				</div>

				<button
					type="button"
					className={`song-play-btn${isPlayingThis ? " is-playing" : ""}${
						isPausedThis ? " is-paused" : ""
					}`}
					aria-pressed={isPlayingThis}
					onClick={() => onTogglePlaySong(song)}
				>
					{primaryToggleLabel}
				</button>
			</div>

			{song.studyGuide ? (
				<div className="song-study-guide">
					<div className="song-sections-wrap">
						<div className="song-sections-header">
							<div
								className="song-sections-pills"
								role="group"
								aria-label={`${song.title} song sections`}
							>
								{song.studyGuide.sections.map((section) => {
									const isCurrent = activeSection?.id === section.id;
									return (
										<button
											key={section.id}
											type="button"
											className={`song-section-pill${isCurrent ? " is-current-section" : ""}`}
											onClick={() =>
												onSelectSongChordStep(song, section.startStepIndex)
											}
											title={`${section.barRange} · ${section.progressionTag}`}
										>
											<span>{section.title}</span>
											<span className="section-pill-bars">
												{section.barRange
													.replace("Bars ", "")
													.replace("Bar ", "B")}
											</span>
										</button>
									);
								})}
							</div>

							<div className="song-guide-toggles">
								<button
									type="button"
									className={`drawer-toggle-btn${studyGuideOpen ? " is-open" : ""}`}
									aria-expanded={studyGuideOpen}
									aria-controls={`song-guide-drawer-${song.id}`}
									onClick={() => setStudyGuideOpen((o) => !o)}
								>
									<span>Study Guide</span>
									<IconChevronDown size={12} />
								</button>
								<button
									type="button"
									className={`chip-btn chip-btn-compact${tipsOpen ? " is-on" : ""}`}
									aria-expanded={tipsOpen}
									onClick={() => setTipsOpen((o) => !o)}
								>
									Practice Tips
								</button>
							</div>
						</div>

						<div
							id={`song-guide-drawer-${song.id}`}
							className="song-guide-drawer"
							hidden={!studyGuideOpen}
						>
							<div className="song-guide-brief">
								<div className="guide-brief-item">
									<span className="guide-brief-label">Sound &amp; Feel</span>
									<p className="guide-brief-text">
										{song.studyGuide.vibeAndSound}
									</p>
								</div>
								<div className="guide-brief-item">
									<span className="guide-brief-label">Harmony Hook</span>
									<p className="guide-brief-text">
										{song.studyGuide.harmonyHook}
									</p>
								</div>
							</div>

							{activeSection && (
								<div className="song-section-spotlight">
									<div className="spotlight-top">
										<span className="spotlight-range">
											{activeSection.barRange}
										</span>
										<code className="spotlight-prog">
											{activeSection.progressionTag}
										</code>
										{onPlayFromSongBar && (
											<button
												type="button"
												className="spotlight-play-btn"
												onClick={() =>
													onPlayFromSongBar(song, activeSection.startStepIndex)
												}
											>
												▶ Play Section
											</button>
										)}
									</div>
									<p className="spotlight-insight">{activeSection.insight}</p>
								</div>
							)}
						</div>

						{tipsOpen && (
							<ul
								className="song-tips-drawer"
								aria-label={`${song.title} beginner practice tips`}
							>
								{song.studyGuide.practiceTips.map((tip, idx) => (
									<li key={idx}>{tip}</li>
								))}
							</ul>
						)}
					</div>
				</div>
			) : (
				<p className="song-theory-note">{song.theorySummary}</p>
			)}

			<div
				className="song-transport"
				role="region"
				aria-label={`${song.title} playback controls`}
			>
				<div className="song-transport-controls">
					<button
						type="button"
						className="song-ctrl-btn"
						aria-label={`Previous bar in ${song.title}`}
						title="Previous bar"
						disabled={!onSkipSongBar}
						onClick={() => onSkipSongBar?.(song, -1)}
					>
						⏮
					</button>
					<button
						type="button"
						className={`song-ctrl-btn is-primary${
							isPlayingThis ? " is-playing" : ""
						}`}
						aria-label={
							isPlayingThis
								? `Pause ${song.title}`
								: isPausedThis
									? `Resume ${song.title}`
									: `Play ${song.title}`
						}
						aria-pressed={isPlayingThis}
						title={isPlayingThis ? "Pause" : isPausedThis ? "Resume" : "Play"}
						onClick={() => onTogglePlaySong(song)}
					>
						{isPlayingThis ? "❚❚" : "▶"}
					</button>
					<button
						type="button"
						className="song-ctrl-btn"
						aria-label={`Stop ${song.title}`}
						title="Stop and reset to Bar 1"
						disabled={!onStopSong || !canStop}
						onClick={() => onStopSong?.()}
					>
						■
					</button>
					<button
						type="button"
						className="song-ctrl-btn"
						aria-label={`Next bar in ${song.title}`}
						title="Next bar"
						disabled={!onSkipSongBar}
						onClick={() => onSkipSongBar?.(song, 1)}
					>
						⏭
					</button>
				</div>

				<div className="song-scrubber-wrap">
					<input
						type="range"
						className="song-scrubber"
						min={0}
						max={Math.max(1, totalDurationMs)}
						step={10}
						value={Math.min(Math.round(displayMs), totalDurationMs)}
						aria-label={`${song.title} playback position`}
						aria-valuetext={`${song.steps[activeBarIndex]?.barLabel ?? "Bar 1"}, ${formatSongTime(displayMs)} of ${formatSongTime(totalDurationMs)}`}
						style={
							{
								"--scrub-progress": `${progressPct}%`,
							} as React.CSSProperties
						}
						onPointerDown={handleScrubPointerDown}
						onChange={(e) => {
							const nextMs = Number(e.target.value);
							latestScrubMsRef.current = nextMs;
							onSeekSong?.(
								song,
								nextMs,
								!isScrubbingRef.current && isPlayingThis,
							);
						}}
					/>
				</div>

				<div className="song-time-readout">
					<span className="song-bar-counter">
						Bar {activeBarIndex + 1}/{song.steps.length}
					</span>
					<span className="song-clock">
						{formatSongTime(displayMs)} / {formatSongTime(totalDurationMs)}
					</span>
				</div>
			</div>

			{liveStep ? (
				<div
					className={`song-live-status${isPausedThis ? " is-paused" : ""}`}
					aria-live="polite"
				>
					<span className="song-live-dot" aria-hidden="true" />
					<span>
						{isPlayingThis ? "Playing" : "Paused"}{" "}
						<strong>{liveStep.barLabel}</strong> ·{" "}
						<strong>
							{liveStep.chordSymbol} ({liveStep.roman})
						</strong>{" "}
						·{" "}
						<span className="song-live-fn">
							{describeRomanFunction(liveStep.roman, liveStep.quality)}
						</span>
						{activeNoteLabel ? ` · Note: ${activeNoteLabel}` : ""}
					</span>
				</div>
			) : previewStep ? (
				<div className="song-live-status is-preview" aria-live="polite">
					<span className="song-live-dot" aria-hidden="true" />
					<span>
						Previewing <strong>{previewStep.barLabel}</strong> ·{" "}
						<strong>
							{previewStep.chordSymbol} ({previewStep.roman})
						</strong>{" "}
						·{" "}
						<span className="song-live-fn">
							{describeRomanFunction(previewStep.roman, previewStep.quality)}
						</span>
					</span>
					{onPlayFromSongBar && (
						<button
							type="button"
							className="song-jump-play-btn"
							onClick={() => onPlayFromSongBar(song, previewIndex)}
						>
							▶ Play from {previewStep.barLabel}
						</button>
					)}
				</div>
			) : null}

			<div
				ref={timelineRef}
				className={`song-timeline${isLongTimeline ? " is-long" : ""}`}
				role="group"
				aria-label={`${song.title} chord progression bars`}
			>
				{song.steps.map((step, idx) => {
					const isLiveActive = isCuedThis && activeBarIndex === idx;
					const isSelectedPreview =
						!isCuedThis && selectedPreviewStepId === step.id;
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
							ref={(el) => {
								stepButtonRefs.current[idx] = el;
							}}
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
							<span className="song-step-chord">{step.chordSymbol}</span>
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
}

export function SongExamplesPanel({
	songs,
	selectedSongId = null,
	playingSongId,
	cuedSongId = null,
	songPositionMs = 0,
	activeChordStepIndex,
	activeNoteLabel,
	selectedPreviewStepId,
	onSelectSong,
	onTogglePlaySong,
	onStopSong,
	onSeekSong,
	onBeginScrubSong,
	onSkipSongBar,
	onPlayFromSongBar,
	onSelectSongChordStep,
}: SongExamplesPanelProps) {
	const selectId = useId();
	const [internalSongId, setInternalSongId] = useState<string | null>(
		songs[0]?.id ?? null,
	);

	if (songs.length === 0) return null;

	const activeSong =
		[selectedSongId, playingSongId, cuedSongId, internalSongId]
			.map((id) => (id ? songs.find((s) => s.id === id) : undefined))
			.find(Boolean) ?? songs[0];
	const activeSongIndex = songs.findIndex((s) => s.id === activeSong.id);

	return (
		<div className="songs-list" aria-label="Real song chord examples">
			<div className="song-selector-bar">
				<div className="song-select-group">
					<label htmlFor={selectId} className="song-select-label">
						Piece
					</label>
					<select
						id={selectId}
						className="song-select"
						aria-label="Choose real song arrangement"
						value={activeSong.id}
						onChange={(e) => {
							const nextId = e.target.value;
							setInternalSongId(nextId);
							onSelectSong?.(nextId);
						}}
					>
						{songs.map((song, idx) => (
							<option key={song.id} value={song.id}>
								{idx + 1}. {song.title} —{" "}
								{song.composerOrSource.split(" · ")[0]} ({song.keyLabel} ·{" "}
								{song.timeSignature} · {song.steps.length} bars)
							</option>
						))}
					</select>
				</div>
				<span className="song-selector-count">
					{activeSongIndex + 1} of {songs.length}{" "}
					{songs.length === 1 ? "piece" : "pieces"}
				</span>
			</div>

			<SongCard
				key={activeSong.id}
				song={activeSong}
				playingSongId={playingSongId}
				cuedSongId={cuedSongId}
				songPositionMs={songPositionMs}
				activeChordStepIndex={activeChordStepIndex}
				activeNoteLabel={activeNoteLabel}
				selectedPreviewStepId={selectedPreviewStepId}
				onTogglePlaySong={onTogglePlaySong}
				onStopSong={onStopSong}
				onSeekSong={onSeekSong}
				onBeginScrubSong={onBeginScrubSong}
				onSkipSongBar={onSkipSongBar}
				onPlayFromSongBar={onPlayFromSongBar}
				onSelectSongChordStep={onSelectSongChordStep}
			/>
		</div>
	);
}
