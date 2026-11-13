# 0004 — Autosave pipeline: one queue, failures classified, edits kept as drafts per session

**Status:** Accepted in Phase 3. Supersedes the single-slot drafts of Release 0.2.

## Context

Typing must reach the database reliably, and the status shown must always be true. The Phase 1 audit found four problems:
- A draft from an earlier session could be replaced by a later one (STOR-R1).
- "Retrying" was shown after retries had stopped, and a full disk was never named (STOR-R2).
- Edits to an item deleted in another tab disappeared into a draft nothing could show (STOR-R8).
- Up to 600 ms of typing could be lost when a tab was killed.

## Decision

1. **One serialised save queue per open item**, debounced by 600 ms (`AUTOSAVE_DELAY_MS`). Saves never overlap. Each one passes the version it is based on ([0003](0003-optimistic-concurrency.md)). An undo back to the stored text while a save is in flight is compared against the in-flight content, so it isn't dropped.
2. **Failures are classified, and the status says what is true:**

   | Failure | Retries | Badge shown | Notice and actions |
   |---|---|---|---|
   | Conflict | none | Changed elsewhere | Keep my edits as a copy / Discard mine, load latest |
   | Storage full (`isQuotaError`) | one, after 2 s | Not saved | "Out of storage space"; whether the edits were kept as a draft or could not be kept; *Try again*; *Free up space*. When the edits couldn't be kept, Settings opens in a new tab, so leaving this page can't lose them |
   | Item deleted elsewhere (`NotFoundError`, confirmed by re-reading) | none | Not saved | "Deleted in another window"; *Save as a new …* |
   | Anything else | 1 s, 3 s, 10 s | Not saved — retrying, then Not saved | *Try again* |

   IndexedDB's own `NotFoundError` (a missing store, i.e. a storage fault) is not mistaken for a deleted item.
3. **Drafts belong to an editor session.** Each `useEditableItem` instance has a session id, and drafts are keyed `kind:itemId:session`. A session only ever replaces its own draft. Drafts written before Phase 3 (key `kind:itemId`) are still read.
   - On opening an item, drafts from other sessions that differ from the stored item are offered newest first, one at a time.
   - If an offered draft's item is deleted meanwhile, recovering it creates a new item (when the draft holds content; a title-only draft stays listed).
   - Settings → Storage → *Unsaved drafts* lists every draft on the device, including ones whose item was deleted, with *Open* (while the item exists), *Save as a new document / diagram* and *Discard*.
4. **Emergency copy on hide or close.** On `pagehide` and `visibilitychange → hidden`, pending edits are also written **synchronously** to localStorage (`dcos-emergency-draft:<kind>:<id>`; skipped when the draft's JSON exceeds about 2 million characters). When IndexedDB itself fails or is closed, edits are kept in the same place without that limit. The copy is removed once a save covering them succeeds. If the tab dies before the async write lands, the next load offers it like any draft. A copy identical to the stored content is removed without asking.
5. **A failure to keep a draft is surfaced**, never ignored.

## Consequences

- Several drafts can exist for one item. The UI shows them one at a time, and Settings lists them all.
- localStorage holds at most one emergency copy per item. Two tabs share the key, but each removes only the text it wrote itself.
- Very large edits (over about 2 million characters of JSON, mostly documents with large inline images) get no copy on hide or close. They still have the IndexedDB save and draft.

## Verification

- `apps/web/src/lib/storage.test.tsx` and `storage-hardening.test.tsx`: classification, retries, honest status, drafts per session, emergency copies, recovery after deletion.
- `apps/web/src/components/EditorFrame.test.tsx`: notices and actions.
- `e2e/save-problems.spec.ts` (simulated full disk), `e2e/cross-tab.spec.ts` (item deleted in another tab) and `e2e/unsaved-drafts.spec.ts`.
