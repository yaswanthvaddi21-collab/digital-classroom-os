# Security

## Reporting a vulnerability

GitHub's private vulnerability reporting is **not enabled** for this repository (owner decision D-39, [roadmap](advanced-edition/ADVANCED_EDITION_PRODUCT_ROADMAP.md) §6.0), so there is no private report form. To report a security problem:

1. Open a GitHub issue at <https://github.com/yaswanthvaddi21-collab/digital-classroom-os/issues> titled **"Security contact request"**.
2. **Do not include any exploit details, proof of concept, steps to reproduce, or personal data** in the issue. Say only that you have a security report and, if you like, which part of the app it concerns (for example "backup import").
3. The maintainer will reply on the issue to arrange a private channel, and the details are shared only there.

Never post student data, other personal data, backup files or exported work in a public issue, whether or not it is about security.

## Current posture (2026-11-16)

The repository is **public** (owner decision D-01), and the web app is **live on GitHub Pages**, built from `main` by `.github/workflows/pages.yml` ([DEPLOYMENT.md](DEPLOYMENT.md)). In production there is **no backend**: the FastAPI service in `backend/` is not deployed, and the app keeps every user's data only in that user's own browser. Accounts, classrooms and sync do not exist yet, so nothing below covers a server.

- **Private by default.** All work stays in the browser's IndexedDB on the device. Nothing is sent anywhere, there is no telemetry, and no third-party requests are made (fonts are bundled).
- **No HTML injection from content.** Editors render through ProseMirror and React; stored content is JSON, never `innerHTML` from untrusted input. The print export clones the editor's own rendered DOM. Imported backup files are schema-validated before any write.
- **Data integrity.** Writes are transactional; stale writes are rejected; restoring a version or importing a backup never destroys the current state.
- **Desktop least privilege.** Tauri capability `default.json` grants only `core:default`. Filesystem and SQL permissions will be added per feature and scoped to the app data directory. A CSP is set in `tauri.conf.json`. The **web app has no Content Security Policy yet** (`apps/web/index.html` sets none; TD-29 in [TECHNICAL_DEBT.md](audit/TECHNICAL_DEBT.md); decision D-23 is open).
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
