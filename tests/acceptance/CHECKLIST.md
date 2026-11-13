# MVP acceptance checklist

Status of PRD §11 criteria. ✅ verified · 🟡 partly verified · ⬜ not started (later phase).
"Unit" means covered by automated tests; "Browser" means checked by hand in Chromium on the dev server.

Last run: 2026-11-12, web app on `localhost:5173`.

## Documents

| Criterion | Status | Evidence |
|---|---|---|
| Document creation works | ✅ | Browser: created from Assignment template |
| Editing works | ✅ | Browser: typed, formatted, find & replace all |
| Autosave works | ✅ | Browser: "Saved on this device" after edits; debounced 600 ms |
| Offline persistence works | 🟡 | Browser: content and mode survive reload. Offline shell precached by service worker (build output); airplane-mode run not yet done |
| DOCX export works | 🟡 | Unit: package structure, headings, lists, tables, images, header/footer, page size. Browser: valid 11 KB `.docx` generated. **Not yet opened in Microsoft Word** |
| PDF export works | 🟡 | Unit: print page (size, margins, header, page counter). Uses the system print dialog; not yet exported by hand in Safari/Firefox |

## Diagrams

| Criterion | Status | Evidence |
|---|---|---|
| Flowcharts work | ✅ | Browser: Flowchart template renders with labelled Yes/No branches |
| Tree diagrams work | ✅ | Browser: Tab adds a child, tree re-arranges; Unit: no overlaps in tree templates |
| Connectors work | ✅ | Browser: connectors stay attached while dragging shapes |
| Undo and redo work | ✅ | Browser: ⌘Z / ⌘⇧Z restore a move; Unit: `UndoStack` |
| Diagrams save and reopen | ✅ | Browser: nodes, edges and viewport survive reload; Unit: serialization round-trip |
| PNG and PDF exports work | ✅ | Browser: PNG 2× (no handles/UI in output), SVG, PDF all generated |

## Storage

| Criterion | Status | Evidence |
|---|---|---|
| Local data survives application restart | ✅ | Unit: reopen DB connection; Browser: reload |
| Editing works offline | 🟡 | No network calls in editing paths; formal offline test pending |
| Backup and recovery are tested | ✅ | Unit: export → import into empty DB; divergent items imported as copies |
| Interrupted saves do not corrupt existing documents | ✅ | Unit: failing write inside transaction leaves previous record and version intact; stale writes rejected |

## Classroom (Phase 2–3) — ⬜ not started

Teacher account · Student account · Classroom invitation · Assignment distribution · Student submission · Teacher review · Private data protection.

## Platforms

| Criterion | Status |
|---|---|
| Web application passes browser tests | 🟡 Chromium by hand; automated browser tests not yet added |
| macOS desktop build | ⬜ Tauri config in place; needs Rust toolchain (Phase 5) |
| Windows desktop build | ⬜ Phase 5 |
| Android application | ⬜ Capacitor config in place (Phase 5) |
