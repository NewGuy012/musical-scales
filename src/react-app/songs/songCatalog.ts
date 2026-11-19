import type { KeyMode } from "../theory/circleOfFifths";
import {
	GENERATED_SONG_CATALOG,
	loadGeneratedSongById,
} from "./songCatalog.generated";
import type { InstrumentTab, SongExample } from "./songRuntime";

export interface SongCatalogEntry {
	id: string;
	title: string;
	composerOrSource: string;
	subtitle: string;
	instruments: InstrumentTab[];
	keySlot: number;
	keyMode: KeyMode;
	keyLabel: string;
	timeSignature: string;
	bpm: number;
	barCount: number;
	tuning?: number[];
	capo?: number;
	theorySummary: string;
}

export const SONG_CATALOG: SongCatalogEntry[] = GENERATED_SONG_CATALOG;

export function getCatalogEntriesForInstrument(
	instrument: InstrumentTab,
): SongCatalogEntry[] {
	return SONG_CATALOG.filter((entry) => entry.instruments.includes(instrument));
}

export function createCatalogStubSong(entry: SongCatalogEntry): SongExample {
	return {
		id: entry.id,
		title: entry.title,
		composerOrSource: entry.composerOrSource,
		subtitle: entry.subtitle,
		instruments: entry.instruments,
		keySlot: entry.keySlot,
		keyMode: entry.keyMode,
		keyLabel: entry.keyLabel,
		timeSignature: entry.timeSignature,
		bpm: entry.bpm,
		...(entry.tuning ? { tuning: entry.tuning } : {}),
		...(entry.capo ? { capo: entry.capo } : {}),
		theorySummary: entry.theorySummary,
		barCount: entry.barCount,
		steps: [],
	};
}

export function getCatalogStubSongsForInstrument(
	instrument: InstrumentTab,
): SongExample[] {
	return getCatalogEntriesForInstrument(instrument).map(createCatalogStubSong);
}

const songCache = new Map<string, Promise<SongExample>>();
const catalogInvalidationListeners = new Set<() => void>();

export function clearSongCache(): void {
	songCache.clear();
	for (const listener of catalogInvalidationListeners) {
		listener();
	}
}

export function subscribeSongCatalogUpdates(listener: () => void): () => void {
	catalogInvalidationListeners.add(listener);
	return () => {
		catalogInvalidationListeners.delete(listener);
	};
}

interface BunHotModule {
	dispose?(cb: () => void): void;
	on?(event: string, cb: () => void): void;
}

const hot = (import.meta as ImportMeta & { hot?: BunHotModule }).hot;
if (hot) {
	hot.dispose?.(() => {
		songCache.clear();
	});
	hot.on?.("bun:beforeUpdate", () => {
		songCache.clear();
	});
	hot.on?.("bun:afterUpdate", () => {
		clearSongCache();
	});
}

/**
 * Dynamically imports and hydrates a single ingested song on demand so Bun
 * code-splits each MusicXML-derived score out of the main application bundle.
 */
export function loadSongById(id: string): Promise<SongExample> {
	const cached = songCache.get(id);
	if (cached) return cached;

	const pending = loadGeneratedSongById(id).catch((err) => {
		songCache.delete(id);
		throw err;
	});
	songCache.set(id, pending);
	return pending;
}
