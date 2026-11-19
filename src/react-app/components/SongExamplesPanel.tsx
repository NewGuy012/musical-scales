import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
	type InstrumentTab,
	type SongExample,
	describeRomanFunction,
	findPlaybackEventAtTime,
	findSongSectionForBar,
	flattenSongPlaybackSteps,
	formatSongTime,
	getSongBarStartTimes,
} from "../songs/songRuntime";
import { IconChevronDown, IconX, getQualityClass } from "./Icons";

const PRACTICE_SPEED_OPTIONS = [
	{ value: 0.5, label: "0.5x", title: "Practice speed 0.5x" },
	{ value: 0.75, label: "0.75x", title: "Practice speed 0.75x" },
	{ value: 1, label: "1x", title: "Practice speed 1x" },
	{ value: 1.25, label: "1.25x", title: "Practice speed 1.25x" },
	{ value: 1.5, label: "1.5x", title: "Practice speed 1.5x" },
	{ value: 1.75, label: "1.75x", title: "Practice speed 1.75x" },
	{ value: 2, label: "2x", title: "Practice speed 2x" },
] as const;

export interface OtherInstrumentSongCount {
	instrument: InstrumentTab;
	label: string;
	count: number;
}

export interface SongExamplesPanelProps {
	songs: SongExample[];
	activeInstrumentLabel?: string;
	otherInstrumentsWithSongs?: OtherInstrumentSongCount[];
	selectedSongId?: string | null;
	playingSongId: string | null;
	cuedSongId?: string | null;
	songPositionMs?: number;
	playbackSpeed?: number;
	activeChordStepIndex: number | null;
	activeNoteLabel: string | null;
	selectedPreviewStepId: string | null;
	onSelectSong?: (songId: string) => void;
	onSelectInstrument?: (
		instrument: InstrumentTab,
		anchorEl?: HTMLElement | null,
	) => void;
	onRemoveLocalPreview?: (songId: string) => void;
	onChangePlaybackSpeed?: (speed: number) => void;
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
	| "songs"
	| "selectedSongId"
	| "onSelectSong"
	| "activeInstrumentLabel"
	| "otherInstrumentsWithSongs"
	| "onSelectInstrument"
> & {
	song: SongExample;
	cuedSongId: string | null;
	songPositionMs: number;
	playbackSpeed: number;
};

function SongCard({
	song,
	playingSongId,
	cuedSongId,
	songPositionMs,
	playbackSpeed,
	activeChordStepIndex,
	activeNoteLabel,
	selectedPreviewStepId,
	onRemoveLocalPreview,
	onChangePlaybackSpeed,
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
	const [coachCollapsed, setCoachCollapsed] = useState(false);

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

	const selectedSpeedOption =
		PRACTICE_SPEED_OPTIONS.find(
			(o) => Math.abs(o.value - playbackSpeed) < 0.01,
		) ??
		PRACTICE_SPEED_OPTIONS.find((o) => o.value === 1) ??
		PRACTICE_SPEED_OPTIONS[0];

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
	const statusStep = liveStep ?? previewStep;
	const activeStatusIndex = liveStep ? activeBarIndex : previewIndex;
	const hasStatusStep = Boolean(statusStep);
	const hasSteps = song.steps.length > 0;
	const totalBars = song.steps.length || song.barCount || 0;
	const isLongTimeline = totalBars > 12;
	const activeSection = findSongSectionForBar(song.studyGuide, activeBarIndex);

	useEffect(() => {
		if (!hasStatusStep) {
			setCoachCollapsed(false);
		}
	}, [hasStatusStep]);

	const prevStatusStep =
		statusStep && activeStatusIndex > 0
			? (song.steps[activeStatusIndex - 1] ?? null)
			: null;
	const nextStatusStep =
		statusStep &&
		activeStatusIndex >= 0 &&
		activeStatusIndex + 1 < song.steps.length
			? (song.steps[activeStatusIndex + 1] ?? null)
			: null;

	let activeSubChordIdx = 0;
	if (
		isCuedThis &&
		statusStep?.subBarChords &&
		statusStep.subBarChords.length > 1
	) {
		const barStartMs = barStartTimes[activeBarIndex] ?? 0;
		const elapsedInBarMs = Math.max(0, displayMs - barStartMs);
		for (let i = 0; i < statusStep.subBarChords.length; i++) {
			if (statusStep.subBarChords[i].offsetMs <= elapsedInBarMs + 0.5) {
				activeSubChordIdx = i;
			}
		}
	}

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
						{song.isLocalPreview && (
							<span className="song-local-badge">Local Preview</span>
						)}
					</div>
					<div className="song-meta-row">
						<span className="song-meta-chip">{song.keyLabel}</span>
						<span className="song-meta-chip">{song.timeSignature}</span>
						<span className="song-meta-chip">{song.bpm} BPM</span>
						<span className="song-meta-chip">{totalBars} Bars</span>
						<span className="song-subtitle">{song.subtitle}</span>
					</div>
				</div>

				<div className="song-card-actions">
					{song.isLocalPreview && onRemoveLocalPreview && (
						<button
							type="button"
							className="chip-btn chip-btn-compact"
							onClick={() => onRemoveLocalPreview(song.id)}
							title="Remove local MusicXML preview"
							aria-label={`Remove ${song.title} local preview`}
						>
							<IconX size={11} />
							<span>Remove</span>
						</button>
					)}
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
						disabled={!onSkipSongBar || !hasSteps}
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
						disabled={!onSkipSongBar || !hasSteps}
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
						disabled={!hasSteps}
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
						Bar {Math.min(activeBarIndex + 1, Math.max(1, totalBars))}/
						{totalBars}
					</span>
					<span className="song-clock">
						{formatSongTime(displayMs)} / {formatSongTime(totalDurationMs)}
					</span>
					{onChangePlaybackSpeed && (
						<select
							className="song-speed-select"
							aria-label={`${song.title} practice speed`}
							title={selectedSpeedOption.title}
							value={String(selectedSpeedOption.value)}
							onChange={(e) => onChangePlaybackSpeed(Number(e.target.value))}
						>
							{PRACTICE_SPEED_OPTIONS.map((opt) => (
								<option key={opt.value} value={String(opt.value)}>
									{opt.label}
								</option>
							))}
						</select>
					)}
				</div>
			</div>

			{statusStep && (
				<section
					className={`song-live-status song-live-coach${
						liveStep ? (isPausedThis ? " is-paused" : "") : " is-preview"
					}${coachCollapsed ? " is-collapsed" : ""}`}
					aria-label={`${statusStep.barLabel} music theory coach`}
				>
					<div className="song-live-status-row">
						<div className="song-live-status-main" aria-live="polite">
							<span className="song-live-dot" aria-hidden="true" />
							<span>
								{liveStep
									? isPlayingThis
										? "Playing"
										: "Paused"
									: "Previewing"}{" "}
								<strong>{statusStep.barLabel}</strong> ·{" "}
								<strong>
									{statusStep.chordSymbol} ({statusStep.roman})
								</strong>{" "}
								·{" "}
								<span className="song-live-fn">
									{statusStep.theory?.roleLabel ??
										describeRomanFunction(statusStep.roman, statusStep.quality)}
								</span>
								{liveStep && activeNoteLabel
									? ` · Note: ${activeNoteLabel}`
									: ""}
							</span>
						</div>

						<div className="song-coach-actions">
							{!liveStep && onPlayFromSongBar && (
								<button
									type="button"
									className="song-jump-play-btn"
									onClick={() => onPlayFromSongBar(song, previewIndex)}
								>
									▶ Play from {statusStep.barLabel}
								</button>
							)}
							{statusStep.theory && (
								<button
									type="button"
									className="drawer-toggle-btn"
									aria-expanded={!coachCollapsed}
									aria-controls={`song-coach-body-${song.id}`}
									onClick={() => setCoachCollapsed((c) => !c)}
								>
									<span>{coachCollapsed ? "Show Theory" : "Hide Theory"}</span>
									<IconChevronDown size={12} />
								</button>
							)}
						</div>
					</div>

					{statusStep.theory && !coachCollapsed && (
						<div id={`song-coach-body-${song.id}`} className="song-coach-body">
							<div className="song-coach-context-row">
								<div
									className="song-coach-progression"
									role="group"
									aria-label="Surrounding chord progression"
								>
									{prevStatusStep ? (
										<button
											type="button"
											className="coach-neighbor-btn"
											onClick={() =>
												onSelectSongChordStep(song, activeStatusIndex - 1)
											}
											title={`Jump to ${prevStatusStep.barLabel}: ${prevStatusStep.chordSymbol}`}
										>
											<span className="coach-neighbor-bar">
												{prevStatusStep.barLabel}
											</span>
											<span>
												{prevStatusStep.chordSymbol} ({prevStatusStep.roman})
											</span>
										</button>
									) : (
										<span className="coach-context-edge">Start</span>
									)}
									<span className="coach-arrow" aria-hidden="true">
										→
									</span>
									<span className="coach-current-pill">
										<span className="coach-neighbor-bar">
											{statusStep.barLabel}
										</span>
										<strong>
											{statusStep.chordSymbol} ({statusStep.roman})
										</strong>
									</span>
									<span className="coach-arrow" aria-hidden="true">
										→
									</span>
									{nextStatusStep ? (
										<button
											type="button"
											className="coach-neighbor-btn"
											onClick={() =>
												onSelectSongChordStep(song, activeStatusIndex + 1)
											}
											title={`Jump to ${nextStatusStep.barLabel}: ${nextStatusStep.chordSymbol}`}
										>
											<span className="coach-neighbor-bar">
												{nextStatusStep.barLabel}
											</span>
											<span>
												{nextStatusStep.chordSymbol} ({nextStatusStep.roman})
											</span>
										</button>
									) : (
										<span className="coach-context-edge">End</span>
									)}
								</div>

								{statusStep.theory.devices.length > 0 && (
									<div className="song-coach-tags">
										{statusStep.theory.devices.map((tag) => (
											<span key={tag} className="coach-device-tag">
												{tag}
											</span>
										))}
									</div>
								)}
							</div>

							{statusStep.subBarChords &&
								statusStep.subBarChords.length > 1 && (
									<div className="song-coach-subbar-strip">
										<span className="coach-subbar-label">Inside this bar:</span>
										<div className="coach-subbar-chips">
											{statusStep.subBarChords.map((sub, subIdx) => (
												<span
													key={`${sub.chordSymbol}-${sub.offsetMs}-${subIdx}`}
													className={`coach-subbar-chip${
														isCuedThis && subIdx === activeSubChordIdx
															? " is-current-sub"
															: ""
													}`}
												>
													{sub.chordSymbol} ({sub.roman})
												</span>
											))}
										</div>
									</div>
								)}

							<div className="song-coach-lenses">
								<div className="coach-lens-card">
									<span className="coach-lens-label">What it&apos;s doing</span>
									<p className="coach-lens-text">
										{statusStep.theory.whatItDoes}
									</p>
								</div>
								<div className="coach-lens-card">
									<span className="coach-lens-label">Bigger picture</span>
									<p className="coach-lens-text">
										{statusStep.theory.biggerPicture}
									</p>
								</div>
								<div className="coach-lens-card">
									<span className="coach-lens-label">Why it works</span>
									<p className="coach-lens-text">
										{statusStep.theory.whyItWorks}
									</p>
								</div>
							</div>
						</div>
					)}
				</section>
			)}

			<div
				ref={timelineRef}
				className={`song-timeline${isLongTimeline ? " is-long" : ""}`}
				role="group"
				aria-label={`${song.title} chord progression bars`}
			>
				{song.steps.length === 0 ? (
					<span className="song-subtitle">
						{totalBars} bars · Loading performance bars…
					</span>
				) : (
					song.steps.map((step, idx) => {
						const isLiveActive = isCuedThis && activeBarIndex === idx;
						const isSelectedPreview =
							!isCuedThis && selectedPreviewStepId === step.id;
						const isHighlighted = isLiveActive || isSelectedPreview;
						const qualityClass = getQualityClass(step.quality);
						const subFlow =
							step.subBarChords && step.subBarChords.length > 1
								? step.subBarChords
										.slice(1)
										.map((sub) => sub.chordSymbol)
										.join(" → ")
								: null;

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
								<span className="song-step-chord-row">
									<span className="song-step-chord">{step.chordSymbol}</span>
									{subFlow && (
										<span className="song-step-subflow">→ {subFlow}</span>
									)}
								</span>
								<span className="song-step-notes">
									{step.chordNotes.join(" · ")}
								</span>
								{step.theory?.roleLabel && (
									<span className="song-step-role">
										{step.theory.roleLabel}
									</span>
								)}
								<span className="song-step-cue">{step.cue}</span>
							</button>
						);
					})
				)}
			</div>
		</article>
	);
}

