# Data migration plan

How Digital Classroom OS changes its stored data from v0.1.0 onward without losing records, IDs or meaning. This is the companion to [RELEASE-0.2-AUDIT.md](RELEASE-0.2-AUDIT.md) §7. Finding IDs refer to [FINDINGS.md](FINDINGS.md).

**Status:** proposed and awaiting approval. Nothing here has been implemented.

## 1. Principles

1. **Additive only.** New stores, fields, node types, shape IDs and routes are added. Existing ones are never renamed, reshaped or deleted.
2. **IDs are permanent.** Item UUIDs, version UUIDs, `deviceId`, template IDs, diagram node and edge IDs, handle IDs `t/r/b/l`, `ShapeKind` strings and Tiptap node and mark names carry over unchanged through every migration, every backup and the move to SQLite.
3. **Never write data you can't read.** An app that meets content from a newer version opens it **read-only** and never autosaves over it (fixes DOCU-2, DIAG-6).
4. **Never write as a side effect of reading.** Opening an item must not save it just because normalisation changed its JSON. Writes come only from user edits or an explicit upgrade step.
5. **Copy before upgrading.** Every IndexedDB schema bump first copies the current database (§4.3).
6. **Proven by fixtures.** Every migration ships with tests that load the frozen v0.1.0 fixtures and assert IDs and content survive.

## 2. The frozen v1 contract

Taken from `packages/local-storage/src/indexeddb.ts` at `v0.1.0-baseline`. Any change to the following is a breaking change and is not allowed:

| Element | v1 definition |
|---|---|
| Database | `digital-classroom-os`, version 1 |
| Stores | `documents`, `diagrams` (keyPath `id`); `document_versions`, `diagram_versions` (keyPath `id`, index `by_item` → `itemId`); `meta` (keyPath `key`) |
| Item | `WorkspaceItem { id, kind, title, content, version, createdAt, updatedAt, deletedAt, ownerDeviceId, favorite, templateId, lastSnapshotAt }` |
| Version | `ItemVersion { id, itemId, kind, version, title, content, createdAt, reason }` |
| Document content | `{ schemaVersion: 1, doc: <ProseMirror JSON>, page: PageSettings, mode }` |
| Diagram content | `{ schemaVersion: 1, nodes: SerializedNode[], edges: SerializedEdge[], viewport, settings }` |
| Backup | `{ format: 'dcos-backup', schemaVersion: 1, exportedAt, deviceId, items, versions }` |
| Routes | `#/`, `#/documents`, `#/diagrams`, `#/trash`, `#/settings`, `#/documents/:id`, `#/diagrams/:id` |
| localStorage | `dcos.theme` ∈ `light \| dark \| system` |

## 3. Step 0: fixtures (before any change)

Capture these from the running v0.1.0 app and commit them to `tests/fixtures/v0.1.0/`:

- `documents/<template>.json`: one `WorkspaceItem` per document template.
- `documents/kitchen-sink.json`: every node and mark in `documentExtensions()`, including headings 1–4, all list types, a table with a header row, a base64 image, pageBreak, tableOfContents, codeBlock, multicolour highlight, sub/superscript, textStyle colour/size/font, link and every text alignment.
- `diagrams/<template>.json` for all 10 templates, plus `diagrams/all-shapes.json` covering every `ShapeKind`, every arrow, dash and line type, a label and a `zIndex`.
- `backup-v1.json`: a full backup including a trashed item and several versions with each `reason`.

Tests that must pass on every later commit:
- each fixture loads (`normalizeDocument` / `deserializeDiagram`, and the Tiptap schema accepts it)
- re-serialising gives an equivalent document
- `importBackup(backup-v1.json)` into an empty database keeps every ID
- the DOCX golden output for each document fixture is unchanged, or changes only with a reviewed snapshot update

## 4. IndexedDB v2 (Release 0.2)

### 4.1 Migration function signature

Change `MIGRATIONS` from `(db) => void` to `(db, tx, oldVersion) => void`, passing idb's upgrade transaction, so data migrations can read existing stores. `MIGRATIONS[0]` keeps exactly the same body. Inside an upgrade **only IndexedDB requests may be awaited**. Awaiting anything else (`crypto.subtle`, `fetch`) lets the versionchange transaction auto-commit early (STOR-16).

### 4.2 What v2 adds

