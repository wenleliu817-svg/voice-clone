import unittest
from unittest.mock import patch
from backend.server import app

class GatewayTest(unittest.TestCase):
    def test_health_identifies_compatible_gateway(self):
        data = app.test_client().get('/api/status').get_json()
        self.assertEqual(data.get('service'), 'voice-clone')
        self.assertEqual(data.get('gatewayVersion'), 1)
        self.assertEqual(data.get('deployment'), 'same-origin')

    def test_same_origin_serves_deployment_config(self):
        response = app.test_client().get('/config.js')
        self.assertEqual(response.status_code, 200)
        self.assertIn('backendOrigin', response.get_data(as_text=True))
        response.close()

    def test_progress_forwards_signed_json_without_secret(self):
        payload = {'appKey':'test','sign':'signed','salt':'random','taskId':'task'}
        with patch('backend.server.api_json_post', return_value={'code':'0','data':{'status':'SUCCESS'}}) as forward:
            response = app.test_client().post('/tts_gateway/v2/get_progress',json=payload)
            self.assertEqual(response.get_json()['code'],'0')
            forward.assert_called_once_with('/tts_gateway/v2/get_progress',payload)

    def test_unknown_gateway_route_is_not_html(self):
        response = app.test_client().post('/tts_gateway/v2/arbitrary',json={})
        self.assertEqual(response.status_code,404)
        self.assertTrue(response.is_json)
