# Deployment

## Web (available now)

```bash
npm install
npm run build          # → apps/web/dist
npm run preview        # serve the production build at http://localhost:4173
```

`apps/web/dist` is a static site: host it on any static server, or on a classroom machine with `npx serve apps/web/dist`. After the first visit the service worker caches the whole app, so it keeps working offline. Note that browsers only enable service workers (and `crypto.randomUUID`) on HTTPS or `localhost`. When serving over plain HTTP on a LAN IP, the app still works but won't install as a PWA or load offline.

## GitHub Pages (since 2026-11-15)

The public repository's web app is published at <https://yaswanthvaddi21-collab.github.io/digital-classroom-os/> by [.github/workflows/pages.yml](../.github/workflows/pages.yml). On every push to `main` (or a manual run) it runs `npm ci` and `npm run build` on Node 22 and publishes `apps/web/dist`. The relative `base: './'` in `apps/web/vite.config.ts` and the hash router let the build load from the repository's sub-path, and Pages serves HTTPS, so the service worker and offline use work there.

- **Only the static web app is deployed.** The FastAPI backend in `backend/` is not; the app does not need it for editing. All data stays in each visitor's browser (IndexedDB).
- **What is live:** the build of `468ab89`, the Phase 6 app. Phase 7 (Presentation Studio) is not committed or deployed yet; because the workflow runs on every push to `main`, pushing it will publish it.

## Classroom host (Phase 3)

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 8765
```

## Desktop: macOS and Windows (Phase 5)

See [apps/desktop/README.md](../apps/desktop/README.md). `npm run build` in `apps/desktop` produces `.dmg`/`.app` (macOS) and `.msi`/NSIS installers (Windows). Release signing: Apple Developer ID plus notarization, and an Authenticode certificate on Windows.

## Android (Phase 5)

See [apps/android/README.md](../apps/android/README.md). Build a signed APK or AAB from Android Studio after `npm run sync`.
