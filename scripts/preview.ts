import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import workerApp from "../src/worker/index";

const DIST_CLIENT_DIR = resolve(import.meta.dir, "..", "dist", "client");
const INDEX_HTML_PATH = join(DIST_CLIENT_DIR, "index.html");

function parsePort(raw: string | undefined): number {
	if (raw === undefined || raw === "") return 4173;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
		throw new Error(`Invalid PORT "${raw}". Expected an integer 0..65535.`);
	}
	return parsed;
}

function resolveCandidateRel(pathname: string): string | null {
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return null;
	}
	if (decoded.includes("\0")) return null;

	const rawRel = decoded.replace(/^\/+/, "");
	if (!rawRel) return "";

	const candidate = resolve(DIST_CLIENT_DIR, rawRel);
	const normalizedRel = relative(DIST_CLIENT_DIR, candidate);
	if (
		normalizedRel.startsWith("..") ||
		isAbsolute(normalizedRel) ||
		normalizedRel === "."
	) {
		return null;
	}
	return normalizedRel;
}

function isBlockedAssetPath(normalizedRel: string): boolean {
	return (
		normalizedRel === "_headers" || normalizedRel.startsWith(`_headers${sep}`)
	);
}

async function resolveStaticFile(
	normalizedRel: string,
	realDistDir: string,
): Promise<string | null> {
	if (!normalizedRel) return INDEX_HTML_PATH;
	if (isBlockedAssetPath(normalizedRel)) return null;

	const candidate = join(DIST_CLIENT_DIR, normalizedRel);
	try {
		const info = await lstat(candidate);
		if (!info.isFile()) return null;
		const realCandidate = await realpath(candidate);
		const realRel = relative(realDistDir, realCandidate);
		if (
			!realRel ||
			realRel.startsWith("..") ||
			isAbsolute(realRel) ||
			isBlockedAssetPath(realRel)
		) {
			return null;
		}
		return realCandidate;
	} catch {
		return null;
	}
}

function serveBunFile(req: Request, filePath: string): Response {
	const file = Bun.file(filePath);
	if (req.method === "HEAD") {
		return new Response(null, {
			headers: {
				"Content-Type": file.type,
				"Content-Length": String(file.size),
			},
		});
	}
	return new Response(file);
}

async function main(): Promise<void> {
	if (!(await Bun.file(INDEX_HTML_PATH).exists())) {
		throw new Error(
			`Missing "${INDEX_HTML_PATH}". Run "bun run build" before starting preview.`,
		);
	}

	const realDistDir = await realpath(DIST_CLIENT_DIR);
	const port = parsePort(Bun.env.PORT);
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port,
		async fetch(req) {
			const url = new URL(req.url);
			if (
				url.pathname === "/api" ||
				url.pathname.startsWith("/api/") ||
				(req.method !== "GET" && req.method !== "HEAD")
			) {
				return workerApp.fetch(req);
			}

			const normalizedRel = resolveCandidateRel(url.pathname);
			if (normalizedRel === null) {
				return new Response("Bad Request", { status: 400 });
			}

			const staticPath = await resolveStaticFile(normalizedRel, realDistDir);
			if (staticPath) {
				return serveBunFile(req, staticPath);
			}

			if (
				isBlockedAssetPath(normalizedRel) ||
				normalizedRel.startsWith(`assets${sep}`)
			) {
				return new Response("Not found", { status: 404 });
			}

			return serveBunFile(req, INDEX_HTML_PATH);
		},
	});

	console.log(`Preview server listening on ${server.url}`);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
});