| Store / key | Purpose | Contents | Backfill |
|---|---|---|---|
| `item_index` | Fast lists (STOR-11) | `{ id, kind, title, createdAt, updatedAt, contentUpdatedAt, deletedAt, favorite, sizeBytes }`, indexes `by_kind_updated`, `by_deleted`, `by_favorite` | In the upgrade transaction: walk `documents` and `diagrams` with cursors and write one summary each. Source records are only read. `contentUpdatedAt` is set to `updatedAt` |
| `attachments` | Images and binaries out of content (STOR-10, DOCU-7) | `{ id, sha256, mimeType, sizeBytes, blob, createdAt }`, unique index `by_sha256` | None in the upgrade (hashing is async); see §6 |
| `drafts` | Crash and conflict recovery (CODE-2, STOR-8) | `{ key: kind:id, baseVersion, patch, savedAt }` | None |
| `meta` keys (no schema change) | | `lastBackupAt`, `lastBackupItemCount`, `appVersion`, `migratedFrom` | Written after upgrade |

From then on, `create`, `save`, `trash`, `restore` and `purge` update `item_index` **in the same transaction** as the record they touch. `list()` reads only from `item_index`.

**Metadata versioning (CODE-6).** Add `metaVersion` to the summary. Favorite and trash/restore change `favorite`/`deletedAt` and `metaVersion` only, leaving `version` and `updatedAt` alone. The editor's conflict check keeps using `version`, so starring no longer causes conflicts. Old records without `contentUpdatedAt` or `metaVersion` read them as `updatedAt` and `0`.

### 4.3 Upgrade procedure

1. Call `indexedDB.databases()` (or open the database without a version) to read the current version.
2. If it is lower than the target:
   1. Open at the **current** version.
   2. Copy every store into a new database `digital-classroom-os-backup-v<old>`, including the stamp `{ copiedAt, fromVersion, itemCount }`.
   3. Verify the item counts match.
   4. Close it.
3. Open at the target version. `upgrade()` runs the appended migrations.
4. After a successful open, write `meta.migratedFrom` and show a one-time notice: "Storage updated. A safety copy of your previous data is kept on this device."
5. Keep the safety copy for 30 days or 3 successful launches, whichever is later. Settings → Storage can restore from it or delete it.
6. On any failure, the app shows a recovery screen. The options are: export from the safety copy as a backup file, retry, or open read-only. The app never deletes the original.

**Multiple tabs (STOR-9).**
- `blocking()` must flush every open editor's pending edits, close the connection, and show "A newer version is ready, reload to continue". It must not reload immediately.
- Add a `blocked()` handler ("close other Classroom OS tabs") and a `terminated()` handler.
- Switch the PWA from `autoUpdate` to `prompt`, so a new app version never reloads a tab that has unsaved edits.

### 4.4 Tests

In fake-indexeddb:
1. Build a v1 database from `backup-v1.json`.
2. Open with the v2 adapter.
3. Assert every v1 record is byte-identical to before, `item_index` has one correct row per item, the safety-copy database exists with equal counts, and the v1 stores and index still exist.
4. Open a second connection during the upgrade and assert the blocking path saves its pending edits.
5. Run the full v1 adapter test suite against the v2 adapter.

## 5. Content schema upgrades

```ts
// packages/document-studio/src/migrate.ts   (diagram-studio: same pattern)
export const DOCUMENT_SCHEMA = 2;                    // current
const UPGRADERS: Array<(c: any) => any> = [
  /* 1 → 2 */ (c) => ({ ...c, schemaVersion: 2, /* additive change */ }),
];
export function migrateDocument(raw: unknown):
  | { ok: true; content: DocumentContent; upgraded: boolean }
  | { ok: false; reason: 'newer'; version: number }        // open read-only
```

Rules:
- Upgraders are pure, ordered and never skipped, and each one is unit-tested against every v0.1.0 fixture.
- `schemaVersion` greater than `DOCUMENT_SCHEMA` → `{ ok: false, reason: 'newer' }` → the editor opens read-only with a banner, and nothing is written.
- An upgrade that changed content is saved **once**, with an `'upgrade'` version reason and a snapshot of the pre-upgrade content. Merely opening must not loop.
- Tiptap is created with `enableContentCheck: true`. `onContentError` puts the editor in read-only recovery mode, which shows the raw JSON and offers "Save as copy" / "Export". Autosave stays off for that session.
- Unknown diagram node fields and `ShapeKind`s are kept in an `extras` bag and rendered as a visible "unknown shape" placeholder, never dropped.

