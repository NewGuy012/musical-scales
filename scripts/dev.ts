import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const userArgs = Bun.argv.slice(2);
const hasPortFlag = userArgs.some(
	(arg) => arg === "--port" || arg.startsWith("--port=") || arg === "-p",
);
const serverArgs = hasPortFlag ? userArgs : ["--port", "5173", ...userArgs];

const initialSync = Bun.spawnSync(
	[process.execPath, "scripts/ingest-songs.ts"],
	{
		cwd: REPO_ROOT,
		stdio: ["inherit", "inherit", "inherit"],
	},
);
if (initialSync.exitCode !== 0) {
	process.exit(initialSync.exitCode);
}

const watcher = Bun.spawn(
	[process.execPath, "scripts/ingest-songs.ts", "--watch", "--skip-initial"],
	{
		cwd: REPO_ROOT,
		stdio: ["inherit", "inherit", "inherit"],
	},
);

const devServer = Bun.spawn(
	[process.execPath, "--hot", "./index.html", ...serverArgs],
	{
		cwd: REPO_ROOT,
		stdio: ["inherit", "inherit", "inherit"],
	},
);

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
	if (shuttingDown) return;
	shuttingDown = true;
	watcher.kill(signal);
	devServer.kill(signal);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

const serverExitCode = await devServer.exited;
if (!shuttingDown) {
	shuttingDown = true;
	watcher.kill("SIGTERM");
}
await watcher.exited.catch(() => {});
process.exit(serverExitCode);
