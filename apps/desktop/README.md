# Desktop (Tauri 2) — Phase 5

Wraps `apps/web` in a native window for macOS and Windows. Not built yet.

Prerequisites: Rust (`rustup`), plus Xcode Command Line Tools on macOS or the WebView2 runtime and
MSVC build tools on Windows. Then:

```bash
cd apps/desktop
npm install
npm run icons   # generates src-tauri/icons from the app icon
npm run dev
```

Phase 5 work: SQLite storage adapter (`@tauri-apps/plugin-sql`) implementing `StorageAdapter`,
native save dialogs for exports, and PDF printing through the platform webview.
