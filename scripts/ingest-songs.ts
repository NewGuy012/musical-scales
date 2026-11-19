import { createHash } from "node:crypto";
import { type FSWatcher, watch } from "node:fs";
import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
	encodeWavPcm16,
	renderTimedSequenceOfflineSamples,
} from "../src/react-app/audio/synth";
import {
	type MusicXmlImportOptions,
	compileMusicXml,
	formatSongDocumentModule,
	inspectMusicXml,
} from "../src/react-app/musicxml";
import type { SongCatalogEntry } from "../src/react-app/songs/songCatalog";
import {
	type InstrumentTab,
	type SongCategory,
	type SongDocument,
	compareSongCatalogOrder,
	flattenSongPlaybackSteps,
	hydrateSong,
	isInstrumentTab,
	isSongCategory,
	slugifyId,
} from "../src/react-app/songs/songRuntime";

const MUSICXML_EXTENSIONS = new Set([".musicxml", ".xml", ".mxl"]);
const COMPILER_FORMAT_VERSION = "ingest-v3";
const WATCH_DEBOUNCE_MS = 250;

const REPO_ROOT = resolve(import.meta.dir, "..");
const SONGS_DIR = join(REPO_ROOT, "songs");
const OVERRIDES_PATH = join(SONGS_DIR, "overrides.json");
const MUSICXML_DIR = join(SONGS_DIR, "musicxml");
const MIRROR_MANIFEST_FILENAME = ".mirror-manifest.json";
const INGEST_CACHE_FILENAME = ".ingest-cache.json";
const GENERATED_SONGS_DIR = join(
	REPO_ROOT,
	"src",
	"react-app",
	"songs",
	"generated",
);
const GENERATED_CATALOG_PATH = join(
	REPO_ROOT,
	"src",
	"react-app",
	"songs",
	"songCatalog.generated.ts",
);
const COMPILER_SOURCE_DIR = join(REPO_ROOT, "src", "react-app", "musicxml");
const SONG_RUNTIME_PATH = join(
	REPO_ROOT,
	"src",
	"react-app",
	"songs",
	"songRuntime.ts",
);

interface SidecarMeta extends MusicXmlImportOptions {}

export type CuratedOverridesMap = Record<string, MusicXmlImportOptions>;

interface MirrorManifest {
	mirroredFiles: string[];
}

interface CachedSongEntry {
	cacheKey: string;
	baseId: string;
	entry: SongCatalogEntry;
	moduleFile: string;
	exportName: string;
}

interface IngestCacheFile {
	version: 1;
	compilerFingerprint: string;
	entries: Record<string, CachedSongEntry>;
}

export interface MirrorSummary {
	skipped: boolean;
	copied: number;
	unchanged: number;
	pruned: number;
}

export interface SyncSummary {
	mirror: MirrorSummary;
	ingestedCount: number;
	compiledCount: number;
	cachedCount: number;
	removedCount: number;
	catalogUpdated: boolean;
}

function printUsage(): void {
	console.log(`Usage: bun run ingest-songs [options]

Without --input, optionally mirrors *.musicxml from --source / SONGS_SOURCE_DIR
into songs/musicxml/, applies songs/overrides.json + *.meta.json overrides, and
incrementally compiles lazy-loaded SongDocument chunks & songCatalog.generated.ts.

Options:
  -i, --input <path>        Single MusicXML file (.musicxml, .xml, .mxl)
  -l, --list-parts          List parts inside --input and exit
      --copy                Copy --input into songs/musicxml/ and sync catalog
      --source <dir>        External directory of *.musicxml scores to mirror (or SONGS_SOURCE_DIR)
      --watch               Watch source dir, songs/musicxml/, and songs/overrides.json for live sync
      --instrument <type>   piano | guitar | cello | violin (auto-detected if omitted)
      --category <type>     classical | modern (for catalog ordering)
      --part <idx-or-id>    Zero-based part index or MusicXML part id (e.g. P1)
      --id <slug>           Override generated song ID
      --title <text>        Override song title
      --composer <text>     Override composer/source credit
      --subtitle <text>     Override subtitle
      --key <label>         Override key signature (e.g. "A Minor", "E Major")
      --quantize <n>        Snap note offsets to 4/n quarter-note grid (default: 0 = lossless)
      --split-chords        Infer half-bar sub-bar harmony splits
      --export <name>       TypeScript export identifier (when --out ends in .ts)
  -o, --out <path>          Write single SongDocument (.ts or .json)
      --json                Print compiled SongDocument JSON to stdout
      --wav <path>          Render offline 22.05 kHz WAV preview for listening verification
  -h, --help                Show this help
`);
}

