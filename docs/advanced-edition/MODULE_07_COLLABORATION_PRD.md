# Module 07: Collaboration Workspace (PRD)

This document specifies the Collaboration Workspace (module M07, prefix COL) for the Advanced Edition: shared workspaces, sharing with view, comment and edit permissions, invitations and revocation, presence and live cursors, concurrent editing, shared version history, conflict detection, reconnection and recovery. It also records the required evaluation of Yjs against the project's current optimistic-concurrency model, and the design for collaboration over a local Wi-Fi network with an optional self-hosted relay. Collaboration must stay optional: editing works offline and alone exactly as today, personal items stay private until their owner shares them, and no conflict may silently overwrite anyone's work. Today only the local, single-device foundations exist. The module is built in **AE-P10**.

Status: AE-P1 draft for owner approval (2026-11-15)

Related documents (this folder):
[Product roadmap](ADVANCED_EDITION_PRODUCT_ROADMAP.md) ·
[System architecture](SYSTEM_ARCHITECTURE.md) ·
[Database and sync architecture](DATABASE_AND_SYNC_ARCHITECTURE.md) ·
[Security and privacy plan](SECURITY_AND_PRIVACY_PLAN.md) ·
[Module dependency map](MODULE_DEPENDENCY_MAP.md) ·
[Acceptance criteria](ACCEPTANCE_CRITERIA.md) ·
[Risk register](RISK_REGISTER.md) ·
[Release strategy](RELEASE_STRATEGY.md) ·
[Dependency and licence plan](DEPENDENCY_AND_LICENCE_PLAN.md) ·
[M06 Classroom Hub](MODULE_06_CLASSROOM_HUB_PRD.md) ·
[M01 Document Studio](MODULE_01_DOCUMENT_STUDIO_PRD.md) ·
[M02 Diagram Studio](MODULE_02_DIAGRAM_STUDIO_PRD.md) ·
[M03 Presentation Studio](MODULE_03_PRESENTATION_STUDIO_PRD.md) ·
[M08 File Manager](MODULE_08_FILE_MANAGER_PRD.md) ·
[M09 Dashboard](MODULE_09_DASHBOARD_PRD.md)

Phase naming: "AE-Pn" is an Advanced Edition phase; "v0.2 Phase n" is the earlier programme.

---

## Current state

Copied from the canonical planning brief (§2, M07) and spot-checked against HEAD `edc2672`.

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| COL-FR-001 | Shared workspaces | Absent | — |
| COL-FR-002 | Document sharing | Absent | — |
| COL-FR-003 | View permissions | Absent | — |
| COL-FR-004 | Edit permissions | Absent | — |
| COL-FR-005 | Invite | Absent | — |
| COL-FR-006 | Revoke | Absent | — |
| COL-FR-007 | Live cursors | Absent | — |
| COL-FR-008 | Presence | Absent | — |
| COL-FR-009 | Comments | Partial | Local document comments only; authors are free text (`packages/document-studio/src/review/comments.ts:12`) |
| COL-FR-010 | Concurrent editing | Absent | No Yjs |
| COL-FR-011 | Version history | Partial | Local, per device |
| COL-FR-012 | Conflict detection | Partial | Local optimistic concurrency only (`packages/local-storage/src/indexeddb.ts:735-776`; ADR 0003) |
| COL-FR-013 | Reconnection | Absent | — |
| COL-FR-014 | Recovery after disconnection | Absent | Local drafts and emergency drafts can be reused |
| COL-FR-015 | Yjs and sync architecture evaluation | Absent | — |
| COL-FR-016 | Local Wi-Fi collaboration | Absent | — |
| COL-FR-017 | Personal documents private unless shared | Done | By construction; `e2e/privacy.spec.ts`; ADR 0002 |
| COL-FR-018 | Offline editing never depends on the network | Done | ADR 0001; `e2e/storage.chromium-only.spec.ts` |

The sync engine (`packages/sync-engine`) is a README-only stub ("Not started"; old phase label "Phase 3–4"). `backend/synchronization/` holds an empty `__init__.py` and a README marked "Planned". No Yjs package or any `y-*` package is installed (no `node_modules/yjs` entry in `package-lock.json`; no collaboration extension under `node_modules/@tiptap`, checked 2026-11-15).

Facts that shape this module (verified in the code):

| Fact | Evidence | Consequence |
|---|---|---|
| Every content/title save bumps an integer `version`; a stale `expectedVersion` throws `ConflictError` inside one transaction | `indexeddb.ts:735-751`; ADR 0003 | Works per device. Integers are not comparable across devices (R-008) |
| Favourite and trash changes do not move `version` or `updatedAt` | ADR 0003; `indexeddb.ts:759-761` (favourite patch in `save`), `:818-840` (`trash`, `restore`, `updateMetadata`) | Metadata cannot be ordered across devices without `metaUpdatedAt` (DB v4, D-35) |
| Purge is a hard delete with no tombstone | `indexeddb.ts:842-868` | Deletions cannot propagate without tombstones (DB v4, D-35) |
| Cross-tab coordination by BroadcastChannel `dcos-storage` and Web Locks | BroadcastChannel `apps/web/src/lib/storage.ts:171-179`; Web Locks `packages/local-storage/src/indexeddb.ts:373-374`; ADR 0009 | Same-device only |
| Drafts per session, emergency drafts in localStorage (cap 2 × 1024 × 1024 characters) | `indexeddb.ts:1055-1080`; `storage.ts:49-55` (`EMERGENCY_DRAFT_MAX_CHARS`) | Reusable for offline buffering of unsent edits |
| Version history: auto snapshot at most every 10 min, 50 per item; the creation version, the newest manual save and the newest restore point are never pruned | `indexeddb.ts:48-54` | Shared history needs host-side snapshots |
| Document content = `{ schemaVersion, doc (ProseMirror JSON), page, mode, comments?, language? }` | `packages/document-studio/src/types.ts:27-38` | Only `doc` maps naturally onto a ProseMirror CRDT binding; the rest needs a map |
| Comment entries refuse unknown fields | `review/comments.ts:37-38` | Adding an author user id is a document schema change; older builds open such documents read-only |
| Editor undo is StarterKit UndoRedo, in memory | `packages/document-studio/src/extensions/index.ts:35-38` (`StarterKit.configure`) | A CRDT binding needs its own undo manager instead |
| Diagram node and edge ids are a prefix plus 8 hex characters | `packages/diagram-studio/src/editor/mutations.ts:12-13` | Too weak for merging (R-015); AE-P5 lengthens them |
| Presentation element ids are full UUIDs | `packages/presentation-studio/src/create.ts:16-18` | Suitable for keyed CRDT maps |

---

## 1. Product objectives

1. Let a user share a specific item (first documents, then diagrams and presentations per D-16) with named people, as view, comment or edit, and take that access back.
2. Let several people edit one shared document at the same time with visible presence and cursors, on a classroom's local network without internet access, and optionally through a self-hosted relay (D-15).
3. Never lose or silently overwrite work: concurrent edits merge or produce a visible conflict copy; a reconnecting device's offline edits are kept.
4. Keep the local-first core unchanged: no account, host or network is needed for personal use (COL-FR-018); nothing is sent until the owner shares it (COL-FR-017).
5. Make an evidence-based choice of sync architecture (COL-FR-015) before building, using a spike in AE-P10 that tests the platform constraints in ADR-0022.
6. Reuse the identity, permission and host infrastructure built for M06 (SVC-ID, SVC-PERM, SVC-SYNC); define no second account system.

