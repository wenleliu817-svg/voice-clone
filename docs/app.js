const STORAGE_KEYS = { language: "voice_clone_language", model: "voice_clone_model" };
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const TARGET_REFERENCE_SAMPLE_RATE = 16000;
const SUPPORTED_AUDIO_EXTENSIONS = [".wav", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".webm", ".flac"];
const LANGUAGE_OPTIONS = [
  { code: "zh-CHS", label: "中文", sample: "你好，欢迎使用有道智云声音复刻。愿这段全新的声音，为你的内容带来更多温度。" },
  { code: "en", label: "English", sample: "Hello, this voice was created with Youdao AI Cloud. Thank you for listening." },
  { code: "de", label: "Deutsch", sample: "Willkommen bei Youdao Zhiyun." },
  { code: "fr", label: "Français", sample: "Bienvenue chez Youdao Zhiyun." },
  { code: "ja", label: "日本語", sample: "有道智云の音声合成へようこそ。" },
  { code: "ko", label: "한국어", sample: "유다오 즈윈 음성 합성에 오신 것을 환영합니다." },
  { code: "id", label: "Bahasa Indonesia", sample: "Selamat datang di Youdao Zhiyun." },
  { code: "vi", label: "Tiếng Việt", sample: "Chào mừng bạn đến với Youdao Zhiyun." },
  { code: "th", label: "ไทย", sample: "ยินดีต้อนรับสู่ Youdao Zhiyun" },
  { code: "ru", label: "Русский", sample: "Добро пожаловать в Youdao Zhiyun." },
  { code: "it", label: "Italiano", sample: "Benvenuti su Youdao Zhiyun." },
  { code: "pt", label: "Português", sample: "Bem-vindo ao Youdao Zhiyun." },
  { code: "es", label: "Español", sample: "Bienvenido a Youdao Zhiyun." },
  { code: "ms", label: "Bahasa Melayu", sample: "Selamat datang ke Youdao Zhiyun." },
];
const PROGRESS_ORDER = ["received", "cloning", "clone_complete", "synthesizing", "completed"];
const TRANSPORT = window.YoudaoVoiceCloneTransport;
if (!TRANSPORT) throw new Error("页面传输模块未加载");

const $ = id => document.getElementById(id);
let API_BASE = TRANSPORT.resolveBackendBase({
  locationProtocol: window.location.protocol,
  locationHostname: window.location.hostname,
  locationOrigin: window.location.origin,
});
let selectedLanguage = localStorage.getItem(STORAGE_KEYS.language) || "zh-CHS";
let selectedModel = localStorage.getItem(STORAGE_KEYS.model) || "pro";
let audioFile = null;
let audioSourceFile = null;
let referenceAudioUrl = "";
let synthesisText = "";
let pendingTask = null;
let isRunning = false;
let lastProgress = 0;

function languageOption(code) {
  return LANGUAGE_OPTIONS.find(item => item.code === code) || LANGUAGE_OPTIONS[0];
}

function showMessage(message, type = "error") {
  const region = $("message-region");
  const node = document.createElement("div");
  node.className = `message ${type}`;
  node.textContent = message;
  region.replaceChildren(node);
  node.scrollIntoView({ behavior: "smooth", block: "nearest" });
  window.setTimeout(() => node.remove(), 6000);
}

async function requestJson(path, options = {}, label = "请求", timeoutMs = 30000) {
  const url = TRANSPORT.buildRequestUrl({ backendBase: API_BASE, path });
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const raw = await response.text();
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(`${label}返回了异常内容，请确认服务已正常部署`);
      }
      if (!response.ok) throw payload.code ? apiError(payload, label) : new Error(payload.error || payload.message || `${label}失败（HTTP ${response.status}）`);
      return payload;
    } finally {
      window.clearTimeout(timer);
    }
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`${label}超时：公共跨域代理或有道接口没有在 ${Math.round(timeoutMs / 1000)} 秒内响应，请稍后重试`);
    }
    if (error instanceof TypeError) throw new Error(pendingTask?.taskId
      ? "网络连接中断，已保留本页任务。恢复连接后点击继续获取结果。"
      : "当前网络无法连接语音服务，尚未提交合成任务。请检测连接，或联系页面提供者配置可访问的服务地址。");
    throw error;
  }
}

