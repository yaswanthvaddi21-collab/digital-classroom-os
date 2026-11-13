# 0010 — Soft delete, purge, and recovering edits to deleted items

**Status:** Accepted in v0.1.0. Extended in Phase 3.

## Context

Deleting must be reversible until the user says otherwise. Permanent deletion must be complete and atomic, and must never take unsaved edits with it silently.

## Decision

1. **Delete moves an item to the Trash** (`deletedAt`). It is metadata: no version change and no conflict with other tabs. Items stay in the Trash until the user deletes them forever; there is no automatic expiry.
2. **Delete forever and Empty trash use `purgeMany()`: one transaction** that removes the items, their list rows, every version and every draft of every session. If anything fails, nothing is deleted and the user is told so. Attachments are then cleaned up separately under [0008](0008-attachments.md).
3. **Edits are never lost to a deletion elsewhere:**
   - An editor open on an item that another tab purges shows *"deleted in another window"* and offers *Save as a new document / diagram*.
   - A draft offered for an item that is deleted meanwhile is recovered as a new item (when it holds content).
   - Drafts written for an already purged item (orphans) are listed in Settings → Storage → *Unsaved drafts*, with *Save as a new document / diagram*.

## Consequences

- The Trash can grow until emptied. Its size shows in the browser's storage estimate in Settings.
- Purging is final for the item and its history. Backups and safety copies are the only way back.

## Verification

- `packages/local-storage/src/indexeddb.test.ts` and `hardening.test.ts` (purge, purgeMany atomicity, drafts removed).
- `apps/web/src/lib/storage-hardening.test.tsx` (deleted elsewhere, recover after deletion, orphan drafts).
- `e2e/cross-tab.spec.ts` and `e2e/unsaved-drafts.spec.ts`.
