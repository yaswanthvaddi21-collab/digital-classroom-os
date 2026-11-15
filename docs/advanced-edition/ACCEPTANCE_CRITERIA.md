# Acceptance criteria

This is the master list of acceptance criteria for the Digital Classroom OS Advanced Edition. It defines the global criteria that come from brief §§6–11 and §15 (architecture, security, design, code quality, testing, performance, open source, platforms and release), the cross-module integration criteria AC-INT-01 … AC-INT-09, a per-module summary that indexes the AC-IDs defined in each module PRD, and the release gate checklist. A phase passes only when every criterion assigned to it passes with recorded evidence, or the owner waives it in writing and the waiver is disclosed in the known limitations.

**Status: AE-P1 draft for owner approval (2026-11-15)**

Related documents: [ADVANCED_EDITION_PRODUCT_ROADMAP.md](ADVANCED_EDITION_PRODUCT_ROADMAP.md) · module PRDs [M01](MODULE_01_DOCUMENT_STUDIO_PRD.md) · [M02](MODULE_02_DIAGRAM_STUDIO_PRD.md) · [M03](MODULE_03_PRESENTATION_STUDIO_PRD.md) · [M04](MODULE_04_DIGITAL_NOTEBOOK_PRD.md) · [M05](MODULE_05_PDF_STUDIO_PRD.md) · [M06](MODULE_06_CLASSROOM_HUB_PRD.md) · [M07](MODULE_07_COLLABORATION_PRD.md) · [M08](MODULE_08_FILE_MANAGER_PRD.md) · [M09](MODULE_09_DASHBOARD_PRD.md) · [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) (SYS, A11Y, PERF definitions) · [DATABASE_AND_SYNC_ARCHITECTURE.md](DATABASE_AND_SYNC_ARCHITECTURE.md) (SYS-030…051, SYN) · [SECURITY_AND_PRIVACY_PLAN.md](SECURITY_AND_PRIVACY_PLAN.md) (SEC) · [DEPENDENCY_AND_LICENCE_PLAN.md](DEPENDENCY_AND_LICENCE_PLAN.md) (DEP) · [MODULE_DEPENDENCY_MAP.md](MODULE_DEPENDENCY_MAP.md) (INT) · [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md) (PLT, REL, severity scale) · [RISK_REGISTER.md](RISK_REGISTER.md)

---

## 1. How to read this list

### 1.1 Identifiers

- `AC-<PFX>-NNN` mirrors the requirement it verifies: AC-DOC-069 verifies DOC-FR-069; AC-SEC-040 verifies SEC-040.
- A letter suffix splits one requirement into several criteria (AC-DOC-069a, AC-DOC-069b).
- Module non-functional criteria are 500 + the NFR number (AC-DOC-501 verifies DOC-NFR-001); UX criteria 700 + the number (AC-DSH-740 verifies DSH-UX-040); interface criteria 900 + the number.
- Integration criteria are AC-INT-01 … AC-INT-09.
- Where a requirement in another document delegates its control to a requirement elsewhere (for example SEC-030 → SYS-042), only the target's criterion exists, and this list says so.

### 1.2 Canonical wording

- **Cross-cutting criteria** (AC-SYS, AC-SYN, AC-SEC, AC-A11Y, AC-PERF, AC-DEP, AC-PLT, AC-REL, AC-INT): the wording in this file is canonical.
- **Module criteria** (AC-DOC, AC-DGM, AC-PRS, AC-NBK, AC-PDF, AC-CLS, AC-COL, AC-FIL, AC-DSH): the nine PRDs were written in parallel with this file. Their §10 tables are adopted here **by reference** as the canonical wording, and every PRD §10 says the same; §4 only summarises the key criteria (where a §4 summary is shorter than the PRD row, the PRD row governs) and lists the reconciliation items found. A later change to a module criterion is made in the PRD and in §4 together.

### 1.3 Required fields of every criterion

| Field | Values |
|---|---|
| Evidence | **unit**, **integration**, **e2e** (with browser projects named), **external** (an independent application check with date, application, version and file list, stored under `docs/compatibility/<phase>-<date>/`), **measurement** (on D-29 reference hardware, with date and raw numbers), **manual** (a dated record by a named reviewer or the owner) |
| Phase | The AE phase that must first meet it. Later phases must not break it (regression) |
| Re-verify | **yes** for anything marked Done in v0.2: earlier commits are a head start, not a pass |

"e2e (3 browsers)" means the Chromium, Firefox and WebKit Playwright projects. A module row that says only "e2e" means the same three projects, plus mobile Chromium for phone-width and touch checks (the same default is stated in every PRD §10). Firefox counts only once CI runs it green (R-001, D-03); until then a criterion that names Firefox is not met.

### 1.4 Waivers

A waiver is a dated owner statement naming the criterion, the reason and the known-limitations wording. Waivers are listed in the phase report and in the release notes (REL-020). A data-loss criterion cannot be waived (REL-013).

---

## 2. Global criteria

### 2.1 Architecture, data and sync (brief §6)

Requirements: SYS-001 … SYS-021 in SYSTEM_ARCHITECTURE §6 and SYS-060 … SYS-067 in its §8; SYS-030 … SYS-051 in DATABASE_AND_SYNC_ARCHITECTURE; SYN-001 … SYN-018 in DATABASE_AND_SYNC_ARCHITECTURE.

