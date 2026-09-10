const assert = require("assert");
const worker = require("../worker.js").default;

async function run() {
  const originalFetch = global.fetch;
  let requestedUrl = "";
    global.fetch = async url => {
      requestedUrl = String(url);
      return new Response(new Uint8Array([82, 73, 70, 70]), {
        status: 200,
        headers: { "Content-Type": "application/octet-stream;charset=UTF-8", "Content-Length": "4" },
      });
    };

  try {
    const request = new Request(
      "https://voice-clone.example.workers.dev/api/download?url="
      + encodeURIComponent("https://ydstatic.com/audio/result.wav")
      + "&filename=result.wav",
    );
    const response = await worker.fetch(request);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(await response.text(), "RIFF");
    assert.strictEqual(requestedUrl, "https://ydstatic.com/audio/result.wav");
    assert.match(response.headers.get("content-type"), /^audio\/wav/);
    assert.match(response.headers.get("content-disposition"), /result\.wav/);

    const youdaoCdn = await worker.fetch(new Request(
      "https://voice-clone.example.workers.dev/api/download?url="
      + encodeURIComponent("https://tts-gateway.nos-jd.163yun.com/online/result.wav")
      + "&filename=result.wav",
    ));
    assert.strictEqual(youdaoCdn.status, 200);

    const blocked = await worker.fetch(new Request(
      "https://voice-clone.example.workers.dev/api/download?url="
      + encodeURIComponent("https://example.com/secret"),
    ));
    assert.strictEqual(blocked.status, 400);
  } finally {
    global.fetch = originalFetch;
  }

  console.log("worker.test.js passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
