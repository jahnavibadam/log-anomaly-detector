import requests
import unittest

BASE_URL = "http://localhost:8000"


class TestLogAPI(unittest.TestCase):

    def test_01_post_valid_log(self):
        """Test POST /logs with a valid log payload."""
        payload = {
            "timestamp": "2026-10-08T14:32:00",
            "level": "ERROR",
            "service": "payment-service",
            "response_time_ms": 7000.0,
            "status_code": 500,
        }
        res = requests.post(f"{BASE_URL}/logs", json=payload)

        self.assertEqual(res.status_code, 201)
        data = res.json()

        # Check that DB and ML fields were attached correctly
        self.assertIn("id", data)
        self.assertIn("is_anomaly", data)
        self.assertIn("anomaly_score", data)
        self.assertIsInstance(data["is_anomaly"], bool)
        self.assertIsInstance(data["anomaly_score"], float)

    def test_02_post_invalid_schema(self):
        """Test POST /logs with missing required fields (should trigger 422 Unprocessable Entity)."""
        bad_payload = {
            "service": "auth-service"
            # missing timestamp, status_code, response_time_ms, level
        }
        res = requests.post(f"{BASE_URL}/logs", json=bad_payload)
        self.assertEqual(res.status_code, 422)

    def test_03_get_logs_pagination(self):
        """Test GET /logs with limit and skip parameters."""
        res = requests.get(f"{BASE_URL}/logs?limit=5&skip=0")

        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertIsInstance(data, list)
        self.assertLessEqual(len(data), 5)

        # Verify timestamp ordering (descending)
        if len(data) > 1:
            self.assertGreaterEqual(data[0]["timestamp"], data[1]["timestamp"])

    def test_04_get_anomalies_filter(self):
        """Test GET /anomalies ensures ONLY anomalous records are returned."""
        res = requests.get(f"{BASE_URL}/anomalies?limit=10")

        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertIsInstance(data, list)
        # Ensure all returned items have is_anomaly == True
        for record in data:
            self.assertTrue(
                record["is_anomaly"],
                f"Record {record['id']} in /anomalies was not flagged as an anomaly!",
            )


if __name__ == "__main__":
    unittest.main()