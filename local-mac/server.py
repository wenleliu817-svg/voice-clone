"""Local-only voice gateway. Python 3.9+, standard library, macOS system curl."""
import json
import pathlib
import subprocess
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

ROOT = pathlib.Path(__file__).resolve().parent
WEB_ROOT = ROOT / 'web'
if not WEB_ROOT.is_dir():
    WEB_ROOT = ROOT.parent / 'docs'
PATHS = {'/tts_gateway/v2/' + name for name in ('upload', 'synthesis_async', 'get_progress', 'get_result')}
MAX_BODY = 30 * 1024 * 1024


def allowed_origin(origin, host):
    return origin == 'http://' + host and host.startswith('127.0.0.1:')


def allowed_media(url):
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or '').lower().rstrip('.')
        return (parsed.scheme == 'https' and not parsed.username and not parsed.password
                and parsed.port in (None, 443)
                and any(host == domain or host.endswith('.' + domain) for domain in ('youdao.com', 'ydstatic.com', '163yun.com')))
    except ValueError:
        return False


def forward(url, body=None, content_type='application/json'):
    # Send body on stdin, never in process arguments; no external dependencies or TLS overrides.
    args = ['/usr/bin/curl', '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '55',
            '--max-filesize', str(100 * 1024 * 1024), '--proto', '=https',
            '--write-out', '\n%{http_code}\n%{content_type}', url]
    if body is not None:
        args += ['--request', 'POST', '--header', 'Content-Type: ' + content_type, '--data-binary', '@-']
    response = subprocess.run(args, input=body, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    if response.returncode:
        raise OSError('无法连接有道服务或下载音频，请确认网络能访问 openapi.youdao.com。')
    data, status, mime = response.stdout.rsplit(b'\n', 2)
    return int(status), mime.decode('ascii', errors='replace') or 'application/octet-stream', data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def log_message(self, *args):
        pass  # No credentials, signatures, URLs or synthesis text in logs.

    def reply(self, status, data, mime='application/json; charset=utf-8', headers=None):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def error(self, status, message):
        self.reply(status, json.dumps({'error': message}, ensure_ascii=False).encode())

    def valid_host(self):
        return self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port)

    def do_GET(self):
        if not self.valid_host():
            return self.error(403, 'Only localhost is allowed')
        parsed = urlsplit(self.path)
        if parsed.path == '/api/status':
            return self.reply(200, b'{"ok":true,"service":"voice-clone","gatewayVersion":1,"local":true}')
        if parsed.path == '/api/download':
            url = parse_qs(parsed.query).get('url', [''])[0]
            if not allowed_media(url):
                return self.error(400, 'Invalid official media URL')
            try:
                status, mime, data = forward(url)
                if status != 200:
                    return self.error(502, 'Audio download failed: HTTP ' + str(status))
                extension = 'mp3' if '.mp3' in urlsplit(url).path.lower() else 'wav'
                mime = 'audio/mpeg' if extension == 'mp3' else 'audio/wav'
                download = parse_qs(parsed.query).get('download') == ['1']
                disposition = ('attachment' if download else 'inline') + '; filename="generated-audio.' + extension + '"'
                return self.reply(200, data, mime, {'Content-Disposition': disposition})
            except (OSError, subprocess.TimeoutExpired):
                return self.error(502, '音频下载失败，请恢复网络连接后重试。')
        if parsed.path.startswith('/api/') or parsed.path.startswith('/tts_gateway/'):
            return self.error(404, 'Not found')
        if parsed.path not in ('/', '/index.html', '/app.js', '/transport.js', '/styles.css'):
            return self.error(404, 'Not found')
        return super().do_GET()

    def do_POST(self):
        if not self.valid_host() or not allowed_origin(self.headers.get('Origin'), self.headers.get('Host', '')):
            return self.error(403, 'Only the local page can submit requests')
        if self.path not in PATHS:
            return self.error(404, 'Not found')
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                return self.error(413, 'Request body is empty or too large')
            self.connection.settimeout(30)
            body = self.rfile.read(length)
            if len(body) != length:
                return self.error(400, 'Incomplete request')
            status, mime, data = forward('https://openapi.youdao.com' + self.path, body, self.headers.get('Content-Type', 'application/json'))
            return self.reply(status, data, mime)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            return self.error(502, '无法连接有道服务，请检查当前网络。')


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.daemon_threads = True
    url = 'http://127.0.0.1:' + str(server.server_port)
    print('声音复刻已启动：' + url, flush=True)
    print('请在浏览器填写自己的 AppID 与密钥。保持此窗口打开，按 Control+C 退出。', flush=True)
    threading.Timer(1, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
