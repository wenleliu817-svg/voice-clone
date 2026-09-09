const UPSTREAM_ORIGIN = "https://openapi.youdao.com";
const ALLOWED_PATHS = new Set([
  "/tts_gateway/v2/upload",
  "/tts_gateway/v2/synthesis_async",
  "/tts_gateway/v2/get_progress",
  "/tts_gateway/v2/get_result",
]);

function corsHeaders(request) {
  const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": requestedHeaders || "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/") {
      return jsonResponse({
        ok: true,
        service: "voice-clone",
        message: "Youdao voice clone proxy is running",
      }, 200, request);
    }
    if (url.pathname === "/api/status") {
      return jsonResponse({ ok: true }, 200, request);
    }
    if (!ALLOWED_PATHS.has(url.pathname)) {
      return jsonResponse({ error: "Not found" }, 404, request);
    }
    if (!["POST", "GET"].includes(request.method)) {
      return jsonResponse({ error: "Method not allowed" }, 405, request);
    }

    const upstreamUrl = `${UPSTREAM_ORIGIN}${url.pathname}${url.search}`;
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("content-length");

    try {
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: request.method === "GET" ? undefined : request.body,
      });
      const responseHeaders = new Headers(upstream.headers);
      Object.entries(corsHeaders(request)).forEach(([key, value]) => responseHeaders.set(key, value));
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return jsonResponse({ error: `Upstream request failed: ${error.message}` }, 502, request);
    }
  },
};
