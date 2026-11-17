import { decodeXmlBytes, findChildren, parseXml } from "./xmlParser";

interface MinimalStreamPair {
	readable: {
		getReader(): {
			read(): Promise<{ done: boolean; value?: Uint8Array }>;
		};
	};
	writable: {
		getWriter(): {
			write(chunk: Uint8Array): Promise<void>;
			close(): Promise<void>;
		};
	};
}

type DecompressionStreamCtor = new (format: string) => MinimalStreamPair;

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
	const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

async function inflateRawDeflate(compressed: Uint8Array): Promise<Uint8Array> {
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

	const writePromise = (async () => {
		await writer.write(compressed);
		await writer.close();
	})();

	const chunks: Uint8Array[] = [];
	const readPromise = (async () => {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value && value.byteLength > 0) {
				chunks.push(value);
			}
		}
	})();

	await Promise.all([writePromise, readPromise]);
	return concatChunks(chunks);
}

/**
 * Returns true if the buffer begins with a standard PKZip signature (`.mxl` container).
 */
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

/**
 * Unpacks entries from a `.mxl` ZIP container using standard Web Streams DEFLATE.
 */
export async function unpackZipEntries(
	bytes: Uint8Array,
): Promise<Map<string, Uint8Array>> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const eocdOffset = findEndOfCentralDirectory(view, bytes.byteLength);
	const entryCount = view.getUint16(eocdOffset + 10, true);
	const cdOffset = view.getUint32(eocdOffset + 16, true);

	const decoder = new TextDecoder("utf-8");
	const entries = new Map<string, Uint8Array>();
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
		const nameLen = view.getUint16(cursor + 28, true);
		const extraLen = view.getUint16(cursor + 30, true);
		const commentLen = view.getUint16(cursor + 32, true);
		const localHeaderOffset = view.getUint32(cursor + 42, true);

		const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLen);
		const entryName = decoder.decode(nameBytes);
		cursor += 46 + nameLen + extraLen + commentLen;

		if (entryName.endsWith("/")) continue;

		if (
			localHeaderOffset + 30 > bytes.byteLength ||
			view.getUint32(localHeaderOffset, true) !== 0x04034b50
		) {
			throw new Error(`Corrupt .mxl local file header for "${entryName}".`);
		}
		const localNameLen = view.getUint16(localHeaderOffset + 26, true);
		const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
		const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
		const dataEnd = dataStart + compressedSize;
		if (dataEnd > bytes.byteLength) {
			throw new Error(`Truncated .mxl ZIP entry "${entryName}".`);
		}
		const rawSlice = bytes.subarray(dataStart, dataEnd);

		if (compressionMethod === 0) {
			entries.set(entryName, rawSlice);
		} else if (compressionMethod === 8) {
			entries.set(entryName, await inflateRawDeflate(rawSlice));
		} else {
			throw new Error(
				`Unsupported ZIP compression method ${compressionMethod} for "${entryName}".`,
			);
		}
	}

	return entries;
}

function findEntryCaseInsensitive(
	entries: Map<string, Uint8Array>,
	targetPath: string,
): Uint8Array | undefined {
	const direct = entries.get(targetPath);
	if (direct) return direct;
	const lower = targetPath.toLowerCase();
	for (const [name, data] of entries.entries()) {
		if (name.toLowerCase() === lower) return data;
	}
	return undefined;
}

/**
 * Extracts and decodes the primary MusicXML string from `.musicxml`, `.xml`, or `.mxl` bytes.
 */
export async function readMusicXmlTextFromBytes(
	bytes: Uint8Array,
): Promise<string> {
	if (!isMxlBuffer(bytes)) {
		return decodeXmlBytes(bytes);
	}

	const entries = await unpackZipEntries(bytes);
	const containerBytes = findEntryCaseInsensitive(
		entries,
		"META-INF/container.xml",
	);

	if (containerBytes) {
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
		if (targetPath) {
			const content = findEntryCaseInsensitive(entries, targetPath);
			if (content) return decodeXmlBytes(content);
		}
	}

	for (const [name, data] of entries.entries()) {
		if (
			!name.toUpperCase().startsWith("META-INF/") &&
			/\.(musicxml|xml)$/i.test(name)
		) {
			return decodeXmlBytes(data);
		}
	}

	throw new Error("No MusicXML score found inside .mxl archive.");
}
