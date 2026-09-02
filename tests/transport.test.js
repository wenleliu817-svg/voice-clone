const assert = require("assert");
const {
  buildRequestUrl,
  buildMediaUrl,
  isOfficialYoudaoOrigin,
  resolveBackendBase,
} = require("../docs/transport.js");

function run() {
  assert.strictEqual(isOfficialYoudaoOrigin("https://openapi.youdao.com"), true);
  assert.strictEqual(isOfficialYoudaoOrigin("https://example.com"), false);

  assert.strictEqual(
    resolveBackendBase({
      queryBase: "",
      locationProtocol: "https:",
      locationHostname: "wenleliu817-svg.github.io",
    }),
    "https://voice-clone.onrender.com"
  );

  assert.strictEqual(
    resolveBackendBase({
      queryBase: "https://api.example.com/",
      locationProtocol: "https:",
      locationHostname: "wenleliu817-svg.github.io",
    }),
    "https://api.example.com"
  );

  assert.strictEqual(
    resolveBackendBase({
      queryBase: "",
      locationProtocol: "file:",
      locationHostname: "",
    }),
    "http://localhost:5001"
  );

  assert.strictEqual(
    buildRequestUrl({
      backendBase: "https://api.example.com",
      path: "/api/clone",
    }),
    "https://api.example.com/api/clone"
  );

  assert.throws(
    () => buildRequestUrl({
      backendBase: "https://openapi.youdao.com",
      path: "/api/clone",
    }),
    /不能直接填写 openapi\.youdao\.com/
  );

  assert.throws(
    () => buildRequestUrl({
      backendBase: "",
      path: "/tts_gateway/v2/upload",
    }),
    /请先配置后端地址/
  );

  assert.strictEqual(
    buildMediaUrl({
      backendBase: "https://api.example.com",
      mediaUrl: "https://cdn.example.com/audio.wav",
      filename: "audio_1.wav",
    }),
    "https://api.example.com/api/download?url=https%3A%2F%2Fcdn.example.com%2Faudio.wav&filename=audio_1.wav"
  );

  assert.strictEqual(
    buildMediaUrl({
      backendBase: "https://api.example.com",
      mediaUrl: "/api/generated/sample.wav",
      filename: "audio_1.wav",
    }),
    "https://api.example.com/api/generated/sample.wav"
  );

  assert.strictEqual(
    buildMediaUrl({
      backendBase: "",
      mediaUrl: "https://cdn.example.com/audio.wav",
      filename: "audio_1.wav",
    }),
    "https://cdn.example.com/audio.wav"
  );

  console.log("transport.test.js passed");
}

run();
