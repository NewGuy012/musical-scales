// Bun 1.4's built-in `undici` ignores custom Dispatcher instances used by
// Miniflare's dispatchFetch(), causing local Vite dev/preview requests to loop
// or fail with ECONNREFUSED. Replace its exports with npm's `undici` before
// loading `@cloudflare/vite-plugin` / Miniflare.
if (
	typeof process !== "undefined" &&
	typeof process.versions?.bun === "string"
) {
	const { createRequire } = require("node:module");
	const path = require("node:path");
	const builtinUndici =
		typeof process.getBuiltinModule === "function"
			? process.getBuiltinModule("undici")
			: createRequire("/")("undici");
	if (builtinUndici) {
		const cwdRequire = createRequire(path.join(process.cwd(), "package.json"));
		const miniflareDir = path.dirname(
			cwdRequire.resolve("miniflare/package.json"),
		);
		const npmUndiciPath = cwdRequire.resolve("undici/index.js", {
			paths: [process.cwd(), miniflareDir],
		});
		Object.assign(builtinUndici, cwdRequire(npmUndiciPath));
	}
}
