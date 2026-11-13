# 0006 — Migrations only add, run after a verified safety copy, one tab at a time

**Status:** Accepted in Release 0.2. Hardened in Phase 2.

## Context

The project rules forbid deleting user data, resetting the database and destructive migrations, and they require a safety backup before database changes. Two situations make this hard:
- the device may be full when an upgrade starts
- several tabs may open a new version at the same moment

## Decision

1. **Migrations only add.** `MIGRATIONS[i](db, tx)` upgrades version *i* → *i + 1* inside IndexedDB's upgrade transaction. Stores and records are never deleted or rewritten, and shipped migrations are never edited.
2. **Copy first.**
   - Before upgrading, the adapter copies the whole database to `<db>-backup-v<old>` and verifies it, record counts and a `__copy` marker included.
   - Each attempt uses a name no database has yet (`-2`, `-3`, … when needed), and it only ever deletes the copy it created itself. A retry in the same session reuses that session's complete copy instead of using more space.
   - Settings → Storage lists the copies and can export or delete each one.
3. **No upgrade without a backup.** If the copy can't be made, nothing is upgraded, and a recovery screen offers three ways forward:
   - download a backup of the old database, read-only at its current version
   - try again
   - upgrade without the on-device copy, but only after that file was downloaded in this session and the user confirms it is saved
4. **All or nothing.** An error inside a migration aborts the upgrade transaction, so the database stays at the old version. Before Phase 2 it could end half-migrated.
5. **One tab at a time.** Copy and upgrade run under the Web Lock `dcos-upgrade:<db>`. A tab that waited re-reads the version and simply opens if the upgrade already happened. Browsers without Web Locks run unguarded, as before.
6. **Content schemas are versioned separately** (documents: schema 1, or 2 with a diagram or, since Phase 4, anything else outside the v0.1.0 vocabulary, see [0011](0011-document-format-phase4.md); diagrams: schema 2). Content from a newer app opens read-only.

## Consequences

- Each upgrade needs free space roughly equal to the data, or a downloaded backup.
- Going back to an older app after an upgrade is unsupported. It fails to open the newer database but damages nothing (observed with v0.1.0).

## Verification

- `packages/local-storage/src/indexeddb.test.ts`, block "a failed pre-upgrade safety copy" (11 tests, including two tabs at once, which fails without the lock).
- `apps/web/src/components/UpgradeRecovery.test.tsx`.
- `npm run test:upgrade`: a real Chromium upgrade from a v0.1.0 build, with every record compared, the downgrade observed and a simulated full disk.
