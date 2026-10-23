const DEFAULT_API_ORIGIN = "https://openapi.youdao.com";
const DEFAULT_BACKEND_ORIGIN = "https://voice-clone.wenleliu817.workers.dev";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function safeBackendOrigin(value) {
  const base = normalizeBaseUrl(value);
  if (!base) return "";
  let parsed;
  try { parsed = new URL(base); } catch { return ""; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password
      || parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")
      || isOfficialYoudaoOrigin(parsed.origin)) return "";
  return parsed.origin;
}

// Pages can inject a deployment-specific backend at build time. The same
// bundle is also served by the Flask container, where an empty value means
// "use this page's own origin".
function configuredBackendOrigin() {
  if (typeof window === "undefined") return "";
  return safeBackendOrigin(window.VOICE_CLONE_CONFIG?.backendOrigin || "");
}

function validateBackendBase(value) {
  const base = normalizeBaseUrl(value);
  let parsed;
  try { parsed = new URL(base); } catch { throw new Error("请输入完整的 HTTPS 服务地址"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash
      || (parsed.pathname !== "/" && parsed.pathname !== "") || isOfficialYoudaoOrigin(base)) {
    throw new Error("请填写你信任的 HTTPS 代理服务域名，不要填写有道官方地址、账户、查询参数或路径");
  }
  return parsed.origin;
}

function resolveBackendBase({
  queryBase = "",
  configuredBase = "",
  locationProtocol = "",
  locationHostname = "",
  locationOrigin = "",
} = {}) {
  const query = normalizeBaseUrl(queryBase);
  if (query) return query;
  const configured = safeBackendOrigin(configuredBase) || configuredBackendOrigin();
  if (configured) return configured;
  if (locationProtocol === "file:") return DEFAULT_BACKEND_ORIGIN;
  if (String(locationHostname || "").endsWith("github.io")) return DEFAULT_BACKEND_ORIGIN;
  return normalizeBaseUrl(locationOrigin) || DEFAULT_BACKEND_ORIGIN;
}

function isOfficialYoudaoOrigin(url) {
  try {
    const parsed = new URL(normalizeBaseUrl(url));
    return ["openapi.youdao.com", "api.youdao.com", "ai.youdao.com"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function buildRequestUrl({ backendBase, path }) {
  const base = normalizeBaseUrl(backendBase);
  if (base) {
    if (isOfficialYoudaoOrigin(base)) {
      throw new Error("后端地址不能直接填写 openapi.youdao.com，请填写你自己部署的后端。");
    }
    return `${base}${path}`;
  }
  throw new Error("请先配置后端地址。");
}

function buildMediaUrl({ backendBase, mediaUrl, filename = "audio.wav" }) {
  const url = String(mediaUrl || "").trim();
  if (!url) return "";
  const base = normalizeBaseUrl(backendBase);
  if (url.startsWith("/")) {
    return base ? `${base}${url}` : url;
  }
  if (base) {
    return `${base}/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  }
  return url;
}

if (typeof window !== "undefined") {
  window.YoudaoVoiceCloneTransport = {
    normalizeBaseUrl,
    configuredBackendOrigin,
    validateBackendBase,
    isOfficialYoudaoOrigin,
    resolveBackendBase,
    buildRequestUrl,
    buildMediaUrl,
    DEFAULT_API_ORIGIN,
    DEFAULT_BACKEND_ORIGIN,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeBaseUrl,
    configuredBackendOrigin,
    validateBackendBase,
    isOfficialYoudaoOrigin,
    resolveBackendBase,
    buildRequestUrl,
    buildMediaUrl,
    DEFAULT_API_ORIGIN,
    DEFAULT_BACKEND_ORIGIN,
  };
}
