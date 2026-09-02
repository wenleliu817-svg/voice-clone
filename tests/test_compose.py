import io
import unittest
from unittest.mock import patch

from backend.server import app


class ComposeFlowTest(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_compose_returns_final_results_without_voice_id(self):
        with patch("backend.server.api_multipart_post") as mock_upload, patch("backend.server.api_audio_post") as mock_audio:
            mock_upload.return_value = {"code": "0", "data": {"voiceId": "voice-123"}}
            mock_audio.return_value = {"content_type": "audio/wav", "data": b"RIFF...."}

            response = self.client.post(
                "/api/compose",
                data={
                    "appKey": "app-key",
                    "appSecret": "app-secret",
                    "text": "Hello world",
                    "language": "en",
                    "model": "pro",
                    "audio": (io.BytesIO(b"fake wav"), "sample.wav"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["code"], "0")
        self.assertEqual(payload["data"]["voiceId"], "voice-123")
        self.assertTrue(payload["data"]["results"][0]["mediaUrl"].startswith("/api/generated/"))

    def test_compose_returns_direct_audio_urls(self):
        with patch("backend.server.api_multipart_post") as mock_upload, patch("backend.server.api_audio_post") as mock_audio:
            mock_upload.return_value = {"code": "0", "data": {"voiceId": "voice-123"}}
            mock_audio.side_effect = [
                {"content_type": "audio/wav", "data": b"RIFF...."},
                {"content_type": "audio/wav", "data": b"RIFF...."},
            ]

            response = self.client.post(
                "/api/compose",
                data={
                    "appKey": "app-key",
                    "appSecret": "app-secret",
                    "text": "Hello world\nSecond line",
                    "language": "en",
                    "model": "pro",
                    "audio": (io.BytesIO(b"fake wav"), "sample.wav"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["code"], "0")
        self.assertEqual(payload["data"]["voiceId"], "voice-123")
        self.assertEqual(len(payload["data"]["results"]), 2)
        self.assertTrue(payload["data"]["results"][0]["mediaUrl"].startswith("/api/generated/"))


if __name__ == "__main__":
    unittest.main()
