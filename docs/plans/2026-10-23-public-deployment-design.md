# 声音复刻网页外部访问部署设计

## 目标

让外部用户打开一个 HTTPS 地址即可使用声音复刻页面，并降低 `workers.dev` 在部分网络不可达导致的失败率。

## 方案

主入口采用 Flask 容器的同源部署：容器同时提供 `docs/` 静态页面、健康检查、有道四个官方接口转发和结果音频下载。页面在非 GitHub Pages 域名上自动使用当前 origin，因此不会再产生“页面在一个域名、代理在另一个域名”的额外跨域链路。

GitHub Pages 保留为展示入口。Pages 工作流读取 `VOICE_CLONE_BACKEND_ORIGIN` Actions Variable 并生成 `docs/config.js`，让静态页指向已部署的容器；变量为空时保留现有 Worker 回退，方便没有容器的开发预览。

## 数据流

```text
用户浏览器
  └─ HTTPS 同源容器
       ├─ 页面与静态资源
       ├─ /api/status
       ├─ /tts_gateway/v2/* → openapi.youdao.com
       └─ /api/generated/* / /api/download → 有道音频 CDN
```

AppID、App Secret 和音频只用于当前用户请求。浏览器生成 v4 签名，服务端不保存 App Secret；容器只转发签名请求并临时保存生成的音频文件。

## 发布与验证

Render Blueprint 或任意支持 Docker 的 HTTPS 主机都可运行现有 `render.yaml` 与 `backend/Dockerfile`。发布后先检查 `/api/status`，再用页面上传一段短音频完成一次测试。若使用 GitHub Pages，设置 `VOICE_CLONE_BACKEND_ORIGIN` 后重新运行 Pages workflow，并检查浏览器网络请求是否全部指向该域名。

## 取舍

Worker 仍可作为备用代理，但不再作为唯一生产入口。Render 免费实例可能休眠；对国内用户的稳定性应由可访问的国内云主机、域名和 HTTPS 反向代理保障。
