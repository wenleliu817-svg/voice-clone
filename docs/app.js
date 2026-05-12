const API_BASE = "https://openapi.youdao.com";

// Available CORS proxies (public free services)
const CORS_PROXIES = {
  corsproxy: "https://corsproxy.io/",
  allorigins: "https://api.allorigins.win/raw?url=",
  none: "",
};

let CORS_PROXY = localStorage.getItem("voice_clone_proxy") || "corsproxy";
let proxyUrl = CORS_PROXIES[CORS_PROXY] || "";

function apiUrl(path) {
  const p = path.startsWith("/") ? path.slice(1) : path;
  return proxyUrl ? proxyUrl + API_BASE + "/" + p : API_BASE + "/" + p;
}

// Restore proxy select value
function setProxy(val) {
  const sel = document.getElementById("proxy-select");
  if (!val) val = sel ? sel.value : CORS_PROXY;
  CORS_PROXY = val;
  proxyUrl = CORS_PROXIES[val] || "";
  localStorage.setItem("voice_clone_proxy", val);
  const hint = document.getElementById("proxy-hint");
  if (hint) {
    if (val === "none") hint.textContent = "直接请求有道 API（需要浏览器插件或部署后端）";
    else hint.textContent = "通过公共代理转发请求，仅用于测试";
  }
}

let voiceId = null;
let synthesisItems = [];
let audioFile = null;
let currentTaskId = null;

// ----- Utils -----
const $ = id => document.getElementById(id);

function showMsg(html, type = "error") {
  const container = document.querySelector(".container");
  const msg = document.createElement("div");
  msg.className = "msg " + (type === "success" ? "success" : "error");
  msg.innerHTML = html;
  container.insertBefore(msg, container.children[1]);
  setTimeout(() => msg.remove(), 4000);
}

function hide(el) { el.classList.add("hidden"); }
function show(el) { el.classList.remove("hidden"); }

function toggleSecret() {
  const input = $("appSecret");
  const icon = $("eye-icon");
  input.type = input.type === "password" ? "text" : "password";
  icon.className = input.type === "password" ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
}

function getCredentials() {
  const k = $("appKey").value.trim();
  const s = $("appSecret").value.trim();
  if (!k || !s) { showMsg("请先填写 App Key 和 App Secret"); return null; }
  return { appKey: k, appSecret: s };
}

function generateSign(appKey, appSecret) {
  const salt = crypto.randomUUID();
  const curtime = String(Math.floor(Date.now() / 1000));
  const enc = new TextEncoder();
  return crypto.subtle.digest("SHA-256", enc.encode(appKey + salt + curtime + appSecret)).then(buf => {
    const sign = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    return { salt, curtime, sign };
  });
}

// ----- Audio Upload -----
$("audioFile").addEventListener("change", e => handleAudio(e.target.files[0]));
setupDrop("audio-dropzone", [".wav", "audio/wav"], f => handleAudio(f));

function handleAudio(file) {
  if (!file || !file.name.toLowerCase().endsWith(".wav")) {
    showMsg("仅支持 .wav 格式音频"); return;
  }
  audioFile = file;
  $("audio-filename").textContent = file.name;
  hide($("audio-dropzone"));
  show($("audio-preview"));
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
  const dz = $(id);
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", e => {
    e.preventDefault(); dz.classList.remove("dragover");
    const f = e.dataTransfer.files[0];
    if (f && types.some(t => f.name.toLowerCase().endsWith(t) || f.type.includes(t))) cb(f);
  });
}

