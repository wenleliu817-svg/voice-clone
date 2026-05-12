import os
import hashlib
import json
import time
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from flask import Flask, request, jsonify, send_file, abort
from flask_cors import CORS
from werkzeug.utils import secure_filename
import pandas as pd

# --- Config ---
BASE_URL = "https://openapi.youdao.com"
URI_UPLOAD = "/tts_gateway/v2/upload"
URI_SUBMIT = "/tts_gateway/v2/synthesis_async"
URI_PROGRESS = "/tts_gateway/v2/get_progress"
URI_RESULT = "/tts_gateway/v2/get_result"

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
CORS(app)


# --- Helpers ---
def generate_sign_v4(app_key, app_secret):
    salt = str(uuid.uuid4())
    curtime = str(int(time.time()))
    sign = hashlib.sha256((app_key + salt + curtime + app_secret).encode()).hexdigest()
    return salt, curtime, sign


def api_json_post(uri, payload):
    body = json.dumps(payload).encode("utf-8")
    req = Request(BASE_URL + uri, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    with urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def api_multipart_post(uri, fields, files):
    boundary = uuid.uuid4().hex
    body = b""
    for name, value in fields.items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").encode()
    for name, (filename, file_bytes) in files.items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode()
        body += file_bytes
        body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = Request(BASE_URL + uri, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    with urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


# --- API: Health ---
@app.route("/api/status", methods=["GET"])
def status():
    return jsonify({"ok": True})


# --- API: Clone voice ---
@app.route("/api/clone", methods=["POST"])
def clone_voice():
    app_key = request.form.get("appKey", "").strip()
    app_secret = request.form.get("appSecret", "").strip()
    voice_name = request.form.get("voiceName", "MyVoice").strip()
    model = request.form.get("model", "pro")
    audio = request.files.get("audio")

    if not app_key or not app_secret:
        return jsonify({"error": "Missing appKey or appSecret"}), 400
    if not audio:
        return jsonify({"error": "Missing audio file"}), 400

    salt, curtime, sign = generate_sign_v4(app_key, app_secret)
    fields = {
        "appKey": app_key,
        "curtime": curtime,
        "salt": salt,
        "sign": sign,
        "signType": "v4",
        "name": voice_name[:50],
        "model": model,
    }
    files = {"audioFile": (secure_filename(audio.filename), audio.read())}
    result = api_multipart_post(URI_UPLOAD, fields, files)
    return jsonify(result)


# --- API: Parse Excel ---
@app.route("/api/parse-excel", methods=["POST"])
def parse_excel():
    excel_file = request.files.get("excel")
    if not excel_file:
        return jsonify({"error": "Missing excel file"}), 400
    try:
        df = pd.read_excel(excel_file.stream)
        required = {"文本", "情绪"}
        headers = {str(c).strip() for c in df.columns}
        # Allow flexible column names
        text_col = None
        emotion_col = None
        for c in df.columns:
            cn = str(c).strip()
            if "文本" in cn or "text" in cn.lower():
                text_col = c
            if "情绪" in cn or "emotion" in cn.lower():
                emotion_col = c
        if text_col is None:
            return jsonify({"error": "Excel must have a '文本' column"}), 400
        items = []
        for _, row in df.iterrows():
            if pd.isna(row[text_col]):
                continue
            items.append({
                "text": str(row[text_col]).strip(),
                "emotion": str(row[emotion_col]).strip() if emotion_col and not pd.isna(row[emotion_col]) else ""
            })
        return jsonify({"items": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- API: Submit synthesis ---
@app.route("/api/synthesize", methods=["POST"])
def synthesize():
    data = request.get_json() or {}
    app_key = data.get("appKey", "").strip()
    app_secret = data.get("appSecret", "").strip()
    voice_id = data.get("voiceId", "").strip()
    items = data.get("items", [])
    audio_format = data.get("format", "wav")
    volume = data.get("volume")
    speed = data.get("speed")

    if not app_key or not app_secret:
        return jsonify({"error": "Missing appKey or appSecret"}), 400
    if not voice_id:
        return jsonify({"error": "Missing voiceId"}), 400
    if not items:
        return jsonify({"error": "No items to synthesize"}), 400

    salt, curtime, sign = generate_sign_v4(app_key, app_secret)
    q_list = []
    for item in items:
        d = {"q": item["text"]}
        if item.get("emotion"):
            d["emotionReferText"] = item["emotion"]
        q_list.append(d)

    payload = {
        "appKey": app_key,
        "curtime": curtime,
        "salt": salt,
        "sign": sign,
        "signType": "v4",
        "voiceId": voice_id,
        "format": audio_format,
        "qList": q_list,
    }
    if volume is not None:
        payload["volume"] = str(volume)
    if speed is not None:
        payload["speed"] = str(speed)

    result = api_json_post(URI_SUBMIT, payload)
    return jsonify(result)


# --- API: Query progress ---
@app.route("/api/progress/<task_id>", methods=["GET"])
def progress(task_id):
    app_key = request.args.get("appKey", "").strip()
    app_secret = request.args.get("appSecret", "").strip()
    if not app_key or not app_secret:
        return jsonify({"error": "Missing appKey or appSecret"}), 400

    salt, curtime, sign = generate_sign_v4(app_key, app_secret)
    payload = {
        "appKey": app_key,
        "curtime": curtime,
        "salt": salt,
        "sign": sign,
        "signType": "v4",
        "taskId": task_id,
    }
    result = api_json_post(URI_PROGRESS, payload)
    return jsonify(result)


# --- API: Get results ---
@app.route("/api/results/<task_id>", methods=["GET"])
def results(task_id):
    app_key = request.args.get("appKey", "").strip()
    app_secret = request.args.get("appSecret", "").strip()
    if not app_key or not app_secret:
        return jsonify({"error": "Missing appKey or appSecret"}), 400

    salt, curtime, sign = generate_sign_v4(app_key, app_secret)
    payload = {
        "appKey": app_key,
        "curtime": curtime,
        "salt": salt,
        "sign": sign,
        "signType": "v4",
        "taskId": task_id,
    }
    result = api_json_post(URI_RESULT, payload)
    return jsonify(result)


# --- API: Download single audio (proxy) ---
@app.route("/api/download", methods=["GET"])
def download_audio():
    url = request.args.get("url", "").strip()
    filename = request.args.get("filename", "audio.wav").strip()
    if not url:
        return jsonify({"error": "Missing url"}), 400
    try:
        req = Request(url, method="GET")
        with urlopen(req, timeout=120) as resp:
            data = resp.read()
            mime = resp.headers.get("Content-Type", "audio/wav")
            return send_file(BytesIO(data), mimetype=mime, as_attachment=True, download_name=filename)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- API: Download all as ZIP ---
@app.route("/api/download-zip", methods=["GET"])
def download_zip():
    task_id = request.args.get("taskId", "").strip()
    app_key = request.args.get("appKey", "").strip()
    app_secret = request.args.get("appSecret", "").strip()
    if not task_id or not app_key or not app_secret:
        return jsonify({"error": "Missing parameters"}), 400

    salt, curtime, sign = generate_sign_v4(app_key, app_secret)
    payload = {
        "appKey": app_key,
        "curtime": curtime,
        "salt": salt,
        "sign": sign,
        "signType": "v4",
        "taskId": task_id,
    }
    result = api_json_post(URI_RESULT, payload)
    items = result.get("data", [])
    if not items:
        return jsonify({"error": "No results found"}), 404

    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, item in enumerate(items):
            url = item.get("mediaUrl", "")
            if not url:
                continue
            try:
                req = Request(url, method="GET")
                with urlopen(req, timeout=120) as resp:
                    data = resp.read()
                    ext = "wav" if "wav" in url else "mp3"
                    zf.writestr(f"audio_{idx:04d}.{ext}", data)
            except Exception:
                continue
    zip_buf.seek(0)
    return send_file(zip_buf, mimetype="application/zip", as_attachment=True, download_name=f"synthesis_{task_id}.zip")


# --- Serve React static files ---
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    build_dir = Path(__file__).parent / "frontend_build"
    if (build_dir / path).is_file():
        return send_file(build_dir / path)
    return send_file(build_dir / "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
