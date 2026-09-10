const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const appJs = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");

  assert.ok(appJs.includes('formData.append("audioFile", audioFile, audioFile.name);'), "reference audio should be sent");
  assert.ok(indexHtml.includes("AppID") && indexHtml.includes("App Secret"), "credentials should use AppID wording");
  assert.ok(indexHtml.includes("audio/*") && indexHtml.includes("MP3") && indexHtml.includes("参考音频"), "page should explain supported audio formats");
  assert.ok(appJs.includes("dataBytes"), "reference audio validation should inspect the WAV data chunk");
  assert.ok(appJs.includes("音频数据不能为空"), "empty WAV files should be rejected before submission");
  assert.ok(appJs.includes("AudioContext"), "browser should decode common audio formats");
  assert.ok(appJs.includes("encodeMonoWav"), "browser should normalize audio to mono WAV");
  assert.ok(appJs.includes("自动转换为有道兼容格式"), "page should explain automatic audio normalization");
  assert.ok(appJs.includes("AbortController"), "network requests should have a timeout instead of hanging forever");
  assert.ok(appJs.includes("公共跨域代理或有道接口没有在"), "a stalled direct request should show a useful timeout message");

  assert.ok(
    !appJs.includes("split(/\\r?\\n/)"),
    "docs/app.js should not split synthesis text by newline"
  );

  assert.ok(appJs.includes('requestJson("/tts_gateway/v2/upload"'), "docs/app.js should upload reference audio directly");
  assert.ok(appJs.includes("/tts_gateway/v2/synthesis_async"), "docs/app.js should submit the Youdao async synthesis task");
  assert.ok(appJs.includes("/tts_gateway/v2/get_progress"), "docs/app.js should poll Youdao task progress");
  assert.ok(appJs.includes("/tts_gateway/v2/get_result"), "docs/app.js should fetch Youdao task results");
  assert.ok(appJs.includes("crypto.subtle.digest"), "docs/app.js should generate the Youdao v4 signature in the browser");
  assert.ok(appJs.includes("setProgressStage"), "docs/app.js should render real progress stages");
  assert.ok(appJs.includes("download"), "docs/app.js should provide a download action for the final audio");
  assert.ok(appJs.includes("voiceId"), "docs/app.js should expose the cloned voice id");
  assert.ok(appJs.includes("resetForm"), "docs/app.js should provide a reset action");
  assert.ok(!appJs.includes("URLSearchParams(window.location.search).get(\"apiBase\")"), "docs/app.js should not expose a configurable backend URL");

  console.log("docs_app_flow.test.js passed");
}

run();
