# API

The backend is a FastAPI service that, from Phase 3, runs on the teacher's device as the classroom sharing host on the local network. **Editing never depends on it.**

## Implemented (Phase 0)

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ status: "ok", version, time }` |
| GET | `/api/v1/info` | `{ name, version, phase, capabilities: [] }`, which a student device uses to confirm it reached a Classroom OS host |

Interactive docs at `/docs` when running: `uvicorn api.main:app --port 8765` from `backend/`.

## Planned (Phase 2–3), all under `/api/v1`

| Area | Endpoints |
|---|---|
| Pairing | `POST /pair` (invite code → device session token) |
| Auth | `POST /auth/login`, `POST /auth/logout`, `POST /users` (teacher creates student) |
| Classroom | `GET /classroom`, `GET /subjects`, `GET /announcements` |
| Assignments | `GET /assignments`, `GET /assignments/{id}`, `POST /assignments` (teacher) |
| Submissions | `PUT /assignments/{id}/submission` (student, idempotent, with `base_version`), `GET /assignments/{id}/submissions` (teacher), `POST /submissions/{id}/grade` |
| Materials | `GET /materials`, `GET /attachments/{id}` (hash-verified download) |
| Sync | `POST /sync/push`, `GET /sync/pull?since=` (operation log) |

Conventions: JSON, UUID ids, ISO-8601 UTC timestamps, `ETag`/`base_version` for optimistic concurrency, `409 Conflict` instead of overwriting, and `Authorization: Bearer <device-session-token>`.
