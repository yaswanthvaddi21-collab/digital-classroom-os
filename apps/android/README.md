# Android (Capacitor) — Phase 5

Wraps `apps/web` as an Android app. Not built yet.

Prerequisites: Android Studio with SDK 34+, JDK 17+. Then:

```bash
cd apps/android
npm install
npm run add     # creates the native android/ project (git-ignored until Phase 5)
npm run sync
npm run open
```

Phase 5 work: SQLite storage adapter (`@capacitor-community/sqlite`) implementing `StorageAdapter`,
Android share sheet for exports, back-button handling.
