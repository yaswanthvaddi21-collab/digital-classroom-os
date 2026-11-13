# 0009 — Cross-tab coordination: change notices, holds, locks, and stopping after an upgrade

**Status:** Accepted in Release 0.2. Extended in Phases 2 and 3.

## Context

Users open the same item in several tabs, and the PWA and a browser tab can run together. Tabs share one database but not memory.

## Decision

1. **Change notices.** After a write, a tab posts `{ kind, id }` on the BroadcastChannel `dcos-storage`, or `{}` for bulk changes such as Empty trash.
   - An editor with nothing unsaved adopts a newer version of its item.
   - An editor with unsaved edits doesn't adopt; its next save meets the conflict flow ([0003](0003-optimistic-concurrency.md)).
   - On any notice for its item, an editor re-reads it: a trash or favourite change appears at once (no version change, no remount), and an item gone for good shows the deleted notice at once ([0004](0004-autosave-and-drafts.md)).
2. **Holds.** While a diagram dialog is open in a document, `holdExternalUpdates()` stops the editor from being remounted by another tab's save, so the dialog's result can't land in a discarded editor.
3. **Locks.** Upgrades use `dcos-upgrade:<db>` ([0006](0006-migrations-and-safety-copies.md)) and clean-up uses `dcos-gc:<db>` ([0008](0008-attachments.md)), both Web Locks.
4. **After another tab upgrades the database**, this tab saves what it can, closes its connection and freezes its editors behind a message. Edits that couldn't be written are kept synchronously in localStorage and offered after reload. The reload button doesn't claim the work is saved when it isn't.
5. **Preferences** (localStorage) follow other tabs through the `storage` event.

## Consequences

- There is no real-time merging between tabs; that is collaboration, phase 10.
- Older browsers without BroadcastChannel or Web Locks fall back to conflicts at save time and to unguarded upgrades.

## Verification

- `apps/web/src/lib/storage.test.tsx` and `storage-hardening.test.tsx`: adoption, holds, trash and purge in another tab, freezing after an upgrade.
- `apps/web/src/lib/preferences.test.ts`.
- `e2e/cross-tab.spec.ts` (two pages, Chromium and WebKit).
- `e2e/storage.chromium-only.spec.ts` (upgrade in another tab).
- The two-tab upgrade test in `indexeddb.test.ts`.
