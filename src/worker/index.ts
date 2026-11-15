import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

const app = new Hono<{ Bindings: Env }>();

app.use(
	"*",
	secureHeaders({
		xFrameOptions: "DENY",
		xContentTypeOptions: "nosniff",
		referrerPolicy: "strict-origin-when-cross-origin",
		permissionsPolicy: {
			camera: [],
			microphone: [],
			geolocation: [],
		},
	}),
);

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

export default app;