Out of scope: hosted or paid relay services; public share links readable without an account (D-51); real-time audio or video; chat; AI assistance; co-editing of PDFs (M05) and notebooks (M04) in v1.0.0 unless D-16 says otherwise.

---

## 2. User stories

| ID | As a … | I want to … | So that … | Requirements |
|---|---|---|---|---|
| US-COL-01 | student | share my document with two classmates as editors | we write a group report together | COL-FR-002, 004, 005 |
| US-COL-02 | teacher | share a worksheet view-only with a class | they can read it but not change my copy | COL-FR-002, 003 |
| US-COL-03 | reviewer | be able to comment without editing | I can give feedback safely | COL-FR-009, 019 |
| US-COL-04 | owner | remove someone's access | they stop receiving and sending changes | COL-FR-006 |
| US-COL-05 | group | have a shared workspace with several items | the group's material is in one place | COL-FR-001 |
| US-COL-06 | co-author | see who else is in the document and where they are typing | we do not edit the same paragraph by accident | COL-FR-007, 008 |
| US-COL-07 | co-author | keep typing when the Wi-Fi drops | my work continues and joins up later | COL-FR-010, 013, 014, 018 |
| US-COL-08 | co-author | be told clearly when my changes could not be merged automatically, and keep both versions | nothing I wrote disappears | COL-FR-012, 020 |
| US-COL-09 | co-author | open a shared document's history, see who changed it and restore an earlier version | mistakes can be undone | COL-FR-011 |
| US-COL-10 | user at home | keep using all my personal items with no host and no account | collaboration never gets in my way | COL-FR-017, 018 |
| US-COL-11 | teacher | run collaboration on the classroom host without internet | it works in a school with restricted internet | COL-FR-016 |
| US-COL-12 | owner | stop sharing and keep my item as a private item again | I control my work | COL-FR-006, 021 |

---

## 3. Functional requirements

IDs run from 001 (brief §4.2). COL-FR-001 to 018 are fixed by the brief. Requirements 019 onwards are added by this PRD, each marked with the brief bullet it derives from.

