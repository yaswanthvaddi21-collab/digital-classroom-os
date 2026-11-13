# Deployment

## Web (available now)

```bash
npm install
npm run build          # → apps/web/dist
npm run preview        # serve the production build at http://localhost:4173
```

`apps/web/dist` is a static site: host it on any static server, or on a classroom machine with `npx serve apps/web/dist`. After the first visit the service worker caches the whole app, so it keeps working offline. Note that browsers only enable service workers (and `crypto.randomUUID`) on HTTPS or `localhost`. When serving over plain HTTP on a LAN IP, the app still works but won't install as a PWA or load offline.

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
