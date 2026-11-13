# 0003 — Optimistic concurrency: a stale write is refused, never merged silently

**Status:** Accepted in v0.1.0. Restated in Phase 3 for future collaboration.

## Context

The same item can be written by two tabs of one browser, by a backup import, and later by other users or devices through sync. Last-writer-wins silently destroys someone's work.

## Decision

- **Every content or title change increments the item's `version`.** Favourite and trash changes are metadata and don't.
- **`save(kind, id, patch, expectedVersion)` reads, checks and writes in one IndexedDB transaction.** If the stored version isn't the expected one, it throws `ConflictError` carrying the stored item, and nothing is written.
- **The editor then stops autosaving** and keeps the user's edits as a draft ([0004](0004-autosave-and-drafts.md)). It asks the user to choose: *Keep my edits as a copy*, or *Discard mine, load latest*. Nothing is merged or overwritten without that choice.
- **Backup import never overwrites.** A changed item comes back as a separate "(restored)" copy ([0007](0007-backup-format.md)).
- **Future sync** (phase 10) records each operation with its `base_version`. An operation whose base is stale becomes a conflict with the same choice, or a copy. It is never applied over newer work. A live-editing CRDT (Yjs) may replace this for documents opened together, but only as an explicit collaborative session.

## Consequences

- No silent loss, at the price of occasionally asking the user.
- Undo history doesn't survive a "load latest". The user's own edits survive as a copy.

## Verification

- `packages/local-storage/src/indexeddb.test.ts`: stale writes are rejected, and an aborted transaction leaves the previous record.
- `apps/web/src/lib/storage.test.tsx`: the conflict flow, both resolutions, and edits during a conflict kept as a draft.
- A probe in the Phase 1 audit: two connections saving at once, one succeeds and the other gets `ConflictError`.
