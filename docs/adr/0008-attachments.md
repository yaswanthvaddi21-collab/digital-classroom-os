# 0008 — Attachments: content-addressed, cleaned up only when provably unused

**Status:** Accepted in Phase 3.

## Context

Binary data lives in the `attachments` store: embedded-diagram previews and, since Phase 3, large images from version history ([0005](0005-version-history.md)). Every diagram edit renders a new preview. Nothing was ever deleted, so storage and backups grew without bound (STOR-R3). Deleting the wrong attachment breaks a document, so clean-up must be provably safe.

## Decision

1. **Content-addressed storage.** Records are deduplicated by SHA-256 (unique `by_sha256` index). Each record carries `createdAt` and `lastUsedAt`, which is refreshed when the same bytes are stored again. If that refresh can't be written (storage full), the existing record is still returned. Backup imports that bring bytes already stored under another id create an alias `{ id, aliasOf }`.
2. **References.** An attachment is in use when its id appears anywhere in the content of documents, diagrams, either version store or any draft, or in a version's `blobRefs` or a `dcos-blob:<id>` string. The check walks content values (no pattern matching over text). External references count too: the app passes the text of localStorage emergency drafts (`extraReferences`), which the adapter parses as JSON. Trashed items count, so their attachments stay until the item is purged.
3. **`cleanUpAttachments()` removes only what is unused and old.**
   - Nothing created or last used within 24 h (`ATTACHMENT_GRACE_MS`) is removed. This protects a preview stored by a diagram dialog whose document hasn't autosaved yet.
   - Records whose age can't be read are kept.
   - A kept alias keeps its target.
   - Reading the references and deleting happen in **one readwrite transaction** over all those stores, so a concurrent write is either seen or waits. Any error aborts the transaction, so nothing is removed.
   - It runs under the Web Lock `dcos-gc:<db>`, and never while the database is closed for an upgrade.
   - If external references can't be read, nothing is removed: the adapter stops when the callback throws, and the app's callback throws when localStorage can't be read.
4. **When it runs:** after Delete forever or Empty trash; once a day when the app is idle after start-up; and from Settings → Storage → *Free up space*, which reports the real result.

## Consequences

- Space from removed or old previews comes back within a day, or at once from Settings.
- A preview made and abandoned in a dialog stays for up to 24 h.

## Verification

- `packages/local-storage/src/hardening.test.ts`: references from live and trashed items, versions, drafts and external sources; the grace period; aliases; atomic failure; the lock; export holding only referenced attachments.
- `apps/web/src/lib/storage-hardening.test.tsx` (scheduling, emergency-draft references).
- `apps/web/src/pages/settings/SettingsPages.test.tsx` (*Free up space*).
