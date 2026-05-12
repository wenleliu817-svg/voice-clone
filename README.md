# 有道声音克隆 · 批量语音合成

基于有道 AI 开放平台「大模型声音复刻」和「大模型语音合成」的前端工具，支持音色克隆与批量文本语音合成。

## 功能

1. **音色克隆** — 上传 .wav 音频样本，克隆出专属音色
2. **批量合成** — Excel 导入或手动输入文本+情绪，一键批量生成语音
3. **在线预览** — 合成后可直接页面内播放
4. **打包下载** — 支持单条下载或打包成 ZIP 下载

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

## License

MIT
