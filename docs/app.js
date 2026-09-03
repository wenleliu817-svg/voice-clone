const STORAGE_KEYS = {
  language: "voice_clone_language",
  model: "voice_clone_model",
};

const LANGUAGE_OPTIONS = [
  { code: "zh-CHS", label: "中文", sample: "大家好，欢迎使用有道智云大模型声音复刻。" },
  { code: "en", label: "英文", sample: "Hello everyone, welcome to Youdao Zhiyun voice cloning." },
  { code: "de", label: "德语", sample: "Willkommen bei Youdao Zhiyun." },
  { code: "fr", label: "法语", sample: "Bienvenue chez Youdao Zhiyun." },
  { code: "ja", label: "日语", sample: "有道智云の大規模モデル音声合成へようこそ。" },
  { code: "ko", label: "韩语", sample: "유다오 즈윈 대형 모델 음성 합성에 오신 것을 환영합니다." },
  { code: "id", label: "印尼语", sample: "Selamat datang di Youdao Zhiyun." },
  { code: "vi", label: "越南语", sample: "Chào mừng bạn đến với Youdao Zhiyun." },
  { code: "th", label: "泰语", sample: "ยินดีต้อนรับสู่ Youdao Zhiyun" },
  { code: "ru", label: "俄语", sample: "Добро пожаловать в Youdao Zhiyun." },
  { code: "it", label: "意大利语", sample: "Benvenuti su Youdao Zhiyun." },
  { code: "pt", label: "葡萄牙语", sample: "Bem-vindo ao Youdao Zhiyun." },
  { code: "es", label: "西班牙语", sample: "Bienvenido a Youdao Zhiyun." },
  { code: "ms", label: "马来语", sample: "Selamat datang ke Youdao Zhiyun." },
];

const MODEL_OPTIONS = {
  lite: { label: "lite", hint: "速度更快，支持中文/英文" },
  pro: { label: "pro", hint: "质量更好，支持更多语种" },
};

const LANGUAGE_LOOKUP = new Map();
LANGUAGE_OPTIONS.forEach(option => {
  [option.code, option.label].forEach(value => {
    LANGUAGE_LOOKUP.set(String(value).toLowerCase(), option.code);
  });
});

const TRANSPORT = window.YoudaoVoiceCloneTransport;
if (!TRANSPORT) throw new Error("YoudaoVoiceCloneTransport 未加载");

function getDefaultApiBase() {
  return TRANSPORT.resolveBackendBase({
    queryBase: new URLSearchParams(window.location.search).get("apiBase"),
    locationProtocol: window.location.protocol,
    locationHostname: window.location.hostname,
    locationOrigin: window.location.origin,
  });
}

function getLanguageOption(code) {
  return LANGUAGE_OPTIONS.find(option => option.code === code) || LANGUAGE_OPTIONS[0];
}

function getLanguageLabel(code) {
  return getLanguageOption(code).label;
}

function normalizeLanguage(value, fallback = "zh-CHS") {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return fallback;
  if (LANGUAGE_LOOKUP.has(key)) return LANGUAGE_LOOKUP.get(key);
  const matched = LANGUAGE_OPTIONS.find(option =>
    option.code.toLowerCase().includes(key) ||
    option.label.toLowerCase().includes(key)
  );
  return matched ? matched.code : fallback;
}

