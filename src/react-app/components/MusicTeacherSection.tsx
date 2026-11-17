import { type DragEvent, type ReactNode, useId, useRef, useState } from "react";
import type { MusicXmlPartSummary } from "../musicxml";
import type { InstrumentTab, SongExample } from "../songs/songRuntime";
import { IconMusic, IconUpload, IconX } from "./Icons";
import { SectionHeader } from "./SectionHeader";
import {
	type OtherInstrumentSongCount,
	SongExamplesPanel,
} from "./SongExamplesPanel";

export interface PendingMusicXmlPartChoice {
	fileName: string;
	title: string;
	parts: MusicXmlPartSummary[];
	selectedPartId: string;
	instrument: InstrumentTab;
}

export interface MusicTeacherSectionProps {
	instrumentView: InstrumentTab;
	instrumentLabel: string;
	instrumentTabList: ReactNode;
	songs: SongExample[];
	otherInstrumentsWithSongs: OtherInstrumentSongCount[];
	selectedSongId: string | null;
	playingSongId: string | null;
	cuedSongId: string | null;
	songPositionMs: number;
	playbackSpeed: number;
	activeChordStepIndex: number | null;
	activeNoteLabel: string | null;
	selectedPreviewStepId: string | null;
	isCollapsed: boolean;
	isImporting: boolean;
	importError: string | null;
	pendingPartChoice: PendingMusicXmlPartChoice | null;
	onToggleCollapse: () => void;
	onSelectInstrument: (
		instrument: InstrumentTab,
		anchorEl?: HTMLElement | null,
	) => void;
	onSelectSong: (songId: string) => void;
	onImportMusicXmlFile: (file: File) => void;
	onConfirmPartChoice: (partId: string, instrument: InstrumentTab) => void;
	onCancelPartChoice: () => void;
	onDismissImportError: () => void;
	onRemoveLocalPreview: (songId: string) => void;
	onChangePlaybackSpeed: (speed: number) => void;
	onTogglePlaySong: (song: SongExample) => void;
	onStopSong: () => void;
	onSeekSong: (
		song: SongExample,
		timeMs: number,
		resumePlayback?: boolean,
	) => void;
	onBeginScrubSong: (song: SongExample) => void;
	onSkipSongBar: (song: SongExample, deltaBars: number) => void;
	onPlayFromSongBar: (song: SongExample, stepIndex: number) => void;
	onSelectSongChordStep: (song: SongExample, stepIndex: number) => void;
}

const INSTRUMENT_OPTIONS: ReadonlyArray<{ id: InstrumentTab; label: string }> =
	[
		{ id: "piano", label: "Piano" },
		{ id: "guitar", label: "Guitar" },
		{ id: "violin", label: "Violin" },
		{ id: "cello", label: "Cello" },
	];

/**
 * Collapsible Music Teacher section below the Chords section,
 * housing the "Learn with Real Songs" subsection and MusicXML file ingestion preview.
 */
