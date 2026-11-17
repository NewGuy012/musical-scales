import { decodeXmlBytes, findChildren, parseXml } from "./xmlParser";

const MAX_MXL_ENTRIES = 128;
const MAX_MXL_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;

interface MinimalStreamPair {
	readable: {
		getReader(): {
			read(): Promise<{ done: boolean; value?: Uint8Array }>;
			cancel?: () => Promise<void>;
		};
	};
	writable: {
		getWriter(): {
			write(chunk: Uint8Array): Promise<void>;
			close(): Promise<void>;
			abort?: () => Promise<void>;
		};
	};
}

type DecompressionStreamCtor = new (format: string) => MinimalStreamPair;

interface ZipEntryMeta {
	name: string;
	compressionMethod: number;
	compressedSize: number;
	uncompressedSize: number;
	localHeaderOffset: number;
}

function isSafeZipEntryName(name: string): boolean {
	if (!name || name.includes("\0")) return false;
	if (name.startsWith("/") || name.startsWith("\\")) return false;
	return !name.split(/[\\/]/).includes("..");
}

function concatChunks(
	chunks: readonly Uint8Array[],
	total: number,
): Uint8Array {
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

async function inflateRawDeflate(
	compressed: Uint8Array,
	maxBytes = MAX_MXL_UNCOMPRESSED_BYTES,
): Promise<Uint8Array> {
	const Ctor = (
		globalThis as unknown as { DecompressionStream?: DecompressionStreamCtor }
	).DecompressionStream;
	if (!Ctor) {
		throw new Error(
			"Compressed .mxl requires Web DecompressionStream support in this runtime.",
		);
	}
	const ds = new Ctor("deflate-raw");
	const writer = ds.writable.getWriter();
	const reader = ds.readable.getReader();
	const writePromise = writer.write(compressed).then(() => writer.close());
	writePromise.catch(() => {});

	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value && value.byteLength > 0) {
				totalBytes += value.byteLength;
				if (totalBytes > maxBytes) {
					throw new Error(
						`Compressed .mxl entry exceeds ${maxBytes} byte limit.`,
					);
				}
				chunks.push(value);
			}
		}
		await writePromise;
	} catch (err) {
		await reader.cancel?.().catch(() => {});
		await writer.abort?.().catch(() => {});
		throw err;
	}
	return concatChunks(chunks, totalBytes);
}

/** Returns true if the buffer begins with a standard PKZip signature (`.mxl`). */
export function isMxlBuffer(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		((bytes[2] === 0x03 && bytes[3] === 0x04) ||
			(bytes[2] === 0x05 && bytes[3] === 0x06))
	);
}

function findEndOfCentralDirectory(view: DataView, byteLength: number): number {
	const minOffset = Math.max(0, byteLength - 65557);
	for (let pos = byteLength - 22; pos >= minOffset; pos--) {
		if (view.getUint32(pos, true) === 0x06054b50) {
			return pos;
		}
	}
	throw new Error("Invalid .mxl archive: End of Central Directory not found.");
}

function indexZipEntries(bytes: Uint8Array): Map<string, ZipEntryMeta> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const eocdOffset = findEndOfCentralDirectory(view, bytes.byteLength);
	const entryCount = view.getUint16(eocdOffset + 10, true);
	if (entryCount > MAX_MXL_ENTRIES) {
		throw new Error(
			`Invalid .mxl archive: entry count (${entryCount}) exceeds ${MAX_MXL_ENTRIES}.`,
		);
	}
	const cdOffset = view.getUint32(eocdOffset + 16, true);
	if (cdOffset > bytes.byteLength) {
		throw new Error("Invalid .mxl archive: central directory out of bounds.");
	}

	const decoder = new TextDecoder("utf-8");
	const entries = new Map<string, ZipEntryMeta>();
	let cursor = cdOffset;

	for (let i = 0; i < entryCount; i++) {
		if (
			cursor + 46 > bytes.byteLength ||
			view.getUint32(cursor, true) !== 0x02014b50
		) {
			throw new Error("Corrupt .mxl ZIP central directory header.");
		}
		const compressionMethod = view.getUint16(cursor + 10, true);
		const compressedSize = view.getUint32(cursor + 20, true);
		const uncompressedSize = view.getUint32(cursor + 24, true);
		const nameLen = view.getUint16(cursor + 28, true);
		const extraLen = view.getUint16(cursor + 30, true);
		const commentLen = view.getUint16(cursor + 32, true);
		const localHeaderOffset = view.getUint32(cursor + 42, true);

		if (cursor + 46 + nameLen > bytes.byteLength) {
			throw new Error("Truncated .mxl ZIP central directory entry.");
		}
		const entryName = decoder.decode(
			bytes.subarray(cursor + 46, cursor + 46 + nameLen),
		);
		cursor += 46 + nameLen + extraLen + commentLen;

		if (entryName.endsWith("/")) continue;
		if (!isSafeZipEntryName(entryName)) {
			throw new Error(`Unsafe path "${entryName}" inside .mxl archive.`);
		}

		entries.set(entryName, {
			name: entryName,
			compressionMethod,
			compressedSize,
			uncompressedSize,
			localHeaderOffset,
		});
	}

	return entries;
}

