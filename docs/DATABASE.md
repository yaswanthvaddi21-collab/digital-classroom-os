# Database design

## Rules (from PRD §7)

UUID ids · `createdAt`/`updatedAt` ISO timestamps · owner device id · version numbers · soft delete (`deletedAt`) · migrations · transactional writes · backup and restore. Each device has its own database; shared records move only through explicit sync operations.

## Implemented now (IndexedDB, schema v3)

Database `digital-classroom-os`:

| Store | Since | Key | Indexes | Holds |
|---|---|---|---|---|
| `documents` | v1 | `id` | — | `WorkspaceItem<DocumentContent>` |
| `diagrams` | v1 | `id` | — | `WorkspaceItem<DiagramContent>` |
| `document_versions` | v1 | `id` | `by_item` → `itemId` | `ItemVersion` snapshots |
| `diagram_versions` | v1 | `id` | `by_item` → `itemId` | `ItemVersion` snapshots |
| `meta` | v1 | `key` | — | `deviceId`, `lastBackupAt`, other small settings |
| `item_index` | v2 | `id` | `by_kind` → `kind` | Lightweight list rows (title, dates, favourite, trash) so lists don't load full content |
| `drafts` | v2 | `key` | — | Unsaved edits kept after a save failed, one per editor session (key `kind:itemId:session`; drafts from before Phase 3 use `kind:itemId`). Offered back when the item reopens and listed in Settings → Storage ([ADR 0004](adr/0004-autosave-and-drafts.md)) |
| `attachments` | v2 | `id` | `by_sha256` (unique) | Binary files, deduplicated by hash: PNG previews of diagrams embedded in documents and on slides, and (Phase 7) pictures and picture backgrounds of presentations. When a backup brings bytes this device already has under another id, an alias record `{ id, aliasOf }` is stored instead; `getAttachment` follows it |
| `presentations` | v3 | `id` | — | `WorkspaceItem<PresentationContent>` (Phase 7, [ADR 0014](adr/0014-presentation-studio.md)) |
| `presentation_versions` | v3 | `id` | `by_item` → `itemId` | `ItemVersion` snapshots of presentations |

`diagram_versions` extends the PRD's entity list so diagrams get the same history guarantees as documents. The v1 stores are frozen: v2 and v3 only add stores.

