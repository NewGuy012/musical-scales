import { extname } from "node:path";
import { parseArgs } from "node:util";
import {
	encodeWavPcm16,
	renderTimedSequenceOfflineSamples,
} from "../src/react-app/audio/synth";
import {
	type InstrumentTab,
	flattenSongPlaybackSteps,
	hydrateSong,
} from "../src/react-app/theory/songExamples";
import {
	importMidiBuffer,
	importScoreWithAlphaTab,
	inspectAlphaTabScore,
	inspectMidiFile,
} from "./transcription/importers";
import {
	compileScoreTrackToSongSpec,
	formatSongSpecModule,
} from "./transcription/scoreIr";

const MIDI_EXTENSIONS = new Set([".mid", ".midi"]);
const SCORE_EXTENSIONS = new Set([
	".gp",
	".gp3",
	".gp4",
	".gp5",
	".gp6",
	".gp7",
	".gp8",
	".gpx",
	".xml",
	".musicxml",
	".mxl",
]);

function printUsage(): void {
	console.log(`Usage: bun run import-song --input <file> [options]

Supported inputs:
  Guitar Pro (.gp, .gp3-.gp8, .gpx), MusicXML (.musicxml, .xml, .mxl), Standard MIDI (.mid, .midi)

Options:
  -i, --input <path>        Input score or MIDI file (can also be passed positionally)
  -l, --list-tracks         List tracks in the file and exit
      --instrument <type>   piano | guitar | cello | violin (auto-detected if omitted)
      --track <index>       Zero-based track index to import
      --id <slug>           Override generated song ID
      --title <text>        Override song title
      --composer <text>     Override composer/source credit
      --subtitle <text>     Override subtitle
      --quantize <n>        Snap note offsets to 4/n quarter-note grid (e.g. 16, 8, 0 to disable)
      --split-chords        Infer half-bar sub-bar harmony splits
      --legacy              Emit legacy v1 CompactSongSpec instead of SongDocumentV2
      --export <name>       TypeScript export identifier (when --out ends in .ts)
  -o, --out <path>          Write SongDocumentV2 (or legacy spec) as .ts or .json file
      --json                Print compiled JSON to stdout
      --wav <path>          Render offline 22.05 kHz WAV preview for listening verification
  -h, --help                Show this help
`);
}