function assertContainedPath(rootDir: string, candidatePath: string): string {
	const resolvedRoot = resolve(rootDir);
	const resolvedTarget = resolve(candidatePath);
	if (!resolvedTarget.startsWith(resolvedRoot + sep)) {
		throw new Error(
			`Refusing to write outside "${resolvedRoot}": "${resolvedTarget}".`,
		);
	}
	return resolvedTarget;
}

function sha256Hex(data: Uint8Array | string): string {
	return createHash("sha256").update(data).digest("hex");
}

async function fileExists(path: string): Promise<boolean> {
	try {
		const info = await stat(path);
		return info.isFile();
	} catch {
		return false;
	}
}

async function dirExists(path: string): Promise<boolean> {
	try {
		const info = await stat(path);
		return info.isDirectory();
	} catch {
		return false;
	}
}

function formatWithBunFmt(content: string, filepath: string): string {
	try {
		const res = Bun.spawnSync(
			[process.execPath, "fmt", "--stdin-filepath", filepath],
			{
				cwd: REPO_ROOT,
				stdin: new TextEncoder().encode(content),
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		if (res.exitCode === 0 && res.stdout.length > 0) {
			return new TextDecoder().decode(res.stdout);
		}
	} catch {
		// Fall back to unformatted content when bun fmt is unavailable
	}
	return content;
}

async function writeIfChanged(
	filePath: string,
	nextContent: string,
): Promise<boolean> {
	try {
		const existing = await readFile(filePath, "utf8");
		if (existing === nextContent) return false;
	} catch {
		// File does not exist yet
	}
	await writeFile(filePath, nextContent, "utf8");
	return true;
}

function toCamelCaseBase(slug: string): string {
	const parts = slug
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map((part, idx) =>
			idx === 0
				? part.toLowerCase()
				: part[0].toUpperCase() + part.slice(1).toLowerCase(),
		);
	const base = parts.join("") || "ingestedSong";
	return /^[0-9]/.test(base) ? `song${base}` : base;
}

function toExportIdentifier(slug: string): string {
	const upper = slug
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map((p) => p.toUpperCase())
		.join("_");
	const safe = /^[0-9]/.test(upper)
		? `SONG_${upper}`
		: upper || "INGESTED_SONG";
	return safe.endsWith("_SPEC") ? safe : `${safe}_SPEC`;
}

function assertMusicXmlExtension(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	if (!MUSICXML_EXTENSIONS.has(ext)) {
		throw new Error(
			`Unsupported file extension "${ext}". MusicXML ingestion supports: ${[...MUSICXML_EXTENSIONS].join(", ")}`,
		);
	}
	return ext;
}

function parseInstrumentFlag(
	raw: string | undefined,
): InstrumentTab | undefined {
	if (raw === undefined) return undefined;
	if (isInstrumentTab(raw)) return raw;
	throw new Error(
		`Invalid --instrument "${raw}". Expected piano, guitar, cello, or violin.`,
	);
}

function parseCategoryFlag(raw: string | undefined): SongCategory | undefined {
	if (raw === undefined) return undefined;
	if (isSongCategory(raw)) return raw;
	throw new Error(`Invalid --category "${raw}". Expected classical or modern.`);
}

function parsePartFlag(raw: string | undefined): {
	partIndex?: number;
	partId?: string;
} {
	if (raw === undefined) return {};
	if (/^\d+$/.test(raw.trim())) {
		return { partIndex: Number.parseInt(raw.trim(), 10) };
	}
	return { partId: raw.trim() };
}

function validateImportOptionsObject(
	raw: unknown,
	sourceLabel: string,
): MusicXmlImportOptions {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`Expected JSON object in "${sourceLabel}".`);
	}
	const meta = raw as Record<string, unknown>;
	if (meta.instrument !== undefined) {
		if (typeof meta.instrument !== "string") {
			throw new Error(`Invalid instrument in "${sourceLabel}".`);
		}
		parseInstrumentFlag(meta.instrument);
	}
	if (meta.preferredInstrument !== undefined) {
		if (typeof meta.preferredInstrument !== "string") {
			throw new Error(`Invalid preferredInstrument in "${sourceLabel}".`);
		}
		parseInstrumentFlag(meta.preferredInstrument);
	}
	if (meta.category !== undefined) {
		if (typeof meta.category !== "string") {
			throw new Error(`Invalid category in "${sourceLabel}".`);
		}
		parseCategoryFlag(meta.category);
	}
	for (const strKey of [
		"id",
		"title",
		"composerOrSource",
		"subtitle",
		"key",
		"partId",
	] as const) {
		if (meta[strKey] !== undefined && typeof meta[strKey] !== "string") {
			throw new Error(`Invalid ${strKey} in "${sourceLabel}".`);
		}
	}
	return meta as MusicXmlImportOptions;
}

