# Voice Foundry · 有道声音复刻

一个面向客户直接使用的有道智云声音复刻与语音合成网页。用户填写 AppID 和 App Secret、上传参考 WAV、输入文本并选择模型与语种后，服务会自动完成音色复刻、异步语音合成、结果播放和下载。

## 使用前准备

请在[有道智云控制台](https://ai.youdao.com/appmgr.s)创建 API 应用，并同时开通：

- 大模型声音复刻
- 大模型语音合成

参考音频支持 WAV、MP3、M4A、AAC、OGG、WebM 等常见格式。页面会在浏览器中自动解码，并转换为单声道 16kHz WAV 后上传；建议使用 5–10 秒清晰人声，不要包含背景音乐或多人声音。

## API 流程

1. `POST /tts_gateway/v2/upload` 上传参考音频并取得 `voiceId`
2. `POST /tts_gateway/v2/synthesis_async` 提交文本并取得 `taskId`
3. `POST /tts_gateway/v2/get_progress` 查询合成进度
4. `POST /tts_gateway/v2/get_result` 取得结果地址
5. 前端直接播放或下载官方返回的 `mediaUrl`

GitHub Pages 体验页在浏览器中生成 v4 签名，并通过仓库内的 Cloudflare Worker 转发到有道接口。App Secret 不写入浏览器存储，只在本次请求中使用。

Worker 只允许转发这 4 个有道接口路径，不是开放式代理：

- `/tts_gateway/v2/upload`
- `/tts_gateway/v2/synthesis_async`
- `/tts_gateway/v2/get_progress`
- `/tts_gateway/v2/get_result`

## 本地运行

```bash
cd backend
python3 -m pip install -r requirements.txt
python3 server.py
```

打开 `http://localhost:5001`。

## 测试

```bash
python3 -m unittest discover -s tests -v
node tests/docs_app_flow.test.js
node tests/transport.test.js
```

## 部署

- `docs/`：GitHub Pages 静态前端，发布后即可打开体验
- `worker.js`：Cloudflare Worker 代理
- `wrangler.toml`：Worker 部署配置
- `backend/`：可选的旧版 Flask 服务端

GitHub Pages 页面默认请求：

```text
https://voice-clone.wenleliu817.workers.dev
```

Cloudflare 中重新部署仓库后，可先访问 `/api/status` 验证 Worker：

```json
{"ok":true}
```

## 官方文档

- [大模型语音复刻与同步合成](https://ai.youdao.com/DOCSIRMA/html/tts/api/dmxyyfkhc/index.html)
- [大模型语音复刻与异步批量合成](https://ai.youdao.com/DOCSIRMA/html/tts/api/dmxyyfkybplhc/)
