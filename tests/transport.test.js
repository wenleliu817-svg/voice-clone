const assert = require("assert");
const {
  buildRequestUrl,
  buildMediaUrl,
  isOfficialYoudaoOrigin,
} = require("../docs/transport.js");

function run() {
  assert.strictEqual(isOfficialYoudaoOrigin("https://openapi.youdao.com"), true);
  assert.strictEqual(isOfficialYoudaoOrigin("https://example.com"), false);

  assert.strictEqual(
    buildRequestUrl({
      backendBase: "https://api.example.com",
      corsProxyKey: "abc123",
      path: "/api/clone",
    }),
    "https://api.example.com/api/clone"
  );

  assert.throws(
    () => buildRequestUrl({
      backendBase: "https://openapi.youdao.com",
      corsProxyKey: "abc123",
      path: "/api/clone",
    }),
    /不能直接填写 openapi\.youdao\.com/
  );

  assert.strictEqual(
    buildRequestUrl({
      backendBase: "",
      corsProxyKey: "abc123",
      path: "/tts_gateway/v2/upload",
    }),
    "https://corsproxy.io/?key=abc123&url=https%3A%2F%2Fopenapi.youdao.com%2Ftts_gateway%2Fv2%2Fupload"
  );

  assert.strictEqual(
    buildMediaUrl({
      backendBase: "https://api.example.com",
      corsProxyKey: "",
      mediaUrl: "https://cdn.example.com/audio.wav",
      filename: "audio_1.wav",
    }),
    "https://api.example.com/api/download?url=https%3A%2F%2Fcdn.example.com%2Faudio.wav&filename=audio_1.wav"
  );

  assert.strictEqual(
    buildMediaUrl({
      backendBase: "",
      corsProxyKey: "abc123",
      mediaUrl: "https://cdn.example.com/audio.wav",
      filename: "audio_1.wav",
    }),
    "https://corsproxy.io/?key=abc123&url=https%3A%2F%2Fcdn.example.com%2Faudio.wav"
  );

  console.log("transport.test.js passed");
}

run();
