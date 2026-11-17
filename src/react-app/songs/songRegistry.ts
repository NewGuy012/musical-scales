import { type InstrumentTab, slugifyId } from "./songRuntime";

export type SongRegistryStatus = "PENDING" | "INGESTED";

export interface SongRegistryEntry {
	status: SongRegistryStatus;
	instrument: InstrumentTab;
	title: string;
	composerOrSource: string;
	keyLabel: string;
	timeSignature: string;
	id: string;
	source: string;
}

export interface IngestedSongSummary {
	id: string;
	instrument: InstrumentTab;
	title: string;
	composerOrSource: string;
	keyLabel: string;
	timeSignature: string;
	source: string;
}

const REGISTRY_HEADER = [
	"# Musical Scales — Real Songs Registry",
	"# Standard format: MusicXML (.musicxml, .xml, .mxl) in songs/musicxml/",
	"# Run `bun run ingest-songs` to compile MusicXML scores and sync this file.",
	"#",
];

function isValidInstrument(raw: string): raw is InstrumentTab {
	return (
		raw === "piano" || raw === "guitar" || raw === "violin" || raw === "cello"
	);
}

function sanitizeCell(value: string): string {
	return value.replace(/\|/g, "/").replace(/\s+/g, " ").trim() || "-";
}

function normalizeTitleKey(instrument: InstrumentTab, title: string): string {
	return `${instrument}:${slugifyId(title, "").replace(/-/g, "")}`;
}

export function parseSongRegistryText(text: string): SongRegistryEntry[] {
	const entries: SongRegistryEntry[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const cells = line.split("|").map((c) => c.trim());
		if (cells.length < 7) continue;

		const statusMatch = /^\[(PENDING|INGESTED)\]$/i.exec(cells[0]);
		if (!statusMatch) continue;
		const instrument = cells[1].toLowerCase();
		if (!isValidInstrument(instrument)) continue;

		entries.push({
			status: statusMatch[1].toUpperCase() as SongRegistryStatus,
			instrument,
			title: cells[2],
			composerOrSource: cells[3],
			keyLabel: cells[4],
			timeSignature: cells[5],
			id: cells[6],
			source: cells[7] || "-",
		});
	}
	return entries;
}

export function formatSongRegistryText(
	entries: readonly SongRegistryEntry[],
): string {
	const columns = [
		"Status",
		"Instrument",
		"Title",
		"Composer / Source",
		"Key",
		"Meter",
		"ID",
		"Source",
	] as const;

	const rows = entries.map((e) => [
		`[${e.status}]`,
		e.instrument,
		sanitizeCell(e.title),
		sanitizeCell(e.composerOrSource),
		sanitizeCell(e.keyLabel),
		sanitizeCell(e.timeSignature),
		sanitizeCell(e.id),
		sanitizeCell(e.source),
	]);

	const widths = columns.map((col, idx) =>
		Math.max(col.length, ...rows.map((r) => r[idx].length)),
	);

	const formatRow = (cells: readonly string[], prefix = "") => {
		const padded = cells.map((cell, idx) =>
			idx === cells.length - 1 ? cell : cell.padEnd(widths[idx]),
		);
		return `${prefix}${padded.join(" | ")}`;
	};

	const headerRow = formatRow(
		columns.map((c, idx) => (idx === 0 ? `# ${c}` : c)),
	);
	const bodyRows = rows.map((row) => formatRow(row));
	return [...REGISTRY_HEADER, headerRow, ...bodyRows, ""].join("\n");
}

/**
 * Merges newly compiled MusicXML songs into the existing plain-text registry:
 * matching `[PENDING]` entries promote to `[INGESTED]`, remaining `[PENDING]`
 * entries stay listed as a re-ingestion backlog, and previously ingested rows
 * whose source MusicXML files were removed are pruned.
 */
export function syncSongRegistryEntries(
	existingEntries: readonly SongRegistryEntry[],
	ingestedSongs: readonly IngestedSongSummary[],
): SongRegistryEntry[] {
	const matchedIngestedIds = new Set<string>();
	const byId = new Map<string, IngestedSongSummary>();
	const byTitleKey = new Map<string, IngestedSongSummary>();

	for (const song of ingestedSongs) {
		byId.set(song.id, song);
		byTitleKey.set(normalizeTitleKey(song.instrument, song.title), song);
	}

	const nextEntries: SongRegistryEntry[] = [];

	for (const entry of existingEntries) {
		const match =
			byId.get(entry.id) ??
			byTitleKey.get(normalizeTitleKey(entry.instrument, entry.title));
		if (match) {
			if (!matchedIngestedIds.has(match.id)) {
				matchedIngestedIds.add(match.id);
				nextEntries.push({
					status: "INGESTED",
					instrument: match.instrument,
					title: match.title,
					composerOrSource: match.composerOrSource,
					keyLabel: match.keyLabel,
					timeSignature: match.timeSignature,
					id: match.id,
					source: match.source,
				});
			}
		} else if (entry.status === "PENDING") {
			nextEntries.push(entry);
		}
	}

	for (const song of ingestedSongs) {
		if (matchedIngestedIds.has(song.id)) continue;
		matchedIngestedIds.add(song.id);
		nextEntries.push({
			status: "INGESTED",
			instrument: song.instrument,
			title: song.title,
			composerOrSource: song.composerOrSource,
			keyLabel: song.keyLabel,
			timeSignature: song.timeSignature,
			id: song.id,
			source: song.source,
		});
	}

	return nextEntries;
}

export function syncSongRegistryText(
	existingText: string,
	ingestedSongs: readonly IngestedSongSummary[],
): string {
	const existingEntries = parseSongRegistryText(existingText);
	const merged = syncSongRegistryEntries(existingEntries, ingestedSongs);
	return formatSongRegistryText(merged);
}
