import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

const app = new Hono<{ Bindings: Env }>();

app.use(
	"*",
	secureHeaders({
		xFrameOptions: "DENY",
		xContentTypeOptions: "nosniff",
		referrerPolicy: "strict-origin-when-cross-origin",
		crossOriginOpenerPolicy: "same-origin",
		crossOriginResourcePolicy: "same-origin",
		permissionsPolicy: {
			camera: [],
			microphone: [],
			geolocation: [],
		},
		contentSecurityPolicy: {
			defaultSrc: ["'none'"],
			baseUri: ["'none'"],
			formAction: ["'none'"],
			frameAncestors: ["'none'"],
		},
	}),
);

app.all("/api/*", (c) => {
	c.header("Cache-Control", "no-store");
	if (c.req.method !== "GET" && c.req.method !== "HEAD") {
		return c.json({ error: "Method not allowed" }, 405);
	}
	return c.json({ error: "Not found" }, 404);
});

app.notFound((c) => {
	c.header("Cache-Control", "no-store");
	return c.json({ error: "Not found" }, 404);
});

export default app;