| ID | Criterion | Evidence | Phase | Re-verify |
|---|---|---|---|---|
| AC-SYS-001 | `tests/integration/boundaries.test.ts` lists every package that has source (including each new package) and passes; a deliberately forbidden import makes it fail | integration | every phase | yes |
| AC-SYS-002 | No feature package imports `apps/web`, `@dcos/local-storage` or another studio directly; storage, dialogs and other modules reach it only through host interfaces (grep-based integration test) | integration | AE-P4 onward | yes |
| AC-SYS-003 | For each new item kind, a checklist test confirms it is present in `ItemKind`/`ITEM_KINDS`, `STORES`, the migration list, `MAX_CONTENT_SCHEMA_BY_KIND`, `MODULES`, the upgrade-test store lists, `kinds.test.ts`, backup validation, a search extractor, and the privacy and offline e2e | integration + e2e | AE-P7, AE-P8 | — |
| AC-SYS-004 | No second search index, attachment store, reference model or permission check exists outside the SVC packages (grep test plus review checklist in the phase report) | integration + manual | every phase | — |
| AC-SYS-005 | A CI script lists non-test source files over 500 lines; no new file exceeds 500 lines; `apps/web/src/lib/storage.ts` and `local-storage/src/indexeddb.ts` are split with every existing test unchanged and passing | CI + unit + e2e | AE-P3 | — |
| AC-SYS-006 | A forced error in a route, a dashboard panel and an editor shows a scoped error with a working way back, without a page reload (closes RG-7/TD-23); each error class in `local-storage/src/errors.ts` and each network and permission error maps to one user message | unit + e2e (3 browsers) | AE-P3 | — |
| AC-SYS-007 | Importing each new package's entry point in a test opens no database, channel, worker or timer | unit | AE-P3 onward | — |
| AC-SYS-008 | File picking goes through SVC-PLAT `openFiles` only, and each package has one escape module; a grep test finds no other hidden file input or escape helper | integration | AE-P3 | — |
| AC-SYS-009 | Lint and format jobs for TypeScript and Python run in CI and pass on main (D-24) | CI | AE-P3 | — |
| AC-SYS-010 | The shared StorageAdapter conformance suite (concurrency, safety copy before migration, upgrade recovery, attachment clean-up, never-overwrite import, metadata-only changes, purge atomicity) passes for every adapter | integration | AE-P3 (IndexedDB), AE-P14 (SQLite if D-12 option B) | yes (IndexedDB) |
| AC-SYS-011 | A per-module test enumerates every visible control and proves each acts or is disabled with a reason; stub packages say "Not started" and are not npm workspaces; no endpoint claims a capability it lacks | unit + manual | every phase | yes |
| AC-SYS-012 | An unused-dependency check runs in CI and reports no unused production dependency (html-to-image removed or justified under D-27) | CI | AE-P3 (check), AE-P13 | — |
| AC-SYS-013 | The phase report lists every shortcut taken, each with its ADR or TD entry | manual | every phase | yes |
| AC-SYS-014 | With no classroom host configured, every local feature works and the privacy e2e records zero cross-origin requests | e2e (3 browsers) | every phase | yes |
| AC-SYS-015 | For every kind, a fixture with a newer content schema opens read-only, offers the original data for download and is never written | integration + upgrade test | AE-P7, AE-P8; others each phase | yes (3 kinds) |
| AC-SYS-016 | DOCX, ODT, `.dcosdoc`, `.drawio`, PDF and OCR parsing runs in a worker; oversized and decompression-bomb fixtures are refused within the caps; no main-thread task during an import exceeds the limit set with the AE-P3 harness | unit + e2e + measurement | AE-P3 (mechanism), AE-P4, AE-P5, AE-P8 | — |
| AC-SYS-017 | Every CI build records the entry chunk size; the build fails if it grows beyond a tolerance over the AE-P3 baseline (proposed 5 %, to approve) | CI | AE-P3 | — |
| AC-SYS-018 | The web build registers the service worker; Tauri and Capacitor builds do not | unit (detection) + manual (devices, dated) | AE-P3, AE-P14 | — |
| AC-SYS-019 | Every v0.1.0 and v0.2 route still resolves (`e2e/navigation.spec.ts` and successors) | e2e (3 browsers) | every phase | yes |
| AC-SYS-020 | The privacy e2e and a scan of the built bundle find no runtime URL to a third-party host; fonts, OCR data, the PDF worker, CMaps and standard fonts load from the app origin, also offline | e2e + build scan | every phase | yes |
| AC-SYS-021 | Feature packages contain no `fetch` or WebSocket to a host; host access goes through `sync-engine` hosts (grep test) | integration | AE-P9 | — |
| AC-SYS-030 | Every new record in every store has a UUID v4 id (test over generated data) | unit | AE-P3 | — |
| AC-SYS-031 | Newly created sub-objects that may be merged have ids with at least 122 random bits; existing short diagram ids still load (see AC-DGM-507, AC-NBK-508, AC-PRS-511) | unit | AE-P5, AE-P7, AE-P8 | — |
| AC-SYS-032 | Every record carries ISO 8601 UTC `createdAt` and `updatedAt`; no code path decides a conflict on device time alone (review plus test of the conflict paths) | unit + manual | AE-P3 | — |
| AC-SYS-033 | Favourite, trash, restore, folder and tag changes move `metaUpdatedAt` and leave `version` and `updatedAt` unchanged | unit | AE-P3 | — |
| AC-SYS-034 | A purge writes a tombstone with `{ kind, id, purgedAt, lastVersion, originDeviceId }` in the same transaction; tombstones survive backup and restore | unit + integration | AE-P3 | — |
| AC-SYS-035 | Opening an item moves only `lastOpenedAt` (not `version`, `updatedAt` or `metaUpdatedAt`) | unit + e2e | AE-P3 | — |
| AC-SYS-036 | After the v3→v4 upgrade every existing item has `folderId: null` and `tagIds: []` in effect and is listed at the root | upgrade test | AE-P3 | — |
| AC-SYS-037 | `ownerUserId` is optional and a missing value is treated as the device's own user; shared items store host ids separately from local ids | unit | AE-P3, AE-P9 | — |
| AC-SYS-038 | Each kind's content schema appears in the backup ceiling map with its frozen vocabularies and pure upgraders | unit | AE-P7, AE-P8 | yes (3 kinds) |
| AC-SYS-039 | On every adapter, a migration starts only after a verified safety copy; a failed copy leaves the database at the old version with the read-only export offered | integration + upgrade test | AE-P3, AE-P14 | yes (IndexedDB) |
| AC-SYS-040 | The upgrade test upgrades from every released database version in a real browser and runs in CI (scheduled or manual, D-38) | upgrade test (CI) | AE-P3 | yes |
| AC-SYS-041 | Reported storage sizes are bytes including attachments and versions, within 1 % of an independent count (same check as AC-FIL-018) | integration | AE-P3 (data), AE-P11 (UI) | — |
| AC-SYS-042 | `putAttachment` refuses data over the per-attachment cap and stores the sniffed MIME type, not the caller's | unit | AE-P3 | — |
| AC-SYS-043 | The attachment clean-up keeps every attachment referenced by any kind, store and reference mode in a fixture set, and removes an orphan only after the grace period | unit | each phase that adds a store | yes |
| AC-SYS-044 | Folders and tags take part in trash, backup and restore (round trip keeps placement) | unit + e2e | AE-P3 | — |
| AC-SYS-045 | New builds write backup format 3; formats 1 and 2 still import; all-or-nothing validation and never-overwrite tests pass for every format | integration + e2e | AE-P3 (design and reader), AE-P8 (required) | yes (format 2) |
| AC-SYS-046 | The activity store holds at most the cap (proposed 5,000 entries) and no content | unit | AE-P3 | — |
| AC-SYS-047 | Classroom cache entries live in their own store keyed by host and entity id and never appear in item lists, backups of items or the File Manager | unit | AE-P9 | — |
| AC-SYS-048 | Deleting a derived store (`item_index`, search index) and reopening rebuilds it with the same results | unit + e2e | AE-P3 | — |
| AC-SYS-049 | `scripts/upgrade-test.mjs` derives its store lists from the kind registry; a test fails if they disagree | unit | AE-P3 | — |
| AC-SYS-050 | Any SQLite schema (native or host) passes a comparison test against the IndexedDB model; the DDL in docs/DATABASE.md:49-125 is not used | integration | AE-P9, AE-P14 | — |
| AC-SYS-051 | An older build opening a newer database fails closed, changes nothing and shows the newer-data screen | upgrade test | keep | yes |
| AC-SYS-060 | `packages/ui` tokens exist for type scale, spacing, radius, shadow, motion and z-index in light and dark | unit | AE-P3 | — |
| AC-SYS-061 | A test computes contrast for every text and control token pair from `tokens.css`: at least 4.5:1 for text and 3:1 for large text and UI components; the dark danger button (2.77:1 today) and the small-text warning and success badges (4.08:1 and 4.27:1 today, FEATURE_STATUS.md:197) pass | unit | AE-P3 (D-09) | — |
| AC-SYS-062 | Tabs, Tooltip, Checkbox, Switch, Popover, Skeleton/Spinner, a multi-select list, a Drawer (Escape, focus trap, dialog role, focus return), a skip link and a resettable ErrorBoundary exist in `packages/ui` with unit tests | unit + e2e | AE-P3 | — |
| AC-SYS-063 | A static check finds no arbitrary px font size in new or changed files; the count of existing ones (51 at AE-P1) never rises | CI | AE-P3 onward | — |
| AC-SYS-064 | `cn()` resolves conflicting Tailwind classes (TD-48) | unit | AE-P3 | — |
| AC-SYS-065 | Every list, panel and editor shows a skeleton while loading, an empty state and an error state (e2e with slowed and failing storage) | e2e + manual | AE-P3 onward | — |
| AC-SYS-066 | Only the project's own icon and lucide icons are used; no other product's branding (review) | manual | every phase | yes |
| AC-SYS-067 | Every change to the live app's look is listed in the phase report with the D-09 approval | manual | AE-P3 onward | — |
| AC-SYN-001 | With a host configured, no item leaves the device unless the user shares, submits or hands it in (request capture) | e2e | AE-P9 | — |
| AC-SYN-002 | Two devices on one LAN reach the classroom host over HTTPS/WSS per D-14 (dated record with devices and versions) | manual + e2e | AE-P9, AE-P10 | — |
| AC-SYN-003 | (If D-15 approves) remote sync works through a self-hosted host, is off by default and needs no paid service | e2e + manual | AE-P10 | — |
| AC-SYN-004 | A write with a stale `baseVersion` is rejected by the host with HTTP 409 | integration (host) | AE-P9 | — |
| AC-SYN-005 | On 409 the client keeps the local edits as a conflict copy and records a resolvable conflict entry; nothing is lost | integration + e2e | AE-P9 | — |
| AC-SYN-006 | Accepted operations get a monotonic per-host sequence number; clients pull by sequence; no code compares item versions across devices | integration | AE-P9 | — |
| AC-SYN-007 | Queued operations retry with exponential backoff and jitter, survive an app restart and resume on reconnect (fault-injection test) | integration + e2e | AE-P9 | — |
| AC-SYN-008 | Sync, import, restore and co-editing never overwrite user work without a copy (fault-injection and conflict suites) | integration + e2e | AE-P9, AE-P10 | yes (local paths) |
| AC-SYN-009 | A purge travels as a tombstone; a delete that conflicts with an edit creates a conflict entry; another user's copy is never deleted | integration | AE-P3 (tombstones), AE-P9 | — |
| AC-SYN-010 | Metadata is not synced unless the item is shared; when synced, conflicting metadata is ordered by `metaUpdatedAt` then device id and the other value is recorded | integration | AE-P9 | — |
| AC-SYN-011 | An operation is written to `sync_outbox` in the same transaction as the local save (crash between the two is impossible by construction; tested by failure injection) | unit | AE-P9 | — |
| AC-SYN-012 | Replaying an operation with the same client UUID returns the first result and changes nothing | integration | AE-P9 | — |
| AC-SYN-013 | Live co-editing applies only to items explicitly shared for co-editing, documents first (D-16) | e2e | AE-P10 | — |
| AC-SYN-014 | After reconnection, queued operations or Yjs updates are replayed; offline edits are merged or become conflict copies, never dropped (network-cut tests of 10 s, 60 s, 10 min) | e2e | AE-P10 | — |
| AC-SYN-015 | Each shared item shows its sync state (synced, pending, offline, conflict, forbidden) and the last successful sync time | e2e | AE-P9 | — |
| AC-SYN-016 | With the host stopped, typing and autosave continue and only the sync state changes | e2e | AE-P9, AE-P10 | — |
| AC-SYN-017 | No password is stored on any client; session tokens are stored only as ADR-0020 states (see AC-SEC-043) | integration + manual (native) | AE-P9, AE-P14 | — |
| AC-SYN-018 | A grade refers to an immutable submission snapshot; later edits to the live item do not change it | integration | AE-P9 | — |

