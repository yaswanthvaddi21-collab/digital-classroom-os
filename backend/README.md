# Backend

FastAPI service for local-network classroom features (Phase 3). Phase 0 ships only a health/info API.

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
uvicorn api.main:app --host 0.0.0.0 --port 8765
```
