const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const appJs = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");

  assert.ok(
    appJs.includes('formData.append("audio", audioFile, audioFile.name);'),
    "docs/app.js should send the reference audio directly with the synthesis request"
  );

  assert.ok(
    !appJs.includes("split(/\\r?\\n/)"),
    "docs/app.js should not split synthesis text by newline"
  );

  assert.ok(appJs.includes('requestJson("/api/compose/start"'), "docs/app.js should start an async compose job");
  assert.ok(appJs.includes("/api/compose/status/"), "docs/app.js should poll the compose job status");
  assert.ok(appJs.includes("setProgressStage"), "docs/app.js should render real progress stages");
  assert.ok(appJs.includes("download"), "docs/app.js should provide a download action for the final audio");
  assert.ok(!appJs.includes("URLSearchParams(window.location.search).get(\"apiBase\")"), "docs/app.js should not expose a configurable backend URL");

  console.log("docs_app_flow.test.js passed");
}

run();