export function MusicTeacherSection({
	instrumentView,
	instrumentLabel,
	instrumentTabList,
	songs,
	otherInstrumentsWithSongs,
	selectedSongId,
	playingSongId,
	cuedSongId,
	songPositionMs,
	playbackSpeed,
	activeChordStepIndex,
	activeNoteLabel,
	selectedPreviewStepId,
	isCollapsed,
	isImporting,
	importError,
	pendingPartChoice,
	onToggleCollapse,
	onSelectInstrument,
	onSelectSong,
	onImportMusicXmlFile,
	onConfirmPartChoice,
	onCancelPartChoice,
	onDismissImportError,
	onRemoveLocalPreview,
	onChangePlaybackSpeed,
	onTogglePlaySong,
	onStopSong,
	onSeekSong,
	onBeginScrubSong,
	onSkipSongBar,
	onPlayFromSongBar,
	onSelectSongChordStep,
}: MusicTeacherSectionProps) {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const partSelectId = useId();
	const instSelectId = useId();
	const [isDragOver, setIsDragOver] = useState(false);

	const isSongActive = playingSongId !== null || cuedSongId !== null;
	const totalVisibleSongs =
		songs.length +
		otherInstrumentsWithSongs.reduce((sum, item) => sum + item.count, 0);

	const openFilePicker = () => {
		fileInputRef.current?.click();
	};

	const handleDragOver = (e: DragEvent<HTMLElement>) => {
		if (!e.dataTransfer.types.includes("Files")) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "copy";
		if (!isDragOver) setIsDragOver(true);
	};

	const handleDragLeave = (e: DragEvent<HTMLElement>) => {
		if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
			setIsDragOver(false);
		}
	};

	const handleDrop = (e: DragEvent<HTMLElement>) => {
		e.preventDefault();
		setIsDragOver(false);
		const file = e.dataTransfer.files?.[0];
		if (file) {
			onImportMusicXmlFile(file);
		}
	};

	const selectedPartObj = pendingPartChoice?.parts.find(
		(p) => p.partId === pendingPartChoice.selectedPartId,
	);

	return (
		<section
			id="section-music-teacher"
			className={`panel-card music-teacher-card${isCollapsed ? " is-collapsed" : ""}${
				isDragOver ? " is-drag-over" : ""
			}`}
			aria-labelledby="section-music-teacher-heading"
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<SectionHeader
				headingId="section-music-teacher-heading"
				title="Music Teacher"
				description={`Learn with Real Songs · Synced with ${instrumentLabel} above`}
				bodyId="section-music-teacher-body"
				titlePrefix={<IconMusic size={14} />}
				titleBadge={
					<>
						<span
							className="tab-count-pill"
							title={`${songs.length} ${instrumentLabel} piece(s) loaded (${totalVisibleSongs} total)`}
						>
							{songs.length}
						</span>
						{isSongActive && (
							<span className="tab-live-dot" aria-hidden="true" />
						)}
					</>
				}
				isCollapsed={isCollapsed}
				onToggleCollapse={onToggleCollapse}
			/>

			<div
				id="section-music-teacher-body"
				className="section-body"
				hidden={isCollapsed}
			>
				<div className="teacher-subsection">
					<div className="instrument-tabs-bar songs-instrument-bar">
						{instrumentTabList}

						<div className="teacher-import-controls">
							<input
								ref={fileInputRef}
								type="file"
								accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
								className="sr-only-input"
								aria-label="Upload MusicXML file"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) {
										onImportMusicXmlFile(file);
									}
									e.target.value = "";
								}}
							/>
							<button
								type="button"
								className="pill-action-btn pill-action-sm"
								onClick={openFilePicker}
								disabled={isImporting}
								title="Import a .musicxml, .xml, or .mxl score for instant browser preview"
							>
								<IconUpload size={12} />
								<span>{isImporting ? "Importing…" : "Import MusicXML"}</span>
							</button>
						</div>
					</div>

					{importError && (
						<div className="teacher-alert" role="alert">
							<span>{importError}</span>
							<button
								type="button"
								className="chip-btn chip-btn-compact"
								onClick={onDismissImportError}
								aria-label="Dismiss MusicXML import error"
							>
								<IconX size={11} />
							</button>
						</div>
					)}

					{pendingPartChoice && (
						<div
							className="teacher-part-picker"
							role="region"
							aria-label="Choose MusicXML part to preview"
						>
							<div className="teacher-part-picker-head">
								<strong>{pendingPartChoice.title}</strong>
								<span className="song-subtitle">
									({pendingPartChoice.fileName}) · Multiple parts detected
								</span>
							</div>
							<div className="teacher-part-picker-controls">
								<label htmlFor={partSelectId} className="song-select-label">
									Part
								</label>
								<select
									id={partSelectId}
									className="song-select teacher-part-select"
									value={pendingPartChoice.selectedPartId}
									onChange={(e) => {
										const nextPartId = e.target.value;
										const found = pendingPartChoice.parts.find(
											(p) => p.partId === nextPartId,
										);
										const nextInst =
											found?.suggestedInstrument ??
											pendingPartChoice.instrument;
										onConfirmPartChoice(nextPartId, nextInst);
									}}
								>
									{pendingPartChoice.parts.map((part) => (
										<option key={part.partId} value={part.partId}>
											{part.name} ({part.suggestedInstrument ?? "unknown"} ·{" "}
											{part.noteCount} notes)
										</option>
									))}
								</select>

								<label htmlFor={instSelectId} className="song-select-label">
									Target
								</label>
								<select
									id={instSelectId}
									className="song-select teacher-inst-select"
									value={pendingPartChoice.instrument}
									onChange={(e) =>
										onConfirmPartChoice(
											pendingPartChoice.selectedPartId,
											e.target.value as InstrumentTab,
										)
									}
								>
									{INSTRUMENT_OPTIONS.map((opt) => (
										<option key={opt.id} value={opt.id}>
											{opt.label}
										</option>
									))}
								</select>

								<button
									type="button"
									className="chip-btn chip-btn-compact"
									onClick={onCancelPartChoice}
									title={
										selectedPartObj
											? `Close part switcher (${selectedPartObj.name})`
											: "Close part switcher"
									}
								>
									Done
								</button>
							</div>
						</div>
					)}

					<div
						id="panel-real-songs"
						role="tabpanel"
						aria-labelledby={`songs-tab-${instrumentView}`}
					>
						<SongExamplesPanel
							songs={songs}
							activeInstrumentLabel={instrumentLabel}
							otherInstrumentsWithSongs={otherInstrumentsWithSongs}
							selectedSongId={selectedSongId}
							playingSongId={playingSongId}
							cuedSongId={cuedSongId}
							songPositionMs={songPositionMs}
							playbackSpeed={playbackSpeed}
							activeChordStepIndex={activeChordStepIndex}
							activeNoteLabel={activeNoteLabel}
							selectedPreviewStepId={selectedPreviewStepId}
							onSelectSong={onSelectSong}
							onSelectInstrument={onSelectInstrument}
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
				</div>
			</div>
		</section>
	);
}
