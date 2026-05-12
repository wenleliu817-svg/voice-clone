const API_BASE = window.location.origin;

let voiceId = null;
let synthesisItems = [];
let audioFile = null;
let excelFile = null;
let currentTaskId = null;

// ----- DOM refs -----
const $ = id => document.getElementById(id);

// ----- Utils -----
function showMsg(html, type = 'error') {
  const msg = document.createElement('div');
  msg.className = 'msg ' + (type === 'success' ? 'success' : 'error');
  msg.innerHTML = html;
  document.querySelector('.container').insertBefore(msg, document.querySelector('.container').children[1]);
  setTimeout(() => msg.remove(), 4000);
}

function hide(el) { el.classList.add('hidden'); }
function show(el) { el.classList.remove('hidden'); }

function toggleSecret() {
  const input = $('appSecret');
  const icon = $('eye-icon');
  input.type = input.type === 'password' ? 'text' : 'password';
  icon.className = input.type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
}

function checkCredentials() {
  const k = $('appKey').value.trim();
  const s = $('appSecret').value.trim();
  if (!k || !s) { showMsg('请先填写 App Key 和 App Secret'); return null; }
  return { appKey: k, appSecret: s };
}

// ----- Audio Upload -----
$('audioFile').addEventListener('change', e => { handleAudio(e.target.files[0]); });
setupDrop('audio-dropzone', ['.wav','audio/wav'], f => handleAudio(f));

function handleAudio(file) {
  if (!file || !file.name.toLowerCase().endsWith('.wav')) {
    showMsg('仅支持 .wav 格式音频'); return;
  }
  audioFile = file;
  $('audio-filename').textContent = file.name;
  hide($('audio-dropzone'));
  show($('audio-preview'));
}

function clearAudio() {
  audioFile = null;
  voiceId = null;
  $('audioFile').value = '';
  show($('audio-dropzone'));
  hide($('audio-preview'));
  hide($('voice-id-display'));
}

function setupDrop(id, types, cb) {
  const dz = $(id);
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && types.some(t => f.name.toLowerCase().endsWith(t) || f.type.includes(t))) cb(f);
  });
}

// ----- Clone Voice -----
async function cloneVoice() {
  const cred = checkCredentials(); if (!cred) return;
  if (!audioFile) { showMsg('请先上传音频文件'); return; }
  $('btn-clone').disabled = true;
  const fd = new FormData();
  fd.append('appKey', cred.appKey);
  fd.append('appSecret', cred.appSecret);
  fd.append('voiceName', 'Clone_' + Date.now());
  fd.append('model', 'pro');
  fd.append('audio', audioFile);
  try {
    const r = await fetch(`${API_BASE}/api/clone`, { method: 'POST', body: fd });
    const j = await r.json();
    if (String(j.code) !== '0') { showMsg('克隆失败: ' + (j.message || JSON.stringify(j))); $('btn-clone').disabled = false; return; }
    voiceId = j.data.voiceId;
    $('voice-id-display').textContent = 'Voice ID: ' + voiceId + '  ✓';
    show($('voice-id-display'));
    showMsg('音色克隆成功！', 'success');
  } catch (e) { showMsg('克隆请求出错: ' + e.message); }
  $('btn-clone').disabled = false;
}

// ----- Excel Upload -----
$('excelFile').addEventListener('change', e => { handleExcel(e.target.files[0]); });
setupDrop('excel-dropzone', ['.xlsx','.xls'], f => handleExcel(f));

async function handleExcel(file) {
  if (!file) return;
  excelFile = file;
  const fd = new FormData();
  fd.append('excel', file);
  try {
    const r = await fetch(`${API_BASE}/api/parse-excel`, { method: 'POST', body: fd });
    const j = await r.json();
    if (j.error) { showMsg('Excel 解析失败: ' + j.error); return; }
    synthesisItems = j.items;
    renderExcelPreview(synthesisItems);
    showMsg(`解析成功，共 ${synthesisItems.length} 条`, 'success');
  } catch (e) { showMsg('解析出错: ' + e.message); }
}