### 2.2 Security and privacy (brief §6)

Requirements: SEC-NNN in SECURITY_AND_PRIVACY_PLAN §8. Criteria not listed here are delegated (SEC-004 → AC-SYN-001; SEC-014 → AC-SYS-018; SEC-022 → AC-SYS-016; SEC-024 → AC-SYS-015; SEC-030 → AC-SYS-042; SEC-034 → AC-CLS-029, AC-CLS-506; SEC-045 → AC-CLS-041; SEC-046 → AC-CLS-040, -045, -060; SEC-052 → AC-COL-003, AC-COL-508).

| ID | Criterion | Evidence | Phase | Re-verify |
|---|---|---|---|---|
| AC-SEC-001 | `e2e/privacy.spec.ts` (or its successors) covers creating, editing, autosaving, importing and exporting every content kind and every new feature, and records zero cross-origin requests; the only allowed request is the user-initiated pasted-web-picture fetch | e2e (3 browsers) | AE-P3 (presentations added), each module phase | yes |
| AC-SEC-002 | The lockfile and bundle contain no analytics, telemetry or crash-reporting package or endpoint (automated scan) | CI | every phase | yes |
| AC-SEC-003 | A fresh profile with no host configured can use every local feature without creating an account | e2e | every phase | yes |
| AC-SEC-010 | The deployed web build carries the approved CSP (SECURITY_AND_PRIVACY_PLAN §5.6); every route loads and every export works under it, with no CSP violation logged | e2e (3 browsers) | AE-P2/AE-P3 (D-23) | — |
| AC-SEC-011 | Every raw HTML sink has a test feeding it markup, `<script>`, event-handler attributes and `javascript:` URLs from content and imports; nothing executes and the output is escaped | unit | AE-P3 | — |
| AC-SEC-012 | In every editor and importer, links with schemes other than http, https, mailto and in-document anchors are refused or written as text | unit | AE-P3 | yes (documents, diagrams) |
| AC-SEC-013 | On each native platform, a dated review shows only the capabilities each feature needs, scoped to the app-data directory, the CSP in force, Android network-security configuration limited to the paired host, and no remote content loaded | manual (dated) | AE-P14 | — |
| AC-SEC-020 | Every import path refuses an over-cap file before reading it fully, with a message (fixture per format) | unit + e2e | AE-P3 to AE-P8 | yes (capped formats) |
| AC-SEC-021 | Inflate, ODT row and column repeats and XML entity expansion stop at their caps (bomb fixtures) without memory growing past the cap | unit | AE-P4, AE-P5 | — |
| AC-SEC-023 | Backup import of every format is all-or-nothing, never overwrites, and re-hashes attachments (malformed, truncated and divergent fixtures) | integration + e2e | AE-P3 | yes |
| AC-SEC-025 | The malicious-fixture corpus for every accepted input format runs in CI and produces no crash, hang beyond the timeout or script execution | unit + CI | AE-P3 onward | — |
| AC-SEC-026 | PDF parsing runs in a worker with eval disabled, executes no PDF JavaScript and fetches nothing; the malformed-PDF corpus passes AC-SEC-025; an encrypted PDF's password is found in no store, draft or backup afterwards (with AC-PDF-023, AC-PDF-503) | unit + e2e | AE-P8 | — |
| AC-SEC-031 | Every attachment and every submitted part is addressed by SHA-256; a byte change is detected on import and on the host | unit + integration | AE-P9 | yes (local) |
| AC-SEC-032 | Exported and downloaded file names contain no path separators, control characters or reserved device names, whatever the title (fixture titles); native downloads use SVC-PLAT | unit + manual (native) | AE-P9, AE-P14 | — |
| AC-SEC-033 | Host blobs are not reachable by any static path; downloads require authorisation and carry `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`; over-limit uploads are refused | integration (host) | AE-P9 | — |
| AC-SEC-035 | Every host endpoint rejects over-length, out-of-range, malformed-UUID and unknown-field input with 422 (generated test over the OpenAPI schema) | integration (host) | AE-P9 | — |
| AC-SEC-040 | The users table holds only Argon2id encoded hashes with the approved parameters; a test changes the parameters and confirms rehash on next sign-in; passwords appear in no log, URL or response | integration + log scan | AE-P9 | — |
| AC-SEC-041 | Repeated failed sign-ins and code entries are rate-limited per account and per source; unknown-user and wrong-password errors are identical | integration | AE-P9 | — |
| AC-SEC-042 | Session tokens are stored hashed; idle and absolute expiry, logout, password change, account disable and membership removal each end access on the next request | integration | AE-P9 | — |
| AC-SEC-043 | Web session cookies are HttpOnly, Secure, SameSite=Strict and host-only; a state-changing request without a valid CSRF token or allowed Origin is refused; native tokens are in OS secure storage on each platform (dated) | integration + e2e + manual (native) | AE-P9, AE-P14 | — |
| AC-SEC-044 | A route-enumeration test fails if any non-public route lacks the authentication dependency; IDOR tests show no object of another classroom or user is readable or writable | integration (host) | AE-P9, AE-P10 | — |
| AC-SEC-050 | Authenticated routes refuse plain HTTP except on loopback; the D-14 transport (trusted certificate or pinned fingerprint) is verified on the reference LAN (dated) | integration + manual | AE-P9 | — |
| AC-SEC-051 | A request from an origin outside the allow-list gets no CORS grant; no wildcard is combined with credentials | integration (host) | keep | yes |
| AC-SEC-053 | Over-size requests, uploads and updates, too many sockets per user and too many participants are refused with a clear error and nothing is truncated | integration | AE-P9, AE-P10 | — |
| AC-SEC-060 | An encrypted backup restores only with the right passphrase, a wrong one changes nothing, and the file reveals no item title or content; if D-34 requires it, a backup containing classroom data cannot be written unencrypted | unit + e2e | AE-P13 | — |
| AC-SEC-061 | Changing any byte of a format-3 backup makes import refuse it before any write | integration | AE-P3 | — |
| AC-SEC-062 | The backup export dialog states what the file contains (including trash and history) and whether it is encrypted | e2e + manual | AE-P11, AE-P13 | — |
| AC-SEC-063 | Host backups are readable only by admins, can be encrypted at rest, and a restore test reproduces row counts and blob digests | integration + manual | AE-P9 | — |
| AC-SEC-070 | The host schema stores no personal fields beyond those listed in SECURITY_AND_PRIVACY_PLAN §6 item 7 (schema review recorded) | manual | AE-P9 | — |
| AC-SEC-071 | A response-scan test over every student endpoint finds no other student's id, name, submission or grade, and no unreleased grade | integration | AE-P9 | — |
| AC-SEC-072 | The audit log is append-only and records every listed action with actor and host time; host logs from the full e2e run contain no secret, content or item title (with AC-CLS-507) | integration + log scan | AE-P9, AE-P10 | — |
| AC-SEC-073 | The retention policy approved under D-47 (with D-46 and D-53) is implemented: removing a student, deleting an account and archiving a classroom have the documented effect, and an admin can export and delete one student's records | integration + manual | AE-P9 | — |
| AC-SEC-074 | After sign-out, the classroom cache for that host and user is empty and the search index holds none of its entries | e2e | AE-P9 | — |
| AC-SEC-075 | On a shared browser profile, after sign-out a second person cannot reach any classroom data or session (e2e with two sequential users) | e2e | AE-P9 | — |
| AC-SEC-076 | Secret scanning and push protection are enabled (checked at every phase gate); a repository scan for keys, tokens and student data finds none | manual + CI | every phase | yes |
| AC-SEC-080 | GitHub private vulnerability reporting is enabled and docs/SECURITY.md names the channel, supported versions and response promise | manual | AE-P2 (D-39) | — |
| AC-SEC-085 | The security reviews of AE-P9, AE-P10 and AE-P13 are recorded with findings and severities, and none Critical or High remains open | manual (report) | AE-P9, AE-P10, AE-P13 | — |
| AC-SEC-086 | The threat model in SECURITY_AND_PRIVACY_PLAN §3 is updated and dated in each phase that adds a trust boundary | manual | AE-P8, AE-P9, AE-P10, AE-P13, AE-P14 | — |

### 2.3 Design, UX and accessibility (brief §7)

Design-system criteria are AC-SYS-060 … AC-SYS-067 (§2.1). Accessibility requirements A11Y-001 … A11Y-008 are in SYSTEM_ARCHITECTURE §9.

