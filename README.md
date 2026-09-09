# Voice Foundry · 有道声音复刻

一个面向客户直接使用的有道智云声音复刻与语音合成网页。用户填写 AppID 和 App Secret、上传参考 WAV、输入文本并选择模型与语种后，服务会自动完成音色复刻、异步语音合成、结果播放和下载。

## 使用前准备

请在[有道智云控制台](https://ai.youdao.com/appmgr.s)创建 API 应用，并同时开通：

- 大模型声音复刻
- 大模型语音合成

参考音频须为 WAV、单声道、16kHz 或 24kHz，建议 5–10 秒清晰人声，不要包含背景音乐或多人声音。

## API 流程

1. `POST /tts_gateway/v2/upload` 上传参考音频并取得 `voiceId`
2. `POST /tts_gateway/v2/synthesis_async` 提交文本并取得 `taskId`
3. `POST /tts_gateway/v2/get_progress` 查询合成进度
4. `POST /tts_gateway/v2/get_result` 取得结果地址
5. 后端立即下载并保存结果，避免官方 `mediaUrl` 一天后过期

所有有道接口请求都由 Flask 后端签名。App Secret 不写入浏览器存储，也不会出现在 URL 中。

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

- `docs/`：GitHub Pages 静态前端
- `backend/`：Render 等支持 Docker/Python 的服务端
- `backend/frontend_build/`：后端同域访问时使用的前端副本

GitHub Pages 页面会自动连接 `https://voice-clone.onrender.com`；本地文件连接 `http://localhost:5001`；从后端域名访问时使用当前域名。

## 官方文档

- [大模型语音复刻与同步合成](https://ai.youdao.com/DOCSIRMA/html/tts/api/dmxyyfkhc/index.html)
- [大模型语音复刻与异步批量合成](https://ai.youdao.com/DOCSIRMA/html/tts/api/dmxyyfkybplhc/)