function toCamelCaseExportName(slug: string): string {
	const parts = slug
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map((part, idx) =>
			idx === 0
				? part.toLowerCase()
				: part[0].toUpperCase() + part.slice(1).toLowerCase(),
		);
	const base = parts.join("") || "importedSong";
	const safe = /^[0-9]/.test(base) ? `song${base}` : base;
	return safe.endsWith("Spec") ? safe : `${safe}Spec`;
}

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		allowPositionals: true,
		options: {
			input: { type: "string", short: "i" },
			"list-tracks": { type: "boolean", short: "l" },
			instrument: { type: "string" },
			track: { type: "string" },
			id: { type: "string" },
			title: { type: "string" },
			composer: { type: "string" },
			subtitle: { type: "string" },
			quantize: { type: "string" },
			"split-chords": { type: "boolean" },
			legacy: { type: "boolean" },
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
		printUsage();
		process.exitCode = 1;
		return;
	}

	const ext = extname(inputPath).toLowerCase();
	const isMidi = MIDI_EXTENSIONS.has(ext);
	const isScore = SCORE_EXTENSIONS.has(ext);
	if (!isMidi && !isScore) {
		throw new Error(
			`Unsupported file extension "${ext}". Supported: ${[
				...SCORE_EXTENSIONS,
				...MIDI_EXTENSIONS,
			].join(", ")}`,
		);
	}

	const bytes = new Uint8Array(await Bun.file(inputPath).arrayBuffer());

	if (values["list-tracks"]) {
		const info = isMidi ? inspectMidiFile(bytes) : inspectAlphaTabScore(bytes);
		console.log(`File: ${inputPath}`);
		for (const tr of info.tracks) {
			const tag = tr.isPercussion
				? "percussion"
				: (tr.suggestedInstrument ?? "unknown");
			const stringInfo = tr.isStringed
				? `${tr.stringCount}-str TAB`
				: "notation/MIDI";
			console.log(
				`  [${tr.index}] "${tr.name}" | ${tag} | ${stringInfo} | gm=${tr.midiProgram} | notes=${tr.noteCount}`,
			);
		}
		return;
	}

	let instrument: InstrumentTab | undefined;
	if (values.instrument !== undefined) {
		if (
			values.instrument !== "piano" &&
			values.instrument !== "guitar" &&
			values.instrument !== "cello" &&
			values.instrument !== "violin"
		) {
			throw new Error(
				`Invalid --instrument "${values.instrument}". Expected piano, guitar, cello, or violin.`,
			);
		}
		instrument = values.instrument;
	}

	const trackIndex =
		values.track !== undefined ? Number.parseInt(values.track, 10) : undefined;
	if (trackIndex !== undefined && Number.isNaN(trackIndex)) {
		throw new Error(`Invalid --track value "${values.track}".`);
	}

	const quantizeSubdivision =
		values.quantize !== undefined
			? Number.parseInt(values.quantize, 10)
			: undefined;
	if (quantizeSubdivision !== undefined && Number.isNaN(quantizeSubdivision)) {
		throw new Error(`Invalid --quantize value "${values.quantize}".`);
	}

	const importOptions = {
		trackIndex,
		instrument,
		id: values.id,
		title: values.title,
		composerOrSource: values.composer,
		subtitle: values.subtitle,
		quantizeSubdivision,
		splitHalfBarHarmony: Boolean(values["split-chords"]),
	};

	const imported = isMidi
		? importMidiBuffer(bytes, importOptions)
		: importScoreWithAlphaTab(bytes, importOptions);

	const { trackIr, songDoc, selectedTrack } = imported;
	const outputSpec = values.legacy
		? compileScoreTrackToSongSpec(trackIr, {
				...(importOptions.id ? { id: importOptions.id } : {}),
				...(importOptions.title ? { title: importOptions.title } : {}),
				...(importOptions.composerOrSource
					? { composerOrSource: importOptions.composerOrSource }
					: {}),
				...(importOptions.subtitle ? { subtitle: importOptions.subtitle } : {}),
				splitHalfBarHarmony: importOptions.splitHalfBarHarmony,
			})
		: songDoc;
	const song = hydrateSong(outputSpec);
	const flat = flattenSongPlaybackSteps(song);

	if (values.out) {
		const outExt = extname(values.out).toLowerCase();
		const content =
			outExt === ".ts"
				? formatSongSpecModule(
						outputSpec,
						values.export || toCamelCaseExportName(outputSpec.id),
					)
				: `${JSON.stringify(outputSpec, null, "\t")}\n`;
		await Bun.write(values.out, content);
		console.error(`Wrote ${values.out}`);
	}

	const primaryInstrument = song.instruments[0] ?? "guitar";

	if (values.wav) {
		const sampleRate = 22050;
		const samples = renderTimedSequenceOfflineSamples(flat.events, {
			preset: primaryInstrument,
			sampleRate,
			totalDurationMs: flat.totalDurationMs,
		});
		const wavBytes = encodeWavPcm16(samples, sampleRate);
		await Bun.write(values.wav, wavBytes);
		console.error(
			`Rendered ${values.wav} (${(flat.totalDurationMs / 1000).toFixed(2)}s @ ${sampleRate} Hz)`,
		);
	}

	if (values.json) {
		console.log(JSON.stringify(outputSpec, null, "\t"));
		return;
	}

	console.error(
		`Imported "${song.title}" (${primaryInstrument}, v${values.legacy ? 1 : 2}) from track [${selectedTrack.index}] "${selectedTrack.name}"`,
	);
	console.error(
		`  Key: ${song.keyLabel} | Tempo: ~${song.bpm} BPM | Bars: ${song.steps.length} | Steps: ${flat.events.length} | Duration: ${(flat.totalDurationMs / 1000).toFixed(2)}s`,
	);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
});