| ID | Requirement | Current status | Evidence (anything not Absent) |
|---|---|---|---|
| COL-FR-001 | Shared workspaces: a named space on a host with members (roles owner, editor, commenter, viewer) and a list of items shared into it; membership grants the workspace role on each item unless a per-item grant is narrower. Shown on devices as "Shared" in the File Manager (M08). | Absent | — |
| COL-FR-002 | Document sharing: the owner shares an item with users or a workspace. Sharing publishes the item's current version to the host; the owner's local item becomes the device's copy of the shared item (same item id), not a duplicate. | Absent | — |
| COL-FR-003 | View permission: viewers receive updates and can read, export and copy the item into their own workspace; their clients cannot send content updates, and the host rejects any they send. | Absent | — |
| COL-FR-004 | Edit permission: editors send and receive content updates; only the owner can change sharing, delete the shared item or stop sharing. | Absent | — |
| COL-FR-005 | Invite users: by account on the same host (search within the caller's classrooms or workspaces) or by an invitation code with a role and an expiry; invitations can be withdrawn before acceptance. | Absent | — |
| COL-FR-006 | Revoke access: the owner removes a person's or workspace's grant; the host closes their live connection immediately and refuses further updates. What happens to the revoked user's local cached copy follows owner decision D-50; it is never silently deleted without the user being told. | Absent | — |
| COL-FR-007 | Live cursors: each participant's caret and selection shown in the document with their display name and colour; for diagrams and presentations (when enabled by D-16) the selected shapes or elements are outlined. | Absent | — |
| COL-FR-008 | Presence indicators: list of people currently connected to the item (and to the workspace), idle state, and a "following" option to scroll to a person's cursor. Presence is never stored or logged. | Absent | — |
| COL-FR-009 | Comments: comment threads on shared items sync to all participants with author identity from SVC-ID; commenters can add and reply; resolving follows the role rules. | Partial | Local single-user threads with replies and resolve exist for documents (`review/comments.ts:10-24`; `review/CommentsPanel.tsx`; `e2e/review.spec.ts:43`). Authors are free text from Settings (`apps/web/src/lib/preferences.ts:8`); not synced; documents only. |
| COL-FR-010 | Concurrent editing: two or more editors change the same shared document at the same time; all replicas converge to the same content; each user's undo affects only their own changes. Documents first; diagrams and presentations per D-16. | Absent | — |
| COL-FR-011 | Version history for shared items: host-side snapshots (on a timer, on explicit save, before a restore, before merging a large offline batch), each listing contributors; any participant with edit rights can restore, which creates a new version and never deletes history. | Partial | Local per-device history exists: `apps/web/src/components/EditorFrame.tsx:398-472`; `indexeddb.ts:778-806`, `:876-911`; ADR 0005. Not shared, no contributor list, no preview or compare. |
| COL-FR-012 | Conflict detection: (a) for live co-edited items, detect when merged state would break a content rule (schema or validation failure after merge) or when a device returns after a long offline period beyond a set threshold; (b) for item-level sync (non co-edited shared items and metadata), a stale `base_version` returns 409. Every detected conflict produces a conflict record and keeps both versions. | Partial | Local optimistic concurrency (`indexeddb.ts:735-776`; ADR 0003; conflict and "save as a copy" tests at `apps/web/src/lib/storage.test.tsx:72`, `:89`). Nothing across devices. |
| COL-FR-013 | Reconnection: automatic reconnect with backoff and jitter after network loss, host restart or device sleep; resumes from the last known state without resending the whole item; status always visible. | Absent | — |
| COL-FR-014 | Recovery after disconnection: edits made while disconnected are stored locally and durable across app restarts; on reconnection they are merged (live items) or replayed from the operation queue (item sync); if they cannot be applied, they become a conflict copy. | Absent | Reusable pieces: session drafts (`indexeddb.ts:1055-1080`) and emergency drafts (`apps/web/src/lib/storage.ts:47-123`). |
| COL-FR-015 | Yjs and sync architecture evaluation: a written comparison (§7.1) plus an AE-P10 spike with recorded results on Chromium, WebKit/Safari, Firefox, a Tauri webview and Android WebView where available, before integration starts. | Absent | — |
| COL-FR-016 | Local Wi-Fi collaboration: works on a LAN with no internet through the classroom host relay (D-13, D-14); pairing by address, join code or QR; mDNS discovery only on native, if approved. | Absent | — |
| COL-FR-017 | Personal documents remain private unless explicitly shared: no item, title or metadata leaves the device until the owner shares it; unsharing stops all further transfer. | Done (v0.2) | By construction: nothing can be shared. `e2e/privacy.spec.ts:8` fails on any request or WebSocket to another origin while creating, editing, autosaving and exporting a document and a diagram and exporting a backup; ADR 0002, Decision item 3. Recorded passing in Chromium and WebKit on 2026-11-15 (docs/audit/RELEASE_GAPS.md §11); Firefox not run. Does not cover presentations (no presentation step in the spec). Re-verify in AE-P10 with sharing present. |
| COL-FR-018 | Offline editing never depends on network availability: all editors, autosave, history and export work with no host and with a host that becomes unreachable mid-session. | Done (v0.2) | ADR 0001; `e2e/storage.chromium-only.spec.ts:7` (offline after first visit), `:46` (diagram embed offline); Chromium only (WebKit and Firefox projects ignore `chromium-only`, `playwright.config.ts:24-25`); recorded passing 2026-11-15. Does not cover presentations. Re-verify with a live session cut. |
| COL-FR-019 | (added; from "View/Edit permissions") Comment permission: commenters can add and reply to comments but not change content. | Absent | — |
| COL-FR-020 | (added; from "Conflict detection") Conflict records and resolution UI: a list of open conflicts per item with "keep mine as a copy", "keep theirs", "open both side by side"; resolving never deletes a version. Reuses the "Keep my edits as a copy" pattern (ADR 0003). | Absent | Local pattern only (ADR 0003). |
| COL-FR-021 | (added; from "Revoke access") Stop sharing: the owner ends sharing; collaborators lose access; the owner's item returns to a private item with the full merged content and history. | Absent | — |
| COL-FR-022 | (added; from "Concurrent editing") Schema compatibility handshake: a client may join a live session for editing only if it knows the item's content schema and vocabulary; otherwise it joins read-only with the existing protected view and is told to update. | Absent | Protected view exists per kind (`packages/document-studio/src/safety.ts:48`; `packages/presentation-studio/src/safety.ts:230`; `packages/diagram-studio/src/editor/useDiagramState.ts:24`). |
| COL-FR-023 | (added; from "Shared workspaces") Shared-item metadata (title, trash, membership) syncs through item-level sync with tombstones and `metaUpdatedAt` (ADR-0021 part 1; D-35). | Absent | — |
| COL-FR-024 | (added; from "Invite/Revoke") Sharing audit: grants, revocations, invitations and restores are recorded on the host (who, when, what), visible to the owner. | Absent | — |
| 025… | Reserved | — | — |

---

## 4. Non-functional requirements

Performance numbers are **proposed targets, to be measured** (brief §7.1, D-29).

| ID | Requirement | Measure / note |
|---|---|---|
| COL-NFR-001 | Offline-first: a live session that loses the network continues locally with no error dialog and no blocked typing; autosave to IndexedDB continues at the existing cadence (600 ms debounce, `storage.ts:689`). | e2e network-cut test |
| COL-NFR-002 | No silent overwrite: no code path replaces a whole item's content from a remote source without either a CRDT merge or a preserved copy/version of the local state. | Code review checklist + tests in §11 |
| COL-NFR-003 | Convergence: after any interleaving of edits, disconnections and reconnections, all replicas reach identical canonical JSON. | Randomised (fuzz) convergence test, seeded and reproducible |
| COL-NFR-004 | Propagation latency (PERF-012, proposed): ≤ 250 ms p95 from keystroke on one client to render on another, 30 clients on one host on the reference LAN. | Measurement in AE-P10 |
| COL-NFR-005 | Typing latency while co-editing (proposed): stays within PERF-004 (≤ 50 ms p95) with 10 active editors on a 50-page document. | Measurement |
| COL-NFR-006 | Recovery time (proposed): after a 10-minute disconnection with 2,000 local edits, reconnection and merge complete in ≤ 5 s on reference hardware; PERF-013 applies to crash recovery. | Measurement |
| COL-NFR-007 | Storage growth (proposed): the CRDT state for a shared document stays ≤ 3× the size of its canonical JSON after 10,000 edits, using compaction/snapshots. | Measurement |
| COL-NFR-008 | Security: every connection authenticated (SVC-ID); every update authorised per item and role on the host (SVC-PERM) before it is relayed or stored; transport encrypted (HTTPS/WSS) per D-14; presence data never persisted. | SEC criteria in [SECURITY_AND_PRIVACY_PLAN.md](SECURITY_AND_PRIVACY_PLAN.md) |
| COL-NFR-009 | Privacy: the relay sees only items shared with it; personal items generate no traffic; the privacy e2e is extended so traffic goes only to the configured host and only for shared items. | e2e request capture |
| COL-NFR-010 | Compatibility: shared items still export to DOCX/ODT/PDF (and PPTX, .drawio, etc.) with the same results as an equivalent personal item. | Golden comparison |
| COL-NFR-011 | Resource limits: maximum participants per item and maximum update size enforced by the host (values set in AE-P10 after measurement); oversized updates refused, not truncated. | Integration test |
| COL-NFR-012 | Accessibility: presence changes announced politely to screen readers (not on every keystroke); cursor labels have sufficient contrast in both themes; all sharing flows keyboard-only (A11Y-001, WCAG 2.2 AA). | e2e + manual |
| COL-NFR-013 | Licence and maintenance: every library is permissively licensed and passes the dependency review in [DEPENDENCY_AND_LICENCE_PLAN.md](DEPENDENCY_AND_LICENCE_PLAN.md); no Tiptap Pro or paid extension (the boundary test already fails if `package-lock.json` contains `@tiptap-pro/`, `tests/integration/boundaries.test.ts:44-45`; a Pro package published under another scope would not be caught). | Licence gate |

---

## 5. UI/UX requirements

| ID | Requirement |
|---|---|
| COL-UX-001 | A "Share" button in each eligible editor's header (hidden for kinds not enabled by D-16 and when no host is connected; D-31). |
| COL-UX-002 | Share dialog: people and workspaces with their role, add by name or invitation code, change role, remove, "Stop sharing". It states plainly what sharing does ("A copy of this document will be stored on *Host name* and kept up to date"). |
| COL-UX-003 | Connection badge in shared editors: Live, Reconnecting (with attempt countdown), Offline – your changes are saved on this device, Read-only (role or schema), Access removed. The existing save-status badge stays and keeps meaning "saved on this device". |
| COL-UX-004 | Presence avatars in the editor header with names on hover/focus; a participant list; click to follow. |
| COL-UX-005 | Cursor and selection colours drawn from a palette with contrast checked in light and dark themes; labels fade when idle. |
| COL-UX-006 | Conflict banner when a conflict record exists, linking to the resolution view (COL-FR-020); never a modal that blocks typing. |
| COL-UX-007 | File Manager "Shared with me" and "Shared by me" views and a sharing icon on rows (implemented with M08). |
| COL-UX-008 | History panel for shared items shows contributors per version and labels "before merge" snapshots. |
| COL-UX-009 | Simple mode keeps sharing to "Share" and the participant list; role details and history are in Advanced or behind "More". |
| COL-UX-010 | Editor mode (Simple/Advanced) is a per-user view preference in shared documents and is not synced to others. Today the mode is stored in the document (`packages/document-studio/src/types.ts:32`), so switching it is an edit; in a shared session it must be excluded from synced state. |
| COL-UX-011 | Phone width: share dialog and participant list usable without horizontal scroll. |

---

## 6. Data model

Proposed (ADR-0021, ADR-0022, ADR-0020, ADR-0015; "Proposed, needs approval"). Shared items remain ordinary workspace items locally; sharing adds metadata and a CRDT state store. The schema-versioned JSON stays the canonical persisted content (ADR-0021 part 2).

### 6.1 Host entities

| Entity | Key fields | Notes |
|---|---|---|
| `Workspace` | id, name, ownerUserId, createdAt, archivedAt | COL-FR-001 |
| `WorkspaceMember` | workspaceId, userId, role (`owner`/`editor`/`commenter`/`viewer`), addedAt, removedAt | |
| `SharedItem` | id (a host id, `serverItemId` on the client; the owner's local item id is kept separately as `originItemId`, SYS-037), kind, ownerUserId, title, contentSchemaVersion, mode (`live` / `item-sync`), hostSeq, createdAt, stoppedAt | `live` only for kinds enabled by D-16 |
| `ShareGrant` | id, sharedItemId, subject (`user:<id>` or `workspace:<id>`), role (`view`/`comment`/`edit`), grantedBy, grantedAt, revokedAt | Effective role = narrowest applicable |
| `Invitation` | id, sharedItemId or workspaceId, role, codeHash, expiresAt, acceptedBy, withdrawnAt | |
| `CollabUpdate` (live items) | sharedItemId, seq, update (binary CRDT update), authorUserId, receivedAt | Appended; compacted into `CollabSnapshot` |
| `CollabSnapshot` | sharedItemId, seq, state (binary), canonicalJson (blob ref), schemaVersion, contributors[], reason (`timer`/`manual`/`restore`/`pre-merge`), createdAt | Version history (COL-FR-011) |
| `ItemSyncOp` (item-sync items and metadata) | opId, sharedItemId, op, payload, baseVersion, originDeviceId, authorUserId, hostSeq, status | ADR-0021 part 1; 409 on stale base |
| `ConflictRecord` | id, sharedItemId, kind (`stale-base`/`invalid-after-merge`/`long-offline`/`schema`), localVersionRef, remoteVersionRef, createdAt, resolvedAt, resolution | |
| `AuditEvent` | shared with M06 | Grants, revokes, restores (COL-FR-024) |

### 6.2 Client side (proposed, DB v4+ and later migrations)

| Store / field | Purpose |
|---|---|
| Item metadata `share` (outside the content version, like `lastOpenedAt`) | `{ hostId, serverItemId, serverSeq, baseVersion, mode, role, sharedAt }` as in DATABASE_AND_SYNC_ARCHITECTURE §3.2 (`serverItemId` = the host's `SharedItem.id`, called `sharedItemId` in the host entities and endpoints below; `mode` is `live` or `item-sync`); absent = private |
| `collab_updates` store keyed by `[itemId, seq]` (DATABASE_AND_SYNC_ARCHITECTURE §3.3) | Latest local CRDT state and pending local updates not yet acknowledged by the host. Alternative: `y-indexeddb`, which creates its own IndexedDB database per document; that database would be outside the safety copy, backup and upgrade machinery (ADR 0006/0007), so the default proposal is a store inside `digital-classroom-os`. Decided by the spike. |
| `sync_outbox` store (SVC-SYNC; DATABASE_AND_SYNC_ARCHITECTURE §3.3) | Item-sync ops and metadata ops with retry state; shared with M06 |
| `sync_conflicts` store (DATABASE_AND_SYNC_ARCHITECTURE §3.3, SYN-005) | Local view of conflict records, including conflicts detected before the host is reachable |
| `tombstones`, `metaUpdatedAt` (DB v4, D-35) | Required before any sync |
| Version reason `'pre-merge'` (proposed) | Local snapshot taken before applying a large remote batch after reconnection. `VersionReason` is a closed union today (`types.ts:33`); an older build maps unknown reasons to `'manual'` on backup import (`backup.ts:114`) |

### 6.3 Mapping canonical content to CRDT structures (for the Yjs option)

| Kind | Canonical content | Proposed CRDT shape | Notes |
|---|---|---|---|
| Document | `{ schemaVersion, doc, page, mode, comments?, language? }` (`types.ts:27-38`) | `doc` → `Y.XmlFragment` via the ProseMirror binding; `page`, `language` → `Y.Map`; `comments` → `Y.Map<threadId, Y.Map>`; `mode` not synced (COL-UX-010); `schemaVersion` → session metadata checked by the handshake (COL-FR-022) | Comment author ids need DOCUMENT_SCHEMA 4 (comments refuse unknown fields, `review/comments.ts:37-38`) |
| Diagram (D-16) | `{ schemaVersion, nodes, edges, viewport, settings, layers? }` (`packages/diagram-studio/src/types.ts:179-187`) | `Y.Map<nodeId, Y.Map>`, `Y.Map<edgeId, Y.Map>`, layers as `Y.Array`; `viewport` is per-user view state and is not synced | Needs longer ids first (R-015, AE-P5) |
| Presentation (D-16) | `{ schemaVersion: 1, size, themeId, theme, masters, layouts, slides }`, elements inside slides (`packages/presentation-studio/src/types.ts:441-451`) | slides `Y.Array<Y.Map>`, elements `Y.Map<uuid, Y.Map>`; text boxes as nested `Y.XmlFragment` (they are Tiptap content, `editor/textExtensions.ts`) | Ordering conflicts in slide arrays need tests |

Canonical JSON is derived from the CRDT state on every local persist and validated with the kind's existing checks before it is written; a merged state that fails validation creates a conflict record (COL-FR-012a) and the last valid JSON is kept.

---

## 7. Technical architecture

### 7.1 Sync architecture evaluation (COL-FR-015)

The brief asks to evaluate Yjs against the current optimistic-concurrency model. This is the AE-P1 paper evaluation; the AE-P10 spike confirms or overturns it with recorded results.

| Criterion | A. Current optimistic concurrency + item-level operation queue (ADR 0003 extended, ADR-0021 part 1) | B. Yjs CRDT (y-prosemirror / Tiptap collaboration extension; awareness) | C. Automerge CRDT | D. Edit lease (one editor at a time) |
|---|---|---|---|---|
| Concurrent editing of one document | No: second writer gets 409 and a conflict copy | Yes, character-level merge | Yes | No |
| Presence and cursors | Would need a separate protocol | Awareness protocol included | Separate | Only "who holds the lease" |
| Fits Tiptap 3 / ProseMirror | N/A | Bindings exist (y-prosemirror; Tiptap's collaboration extensions). **Compatibility with Tiptap 3.33.1 unverified** (R-029). Unverified: in Tiptap 3 the cursor extension may have been renamed to a "collaboration caret" package; nothing is installed (`node_modules/@tiptap` has no collaboration package, checked 2026-11-15), so name, licence and compatibility are to verify in the spike | No first-party Tiptap binding known; would need own ProseMirror binding (to verify) | N/A |
| Fits diagrams and presentations | Yes (whole-item) | Needs custom mapping (§6.3) | Needs custom mapping | Yes |
| Offline edits | Replay or conflict copy | Merge on reconnect | Merge on reconnect | Edits blocked without the lease, or forked as copies |
| "Never silently overwrite" | Strong: always a copy | Merges automatically; text is never lost but intent can be (e.g. edit inside text another user deleted). Needs pre-merge snapshots and validation checks | Same as B | Strong |
| Server needs | Plain HTTP (FastAPI) | A relay that speaks the Yjs sync protocol (Python candidates `pycrdt`/`pycrdt-websocket`, or a Node `y-websocket`-compatible server) with an auth hook | Own relay | Plain HTTP + lock expiry |
| New storage | None beyond DB v4 | CRDT state store, compaction | Same | Lease records |
| Undo | Existing in-memory undo | Must switch to the CRDT's undo manager (replaces StarterKit UndoRedo, `extensions/index.ts:35-38`) | Own | Existing |
| Complexity / risk | Low | Medium-high (R-029) | High (less ecosystem fit) | Low, poor UX |
| Licence (reported, to verify) | — | Yjs MIT; y-prosemirror MIT; Tiptap open-source extensions MIT (confirm not Pro), as reported in brief ADR-0022; y-protocols to verify | MIT (reported in brief ADR-0022) | — |

**Proposal (as ADR-0021/0022):** a hybrid. Use A for everything shared that is not explicitly opened for live co-editing (classroom exchange, view-only shares, metadata, non-enabled kinds). Use B only for items explicitly shared for co-editing, documents first (D-16). C is recorded as the alternative if the spike finds B incompatible with Tiptap 3.33. D is the fallback if both fail, with conflict copies. The owner decides scope with D-15 and D-16; this PRD does not.

**Spike exit questions (AE-P10, recorded with date):**

1. Does the ProseMirror binding work with the full M01 extension set (equations, diagram embeds, text boxes, section breaks, comment marks) without dropping attributes? Round-trip every golden document through the binding.
2. Which collaboration and caret extensions exist for Tiptap 3.33.1, under which licence?
3. Can an unknown node type from a newer client be preserved by an older client, or must the handshake force read-only (COL-FR-022)?
4. Which relay (Python `pycrdt-websocket` inside the FastAPI host, or a separate Node process) supports an authorisation check per connection and per update? A Node relay adds a second runtime to the host.
5. Secure-context results: from the GitHub Pages HTTPS build, from an `http://` LAN page, and from an `https://` LAN page with a locally trusted certificate, on Chromium, Safari, Firefox, Tauri WKWebView/WebView2 and Android WebView (ADR-0022 constraints).
6. CRDT state growth and memory for a 200-page document (COL-NFR-007).

### 7.2 Components

| Component | Location | Responsibility |
|---|---|---|
| Sync client (SVC-SYNC) | `packages/sync-engine` (workspace from AE-P9) | Operation queue, retry/backoff, host sequence tracking, 409 → conflict copy; shared with M06 |
| Collaboration client (SVC-COLLAB) | `packages/sync-engine` or a new `packages/collab` (decided in the ADR after the spike) | CRDT documents, provider abstraction (transport), awareness, persistence to `collab_updates`, canonical JSON derivation and validation |
| Editor bindings | Injected into studios by host objects (SVC-HOST pattern; ADR 0013/0014) | Document Studio receives optional collaboration extensions from the app, so `packages/document-studio` does not import the sync packages (boundary test) |
| Share UI | `packages/sync-engine` UI or `apps/web` components | Share dialog, participant list, conflict view |
| Host relay | `backend/synchronization` | WebSocket endpoint with token auth and per-update role check; update log; snapshots; item-sync endpoints |
| Host auth | `backend/authentication` (built in AE-P9 for M06) | Accounts, sessions, roles (ADR-0020) |

### 7.3 Session lifecycle (live co-editing)

1. **Share.** Owner shares → client uploads the current canonical JSON and initial CRDT state → host creates `SharedItem`, grants, initial snapshot.
2. **Open.** Participant opens the item → local persisted state loads immediately (works offline) → provider connects (WSS) with session token → host checks grant and role → schema handshake (COL-FR-022) → state-vector exchange sends only missing updates.
3. **Edit.** Local updates apply to the local CRDT, persist to `collab_updates` and, on the existing autosave cadence, to canonical JSON in the item store (validated). Updates go to the host, which checks the role (view/comment roles cannot send content updates; comment role may change only the comments map), appends, relays.
4. **Disconnect.** Provider moves to Reconnecting; edits continue locally; durable in `collab_updates` and the item store. Emergency drafts still apply.
5. **Reconnect.** Backoff with jitter (proposed: 1 s doubling to 30 s cap; immediate retry on `online` and visibility events) → state-vector exchange → if the incoming batch is large or the device was offline beyond the threshold, take a local `'pre-merge'` version first → merge → validate → on failure, conflict record and keep both.
6. **Revoke / stop sharing.** Host closes the socket with a reason; client switches to "Access removed" (read-only) and applies the owner decision for local copies (D-50).

Same-device tabs: the BroadcastChannel and Web Locks coordination (ADR 0009) stays; tabs of one shared item share one provider or exchange updates over BroadcastChannel so the item store does not see competing saves. The local `ConflictError` path remains as a safety net.

### 7.4 Transport and network

Per ADR-0022 (verify in the spike; R-028):

- The public HTTPS Pages build cannot open `ws://` or `http://` LAN connections (mixed content); Chromium Private Network Access adds limits for public → private requests.
- An `http://<LAN-IP>` page is not a secure context: no service worker, no `crypto.subtle` (attachment SHA-256), no `crypto.randomUUID`, no Web Locks.
- Proposed shape: LAN collaboration first in native apps (Tauri, Capacitor; CSP `connect-src` widened to the paired host only; Android network-security configuration) and in browsers when the classroom host serves the app over HTTPS with a certificate the devices trust (D-14). Pairing by join code or QR; mDNS native-only, if approved.
- WebRTC (`y-webrtc`) is a later option; it still needs a self-hosted signalling server. Remote relay is self-hosted only and optional (D-15). Candidates for deferral are listed in D-36 (WebRTC, remote sync).

### 7.5 Conflict policy (never silently overwrite)

| Situation | Behaviour |
|---|---|
| Two live editors type concurrently | CRDT merge; both edits kept; each user's undo affects own changes only |
| Merge produces content that fails the kind's validation | Keep last valid canonical JSON; create conflict record with both states; banner (COL-UX-006) |
| Device returns after more than the threshold offline (D-52; this PRD suggests 24 h or more than N updates, to be set in AE-P10) | `'pre-merge'` local version, then merge, then a "review changes" notice listing contributors |
| Client schema older than the session's | Read-only join (protected view); no updates sent |
| Item-sync op with stale `base_version` | Host 409 → local conflict copy ("Keep my edits as a copy" pattern) and conflict record |
| Metadata changes (title, trash) from two devices | Ordered by `metaUpdatedAt` + device id; the losing value is kept in the conflict record, not discarded |
| Shared item deleted by owner while a collaborator edits offline | Collaborator's edits saved as a private copy owned by the collaborator; notice shown |
| Restore of an old version by one editor | New version created and broadcast; previous state kept in history |

---

## 8. Dependencies

### 8.1 Modules and shared services

| Depends on | Why |
|---|---|
| SVC-ID, SVC-PERM (ADR-0020; built in AE-P9 for M06) | Accounts, sessions, roles and share grants; no second auth system |
| SVC-SYNC (ADR-0021 part 1) | Item-level sync, operation queue, 409 conflict copies; shared with M06 |
| SVC-COLLAB (ADR-0022) | CRDT provider and awareness; new in AE-P10 |
| SVC-ITEM, SVC-STORE, DB v4 (ADR-0015; D-35) | `metaUpdatedAt`, tombstones, `ownerUserId`, share metadata; must exist before sync work |
| SVC-REF (ADR-0018) | "Shared" entries and links in File Manager and Dashboard; permission checks across hosts |
| SVC-BLOB | Attachments in shared items (images, diagram previews) transferred once per SHA-256 |
| SVC-HOST | Injecting collaboration extensions into editors without breaking package boundaries |
| SVC-ACT | Local activity entries (shared with me, access removed) |
| SVC-UI | Avatars, popovers, tooltips, banners (ADR-0024) |
| M06 | Host, accounts, classrooms as a source of people to share with |
| M01 | First co-editable kind; comment model (DOCUMENT_SCHEMA 4 for author ids) |
| M02, M03 | Later co-editable kinds (D-16); M02 longer ids (AE-P5) |
| M08 | "Shared with me / by me" views (INT-05) |
| M09 | Presence-free activity panels; shared items in recent work |

Integration contract: **INT-08** (share documents and diagrams through Collaboration), owned by M07, specified in [MODULE_DEPENDENCY_MAP.md](MODULE_DEPENDENCY_MAP.md).

### 8.2 Libraries (all **candidates**, licence to verify; none is installed; no versions given)

| Candidate | Use | Reported licence (to verify) | Notes |
|---|---|---|---|
| `yjs` | CRDT | MIT | Check maintenance and security record |
| `y-prosemirror` | ProseMirror binding | MIT | Or via the Tiptap extension |
| `@tiptap/extension-collaboration` and the Tiptap 3 caret/cursor extension | Tiptap binding, cursors | MIT reported | Confirm open-source (not Pro) and compatible with Tiptap 3.33.1 (R-029) |
| `y-protocols` (sync, awareness) | Wire protocol, presence | to verify (not reported in the brief) | |
| `lib0` | Yjs dependency | to verify (not reported in the brief) | Comes with Yjs; part of the transitive tree the licence gate must cover |
| `y-indexeddb` | Offline persistence | MIT | Separate IndexedDB per document; see §6.2 |
| `y-websocket` (client provider; server as a separate Node process) | Transport | MIT | Server-side auth hook to verify |
| `pycrdt`, `pycrdt-websocket` | Python CRDT relay in FastAPI | MIT reported | Fits the Python host (D-13) |
| `y-webrtc` | Peer transport | MIT | Needs self-hosted signalling; deferral candidate (D-36) |
| `@automerge/automerge` | Alternative CRDT | MIT | Record only |

### 8.3 Owner decisions this module needs

Existing: **D-13** (host), **D-14** (LAN security), **D-15** (remote sync), **D-16** (co-editing scope), **D-34** (backup encryption), **D-35** (tombstones and `metaUpdatedAt` in DB v4), **D-36** (scope cuts), **D-31** (hide unavailable UI).

Decisions raised by this PRD and numbered in [ADVANCED_EDITION_PRODUCT_ROADMAP.md](ADVANCED_EDITION_PRODUCT_ROADMAP.md) (all block AE-P10):

- **D-50** After revocation, does the former collaborator keep a private read-only copy of the last state they had, or is the cached copy removed from their device (with notice)? (A device cannot be forced to delete data it already has.)
- **D-51** Are view-only links usable without an account on the host, or are all shares to named accounts? (This PRD assumes named accounts.)
- **D-52** Offline threshold that triggers a pre-merge snapshot and a review notice.
- **D-53** Whether shared items' host data (updates, snapshots) is included in the host backup by default, and retention after stop-sharing.

---

## 9. API/interface contracts

Interface requirements use `COL-IF-NNN`. `ItemRef`, `SessionInfo`, `PermissionCheck` and `QueuedOperation` belong to SVC-REF, SVC-ID, SVC-PERM and SVC-SYNC and are referenced, not redefined.

### COL-IF-001: Sharing service (client)

```ts
type Role = 'view' | 'comment' | 'edit';
type HostId = string;
type Iso = string;

interface ShareInfo {
  hostId: HostId; sharedItemId: string; mode: 'live' | 'item-sync';
  myRole: Role | 'owner';
  grants: { subject: { type: 'user' | 'workspace'; id: string; name: string }; role: Role; grantedAt: Iso }[];
}

interface SharingService {
  shareInfo(itemId: string): Promise<ShareInfo | null>;                      // null = private
  share(itemId: string, hostId: HostId, grants: { subject: string; role: Role }[], mode?: 'live' | 'item-sync'): Promise<ShareInfo>;
  setRole(itemId: string, subject: string, role: Role): Promise<void>;
  revoke(itemId: string, subject: string): Promise<void>;
  createInvitation(itemId: string, role: Role, expiresAt: Iso): Promise<{ code: string }>; // shown once
  acceptInvitation(hostId: HostId, code: string): Promise<{ itemId: string }>;
  stopSharing(itemId: string): Promise<void>;
  sharedWithMe(hostId?: HostId): Promise<{ itemId: string; title: string; kind: string; role: Role; owner: string }[]>;
}
```

### COL-IF-002: Collaboration session (client, SVC-COLLAB)

```ts
type ConnectionState =
  | { state: 'live' }
  | { state: 'reconnecting'; attempt: number; nextAttemptAt: Iso }
  | { state: 'offline' }                       // edits stored locally
  | { state: 'read-only'; reason: 'role' | 'schema-newer' | 'schema-older' }
  | { state: 'revoked' };

interface Participant { userId: string; displayName: string; colour: string; idle: boolean; cursor?: unknown /* kind-specific anchor */ }

interface CollabSession {
  readonly itemId: string;
  readonly connection: ConnectionState;
  participants(): Participant[];
  onChange(cb: (e: { connection?: ConnectionState; participants?: Participant[]; conflict?: ConflictRecord }) => void): () => void;
  /** Kind-specific editor binding, injected by the app host (e.g. Tiptap extensions for documents). */
  editorBinding(): unknown;
  /** Writes validated canonical JSON to the item store; used by autosave. */
  canonicalContent(): { schemaVersion: number; content: unknown; valid: boolean; problem?: string };
  snapshot(reason: 'manual' | 'restore'): Promise<void>;
  close(): Promise<void>;
}

interface CollabService {
  open(itemId: string): Promise<CollabSession>;   // never rejects for network reasons; starts 'offline' or 'reconnecting'
  supportsLive(kind: string): boolean;             // per D-16
}
```

### COL-IF-003: Transport provider (pluggable)

```ts
interface CollabTransport {
  readonly name: 'lan-relay' | 'remote-relay' | 'webrtc';
  connect(params: { hostId: HostId; sharedItemId: string; token: () => Promise<string>; schema: { kind: string; version: number; vocabulary: string } }): void;
  send(update: Uint8Array): void;
  onUpdate(cb: (update: Uint8Array, origin: 'remote') => void): void;
  onAwareness(cb: (states: Map<number, unknown>) => void): void;
  setAwareness(state: unknown): void;
  disconnect(reason?: string): void;
}
```

### COL-IF-004: Conflict records

```ts
interface ConflictRecord {
  id: string; itemId: string;
  kind: 'stale-base' | 'invalid-after-merge' | 'long-offline' | 'schema' | 'metadata';
  local: { versionId: string } ; remote: { versionId?: string; hostSeq?: number };
  createdAt: Iso; resolvedAt?: Iso;
  resolution?: 'kept-local-copy' | 'kept-remote' | 'kept-both' | 'restored';
}
interface ConflictService {
  list(itemId?: string): Promise<ConflictRecord[]>;
  resolve(id: string, choice: 'keep-mine-as-copy' | 'keep-theirs' | 'keep-both'): Promise<void>; // never deletes a version
}
```

### COL-IF-005: Host endpoints (under `/api/v1`; auth required; deny by default; WSS/HTTPS per D-14)

| Method and path | Role | Notes |
|---|---|---|
| `POST /shared-items` | item owner | Creates `SharedItem` with initial canonical JSON and state |
| `GET /shared-items/{id}`, `GET /shared-with-me` | grantee | |
| `PUT /shared-items/{id}/grants/{subject}`, `DELETE …` | owner | Revocation closes live sockets |
| `POST /shared-items/{id}/invitations`, `POST /invitations/accept` | owner / invitee | Codes stored hashed |
| `DELETE /shared-items/{id}` (stop sharing) | owner | |
| `GET /shared-items/{id}/history`, `POST /shared-items/{id}/restore` | grantee / editor | |
| `WSS /collab/{sharedItemId}` | grantee | Token on connect; schema handshake; per-update role check; awareness relayed, not stored |
| `POST /sync/push`, `GET /sync/pull?since=` | grantee | Item-sync ops (ADR-0021 part 1), 409 on stale base |
| `GET/POST /workspaces`, `…/members` | members / owner | COL-FR-001 |

### COL-IF-006: Editor host injection

```ts
/** Given to Document Studio (and later Diagram/Presentation Studio) by the app, so studio packages never import sync code. */
interface CollaborationHost {
  extensionsFor(itemId: string): unknown[] | null;  // e.g. collaboration + caret extensions; null when private
  undoMode(itemId: string): 'local-history' | 'collab-undo';
  userInfo(): { name: string; colour: string; userId?: string };
}
```

---

## 10. Acceptance criteria

Numbering mirrors requirements (brief §4.3). This table is the canonical wording of the module's criteria; [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) §4 only summarises them and owns the cross-cutting criteria (AC-SYS, AC-SEC, AC-PERF, AC-INT and others) (ACCEPTANCE_CRITERIA §1.2). A change to a criterion here is made in ACCEPTANCE_CRITERIA §4 in the same edit. Phase: **AE-P10** unless noted. Multi-device criteria use separate browser contexts (separate storage) and, where stated, separate machines. Unless a row names browsers, "e2e" means the Chromium, Firefox and WebKit Playwright projects (ACCEPTANCE_CRITERIA §1.3), plus mobile Chromium for phone-width and touch checks; a criterion is not met while Firefox is not green in CI (R-001, D-03). "Re-verify: yes" marks criteria whose requirement is v0.2-Done (AC-COL-017, 018) or that re-check an existing Partial feature (AC-COL-009, local comments).

| AC ID | Verifies | Criterion | Evidence type |
|---|---|---|---|
| AC-COL-001 | COL-FR-001 | A workspace with 3 members gives each member the workspace role on its items; removing a member removes access to all its items on the next request. | integration + e2e |
| AC-COL-002 | COL-FR-002 | Sharing a document uploads it once; the owner's device keeps one item (same id, item count unchanged); a grantee sees it under "Shared with me" and opens it. | e2e (2 contexts) + IndexedDB inspection |
| AC-COL-003 | COL-FR-003 | A viewer's client cannot type; a crafted update sent by a viewer connection is rejected by the host and not relayed (protocol-level test). | integration + e2e |
| AC-COL-004 | COL-FR-004 | An editor's changes reach the owner; an editor cannot change grants or stop sharing (403). | integration + e2e |
| AC-COL-005 | COL-FR-005 | An invitation code grants the stated role once, fails after expiry or withdrawal. | integration |
| AC-COL-006 | COL-FR-006 | After revocation the revoked client's socket closes within 2 s, it shows "Access removed", and further updates from it are refused; the owner decision on local copies (D-50) is applied and the user is told. | integration + e2e |
| AC-COL-007 | COL-FR-007 | With two editors, each sees the other's caret and selection labelled with the right name within the latency target. | e2e (Chromium, WebKit, Firefox once green) |
| AC-COL-008 | COL-FR-008 | The participant list updates on join, leave and idle; no presence data appears in host storage or logs after the session (database and log scan). | e2e + integration |
| AC-COL-009 | COL-FR-009 | Comments and replies made by two users sync with correct author identity; a commenter can comment but not edit; resolve follows role rules. Local single-user comments keep working (re-verify: yes). | e2e |
| AC-COL-010a | COL-FR-010 | Three editors typing concurrently in the same paragraph converge to identical canonical JSON; no typed character is lost. | e2e + integration |
| AC-COL-010b | COL-FR-010 | Undo in one client reverts only that client's last change. | e2e |
| AC-COL-010c | COL-FR-010 | Every document JSON used as golden-test input (today `tests/golden/v2/kitchen-sink-v2.json`, `tests/golden/docx-layout/sections.json` and the v0.1.0 document fixtures in `tests/fixtures/v0.1.0/documents/` that `tests/integration/docx-golden.test.ts:15` exports) plus a document with an embedded diagram (no golden fixture has one today; it must be added) round-trips through the CRDT binding unchanged (canonical JSON equal). | integration |
| AC-COL-011 | COL-FR-011 | Shared history lists versions with contributors; restoring creates a new version, broadcast to all; no version is deleted. | integration + e2e |
| AC-COL-012a | COL-FR-012 | Item-sync push with a stale `base_version` returns 409 and the client creates a conflict copy plus a conflict record. | integration |
| AC-COL-012b | COL-FR-012 | A merge producing invalid content (constructed test) keeps the last valid JSON and creates a conflict record. | integration |
| AC-COL-013 | COL-FR-013 | Killing the relay and restarting it, or cutting the network for 10 s, 60 s and 10 min, leads to automatic reconnection; only missing updates are exchanged (byte count check). | integration + e2e (network cut) |
| AC-COL-014 | COL-FR-014 | Edits made offline, followed by closing and reopening the app while still offline, are all present after reconnection on every client. | e2e (network cut + restart) |
| AC-COL-015 | COL-FR-015 | The evaluation and spike report exists with dated results for each question in §7.1 and each platform tested; the chosen ADR is approved by the owner before integration code merges. | manual (dated document review) |
| AC-COL-016 | COL-FR-016 | Two physical devices on a LAN with internet blocked co-edit through the classroom host; recorded with date, devices, OS and browser/app versions. | manual external check (dated) |
| AC-COL-017 | COL-FR-017 | With a host configured and one item shared, editing a private item produces no request; requests go only to the configured host and only for the shared item. Privacy e2e extended to presentations. Re-verify: yes. | e2e (request capture) |
| AC-COL-018 | COL-FR-018 | With the host unreachable from the start, a shared item opens and edits locally; the existing offline e2e passes. Re-verify: yes. | e2e (Chromium; WebKit where supported) |
| AC-COL-019 | COL-FR-019 | Commenter role: comment updates accepted, content updates rejected by the host. | integration |
| AC-COL-020 | COL-FR-020 | Each resolution choice leaves all previous versions available; "keep mine as a copy" creates a private item with the local state. | e2e |
| AC-COL-021 | COL-FR-021 | After stop sharing, the owner's item is private with full content and history; collaborators see "Access removed". | e2e |
| AC-COL-022 | COL-FR-022 | A client with an older content vocabulary joins read-only and sends no updates; a newer one cannot write fields the session's schema does not know. | integration |
| AC-COL-023 | COL-FR-023 | Renaming and trashing a shared item on two devices offline yields one value by `metaUpdatedAt` order and a conflict record holding the other; purge propagates as a tombstone. | integration |
| AC-COL-024 | COL-FR-024 | Each grant, revoke, invitation and restore produces an audit event without content. | integration |
| AC-COL-501 | COL-NFR-001 | During a live session, cutting the network never blocks typing; autosave to the device continues (save badge says saved). | e2e |
| AC-COL-502 | COL-NFR-002 | Code review checklist item and a test that searches the sync code for whole-content replacement paths without a preceding snapshot. | integration + review |
| AC-COL-503 | COL-NFR-003 | Seeded randomised test: 5 replicas, 10,000 operations with random partitions converge to identical JSON across 100 seeds. | integration |
| AC-COL-504 | COL-NFR-004 | PERF-012 measured on reference hardware, result recorded with date (AC-PERF-012 is canonical). | measurement |
| AC-COL-505…507 | COL-NFR-005…007 | Measured and recorded with date; met or waived by the owner. | measurement |
| AC-COL-508 | COL-NFR-008 | Unauthenticated socket refused; token for item A cannot open item B; TLS required per D-14. | integration |
| AC-COL-509 | COL-NFR-009 | As AC-COL-017. | e2e |
| AC-COL-510 | COL-NFR-010 | Export of a shared document equals export of the same content as a private item (golden comparison). | integration |
| AC-COL-511 | COL-NFR-011 | Oversized update and over-limit participant refused with a clear error; nothing truncated. | integration |
| AC-COL-512 | COL-NFR-012 | Keyboard-only share/revoke/resolve; presence announcements rate-limited; cursor label contrast ≥ 4.5:1 in both themes. | e2e + manual (dated) |
| AC-COL-513 | COL-NFR-013 | Licence gate passes with the new packages; no Tiptap Pro import (boundary test). | CI |
| AC-COL-701…711 | COL-UX-001…011 | Each UX requirement verified by e2e where automatable (button visibility rules, connection badge states, conflict banner non-blocking, mode not synced, phone width) and by a dated manual review otherwise. | e2e + manual |
| AC-COL-901…906 | COL-IF-001…006 | Contract tests for each interface against a real relay; `CollabService.open` never rejects for network reasons; `packages/document-studio` imports no sync package (boundary test). | integration |

Integration criterion owned by MODULE_DEPENDENCY_MAP: **AC-INT-08** (share documents and diagrams through Collaboration; diagrams depend on D-16).

---

## 11. Test strategy

| Level | What | How |
|---|---|---|
| Unit | Canonical JSON ↔ CRDT mapping per kind; schema handshake; role filter on updates; backoff schedule; conflict record creation; `mode` exclusion | Vitest; property-based round trips over generated documents |
| Integration | Two to five in-memory replicas with a simulated network (delay, drop, duplicate, reorder, partition); seeded fuzz for convergence (AC-COL-503); relay with real auth against the host; 409 paths; golden documents through the binding | Vitest (node) + spawned host relay; pytest for the relay |
| Browser | Editor bindings in Chromium, WebKit, mobile Chromium, Firefox (after PR #1 / D-03 make Firefox green) | Playwright, host relay as a fixture served over HTTPS with a test certificate (secure context, D-14) |
| End-to-end | Owner + two collaborators in separate contexts: share, co-edit, comment, revoke, stop sharing | Playwright multi-context |
| Multi-device | Real devices on a LAN with internet blocked; Tauri and Android builds once AE-P14 makes them buildable | Manual, dated records (AE-P10 for web; AE-P14 for native) |
| Network-cut | `context.setOffline`, killing and restarting the relay, sleeping a context, long offline with many edits, host restart with update log compaction | Playwright + scripted host control |
| Persistence | App restart during a session; IndexedDB upgrade with new stores (upgrade test store lists updated, `scripts/upgrade-test.mjs:64-65`); crash with unacknowledged updates | Playwright + upgrade test |
| Offline | Shared item opened with no host from the start; host unreachable for days | e2e |
| Import/export | Exports of shared items equal private exports; importing a DOCX into a shared session; backup and restore of a device with shared items (shared metadata restored without re-sharing anything) | Integration + e2e |
| Regression | All existing suites; privacy e2e (no host, and host with one shared item); `ConflictError` cross-tab tests; boundary test | CI |
| Security | Unauthenticated and cross-item tokens, viewer write attempts at protocol level, replayed updates, oversized updates, revoked user reconnecting | pytest + AE-P13 review |
| Accessibility | Keyboard flows, live-region politeness, cursor label contrast | Playwright + axe if D-25 + manual screen reader |
| Performance | PERF-012 with 30 simulated clients (headless) on one host; typing latency with 10 editors; state growth over 10,000 edits; memory | Measurement scripts, recorded with date on reference hardware (D-29) |

---

## 12. Known risks

From the canonical register ([RISK_REGISTER.md](RISK_REGISTER.md)):

| Risk | Why it matters for M07 |
|---|---|
| R-005 | Endpoints or sockets added without auth are exposed on shared Wi-Fi. Mitigation: deny-by-default router dependency, AC-COL-508. |
| R-007 | Shared content on the host and in host backups is student data. Mitigation: D-34, host access controls, no content in logs. |
| R-008 | Device clocks and per-device integer versions are not a global order; no tombstones; metadata does not move `updatedAt`. Mitigation: host sequence numbers, DB v4 tombstones and `metaUpdatedAt` before sync (D-35). |
| R-015 | 32-bit diagram ids collide under merging. Mitigation: AE-P5 longer ids before diagrams are co-editable. |
| R-021 | Scope: three networked modules on one maintainer machine. Mitigation: documents-only co-editing (D-16), deferrals (D-36). |
| R-028 | Secure-context and mixed-content rules block LAN collaboration from the HTTPS web build. Mitigation: spike first; native-first or trusted HTTPS on the host (D-14). |
| R-029 | Yjs/y-prosemirror compatibility with Tiptap 3.33 unverified; persistence model complexity. Mitigation: spike questions 1–3, golden round trips (AC-COL-010c), fallback options C/D. |
| R-027 | School network policies block the host or WebSockets. Mitigation: setup guide, HTTPS on a standard port, early field test. |
| R-036 | Accessibility debts inherited by new UI. Mitigation: AE-P3 components only. |
| R-002, R-003 | Every DB migration for collaboration stores reaches all Pages visitors at once. Mitigation: gated deploy (D-02), upgrade test. |
| R-038 | Firefox file-picker cancel handling is not exercised (PR #1 workaround); M07 must not add more Firefox-only gaps. |

Module-specific risks, with the numbers [RISK_REGISTER.md](RISK_REGISTER.md) assigned (unchanged from this PRD's draft):

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-070 | CRDT merge keeps every character but loses intent (edits inside deleted text, concurrent list restructuring), which users may read as "my work was overwritten". | M | M | Pre-merge snapshots, contributor-labelled history, review notice after long offline periods (D-52). |
| R-071 | A client with an older schema silently drops unknown nodes when it edits a shared document. | M | H | Schema handshake forces read-only (COL-FR-022); AC-COL-022. |
| R-072 | Two persistence paths (CRDT state and canonical JSON) diverge, so exports, backups or version history show different content than the live editor. | M | H | Canonical JSON derived from CRDT on every persist and validated; AC-COL-010c, AC-COL-510. |
| R-073 | A separate `y-indexeddb` database or relay update log falls outside safety copies, backups and the upgrade test. | M | M | Keep CRDT state inside the main database (§6.2) unless the spike proves otherwise; include it in the upgrade test. |
| R-074 | Document mode, local preferences or undo history leaking into shared state (mode is stored in the document today, `packages/document-studio/src/types.ts:32`). | M | L | COL-UX-010; separate per-user state from synced state in the mapping. |
| R-075 | The relay choice adds a second runtime (Node) to a Python host, raising setup and security burden on teacher machines. | M | M | Prefer a Python relay if the spike shows it supports per-update authorisation. |
