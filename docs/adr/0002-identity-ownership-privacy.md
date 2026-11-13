# 0002 — UUID identifiers, device ownership today, private by default

**Status:** Accepted in Phase 3.

## Context

The brief asks for UUID-based identifiers, ownership and permissions, and personal documents that stay private by default. The release brief requires that collaboration never silently overwrite another user's work, and the PRD (Storage Rules, rule 8) that conflicting changes are never silently overwritten. Today there are no accounts, no sharing and no server that receives documents (phases 9–10).

## Decision

1. **Identifiers.** Every item, version, attachment and device gets a random UUID v4 (`crypto.randomUUID`, with a `getRandomValues` fallback). Ids from imported backups are kept as given, so an item keeps its identity across devices. The exception is a "(restored)" copy of a changed item, which gets new ids for itself and its versions.
2. **Ownership today is the device.** Each item records `ownerDeviceId`. The local database belongs to whoever uses that browser profile, so every item in it is fully theirs. **No permission model is implemented yet**, because nothing can be shared and no second user can reach the data. Adding a permission check with nobody to check against would be code that does nothing.
3. **Private by default, enforced rather than promised:**
   - No code path sends documents, diagrams or backups anywhere.
   - Fonts are bundled, and there is no analytics or CDN.
   - The backend has no endpoint that accepts content.
   - `e2e/privacy.spec.ts` fails if creating, editing, autosaving, exporting or backing up makes any request to another origin.
4. **When accounts and sharing arrive (phases 9–10):**
   - Ownership gains `ownerUserId`. Missing means "the device's own user", so existing items need no migration.
   - Access is granted explicitly per item, as view or edit, and revoked the same way. Nothing becomes shared without an action by its owner.
   - Received items are independent copies or explicitly shared items. Concurrent edits follow [0003](0003-optimistic-concurrency.md), so no write silently replaces another user's.
5. **Data at rest is not encrypted.** IndexedDB and backup files are plain. Reasons:
   - The browser profile is already the user's own space.
   - A key would have to live beside the data, which protects nothing.
   - A forgotten passphrase would make work unrecoverable, which is the opposite of the project's first rule.

   Users are told this ([BACKUP_AND_RECOVERY.md](../BACKUP_AND_RECOVERY.md) §1.2). Optional passphrase-encrypted backups are a candidate for Phase 11.

## Consequences

- Nothing leaks today, and the e2e test catches regressions such as a new font CDN or analytics.
- Permissions are a later phase with a clear, additive path.
- Someone who has the device or a backup file can read the work.

## Verification

- `e2e/privacy.spec.ts` (Chromium, WebKit). A deliberately injected third-party stylesheet was shown to make it fail.
- `packages/local-storage/src/ids.ts` and the adapter tests.
