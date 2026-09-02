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
  hide($("voice-id-display"));
}

function clearAudio() {
  audioFile = null;
  voiceId = null;
  $("audioFile").value = "";
  show($("audio-dropzone"));
  hide($("audio-preview"));
  hide($("voice-id-display"));
}

function setupDrop(id, types, cb) {
  const zone = $(id);
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

function getFileItemsFromExcel(fileRows) {
  if (!fileRows.length) return [];
  const headers = fileRows[0].map(header => String(header ?? "").trim());
  let textCol = headers.findIndex(header => header.includes("文本") || header.toLowerCase().includes("text"));
  let emotionCol = headers.findIndex(header => header.includes("情绪") || header.toLowerCase().includes("emotion"));
  let languageCol = headers.findIndex(header => header.includes("语种") || header.includes("语言") || header.toLowerCase().includes("language") || header.toLowerCase().includes("lang"));
  if (textCol === -1) textCol = 0;
  const items = [];
  for (let i = 1; i < fileRows.length; i++) {
    const row = fileRows[i] || [];
    const text = String(row[textCol] || "").trim();
    if (!text) continue;
    items.push({
      text,
      emotion: emotionCol === -1 ? "" : String(row[emotionCol] || "").trim(),
      language: normalizeLanguage(languageCol === -1 ? selectedLanguage : row[languageCol]),
    });
  }
  return items;
}

function renderExcelPreview(items) {
  const body = $("excel-tbody");
  body.innerHTML = "";
  items.forEach((item, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="col-text">${escapeHtml(item.text)}</td>
      <td>${escapeHtml(getLanguageLabel(item.language || selectedLanguage))}</td>
      <td>${escapeHtml(item.emotion || "")}</td>
    `;
    body.appendChild(row);
  });
  show($("excel-preview"));
}

function downloadTemplate() {
  const sample = getLanguageOption(selectedLanguage).sample;
  const rows = [
    ["文本", "语种", "情绪"],
    [sample, getLanguageLabel(selectedLanguage), ""],
  ];
  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: "voice_clone_template.csv",
  });
  link.click();
}

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(button => button.classList.remove("active"));
  $("tab-" + name).classList.add("active");
  hide($("panel-excel"));
  hide($("panel-manual"));
  show($("panel-" + name));
  updateManualPlaceholders();
}

function addManualRow() {
  const row = document.createElement("div");
  row.className = "manual-row";
  row.innerHTML = `
    <input type="text" class="input-text" placeholder="输入要合成的${getLanguageLabel(selectedLanguage)}文本">
    <select class="input-emotion">
      <option value="">自然</option>
      <option value="开心">开心</option>
      <option value="悲伤">悲伤</option>
      <option value="愤怒">愤怒</option>
      <option value="恐惧">恐惧</option>
      <option value="厌恶">厌恶</option>
      <option value="惊讶">惊讶</option>
    </select>
  `;
  $("manual-rows").appendChild(row);
}

function getManualItems() {
  const rows = document.querySelectorAll("#manual-rows .manual-row");
  const items = [];
  rows.forEach(row => {
    const text = row.querySelector(".input-text").value.trim();
    const emotion = row.querySelector(".input-emotion").value;
    if (text) {
      items.push({
        text,
        emotion,
        language: selectedLanguage,
      });
    }
  });
  return items;
}

async function cloneVoice() {
  const cred = checkCredentials();
  if (!cred) return;
  if (!audioFile) {
    showMsg("请先上传音频文件");
    return;
  }
  $("btn-clone").disabled = true;
  const formData = new FormData();
  formData.append("appKey", cred.appKey);
  formData.append("appSecret", cred.appSecret);
  formData.append("voiceName", "Clone_" + Date.now());
  formData.append("model", selectedModel);
  formData.append("language", selectedLanguage);
  formData.append("audio", audioFile, audioFile.name);
  try {
    const payload = await requestJson("/api/clone", { method: "POST", body: formData }, "克隆请求");
    if (String(payload.code) !== "0") {
      showMsg("克隆失败: " + (payload.message || JSON.stringify(payload)));
      return;
    }
    voiceId = payload.data.voiceId;
    $("voice-id-display").textContent = `Voice ID: ${voiceId} | 模型: ${MODEL_OPTIONS[selectedModel].label} | 语种: ${getLanguageLabel(selectedLanguage)}`;
    show($("voice-id-display"));
    showMsg("音色克隆成功！", "success");
  } catch (error) {
    showMsg("克隆请求出错: " + error.message);
  }
  $("btn-clone").disabled = false;
}

async function handleExcel(file) {
  if (!file) return;
  if (typeof XLSX === "undefined") {
    showMsg("Excel 解析库加载中，请稍候...");
    await new Promise(resolve => setTimeout(resolve, 800));
    if (typeof XLSX === "undefined") {
      showMsg("无法解析 Excel，请刷新页面试试");
      return;
    }
  }
  const workbook = XLSX.read(await file.arrayBuffer());
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const items = getFileItemsFromExcel(rows);
  if (!items.length) {
    showMsg("Excel 为空或缺少有效文本");
    return;
  }
  synthesisItems = items;
  renderExcelPreview(items);
  show($("panel-excel"));
  showMsg(`解析成功，共 ${items.length} 条`, "success");
}

async function startSynthesis() {
  const cred = checkCredentials();
  if (!cred) return;
  if (!voiceId) {
    showMsg("请先完成音色克隆");
    return;
  }

  const activeTab = $("tab-excel").classList.contains("active") ? "excel" : "manual";
  const items = activeTab === "excel" ? synthesisItems : getManualItems();
  if (!items.length) {
    showMsg("请先导入文本或手动输入");
    return;
  }

  const normalizedItems = items.map(item => ({
    ...item,
    language: normalizeLanguage(item.language || selectedLanguage),
  }));

  if (selectedModel === "lite") {
    const unsupported = normalizedItems.find(item => !isLiteCompatible(item.language));
    if (unsupported) {
      showMsg(`lite 仅支持中文/英文，${getLanguageLabel(unsupported.language)} 请切换到 pro`);
      return;
    }
  }

  synthesisItems = normalizedItems;
  show($("overlay"));
  currentTaskId = null;

  try {
    const payload = await requestJson("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appKey: cred.appKey,
        appSecret: cred.appSecret,
        voiceId,
        model: selectedModel,
        language: selectedLanguage,
        items: normalizedItems,
        format: $("format").value,
        speed: parseFloat($("speed").value),
        volume: parseFloat($("volume").value),
      }),
    }, "合成提交");
    if (String(payload.code) !== "0") {
      hide($("overlay"));
      showMsg("提交失败: " + (payload.message || JSON.stringify(payload)));
      return;
    }
    currentTaskId = payload.data.taskId;
    pollProgress(cred.appKey, cred.appSecret);
  } catch (error) {
    hide($("overlay"));
    showMsg("提交出错: " + error.message);
  }
}

async function pollProgress(appKey, appSecret) {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const payload = await requestJson(`/api/progress/${currentTaskId}?appKey=${encodeURIComponent(appKey)}&appSecret=${encodeURIComponent(appSecret)}`, {}, "进度查询");
      if (String(payload.code) !== "0") continue;
      const data = payload.data || {};
      const status = data.status || "UNKNOWN";
      const total = data.totalCount || 0;
      const success = data.successCount || 0;
      $("progress-status").textContent = status === "SUCCESS" ? "合成完成" : status;
      $("progress-count").textContent = `${success} / ${total}`;
      if (status === "SUCCESS" || status === "PARTIAL_SUCCESS") {
        hide($("overlay"));
        await fetchResults(appKey, appSecret);
        break;
      }
    } catch {
      // keep polling
    }
  }
}

async function fetchResults(appKey, appSecret) {
  try {
    const payload = await requestJson(`/api/results/${currentTaskId}?appKey=${encodeURIComponent(appKey)}&appSecret=${encodeURIComponent(appSecret)}`, {}, "结果查询");
    if (String(payload.code) !== "0") {
      showMsg("获取结果失败: " + (payload.message || "未知错误"));
      return;
    }
    renderResults(payload.data || []);
    show($("results-card"));
  } catch (error) {
    showMsg("获取结果出错: " + error.message);
  }
}

function renderResults(data) {
  const list = $("results-list");
  list.innerHTML = "";
  data.forEach((item, index) => {
    const displayIndex = typeof item.qIndex === "number" ? item.qIndex + 1 : index + 1;
    const itemData = synthesisItems[displayIndex - 1] || { text: "", emotion: "自然", language: selectedLanguage };
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
      <span class="emot">${escapeHtml(itemData.emotion || "自然")}</span>
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
  const excelInput = $("excelFile");
  if (excelInput) excelInput.addEventListener("change", event => handleExcel(event.target.files[0]));

  setupDrop("audio-dropzone", [".wav", "audio/wav"], file => handleAudio(file));
  setupDrop("excel-dropzone", [".xlsx", ".xls"], file => handleExcel(file));

  updateApiHint();
  updateModelUI();
  updateLanguageUI();
  updateManualPlaceholders();

  if ($("tab-excel")) $("tab-excel").classList.add("active");
  if ($("panel-excel")) show($("panel-excel"));
  if ($("panel-manual")) hide($("panel-manual"));
}

initApp();
