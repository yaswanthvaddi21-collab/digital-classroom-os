# Backend

FastAPI service for local-network classroom features (Advanced Edition AE-P9). Today it has only a health/info API, and it is not deployed: the live web app does not use it.

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
uvicorn api.main:app --host 0.0.0.0 --port 8765
```
