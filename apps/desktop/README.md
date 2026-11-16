# Desktop (Tauri 2) — AE-P14

Wraps `apps/web` in a native window for macOS and Windows. Not built yet.

Prerequisites: Rust (`rustup`), plus Xcode Command Line Tools on macOS or the WebView2 runtime and
MSVC build tools on Windows. Then:

```bash
cd apps/desktop
npm install
npm run icons   # generates src-tauri/icons from the app icon
npm run dev
```

AE-P14 work: native storage as decided under D-12 (design in AE-P3; for example a SQLite adapter with `@tauri-apps/plugin-sql`
implementing `StorageAdapter`),
native save dialogs for exports, and PDF printing through the platform webview.
