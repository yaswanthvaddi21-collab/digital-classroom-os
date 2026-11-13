# Security

## Current posture (Phase 0–1, single device)

- **Private by default.** All work stays in the browser's IndexedDB on the device. Nothing is sent anywhere, there is no telemetry, and no third-party requests are made (fonts are bundled).
- **No HTML injection from content.** Editors render through ProseMirror and React; stored content is JSON, never `innerHTML` from untrusted input. The print export clones the editor's own rendered DOM. Imported backup files are schema-validated before any write.
- **Data integrity.** Writes are transactional; stale writes are rejected; restoring a version or importing a backup never destroys the current state.
- **Desktop least privilege.** Tauri capability `default.json` grants only `core:default`. Filesystem and SQL permissions will be added per feature and scoped to the app data directory. A CSP is set in `tauri.conf.json`.
- **Supply chain.** `npm audit` runs in CI. At baseline, the moderate/low advisories left are in build-only tooling (`workbox-build` via `vite-plugin-pwa`) that doesn't ship. jsPDF was pinned to 4.2.1+ to clear critical advisories in 3.x.

## Requirements for later phases

| PRD requirement | Plan |
|---|---|
| Secure password storage | Argon2id (`argon2-cffi`), per-user salt, server-side only |
| Role-based permissions | Role checked in FastAPI dependencies on every route; students only see their own submissions |
| Classroom membership validation | Device session tokens issued only after invite-code pairing; tokens bound to classroom + user, short-lived, revocable |
| Local network authentication | Bearer tokens over the LAN. Evaluate a self-signed TLS cert pinned at pairing (QR) so tokens aren't sent in clear on shared Wi-Fi |
| Protected file uploads | Size limits, MIME sniffing, SHA-256 verification, stored outside any served directory, never executed |
| Secure session management | Token rotation, logout revokes, idle expiry |
| Audit records | `activity_logs` for publishes, submissions, grades, membership changes |

## Reporting

Until a public release, report issues privately to the project maintainers rather than in public issues.
