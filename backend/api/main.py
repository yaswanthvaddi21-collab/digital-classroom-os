"""Digital Classroom OS — local classroom API.

Phase 0 skeleton. In Phase 3 this process runs on the teacher's device as the classroom
sharing host (assignments out, submissions in). Ordinary editing never depends on it.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

API_VERSION = "0.1.0"

app = FastAPI(
    title="Digital Classroom OS API",
    version=API_VERSION,
    description="Local-network classroom services. See docs/API.md.",
)

# The web app is served from the same LAN host or from native shells (tauri://, capacitor://).
# Phase 3 replaces this with an explicit allow-list built from the classroom's paired devices.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "tauri://localhost", "capacitor://localhost"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


class Health(BaseModel):
    status: str
    version: str
    time: str


class ServerInfo(BaseModel):
    name: str
    version: str
    phase: int
    capabilities: list[str]


@app.get("/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", version=API_VERSION, time=datetime.now(timezone.utc).isoformat())


@app.get("/api/v1/info", response_model=ServerInfo)
def info() -> ServerInfo:
    """Lets a student device confirm it reached a Classroom OS host before pairing."""
    return ServerInfo(name="Digital Classroom OS", version=API_VERSION, phase=0, capabilities=[])