| ID | Criterion | Evidence | Phase | Re-verify |
|---|---|---|---|---|
| AC-A11Y-001 | Every screen meets WCAG 2.2 Level AA: automated axe checks (if D-25) show no serious or critical violation on every main route and editor in light and dark, and the AE-P13 manual audit records conformance per success criterion | e2e + manual (dated) | AE-P3 baseline; every phase; AE-P13 audit | — |
| AC-A11Y-002 | A keyboard-only script completes each module's primary user stories; focus is always visible and is trapped only inside modal dialogs | e2e (3 browsers) | every phase | yes (existing keyboard tests) |
| AC-A11Y-003 | With reduced motion emulated, the shell and every module show no non-essential animation | e2e | AE-P3 onward | yes (diagram, slide show) |
| AC-A11Y-004 | The axe check runs in CI on every main route and editor (if D-25 approves `@axe-core/playwright`) | CI | AE-P3 | — |
| AC-A11Y-005 | A screen-reader pass with VoiceOver (macOS), NVDA (Windows) and TalkBack (Android) is recorded with date, versions and findings before the release candidate | manual (dated) | AE-P15 (AE-P13 audit) | — |
| AC-A11Y-006 | A skip link reaches the main content; landmarks exist; navigation is labelled | e2e | AE-P3 | — |
| AC-A11Y-007 | Every dialog uses the shared Dialog (native `<dialog>`) or an equivalent and returns focus on close | unit | keep | yes |
| AC-A11Y-008 | Diagram, slide, PDF annotation and ink canvases offer non-pointer paths to create, select, move and connect | e2e | AE-P5, AE-P6, AE-P7, AE-P8 | yes (Quick Connect keyboard) |

### 2.4 Code quality (brief §8)

| Brief §8 rule | Verified by |
|---|---|
| 1 One file, one responsibility; 8 No massive monolithic files | AC-SYS-005 |
| 2 Small, focused components | AC-SYS-005 and review in the phase report |
| 3 Clear module boundaries | AC-SYS-001, AC-SYS-002, AC-SYS-021 |
| 4 Typed interfaces | `npm run typecheck` in CI (strict mode; no `any`, `@ts-ignore` or `@ts-expect-error` in non-test source at AE-P1); module interface criteria AC-<MOD>-9NN |
| 5 Reusable business logic | AC-SYS-004, AC-SYS-008 |
| 6 Centralised error handling | AC-SYS-006 |
| 7 No unnecessary duplicated code | AC-SYS-008, AC-SYS-004 |
| 9 No hidden side effects | AC-SYS-007 |
| 10 No fake implementations | AC-SYS-011 |
| 11 No unused dependencies | AC-SYS-012, AC-DEP-011 |
| 12 No unexplained architectural shortcuts | AC-SYS-013 |
| Automated formatting and linting | AC-SYS-009 |
| Review each file after implementation | Phase report lists the files reviewed (manual) |

### 2.5 Testing (brief §9)

Every module PRD §11 defines a test strategy covering all ten brief §9 test types. The criteria below make them gate items.

| Brief §9 item | Verified by |
|---|---|
| Unit, integration, browser, end-to-end tests for every module | Each PRD §10 names the evidence per criterion; a phase cannot exit with a module criterion that lacks a test of the named type |
| Data persistence tests | Per-module NFR criteria (for example AC-PRS-503, AC-NBK-015, AC-PDF-018); AC-SYS-010 |
| Offline tests | AC-SYS-014; per-kind offline criteria (AC-PRS-505, AC-NBK-016, AC-PDF-508, AC-FIL-504, AC-NBK-504, AC-DSH-504); REL-015 |
| Import/export tests | AC-DOC-100…107, AC-DGM-100…124, AC-PRS-060…064, AC-NBK-017, AC-PDF-017a–c, AC-FIL-013/014; external records under REL-014 |
| Regression tests | "Re-verify: yes" on every v0.2-Done criterion; goldens; AC-SYS-019; AC-DSH-748 |
| Accessibility checks | AC-A11Y-001 … 008 and each module's 5NN accessibility criterion |
| Performance checks | AC-PERF-001 … 014 and module NFR measurement criteria |
| Scenario: close and reopen documents | Module persistence criteria; AC-DOC-003 |
| Scenario: recover unsaved work | AC-PERF-013; AC-DOC-005; AC-NBK-015 |
| Scenario: import and export complex files | Kitchen-sink criteria AC-DOC-105, AC-DGM-106, AC-PRS-060, AC-PDF-018 |
| Scenario: disconnect the network during editing | AC-SYN-016, AC-COL-501, AC-CLS-021, AC-CLS-030 |
| Scenario: restore from backup | AC-SYS-045, AC-SEC-023, AC-FIL-016a/b, REL-016 |
| Scenario: synchronise conflicting changes | AC-SYN-004, -005, -010, AC-COL-010a, AC-COL-012a/b, AC-COL-503 |
| Scenario: use multiple devices | AC-SYN-002, AC-COL-016 |
| Scenario: upgrade from previous database versions | AC-SYS-039, AC-SYS-040, AC-SYS-051, AC-PERF-014 |
| "Test realistic workflows, not just isolated buttons" | AC-INT-01 … 09 and the manual acceptance checklist (REL-024) |

### 2.6 Performance and reliability (brief §10)

All targets are **proposed targets, to be measured** (SYSTEM_ARCHITECTURE §10; D-29). Each criterion means: measured with the AE-P3 harness on the D-29 reference hardware against the production build, raw results recorded with date and commit, and the target met — or the owner waives or changes the target in writing. Before-and-after numbers are recorded for every phase that touches the measured path.

| ID | Measured | Proposed target | Evidence | First phase |
|---|---|---|---|---|
| AC-PERF-001 | Dashboard usable after a warm start (service worker cached), 1,000 items | ≤ 1.5 s p95 | measurement (Chromium; WebKit and Firefox recorded) | AE-P3 baseline; AE-P12 |
| AC-PERF-002 | Cold first load over the reference connection; entry chunk size recorded | ≤ 4 s | measurement | AE-P3 |
| AC-PERF-003 | Document of 50 pages with 20 images: open to editable | ≤ 1.5 s | measurement | AE-P4 |
| AC-PERF-004 | Keystroke latency on a 200-page document | ≤ 50 ms p95 | measurement | AE-P4 |
| AC-PERF-005 | Autosave: last edit to durable write | ≤ 600 ms debounce + 250 ms p95 | measurement | AE-P3 baseline |
| AC-PERF-006 | Diagram of 1,000 shapes pan and zoom; 2,000-shape diagram open | ≥ 30 fps; ≤ 3 s | measurement | AE-P5 |
| AC-PERF-007 | Presentation of 150 slides: open; slide switch | ≤ 3 s; ≤ 150 ms | measurement | AE-P6 |
| AC-PERF-008 | JS heap with one document, one diagram and one presentation open | ≤ 500 MB (Chromium) | measurement | AE-P13 |
| AC-PERF-009 | DOCX import of 10 MB | ≤ 5 s, UI not blocked | measurement | AE-P4 |
| AC-PERF-010 | 300-page PDF: first page visible; thumbnails progressive | ≤ 2 s | measurement | AE-P8 |
| AC-PERF-011 | Global search over 5,000 items | ≤ 300 ms p95 | measurement | AE-P7 (first indexer), AE-P12 |
| AC-PERF-012 | LAN co-editing update propagation, 30 clients on one host | ≤ 250 ms p95 | measurement (reference LAN) | AE-P10 |
| AC-PERF-013 | Restore of an unsaved draft after a crash | ≤ 2 s, no data loss | measurement + e2e | AE-P3 baseline |
| AC-PERF-014 | Upgrade migration v3→v4 on 1,000 items including the safety copy | ≤ 30 s, progress shown | measurement + upgrade test | AE-P3 |

### 2.7 Open source and cost (brief §11)

Requirements: DEP-NNN in DEPENDENCY_AND_LICENCE_PLAN §9. DEP-007 is delegated to AC-SYS-020.

