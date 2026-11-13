# Dependency and licence review

Policy (PRD §13): permissive, commercially compatible licences, and no proprietary service required for offline use. The full transitive list with licences is generated into [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) by `npm run licenses`, which fails CI on anything outside the allow-list.

Baseline review, 2026-11-12:

| Dependency | Version | Licence | Why | Notes |
|---|---|---|---|---|
| react, react-dom | 19.x | MIT | UI | |
| react-router-dom | 7.x | MIT | Routing | Hash router for native shells |
| tailwindcss, @tailwindcss/vite | 4.x | MIT | Styling | Build-time |
| vite, @vitejs/plugin-react | 8.x / 6.x | MIT | Build | Build-time |
| vite-plugin-pwa (Workbox) | 2.x | MIT | Offline shell | Build-time. Workbox has moderate/low advisories in its build tooling only; nothing ships |
| @tiptap/* | 3.x | MIT | Document engine | Open-source extensions only, no Tiptap Pro/Cloud |
| prosemirror-* (via @tiptap/pm) | — | MIT | Document model | |
| docx | 9.x | MIT | DOCX export | Pure JS, works offline |
| @xyflow/react | 12.x | MIT | Diagram engine | Attribution link kept visible |
| html-to-image | 1.11.11 | MIT | Diagram PNG/SVG | Pinned exact; upgrade deliberately and re-test exports |
| jspdf | 4.2.x | MIT | Diagram PDF | 3.x had critical advisories; 4.2.1+ required. Lazy-loaded |
| idb | 8.x | ISC | IndexedDB wrapper | |
| fflate | 0.8.x | MIT | Reading compressed diagrams.net pages | Added 2026-11-13. Small, pure JS, no network |
| lucide-react | 0.460 | ISC | Icons | |
| clsx | 2.x | MIT | Class names | |
| @fontsource-variable/inter | 5.x | OFL-1.1 | Bundled UI font | OFL permits bundling; no Google Fonts requests |
| dompurify (via jspdf) | — | MPL-2.0 OR Apache-2.0 | | Used under Apache-2.0 |
| pako (via jspdf) | — | MIT AND Zlib | | Both permissive |
| fastapi, uvicorn, pydantic | — | MIT / BSD-3-Clause | Backend | |
| fake-indexeddb, vitest, jszip, typescript | — | Apache-2.0 / MIT / (MIT OR GPL-3.0) | Dev/test only | jszip used under MIT |
| @playwright/test | 1.x | Apache-2.0 | Dev/test only | Browser tests (Chromium, WebKit, Firefox) |
| @testing-library/react, /dom, /user-event | — | MIT | Dev/test only | Component tests |
| mammoth | 1.x | BSD-2-Clause | Dev/test only | Re-reads exported DOCX files in tests |
| @tauri-apps/cli, tauri | 2.x | MIT OR Apache-2.0 | Desktop shell | Phase 5 |
| @capacitor/* | 7.x | MIT | Android shell | Phase 5 |

Planned later: PDF.js (Apache-2.0) for PDF Studio and Yjs (MIT) for collaboration. Both comply.