export async function loadCuratedOverrides(
	overridesPath = OVERRIDES_PATH,
): Promise<CuratedOverridesMap> {
	let raw: string;
	try {
		raw = await readFile(overridesPath, "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return {};
		throw err;
	}
	const parsed: unknown = JSON.parse(raw);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(
			`Expected object map keyed by filename stem in "${overridesPath}".`,
		);
	}
	const result: CuratedOverridesMap = {};
	for (const [stem, entry] of Object.entries(
		parsed as Record<string, unknown>,
	)) {
		result[stem] = validateImportOptionsObject(
			entry,
			`${overridesPath}#${stem}`,
		);
	}
	return result;
}

async function collectMusicXmlFiles(dir: string): Promise<string[]> {
	if (!(await dirExists(dir))) return [];

	const entries = await readdir(dir, { withFileTypes: true });
	const out: string[] = [];
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await collectMusicXmlFiles(fullPath)));
		} else if (
			entry.isFile() &&
			MUSICXML_EXTENSIONS.has(extname(entry.name).toLowerCase())
		) {
			out.push(fullPath);
		}
	}
	return out.sort((a, b) => a.localeCompare(b));
}

async function readSidecarMeta(filePath: string): Promise<SidecarMeta> {
	const ext = extname(filePath);
	const candidates = [
		`${filePath.slice(0, filePath.length - ext.length)}.meta.json`,
		`${filePath}.meta.json`,
	];
	for (const candidate of candidates) {
		try {
			const raw = await readFile(candidate, "utf8");
			const parsed: unknown = JSON.parse(raw);
			return validateImportOptionsObject(parsed, candidate);
		} catch (err) {
			if ((err as NodeJS.ErrnoException)?.code === "ENOENT") continue;
			throw err;
		}
	}
	return {};
}

function stripUndefinedOptions(
	options: MusicXmlImportOptions,
): MusicXmlImportOptions {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(options)) {
		if (value !== undefined) out[key] = value;
	}
	return out as MusicXmlImportOptions;
}

/**
 * Resolves import options with precedence:
 * CLI flags > `<stem>.meta.json` > `songs/overrides.json` > MusicXML tags.
 */
export async function resolveImportOptions(
	filePath: string,
	overrides: CuratedOverridesMap,
	cliOverrides: MusicXmlImportOptions = {},
): Promise<MusicXmlImportOptions> {
	const stem = basename(filePath, extname(filePath));
	const curated = overrides[stem] ?? {};
	const sidecar = await readSidecarMeta(filePath);
	return {
		...stripUndefinedOptions(curated),
		...stripUndefinedOptions(sidecar),
		...stripUndefinedOptions(cliOverrides),
	};
}

function canonicalizeImportOptions(options: MusicXmlImportOptions): string {
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(options).sort()) {
		const val = (options as Record<string, unknown>)[key];
		if (val !== undefined) sorted[key] = val;
	}
	return JSON.stringify(sorted);
}

async function computeCompilerFingerprint(): Promise<string> {
	const hasher = createHash("sha256");
	hasher.update(COMPILER_FORMAT_VERSION);

	const compilerFiles = (await readdir(COMPILER_SOURCE_DIR))
		.filter((name) => name.endsWith(".ts"))
		.sort((a, b) => a.localeCompare(b));
	for (const file of compilerFiles) {
		hasher.update(file);
		hasher.update(await readFile(join(COMPILER_SOURCE_DIR, file)));
	}
	hasher.update("songRuntime.ts");
	hasher.update(await readFile(SONG_RUNTIME_PATH));
	return hasher.digest("hex");
}

