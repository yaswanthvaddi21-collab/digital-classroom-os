# 0001 — Local-first: each device keeps its own database behind one storage interface

**Status:** Accepted in v0.1.0. Revised in Phase 3, which added adapter injection.

## Context

Students and teachers must be able to create, edit and reopen work with no network, on web, desktop and Android (PRD §1, §7). Classroom sharing comes later and is optional (phases 9–10). A server must never be needed for ordinary editing.

## Decision

- **Every device and browser profile has its own independent database.** On the web this is IndexedDB `digital-classroom-os`. The desktop and Android shells will use SQLite.
- **All persistence goes through one interface, `StorageAdapter`** (`packages/local-storage/src/types.ts`). Editors never touch the database; they report content to `useEditableItem` (`apps/web/src/lib/storage.ts`), which saves through the adapter.
- **The app creates its adapter through a factory** (`apps/web/src/lib/platform.ts`). The default is `IndexedDbAdapter`. A native shell calls `setStorageFactory()` before the app loads to supply its SQLite adapter. After the storage exists, the factory refuses to change, so two adapters can never run at once.
- **Data moves between devices only by explicit actions**: today a backup file, later sync operations ([0007](0007-backup-format.md); the sync design in `docs/DATABASE.md`).

## Consequences

- Work is available offline and is private to the device by construction ([0002](0002-identity-ownership-privacy.md)).
- Clearing site data, or browser eviction under low storage, deletes the work. Mitigations:
  - The app asks for persistent storage once there is data.
  - The Dashboard shows whether persistent storage was granted and reminds the user to back up.
  - Backups are one click away ([BACKUP_AND_RECOVERY.md](../BACKUP_AND_RECOVERY.md) §1.2).
- A native adapter must meet the same contract. It reuses the adapter tests in `packages/local-storage` and the app-level tests in `apps/web/src/lib`.

## Verification

- `packages/local-storage/src/*.test.ts` (adapter contract, fake-indexeddb).
- `apps/web/src/lib/platform.test.ts` (factory and injection).
- `e2e/storage.chromium-only.spec.ts`: offline after the first visit, data survives a browser restart.
