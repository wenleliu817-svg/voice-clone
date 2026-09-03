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

  console.log("docs_app_flow.test.js passed");
}

run();