function resolveSourceDir(explicitSource?: string): string | undefined {
	const raw = explicitSource ?? process.env.SONGS_SOURCE_DIR;
	const trimmed = raw?.trim();
	return trimmed ? resolve(trimmed) : undefined;
}

function stringArraysEqual(
	a: readonly string[],
	b: readonly string[],
): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

async function readMirrorManifest(manifestPath: string): Promise<string[]> {
	try {
		const raw = await readFile(manifestPath, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (
			parsed &&
			typeof parsed === "object" &&
			Array.isArray((parsed as MirrorManifest).mirroredFiles)
		) {
			return (parsed as MirrorManifest).mirroredFiles.filter(
				(name): name is string =>
					typeof name === "string" && !name.includes("/"),
			);
		}
	} catch {
		// Missing or unreadable manifest
	}
	return [];
}

/**
 * Mirrors converted `*.musicxml` files 1-to-1 from `sourceDir` into `musicXmlDir`.
 * Uses SHA-256 comparison to copy only changed files and tracks mirrored filenames
 * in `.mirror-manifest.json` so deleted source files are pruned cleanly without
 * touching manually added scores.
 */
export async function mirrorSourceMusicXml(
	sourceDirRaw?: string,
	musicXmlDir = MUSICXML_DIR,
): Promise<MirrorSummary> {
	const sourceDir = resolveSourceDir(sourceDirRaw);
	if (!sourceDir || !(await dirExists(sourceDir))) {
		return { skipped: true, copied: 0, unchanged: 0, pruned: 0 };
	}

	await mkdir(musicXmlDir, { recursive: true });
	const manifestPath = assertContainedPath(
		musicXmlDir,
		join(musicXmlDir, MIRROR_MANIFEST_FILENAME),
	);
	const prevMirrored = await readMirrorManifest(manifestPath);

	const entries = await readdir(sourceDir, { withFileTypes: true });
	const sourceFiles = entries
		.filter(
			(entry) =>
				entry.isFile() &&
				!entry.name.startsWith(".") &&
				extname(entry.name).toLowerCase() === ".musicxml",
		)
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));

	const currentSet = new Set(sourceFiles);
	let copied = 0;
	let unchanged = 0;
	let pruned = 0;

	for (const fileName of sourceFiles) {
		const srcPath = join(sourceDir, fileName);
		const destPath = assertContainedPath(
			musicXmlDir,
			join(musicXmlDir, fileName),
		);
		const srcBytes = new Uint8Array(await readFile(srcPath));
		const srcHash = sha256Hex(srcBytes);

		let matchesExisting = false;
		try {
			const destBytes = new Uint8Array(await readFile(destPath));
			matchesExisting = sha256Hex(destBytes) === srcHash;
		} catch {
			matchesExisting = false;
		}

		if (matchesExisting) {
			unchanged++;
		} else {
			await writeFile(destPath, srcBytes);
			copied++;
		}
	}

	for (const prevName of prevMirrored) {
		if (!currentSet.has(prevName)) {
			const stalePath = assertContainedPath(
				musicXmlDir,
				join(musicXmlDir, prevName),
			);
			try {
				await rm(stalePath, { force: true });
				pruned++;
			} catch {
				// Ignore already-deleted files
			}
		}
	}

	if (
		!stringArraysEqual(prevMirrored, sourceFiles) ||
		!(await fileExists(manifestPath))
	) {
		const manifestText = formatWithBunFmt(
			`${JSON.stringify({ mirroredFiles: sourceFiles }, null, "\t")}\n`,
			manifestPath,
		);
		await writeIfChanged(manifestPath, manifestText);
	}

	return { skipped: false, copied, unchanged, pruned };
}

