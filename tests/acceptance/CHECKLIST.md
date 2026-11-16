# MVP acceptance checklist

> **Not re-run since 2026-11-12 (note added 2026-11-16).** Nothing in this checklist has been re-checked since the run recorded below, and it does not yet cover the later v0.2 work: Document Studio (v0.2 Phase 4), Diagram Studio (Phase 5), document–diagram integration (Phase 6) or Presentation Studio (Phase 7). The ✅ marks are the 2026-11-12/13 results, not the state of the current build. Extending it to those modules and re-running it is listed as open in the AE-P2 report ([docs/advanced-edition/AE-P2_REPORT.md](../../docs/advanced-edition/AE-P2_REPORT.md)); until then the automated suites in docs/TESTING.md are the evidence for those modules. The phase numbers in the rows below are the old plan's: Classroom is now AE-P9 and the native platforms AE-P14 ([roadmap](../../docs/advanced-edition/ADVANCED_EDITION_PRODUCT_ROADMAP.md) §5.3).

Status of PRD §11 criteria. ✅ verified · 🟡 partly verified · ⬜ not started (later phase).
"Unit" means covered by Vitest; "E2E" means covered by Playwright in Chromium, WebKit and mobile Chromium (Firefox in CI only); "Browser" means checked by hand.

Last run: 2026-11-12, web app on `localhost:5173`. Re-assessed by the Release 0.2 audit on 2026-11-13 (see `docs/audit/RELEASE-0.2-AUDIT.md`), and updated after the 0.2 fixes, the diagram integration and quick connect (2026-11-13).

## Documents

| Criterion | Status | Evidence |
|---|---|---|
| Document creation works | ✅ | Browser: created from Assignment template |
| Editing works | ✅ | Browser: typed, formatted, find & replace all |
| Autosave works | ✅ | Browser: "Saved on this device" after edits; debounced 600 ms |
| Offline persistence works | ✅ | E2E (Chromium): app loads with the network off after the first visit; a document created and edited offline survives reload |
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

## Diagram integration and quick connect (added in 0.2)

| Criterion | Status | Evidence |
|---|---|---|
| Diagram tab inserts an editable diagram into a document | ✅ | E2E: insert from template, stored as source + separate PNG preview, reopen |
| Double-click edits the embedded diagram | ✅ | E2E: edit, save, preview re-rendered, width kept |
| Size and aspect ratio preserved | ✅ | E2E: corner resize keeps the ratio; Unit: DOCX picture at document size |
| Cancelling inserts nothing | ✅ | E2E |
| diagrams.net import and export | ✅ | Unit: plain and compressed files, round trip; E2E: import into a document and into Diagram Studio, export back |
| UML class, ER, actor and package shapes with markers | ✅ | Unit: templates and markers; Browser: rendered and edited |
| Quick connect: click, drag-to-connect, palette, keyboard, touch | ✅ | E2E: placement without overlap, selection, duplicate refused, zoom/pan/move tracking, undo/redo, Alt+Shift+Arrow, touch tap. Dragging an arrow with touch is not yet tested |
| Exported DOCX with diagrams opens in Word | ⬜ | Not yet opened in Microsoft Word |

## Storage

| Criterion | Status | Evidence |
|---|---|---|
| Local data survives application restart | ✅ | E2E (Chromium): data survives closing and relaunching the browser with a persistent profile. The app asks for persistent storage once there is data, and the Dashboard shows whether it was granted. Eviction by the browser is still possible when not granted; backups are the remedy |
| Editing works offline | ✅ | E2E (Chromium): documents edited and diagrams embedded with the network off |
| Backup and recovery are tested | ✅ | Unit: export → import into empty DB; divergent items imported as copies. 0.2 fixes: full validation before import, re-import adds nothing, attachments included, backup version independent of the DB version (STOR-5/6/13) |
| Interrupted saves do not corrupt existing documents | 🟡 | Unit: a failing write inside a transaction leaves the previous record and version intact; stale writes rejected. 0.2 fixes, unit-tested: pending edits flush on hide and unmount, failed saves retry and then keep a recoverable draft, edits made during a conflict are kept (CODE-2, STOR-8). A forced tab kill during the 600 ms delay can still lose up to 600 ms of typing |

## Classroom (Phase 2–3) — ⬜ not started

Teacher account · Student account · Classroom invitation · Assignment distribution · Student submission · Teacher review · Private data protection.

## Platforms

| Criterion | Status |
|---|---|
| Web application passes browser tests | 🟡 Playwright passes in Chromium, WebKit and mobile Chromium; Firefox runs in CI only (it won't launch on the local macOS 27 machine) |
| macOS desktop build | ⬜ Tauri config in place; needs Rust toolchain (Phase 5) |
| Windows desktop build | ⬜ Phase 5 |
| Android application | ⬜ Capacitor config in place (Phase 5) |