**Version 3 (Phase 7, owner's decision 2026-11-14).** `MIGRATIONS[2]` only creates `presentations` and `presentation_versions`, shaped like the document stores; no existing store, index or record is read or changed, and it runs only after the verified safety copy (`digital-classroom-os-backup-v2` for a Phase 6 profile, `-backup-v1` for v0.1.0) or a backup file made on the recovery screen. Every store list (attachment clean-up, backup export and import, the pre-upgrade backup, the safety-copy export) comes from the kind registry `STORES` or from the database's own store names, so a kind cannot be skipped. **Builds before Phase 7 cannot open a version-3 database:** IndexedDB refuses them with `VersionError`, and they fail closed (they read, clean up, import and delete nothing); this build shows "Your data was saved by a newer version of Classroom OS" with Update now or Reload when it meets a database made by a newer build. Checked by `packages/local-storage/src/kinds.test.ts` and by `npm run test:upgrade` against the real Phase 6 build (`650cf63`).

```ts
WorkspaceItem { id, kind: 'document'|'diagram'|'presentation', title, content, version, createdAt, updatedAt,
                deletedAt|null, ownerDeviceId, favorite, templateId|null, lastSnapshotAt|null, restoredFrom? }
ItemVersion   { id, itemId, kind, version, title, content, createdAt, reason: 'create'|'manual'|'auto'|'restore', blobRefs? }
Attachment    { id, sha256, mimeType, sizeBytes, createdAt, lastUsedAt?, data: ArrayBuffer }   // or an alias { id, aliasOf, createdAt, lastUsedAt? }
```

**Writes:** `save(kind, id, patch, expectedVersion)` checks the version and writes the record, its index row and any version snapshot in one transaction. A stale `expectedVersion` throws `ConflictError`. Favourite and trash changes are metadata: they update the index row but don't bump `version` or `updatedAt`.

**Version history:** snapshots on create, on Ctrl/⌘+S (`snapshot()`, which doesn't bump the item), at most every 10 minutes of editing, and before a restore. Pruning keeps exactly 50 per item and never evicts the create version, the newest manual version or the newest pre-restore version.

**Large images in version history** are stored once: a new version's `data:` URLs over 16 KB are moved into `attachments` (type `text/x-dcos-data-url`) and replaced by `dcos-blob:<id>`, listed in `blobRefs`. Every reader restores them byte for byte, and backups keep them inline ([ADR 0005](adr/0005-version-history.md)). **Unused attachments** are removed only when nothing references them and they are older than 24 h ([ADR 0008](adr/0008-attachments.md)).

**Migrations:** `MIGRATIONS[i](db, tx)` upgrades version *i* → *i+1* inside IndexedDB's `upgrade` transaction, and backfills new stores from existing data. Before any upgrade, the adapter copies the whole old database to `digital-classroom-os-backup-v<old>` and verifies the copy. A later attempt never replaces or removes an earlier complete copy; it writes `-2`, `-3`, …. If the copy can't be made (e.g. the device is full), nothing is upgraded: the app shows a recovery screen that can download a backup read-only from the old database, try again, or upgrade without the on-device copy only once that file has been downloaded. An error inside a migration aborts the whole upgrade transaction, so the database stays at its old version (see [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)). Settings → Storage lists these safety copies and can export one as a backup file or delete it. Shipped migrations are never edited. Tests open a real v0.1.0 database (fixtures in `tests/fixtures/v0.1.0`) and check that it upgrades without loss.

**Content schemas** are versioned separately from the database. Each item is stored under the lowest schema number its content needs, so older builds keep editing what they can represent:
- **Documents: newest schema 3** (`DOCUMENT_SCHEMA`, `packages/document-studio/src/migrate.ts`). Schema 1 is v0.1.0; 2 when a document uses anything v0.1.0 could not store (an embedded diagram or any Release 0.2 addition up to v0.2 Phase 5, judged against the frozen vocabulary in `compat.ts`; see [DOCUMENT_COMPATIBILITY.md](DOCUMENT_COMPATIBILITY.md) §2); 3 when it uses anything from v0.2 Phase 6 or later that the Phase 5 build cannot store.
- **Diagrams: newest schema 3** (`DIAGRAM_SCHEMA`, `packages/diagram-studio/src/types.ts`). Schema 1 is v0.1.0; diagrams are saved as 2 when they use only the frozen schema-2 vocabulary and as 3 otherwise (v0.2 Phase 5 features: groups, layers, locks, rotation, links, waypoints and more; `schemaFor()` in `packages/diagram-studio/src/compat.ts`, [ADR 0012](adr/0012-diagram-format-phase5.md)).
- **Presentations: schema 1** (`PRESENTATION_SCHEMA`; the frozen vocabulary in `packages/presentation-studio/src/compat.ts`).

The newest numbers this build reads per kind are `MAX_CONTENT_SCHEMA_BY_KIND` in `packages/local-storage/src/backup.ts` (`{ document: 3, diagram: 3, presentation: 1 }`). Content from a newer app opens read-only rather than being rewritten.

**Backup file (format 2):** `{ format: 'dcos-backup', formatVersion: 2, schemaVersion, exportedAt, deviceId, items[], versions[], attachments[] }`, with attachments as base64. `schemaVersion` is the highest content schema in the file, not the database version. Import validates every record first and imports nothing if the file is malformed, including any item or version whose content isn't an object. Unknown ids are added, identical items are skipped, and divergent items are added as "(restored)" copies, never overwriting local work. Copies remember `restoredFrom`, so importing the same file twice adds nothing. Items needing a newer app are left out and counted. Each imported item's history is pruned to the usual 50 versions under the same protection rules, in the same transaction. Import hashes attachment bytes itself, so a missing or wrong `sha256` in the file can't cause a collision.

**When another tab upgrades the database:** this tab saves what it can, closes its connection and stops editing behind a clear message. Edits that could not be written are kept synchronously in `localStorage` (`dcos-emergency-draft:<kind>:<id>`) and offered back through the normal draft recovery on the next load.

## Native target (SQLite, Phase 5)

> **Out of date (noted 2026-11-16).** This DDL is an early plan, written before v0.2 Phases 2–7, for a native SQLite adapter that **does not exist yet**: the native apps have only the `setStorageFactory` seam (`apps/web/src/lib/platform.ts`). It no longer matches the real IndexedDB model above. It has no `presentations` or `presentation_versions` tables, no `drafts` or `item_index`, no `blobRefs` on versions, and its `attachments` table (owner type and id, file name, a storage path) is a different model from the real store (content-addressed, deduplicated by a unique `by_sha256` index, with alias records; [ADR 0008](adr/0008-attachments.md)). The real store list is the `DcosDB` schema in `packages/local-storage/src/indexeddb.ts`. Do not implement from this DDL. The native storage design is to be redone in AE-P3 (design, decision D-12) and AE-P14 (native builds); see [ADVANCED_EDITION_PRODUCT_ROADMAP.md](advanced-edition/ADVANCED_EDITION_PRODUCT_ROADMAP.md). "Phase 5" and "Phase 1" below are old plan numbers.

The same `StorageAdapter` contract, backed by SQLite (WAL mode, `foreign_keys=ON`). DDL for the full logical model; Phase 1 tables are marked ★.

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT,          -- Argon2id
  role TEXT NOT NULL CHECK (role IN ('student','teacher','admin')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id), display_name TEXT NOT NULL,
  roll_number TEXT, avatar_attachment_id TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE classrooms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_user_id TEXT NOT NULL REFERENCES users(id),
  invite_code TEXT UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE subjects (
  id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id), name TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE memberships (
  id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id),
  user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL CHECK (role IN ('student','teacher')),
  joined_at TEXT NOT NULL, UNIQUE (classroom_id, user_id)
);

-- ★ Phase 1
CREATE TABLE documents (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,      -- JSON
  version INTEGER NOT NULL, owner_device_id TEXT NOT NULL, owner_user_id TEXT,
  subject_id TEXT REFERENCES subjects(id), favorite INTEGER NOT NULL DEFAULT 0, template_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, last_snapshot_at TEXT
);
CREATE TABLE document_versions (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
  reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX document_versions_by_item ON document_versions(item_id, created_at);
CREATE TABLE diagrams (LIKE documents);           -- same columns as documents
CREATE TABLE diagram_versions (LIKE document_versions);

CREATE TABLE notebooks (id TEXT PRIMARY KEY, subject_id TEXT REFERENCES subjects(id), title TEXT NOT NULL,
  owner_user_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE notes (id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL REFERENCES notebooks(id), chapter TEXT,
  title TEXT NOT NULL, content TEXT NOT NULL, version INTEGER NOT NULL, favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

CREATE TABLE assignments (id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id),
  subject_id TEXT REFERENCES subjects(id), title TEXT NOT NULL, instructions TEXT NOT NULL,
  due_at TEXT, published_at TEXT, created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE submissions (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES assignments(id),
  student_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK (status IN ('draft','submitted','returned')),
  submitted_at TEXT, content_snapshot TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (assignment_id, student_id));
CREATE TABLE grades (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
  score REAL, max_score REAL, feedback TEXT, graded_by TEXT NOT NULL REFERENCES users(id), graded_at TEXT NOT NULL);
CREATE TABLE announcements (id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id),
  body TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE attachments (id TEXT PRIMARY KEY, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL,
  file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE sync_operations (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  op TEXT NOT NULL, payload TEXT NOT NULL, base_version INTEGER, origin_device_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','acked','conflict','failed')),
  attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE activity_logs (id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL,
  entity_type TEXT, entity_id TEXT, details TEXT, created_at TEXT NOT NULL);
```

(`LIKE` above is shorthand; the real migration repeats the column list.)