function renderExcelPreview(items) {
  const tb = $('excel-tbody'); tb.innerHTML = '';
  items.forEach((it, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td class="col-text">${escapeHtml(it.text)}</td><td>${escapeHtml(it.emotion||'')}</td>`;
    tb.appendChild(tr);
  });
  show($('excel-preview'));
}

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function downloadTemplate() {
  const blob = new Blob(['文本,情绪\n你好，这是一段测试文本,开心\n今天天气不错,自然'], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'template.csv' });
  a.click();
}

// ----- Manual Input -----
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  $('tab-' + name).classList.add('active');
  hide($('panel-excel')); hide($('panel-manual'));
  show($('panel-' + name));
}

function addManualRow() {
  const div = document.createElement('div');
  div.className = 'manual-row';
  div.innerHTML = `<input type="text" class="input-text" placeholder="输入要合成的文本"><select class="input-emotion"><option value="">自然</option><option value="开心">开心</option><option value="悲伤">悲伤</option><option value="愤怒">愤怒</option><option value="恐惧">恐惧</option><option value="厌恶">厌恶</option><option value="惊讶">惊讶</option></select>`;
  $('manual-rows').appendChild(div);
}

function getManualItems() {
  const rows = document.querySelectorAll('#manual-rows .manual-row');
  const arr = [];
  rows.forEach(r => {
    const t = r.querySelector('.input-text').value.trim();
    const e = r.querySelector('.input-emotion').value;
    if (t) arr.push({ text: t, emotion: e });
  });
  return arr;
}

// ----- Synthesis -----
async function startSynthesis() {
  const cred = checkCredentials(); if (!cred) return;
  if (!voiceId) { showMsg('请先完成音色克隆'); return; }

  const activeTab = $('tab-excel').classList.contains('active') ? 'excel' : 'manual';
  const items = activeTab === 'excel' ? synthesisItems : getManualItems();
  if (!items.length) { showMsg('请先导入文本或手动输入'); return; }

  show($('overlay'));
  currentTaskId = null;

  try {
    const r = await fetch(`${API_BASE}/api/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appKey: cred.appKey,
        appSecret: cred.appSecret,
        voiceId,
        items,
        format: $('format').value,
        speed: parseFloat($('speed').value),
        volume: parseFloat($('volume').value),
      })
    });
    const j = await r.json();
    if (String(j.code) !== '0') { hide($('overlay')); showMsg('提交失败: ' + (j.message || JSON.stringify(j))); return; }
    currentTaskId = j.data.taskId;
    pollProgress(cred.appKey, cred.appSecret);
  } catch (e) { hide($('overlay')); showMsg('提交出错: ' + e.message); }
}

async function pollProgress(appKey, appSecret) {
  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const r = await fetch(`${API_BASE}/api/progress/${currentTaskId}?appKey=${encodeURIComponent(appKey)}&appSecret=${encodeURIComponent(appSecret)}`);
      const j = await r.json();
      if (String(j.code) !== '0') continue;
      const data = j.data || {};
      const status = data.status || 'UNKNOWN';
      const total = data.totalCount || 0;
      const succ = data.successCount || 0;
      $('progress-status').textContent = status === 'SUCCESS' ? '合成完成' : status;
      $('progress-count').textContent = `${succ} / ${total}`;
      if (status === 'SUCCESS' || status === 'PARTIAL_SUCCESS') {
        hide($('overlay'));
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
    const r = await fetch(`${API_BASE}/api/results/${currentTaskId}?appKey=${encodeURIComponent(appKey)}&appSecret=${encodeURIComponent(appSecret)}`);
    const j = await r.json();
    if (String(j.code) !== '0') { showMsg('获取结果失败: ' + (j.message || '未知错误')); return; }
    renderResults(j.data || []);
    show($('results-card'));
  } catch (e) { showMsg('获取结果出错: ' + e.message); }
}

function renderResults(data) {
  const list = $('results-list');
  list.innerHTML = '';
  data.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    const url = item.mediaUrl || '';
    const itemData = synthesisItems[idx] || { text: '', emotion: '自然' };
    div.innerHTML = `
      <span class="idx">#${item.qIndex ?? idx+1}</span>
      <span class="text" title="${escapeHtml(itemData.text)}">${escapeHtml(itemData.text)}</span>
      <span class="emot">${escapeHtml(itemData.emotion || '自然')}</span>
      ${url ? `<span class="status ok"><i class="fa-solid fa-check"></i></span>` : `<span class="status error">失败</span>`}
      ${url ? `<audio controls src="${API_BASE}/api/download?url=${encodeURIComponent(url)}&filename=audio_${item.qIndex ?? idx+1}.wav"></audio>` : ''}
      ${url ? `<a href="${API_BASE}/api/download?url=${encodeURIComponent(url)}&filename=audio_${item.qIndex ?? idx+1}.wav" download><i class="fa-solid fa-download"></i> 下载</a>` : ''}
    `;
    list.appendChild(div);
  });
}

function downloadAllZip() {
  const cred = checkCredentials(); if (!cred || !currentTaskId) return;
  const url = `${API_BASE}/api/download-zip?taskId=${currentTaskId}&appKey=${encodeURIComponent(cred.appKey)}&appSecret=${encodeURIComponent(cred.appSecret)}`;
  const a = Object.assign(document.createElement('a'), { href: url, download: 'synthesis.zip' });
  a.click();
}
