# 有道声音克隆 · 一键合成

基于有道 AI 开放平台「大模型声音复刻」和「大模型语音合成」的前端工具，支持语种选择、模型选择、参考音频输入与一键文本合成。

## 功能

1. **一键生成** — 上传参考 .wav 音频并输入文本，自动完成克隆和合成
2. **在线预览** — 合成后可直接页面内播放
3. **下载结果** — 支持单条下载

## 快速开始

### 本地运行

```bash
# 1. 克隆仓库
git clone https://github.com/<你的用户名>/youdao-voice-clone.git
cd youdao-voice-clone

# 2. 安装依赖
cd backend
pip install -r requirements.txt

# 3. 启动服务
cd backend
python server.py

# 4. 浏览器打开 http://localhost:5001
```

### Docker 运行

```bash
docker build -t youdao-voice-clone .
docker run -p 5001:5001 youdao-voice-clone
```

## 有道开放平台配置

1. 注册并登录 [有道 AI 开放平台](https://ai.youdao.com)
2. 创建应用，开通「大模型声音复刻」和「大模型语音合成」服务
3. 在页面中填入 App Key 和 App Secret 即可使用
4. 静态页面默认连接内置后端，点击一次就会自动完成参考音频克隆和文本合成

## 文件结构

```
.
├── backend/
│   ├── server.py              # Flask 后端
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── frontend_build/        # 前端静态文件
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── app.js
│   └── uploads/
├── README.md
└── .gitignore
```

## 技术栈

- **前端**: 原生 HTML/CSS/JS，无需打包
- **后端**: Python + Flask
- **API**: 有道声音复刻 + 语音合成 API
- **语种/模型**: `lite` 支持中文/英文，`pro` 支持更多语种
- **外网访问**: GitHub Pages 页面地址保持不变，接口由后端转发

## License

MIT
