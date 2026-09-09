# 有道声音复刻前端重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于有道官方大模型声音复刻与异步批量合成 API，提供可直接使用的 AppID/App Secret、参考音频、文本、模型/语种配置和音频生成页面。

**Architecture:** 保留 Flask 后端作为唯一密钥代理，前端只把用户本次输入通过 multipart 提交给 `/api/compose/start`；后端执行 upload → synthesis_async → get_progress → get_result，并代理保存最终 mediaUrl。前端采用原生 HTML/CSS/JS，改成单页工作台布局，保留无构建部署能力。

**Tech Stack:** Python 3 + Flask + urllib；原生 HTML/CSS/JavaScript；pytest/unittest 与 Node assert。

**Spec:** 官方文档：`https://ai.youdao.com/DOCSIRMA/html/tts/api/dmxyyfkhc/index.html`、`https://ai.youdao.com/DOCSIRMA/html/tts/api/dmxyyfkybplhc/`。

## Global Constraints

- upload 使用 `audioFile`，WAV、单声道、16k/24k，推荐 5–10 秒。
- upload 与异步接口均使用 `sha256(appKey + salt + curtime + appSecret)` 与 `signType=v4`。
- `lite` 仅允许中文/英文；`pro` 支持官方语言列表。
- 语音合成结果必须通过后端保存并提供播放/下载。
- 不在前端持久化 App Secret，不允许浏览器直连 `openapi.youdao.com`。

### Task 1: 对齐后端 API 细节与错误处理

**Files:**
- Modify: `backend/server.py`
- Test: `tests/test_compose.py`

- [ ] 补充格式、采样率、文件扩展名和文本长度校验。
- [ ] 统一官方错误码转成人类可读消息，保证异步进度和结果异常可见。
- [ ] 为下载代理增加明确的内容类型与文件名处理。
- [ ] 运行后端测试。

### Task 2: 重做前端工作台页面

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/styles.css`
- Modify: `docs/app.js`
- Modify: `docs/transport.js`
- Test: `tests/docs_app_flow.test.js`, `tests/transport.test.js`

- [ ] 设计“凭证 → 参考音频 → 文本与配置 → 生成结果”的单页流程，明确 AppID/App Secret 文案与安全提示。
- [ ] 增加 WAV 文件校验、时长/大小提示、模型-语种联动、字符计数和可取消/重置状态。
- [ ] 结果区支持在线播放、下载、voiceId/taskId 复制。
- [ ] 保持 GitHub Pages + Render 的无构建部署兼容。
- [ ] 运行 Node UI/传输测试。

### Task 3: 端到端验证与发布准备

**Files:**
- Modify: `README.md`
- Modify: `render.yaml`（如存在）或新增部署配置

- [ ] 本地启动 Flask 并验证健康检查、静态页和合成任务请求格式。
- [ ] 运行完整测试套件并检查 git diff。
- [ ] 提交并推送到现有 GitHub remote；若缺少权限或部署平台配置，明确报告阻塞点和所需操作。

