# Testing

## Commands

```bash
npm test              # all TypeScript unit and integration tests (Vitest)
npm run test:e2e      # Playwright browser tests (builds and serves the app on :4173)
npm run typecheck     # strict TypeScript across apps and packages
npm run build         # production build (also checks the PWA precache)
npm run check         # all three
npm run licenses      # licence policy check + docs/THIRD_PARTY_NOTICES.md
cd backend && .venv/bin/pytest
```

## What is covered

| Suite | File | Covers |
|---|---|---|
| Storage | `packages/local-storage/src/indexeddb.test.ts` | create/list/get, simulated restart, version increments, stale-write rejection, aborted-write integrity, version snapshots and reversible restore, trash/restore/purge, duplicate, backup round-trip, no-overwrite import, malformed backup rejection |
| Document export | `packages/document-studio/src/export/docx.test.ts` | DOCX package contents (headings, alignment, bold, colour, size, lists, tables, page break, image media, header/footer, page numbers), image scaling, page size and margins in twips, every template exports, print page CSS, text export |
| Diagrams | `packages/diagram-studio/src/diagram.test.ts` | undo/redo semantics and cap, tree layout (positions, centring, LR, untouched loose nodes, cycles), serialization round-trip, dangling-edge cleanup, defaults, markers, template integrity, no overlaps in tree templates |
| diagrams.net | `packages/diagram-studio/src/drawio.test.ts` | import of plain and compressed files, shapes, UML/ER containers, edges, approximation notes, export round-trip |
| Quick connect | `packages/diagram-studio/src/quickConnectGeometry.test.ts` | placement without overlap, connection rules (no duplicates or self-links), facing handles, keyboard directions |
| Document safety | `packages/document-studio/src/safety.test.ts`, `DocumentEditor.test.tsx`, `extensions/extensions.test.ts` | migration, validation, read-only protected view, editor smoke tests, search across Unicode case changes |
| Embedded diagram export | `packages/document-studio/src/export/diagram-export.test.ts` | DOCX picture at document size with aspect ratio kept, never wider than the text, a clear note when a preview is missing, plain-text placeholder |
| Web storage hook | `apps/web/src/lib/storage.test.tsx` | debounced saves, no-op saves skipped, renames, conflicts and both resolutions, flush on unmount and hide, Ctrl/⌘+S versions, title kept while typing, retries then recoverable drafts, cross-tab updates |
| Upgrade safety | `tests/integration/v0.1.0-fixtures.test.ts` | a real v0.1.0 database upgrades to v2 without loss; every v0.1.0 document still opens |
| DOCX golden files | `tests/integration/docx-golden.test.ts` | exported DOCX XML matches reviewed snapshots and re-parses with mammoth |
| Package boundaries | `tests/integration/boundaries.test.ts` | each package imports only the `@dcos` packages it is allowed to (Document Studio never imports Diagram Studio); no paid Tiptap Pro packages |
| Backend | `backend/tests/test_api.py` | health, info, CORS allow-list |

Browser tests (`e2e/`, Playwright) run in Chromium, WebKit and mobile Chromium, plus Firefox in CI: navigation and settings, document editing and export, diagram editing, embedded diagrams (insert, double-click edit, resize, DOCX), diagrams.net import/export, quick connect (click, drag, palette, keyboard, zoom/pan, undo/redo, touch), diagram safety in documents (Escape never discards work without asking, cut/copy/paste keep the whole diagram, inserting next to a selected diagram keeps it), and Chromium-only storage tests (offline after first visit, data survives a browser restart, embedding while offline, another tab upgrading the database). Firefox does not launch on the local macOS 27 machine, so it is covered only in CI.

IndexedDB tests run in Node against `fake-indexeddb`.

## Manual acceptance

[`tests/acceptance/CHECKLIST.md`](../tests/acceptance/CHECKLIST.md) tracks PRD §11. Before a release, also:

1. Open an exported `.docx` in Microsoft Word (Windows and macOS) and LibreOffice.
2. Save as PDF from Chrome, Safari and Firefox; check margins and page numbers.
3. Load the app once, switch the device to airplane mode, reload, and create/edit/reopen a document and a diagram.
4. Export a backup, clear site data, restore, and confirm everything returns.

## Next

- Per-file coverage thresholds for storage and export code.
- Opening exported DOCX files in Microsoft Word and LibreOffice (manual).