| ID | Criterion | Evidence | Phase | Re-verify |
|---|---|---|---|---|
| AC-DEP-001 | `npm run licenses` passes in CI and THIRD_PARTY_NOTICES.md is current | CI | every phase | yes |
| AC-DEP-002 | The licence gate covers Python, Rust, native-shell npm and Android dependencies and passes | CI | AE-P9 (Python), AE-P14 | — |
| AC-DEP-003 | Every dependency added or major-upgraded in the phase has a complete review record (licence, maintenance, security, compatibility, performance, sustainability) dated before its merge | manual (records in docs/DEPENDENCIES.md) | every phase from AE-P2 | — |
| AC-DEP-004 | Every class C licence in the build has a dated owner decision; no class D licence is present | CI + manual | every phase | — |
| AC-DEP-005 | No feature requires a paid or proprietary online service; no telemetry or crash-reporting dependency (with AC-SEC-002) | CI scan + review | every phase | yes |
| AC-DEP-006 | An automated check finds no AI model, AI API client or AI SDK in any lockfile and no AI API host in source | CI | AE-P3 onward | — |
| AC-DEP-008 | A validated SBOM in the D-26 format is generated in CI for every deliverable, and the release SBOM is attached to every release tag | CI + release record | AE-P13, AE-P16 | — |
| AC-DEP-009 | Vulnerability gates for every shipped ecosystem block high and critical advisories | CI | AE-P2 (npm), AE-P9, AE-P14 | yes (npm) |
| AC-DEP-010 | Dependabot security updates (or an equivalent) are enabled (checked at every gate) | manual | AE-P2 (D-05) | — |
| AC-DEP-011 | No production dependency is unused (with AC-SYS-012); html-to-image is removed or kept with a recorded reason under D-27 | CI | AE-P3 | — |
| AC-DEP-012 | Every exact pin and override is listed with reason, removal condition and re-test set | manual | every phase | yes |
| AC-DEP-013 | A clean checkout installs reproducibly from lock files in every ecosystem (`npm ci`, hashed Python lock, `Cargo.lock`, Gradle lock) | CI | AE-P9, AE-P14 | yes (npm) |
| AC-DEP-014 | No `@tiptap-pro/*` package (gate and `boundaries.test.ts:44-45`) and no React Flow Pro code (review) | CI + manual | every phase | yes |
| AC-DEP-015 | Every distributed build ships full licence texts and copyright notices, reachable from Settings → About | e2e + manual (native) | AE-P13 | — |
| AC-DEP-016 | A report of dev and build tool licences is generated, and class C build tools are listed with their reason | CI | AE-P13 | — |
| AC-DEP-017 | Before the release candidate, every dependency's maintenance and advisory status is re-reviewed and recorded | manual | AE-P13, AE-P15 | — |

### 2.8 Platforms

Requirements PLT-001 … PLT-008 and the matrix are in RELEASE_STRATEGY §8.1 (proposed, D-30). Each criterion means: on that platform, the **platform checklist** passes with a dated record of device, OS, browser or webview version and build: install or open; create, edit, reload and export every shipped kind; offline after first use; backup and restore into an empty profile; print or PDF; presenter mode; file open and save dialogs; for networked phases, pairing with the classroom host.

| ID | Platform | Evidence | Phase |
|---|---|---|---|
| AC-PLT-001 | Web, Chromium (latest 2 majors) | e2e (CI) + manual | every phase; AE-P14 |
| AC-PLT-002 | Web, Firefox (latest and ESR) | e2e (CI green, R-001) + manual | AE-P2 (CI), AE-P14 |
| AC-PLT-003 | Web, Safari on macOS (latest 2 majors), real Safari not only WebKit | e2e (WebKit) + manual | AE-P14 |
| AC-PLT-004 | Safari on iOS/iPadOS, best effort: limits recorded | manual | AE-P14 |
| AC-PLT-005 | macOS desktop (Tauri 2) | manual (dated) + CI build | AE-P14 |
| AC-PLT-006 | Windows desktop (Tauri 2) | manual (dated) + CI build | AE-P14 |
| AC-PLT-007 | Android (Capacitor 7, minimum version per D-30) | manual (dated) + CI build | AE-P14 |
| AC-PLT-008 | PWA install on Chromium and Android with PNG icons (TD-27) | manual | AE-P3 (icons), AE-P14 |

### 2.9 Release (brief §15)

Requirements REL-001 … REL-027 are in RELEASE_STRATEGY §13 and §6.1. Each AC-REL-NNN passes when its REL requirement is met with the evidence RELEASE_STRATEGY names.

| ID | Criterion (summary; RELEASE_STRATEGY wording governs the requirement) | Phase |
|---|---|---|
| AC-REL-001 | All CI jobs, including Firefox e2e, are green on main at AE-P2 exit and before every later phase starts | AE-P2 |
| AC-REL-002 | Pages deploys only after green CI for the same commit; from AE-P16 only from release tags | AE-P2, AE-P16 |
| AC-REL-003 | All manifests carry one version, checked in CI | AE-P2 |
| AC-REL-004 | Every phase exit and release has an annotated tag on a green commit | AE-P2 onward |
| AC-REL-005 | `main` is protected with required checks and no force-push | AE-P2 |
| AC-REL-006 | New commits carry a real author identity | AE-P2 |
| AC-REL-007 | A verified repository bundle with an off-machine copy exists before each phase | AE-P2 onward |
| AC-REL-008 | CI has least-privilege permissions, SHA-pinned actions, timeouts and enforced coverage floors | AE-P2 |
| AC-REL-009 | The upgrade test runs in CI and before every format-changing tag | AE-P2/AE-P3 |
| AC-REL-010 … AC-REL-024 | The brief §15 checklist items (§5.3 below) | AE-P4 to AE-P16 |
| AC-REL-025 | Release notes for every tag state format changes, upgrade notes and known limitations | AE-P2 onward |
| AC-REL-026 | The rollback procedure is documented and rehearsed once on the web | AE-P14 |
| AC-REL-027 | Signing keys are held outside the repository with an offline backup | AE-P14 |

### 2.10 Cross-module integration (brief §5)

Contracts INT-01 … INT-09 are owned by MODULE_DEPENDENCY_MAP §4. These criteria are canonical. Each runs end to end on the production build in Chromium, Firefox and WebKit unless stated, and every contract uses SVC-REF, SVC-BLOB and SVC-PERM rather than its own mechanism.

| ID | Criterion | Evidence | Phase | Re-verify |
|---|---|---|---|---|
| AC-INT-01 | A diagram inserted into a document (new, from a template, from My diagrams, from a `.drawio` file) edits in place, survives reload, and stays editable after DOCX, ODT and `.dcosdoc` round trips; it works offline; "update from source" uses SVC-REF provenance and a missing source shows a missing-source state; the DOCX and ODT open in Word and LibreOffice with the diagram visible (dated, TD-53) | e2e + integration + external | AE-P4 (external), AE-P12 (provenance) | yes (650cf63) |
| AC-INT-02 | As AC-INT-01 for presentations: the diagram edits in place, survives PPTX and PDF export, the PPTX picture carries the editable data and re-imports into Diagram Studio, and the PPTX opens in PowerPoint and LibreOffice with the diagram visible (dated) | e2e + integration + external | AE-P6, AE-P12 | yes (edc2672) |
| AC-INT-03 | A teacher attaches a document as assignment material (students open a read-only host copy); a student attaches own work as an immutable snapshot; another classroom's member cannot read either; an attachment made offline is queued and sent on reconnect | e2e (two browser contexts) + integration (host) | AE-P9 | — |
| AC-INT-04 | A student submits a presentation and a PDF; each part is an immutable snapshot with a digest; the grade refers to that snapshot after the student edits the live item; a large PDF upload interrupted by a network cut resumes and produces exactly one submission round | e2e + integration | AE-P9 (PDF part after AE-P8) | — |
| AC-INT-05 | Every shipped kind appears in the File Manager and can be moved to a folder, tagged, favourited, trashed and restored through one UI; a backup round trip keeps folders and tags | e2e + integration | AE-P3 (data), AE-P11 | yes (flat list) |
| AC-INT-06 | Opening any kind from anywhere updates its place in the dashboard's recent work without changing its version; per-kind recent sections and open tabs are offered | e2e | AE-P3 (field), AE-P12 | yes (recent list) |
| AC-INT-07 | A notebook page or selection inserts into a document as a copy with provenance or as a link (per ADR-0018); a missing source never removes the content; DOCX export keeps the content with no new loss note | e2e + integration | AE-P7 | — |
| AC-INT-08 | A document and a diagram are shared with view, comment and edit grants; each grant behaves as named; revocation ends access; two editors co-edit a document with presence; personal items stay private (request capture) | e2e (two devices or contexts) + integration | AE-P10 | — |
| AC-INT-09 | Global search finds content (not only titles) in every shipped kind and in the user's classroom cache, excludes trash by default (D-17), opens the item at the match where the editor supports it, never returns another user's classroom data, and meets AC-PERF-011 | e2e + measurement | AE-P7 (first indexer), AE-P12 | yes (title filter) |

---

## 3. Re-verification of v0.2 work

Earlier commits delivered real functionality (ROADMAP AE-P1 report): fe3275a and 206e080 (v0.2 Phase 4), 8f772ba (v0.2 Phase 5), 650cf63 (v0.2 Phase 6), edc2672 (v0.2 Phase 7). Every criterion whose requirement is **Done (v0.2)** carries "re-verify: yes" and must pass again in its AE phase, because:

- the recorded passing run (RELEASE_GAPS.md §11, 2026-11-15) did not include Firefox, and CI e2e has never passed on main (runs 43669491390, 43676035968);
- many Advanced criteria add external application checks that v0.2 never made (Word 2 of 16 DOCX samples; ODT never opened elsewhere; PPTX never opened in PowerPoint or Keynote; `.drawio` never opened in diagrams.net);
- the privacy and offline e2e do not cover presentations.

---

## 4. Per-module summary

Each block gives the module's status headline (from the canonical planning brief), the criteria families defined in the PRD, the key criteria for the phase gate, and the re-verify set. Full wording: the PRD's §10.

