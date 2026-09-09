const STORAGE_KEYS = { language: "voice_clone_language", model: "voice_clone_model" };
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
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
let referenceAudioUrl = "";
let synthesisText = "";

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

async function requestJson(path, options = {}, label = "请求") {
  const url = TRANSPORT.buildRequestUrl({ backendBase: API_BASE, path });
  const response = await fetch(url, options);
  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`${label}返回了异常内容，请确认服务已正常部署`);
  }
  if (!response.ok) throw new Error(payload.error || payload.message || `${label}失败（HTTP ${response.status}）`);
  return payload;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function readWavInfo(file) {
  const buffer = await file.slice(0, 256).arrayBuffer();
  const view = new DataView(buffer);
  const text = (offset, length) => Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");
  if (buffer.byteLength < 44 || text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") throw new Error("文件不是有效的 WAV 音频");
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const chunk = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (chunk === "fmt " && offset + 16 <= buffer.byteLength) {
      return { channels: view.getUint16(offset + 10, true), sampleRate: view.getUint32(offset + 12, true) };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("无法读取 WAV 音频参数");
}

async function handleAudio(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".wav") && file.type !== "audio/wav") {
    showMessage("参考音频必须是 WAV 格式");
    return;
  }
  if (file.size > MAX_AUDIO_BYTES) {
    showMessage("参考音频不能超过 25MB");
    return;
  }
  try {
    const info = await readWavInfo(file);
    if (info.channels !== 1) throw new Error("参考音频必须是单声道，请先转换后再上传");
    if (![16000, 24000].includes(info.sampleRate)) throw new Error("参考音频采样率必须是 16kHz 或 24kHz");
    clearAudio();
    audioFile = file;
    referenceAudioUrl = URL.createObjectURL(file);
    $("audio-filename").textContent = file.name;
    $("audio-details").textContent = `${formatBytes(file.size)} · 单声道 · ${info.sampleRate / 1000}kHz`;
    $("reference-player").src = referenceAudioUrl;
    $("audio-dropzone").classList.add("hidden");
    $("audio-preview").classList.remove("hidden");
    setAudioStatus("音频参数符合官方接口要求，可以开始复刻。", "success");
  } catch (error) {
    showMessage(error.message);
    setAudioStatus(error.message, "error");
  }
}

function clearAudio() {
  audioFile = null;
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
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  $("progress-percent").textContent = `${safeProgress}%`;
  $("progress-bar").style.width = `${safeProgress}%`;
  $("progress-message").textContent = message || "正在处理…";
}

const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

async function pollComposeJob(jobId) {
  for (let attempt = 0; attempt < 900; attempt += 1) {
    const payload = await requestJson(`/api/compose/status/${encodeURIComponent(jobId)}`, {}, "查询合成进度");
    const job = payload.data || {};
    setProgressStage(job.stage, job.message, job.progress);
    if (job.stage === "completed") {
      renderResults(job.result || {});
      return;
    }
    if (job.stage === "failed") throw new Error(job.error || job.message || "合成失败");
    await wait(2000);
  }
  throw new Error("任务等待超过 30 分钟，请稍后重试");
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
    const mediaUrl = TRANSPORT.buildMediaUrl({ backendBase: API_BASE, mediaUrl: item.mediaUrl, filename: item.filename });
    const downloadUrl = `${mediaUrl}${mediaUrl.includes("?") ? "&" : "?"}download=1`;
    return `<article class="result-item"><div class="result-kicker"><span>AUDIO ${String(index + 1).padStart(2, "0")}</span><span>● READY</span></div><p>${escapeHtml(synthesisText)}</p><audio controls preload="metadata" src="${escapeHtml(mediaUrl)}"></audio><a class="download-button" href="${escapeHtml(downloadUrl)}" download>下载 ${escapeHtml(item.filename || "生成音频")}</a></article>`;
  }).join("") : '<div class="field-note">接口未返回可播放的音频。</div>';
  $("results-card").classList.remove("hidden");
  $("results-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function startSynthesis() {
  const appKey = $("appKey").value.trim();
  const appSecret = $("appSecret").value.trim();
  const text = $("composeText").value.trim();
  if (!appKey || !appSecret) return showMessage("请先填写 AppID 和 App Secret");
  if (!audioFile) return showMessage("请先上传符合要求的 WAV 参考音频");
  if (!text) return showMessage("请输入要合成的文本");

  synthesisText = text;
  $("results-card").classList.add("hidden");
  $("btn-synthesize").disabled = true;
  $("btn-synthesize").querySelector("span:nth-child(2)").textContent = "正在生成…";
  setProgressStage("received", "正在安全提交本次合成任务…", 5);
  try {
    const formData = new FormData();
    formData.append("appKey", appKey);
    formData.append("appSecret", appSecret);
    formData.append("text", text);
    formData.append("language", selectedLanguage);
    formData.append("model", selectedModel);
    formData.append("format", $("format").value);
    formData.append("speed", $("speed").value);
    formData.append("volume", $("volume").value);
    formData.append("audio", audioFile, audioFile.name);
    const payload = await requestJson("/api/compose/start", { method: "POST", body: formData }, "提交合成任务");
    const jobId = payload.data?.jobId;
    if (String(payload.code) !== "0" || !jobId) throw new Error(payload.message || "服务未返回任务编号");
    await pollComposeJob(jobId);
    showMessage("声音生成完成，可以试听或下载。", "success");
  } catch (error) {
    setProgressStage("failed", error.message, 100);
    showMessage(error.message);
  } finally {
    $("btn-synthesize").disabled = false;
    $("btn-synthesize").querySelector("span:nth-child(2)").textContent = "开始生成声音";
  }
}

function resetForm() {
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

function initApp() {
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
