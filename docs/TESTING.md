# Testing

## Commands

```bash
npm test              # all TypeScript unit tests (Vitest)
npm run typecheck     # strict TypeScript across apps and packages
npm run build         # production build (also checks the PWA precache)
npm run check         # all three
npm run licenses      # licence policy check + docs/THIRD_PARTY_NOTICES.md
cd backend && .venv/bin/pytest
```

## What is covered (Phase 1 baseline)

| Suite | File | Covers |
|---|---|---|
| Storage | `packages/local-storage/src/indexeddb.test.ts` | create/list/get, simulated restart, version increments, stale-write rejection, aborted-write integrity, version snapshots and reversible restore, trash/restore/purge, duplicate, backup round-trip, no-overwrite import, malformed backup rejection |
| Document export | `packages/document-studio/src/export/docx.test.ts` | DOCX package contents (headings, alignment, bold, colour, size, lists, tables, page break, image media, header/footer, page numbers), image scaling, page size and margins in twips, every template exports, print page CSS, text export |
| Diagrams | `packages/diagram-studio/src/diagram.test.ts` | undo/redo semantics and cap, tree layout (positions, centring, LR, untouched loose nodes, cycles), serialization round-trip, dangling-edge cleanup, defaults, markers, template integrity, no overlaps in tree templates |
| Backend | `backend/tests/test_api.py` | health, info, CORS allow-list |

IndexedDB tests run in Node against `fake-indexeddb`.

## Manual acceptance

[`tests/acceptance/CHECKLIST.md`](../tests/acceptance/CHECKLIST.md) tracks PRD §11. Before a release, also:

1. Open an exported `.docx` in Microsoft Word (Windows and macOS) and LibreOffice.
2. Save as PDF from Chrome, Safari and Firefox; check margins and page numbers.
3. Load the app once, switch the device to airplane mode, reload, and create/edit/reopen a document and a diagram.
4. Export a backup, clear site data, restore, and confirm everything returns.

## Next

- Playwright browser tests for the acceptance list (create, edit, reload, export) in Chromium, WebKit and Firefox.
- Offline test using Playwright's `context.setOffline(true)`.