async function generateSign(appKey, appSecret) {
  const salt = crypto.randomUUID();
  const curtime = String(Math.floor(Date.now() / 1000));
  const encoded = new TextEncoder().encode(appKey + salt + curtime + appSecret);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const sign = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return { salt, curtime, sign };
}

async function signedPayload(appKey, appSecret, values = {}) {
  const { salt, curtime, sign } = await generateSign(appKey, appSecret);
  return { appKey, curtime, salt, sign, signType: "v4", ...values };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds) {
  const wholeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function getAudioExtension(file) {
  const name = String(file?.name || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function isSupportedAudioFile(file) {
  if (!file) return false;
  return String(file.type || "").toLowerCase().startsWith("audio/")
    || SUPPORTED_AUDIO_EXTENSIONS.includes(getAudioExtension(file));
}

function audioTypeLabel(file) {
  const extension = getAudioExtension(file).replace(".", "").toUpperCase();
  return extension || String(file?.type || "音频").replace(/^audio\//, "").toUpperCase();
}

async function readWavInfo(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const text = (offset, length) => Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");
  if (buffer.byteLength < 44 || text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") throw new Error("文件不是有效的 WAV 音频");
  let format = null;
  let dataBytes = 0;
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const chunk = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (chunk === "fmt " && offset + 16 <= buffer.byteLength) {
      format = {
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        bitsPerSample: view.getUint16(offset + 22, true),
      };
    }
    if (chunk === "data") {
      dataBytes = Math.min(size, Math.max(0, buffer.byteLength - offset - 8));
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!format) throw new Error("无法读取 WAV 音频参数");
  if (dataBytes <= 0) throw new Error("音频数据不能为空，请上传包含实际声音的 WAV 文件");
  if (format.channels !== 1) throw new Error("参考音频必须是单声道，请先转换后再上传");
  if (![16000, 24000].includes(format.sampleRate)) throw new Error("参考音频采样率必须是 16kHz 或 24kHz");
  const bytesPerSample = Math.max(1, format.channels * Math.max(1, format.bitsPerSample) / 8);
  const durationSeconds = dataBytes / (format.sampleRate * bytesPerSample);
  if (durationSeconds <= 0) throw new Error("音频时长必须大于 0 秒");
  return { ...format, dataBytes, durationSeconds };
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeMonoWav(audioBuffer, targetSampleRate = TARGET_REFERENCE_SAMPLE_RATE) {
  const sourceLength = audioBuffer.length;
  const sourceRate = audioBuffer.sampleRate;
  const outputLength = Math.max(1, Math.ceil(sourceLength * targetSampleRate / sourceRate));
  const output = new ArrayBuffer(44 + outputLength * 2);
  const view = new DataView(output);
  const channels = Array.from(
    { length: audioBuffer.numberOfChannels },
    (_, index) => audioBuffer.getChannelData(index),
  );

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + outputLength * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, outputLength * 2, true);

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * sourceRate / targetSampleRate;
    const lower = Math.floor(sourcePosition);
    const upper = Math.min(lower + 1, sourceLength - 1);
    const ratio = sourcePosition - lower;
    let sample = 0;
    channels.forEach(channel => {
      const lowerSample = channel[lower] || 0;
      const upperSample = channel[upper] || lowerSample;
      sample += lowerSample + (upperSample - lowerSample) * ratio;
    });
    sample /= Math.max(1, channels.length);
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([output], { type: "audio/wav" });
}

async function normalizeAudioFile(file) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("当前浏览器不支持音频转换，请使用最新版 Chrome、Edge 或 Safari");
  }
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const wavBlob = encodeMonoWav(decoded);
    if (wavBlob.size > MAX_AUDIO_BYTES) {
      throw new Error("转换后的音频超过 25MB，请缩短音频后再试");
    }
    const basename = String(file.name || "reference").replace(/\.[^.]+$/, "") || "reference";
    const normalizedFile = new File([wavBlob], `${basename}.wav`, {
      type: "audio/wav",
      lastModified: Date.now(),
    });
    const info = await readWavInfo(normalizedFile);
    return {
      file: normalizedFile,
      info,
      sourceSampleRate: decoded.sampleRate,
      sourceChannels: decoded.numberOfChannels,
      sourceDuration: decoded.duration,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("超过 25MB")) throw error;
    throw new Error("浏览器无法解码这个音频，请改用 WAV、MP3、M4A、AAC、OGG 或 WebM 文件");
  } finally {
    await context.close().catch(() => {});
  }
}

async function handleAudio(file) {
  if (isRunning) return showMessage("请等待当前任务结束后再更换音频");
  if (!file) return;
  if (!isSupportedAudioFile(file)) {
    showMessage("暂不支持这个文件格式，请使用 WAV、MP3、M4A、AAC、OGG 或 WebM");
    return;
  }
  if (file.size > MAX_AUDIO_BYTES) {
    showMessage("参考音频不能超过 25MB");
    return;
  }
  setAudioStatus(`正在读取 ${audioTypeLabel(file)} 并转换为标准格式…`, "success");
  try {
    const normalized = await normalizeAudioFile(file);
    clearAudio();
    audioFile = normalized.file;
    audioSourceFile = file;
    referenceAudioUrl = URL.createObjectURL(file);
    $("audio-filename").textContent = file.name;
    $("audio-details").textContent = `${formatBytes(file.size)} · ${audioTypeLabel(file)} ${Math.round(normalized.sourceSampleRate / 100) / 10}kHz · 已转换为单声道 16kHz · ${formatDuration(normalized.info.durationSeconds)}`;
    $("reference-player").src = referenceAudioUrl;
    $("audio-dropzone").classList.add("hidden");
    $("audio-preview").classList.remove("hidden");
    setAudioStatus(`已自动转换为有道兼容格式（${formatBytes(normalized.file.size)} WAV · 单声道 · 16kHz），可以开始复刻。`, "success");
  } catch (error) {
    showMessage(error.message);
    setAudioStatus(error.message, "error");
  }
}

function clearAudio() {
  if (isRunning) return showMessage("请等待当前任务结束后再移除音频");
  audioFile = null;
  audioSourceFile = null;
  $("audioFile").value = "";
  if (referenceAudioUrl) URL.revokeObjectURL(referenceAudioUrl);
  referenceAudioUrl = "";
  $("reference-player").removeAttribute("src");
  $("audio-preview").classList.add("hidden");
  $("audio-dropzone").classList.remove("hidden");
  setAudioStatus("");
}

function setAudioStatus(message, type = "") {
  const node = $("audio-status");
  node.textContent = message;
  node.className = `field-note ${type}`.trim();
}

function renderLanguageOptions() {
  $("language-select").innerHTML = LANGUAGE_OPTIONS.map(item =>
    `<option value="${item.code}">${item.label} · ${item.code}</option>`
  ).join("");
}

function applyModelRules({ notify = false } = {}) {
  const lite = selectedModel === "lite";
  Array.from($("language-select").options).forEach(option => {
    option.disabled = lite && !["zh-CHS", "en"].includes(option.value);
  });
  if (lite && !["zh-CHS", "en"].includes(selectedLanguage)) {
    selectedLanguage = "zh-CHS";
    $("language-select").value = selectedLanguage;
    localStorage.setItem(STORAGE_KEYS.language, selectedLanguage);
    if (notify) showMessage("lite 模型只支持中文和英文，已切换为中文", "success");
  }
  $("model-hint").textContent = lite
    ? "lite：速度更快，仅支持中文和英文。"
    : "pro：质量更好，支持 14 种语言；中英文还支持情绪参考能力。";
}

function updateRange(id) {
  $(`${id}-value`).textContent = `${Number($(id).value).toFixed(1)}×`;
}

function updateCharacterCount() {
  $("char-count").textContent = $("composeText").value.length;
}

function setProgressStage(stage, message, progress = 0) {
  $("progress-card").classList.remove("hidden");
  const failed = stage === "failed";
  const currentIndex = PROGRESS_ORDER.indexOf(stage);
  document.querySelectorAll("#progress-steps li").forEach((node, index) => {
    node.classList.toggle("done", !failed && currentIndex >= 0 && index < currentIndex);
    node.classList.toggle("active", !failed && index === currentIndex);
    node.classList.toggle("failed", failed && index === Math.max(0, currentIndex));
  });
  if (!failed) lastProgress = progress;
  const safeProgress = Math.max(0, Math.min(100, Number(failed ? lastProgress : progress) || 0));
  $("progress-percent").textContent = `${safeProgress}%`;
  $("progress-bar").style.width = `${safeProgress}%`;
  $("progress-message").textContent = message || "正在处理…";
}

const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

async function uploadReferenceAudio({ appKey, appSecret, model }) {
  const audioInfo = await readWavInfo(audioFile);
  const sign = await signedPayload(appKey, appSecret, {
    name: `Voice_${Date.now()}`,
    model,
    sampleRate: String(audioInfo.sampleRate),
    channel: "1",
  });
  const formData = new FormData();
  Object.entries(sign).forEach(([key, value]) => formData.append(key, value));
  formData.append("audioFile", audioFile, audioFile.name);
  const payload = await requestJson("/tts_gateway/v2/upload", { method: "POST", body: formData }, "上传参考音频", 60000);
  if (String(payload.code) !== "0") {
    throw apiError(payload, "参考音频上传");
  }
  const voiceId = String((payload.data || {}).voiceId || "").trim();
  if (!voiceId) throw new Error("有道接口没有返回 voiceId");
  return voiceId;
}

async function submitAsyncSynthesis({ appKey, appSecret, voiceId, text, model, language }) {
  if (model === "lite" && !["zh-CHS", "en"].includes(language)) {
    throw new Error("lite 模型只支持中文和英文");
  }
  const payload = await signedPayload(appKey, appSecret, {
    voiceId,
    format: $("format").value,
    sampleRate: "16000",
    channel: "1",
    speed: $("speed").value,
    volume: $("volume").value,
    qList: [{ q: text }],
  });
  const response = await requestJson(
    "/tts_gateway/v2/synthesis_async",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    "提交合成任务",
    30000,
  );
  if (String(response.code) !== "0") {
    throw apiError(response, "合成任务提交");
  }
  const taskId = String((response.data || {}).taskId || "").trim();
  if (!taskId) throw new Error("有道接口没有返回 taskId");
  return taskId;
}

async function fetchTaskProgress({ appKey, appSecret, taskId }) {
  const payload = await signedPayload(appKey, appSecret, { taskId });
  return requestJson(
    "/tts_gateway/v2/get_progress",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    "查询合成进度",
    30000,
  );
}

async function fetchTaskResults({ appKey, appSecret, taskId }) {
  const payload = await signedPayload(appKey, appSecret, { taskId });
  const response = await requestJson(
    "/tts_gateway/v2/get_result",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    "获取合成结果",
    30000,
  );
  if (String(response.code) !== "0") {
    throw apiError(response, "获取合成结果");
  }
  return Array.isArray(response.data) ? response.data.filter(item => item && /^https:\/\//i.test(item.mediaUrl || "")) : [];
}

function apiError(payload, label) {
  const hints = {
    "108": "AppID 无效，请检查应用信息",
    "110": "请在控制台同时开通大模型声音复刻和大模型语音合成",
    "202": "签名校验失败，请检查 AppID 与 App Secret",
    "203": "当前代理出口 IP 不在应用白名单中",
    "206": "时间戳无效，请校准电脑时间",
    "207": "请求重复，请重新查询",
    "401": "账户余额不足，请充值",
    "900000": "音色不存在，请重新上传参考音频",
    "900003": "任务不存在，请重新提交",
  };
  const error = new Error(`${label}失败（${payload.code}）：${hints[String(payload.code)] || payload.message || payload.error || "未知错误"}`);
  error.restartTask = ["900000", "900003"].includes(String(payload.code));
  return error;
}

async function pollYoudaoTask({ appKey, appSecret, taskId, voiceId }) {
  const deadline = Date.now() + 6 * 60 * 1000;
  let consecutiveErrors = 0;
  let emptyResults = 0;
  for (let attempt = 0; attempt < 120 && Date.now() < deadline; attempt += 1) {
    await wait(attempt === 0 ? 1200 : 3000);
    let payload;
    try {
      payload = await fetchTaskProgress({ appKey, appSecret, taskId });
    } catch (error) {
      if (++consecutiveErrors >= 3) throw error;
      setProgressStage("synthesizing", "网络暂时中断，正在重新查询已提交的任务…", 75);
      continue;
    }
    if (String(payload.code) !== "0") {
      if (["207", "303", "411", "412", "900001", "901000"].includes(String(payload.code)) && ++consecutiveErrors < 3) {
        setProgressStage("synthesizing", "服务暂忙，正在重新查询…", 75);
        await wait(3000);
        continue;
      }
      throw apiError(payload, "查询合成进度");
    }
    consecutiveErrors = 0;
    const data = payload.data || {};
    const status = String(data.status || "").toUpperCase();
    if (!["PROCESSING", "SUCCESS", "PARTIAL_SUCCESS", "FAIL", "FAILED", "ERROR"].includes(status)) {
      throw new Error(`接口返回未知任务状态：${status || "空"}，请稍后继续获取结果`);
    }
    const total = Number(data.totalCount || 1);
    const success = Number(data.successCount || 0);
    setProgressStage("synthesizing", `正在合成：已完成 ${success}/${total}，请稍候…`,
      Math.max(70, Math.min(95, Math.round(70 + success / Math.max(1, total) * 25))));
    if (status === "SUCCESS" || status === "PARTIAL_SUCCESS") {
      let results;
      try {
        results = await fetchTaskResults({ appKey, appSecret, taskId });
      } catch (error) {
        if (++emptyResults >= 3) throw error;
        continue;
      }
      if (!results.length) {
        if (++emptyResults >= 3) throw new Error("任务已处理，但尚未返回可播放的音频结果，请继续获取结果");
        setProgressStage("synthesizing", "正在等待音频结果就绪…", 95);
        continue;
      }
      renderResults({ voiceId, taskId, results });
      return;
    }
    if (["FAIL", "FAILED", "ERROR"].includes(status)) {
      throw Object.assign(new Error(data.message || "有道合成任务失败，请重新生成"), { restartTask: true });
    }
  }
  throw new Error("本轮等待已结束，任务仍保留，请点击继续获取结果，无需再次克隆或提交");
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value || "");
  return node.innerHTML;
}

async function copyText(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    const old = button.textContent;
    button.textContent = "已复制";
    window.setTimeout(() => { button.textContent = old; }, 1200);
  } catch {
    showMessage("复制失败，请手动选择复制");
  }
}

function renderResults(result) {
  const voiceId = String(result.voiceId || "");
  const taskId = String(result.taskId || "");
  $("result-meta").innerHTML = [
    ["voiceId", voiceId],
    ["taskId", taskId],
  ].filter(([, value]) => value).map(([label, value]) =>
    `<div class="meta-row"><span>${label}</span><code title="${escapeHtml(value)}">${escapeHtml(value)}</code><button type="button" class="copy-button" data-copy="${escapeHtml(value)}">复制</button></div>`
  ).join("");
  $("result-meta").querySelectorAll("[data-copy]").forEach(button => {
    button.addEventListener("click", () => copyText(button.dataset.copy, button));
  });

  const results = Array.isArray(result.results) ? result.results : [];
  $("results-list").innerHTML = results.length ? results.map((item, index) => {
    const mediaUrl = TRANSPORT.buildMediaUrl({ backendBase: API_BASE, mediaUrl: item.mediaUrl, filename: item.filename || `generated-audio.${$("format").value}` });
    const downloadUrl = `${mediaUrl}${mediaUrl.includes("?") ? "&" : "?"}download=1`;
    return `<article class="result-item"><div class="result-kicker"><span>AUDIO ${String(index + 1).padStart(2, "0")}</span><span>● READY</span></div><p>${escapeHtml(synthesisText)}</p><audio controls preload="metadata" src="${escapeHtml(mediaUrl)}"></audio><a class="download-button" href="${escapeHtml(downloadUrl)}" download>下载 ${escapeHtml(item.filename || "生成音频")}</a></article>`;
  }).join("") : '<div class="field-note">接口未返回可播放的音频。</div>';
  $("results-card").classList.remove("hidden");
  $("results-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function startSynthesis() {
  if (isRunning) return;
  const appKey = $("appKey").value.trim();
  const appSecret = $("appSecret").value.trim();
  const text = $("composeText").value.trim();
  if (!appKey || !appSecret) return showMessage("请先填写 AppID 和 App Secret");
  if (!audioFile) return showMessage("请先上传一段可解码的参考音频");
  if (!text) return showMessage("请输入要合成的文本");

  isRunning = true;
  const fingerprint = JSON.stringify([API_BASE, appKey, text, selectedModel, selectedLanguage, $("format").value, $("speed").value, $("volume").value]);
  if (!pendingTask || pendingTask.file !== audioFile || pendingTask.fingerprint !== fingerprint) pendingTask = { file: audioFile, fingerprint };
  synthesisText = text;
  $("results-card").classList.add("hidden");
  $("btn-synthesize").disabled = true;
  $("btn-synthesize").querySelector("span:nth-child(2)").textContent = "正在生成…";
  setProgressStage("received", "正在通过前端体验链路提交请求…", 8);
  try {
    if (!pendingTask.voiceId && !pendingTask.taskId) {
      await checkConnection();
    }
    setProgressStage("cloning", "正在上传参考音频并获取 voiceId…", 25);
    const voiceId = pendingTask.voiceId || await uploadReferenceAudio({ appKey, appSecret, model: selectedModel });
    pendingTask.voiceId = voiceId;
    setProgressStage("clone_complete", "参考音频已上传，正在提交合成文本…", 55);
    const taskId = pendingTask.taskId || await submitAsyncSynthesis({
      appKey,
      appSecret,
      voiceId,
      text,
      model: selectedModel,
      language: selectedLanguage,
    });
    pendingTask.taskId = taskId;
    setProgressStage("synthesizing", "合成任务已提交，正在等待有道返回音频…", 70);
    await pollYoudaoTask({ appKey, appSecret, taskId, voiceId });
    pendingTask = null;
    setProgressStage("completed", "合成完成，可以试听或下载。", 100);
    showMessage("声音生成完成，可以试听或下载。", "success");
  } catch (error) {
    if (error.restartTask) pendingTask = null;
    setProgressStage("failed", error.message, 100);
    showMessage(error.message);
  } finally {
    isRunning = false;
    $("btn-synthesize").disabled = false;
    $("btn-synthesize").querySelector("span:nth-child(2)").textContent = pendingTask?.taskId ? "继续获取结果" : "开始生成声音";
  }
}

function resetForm() {
  if (isRunning) return showMessage("请等待当前请求结束后再重置");
  pendingTask = null;
  $("btn-synthesize").querySelector("span:nth-child(2)").textContent = "开始生成声音";
  clearAudio();
  $("appKey").value = "";
  $("appSecret").value = "";
  $("composeText").value = "";
  $("speed").value = "1";
  $("volume").value = "1";
  updateRange("speed");
  updateRange("volume");
  updateCharacterCount();
  $("progress-card").classList.add("hidden");
  $("results-card").classList.add("hidden");
  $("message-region").replaceChildren();
}

async function checkConnection() {
  const node = $("connection-status");
  node.textContent = "正在检测语音服务…";
  node.className = "field-note";
  try {
    const status = await requestJson("/api/status", {}, "连接语音服务", 10000);
    if (status.ok !== true) throw new Error("服务响应不兼容，请确认部署的是本项目后端");
    node.textContent = "连接正常，可以开始生成。";
    node.className = "field-note success";
    return status;
  } catch (error) {
    node.textContent = error.message;
    node.className = "field-note error";
    throw error;
  }
}

async function applyBackend(value) {
  if (isRunning) return showMessage("请等待当前任务结束后更换服务");
  const previous = API_BASE;
  try {
    API_BASE = TRANSPORT.validateBackendBase(value);
    await checkConnection();
    pendingTask = null;
    $("backend-url").value = API_BASE;
    $("btn-synthesize").querySelector("span:nth-child(2)").textContent = "开始生成声音";
    showMessage("已切换语音服务，仅在本次页面生效", "success");
  } catch (error) {
    API_BASE = previous;
    $("connection-status").textContent = `${error.message} 当前服务仍为 ${previous}`;
    showMessage(error.message);
  }
}

function initApp() {
  $("backend-url").value = API_BASE;
  $("test-connection").addEventListener("click", () => checkConnection().catch(() => {}));
  $("apply-backend").addEventListener("click", () => applyBackend($("backend-url").value));
  $("restore-backend").addEventListener("click", () => applyBackend(TRANSPORT.resolveBackendBase({
    locationProtocol: window.location.protocol, locationHostname: window.location.hostname, locationOrigin: window.location.origin,
  })));

  renderLanguageOptions();
  if (!LANGUAGE_OPTIONS.some(item => item.code === selectedLanguage)) selectedLanguage = "zh-CHS";
  if (!["lite", "pro"].includes(selectedModel)) selectedModel = "pro";
  $("language-select").value = selectedLanguage;
  $("model-select").value = selectedModel;
  applyModelRules();
  updateRange("speed");
  updateRange("volume");
  updateCharacterCount();

  $("toggle-secret").addEventListener("click", () => {
    const input = $("appSecret");
    input.type = input.type === "password" ? "text" : "password";
    $("toggle-secret").textContent = input.type === "password" ? "显示" : "隐藏";
  });
  $("choose-audio").addEventListener("click", event => { event.stopPropagation(); $("audioFile").click(); });
  $("audio-dropzone").addEventListener("click", () => $("audioFile").click());
  $("audio-dropzone").addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $("audioFile").click(); }
  });
  ["dragenter", "dragover"].forEach(type => $("audio-dropzone").addEventListener(type, event => { event.preventDefault(); $("audio-dropzone").classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(type => $("audio-dropzone").addEventListener(type, event => { event.preventDefault(); $("audio-dropzone").classList.remove("dragover"); }));
  $("audio-dropzone").addEventListener("drop", event => handleAudio(event.dataTransfer.files[0]));
  $("audioFile").addEventListener("change", event => handleAudio(event.target.files[0]));
  $("clear-audio").addEventListener("click", clearAudio);
  $("composeText").addEventListener("input", updateCharacterCount);
  $("sample-text").addEventListener("click", () => { $("composeText").value = languageOption(selectedLanguage).sample; updateCharacterCount(); });
  $("model-select").addEventListener("change", event => {
    selectedModel = event.target.value;
    localStorage.setItem(STORAGE_KEYS.model, selectedModel);
    applyModelRules({ notify: true });
  });
  $("language-select").addEventListener("change", event => {
    selectedLanguage = event.target.value;
    localStorage.setItem(STORAGE_KEYS.language, selectedLanguage);
  });
  $("speed").addEventListener("input", () => updateRange("speed"));
  $("volume").addEventListener("input", () => updateRange("volume"));
  $("btn-synthesize").addEventListener("click", startSynthesis);
  $("reset-form").addEventListener("click", resetForm);
}

initApp();
