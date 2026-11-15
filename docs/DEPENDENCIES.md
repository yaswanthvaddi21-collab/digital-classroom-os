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
| html-to-image | 1.11.11 | MIT | Diagram PNG/SVG | Pinned exact; upgrade deliberately and re-test exports. Since Phase 5 only the legacy `export.ts` capture uses it, which the editor no longer calls (TD-42) |
| jspdf | 4.2.x | MIT | Diagram PDF | 3.x had critical advisories; 4.2.1+ required. Lazy-loaded. Since Phase 5 it receives vector paths and text from svg2pdf.js instead of a raster |
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
| @tauri-apps/cli, tauri | 2.x | MIT OR Apache-2.0 | Desktop shell | Brief phase 12 (PRD Phase 5, cross-platform release). Declared only in `apps/desktop` (`package.json`, `src-tauri/Cargo.toml`), which is outside the npm workspace and lockfile and has no `Cargo.lock`, so it is not installed, licence-checked or audited (TD-30) |
| @capacitor/* | 7.x | MIT | Android shell | Brief phase 12 (PRD Phase 5, cross-platform release). Declared only in `apps/android/package.json`, which is outside the npm workspace and lockfile, so it is not installed, licence-checked or audited (TD-30) |


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

## Added in Phase 5 (Diagram Studio)

Licences checked in each package's `package.json` and LICENSE file. `npm run licenses` lists 138 production packages (114 MIT) with "Packages needing review: none" ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

| Dependency | Version | Licence | Why | Notes |
|---|---|---|---|---|
| svg2pdf.js | 2.8.1 (exact) | MIT | Vector diagram PDF: converts the exported SVG into PDF paths and real text through jsPDF | Pinned exact, like html-to-image: upgrade deliberately and re-run the export tests. Peer range jspdf ^2 \|\| ^3 \|\| ^4 (4.2.1 installed). Lazy-loaded with jsPDF only when a PDF is exported. Pure JS, no network (pictures reach it only as embedded `data:` URLs; web picture addresses are dropped on import, so it never fetches anything). Copyright yWorks GmbH and Vitaly Puzrin |
| ↳ cssesc | 3.0.0 | MIT | Through svg2pdf.js | |
| ↳ font-family-papandreou | 0.2.0-patch2 | MIT | Through svg2pdf.js | |
| ↳ specificity | 0.4.1 | MIT | Through svg2pdf.js | |
| ↳ svgpath | 2.6.0 | MIT | Through svg2pdf.js | |

No other dependency was added in Phase 5. html-to-image stays installed while `export.ts` exists (TD-42).

## Added in Phase 7 (Presentation Studio, export)

Licences checked in each package's `package.json` and LICENSE file. `npm run licenses` lists 142 production packages (117 MIT) with "Packages needing review: none" (143 and 118 before the `image-size` override of 2026-11-15, which also removed `queue`) ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

| Dependency | Version | Licence | Why | Notes |
|---|---|---|---|---|
| pptxgenjs | 4.0.1 (exact) | MIT | PowerPoint (.pptx) export: the package, slide layouts with placeholders, pictures, native tables, native editable charts (with their embedded workbook), preset shapes, backgrounds, speaker notes, hidden slides | The one new dependency approved for Phase 7. Declared by `@dcos/presentation-studio` only, pinned exact because the export post-processes its output (`export/pptxPost.ts` looks for exact patterns and throws if one is missing). Loaded with `import('pptxgenjs')` only when a PPTX is exported, so it is its own chunk. Pictures are always passed as `data` (never `path`), so it fetches nothing. No release for about 17 months: upgrade deliberately and re-run `packages/presentation-studio/src/export/*.test.ts`. Copyright Brent Ely |
| ↳ jszip | 3.10.2 | MIT OR GPL-3.0-or-later | Through pptxgenjs (writes the zip) | Already installed through mammoth; used under MIT |
| ↳ image-size | 2.1.0 (forced by the root `overrides`) | MIT | Through pptxgenjs, which declares `^1.2.1` | Never loaded: pptxgenjs's `browser` field maps it to `false`, none of its four builds (`dist/pptxgen.*.js`) imports it, and its only size lookup (`require('sizeof')`, Node only) sits in a commented-out function. Not in the web build. Raised from 1.2.1 on 2026-11-15 for two advisories (below); 2.x has no dependencies, so `queue` 6.0.2 (MIT, through image-size 1.x) is gone |
| ↳ https | 1.0.0 | ISC | Through pptxgenjs | An empty placeholder package; mapped to `false` for browsers |
| ↳ @types/node, undici-types | 22.x, 6.21.0 | MIT | pptxgenjs lists @types/node as a dependency | Type declarations only, no runtime code; they now count as production packages in the lock file |
| jspdf, svg2pdf.js, fflate | 4.2.x, 2.8.1, 0.8.x | MIT | PDF export (one vector page per slide) and post-processing of the PPTX (transitions, animations, text) | Already installed (Diagram Studio); now also declared by `@dcos/presentation-studio`, with the same versions |

No other dependency was added in Phase 7.

**`npm audit --omit=dev`: 0 vulnerabilities (fixed 2026-11-15, TD-63).** Round 3 found 2 high-severity advisories in `image-size` 1.2.1 (GHSA-5p2g-fcmc-qvqq: the JXL and HEIF parsers can loop forever; GHSA-w3rx-r6r6-pgpr: the ICNS parser can), which `pptxgenjs` 4.0.1 depends on (`^1.2.1`; fixed from `image-size` 2.0.3). The root `package.json` now has `"overrides": { "image-size": "^2.0.4" }`, and `image-size` 2.1.0 is installed (`npm ls image-size` shows it as "overridden"). That version is outside pptxgenjs's declared range, which is safe here because pptxgenjs never loads it: its `browser` field maps `image-size` to `false`, no file in its `dist/` imports it, and the one size lookup in its source (`require('sizeof')`, Node only) is in a commented-out function; pictures are always handed to PptxGenJS as data with their size. The Phase 7 samples (docs/compatibility/phase7-2026-11-15/) were exported with the override installed. `npm audit fix --force` was not used (it would downgrade to pptxgenjs 4.0.0, not the approved version). Upgrading pptxgenjs later: check whether it still needs the override, and remove it when its own range reaches a fixed `image-size`. The CI gate (`npm audit --omit=dev --audit-level=high`) passes again.

Planned later: PDF.js (Apache-2.0) for PDF Studio and Yjs (MIT) for collaboration. Both comply.
