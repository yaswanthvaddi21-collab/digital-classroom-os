# Android (Capacitor) — AE-P14

Wraps `apps/web` as an Android app. Not built yet.

Prerequisites: Android Studio with SDK 34+, JDK 17+. Then:

```bash
cd apps/android
npm install
npm run add     # creates the native android/ project (git-ignored until AE-P14)
npm run sync
npm run open
```

AE-P14 work: native storage as decided under D-12 (design in AE-P3; for example a SQLite adapter with `@capacitor-community/sqlite`
implementing `StorageAdapter`),
Android share sheet for exports, back-button handling.
