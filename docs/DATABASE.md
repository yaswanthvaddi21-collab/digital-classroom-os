# Database design

## Rules (from PRD §7)

UUID ids · `createdAt`/`updatedAt` ISO timestamps · owner device id · version numbers · soft delete (`deletedAt`) · migrations · transactional writes · backup and restore. Each device has its own database; shared records move only through explicit sync operations.

## Implemented now (IndexedDB, schema v1)

Database `digital-classroom-os`:

| Store | Key | Indexes | Holds |
|---|---|---|---|
| `documents` | `id` | — | `WorkspaceItem<DocumentContent>` |
| `diagrams` | `id` | — | `WorkspaceItem<DiagramContent>` |
| `document_versions` | `id` | `by_item` → `itemId` | `ItemVersion` snapshots |
| `diagram_versions` | `id` | `by_item` → `itemId` | `ItemVersion` snapshots |
| `meta` | `key` | — | `deviceId` |

`diagram_versions` extends the PRD's entity list so diagrams get the same history guarantees as documents.

```ts
WorkspaceItem { id, kind: 'document'|'diagram', title, content, version, createdAt, updatedAt,
                deletedAt|null, ownerDeviceId, favorite, templateId|null, lastSnapshotAt|null }
ItemVersion   { id, itemId, kind, version, title, content, createdAt, reason: 'create'|'manual'|'auto'|'restore' }
```

**Migrations:** `MIGRATIONS[i]` upgrades version *i* → *i+1* inside IndexedDB's `upgrade` transaction. Shipped migrations are never edited.

**Backup file:** `{ format: 'dcos-backup', schemaVersion, exportedAt, deviceId, items[], versions[] }`. Import validates the file and rejects newer schemas. Unknown ids are added, identical items are skipped, and divergent items are added as "(restored)" copies, never overwriting local work.

## Native target (SQLite, Phase 5)

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
