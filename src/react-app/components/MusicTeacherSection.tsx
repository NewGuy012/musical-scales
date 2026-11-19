import { type DragEvent, type ReactNode, useId, useRef, useState } from "react";
import type { MusicXmlPartSummary } from "../musicxml";
import { INSTRUMENT_TABS, type InstrumentTab } from "../songs/songRuntime";
import { IconMusic, IconUpload, IconX } from "./Icons";
import { SectionHeader } from "./SectionHeader";
import {
	SongExamplesPanel,
	type SongExamplesPanelProps,
} from "./SongExamplesPanel";

export interface PendingMusicXmlPartChoice {
	fileName: string;
	title: string;
	parts: MusicXmlPartSummary[];
	selectedPartId: string;
	instrument: InstrumentTab;
}

interface MusicTeacherSectionProps extends Omit<
	SongExamplesPanelProps,
	"activeInstrumentLabel"
> {
	instrumentView: InstrumentTab;
	instrumentLabel: string;
	instrumentTabList: ReactNode;
	isCollapsed: boolean;
	isImporting: boolean;
	importError: string | null;
	pendingPartChoice: PendingMusicXmlPartChoice | null;
	onToggleCollapse: () => void;
	onImportMusicXmlFile: (file: File) => void;
	onConfirmPartChoice: (partId: string, instrument: InstrumentTab) => void;
	onCancelPartChoice: () => void;
	onDismissImportError: () => void;
}

/** Collapsible Music Teacher card housing Learn with Real Songs & MusicXML import. */
export function MusicTeacherSection({
	instrumentView,
	instrumentLabel,
	instrumentTabList,
	isCollapsed,
	isImporting,
	importError,
	pendingPartChoice,
	onToggleCollapse,
	onImportMusicXmlFile,
	onConfirmPartChoice,
	onCancelPartChoice,
	onDismissImportError,
	...songPanelProps
}: MusicTeacherSectionProps) {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const partSelectId = useId();
	const instSelectId = useId();
	const [isDragOver, setIsDragOver] = useState(false);

	const {
		songs,
		otherInstrumentsWithSongs = [],
		playingSongId,
		cuedSongId = null,
	} = songPanelProps;
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
									{INSTRUMENT_TABS.map((id) => (
										<option key={id} value={id}>
											{id[0].toUpperCase() + id.slice(1)}
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
							{...songPanelProps}
							activeInstrumentLabel={instrumentLabel}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
