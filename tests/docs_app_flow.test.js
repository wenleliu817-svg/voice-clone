const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const appJs = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");

  assert.ok(appJs.includes('formData.append("audio", audioFile, audioFile.name);'), "reference audio should be sent");
  assert.ok(indexHtml.includes("AppID") && indexHtml.includes("App Secret"), "credentials should use AppID wording");
  assert.ok(indexHtml.includes("audio/wav") && indexHtml.includes("参考音频"), "page should explain the WAV requirement");
  assert.ok(appJs.includes("dataBytes"), "reference audio validation should inspect the WAV data chunk");
  assert.ok(appJs.includes("音频数据不能为空"), "empty WAV files should be rejected before submission");
  assert.ok(appJs.includes("AbortController"), "network requests should have a timeout instead of hanging forever");
  assert.ok(appJs.includes("后端服务没有在"), "a stalled backend should show a useful timeout message");

  assert.ok(
    !appJs.includes("split(/\\r?\\n/)"),
    "docs/app.js should not split synthesis text by newline"
  );

  assert.ok(appJs.includes('requestJson("/api/compose/start"'), "docs/app.js should start an async compose job");
  assert.ok(appJs.includes("/api/compose/status/"), "docs/app.js should poll the compose job status");
  assert.ok(appJs.includes("setProgressStage"), "docs/app.js should render real progress stages");
  assert.ok(appJs.includes("download"), "docs/app.js should provide a download action for the final audio");
  assert.ok(appJs.includes("voiceId"), "docs/app.js should expose the cloned voice id");
  assert.ok(appJs.includes("resetForm"), "docs/app.js should provide a reset action");
  assert.ok(!appJs.includes("URLSearchParams(window.location.search).get(\"apiBase\")"), "docs/app.js should not expose a configurable backend URL");

  console.log("docs_app_flow.test.js passed");
}

run();
