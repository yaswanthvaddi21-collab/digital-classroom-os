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
- **What is live (checked 2026-11-16):** Phase 7 (Presentation Studio, `edc2672`) was deployed on 2026-11-15 by Pages run 43676035951. The merge of PR #1 (`0fa0064`, 2026-11-16) was deployed by Pages run 43780673936; it changed only browser tests and docs/TESTING.md, so the app is the Phase 7 app.
- **The deploy is not gated on CI.** By the owner's decision D-02 ([ADVANCED_EDITION_PRODUCT_ROADMAP.md](advanced-edition/ADVANCED_EDITION_PRODUCT_ROADMAP.md) §6.0) every push to `main` still deploys, whether or not CI passes (the `edc2672` push was deployed while its CI run 43676035968 failed). The control is that nothing is pushed to `main` until the owner says so.

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
