import io
import unittest
from unittest.mock import patch

from backend import server
from backend.server import app


class ComposeFlowTest(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        server.COMPOSE_JOBS.clear()

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

    def test_compose_keeps_multiline_text_as_one_result(self):
        with patch("backend.server.api_multipart_post") as mock_upload, patch("backend.server.api_audio_post") as mock_audio:
            mock_upload.return_value = {"code": "0", "data": {"voiceId": "voice-123"}}
            mock_audio.return_value = {"content_type": "audio/wav", "data": b"RIFF...."}

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
        self.assertEqual(len(payload["data"]["results"]), 1)
        self.assertTrue(payload["data"]["results"][0]["mediaUrl"].startswith("/api/generated/"))

    def test_async_compose_start_returns_job_and_received_status(self):
        with patch("threading.Thread") as mock_thread:
            response = self.client.post(
                "/api/compose/start",
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

        self.assertEqual(response.status_code, 202)
        payload = response.get_json()
        self.assertEqual(payload["code"], "0")
        job_id = payload["data"]["jobId"]
        status_response = self.client.get(f"/api/compose/status/{job_id}")
        self.assertEqual(status_response.status_code, 200)
        status_payload = status_response.get_json()
        self.assertEqual(status_payload["data"]["stage"], "received")
        self.assertEqual(status_payload["data"]["progress"], 5)
        mock_thread.return_value.start.assert_called_once_with()

    def test_async_compose_job_uses_official_async_synthesis_flow(self):
        class FakeAudioResponse:
            headers = {"Content-Type": "audio/wav"}

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return b"RIFF...."

        job_id = "job-async-flow"
        server.COMPOSE_JOBS[job_id] = {
            "jobId": job_id,
            "stage": "received",
            "progress": 5,
            "message": "",
            "voiceId": "",
            "result": None,
            "error": "",
        }
        params = {
            "app_key": "app-key",
            "app_secret": "app-secret",
            "text": "Hello world",
            "language": "en",
            "model": "pro",
            "voice_name": "OneShot",
            "audio_format": "wav",
            "volume": "1.0",
            "speed": "1.0",
        }

        with patch("backend.server.upload_voice_clone") as mock_upload, \
             patch("backend.server.submit_synthesis") as mock_submit, \
             patch("backend.server.wait_for_task_completion") as mock_wait, \
             patch("backend.server.urlopen") as mock_urlopen:
            mock_upload.return_value = {"code": "0", "data": {"voiceId": "voice-123"}}
            mock_submit.return_value = {"code": "0", "data": {"taskId": "task-123"}}
            mock_wait.return_value = {"code": "0", "data": [{"mediaUrl": "https://cdn.example.com/audio.wav"}]}
            mock_urlopen.return_value = FakeAudioResponse()

            server.run_compose_job(job_id, params, b"fake wav", "sample.wav")

        job = server.get_compose_job(job_id)
        self.assertEqual(job["stage"], "completed")
        self.assertEqual(job["progress"], 100)
        self.assertEqual(job["voiceId"], "voice-123")
        self.assertEqual(job["result"]["taskId"], "task-123")
        self.assertTrue(job["result"]["results"][0]["mediaUrl"].startswith("/api/generated/"))
        mock_submit.assert_called_once()
        self.assertEqual(mock_submit.call_args.kwargs["voice_id"], "voice-123")
        mock_wait.assert_called_once()
        self.assertEqual(mock_wait.call_args.kwargs["task_id"], "task-123")

    def test_server_port_uses_platform_port_when_available(self):
        with patch.dict("os.environ", {"PORT": "10000"}, clear=False):
            self.assertEqual(server.get_server_port(), 10000)

    def test_async_clone_includes_audio_settings(self):
        audio = server.FileStorage(stream=io.BytesIO(b"fake wav"), filename="sample.wav")
        with patch("backend.server.api_multipart_post") as mock_post:
            server.upload_voice_clone(
                app_key="app-key",
                app_secret="app-secret",
                voice_name="OneShot",
                model="pro",
                sample_rate="16000",
                channel="1",
                audio=audio,
            )

        fields = mock_post.call_args.args[1]
        self.assertEqual(fields["sampleRate"], "16000")
        self.assertEqual(fields["channel"], "1")

    def test_download_proxy_rejects_non_youdao_urls(self):
        response = self.client.get("/api/download?url=https://example.com/audio.wav&filename=x.wav")
        self.assertEqual(response.status_code, 400)

    def test_compose_rejects_non_wav_reference_audio(self):
        response = self.client.post(
            "/api/compose/start",
            data={
                "appKey": "app-key",
                "appSecret": "app-secret",
                "text": "Hello world",
                "language": "en",
                "model": "pro",
                "audio": (io.BytesIO(b"fake mp3"), "sample.mp3"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)

    def test_wait_for_task_retries_pending_result_after_success(self):
        progress = {"code": "0", "data": {"status": "SUCCESS"}}
        pending_result = {"code": "207", "message": "Result is not ready"}
        completed_result = {"code": "0", "data": [{"mediaUrl": "https://cdn.example.com/audio.wav"}]}

        with patch("backend.server.api_json_post", side_effect=[progress, pending_result, progress, completed_result]) as mock_post, \
             patch("backend.server.time.sleep"):
            result = server.wait_for_task_completion("app-key", "app-secret", "task-123", timeout_seconds=30, poll_interval_seconds=1)

        self.assertEqual(result["code"], "0")
        self.assertEqual(len(result["data"]), 1)
        self.assertEqual(mock_post.call_count, 4)
        calls = mock_post.call_args_list
        self.assertNotEqual(calls[0].args[1]["salt"], calls[1].args[1]["salt"])

    def test_async_result_keeps_official_q_index(self):
        class FakeAudioResponse:
            headers = {"Content-Type": "audio/wav"}
            def __enter__(self): return self
            def __exit__(self, exc_type, exc, tb): return False
            def read(self): return b"RIFF...."

        job_id = "job-q-index"
        server.COMPOSE_JOBS[job_id] = {"jobId": job_id, "stage": "received", "progress": 5, "message": "", "voiceId": "", "result": None, "error": ""}
        params = {"app_key": "app-key", "app_secret": "app-secret", "text": "Hello", "language": "en", "model": "pro", "voice_name": "OneShot", "audio_format": "wav", "volume": "1", "speed": "1"}
        with patch("backend.server.upload_voice_clone", return_value={"code": "0", "data": {"voiceId": "voice-1"}}), \
             patch("backend.server.submit_synthesis", return_value={"code": "0", "data": {"taskId": "task-1"}}), \
             patch("backend.server.wait_for_task_completion", return_value={"code": "0", "data": [{"mediaUrl": "https://cdn.example/audio.wav", "qIndex": 7}]}), \
             patch("backend.server.urlopen", return_value=FakeAudioResponse()):
            server.run_compose_job(job_id, params, b"fake wav", "sample.wav")
        self.assertEqual(server.get_compose_job(job_id)["result"]["results"][0]["qIndex"], 7)


if __name__ == "__main__":
    unittest.main()