export function SongExamplesPanel({
	songs,
	activeInstrumentLabel = "Instrument",
	otherInstrumentsWithSongs = [],
	selectedSongId = null,
	playingSongId,
	cuedSongId = null,
	songPositionMs = 0,
	playbackSpeed = 1,
	activeChordStepIndex,
	activeNoteLabel,
	selectedPreviewStepId,
	onSelectSong,
	onSelectInstrument,
	onRemoveLocalPreview,
	onChangePlaybackSpeed,
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

	if (songs.length === 0) {
		return (
			<div className="songs-empty-state" aria-label="No MusicXML songs loaded">
				<p className="songs-empty-title">
					No {activeInstrumentLabel} scores yet
				</p>
				<p className="songs-empty-desc">
					Drop a .musicxml, .xml, or .mxl file here, or use Import MusicXML
					above.
				</p>
				{otherInstrumentsWithSongs.length > 0 && onSelectInstrument && (
					<div className="songs-empty-switch">
						<span className="songs-empty-switch-label">Loaded in:</span>
						{otherInstrumentsWithSongs.map((item) => (
							<button
								key={item.instrument}
								type="button"
								className="chip-btn chip-btn-compact"
								onClick={(e) =>
									onSelectInstrument(item.instrument, e.currentTarget)
								}
							>
								{item.label} ({item.count})
							</button>
						))}
					</div>
				)}
			</div>
		);
	}

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
								{song.timeSignature} · {song.steps.length || song.barCount || 0}{" "}
								bars){song.isLocalPreview ? " [Preview]" : ""}
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
				playbackSpeed={playbackSpeed}
				activeChordStepIndex={activeChordStepIndex}
				activeNoteLabel={activeNoteLabel}
				selectedPreviewStepId={selectedPreviewStepId}
				onRemoveLocalPreview={onRemoveLocalPreview}
				onChangePlaybackSpeed={onChangePlaybackSpeed}
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
