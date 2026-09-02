const DEFAULT_API_ORIGIN = "https://openapi.youdao.com";
const DEFAULT_CORS_PROXY_ORIGIN = "https://corsproxy.io/";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isOfficialYoudaoOrigin(url) {
  try {
    const parsed = new URL(normalizeBaseUrl(url));
    return ["openapi.youdao.com", "api.youdao.com", "ai.youdao.com"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function buildRequestUrl({ backendBase, corsProxyKey, path, targetOrigin = DEFAULT_API_ORIGIN }) {
  const base = normalizeBaseUrl(backendBase);
  if (base) {
    if (isOfficialYoudaoOrigin(base)) {
      throw new Error("后端地址不能直接填写 openapi.youdao.com，请填写你自己部署的后端，或改用 CorsProxy API Key。");
    }
    return `${base}${path}`;
  }

  const key = String(corsProxyKey || "").trim();
  if (key) {
    return `${DEFAULT_CORS_PROXY_ORIGIN}?key=${encodeURIComponent(key)}&url=${encodeURIComponent(`${targetOrigin}${path}`)}`;
  }

  throw new Error("请先填写后端地址，或填写 CorsProxy API Key。GitHub Pages 不能直接代替后端。");
}

function buildMediaUrl({ backendBase, corsProxyKey, mediaUrl, filename = "audio.wav" }) {
  const url = String(mediaUrl || "").trim();
  if (!url) return "";
  const base = normalizeBaseUrl(backendBase);
  if (base) {
    return `${base}/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  }
  const key = String(corsProxyKey || "").trim();
  if (key) {
    return `${DEFAULT_CORS_PROXY_ORIGIN}?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}`;
  }
  return url;
}

if (typeof window !== "undefined") {
  window.YoudaoVoiceCloneTransport = {
    normalizeBaseUrl,
    isOfficialYoudaoOrigin,
    buildRequestUrl,
    buildMediaUrl,
    DEFAULT_API_ORIGIN,
    DEFAULT_CORS_PROXY_ORIGIN,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeBaseUrl,
    isOfficialYoudaoOrigin,
    buildRequestUrl,
    buildMediaUrl,
    DEFAULT_API_ORIGIN,
    DEFAULT_CORS_PROXY_ORIGIN,
  };
}
