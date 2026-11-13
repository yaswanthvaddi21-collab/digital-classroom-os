from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_health() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["version"]


def test_info_identifies_host() -> None:
    res = client.get("/api/v1/info")
    assert res.status_code == 200
    assert res.json()["name"] == "Digital Classroom OS"


def test_cors_rejects_unknown_origin() -> None:
    res = client.get("/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in res.headers
