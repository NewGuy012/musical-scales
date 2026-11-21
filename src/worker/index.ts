const SECURITY_HEADERS: Readonly<Record<string, string>> = {
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"X-Permitted-Cross-Domain-Policies": "none",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Origin-Agent-Cluster": "?1",
	"X-DNS-Prefetch-Control": "off",
	"X-Download-Options": "noopen",
	"X-XSS-Protection": "0",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
	"Content-Security-Policy":
		"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function jsonError(
	request: Request,
	status: number,
	error: string,
	extraHeaders?: Record<string, string>,
): Response {
	const body = request.method === "HEAD" ? null : JSON.stringify({ error });
	return new Response(body, {
		status,
		headers: {
			...SECURITY_HEADERS,
			"Cache-Control": "no-store",
			"Content-Type": "application/json; charset=utf-8",
			...extraHeaders,
		},
	});
}

export default {
	fetch(request: Request): Response {
		const { pathname } = new URL(request.url);
		if (
			(pathname === "/api" || pathname.startsWith("/api/")) &&
			request.method !== "GET" &&
			request.method !== "HEAD"
		) {
			return jsonError(request, 405, "Method not allowed", {
				Allow: "GET, HEAD",
			});
		}
		return jsonError(request, 404, "Not found");
	},
};
