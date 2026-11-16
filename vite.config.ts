import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

await import("./scripts/bun-undici-preload.cjs");
const { cloudflare } = await import("@cloudflare/vite-plugin");

export default defineConfig({
	plugins: [react(), cloudflare()],
});
