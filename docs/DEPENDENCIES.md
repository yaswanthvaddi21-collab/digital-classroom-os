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
| docx | ^9.15.3 (installed 9.15.3) | MIT | DOCX export | Pure JS, works offline. Range raised from ^9.5.0 in Phase 4: equations use its `docx/math` subpath (`latexToMath`), tested with 9.15.3 |
| @xyflow/react | 12.x | MIT | Diagram engine | Attribution link kept visible |
| html-to-image | 1.11.11 | MIT | Diagram PNG/SVG | Pinned exact; upgrade deliberately and re-test exports |
| jspdf | 4.2.x | MIT | Diagram PDF | 3.x had critical advisories; 4.2.1+ required. Lazy-loaded |
| idb | 8.x | ISC | IndexedDB wrapper | |
| fflate | 0.8.x | MIT | Reading compressed diagrams.net pages; writing and reading ODT and reading DOCX/ODT packages | Added 2026-11-13. Small, pure JS, no network. Phase 4: also a direct dependency of `@dcos/document-studio` (^0.8.3) |
| lucide-react | 0.460 | ISC | Icons | |
| clsx | 2.x | MIT | Class names | |
| @fontsource-variable/inter | 5.x | OFL-1.1 | Bundled UI font | OFL permits bundling; no Google Fonts requests |
| dompurify (via jspdf) | — | MPL-2.0 OR Apache-2.0 | | Used under Apache-2.0 |
| pako (via jspdf) | — | MIT AND Zlib | | Both permissive |
| fastapi, uvicorn, pydantic | — | MIT / BSD-3-Clause | Backend | |
| fake-indexeddb, vitest, jszip, typescript | — | Apache-2.0 / MIT / (MIT OR GPL-3.0) | Dev/test only | jszip used under MIT. Since Phase 4 jszip is also a production dependency, through mammoth |
| @playwright/test | 1.x | Apache-2.0 | Dev/test only | Browser tests (Chromium, WebKit, Firefox) |
| @testing-library/react, /dom, /user-event | — | MIT | Dev/test only | Component tests |
| mammoth | 1.13.0 | BSD-2-Clause | DOCX import; tests re-read exported DOCX files | Phase 4: moved to a runtime dependency of `@dcos/document-studio` (^1.13.0); still a root devDependency for the tests. See its production dependencies below |
| @tauri-apps/cli, tauri | 2.x | MIT OR Apache-2.0 | Desktop shell | Phase 5 |
| @capacitor/* | 7.x | MIT | Android shell | Phase 5 |


## Added or moved in Phase 4 (Document Studio)

Licences checked in each package's `package.json` (and its LICENSE file where the field is not an SPDX id). `npm run licenses` reports 133 production packages and "Packages needing review: none".

| Dependency | Version | Licence | Why | Notes |
|---|---|---|---|---|
| @tiptap/extension-mathematics | 3.33.1 (exact) | MIT | Inline and display equations | Pinned to the installed Tiptap 3.33.1, which its peer range requires |
| katex | 0.18.11 (^0.18.11) | MIT | Renders equations in the editor, the equation dialog and print | Within the extension's peer range (^0.16.4 \|\| ^0.17 \|\| ^0.18). Run with `trust` off. Its CSS and fonts ship in the package and are bundled locally by Vite; the CSS and woff2 fonts are precached; no CDN. Brings in commander 15 (MIT) |
| mammoth | 1.13.0 | BSD-2-Clause | DOCX import | Moved from dev-only to runtime (above) |
| ↳ jszip | 3.10.2 | MIT OR GPL-3.0-or-later | Through mammoth | Used under MIT |
| ↳ pako | 1.0.11 | MIT AND Zlib | Through jszip | Both permissive |
| ↳ lop, option, dingbat-to-unicode | 0.4.2, 0.2.4, 1.0.2 | BSD-2-Clause | Through mammoth | |
| ↳ duck | 0.1.12 | BSD-2-Clause | Through lop | Its `license` field says "BSD"; the LICENSE file is the BSD 2-Clause text, recorded in `scripts/license-report.mjs` (`REVIEWED`) |
| ↳ sprintf-js | 1.0.3 | BSD-3-Clause | Through argparse | |
| ↳ underscore, xmlbuilder, @xmldom/xmldom, argparse, base64-js; lie, immediate, setimmediate, readable-stream and its helpers | — | MIT, except inherits (ISC) | Through mammoth and jszip | |
| fflate | ^0.8.3 | MIT | ODT export and import | Already used by Diagram Studio; now declared by Document Studio too |
| docx | ^9.15.3 | MIT | DOCX export, native Word equations | Range raised (above); no new package |

No other dependency was added. Every licence above is permissive (jszip is used under MIT).

Planned later: PDF.js (Apache-2.0) for PDF Studio and Yjs (MIT) for collaboration. Both comply.
