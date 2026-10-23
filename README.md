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
node tests/worker.test.js
node tests/task_recovery.test.js
```

## 部署

- `docs/`：GitHub Pages 静态前端，发布后即可打开体验
- `worker.js`：Cloudflare Worker 代理
- `wrangler.toml`：Worker 部署配置
- `backend/`：可选的旧版 Flask 服务端

### 推荐：单域名部署

对外给用户使用时，优先部署 `backend/` 容器，并把容器生成的 HTTPS 地址直接作为网页入口。容器会同时提供静态页面、`/api/status`、有道接口转发和音频下载，因此用户只需要打开一个地址，不依赖 `workers.dev` 的 DNS 或跨域链路。

最省事的方式是使用仓库内的 [`render.yaml`](render.yaml)：

1. 在 Render 选择 **New → Blueprint**，连接此 GitHub 仓库并选择 `voice-clone/render.yaml`。
2. 等待服务变为 `Live`，打开服务地址的 `/api/status`，应返回 `{"ok":true,"service":"voice-clone"}`。
3. 直接把服务根地址（例如 `https://<你的服务名>.onrender.com`）发给外部用户；打开后页面会自动使用同源后端。

Render 免费实例会休眠，首次打开可能需要等待启动。若目标用户主要在中国大陆，建议把同一个 Docker 镜像部署到可备案的国内云服务器，并在 HTTPS 反向代理后运行；应用监听 `PORT` 环境变量，健康检查路径仍为 `/api/status`。

### GitHub Pages 作为展示入口

如果仍想保留 GitHub Pages，只需在仓库 **Settings → Secrets and variables → Actions → Variables** 新建 `VOICE_CLONE_BACKEND_ORIGIN`，值填写上面的容器根地址（只允许 HTTPS 域名，不带路径）。Pages 工作流会在发布时生成 `docs/config.js`，静态页面自动调用该后端；未配置变量时才回退到 Cloudflare Worker。

页面“更换服务地址”仍可用于临时切换服务，但生产分享应优先使用单域名容器地址，避免让普通用户手动配置。

未配置 `VOICE_CLONE_BACKEND_ORIGIN` 时，GitHub Pages 页面回退请求：

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

## 故障恢复

- 连接服务超过 10 秒会显示连接错误，不再停留在克隆阶段。
- 鉴权、服务未开通、欠费等错误显示明确原因；网络波动及限流最多连续重试 3 次。
- 每轮进度查询最多等待约 6 分钟（在途请求还受各自超时限制）；失败后点击“继续获取结果”，复用本页内已取得的 voiceId/taskId，不重复提交已确认的任务。刷新页面会清除该内存状态，不存储 App Secret。
- 成功状态下结果暂未就绪会再次查询，空结果不会显示合成成功。
- workers.dev 在部分网络可能无法解析或访问。健康检查失败时须恢复网络可达性或为 Worker 配置可访问的正式域名；前端更新不能绕过 DNS 或网络限制。

## 2026-10-23：服务连接修复与备用部署

截图中的“连接语音服务无法连接服务”发生在健康检查阶段，尚未上传音频或提交合成。默认 workers.dev 地址在部分网络不可达；GitHub Pages 只能托管静态文件，不能承担有道接口代理。

本次更新：

- 页面提供独立的“检测连接”和“更换服务地址”，仅在本页使用手动指定的 HTTPS 服务，不自动将音频或签名转发给第三方备用代理。
- 连接失败不再展示“任务已接收”或 100% 已完成，也不会在没有任务时提示“继续获取结果”。
- Flask 后端新增与 Worker 一致的四个官方签名转发路径，可作为替代部署；Secret 只在浏览器生成签名，不发送到该代理。
- 容器直接打包 docs 当前前端，避免旧版 frontend_build 和 GitHub Pages 功能不一致。
- GitHub Actions 自动运行前后端回归测试。

### 无服务器时的部署入口

[使用 Render 部署此工程](https://render.com/deploy?repo=https://github.com/wenleliu817-svg/voice-clone)

需要项目所有者登录 Render 并创建服务，生成实际的 HTTPS 服务地址；本仓库不包含 Render 或其他托管平台的凭据。免费实例可能休眠，首次启动时需等待服务就绪。Render 也不能保证所有国内网络可达，需要由受影响用户实测；面向国内稳定服务应使用国内云服务器及可访问域名。

部署后先访问生成地址的 `/api/status`，应返回 `ok: true`、`service: voice-clone`。在页面“更换服务地址”填写该域名并检测，成功后即可调用。若直接打开该后端域名，它将提供同源前端，不依赖 workers.dev。确认目标用户网络可达后，可将 `docs/transport.js` 的默认服务地址改为此实际地址，再发布 Pages。

仅发布本次代码不等于开通了新的托管服务，不能将未部署的地址作为可用备用服务宣传。

## Mac 分散用户当天应急使用

[下载 Mac 本地启动包](https://wenleliu817-svg.github.io/voice-clone/downloads/voice-clone-mac.zip)

将整个包解压，双击 `启动声音复刻.command`。需要 Python 3.9+（没有时从 Python 官方网站安装 macOS universal2 版），不需要安装本工程的 Flask 或其他依赖。启动器仅监听 `127.0.0.1` 的随机空闲端口并打开浏览器，每位用户填写自己的有道应用信息。本机网关通过 macOS 自带 curl 直接请求有道官方服务，避开 workers.dev。保持终端窗口开启，Control+C 退出。

这是一份 Python 源码启动包，并非签名公证后的独立 Mac App。仍要求当前网络可以访问有道官方 API 和音频 CDN；没有内置密钥、参考音频或合成结果。

维护者更新前端后运行 `python3 local-mac/build_package.py` 重新打包，并将生成的 `docs/downloads/voice-clone-mac.zip` 一并发布。源码位于 `local-mac/`，回归测试位于 `tests/test_local_gateway.py`。
