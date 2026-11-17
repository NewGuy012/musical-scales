import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

const app = new Hono();

app.use(
	"*",
	secureHeaders({
		strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
		xFrameOptions: "DENY",
		referrerPolicy: "strict-origin-when-cross-origin",
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
		c.header("Allow", "GET, HEAD");
		return c.json({ error: "Method not allowed" }, 405);
	}
	return c.json({ error: "Not found" }, 404);
});

app.notFound((c) => {
	c.header("Cache-Control", "no-store");
	return c.json({ error: "Not found" }, 404);
});

export default app;