function isLiteCompatible(code) {
  return code === "zh-CHS" || code === "en";
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function requestJson(path, options = {}, label = "请求") {
  const url = TRANSPORT.buildRequestUrl({
    backendBase: API_BASE,
    path,
  });
  const response = await fetch(url, options);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const snippet = raw.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`${label} 返回了 HTML 内容，通常是后端地址不对。当前地址：${API_BASE}。响应片段：${snippet}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    const snippet = raw.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`${label} 返回了无法解析的 JSON。当前地址：${API_BASE}。响应片段：${snippet}`);
  }
}

let API_BASE = getDefaultApiBase();
let selectedLanguage = normalizeLanguage(localStorage.getItem(STORAGE_KEYS.language) || "zh-CHS");
let selectedModel = MODEL_OPTIONS[localStorage.getItem(STORAGE_KEYS.model)] ? localStorage.getItem(STORAGE_KEYS.model) : "pro";
let voiceId = null;
let synthesisItems = [];
let audioFile = null;
let currentTaskId = null;

const $ = id => document.getElementById(id);

function showMsg(html, type = "error") {
  const container = document.querySelector(".container");
  if (!container) return;
  const msg = document.createElement("div");
  msg.className = "msg " + (type === "success" ? "success" : "error");
  msg.innerHTML = html;
  const anchor = container.children[1] || container.children[0] || null;
  container.insertBefore(msg, anchor);
  setTimeout(() => msg.remove(), 4500);
}

function hide(el) {
  if (el) el.classList.add("hidden");
}

function show(el) {
  if (el) el.classList.remove("hidden");
}

function toggleSecret() {
  const input = $("appSecret");
  const icon = $("eye-icon");
  if (!input || !icon) return;
  input.type = input.type === "password" ? "text" : "password";
  icon.className = input.type === "password" ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
}

function checkCredentials() {
  const appKey = $("appKey").value.trim();
  const appSecret = $("appSecret").value.trim();
  if (!appKey || !appSecret) {
    showMsg("请先填写 App Key 和 App Secret");
    return null;
  }
  return { appKey, appSecret };
}

function updateLanguageUI() {
  const option = getLanguageOption(selectedLanguage);
  const hint = $("language-hint");
  if (hint) {
    hint.textContent = selectedModel === "lite"
      ? `lite 仅支持中文/英文；当前选择 ${option.label}。`
      : `当前选择 ${option.label}。pro 支持更多语种。`;
  }
  const result = $("voice-id-display");
  if (result && voiceId) {
    result.textContent = `Voice ID: ${voiceId} | 模型: ${MODEL_OPTIONS[selectedModel].label} | 语种: ${option.label}`;
  }
  updateManualPlaceholders();
}

function updateModelUI() {
  const hint = $("model-hint");
  if (hint) hint.textContent = MODEL_OPTIONS[selectedModel].hint;
}

function applyCompatibilityRules() {
  if (selectedModel === "lite" && !isLiteCompatible(selectedLanguage)) {
    selectedModel = "pro";
    localStorage.setItem(STORAGE_KEYS.model, selectedModel);
    const modelSelect = $("model-select");
    if (modelSelect) modelSelect.value = selectedModel;
    showMsg("lite 仅支持中文/英文，已自动切换到 pro");
  }
}

function setLanguage(value) {
  selectedLanguage = normalizeLanguage(value);
  localStorage.setItem(STORAGE_KEYS.language, selectedLanguage);
  const select = $("language-select");
  if (select) select.value = selectedLanguage;
  applyCompatibilityRules();
  updateLanguageUI();
}

function setModel(value) {
  selectedModel = MODEL_OPTIONS[value] ? value : "pro";
  localStorage.setItem(STORAGE_KEYS.model, selectedModel);
  const select = $("model-select");
  if (select) select.value = selectedModel;
  applyCompatibilityRules();
  updateLanguageUI();
  updateModelUI();
}

function renderLanguageOptions() {
  const select = $("language-select");
  if (!select) return;
  select.innerHTML = LANGUAGE_OPTIONS.map(option => (
    `<option value="${option.code}">${option.label} (${option.code})</option>`
  )).join("");
}

function updateManualPlaceholders() {
  const placeholder = `输入要合成的${getLanguageLabel(selectedLanguage)}文本`;
  document.querySelectorAll(".input-text").forEach(input => {
    if (!input.value.trim()) input.placeholder = placeholder;
  });
}

function handleAudio(file) {
  if (!file || !file.name.toLowerCase().endsWith(".wav")) {
    showMsg("仅支持 .wav 格式音频");
    return;
  }
  audioFile = file;
  voiceId = null;
  $("audio-filename").textContent = file.name;
  hide($("audio-dropzone"));
  show($("audio-preview"));
  setAudioStatus("参考音频已选择，可直接点击一键生成。", "success");
}

function clearAudio() {
  audioFile = null;
  voiceId = null;
  $("audioFile").value = "";
  show($("audio-dropzone"));
  hide($("audio-preview"));
  setAudioStatus("");
}

function setupDrop(id, types, cb) {
  const zone = $(id);
  if (!zone) return;
  zone.addEventListener("dragover", event => {
    event.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", event => {
    event.preventDefault();
    zone.classList.remove("dragover");
    const file = event.dataTransfer.files[0];
    if (file && types.some(type => file.name.toLowerCase().endsWith(type) || file.type.includes(type))) {
      cb(file);
    }
  });
}

function setAudioStatus(message, type = "info") {
  const status = $("audio-status");
  if (!status) return;
  status.textContent = message || "";
  status.className = "field-hint" + (type === "error" ? " error" : type === "success" ? " success" : "");
}

async function handleExcel(file) {
  void file;
}

async function startSynthesis() {
  const formData = new FormData();
  const cred = checkCredentials();
  if (!cred) return;
  if (!audioFile) {
    showMsg("请先上传参考音频");
    return;
  }

  const textInput = $("composeText");
  const text = textInput ? textInput.value.trim() : "";
  if (!text) {
    showMsg("请先输入要合成的文本");
    return;
  }

  if (selectedModel === "lite" && !isLiteCompatible(selectedLanguage)) {
    showMsg("lite 仅支持中文/英文，请切换到 pro");
    return;
  }

  const items = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  synthesisItems = items.map(line => ({
    text: line,
    emotion: "",
    language: selectedLanguage,
  }));
  show($("overlay"));
  const synthBtn = $("btn-synthesize");
  if (synthBtn) synthBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("appKey", cred.appKey);
    formData.append("appSecret", cred.appSecret);
    formData.append("text", text);
    formData.append("language", selectedLanguage);
    formData.append("model", selectedModel);
    formData.append("format", $("format").value);
    formData.append("speed", String($("speed").value));
    formData.append("volume", String($("volume").value));
    formData.append("audio", audioFile, audioFile.name);
    const payload = await requestJson("/api/compose", {
      method: "POST",
      body: formData,
    }, "一键生成");
    if (String(payload.code) !== "0") {
      showMsg("生成失败: " + (payload.message || JSON.stringify(payload)));
      return;
    }
    const results = Array.isArray(payload.data?.results) ? payload.data.results : [];
    renderResults(results);
    show($("results-card"));
    showMsg("生成成功！", "success");
  } catch (error) {
    showMsg("生成出错: " + error.message);
  } finally {
    hide($("overlay"));
    if (synthBtn) synthBtn.disabled = false;
  }
}

function renderResults(data) {
  const list = $("results-list");
  list.innerHTML = "";
  const items = Array.isArray(data) ? data : [];
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">没有返回可播放的结果</div>';
    return;
  }
  items.forEach((item, index) => {
    const displayIndex = typeof item.qIndex === "number" ? item.qIndex + 1 : index + 1;
    const itemData = synthesisItems[displayIndex - 1] || { text: "", language: selectedLanguage };
    const url = item.mediaUrl || "";
    const proxiedUrl = TRANSPORT.buildMediaUrl({
      backendBase: API_BASE,
      mediaUrl: url,
      filename: `audio_${displayIndex}.wav`,
    });
    const row = document.createElement("div");
    row.className = "result-item";
    row.innerHTML = `
      <span class="idx">#${displayIndex}</span>
      <span class="text" title="${escapeHtml(itemData.text)}">${escapeHtml(itemData.text)}</span>
      <span class="lang">${escapeHtml(getLanguageLabel(itemData.language || selectedLanguage))}</span>
      ${url ? `<span class="status ok"><i class="fa-solid fa-check"></i></span>` : `<span class="status error">失败</span>`}
      ${url ? `<audio controls src="${proxiedUrl}"></audio>` : ""}
      ${url ? `<a href="${proxiedUrl}" target="_blank" download><i class="fa-solid fa-download"></i> 下载</a>` : ""}
    `;
    list.appendChild(row);
  });
}

function initApp() {
  renderLanguageOptions();

  const languageSelect = $("language-select");
  if (languageSelect) {
    languageSelect.value = selectedLanguage;
    languageSelect.addEventListener("change", event => setLanguage(event.target.value));
  }

  const modelSelect = $("model-select");
  if (modelSelect) {
    modelSelect.value = selectedModel;
    modelSelect.addEventListener("change", event => setModel(event.target.value));
  }

  const audioInput = $("audioFile");
  if (audioInput) audioInput.addEventListener("change", event => handleAudio(event.target.files[0]));

  setupDrop("audio-dropzone", [".wav", "audio/wav"], file => handleAudio(file));
  updateModelUI();
  updateLanguageUI();
  setAudioStatus("");
}

initApp();