// ----- Clone Voice -----
async function cloneVoice() {
  const cred = getCredentials(); if (!cred) return;
  if (!audioFile) { showMsg("请先上传音频文件"); return; }

  $("btn-clone").disabled = true;
  const { salt, curtime, sign } = await generateSign(cred.appKey, cred.appSecret);

  const fd = new FormData();
  fd.append("appKey", cred.appKey);
  fd.append("curtime", curtime);
  fd.append("salt", salt);
  fd.append("sign", sign);
  fd.append("signType", "v4");
  fd.append("name", "Clone_" + Date.now());
  fd.append("model", "pro");
  fd.append("audioFile", audioFile, audioFile.name);

  try {
    const r = await fetch(apiUrl("/tts_gateway/v2/upload"), { method: "POST", body: fd });
    const j = await r.json();
    if (String(j.code) !== "0") {
      showMsg("克隆失败: " + (j.message || JSON.stringify(j)));
      $("btn-clone").disabled = false;
      return;
    }
    voiceId = j.data.voiceId;
    $("voice-id-display").textContent = "Voice ID: " + voiceId + "";
    show($("voice-id-display"));
    showMsg("音色克隆成功！", "success");
  } catch (e) {
    if (e.message && e.message.includes("CORS")) {
      showMsg("CORS 限制，请尝试切换代理或部署后端", "error");
    } else {
      showMsg("克隆请求出错: " + e.message);
    }
  }
  $("btn-clone").disabled = false;
}

// ----- Excel / Manual Upload -----
$("excelFile").addEventListener("change", e => handleExcel(e.target.files[0]));
setupDrop("excel-dropzone", [".xlsx", ".xls"], f => handleExcel(f));

async function handleExcel(file) {
  if (!file) return;
  if (typeof XLSX === "undefined") {
    showMsg("Excel 解析库加载中，请稍候...");
    await new Promise(r => setTimeout(r, 800));
    if (typeof XLSX === "undefined") { showMsg("无法解析 Excel，请刷新页面试试"); return; }
  }
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (!rows.length) { showMsg("Excel 为空"); return; }
  const headers = rows[0].map(h => String(h).trim());
  let textCol = headers.findIndex(h => h.includes("文本") || h.toLowerCase().includes("text"));
  let emoCol = headers.findIndex(h => h.includes("情绪") || h.toLowerCase().includes("emotion"));
  if (textCol === -1) textCol = 0;
  if (emoCol === -1) emoCol = 1;

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const text = String(row[textCol] || "").trim();
    const emotion = String(row[emoCol] || "").trim();
    if (text) items.push({ text, emotion });
  }
  synthesisItems = items;
  renderExcelPreview(items);
  showMsg(`解析成功，共 ${items.length} 条`, "success");
  show($("panel-excel"));
}

