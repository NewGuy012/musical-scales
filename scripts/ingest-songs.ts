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
	type IngestedSongSummary,
	syncSongRegistryText,
} from "../src/react-app/songs/songRegistry";
import {
	type InstrumentTab,
	type SongDocument,
	flattenSongPlaybackSteps,
	hydrateSong,
	isInstrumentTab,
	slugifyId,
} from "../src/react-app/songs/songRuntime";

const MUSICXML_EXTENSIONS = new Set([".musicxml", ".xml", ".mxl"]);

const REPO_ROOT = resolve(import.meta.dir, "..");
const MUSICXML_DIR = join(REPO_ROOT, "songs", "musicxml");
const REGISTRY_TXT_PATH = join(REPO_ROOT, "songs", "songs.txt");
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

interface SidecarMeta extends MusicXmlImportOptions {}

function printUsage(): void {
	console.log(`Usage: bun run ingest-songs [options]

Without --input, scans songs/musicxml/ for .musicxml/.xml/.mxl files, compiles
lazy-loaded SongDocument modules, regenerates songCatalog.generated.ts, and syncs
songs/songs.txt.

Options:
  -i, --input <path>        Single MusicXML file (.musicxml, .xml, .mxl)
  -l, --list-parts          List parts inside --input and exit
      --copy                Copy --input into songs/musicxml/ and sync catalog + songs/songs.txt
      --instrument <type>   piano | guitar | cello | violin (auto-detected if omitted)
      --part <idx-or-id>    Zero-based part index or MusicXML part id (e.g. P1)
      --id <slug>           Override generated song ID
      --title <text>        Override song title
      --composer <text>     Override composer/source credit
      --subtitle <text>     Override subtitle
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

async function collectMusicXmlFiles(dir: string): Promise<string[]> {
	try {
		const info = await stat(dir);
		if (!info.isDirectory()) return [];
	} catch {
		return [];
	}

	const entries = await readdir(dir, { withFileTypes: true });
	const out: string[] = [];
	for (const entry of entries) {
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
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				throw new Error(`Expected JSON object in sidecar "${candidate}".`);
			}
			const meta = parsed as Record<string, unknown>;
			if (meta.instrument !== undefined) {
				if (typeof meta.instrument !== "string") {
					throw new Error(`Invalid instrument in sidecar "${candidate}".`);
				}
				parseInstrumentFlag(meta.instrument);
			}
			return meta as SidecarMeta;
		} catch (err) {
			if ((err as NodeJS.ErrnoException)?.code === "ENOENT") continue;
			throw err;
		}
	}
	return {};
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

async function syncFromMusicXmlFolder(): Promise<{
	ingestedCount: number;
	registryCount: number;
}> {
	const files = await collectMusicXmlFiles(MUSICXML_DIR);
	await mkdir(GENERATED_SONGS_DIR, { recursive: true });

	const existingGen = await readdir(GENERATED_SONGS_DIR, {
		withFileTypes: true,
	});
	const expectedFiles = new Set<string>();
	const usedIds = new Set<string>();

	const catalogItems: Array<{
		entry: SongCatalogEntry;
		moduleFile: string;
		exportName: string;
	}> = [];
	const registrySummaries: IngestedSongSummary[] = [];

	for (const filePath of files) {
		const relSource = relative(MUSICXML_DIR, filePath).replace(/\\/g, "/");
		const bytes = new Uint8Array(await readFile(filePath));
		const meta = await readSidecarMeta(filePath);
		const fileBase = basename(filePath, extname(filePath));

		const { songDoc } = await compileMusicXml(bytes, meta);

		let uniqueId = meta.id ? slugifyId(meta.id, "") : songDoc.id;
		if (!uniqueId || uniqueId === "imported-musicxml-piano") {
			uniqueId = slugifyId(`${fileBase}-${songDoc.instruments[0]}`, "");
		}
		if (!uniqueId) uniqueId = "ingested-song";
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

		const moduleContent = formatSongDocumentModule(
			finalDoc,
			exportName,
			"../songRuntime",
		);
		await writeFile(
			assertContainedPath(
				GENERATED_SONGS_DIR,
				join(GENERATED_SONGS_DIR, moduleFile),
			),
			moduleContent,
			"utf8",
		);

		const catalogEntry: SongCatalogEntry = {
			id: finalDoc.id,
			title: finalDoc.title,
			composerOrSource: finalDoc.composerOrSource,
			subtitle: hydrated.subtitle,
			instruments: finalDoc.instruments,
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

		registrySummaries.push({
			id: finalDoc.id,
			instrument: finalDoc.instruments[0] ?? "piano",
			title: finalDoc.title,
			composerOrSource: finalDoc.composerOrSource,
			keyLabel: finalDoc.keyLabel,
			timeSignature: finalDoc.timeSignature,
			source: relSource,
		});
	}

	for (const entry of existingGen) {
		if (
			entry.isFile() &&
			entry.name.endsWith(".ts") &&
			!expectedFiles.has(entry.name)
		) {
			await rm(join(GENERATED_SONGS_DIR, entry.name));
		}
	}

	const catalogText = formatGeneratedCatalogModule(catalogItems);
	await writeFile(GENERATED_CATALOG_PATH, catalogText, "utf8");

	let existingRegistry = "";
	try {
		existingRegistry = await readFile(REGISTRY_TXT_PATH, "utf8");
	} catch {
		existingRegistry = "";
	}
	const nextRegistry = syncSongRegistryText(
		existingRegistry,
		registrySummaries,
	);
	await writeFile(REGISTRY_TXT_PATH, nextRegistry, "utf8");

	return {
		ingestedCount: catalogItems.length,
		registryCount: registrySummaries.length,
	};
}

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		allowPositionals: true,
		options: {
			input: { type: "string", short: "i" },
			"list-parts": { type: "boolean", short: "l" },
			copy: { type: "boolean" },
			instrument: { type: "string" },
			part: { type: "string" },
			id: { type: "string" },
			title: { type: "string" },
			composer: { type: "string" },
			subtitle: { type: "string" },
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
		const summary = await syncFromMusicXmlFolder();
		console.error(
			`Synced ${summary.ingestedCount} MusicXML song(s) from songs/musicxml/ -> songCatalog.generated.ts & songs/songs.txt`,
		);
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
	const { partIndex, partId } = parsePartFlag(values.part);
	const quantizeSubdivision =
		values.quantize !== undefined
			? Number.parseInt(values.quantize, 10)
			: undefined;
	if (quantizeSubdivision !== undefined && Number.isNaN(quantizeSubdivision)) {
		throw new Error(`Invalid --quantize value "${values.quantize}".`);
	}

	const importOptions: MusicXmlImportOptions = {
		partIndex,
		partId,
		instrument,
		id: values.id,
		title: values.title,
		composerOrSource: values.composer,
		subtitle: values.subtitle,
		quantizeSubdivision,
		splitHalfBarHarmony: Boolean(values["split-chords"]),
	};

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
			values.instrument ||
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
				`${JSON.stringify({ ...importOptions, id: safeId }, null, "\t")}\n`,
				"utf8",
			);
		}
		const syncRes = await syncFromMusicXmlFolder();
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

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
});