async function extractZipEntry(
	bytes: Uint8Array,
	entry: ZipEntryMeta,
): Promise<Uint8Array> {
	if (entry.uncompressedSize > MAX_MXL_UNCOMPRESSED_BYTES) {
		throw new Error(
			`Compressed .mxl entry "${entry.name}" exceeds ${MAX_MXL_UNCOMPRESSED_BYTES} byte limit.`,
		);
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const { localHeaderOffset, compressedSize, compressionMethod, name } = entry;
	if (
		localHeaderOffset + 30 > bytes.byteLength ||
		view.getUint32(localHeaderOffset, true) !== 0x04034b50
	) {
		throw new Error(`Corrupt .mxl local file header for "${name}".`);
	}
	const localNameLen = view.getUint16(localHeaderOffset + 26, true);
	const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
	const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
	const dataEnd = dataStart + compressedSize;
	if (dataStart > bytes.byteLength || dataEnd > bytes.byteLength) {
		throw new Error(`Truncated .mxl ZIP entry "${name}".`);
	}
	const rawSlice = bytes.subarray(dataStart, dataEnd);

	if (compressionMethod === 0) {
		if (rawSlice.byteLength > MAX_MXL_UNCOMPRESSED_BYTES) {
			throw new Error(
				`.mxl entry "${name}" exceeds ${MAX_MXL_UNCOMPRESSED_BYTES} byte limit.`,
			);
		}
		return rawSlice;
	}
	if (compressionMethod === 8) {
		return inflateRawDeflate(rawSlice, MAX_MXL_UNCOMPRESSED_BYTES);
	}
	throw new Error(
		`Unsupported ZIP compression method ${compressionMethod} for "${name}".`,
	);
}

function findEntryCaseInsensitive(
	entries: Map<string, ZipEntryMeta>,
	targetPath: string,
): ZipEntryMeta | undefined {
	const cleaned = targetPath.replace(/^\.\//, "");
	const direct = entries.get(cleaned) ?? entries.get(targetPath);
	if (direct) return direct;
	const lower = cleaned.toLowerCase();
	for (const [name, meta] of entries.entries()) {
		if (name.toLowerCase() === lower) return meta;
	}
	return undefined;
}

/** Extracts and decodes the primary MusicXML string from `.musicxml`, `.xml`, or `.mxl` bytes. */
export async function readMusicXmlTextFromBytes(
	bytes: Uint8Array,
): Promise<string> {
	if (!isMxlBuffer(bytes)) {
		if (bytes.byteLength > MAX_MXL_UNCOMPRESSED_BYTES) {
			throw new Error(
				`MusicXML input exceeds ${MAX_MXL_UNCOMPRESSED_BYTES} byte limit.`,
			);
		}
		return decodeXmlBytes(bytes);
	}

	const entries = indexZipEntries(bytes);
	const containerMeta = findEntryCaseInsensitive(
		entries,
		"META-INF/container.xml",
	);

	if (containerMeta) {
		const containerBytes = await extractZipEntry(bytes, containerMeta);
		const containerXml = parseXml(decodeXmlBytes(containerBytes));
		const rootfilesParent = containerXml.children.find(
			(c) => c.tag === "rootfiles",
		);
		const rootfiles = rootfilesParent
			? findChildren(rootfilesParent, "rootfile")
			: findChildren(containerXml, "rootfile");

		const preferred =
			rootfiles.find((rf) => {
				const fullPath = rf.attrs["full-path"] ?? "";
				const mediaType = rf.attrs["media-type"] ?? "";
				return (
					Boolean(fullPath) &&
					!mediaType.includes("pdf") &&
					(/\.(musicxml|xml)$/i.test(fullPath) ||
						mediaType.includes("musicxml"))
				);
			}) ?? rootfiles.find((rf) => Boolean(rf.attrs["full-path"]));

		const targetPath = preferred?.attrs["full-path"];
		if (targetPath && isSafeZipEntryName(targetPath)) {
			const targetMeta = findEntryCaseInsensitive(entries, targetPath);
			if (targetMeta) {
				return decodeXmlBytes(await extractZipEntry(bytes, targetMeta));
			}
		}
	}

	for (const [name, meta] of entries.entries()) {
		if (
			!name.toUpperCase().startsWith("META-INF/") &&
			/\.(musicxml|xml)$/i.test(name)
		) {
			return decodeXmlBytes(await extractZipEntry(bytes, meta));
		}
	}

	throw new Error("No MusicXML score found inside .mxl archive.");
}