function renderExcelPreview(items) {
  const tb = $("excel-tbody"); tb.innerHTML = "";
  items.forEach((it, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i + 1}</td><td class="col-text">${escapeHtml(it.text)}</td><td>${escapeHtml(it.emotion || "")}</td>`;
    tb.appendChild(tr);
  });
  show($("excel-preview"));
}

function escapeHtml(s) {
  const d = document.createElement("div"); d.textContent = s; return d.innerHTML;
}

function downloadTemplate() {
  const csv = "文本,情绪,\n你好，这是一段示例文本,开心,\n今天天气真不错,自然,";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "template.csv" });
  a.click();
}

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  $("tab-" + name).classList.add("active");
  hide($("panel-excel")); hide($("panel-manual"));
  show($("panel-" + name));
}

function addManualRow() {
  const div = document.createElement("div");
  div.className = "manual-row";
  div.innerHTML = `<input type="text" class="input-text" placeholder="输入要合成的文本"><select class="input-emotion">` +
    "<option value=\"\">自然</option><option value=\"开心\">开心</option><option value=\"悲伤\">悲伤</option>" +
    "<option value=\"愤怒\">愤怒</option><option value=\"恐惧\">恐惧</option>" +
    "<option value=\"厌恶\">厌恶</option><option value=\"惊讶\">惊讶</option></select>";
  $("manual-rows").appendChild(div);
}

function getManualItems() {
  const rows = document.querySelectorAll("#manual-rows .manual-row");
  const arr = [];
  rows.forEach(r => {
    const t = r.querySelector(".input-text").value.trim();
    const e = r.querySelector(".input-emotion").value;
    if (t) arr.push({ text: t, emotion: e });
  });
  return arr;
}

// init proxy select
setProxy();
if ($("proxy-select")) $("proxy-select").value = CORS_PROXY;

// ----- Synthesis -----
async function startSynthesis() {
  const cred = getCredentials(); if (!cred) return;
  if (!voiceId) { showMsg("请先完成音色克隆"); return; }

  const activeTab = $("tab-excel").classList.contains("active") ? "excel" : "manual";
  const items = activeTab === "excel" ? synthesisItems : getManualItems();
  if (!items.length) { showMsg("请先导入文本或手动输入"); return; }

  show($("overlay"));
  currentTaskId = null;

  try {
    const { salt, curtime, sign } = await generateSign(cred.appKey, cred.appSecret);

    const qList = items.map(it => {
      const o = { q: it.text };
      if (it.emotion) o.emotionReferText = it.emotion;
      return o;
    });

    const payload = {
      appKey: cred.appKey,
      curtime, salt, sign,
      signType: "v4",
      voiceId,
      format: $("format").value,
      qList,
    };
    const speed = parseFloat($("speed").value);
    const volume = parseFloat($("volume").value);
    if (!isNaN(speed)) payload.speed = String(speed);
    if (!isNaN(volume)) payload.volume = String(volume);

    const r = await fetch(apiUrl("/tts_gateway/v2/synthesis_async"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (String(j.code) !== "0") { hide($("overlay")); showMsg("提交失败: " + (j.message || JSON.stringify(j))); return; }
    currentTaskId = j.data.taskId;
    pollProgress(cred.appKey, cred.appSecret);
  } catch (e) {
    hide($("overlay")); showMsg("提交出错: " + e.message);
  }
}

async function pollProgress(appKey, appSecret) {
  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const { salt, curtime, sign } = await generateSign(appKey, appSecret);
      const payload = { appKey, curtime, salt, sign, signType: "v4", taskId: currentTaskId };
      const r = await fetch(apiUrl("/tts_gateway/v2/get_progress"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (String(j.code) !== "0") continue;
      const data = j.data || {};
      const status = data.status || "UNKNOWN";
      const total = data.totalCount || 0;
      const succ = data.successCount || 0;
      $("progress-status").textContent = status === "SUCCESS" ? "合成完成" : status;
      $("progress-count").textContent = `${succ} / ${total}`;
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
    const { salt, curtime, sign } = await generateSign(appKey, appSecret);
    const payload = { appKey, curtime, salt, sign, signType: "v4", taskId: currentTaskId };
    const r = await fetch(apiUrl("/tts_gateway/v2/get_result"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (String(j.code) !== "0") { showMsg("获取结果失败: " + (j.message || "未知错误")); return; }
    renderResults(j.data || []);
    show($("results-card"));
  } catch (e) { showMsg("获取结果出错: " + e.message); }
}

function renderResults(data) {
  const list = $("results-list");
  list.innerHTML = "";
  data.forEach((item, idx) => {
    const div = document.createElement("div");
    div.className = "result-item";
    const url = item.mediaUrl || "";
    const itemData = synthesisItems[idx] || { text: "", emotion: "自然" };
    div.innerHTML = `
      <span class="idx">#${item.qIndex ?? idx + 1}</span>
      <span class="text" title="${escapeHtml(itemData.text)}">${escapeHtml(itemData.text)}</span>
      <span class="emot">${escapeHtml(itemData.emotion || "自然")}</span>
      ${url ? `<span class="status ok"><i class="fa-solid fa-check"></i></span>` : `<span class="status error">失败</span>`}
      ${url ? `<audio controls src="${url}"></audio>` : ""}
      ${url ? `<a href="${url}" target="_blank" download><i class="fa-solid fa-download"></i> 下载</a>` : ""}
    `;
    list.appendChild(div);
  });
}