Planned upgraders (each is additive):

| Content | Version | Change | Release |
|---|---|---|---|
| Document | 1 → 2 | `page` becomes `sections[0]`; `mode` moves to a per-user preference (kept in content for older readers); `asset:` image sources allowed; optional `bibliography`, `comments` | 0.3 |
| Diagram | 1 → 2 | Shapes referenced by registry ID with the 12 old names as aliases; optional `parentId`, `locked`, `layerId`, `rotation`, `opacity`; `layers[]`; viewport moved out of versioned content | 0.4 |

## 6. Images to the attachments store

1. Ship `asset:<id>` resolution in the editor (node view) **and** in every exporter (DOCX, PDF print, TXT ignores images, and later ODT/PPTX), in one release, **before** any content uses it. `data:` URLs remain valid forever.
2. New images go straight into `attachments` (deduplicated by SHA-256) and are referenced as `asset:<id>`.
3. Existing documents are converted **lazily**: on open, data URLs are hashed and stored, and the content is rewritten only as part of the user's next real save, with a version snapshot. No bulk rewrite runs in the upgrade transaction.
4. Version snapshots that reference an attachment keep it alive. Purging an item removes attachments no other record references.
5. Backup format v2 carries attachments as base64 in an `attachments` section, so backups remain one self-contained file.

## 7. Backup format v2

```jsonc
{
  "format": "dcos-backup",
  "formatVersion": 2,            // independent of the database version
  "schemaVersion": 1,            // kept for v1 readers; v1 rejects only if > 1
  "appVersion": "0.2.0",
  "exportedAt": "…", "deviceId": "…",
  "items": [...], "versions": [...],          // unchanged v1 sections
  "stores": { "attachments": [...], "presentations": [...] }   // new, additive
}
```

- **v1 compatibility only when it is safe.** The exporter writes `schemaVersion: 1` only when every item's content is still content schema 1. The v0.1.0 importer then accepts the documents and diagrams and ignores the new sections. If any content is newer, it writes `schemaVersion: 2`, so v0.1.0 refuses the whole file. That matters because v0.1.0 lacks the read-only guard and would otherwise open newer content blank (C-1).
- v2 apps import v1 and v2 backups.
- Validation checks every field; missing optional fields get defaults; content goes through `migrateDocument`/`migrateDiagram`.
- **Idempotent.** A copy made by import records `restoredFrom: { itemId, version, updatedAt }`. Importing the same file again skips it (STOR-6).
- An import that fails on any record rolls back entirely and reports which record failed.
- Export failures surface as an error toast, and `lastBackupAt` is written only on success.

## 8. New item kinds (0.5 onward)

- `ItemKind` gains `'presentation' | 'notebook' | …` through a `Record<ItemKind, { items, versions }>` store map. A missing entry is a compile error (ARCH-4).
- Each kind ships as one appended migration (v3, v4, …) that creates its two stores and backfills nothing.
- Older apps meeting a backup with unknown kinds import what they understand and report the rest.

## 9. SQLite (Release 0.8)

1. Extract `packages/local-storage/src/contract.test.ts` from today's adapter tests plus the v2 tests. Every adapter (IndexedDB, Tauri SQLite, Capacitor SQLite) must pass it.
2. The SQLite schema follows `docs/DATABASE.md` (corrected for `kind` columns and the index tables). It uses WAL mode, `foreign_keys=ON`, and one transaction per adapter call.
3. Data moves from web to desktop or Android via backup format v2. All IDs are inserted verbatim. A test imports `backup-v1.json` and a v2 backup into SQLite and compares against the IndexedDB adapter's view.
4. Inside one install, the native shell never uses IndexedDB and SQLite at the same time. The adapter is chosen once at startup (ARCH-6, ARCH-12).

## 10. Rollback

| Situation | Recovery |
|---|---|
| A v2 upgrade fails mid-way | The IndexedDB upgrade transaction aborts and v1 data stays intact. The safety-copy database is also there. |
| A bug is found after upgrading | Settings → Storage → "Restore safety copy" (re-imports the copy as a v2 backup, never overwriting; diverged items become copies). |
| An older app version opens v2 data | Its `open(v1)` fails with VersionError, and the app shows "This device has newer data — update the app" instead of failing silently (STOR-9). |
| Content from a newer version | Opens read-only (§5). |
