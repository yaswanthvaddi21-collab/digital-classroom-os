# 0005 — Version history: 50 per item, protected versions, large images stored once

**Status:** Accepted in Release 0.2. Extended in Phase 3 (version compaction).

## Context

Users need earlier states back, but history must not fill the device. Every version used to store full content, so a document with a 1 MB inline image cost about 50 MB across its history (STOR-R4).

## Decision

1. **When versions are made:**
   - when an item is created
   - automatically, at most once per 10 minutes, on the next save after that interval (`AUTO_SNAPSHOT_INTERVAL_MS`)
   - on Ctrl/⌘+S, as a `manual` version that doesn't change the item's version, and only if the state differs from the newest version
   - before a version is restored (`restore`), so restoring can be undone
2. **The limit is 50 per item** (`MAX_VERSIONS_PER_ITEM`). Pruning never removes the creation version, the newest manual version or the newest pre-restore version. A backup import applies the same limit in the same transaction.
3. **Large images are stored once (lossless compaction).** When a new version holds a `data:` URL longer than 16 KB (`INLINE_BLOB_MIN_LENGTH`), the version is first written inline, as before, inside the save transaction. Then, because hashing can't run inside an IndexedDB transaction, a follow-up step does the rest:
   - It stores the exact URL text as an attachment, with SHA-256 deduplication and type `text/x-dcos-data-url`.
   - It replaces the URL in that version record with `dcos-blob:<id>` and lists the id in `blobRefs`.
   - It rewrites the record only if it is still unchanged, and only after checking that rehydrating gives byte-identical JSON. Any failure leaves the inline version as it was.
   - **Every reader puts the URL back byte for byte**: restoring a version, the "same as newest" check, backup export, safety-copy export and the read-only recovery export. Backup files therefore keep inline images, and their format and v0.1.0 compatibility are unchanged.
   - A version whose image is missing refuses to restore, rather than writing a broken image into a document.
4. **Not changed:** the live document's content (still inline, so v0.1.0 can read documents without diagrams), and version records written before Phase 3.

## Consequences

- 55 autosaves of a document with one large image store the image once. The test measures the whole history at less than one image's size.
- A compacted version depends on its attachment. Clean-up treats `blobRefs` and `dcos-blob:` references as uses ([0008](0008-attachments.md)).
- Moving images out of document content itself is a document-format change. It is left for Phase 4, where it can be versioned properly.

## Verification

`packages/local-storage/src/hardening.test.ts` ("version history stores a large image once", 15 tests) and `blobs.test.ts`. They cover:
- byte-identical restore
- the 16 KB boundary
- base64 and non-base64 URLs
- failed hashing or writes leaving the inline version intact
- older records untouched
- refusing to restore when an image is missing
- backup round trip
- safety-copy export