function formatGeneratedCatalogModule(
	items: Array<{
		entry: SongCatalogEntry;
		moduleFile: string;
		exportName: string;
	}>,
): string {
	const catalogJson = JSON.stringify(
		items.map((i) => i.entry),
		null,
		"\t",
	);

	if (items.length === 0) {
		return `import type { SongCatalogEntry } from "./songCatalog";
import type { SongExample } from "./songRuntime";

// Auto-generated by \`bun run ingest-songs\` from \`songs/musicxml/\`.
export const GENERATED_SONG_CATALOG: SongCatalogEntry[] = [];

export async function loadGeneratedSongById(id: string): Promise<SongExample> {
	throw new Error(\`Unknown song catalog ID: "\${id}"\`);
}
`;
	}

	const switchCases = items
		.map(
			(item) => `\t\tcase ${JSON.stringify(item.entry.id)}: {
\t\t\tconst mod = await import("./generated/${item.moduleFile}");
\t\t\treturn hydrateSong(mod.${item.exportName});
\t\t}`,
		)
		.join("\n");

	return `import type { SongCatalogEntry } from "./songCatalog";
import { type SongExample, hydrateSong } from "./songRuntime";

// Auto-generated by \`bun run ingest-songs\` from \`songs/musicxml/\`.
export const GENERATED_SONG_CATALOG: SongCatalogEntry[] = ${catalogJson};

export async function loadGeneratedSongById(id: string): Promise<SongExample> {
\tswitch (id) {
${switchCases}
\t\tdefault:
\t\t\tthrow new Error(\`Unknown song catalog ID: "\${id}"\`);
\t}
}
`;
}