### 4.1 M01 Advanced Document Studio — AE-P4 ([PRD](MODULE_01_DOCUMENT_STUDIO_PRD.md))

- **Status:** most Editing, Formatting and Insert requirements Done or Partial; DOC-FR-069 footnotes, DOC-FR-082 track changes, DOC-FR-084 citations and DOC-FR-085 reference tools Absent; DOC-FR-004 multi-page layout Partial.
- **Families:** AC-DOC-001 … 012 (editing), 020 … 031 (formatting), 040 … 047 (layout), 060 … 069b (insert), 080 … 086 (review), 100a … 107 (files), 501 … 512, 701 … 710, 901 … 909.

| Key criterion | Summary | Evidence |
|---|---|---|
| AC-DOC-004a/b | On-screen pagination per D-18; page counts recorded against Word and LibreOffice | e2e (browsers) + measurement + external application check (dated) |
| AC-DOC-069a/b | Footnotes and endnotes authored, renumbered, exported as real notes and re-imported | unit + e2e (browsers) + integration + external application check (dated) |
| AC-DOC-082a/b | Track changes recorded, accepted and rejected; exported and re-imported as changes | unit + e2e (browsers) + integration + external application check (dated) |
| AC-DOC-084a/b | Citations and bibliography in the approved styles; no network request | unit + integration + privacy e2e |
| AC-DOC-085 | Cross-references update and export as DOCX fields | unit + external application check (dated) |
| AC-DOC-100a/b/c | All reference DOCX samples checked in Word for Mac and Windows; schema-valid; import keeps or reports each feature | external application check (dated) + integration |
| AC-DOC-101a | ODT validates and opens in LibreOffice | integration + external application check (dated) |
| AC-DOC-102 | PDF with headers, footers and page numbers on every supported platform, or limits shown first | e2e + external application check (dated) |
| AC-DOC-106 | Every compatibility claim cites a dated external check | manual review |
| AC-DOC-107, AC-DOC-511 | Parsing off the main thread; malicious fixtures refused | unit + e2e |
| AC-DOC-501 … 504 | PERF-003, 004, 005, 009 | measurement |
| AC-DOC-506 | v3→v4 upgrade keeps every document; older builds fail closed | upgrade test + integration |

- **Re-verify: yes** for every criterion of a Done (v0.2) requirement (DOC-FR-001, 002, 005–010, 021–028, 030, 040, 043, 047, 060, 065, 066, 080, 081, 083, 104, 106).

### 4.2 M02 Advanced Diagram Studio — AE-P5 ([PRD](MODULE_02_DIAGRAM_STUDIO_PRD.md))

- **Status:** types, canvas, Quick Connect, connectors, import and exports largely Done; DGM-FR-012 concept maps, 081 smart guides, 084 reusable components and 085 multiple pages Absent; Quick Connect fidelity to the diagrams.net reference Unverified (reference never received).
- **Families:** AC-DGM-001 … 013, 020 … 031, 040 … 049, 060 … 067, 080 … 087, 100a … 107, 120 … 124, 501 … 512, 701 … 710, 901 … 910.

| Key criterion | Summary | Evidence |
|---|---|---|
| AC-DGM-012 | Concept-map template and category; round trip through `.drawio` | unit + e2e (browsers) |
| AC-DGM-048 | Quick Connect compared with the owner-supplied reference, or owner acceptance recorded (D-22) | external application check (dated) or manual (owner record) |
| AC-DGM-081 | Smart guides snap to edges, centres and equal spacing | unit + e2e (browsers) |
| AC-DGM-084 | User component library and user templates survive backup and restore | unit + e2e + integration (backup) |
| AC-DGM-085a/b | Multiple pages; multi-page `.drawio` import and export; schema-4 read-only in older builds | unit + e2e (browsers) + integration + upgrade test |
| AC-DGM-100b | Corpus of at least 10 files saved by diagrams.net imports with every loss reported | integration + external application check (dated, provenance recorded) |
| AC-DGM-102 | Every template exported as `.drawio` opens, edits and saves in diagrams.net | external application check (dated) + integration |
| AC-DGM-107 | Oversized files, inflate bombs and cell floods refused; parsing off the UI thread | unit + e2e |
| AC-DGM-122 | PDF labels outside WinAnsi render with an embedded font | unit + e2e + external application check (dated) |
| AC-DGM-501, 502 | PERF-006 | measurement |
| AC-DGM-507 | New ids are full UUIDs; old short ids load | unit |
| AC-DGM-511 | Licence gate passes; no React Flow Pro code; layout library per D-21 | licence gate + manual review |

- **Re-verify: yes** for AC-DGM-001…007, 009…011, 020…031, 040…047, 060…066, 086, 100a, 101, 103…106, 120…123 (DGM-FR-122 PDF export is Done in v0.2; AC-DGM-122 adds the non-WinAnsi font requirement).

### 4.3 M03 Advanced Presentation Studio — AE-P6 ([PRD](MODULE_03_PRESENTATION_STUDIO_PRD.md))

- **Status:** slide management, editing tools and exports largely Done or Partial; PRS-FR-029 grouping and PRS-FR-044 animation timeline Absent; PRS-FR-062 checks in real presentation applications Absent.
- **Families:** AC-PRS-001 … 008, 020 … 030, 040 … 047, 060 … 064, 501 … 511, 701 … 709, 901 … 905.

| Key criterion | Summary | Evidence |
|---|---|---|
| AC-PRS-005 | Master edits propagate; PPTX shows the master as a master in PowerPoint (D-19 scope) | unit + external application check (dated) |
| AC-PRS-028 | Selection pane: rename, hide, lock, reorder; names exported | unit + e2e |
| AC-PRS-029 | Grouping, nested; exported as PPTX groups seen in PowerPoint | unit + e2e + external application check |
| AC-PRS-043, 044 | Entrance, emphasis, exit effects; timeline pane; PowerPoint plays the timing | e2e + external |
| AC-PRS-060 | Sample PPTX passes xmllint and opens without repair in PowerPoint and LibreOffice | integration + external application check |
| AC-PRS-061 | PDF keeps Latin, Greek, Cyrillic, Devanagari and CJK as selectable text | unit + external application check |
| AC-PRS-062 | Dated records for PowerPoint, Keynote and LibreOffice (waivable per D-22, disclosed) | external application check (dated) |
| AC-PRS-041 | Presenter view on a real second screen on macOS and Windows | e2e + manual on real hardware (dated) |
| AC-PRS-501 | PERF-007 and PERF-008 | measurement |
| AC-PRS-502 | Schema 2 opens read-only in schema-1 builds; content without new features stays schema 1 | unit + upgrade test (real browser) |
| AC-PRS-504, 505 | Privacy and offline e2e cover presentations | e2e |
| AC-PRS-506 | All presentation specs green in CI on Chromium, Firefox and WebKit | e2e (CI) |

- **Re-verify: yes** for AC-PRS-001…004, 007, 020, 021, 023…027, 040, 042, 045, 063 and every criterion touching the v0.2 exports.

### 4.4 M04 Advanced Digital Notebook — AE-P7 ([PRD](MODULE_04_DIGITAL_NOTEBOOK_PRD.md))

- **Status:** Absent (`packages/notebook/README.md` stub). Reuses the Tiptap stack, autosave, drafts, versions, favourites, trash and KaTeX.
- **Families:** AC-NBK-001 … 022, 501 … 509, 701 … 707, 901 … 904.

| Key criterion | Summary | Evidence |
|---|---|---|
| AC-NBK-003 | Sections, chapters and pages added, reordered, moved; order survives reload | unit + e2e |
| AC-NBK-004 | Formatting identical in JSON to the same action in a document | unit + e2e |
| AC-NBK-009 | Ink with mouse, touch and pen; undo; survives reload and PDF export | unit + e2e + manual (pen device, dated) |
| AC-NBK-010 | Attachments dedupe by content; clean-up only after release | unit + integration + e2e |
| AC-NBK-012 | Body text found by global search; trash excluded (D-17) | integration + e2e |
| AC-NBK-016 | Opened, edited, drawn on and exported offline | e2e (Chromium; others where supported) |
| AC-NBK-017 | Page, chapter, section and notebook PDF export checked in an independent reader | e2e + external application check |
| AC-NBK-020 | Backup with notebooks, ink and attachments restores byte-identical; never overwrites | integration + e2e |
| AC-NBK-022 | A page copied into a document exports to DOCX without new loss notes (INT-07) | integration + e2e |
| AC-NBK-502 | Upgrade to the notebook database version behind a safety copy; previous build fails closed | upgrade test (real browser) |
| AC-NBK-503 | Privacy e2e covers notebooks | e2e (3 browsers) |

### 4.5 M05 Advanced PDF Studio — AE-P8 ([PRD](MODULE_05_PDF_STUDIO_PRD.md))

- **Status:** Absent (`packages/pdf-studio/README.md` stub; no pdf.js or pdf-lib installed). PDF exists only as output today.
- **Families:** AC-PDF-001 … 025 (with 017a/b/c), 501 … 512 (502, 506, 507 and 510 are "covered by" rows), 701 … 709, 901 … 905.

