import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('local_gateway', pathlib.Path(__file__).parents[1] / 'local-mac' / 'server.py')
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)

class LocalGatewayTest(unittest.TestCase):
    def test_only_local_browser_origin_is_accepted(self):
        self.assertTrue(gateway.allowed_origin('http://127.0.0.1:54321', '127.0.0.1:54321'))
        self.assertFalse(gateway.allowed_origin('https://evil.example', '127.0.0.1:54321'))
        self.assertFalse(gateway.allowed_origin('http://127.0.0.1:9999', '127.0.0.1:54321'))
        self.assertFalse(gateway.allowed_origin('null', '127.0.0.1:54321'))

    def test_only_official_https_media_is_allowed(self):
        self.assertTrue(gateway.allowed_media('https://tts-gateway.nos-jd.163yun.com/a.wav?x=1'))
        for value in ['http://ydstatic.com/a.wav', 'https://ydstatic.com.evil.example/a', 'https://127.0.0.1/a', 'https://user:pass@ydstatic.com/a']:
            self.assertFalse(gateway.allowed_media(value))

    def test_forward_preserves_upload_and_signature_without_command_line_body(self):
        result = type('Result', (), {'returncode':0,'stdout':b'{"code":"0"}\n200\napplication/json','stderr':b''})()
        with patch.object(gateway.subprocess, 'run', return_value=result) as run:
            status, content_type, body = gateway.forward('https://openapi.youdao.com/tts_gateway/v2/upload', b'multipart signed audio', 'multipart/form-data; boundary=test')
            self.assertEqual(status,200)
            self.assertEqual(body,b'{"code":"0"}')
            self.assertEqual(run.call_args.kwargs['input'],b'multipart signed audio')
            self.assertNotIn('multipart signed audio', ' '.join(run.call_args.args[0]))
            self.assertNotIn('--location',run.call_args.args[0])

class LocalHTTPTest(unittest.TestCase):
    def test_local_page_health_upload_and_download(self):
        import threading
        import urllib.request
        import urllib.error
        from urllib.parse import urlencode
        server = gateway.ThreadingHTTPServer(('127.0.0.1',0), gateway.Handler)
        thread = threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        origin = 'http://127.0.0.1:' + str(server.server_port)
        try:
            with urllib.request.urlopen(origin + '/api/status') as response:
                self.assertTrue(__import__('json').load(response)['local'])
            with urllib.request.urlopen(origin + '/') as response:
                self.assertIn(b'Voice Foundry',response.read())
            with patch.object(gateway,'forward',return_value=(200,'application/json',b'{"code":"0"}')) as forward:
                req=urllib.request.Request(origin+'/tts_gateway/v2/upload',data=b'reference-audio',headers={'Origin':origin,'Content-Type':'multipart/form-data; boundary=test'})
                with urllib.request.urlopen(req) as response:
                    self.assertEqual(response.read(),b'{"code":"0"}')
                forward.assert_called_once_with('https://openapi.youdao.com/tts_gateway/v2/upload',b'reference-audio','multipart/form-data; boundary=test')
            with patch.object(gateway,'forward',return_value=(200,'application/octet-stream',b'RIFFaudio')):
                with urllib.request.urlopen(origin+'/api/download?'+urlencode({'url':'https://ydstatic.com/test.wav','download':'1'})) as response:
                    self.assertEqual(response.headers['Content-Type'],'audio/wav')
                    self.assertIn('attachment',response.headers['Content-Disposition'])
                    self.assertEqual(response.read(),b'RIFFaudio')
            req=urllib.request.Request(origin+'/tts_gateway/v2/get_progress',data=b'{}',headers={'Origin':'https://evil.example'})
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(req)
            self.assertEqual(error.exception.code,403)
        finally:
            server.shutdown()
            server.server_close()
