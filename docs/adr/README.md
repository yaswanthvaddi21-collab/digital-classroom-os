# Architecture decision records

Each record states one decision: the problem, what was decided, what it costs, and how it is verified. A decision that is replaced gets a new record that supersedes the old one; a record may be extended in place when a later phase adds to the same decision, and its status line says when.

| # | Decision | Status |
|---|---|---|
| [0001](0001-local-first-storage.md) | Local-first: each device keeps its own database behind one storage interface | Accepted (v0.1.0, revised in Phase 3) |
| [0002](0002-identity-ownership-privacy.md) | UUID identifiers, device ownership today, private by default | Accepted (Phase 3) |
| [0003](0003-optimistic-concurrency.md) | Optimistic concurrency: a stale write is refused, never merged silently | Accepted (v0.1.0) |
| [0004](0004-autosave-and-drafts.md) | Autosave pipeline: one queue, failures classified, edits kept as drafts per session | Accepted (Phase 3) |
| [0005](0005-version-history.md) | Version history: 50 per item, protected versions, large images stored once | Accepted (Release 0.2, extended in Phase 3) |
| [0006](0006-migrations-and-safety-copies.md) | Migrations only add, run after a verified safety copy, one tab at a time | Accepted (Release 0.2, hardened in Phase 2) |
| [0007](0007-backup-format.md) | Backups: one validated JSON file that never overwrites and can be restored twice | Accepted (Release 0.2, hardened in Phases 2 and 3, extended in Phase 5) |
| [0008](0008-attachments.md) | Attachments: content-addressed, cleaned up only when provably unused | Accepted (Phase 3) |
| [0009](0009-cross-tab-coordination.md) | Cross-tab coordination: change notices, holds, locks, and stopping after an upgrade | Accepted (Release 0.2, extended in Phases 2 and 3) |
| [0010](0010-soft-delete-and-recovery.md) | Soft delete, purge, and recovering edits to deleted items | Accepted (v0.1.0, extended in Phase 3) |
| [0011](0011-document-format-phase4.md) | Document format in Phase 4: schema 2 from a frozen v0.1.0 vocabulary, comments and sections in the content, equations as LaTeX, approximations reported | Accepted (Phase 4) |
| [0012](0012-diagram-format-phase5.md) | Diagram format in Phase 5: schema 3 from a frozen schema-2 vocabulary; groups as React Flow parent nodes, layers, waypoints, ports, the `.dcosdiagram` file and the diagrams.net mapping | Accepted (Phase 5 Round 1, extended in Rounds 2 and 3) |
| [0013](0013-document-diagram-integration.md) | Document and diagram integration in Phase 6: document schema 3 from a frozen Phase 5 vocabulary, null-default diagram attributes (alignment, caption, alt text, SVG preview), off-screen previews through `DiagramHost.renderPreview`, editable diagram data in PNG previews; dialog drafts kept until `settle`, the `.dcosdoc` file, SVG with PNG fallback in exports | Accepted (Phase 6 Round 1, extended in Rounds 2 and 3) |
| [0014](0014-presentation-studio.md) | Presentation Studio in Phase 7: one database at version 3 (older builds fail closed), every store list derived from the kind registry, presentations in format-2 backups, presentation content schema 1 with a frozen vocabulary and protected view, `@dcos/presentation-studio` importing only `@dcos/ui` with app-supplied diagram and image hosts | Accepted (Phase 7 Round 1, extended in Rounds 2 and 3) |