| Key criterion | Summary | Evidence |
|---|---|---|
| AC-PDF-001 | Every real-world corpus file opens or shows an error with "Download original" | integration + e2e (Chromium, Firefox, WebKit) |
| AC-PDF-005 | Highlights survive reload, rotation and reordering; source SHA-256 unchanged | unit + e2e |
| AC-PDF-011 | Merging three PDFs leaves the sources byte-identical | integration + e2e |
| AC-PDF-015 | AcroForm filling; filled copy checked in an independent reader | integration + e2e + external application check |
| AC-PDF-016 | Dated OCR evaluation report answered by the owner (evaluation only; AI question in DEPENDENCY_AND_LICENCE_PLAN §4.5) | manual (dated report) |
| AC-PDF-017a/b/c | Original bytes, annotated and flattened exports checked in two independent readers | integration + external application check + manual |
| AC-PDF-018 | Original data preserved through every operation class, versions and backup | integration + e2e |
| AC-PDF-019 | Every control labelled view, annotation layer or changes-the-PDF | unit + e2e |
| AC-PDF-023 | Encrypted PDFs: password never stored | integration + e2e |
| AC-PDF-501 | PERF-010 and PERF-008 with the 300-page corpus file | measurement |
| AC-PDF-503 | Malformed-PDF corpus: no crash, hang or script execution (with AC-SEC-026) | integration (fuzz corpus) |
| AC-PDF-504 | Privacy e2e covers PDF Studio; worker and font data from the app origin | e2e (3 browsers) |

### 4.6 M06 Classroom Hub — AE-P9 ([PRD](MODULE_06_CLASSROOM_HUB_PRD.md))

- **Status:** Absent; packages and backend directories are stubs. CLS-FR-023 Partial (studios exist, no link to classrooms).
- **Families:** AC-CLS-001 … 014, 020 … 030 (024a/b/c), 040 … 045, 060 … 064, 501 … 513, 701 … 712, 901 … 905.

| Key criterion | Summary | Evidence |
|---|---|---|
| AC-CLS-004, 005 | Assignment visibility and deadline rules enforced by the host clock | integration + e2e |
| AC-CLS-008 | Draft grades never reach students; grade history recorded | integration |
| AC-CLS-012 | Resubmission rounds keep earlier rounds and their digests | integration |
| AC-CLS-024a/b/c | Exactly one round per submission; idempotent; no re-upload of known blobs | e2e + IndexedDB inspection + integration (fault injection) |
| AC-CLS-030 | Offline submission queued and sent after restart and reconnect | e2e (Chromium) + persistence |
| AC-CLS-041 | Permission matrix enforced for every route and role | integration |
| AC-CLS-044 | Sign-in rate limiting; forced reset; revocation on next request | integration |
| AC-CLS-063 | Cookie flags, OS secure storage, hashed tokens | integration + manual per platform (dated) |
| AC-CLS-501, 502 | Studios work with the host stopped; privacy e2e unchanged with no host | e2e |
| AC-CLS-504 | IDOR tests across classrooms | integration |
| AC-CLS-507 | Logs free of secrets, content and titles | integration |
| AC-CLS-511 | Pinned Python with locked dependencies; host migration test with a pre-migration copy | CI + integration |
| AC-CLS-905 | Route-enumeration test for the permission dependency | integration |

- Linked global criteria: AC-SEC-040 … 044, 050, 063, 070 … 075, AC-SYN-001 … 012, 015 … 018, AC-INT-03, AC-INT-04, AC-SEC-085 (security review).

### 4.7 M07 Collaboration Workspace — AE-P10 ([PRD](MODULE_07_COLLABORATION_PRD.md))

- **Status:** Absent except COL-FR-009, 011, 012 (Partial, local only) and COL-FR-017, 018 (Done by construction).
- **Families:** AC-COL-001 … 024 (010a/b/c, 012a/b), 501 … 513, 701 … 711, 901 … 906.

| Key criterion | Summary | Evidence |
|---|---|---|
| AC-COL-003, 019 | Viewer and commenter content updates rejected by the host | integration |
| AC-COL-006 | Revocation closes the socket within 2 s | integration + e2e |
| AC-COL-010a/b/c | Three editors converge; per-client undo; goldens unchanged through the CRDT binding | e2e + integration |
| AC-COL-013, 014 | Reconnection after relay restart and network cuts; offline edits survive restart | e2e |
| AC-COL-015 | Dated spike report; ADR approved by the owner | manual (dated document review) |
| AC-COL-016 | Two physical devices co-edit on a LAN with internet blocked (dated) | manual external check (dated) |
| AC-COL-017, 018 | Private items make no request; shared items edit offline (re-verify: yes for 018) | e2e |
| AC-COL-503 | Randomised convergence: 5 replicas, 10,000 operations, 100 seeds | integration |
| AC-COL-504 | PERF-012 (AC-PERF-012 canonical) | measurement |
| AC-COL-508 | Unauthenticated socket refused; token for one item cannot open another; TLS per D-14 | integration |
| AC-COL-513 | Licence gate passes; no Tiptap Pro | CI |

### 4.8 M08 Advanced File Manager — AE-P11 ([PRD](MODULE_08_FILE_MANAGER_PRD.md))

- **Status:** flat list; FIL-FR-004 favourites, 006 trash, 007 restore, 015 backup, 016 restore from backup Done; folders, tags and previews Absent; the rest Partial.
- **Families:** AC-FIL-001 … 025 (006a/b/c, 016a/b), 501 … 510, 701 … 711, 901, 902.

| Key criterion | Summary | Evidence |
|---|---|---|
| AC-FIL-001, 002 | Folders, nesting to depth 16, cycle refusal | unit + e2e |
| AC-FIL-003 | Tags; delete removes from every item in one transaction | unit + e2e |
| AC-FIL-005 | Recent by last opened (D-32) without changing `updatedAt` | unit + e2e |
| AC-FIL-011 | Thumbnails without network access | e2e |
| AC-FIL-012 | Bulk actions apply to all or none | unit + e2e |
| AC-FIL-016a/b | Restore reproduces folders and tags; format 2 still imports | e2e (Chromium, WebKit, Firefox) + integration |
| AC-FIL-018 | Storage totals within 1 % of an independent byte count | integration |
| AC-FIL-019 | Injected failures leave data unchanged with a clear message | unit + e2e |
| AC-FIL-505 | v3→v4 upgrade on 1,000 items within PERF-014; older build fails closed | upgrade test + measurement |
| AC-FIL-507 | Privacy e2e covers File Manager flows | e2e |

- **Re-verify: yes** for AC-FIL-004, 006a, 007, 015, 016a.

### 4.9 M09 Unified Dashboard and Workspace — AE-P12 ([PRD](MODULE_09_DASHBOARD_PRD.md))

- **Status:** DSH-FR-005 favourites, 006 quick actions, DSH-UX-041 light theme and 048 preserved functions Done; DSH-UX-040 Unverified; most others Partial or Absent.
- **Families:** AC-DSH-001 … 018, 020 … 031, 501 … 509, 740 … 750, 901, 902.

| Key criterion | Summary | Evidence |
|---|---|---|
| AC-DSH-006 | Exactly one item per quick action, even on double-click | unit + e2e |
| AC-DSH-011 | Data-safety card never empty | unit (state table) |
| AC-DSH-014 | No panel refers to a module not in the build (D-31) | unit + e2e |
| AC-DSH-018 | A failing panel is contained and can retry | unit + e2e |
| AC-DSH-020 … 026 | Content search for every kind and for folders and tags | e2e |
| AC-DSH-030, 031 | Trash excluded by default; purged items never returned | unit + e2e |
| AC-DSH-501, 502 | PERF-001, 002 and 011 | measurement |
| AC-DSH-742 | Dark theme meets AA, including danger button and badges | measurement (contrast) + e2e |
| AC-DSH-746 | Skip link, accessible drawer, screen-reader pass recorded | e2e + manual (dated) |
| AC-DSH-748 | Every preserved dashboard function still works | unit + e2e |
| AC-DSH-750 | "Go to Dashboard" recovers after a render error without reload | unit + e2e |

- **Re-verify: yes** for AC-DSH-005, 006, 741, 748.

### 4.10 Reconciliation items found while indexing the PRDs

These do not change any requirement; they align numbering with §1.1. The PRDs were re-checked on 2026-11-15 after they were revised, and the remaining items were applied to the PRDs at the AE-P1 consolidation the same day. Every row is now **Resolved**; the rows are kept as a record.

