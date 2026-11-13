# 0007 — Backups: one validated JSON file that never overwrites and can be restored twice

**Status:** Accepted in Release 0.2 (format 2). Hardened in Phases 2 and 3.

## Context

A backup file is the only protection against clearing site data, eviction and losing the device ([0001](0001-local-first-storage.md)). Restoring must be safe even on a device that already holds newer work.

## Decision

1. **Format 2:** `{ format: 'dcos-backup', formatVersion: 2, schemaVersion, exportedAt, deviceId, items, versions, attachments }`.
   - Attachments are base64.
   - `schemaVersion` is the highest content schema in the file, not the database version, so v0.1.0 can restore a file exactly when all of its content is still schema 1.
   - Versions are written with images inline ([0005](0005-version-history.md)).
   - Only attachments referenced by the exported items and versions are included ([0008](0008-attachments.md)).
2. **Validate everything first; all or nothing.** Damaged JSON, unknown formats, newer schemas and item or version content that isn't an object refuse the whole file, with a reason. Nothing is written.
3. **Never overwrite:**
   - New ids are added.
   - Identical items are skipped.
   - A changed item comes back once as a "(restored)" copy, with its history; `restoredFrom` makes a repeat import a no-op.
   - Attachment bytes already stored under another id become an alias.
4. **Pruning on import** keeps each item within the 50-version limit, with protected versions kept.
5. **"Last backup exported"** records when the export started. Browsers can't confirm that the file was saved, so the UI says so.

## Consequences

- Backups are plain, unencrypted text, including the trash and full history ([0002](0002-identity-ownership-privacy.md)).
- Files are larger than the database when histories contain images, because they are inline again.

## Verification

- `e2e/backup-restore.spec.ts` (Chromium, WebKit): a UI-made dataset restored into an empty profile and compared store by store, then repeated and edited restores, and refused files.
- `packages/local-storage/src/indexeddb.test.ts` and `hardening.test.ts`.
- `tests/integration/v0.1.0-fixtures.test.ts`.
- `npm run test:upgrade`.