async function readIngestCache(
	cachePath: string,
	compilerFingerprint: string,
): Promise<Record<string, CachedSongEntry>> {
	try {
		const raw = await readFile(cachePath, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (
			parsed &&
			typeof parsed === "object" &&
			(parsed as IngestCacheFile).version === 1 &&
			(parsed as IngestCacheFile).compilerFingerprint === compilerFingerprint &&
			(parsed as IngestCacheFile).entries &&
			typeof (parsed as IngestCacheFile).entries === "object"
		) {
			return (parsed as IngestCacheFile).entries;
		}
	} catch {
		// Cache missing or invalid
	}
	return {};
}

export async function syncFromMusicXmlFolder(options?: {
	sourceDir?: string;
	musicXmlDir?: string;
	overridesPath?: string;
	generatedSongsDir?: string;
	generatedCatalogPath?: string;
}): Promise<SyncSummary> {
	const musicXmlDir = options?.musicXmlDir ?? MUSICXML_DIR;
	const overridesPath = options?.overridesPath ?? OVERRIDES_PATH;
	const generatedDir = options?.generatedSongsDir ?? GENERATED_SONGS_DIR;
	const catalogPath = options?.generatedCatalogPath ?? GENERATED_CATALOG_PATH;

	const mirror = await mirrorSourceMusicXml(options?.sourceDir, musicXmlDir);
	const overrides = await loadCuratedOverrides(overridesPath);
	const files = await collectMusicXmlFiles(musicXmlDir);
	await mkdir(generatedDir, { recursive: true });

	const compilerFingerprint = await computeCompilerFingerprint();
	const cachePath = join(generatedDir, INGEST_CACHE_FILENAME);
	const prevCache = await readIngestCache(cachePath, compilerFingerprint);
	const nextCache: Record<string, CachedSongEntry> = {};

	const existingGen = await readdir(generatedDir, { withFileTypes: true });
	const expectedFiles = new Set<string>();
	const usedIds = new Set<string>();

	const catalogItems: Array<{
		entry: SongCatalogEntry;
		moduleFile: string;
		exportName: string;
	}> = [];

	let compiledCount = 0;
	let cachedCount = 0;

	for (const filePath of files) {
		const relPath = relative(musicXmlDir, filePath).replace(/\\/g, "/");
		const bytes = new Uint8Array(await readFile(filePath));
		const meta = await resolveImportOptions(filePath, overrides);
		const fileBase = basename(filePath, extname(filePath));
		const cacheKey = sha256Hex(
			`${sha256Hex(bytes)}|${canonicalizeImportOptions(meta)}|${compilerFingerprint}`,
		);

		const cached = prevCache[relPath];
		const canReuseCached =
			cached !== undefined &&
			cached.cacheKey === cacheKey &&
			!usedIds.has(cached.entry.id) &&
			!usedIds.has(cached.baseId) &&
			(await fileExists(
				assertContainedPath(
					generatedDir,
					join(generatedDir, cached.moduleFile),
				),
			));

		if (canReuseCached) {
			usedIds.add(cached.entry.id);
			expectedFiles.add(cached.moduleFile);
			catalogItems.push({
				entry: cached.entry,
				moduleFile: basename(cached.moduleFile, ".ts"),
				exportName: cached.exportName,
			});
			nextCache[relPath] = cached;
			cachedCount++;
			continue;
		}

		const { songDoc } = await compileMusicXml(bytes, meta);

		let baseId = meta.id ? slugifyId(meta.id, "") : songDoc.id;
		if (!baseId || baseId === "imported-musicxml-piano") {
			baseId = slugifyId(`${fileBase}-${songDoc.instruments[0]}`, "");
		}
		if (!baseId) baseId = "ingested-song";

		let uniqueId = baseId;
		if (usedIds.has(uniqueId)) {
			let suffix = 2;
			while (usedIds.has(`${uniqueId}-${suffix}`)) suffix++;
			uniqueId = `${uniqueId}-${suffix}`;
		}
		usedIds.add(uniqueId);

		const finalDoc: SongDocument = { ...songDoc, id: uniqueId };
		const hydrated = hydrateSong(finalDoc);
		const moduleBase = toCamelCaseBase(uniqueId);
		const moduleFile = `${moduleBase}.ts`;
		const exportName = toExportIdentifier(uniqueId);
		expectedFiles.add(moduleFile);

		const modulePath = assertContainedPath(
			generatedDir,
			join(generatedDir, moduleFile),
		);
		const moduleContent = formatWithBunFmt(
			formatSongDocumentModule(finalDoc, exportName, "../songRuntime"),
			modulePath,
		);
		await writeIfChanged(modulePath, moduleContent);

		const catalogEntry: SongCatalogEntry = {
			id: finalDoc.id,
			title: finalDoc.title,
			composerOrSource: finalDoc.composerOrSource,
			subtitle: hydrated.subtitle,
			instruments: finalDoc.instruments,
			...(meta.category ? { category: meta.category } : {}),
			keySlot: finalDoc.keySlot,
			keyMode: finalDoc.keyMode,
			keyLabel: finalDoc.keyLabel,
			timeSignature: finalDoc.timeSignature,
			bpm: hydrated.bpm,
			barCount: hydrated.steps.length,
			...(finalDoc.tuning ? { tuning: finalDoc.tuning } : {}),
			...(finalDoc.capo ? { capo: finalDoc.capo } : {}),
			theorySummary: finalDoc.theorySummary,
		};

		catalogItems.push({
			entry: catalogEntry,
			moduleFile: moduleBase,
			exportName,
		});
		nextCache[relPath] = {
			cacheKey,
			baseId,
			entry: catalogEntry,
			moduleFile,
			exportName,
		};
		compiledCount++;
	}

	let removedCount = 0;
	for (const entry of existingGen) {
		if (
			entry.isFile() &&
			entry.name.endsWith(".ts") &&
			!expectedFiles.has(entry.name)
		) {
			await rm(join(generatedDir, entry.name));
			removedCount++;
		}
	}

	catalogItems.sort((a, b) => compareSongCatalogOrder(a.entry, b.entry));

	const catalogText = formatWithBunFmt(
		formatGeneratedCatalogModule(catalogItems),
		catalogPath,
	);
	const catalogUpdated = await writeIfChanged(catalogPath, catalogText);

	const nextCacheFile: IngestCacheFile = {
		version: 1,
		compilerFingerprint,
		entries: nextCache,
	};
	await writeIfChanged(
		cachePath,
		`${JSON.stringify(nextCacheFile, null, "\t")}\n`,
	);

	return {
		mirror,
		ingestedCount: catalogItems.length,
		compiledCount,
		cachedCount,
		removedCount,
		catalogUpdated,
	};
}

function formatSyncMessage(summary: SyncSummary): string {
	const mirrorParts: string[] = [];
	if (!summary.mirror.skipped) {
		if (summary.mirror.copied > 0) {
			mirrorParts.push(`${summary.mirror.copied} mirrored`);
		}
		if (summary.mirror.pruned > 0) {
			mirrorParts.push(`${summary.mirror.pruned} pruned`);
		}
	}
	const compileParts = [
		`${summary.compiledCount} compiled`,
		`${summary.cachedCount} cached`,
	];
	if (summary.removedCount > 0) {
		compileParts.push(`${summary.removedCount} removed`);
	}
	const prefix =
		mirrorParts.length > 0 ? `[mirror: ${mirrorParts.join(", ")}] ` : "";
	return `${prefix}Synced ${summary.ingestedCount} MusicXML song(s) (${compileParts.join(", ")}) -> songCatalog.generated.ts`;
}

async function runWatchMode(
	sourceDirArg?: string,
	skipInitialSync = false,
): Promise<void> {
	const sourceDir = resolveSourceDir(sourceDirArg);
	await mkdir(MUSICXML_DIR, { recursive: true });
	await mkdir(SONGS_DIR, { recursive: true });

	if (!skipInitialSync) {
		const initial = await syncFromMusicXmlFolder({ sourceDir });
		console.error(formatSyncMessage(initial));
	}

	const watchers: FSWatcher[] = [];
	let timer: ReturnType<typeof setTimeout> | null = null;
	let running = false;
	let pending = false;

	const runCycle = async () => {
		if (running) {
			pending = true;
			return;
		}
		running = true;
		try {
			do {
				pending = false;
				const summary = await syncFromMusicXmlFolder({ sourceDir });
				if (
					summary.mirror.copied > 0 ||
					summary.mirror.pruned > 0 ||
					summary.compiledCount > 0 ||
					summary.removedCount > 0 ||
					summary.catalogUpdated
				) {
					console.error(formatSyncMessage(summary));
				}
			} while (pending);
		} catch (err) {
			console.error(
				`[ingest-songs watch] Sync failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			running = false;
		}
	};

	const scheduleSync = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			void runCycle();
		}, WATCH_DEBOUNCE_MS);
	};

	if (sourceDir && (await dirExists(sourceDir))) {
		watchers.push(
			watch(sourceDir, (_event, filename) => {
				if (
					!filename ||
					(!filename.startsWith(".") &&
						extname(filename).toLowerCase() === ".musicxml")
				) {
					scheduleSync();
				}
			}),
		);
	}

	watchers.push(
		watch(MUSICXML_DIR, { recursive: true }, (_event, filename) => {
			if (!filename) {
				scheduleSync();
				return;
			}
			const name = basename(filename);
			if (name.startsWith(".") || name === MIRROR_MANIFEST_FILENAME) return;
			const ext = extname(name).toLowerCase();
			if (MUSICXML_EXTENSIONS.has(ext) || name.endsWith(".meta.json")) {
				scheduleSync();
			}
		}),
	);

	watchers.push(
		watch(SONGS_DIR, (_event, filename) => {
			if (!filename || filename === "overrides.json") {
				scheduleSync();
			}
		}),
	);

	const watchedLabel = [
		sourceDir && (await dirExists(sourceDir)) ? sourceDir : null,
		relative(REPO_ROOT, MUSICXML_DIR),
		relative(REPO_ROOT, OVERRIDES_PATH),
	]
		.filter(Boolean)
		.join(", ");
	console.error(`[ingest-songs] Watching ${watchedLabel}`);

	await new Promise<void>((resolvePromise) => {
		const cleanup = () => {
			if (timer) clearTimeout(timer);
			for (const watcher of watchers) {
				watcher.close();
			}
			resolvePromise();
		};
		process.once("SIGINT", cleanup);
		process.once("SIGTERM", cleanup);
	});
}

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		allowPositionals: true,
		options: {
			input: { type: "string", short: "i" },
			"list-parts": { type: "boolean", short: "l" },
			copy: { type: "boolean" },
			source: { type: "string" },
			watch: { type: "boolean" },
			"skip-initial": { type: "boolean" },
			instrument: { type: "string" },
			category: { type: "string" },
			part: { type: "string" },
			id: { type: "string" },
			title: { type: "string" },
			composer: { type: "string" },
			subtitle: { type: "string" },
			key: { type: "string" },
			quantize: { type: "string" },
			"split-chords": { type: "boolean" },
			export: { type: "string" },
			out: { type: "string", short: "o" },
			json: { type: "boolean" },
			wav: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});

	if (values.help) {
		printUsage();
		return;
	}

	const inputPath = values.input ?? positionals[0];
	if (!inputPath) {
		if (values.watch) {
			await runWatchMode(values.source, Boolean(values["skip-initial"]));
			return;
		}
		const summary = await syncFromMusicXmlFolder({ sourceDir: values.source });
		console.error(formatSyncMessage(summary));
		return;
	}

	const ext = assertMusicXmlExtension(inputPath);
	const bytes = new Uint8Array(await readFile(inputPath));

	if (values["list-parts"]) {
		const info = await inspectMusicXml(bytes);
		console.log(`File: ${inputPath}`);
		console.log(`Title: ${info.title} | Tempo: ${info.tempo} BPM`);
		for (const part of info.parts) {
			const tag = part.isPercussion
				? "percussion"
				: (part.suggestedInstrument ?? "unknown");
			const stringInfo = part.isStringed
				? `${part.stringCount}-str TAB`
				: `${part.staffCount}-staff notation`;
			console.log(
				`  [${part.index}] id="${part.partId}" "${part.name}" | ${tag} | ${stringInfo} | gm=${part.midiProgram} | notes=${part.noteCount}`,
			);
		}
		return;
	}

	const instrument = parseInstrumentFlag(values.instrument);
	const category = parseCategoryFlag(values.category);
	const { partIndex, partId } = parsePartFlag(values.part);
	const quantizeSubdivision =
		values.quantize !== undefined
			? Number.parseInt(values.quantize, 10)
			: undefined;
	if (quantizeSubdivision !== undefined && Number.isNaN(quantizeSubdivision)) {
		throw new Error(`Invalid --quantize value "${values.quantize}".`);
	}

	const cliOptions: MusicXmlImportOptions = {
		partIndex,
		partId,
		instrument,
		category,
		id: values.id,
		title: values.title,
		composerOrSource: values.composer,
		subtitle: values.subtitle,
		key: values.key,
		quantizeSubdivision,
		splitHalfBarHarmony: values["split-chords"] ? true : undefined,
	};
	const overrides = await loadCuratedOverrides();
	const importOptions = await resolveImportOptions(
		inputPath,
		overrides,
		cliOptions,
	);

	const { songDoc, selectedPart } = await compileMusicXml(bytes, importOptions);
	const song = hydrateSong(songDoc);
	const flat = flattenSongPlaybackSteps(song);
	const primaryInstrument = song.instruments[0] ?? "piano";

	if (values.copy) {
		const destDir = assertContainedPath(
			MUSICXML_DIR,
			join(MUSICXML_DIR, primaryInstrument),
		);
		await mkdir(destDir, { recursive: true });
		const safeId = slugifyId(songDoc.id, "ingested-song");
		const destPath = assertContainedPath(
			destDir,
			join(destDir, `${safeId}${ext}`),
		);
		await copyFile(inputPath, destPath);
		const hasOverrides =
			values.id ||
			values.title ||
			values.composer ||
			values.subtitle ||
			values.key ||
			values.instrument ||
			values.category ||
			values.part ||
			values.quantize ||
			values["split-chords"];
		if (hasOverrides) {
			const metaPath = assertContainedPath(
				destDir,
				join(destDir, `${safeId}.meta.json`),
			);
			await writeFile(
				metaPath,
				formatWithBunFmt(
					`${JSON.stringify({ ...cliOptions, id: safeId }, null, "\t")}\n`,
					metaPath,
				),
				"utf8",
			);
		}
		const syncRes = await syncFromMusicXmlFolder({ sourceDir: values.source });
		console.error(
			`Copied ${inputPath} -> ${relative(REPO_ROOT, destPath)} and synced ${syncRes.ingestedCount} song(s).`,
		);
	}

	if (values.out) {
		const outExt = extname(values.out).toLowerCase();
		const content =
			outExt === ".ts"
				? formatSongDocumentModule(
						songDoc,
						values.export || toExportIdentifier(songDoc.id),
						"../songRuntime",
					)
				: `${JSON.stringify(songDoc, null, "\t")}\n`;
		await writeFile(values.out, content, "utf8");
		console.error(`Wrote ${values.out}`);
	}

	if (values.wav) {
		const sampleRate = 22050;
		const samples = renderTimedSequenceOfflineSamples(flat.events, {
			preset: primaryInstrument,
			sampleRate,
			totalDurationMs: flat.totalDurationMs,
		});
		const wavBytes = encodeWavPcm16(samples, sampleRate);
		await writeFile(values.wav, wavBytes);
		console.error(
			`Rendered ${values.wav} (${(flat.totalDurationMs / 1000).toFixed(2)}s @ ${sampleRate} Hz)`,
		);
	}

	if (values.json) {
		console.log(JSON.stringify(songDoc, null, "\t"));
		return;
	}

	console.error(
		`Ingested "${song.title}" (${primaryInstrument}) from part [${selectedPart.index}] "${selectedPart.name}"`,
	);
	console.error(
		`  Key: ${song.keyLabel} | Tempo: ~${song.bpm} BPM | Bars: ${song.steps.length} | Steps: ${flat.events.length} | Duration: ${(flat.totalDurationMs / 1000).toFixed(2)}s`,
	);
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : String(err));
		process.exitCode = 1;
	});
}
