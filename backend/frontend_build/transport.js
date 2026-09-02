const DEFAULT_API_ORIGIN = "https://openapi.youdao.com";
const DEFAULT_BACKEND_ORIGIN = "https://voice-clone.onrender.com";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveBackendBase({
  queryBase = "",
  locationProtocol = "",
  locationHostname = "",
  locationOrigin = "",
} = {}) {
  const query = normalizeBaseUrl(queryBase);
  if (query) return query;
  if (locationProtocol === "file:") return "http://localhost:5001";
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

function buildRequestUrl({ backendBase, path, targetOrigin = DEFAULT_API_ORIGIN }) {
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
    isOfficialYoudaoOrigin,
    resolveBackendBase,
    buildRequestUrl,
    buildMediaUrl,
    DEFAULT_API_ORIGIN,
    DEFAULT_BACKEND_ORIGIN,
  };
}