| Item | Finding | Canonical resolution |
|---|---|---|
| M08 offline criterion | An earlier draft of the PRD labelled its FIL-NFR-004 (offline) criterion AC-FIL-503 | **Resolved:** MODULE_08_FILE_MANAGER_PRD.md:441 now numbers it AC-FIL-504 ("All File Manager actions work with the network off") |
| M08 FIL-NFR-003 | Virtualised lists and lazy previews had no criterion in an earlier draft | **Resolved:** MODULE_08_FILE_MANAGER_PRD.md:440 defines AC-FIL-503 (lists over 200 rows virtualised; previews load lazily) |
| M04 NBK-NFR-004 | No AC-NBK-504 in an earlier draft | **Resolved:** MODULE_04_DIGITAL_NOTEBOOK_PRD.md:341 defines AC-NBK-504 (same check as AC-NBK-016) |
| M05 PDF-NFR-002, 006, 007, 010 | No AC-PDF-502, 506, 507, 510 | **Resolved:** MODULE_05 §10 now has "covered by" rows AC-PDF-502 (→ AC-PDF-018), 506 (→ 021), 507 (→ 025) and 510 (→ 017b/c), and a new AC-PDF-512 for PDF-NFR-012 (platform support), which had no criterion |
| M03 PRS-UX-001, 004, 006, 007, 009 | No AC-PRS-701, 704, 706, 707, 709 | **Resolved:** MODULE_03 §10 now defines AC-PRS-701, 704, 706, 709 and a "covered by" row AC-PRS-707 (→ AC-PRS-063) |
| M05 PDF-UX-002 … 005, 007 … 009 | Only AC-PDF-701 and 706 existed | **Resolved:** MODULE_05 §10 now defines AC-PDF-702 … 705 and 707 … 709 |
| Interface criteria | PRS-IF-002 and PRS-IF-005 have no AC-PRS-902/905; NBK-IF-001 has no AC-NBK-901; PDF-IF-001 … 005 have no AC-PDF-901 … 905 | **Resolved:** MODULE_03 now defines AC-PRS-902 and AC-PRS-905 (→ AC-INT-04), MODULE_04 AC-NBK-901 and MODULE_05 AC-PDF-901 … 905. (M08 and M09 were already resolved: FIL-IF-001/002 and DSH-IF-001/002 are now defined, MODULE_08 §9.1–9.2 and MODULE_09 §9.1–9.2, and AC-FIL-901/902 and AC-DSH-901/902 mirror them) |
| M04 NBK-UX-002, 004 … 007 | No AC-NBK-702, 704 … 707 (found at consolidation) | **Resolved:** MODULE_04 §10 now defines them |
| Range rows | M01 (AC-DOC-701…710), M02 (several ranges), M06 (AC-CLS-701…712), M07 (AC-COL-701…711, 901…906), M08 (AC-FIL-701…711) use one row for a range | Allowed: each ID in the range is a separate criterion with the shared wording |

---

## 5. Release gate checklist

### 5.1 Every phase: entry (brief §13; ROADMAP §5 common gate)

- [ ] The previous phase is approved by the owner (dated record).
- [ ] From AE-P3 onward: CI is green on main for every job, including Firefox e2e (AC-REL-001). AE-P2 must reach this at its exit.
- [ ] A verified repository bundle has been taken, with an off-machine copy (AC-REL-007).
- [ ] Every owner decision (D-NN) that blocks this phase is answered.
- [ ] The phase's criteria list (from §2, §4 and the PRD) is copied into the phase plan with the evidence type for each.
- [ ] Performance baselines exist for every PERF metric the phase touches (from AE-P3).

### 5.2 Every phase: exit

- [ ] Every criterion assigned to the phase passes with recorded evidence, or has a dated owner waiver listed in the known limitations.
- [ ] Every v0.2-Done criterion in scope has been re-verified.
- [ ] No regression: all criteria of earlier phases still pass (full CI plus upgrade test).
- [ ] No open data-loss defect of any severity (AC-REL-013 rule) and no open Critical or High defect in the phase's scope.
- [ ] Privacy e2e and offline e2e cover every feature added (AC-SEC-001, AC-SYS-014).
- [ ] Licence gate, vulnerability gates and dependency review records are complete (AC-DEP-001, -003, -009).
- [ ] Before-and-after measurements recorded for touched PERF metrics.
- [ ] External compatibility records dated and stored under `docs/compatibility/<phase>-<date>/` for every format claim made in the phase.
- [ ] Documentation updated (no stale statement of the kinds listed in the canonical brief §0.5).
- [ ] Phase report written: what was delivered, evidence, waivers, shortcuts with ADR/TD (AC-SYS-013), open risks.
- [ ] Annotated phase tag on a green commit (AC-REL-004).
- [ ] Owner approval recorded.

### 5.3 Release candidate (AE-P15): brief §15

| # | Brief §15 item | Criteria | Done |
|---|---|---|---|
| 1 | All nine modules are functional | AC-REL-010: every AC-DOC, AC-DGM, AC-PRS, AC-NBK, AC-PDF, AC-CLS, AC-COL, AC-FIL, AC-DSH passes or is waived and disclosed | [ ] |
| 2 | Cross-module workflows work | AC-REL-011: AC-INT-01 … 09 pass end to end in three browsers | [ ] |
| 3 | No known critical or high-severity bugs | AC-REL-012: zero open Critical or High defects (RELEASE_STRATEGY §6.2) | [ ] |
| 4 | No known data-loss bugs | AC-REL-013: zero open data-loss defects of any severity; AC-SYN-008, AC-SYS-039/040/051 pass | [ ] |
| 5 | Import/export has real compatibility evidence | AC-REL-014: a dated independent-application record for every format the UI offers (Word Mac and Windows, LibreOffice, Pages, PowerPoint, Keynote, diagrams.net, an independent PDF reader), or the claim removed and disclosed; AC-DOC-106 | [ ] |
| 6 | Offline workflows work | AC-REL-015: offline e2e for every kind in three browsers plus a manual offline check per native platform | [ ] |
| 7 | Backup and restore work | AC-REL-016: every kind and store, format 3 and import of format 2, in every browser project; cross-platform restore into an empty profile | [ ] |
| 8 | Security review passes | AC-REL-017: AC-SEC-085 with no open Critical or High finding; all AC-SEC pass | [ ] |
| 9 | Supported platform builds have been tested | AC-REL-018: AC-PLT-001 … 008 as approved under D-30, on real machines and devices, dated | [ ] |
| 10 | Documentation is complete | AC-REL-019: user guide, classroom host admin guide, architecture and ADRs, data-format docs, security reporting channel (AC-SEC-080), release notes | [ ] |
| 11 | Known limitations are disclosed | AC-REL-020: every waiver, unverified compatibility claim and platform limit listed | [ ] |
| 12 | Release artifacts are reproducible | AC-REL-021: locked inputs in every ecosystem (AC-DEP-013); a second CI build of the tag gives identical web bundle hashes; SBOM and checksums attached (AC-DEP-008) | [ ] |
| — | Automated tests alone are not sufficient | AC-REL-024: the manual acceptance checklist (rebuilt from `tests/acceptance/CHECKLIST.md`, last run 2026-11-12) run on the RC on every supported platform, dated | [ ] |
| — | Release candidate first | AC-REL-022: `v1.0.0-rc.N` tagged; v1.0.0 will be the same commit plus a version-only change | [ ] |
| — | Accessibility | AC-A11Y-005 screen-reader pass recorded; AC-A11Y-001 audit recorded | [ ] |
| — | Performance | AC-PERF-001 … 014 measured on the RC build | [ ] |
| — | Licences | AC-DEP-015 licence texts shipped; AC-DEP-017 re-review recorded | [ ] |

### 5.4 Stable (AE-P16)

- [ ] The owner's explicit, dated approval of a specific RC is recorded (AC-REL-023).
- [ ] `v1.0.0` is tagged on the approved RC commit with only the version changed, and that commit's CI is green (AC-REL-022).
- [ ] GitHub release published with SHA-256 checksums and the release SBOM (AC-DEP-008).
- [ ] Pages deploys the release tag only (AC-REL-002).
- [ ] Rollback procedure in place and rehearsed (AC-REL-026).
- [ ] Release notes include upgrade notes, format changes and known limitations (AC-REL-025, AC-REL-020).

---

## 6. Recording evidence

| Evidence type | Where it is kept | Minimum content |
|---|---|---|
| unit, integration, e2e | Test files in the repository; CI run id | Test name ↔ AC-ID mapping in each test's title or a comment (`AC-DOC-069a`) so a report can be generated |
| external | `docs/compatibility/<phase>-<date>/README.md` plus the files and screenshots | Application, version, OS, date, file list, observed differences, who checked |
| measurement | `docs/performance/<phase>-<date>.md` (proposed) plus raw data | Hardware (D-29), build commit, method, raw numbers, p50/p95, target, pass or fail |
| manual | Phase report or a dated record in `docs/` | Reviewer, date, scope, findings, decision |
| waiver | Phase report and release notes | Criterion, reason, owner's dated approval, known-limitations text |

Known evidence gap carried over (R-035): the Round 3 fail-before logs from v0.2 Phase 7 were lost when the scratchpad was cleared (RELEASE_GAPS.md §11). From AE-P2 onward, evidence lives in the repository or in CI artifacts, never only in a scratch directory.
