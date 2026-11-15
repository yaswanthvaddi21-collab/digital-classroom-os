# Module 05: Advanced PDF Studio (PRD)

This document specifies PDF Studio (module M05, requirement prefix PDF): a local, offline PDF reader with thumbnails, search and text selection; an annotation layer (highlight, underline, comments, drawing) that never alters the original file; page operations that produce new PDF files (rotate, rearrange, merge, split, extract, compress); AcroForm filling; export and printing; and an evaluation, not a feature, of OCR. Nothing of the module exists: `packages/pdf-studio` holds only a README, and the app today only writes PDFs. The design reuses the platform's item model, content-addressed attachments, version history, trash, backup and search instead of building its own, and it keeps the original PDF bytes intact in every workflow. It is the input to AE-P8.

**Status:** AE-P1 draft for owner approval (2026-11-15)

**Related documents (this folder):** [Roadmap](ADVANCED_EDITION_PRODUCT_ROADMAP.md) · [System architecture](SYSTEM_ARCHITECTURE.md) · [Database and sync](DATABASE_AND_SYNC_ARCHITECTURE.md) · [Dependencies and licences](DEPENDENCY_AND_LICENCE_PLAN.md) · [Module dependency map](MODULE_DEPENDENCY_MAP.md) · [Acceptance criteria](ACCEPTANCE_CRITERIA.md) · [Security and privacy](SECURITY_AND_PRIVACY_PLAN.md) · [Risk register](RISK_REGISTER.md) · [Release strategy](RELEASE_STRATEGY.md) · [M04 Digital Notebook](MODULE_04_DIGITAL_NOTEBOOK_PRD.md) · [M06 Classroom Hub](MODULE_06_CLASSROOM_HUB_PRD.md) · [M08 File Manager](MODULE_08_FILE_MANAGER_PRD.md) · [M09 Dashboard](MODULE_09_DASHBOARD_PRD.md)

**Phase naming.** AE-P8 is the Advanced Edition phase that builds this module. The stub README `packages/pdf-studio/README.md` says "Phase 4"; that is the old PRD numbering and is stale (brief §0.5).

**Evidence base.** Code read at HEAD edc2672 on branch `advanced/phase1-audit`. Nothing was run in AE-P1. No PDF library was installed or tried; every library below is a **candidate** whose licence, maintenance and security must be verified.

---

## Current state

Copied from the canonical planning brief §2 (M05).

**Absent.** `packages/pdf-studio/README.md` is a stub. Neither pdf.js nor pdf-lib is installed. PDF exists only as **output**: jsPDF and svg2pdf.js for diagrams and slides, and the print dialog for documents. No part of the app accepts a PDF as input (packages/presentation-studio/src/elements/images-diagram.test.ts:41 rejects `application/pdf`; checked in AE-P1).

| ID | Requirement | Status |
|---|---|---|
| PDF-FR-001 | Reader | Absent |
| PDF-FR-002 | Thumbnails | Absent |
| PDF-FR-003 | Search | Absent |
| PDF-FR-004 | Text selection | Absent |
| PDF-FR-005 | Highlight | Absent |
| PDF-FR-006 | Underline | Absent |
| PDF-FR-007 | Comments | Absent |
| PDF-FR-008 | Drawing and annotations | Absent |
| PDF-FR-009 | Rotation | Absent |
| PDF-FR-010 | Rearrange | Absent |
| PDF-FR-011 | Merge | Absent |
| PDF-FR-012 | Split | Absent |
| PDF-FR-013 | Compression | Absent |
| PDF-FR-014 | Page extraction | Absent |
| PDF-FR-015 | Form filling where supported | Absent |
| PDF-FR-016 | OCR capability evaluation (evaluation only) | Absent |
| PDF-FR-017 | Export and printing | Absent |
| PDF-FR-018 | Preserve original PDF data | Absent |
| PDF-FR-019 | Clearly distinguish editable features from annotation-only features | Absent |

**What earlier commits deliver for AE-P8.** No module code. Reusable: the item and kind registry (v0.2 Phase 3, 2669868; extended for a third kind in edc2672), content-addressed attachments with SHA-256 dedup (ADR 0008), version history (ADR 0005), backup format 2 (ADR 0007), and PDF writing with jspdf 4.2.1 and svg2pdf.js 2.8.1 (diagram-studio vector/pdf.ts; presentation-studio export/pdf.ts), which can only create PDFs, not read them.

---

## 1. Product objectives

1. Let students and teachers read, search and annotate PDFs (lecture notes, papers, worksheets) entirely offline, with no account and no upload.
2. **Never lose or silently change the original.** The bytes the user imported are kept unchanged for the life of the item (PDF-FR-018). Annotations live in a separate layer. Any operation that rewrites the PDF creates a new file and keeps the previous one in version history.
3. **Be explicit about which tools change the PDF** (PDF-FR-019). Every tool is labelled either "annotation layer" or "changes the PDF", in the UI, the export dialog and the documentation.
4. Provide the everyday page operations (rotate, rearrange, merge, split, extract, lossless compression) and AcroForm filling, writing standard PDF files that other readers open.
5. Make PDF text part of global search (SVC-SEARCH) and let PDFs be attached to notebook pages (M04) and submitted to classrooms (INT-04).
6. Treat malformed and hostile PDFs as a security boundary: rendering in a worker, no script execution, no network, size caps.
7. Decide on OCR with evidence: an evaluation report (PDF-FR-016), not a shipped feature, unless the owner later approves one (D-20).

Out of scope: editing the existing text or images inside a PDF ("PDF text editing"), XFA forms, digital signing, redaction, PDF/A conversion, any cloud conversion service, AI summarisation.

## 2. User stories

| # | As a … | I want to … | So that … | Requirements |
|---|---|---|---|---|
| US-PDF-01 | student | open a 300-page textbook PDF and see the first page quickly, with thumbnails filling in | I can start reading at once | PDF-FR-001, -002, PERF-010 |
| US-PDF-02 | student | search the PDF for a term and step through the hits, and find PDFs by their text in global search | I find the right paragraph | PDF-FR-003, PDF-FR-022 |
| US-PDF-03 | student | select and copy text | I can quote it in my essay | PDF-FR-004 |
| US-PDF-04 | student | highlight, underline, comment and draw on pages, and remove those marks later | I study actively without damaging the file | PDF-FR-005…008 |
| US-PDF-05 | teacher | rotate scanned pages, reorder them, drop blank ones and merge three handouts into one | I hand out one clean file | PDF-FR-009…012, -014 |
| US-PDF-06 | student | extract pages 10–15 into a new PDF | I submit only the relevant part | PDF-FR-014, INT-04 |
| US-PDF-07 | student | fill in a form PDF from my teacher and save a filled copy | I hand in the form digitally | PDF-FR-015 |
| US-PDF-08 | student | export my annotated PDF so annotations show in other readers, or flattened for printing | my marks travel with the file | PDF-FR-017 |
| US-PDF-09 | any user | always be able to get back the exact file I imported | I never lose the original | PDF-FR-018 |
| US-PDF-10 | any user | see at a glance whether a tool changes the PDF or only adds notes on top | I understand what will happen to my file | PDF-FR-019 |
| US-PDF-11 | teacher with scanned worksheets | know whether the app can make scanned pages searchable | I can plan around it | PDF-FR-016 (evaluation) |

## 3. Functional requirements

All requirements are **Absent** today (no module code). The **Class** column carries PDF-FR-019 through every requirement:

| Class | Meaning | Stored where | Original PDF bytes |
|---|---|---|---|
| **View** | Reads the PDF; changes nothing | Nothing stored, or per-device view state | Untouched |
| **Annotation layer** | Adds marks on top of the PDF | Item content (JSON, schema-versioned), separate from the PDF bytes (ADR-0017) | Untouched; written into a new PDF only on export |
| **Changes the PDF** | Produces new PDF bytes | A new SVC-BLOB attachment; the previous bytes stay referenced by version history, and the imported original stays referenced by the item for its whole life | Untouched (a new file is made) |
| **Evaluation** | Research output, not a feature | A dated report | — |

### 3.1 Reading (View)

| ID | Requirement | Class | Status | Notes |
|---|---|---|---|---|
| PDF-FR-001 | Reader: open a PDF item; continuous and single-page scroll; zoom (fit width, fit page, 25–400 %); page number entry; document outline (bookmarks) navigation; remember last page per device; dark-mode page inversion as an optional view setting | View | Absent | Render with pdf.js in a Web Worker (ADR-0023). Links in the PDF: internal links navigate; external links only http/https/mailto, opened after confirmation (§7.5) |
| PDF-FR-002 | Page thumbnails: a virtualised strip that renders progressively, reflects rotation and order, and is the surface for page operations | View | Absent | PERF-010 |
| PDF-FR-003 | Search within a PDF: match case, whole word, next/previous, hit count, hits highlighted on page and thumbnails | View | Absent | Uses pdf.js text content. Scanned pages without a text layer have no hits; the UI says so (PDF-FR-016) |
| PDF-FR-004 | Text selection and copy | View | Absent | pdf.js text layer. Selection quality depends on the PDF's text order; no repair attempted |

### 3.2 Annotation layer

| ID | Requirement | Class | Status | Notes |
|---|---|---|---|---|
| PDF-FR-005 | Highlight selected text in several colours; edit colour; delete | Annotation layer | Absent | Stored as quads over page coordinates plus the selected text |
| PDF-FR-006 | Underline (and strike-through, beyond the brief) selected text | Annotation layer | Absent | Same model as highlight |
| PDF-FR-007 | Comments: a note pinned to a point or attached to a highlight; replies; resolve; comments panel | Annotation layer | Absent | Same thread shape as document comments (document-studio review/comments.ts) where practical; authors are free text until SVC-ID exists (COL-FR-009) |
| PDF-FR-008 | Drawing and annotations: freehand ink, rectangle, ellipse, arrow, line, free text box; select, move, delete | Annotation layer | Absent | Ink shares the stroke model and renderer with the Notebook ink layer (M04 NBK-FR-009) through a shared package or SVC; not a second implementation |
| PDF-FR-020 (new) | Import existing annotations already in the PDF: show them; editable only for types this module writes; others read-only and counted in an import note (beyond the brief) | Annotation layer | Absent | pdf.js renders existing annotations; the original is not changed by reading them |

### 3.3 Page operations (Changes the PDF)

Each operation runs in a worker, writes a **new** attachment, records a version, and remaps annotations through stable page ids (§6.2). None of them changes the imported original.

| ID | Requirement | Class | Status | Notes |
|---|---|---|---|---|
| PDF-FR-009 | Rotate pages by 90° steps, singly or in a selection | Changes the PDF | Absent | Rotation is a page attribute; lossless |
| PDF-FR-010 | Rearrange pages by drag and keyboard in the thumbnail strip; delete and duplicate pages | Changes the PDF | Absent | Lossless page copy |
| PDF-FR-011 | Merge: combine several PDF items, or append a PDF file, into a **new** PDF item; sources unchanged | Changes the PDF | Absent | Annotations of sources are carried over with page remapping |
| PDF-FR-012 | Split: by page ranges, every N pages, or at outline entries, into **new** PDF items; source unchanged | Changes the PDF | Absent | — |
| PDF-FR-013 | Compression: lossless only by default (object streams, removal of unused objects, deduplication of identical streams); report the size before and after; lossy image downsampling only if D-20 approves | Changes the PDF | Absent | If the output is not smaller, keep the input and say so |
| PDF-FR-014 | Page extraction: selected pages into a **new** PDF item | Changes the PDF | Absent | — |

### 3.4 Forms

| ID | Requirement | Class | Status | Notes |
|---|---|---|---|---|
| PDF-FR-015 | Form filling where supported: AcroForm text fields, check boxes, radio buttons, list and combo boxes; values stored separately and editable; "Save filled copy" writes them into a new PDF (optionally flattened); XFA forms open read-only with a message | Values: annotation layer. Filled copy: **Changes the PDF** | Absent | Per ADR-0023, form filling is labelled "changes the PDF" because the deliverable is a rewritten file. Form JavaScript (calculations, validation) is never executed; the UI says that calculated fields are not computed |

### 3.5 Evaluation

| ID | Requirement | Class | Status | Notes |
|---|---|---|---|---|
| PDF-FR-016 | OCR capability evaluation: a dated report on making scanned pages searchable with an offline engine (candidate tesseract.js). It measures accuracy on an agreed sample set (printed English, one other script, handwriting, low-quality scans), time per page on the reference hardware, bundle and language-data size, memory, licence of the engine and of the trained data, and where language data would be hosted (bundled with the app, never fetched from a third-party CDN at run time, R-030). It ends with a recommendation for D-20 | Evaluation | Absent | **No OCR feature ships in v1.0.0 unless the owner approves one after the report** (D-20; deferral candidate under D-36). The evaluation may use a branch or script that is not merged into the app |

### 3.6 Files, export and data safety

| ID | Requirement | Class | Status | Notes |
|---|---|---|---|---|
| PDF-FR-017 | Export and printing: (a) download the original; (b) download the current PDF (after page operations) without annotations; (c) export with annotations written as standard PDF annotations, editable in other readers; (d) export flattened (annotations drawn into page content); (e) print | (a), (b): View. (c), (d): Changes the PDF (new file; item unchanged). (e): View | Absent | Printing: browser print of rendered pages or of the generated PDF; on native, SVC-PLAT print adapter (TD-28). Export reports any annotation that could not be written |
| PDF-FR-018 | Preserve original PDF data: the imported bytes stay byte-identical and retrievable for the life of the item, through annotations, page operations, version restores, backup and restore | — | Absent | ADR-0017: `sourceAttachmentId` (§6.2). Version pruning already protects each item's create version (ADR 0005; local-storage indexeddb.ts:49-54); the item content also keeps the reference, so clean-up never removes it |
| PDF-FR-019 | Clearly distinguish editable features from annotation-only features: every tool, menu item and export option shows its class; the first "changes the PDF" action on an item explains that a new version is made and the original is kept | — | Absent | ADR-0023 UI rule. Testable through each control's accessible name or description (AC-PDF-019) |
| PDF-FR-021 (new) | Import PDF into the workspace: from the PDF Studio list, File Manager import (FIL-FR-013) and drag-and-drop; the file is validated (magic bytes, size cap) before any parsing; each import creates a new item (beyond the brief; the brief's reader needs it) | — | Absent | Never overwrites; same rule as backup import (ADR 0007) |
| PDF-FR-022 (new) | PDF text in global search through a pdf.js extractor feeding SVC-SEARCH, indexed in a worker after import and after page operations (beyond the brief's M05 list; brief M09 "Global search across PDFs") | View | Absent | DSH-FR-024; D-17 decides PDF text inclusion |
| PDF-FR-023 (new) | Password-protected PDFs: ask for the document password, open read-only if it is correct, never store the password; page operations on encrypted PDFs are disabled with the reason unless the AE-P8 spike shows the write library supports them safely | View | Absent | Writing encrypted PDFs with the candidate write library is **Unverified** (§7) |
| PDF-FR-024 (new) | Digitally signed PDFs: show that the file is signed; warn before any "changes the PDF" action that the new file will no longer carry a valid signature; the original keeps it | — | Absent | Signature validation itself is out of scope |
| PDF-FR-025 (new) | Version history, trash, restore, duplicate and backup for PDF items (platform parity) | — | Absent | Large PDFs need backup format 3 (ADR-0017, R-024) |

## 4. Non-functional requirements

Performance numbers are **proposed targets, to be measured** with the AE-P3 harness on the reference hardware (D-29).

| ID | Requirement | Current status |
|---|---|---|
| PDF-NFR-001 | Performance: a 300-page PDF shows its first page in ≤ 2 s with a progressive thumbnail grid (PERF-010); scrolling keeps the main thread free (rendering in a worker); memory within PERF-008 with a 300-page PDF open | Absent |
| PDF-NFR-002 | Original preservation (PDF-FR-018) is enforced by tests that compare SHA-256 of the original after every operation class | Absent |
| PDF-NFR-003 | Security: parsing and rendering run in a Web Worker; PDF JavaScript and form scripts never run; pdf.js configured with `isEvalSupported: false` (to verify against the chosen version: pdf.js had a published font-handling script-execution vulnerability, reported as CVE-2024-4367. This comes from the writer's own knowledge, not from the repository; the CVE, affected versions and fix are to verify in DEPENDENCY_AND_LICENCE_PLAN); size cap before parsing; output caps on decompression; timeouts on page operations | Absent |
| PDF-NFR-004 | Privacy: no request to another origin while importing, reading, searching, annotating, operating on pages or exporting. pdf.js worker, CMaps and standard font data are bundled with the app (no CDN, R-030); remote resources referenced by a PDF are never fetched | Absent |
| PDF-NFR-005 | Storage: no duplicate bytes. The same PDF imported twice, or attached to a notebook page and opened in PDF Studio, is one attachment record (SVC-BLOB SHA-256 dedup, indexeddb.ts:1010-1045). Versions refer to attachments; they never copy bytes | Absent (mechanism Done) |
| PDF-NFR-006 | Size limits: a maximum PDF size per item set by D-20; refusal before reading the whole file into memory where the platform allows; storage-quota errors reported as for other kinds (ADR 0004) | Absent |
| PDF-NFR-007 | Backup: PDF items and their attachments are in backups; backups that cannot hold the data in format 2 are refused with a clear message until backup format 3 (ADR-0017) exists | Absent |
| PDF-NFR-008 | Offline: everything in PDF-FR-001…015 and -017 works offline after the first visit; the pdf.js worker and font data are precached (check against the 6 MiB per-file precache limit, apps/web/vite.config.ts:40) | Absent |
| PDF-NFR-009 | Accessibility: WCAG 2.2 AA for the app's own UI (A11Y-001); the text layer is exposed to assistive technology where the PDF has text; annotation tools keyboard operable | Absent |
| PDF-NFR-010 | Interoperability: every PDF the module writes opens without error or repair prompt in at least two independent readers (for example Acrobat Reader and a browser's built-in viewer), with dated records; annotations written in (c) are visible and editable there | Absent |
| PDF-NFR-011 | Package boundary: `@dcos/pdf-studio` imports only what tests/integration/boundaries.test.ts allows (expected: `@dcos/ui`); storage comes through hosts | Absent. boundaries.test.ts:28-29 enforces this automatically once `src/` exists |
| PDF-NFR-012 | Platform support per PLT-001…003; Android WebView support of the worker and of the chosen libraries checked in AE-P14 (PLT-007) | Absent |

## 5. UI/UX requirements

| ID | Requirement | Current status |
|---|---|---|
| PDF-UX-001 | Toolbar in three visually separate groups: **View** (zoom, search, page navigation), **Annotate** (highlight, underline, comment, draw, shapes, text), **Pages** (rotate, rearrange, delete, extract, split, merge, compress). Every Annotate control carries an "annotation layer" label in its tooltip; every Pages control and "Save filled copy" carries "changes the PDF – makes a new version" (PDF-FR-019) | Absent |
| PDF-UX-002 | First page-operation confirmation per item explains: a new version is created, the original stays available under "Download original"; can be dismissed for the session | Absent |
| PDF-UX-003 | Annotations panel lists all annotations by page, with filter by type, jump, edit and delete | Absent |
| PDF-UX-004 | Export dialog shows the four export forms of PDF-FR-017 with one-line explanations; the default is "with annotations (editable)" | Absent |
| PDF-UX-005 | Thumbnails strip is keyboard operable (arrows, Shift+arrows to select, Ctrl/⌘+arrows to move, Delete) and touch operable (long press to select, drag to move) | Absent |
| PDF-UX-006 | Progress and cancel for long operations (import, merge, compress, search indexing); the UI never freezes | Absent |
| PDF-UX-007 | Clear states for: scanned page without text ("No searchable text on this page"), password-protected, XFA form, signed PDF, damaged PDF (with "Download original") | Absent |
| PDF-UX-008 | Uses SVC-UI tokens and components (AE-P3); light and dark themes for the chrome; page rendering unaffected by theme unless the inversion view setting is on | Absent |
| PDF-UX-009 | No control that does nothing (same rule as PRS-FR-063): features unavailable for a given PDF (encrypted, XFA) are disabled with the reason | Absent |

## 6. Data model

All **Proposed, needs approval** (ADR-0015 kind, ADR-0017 blobs, ADR-0023 engine).

### 6.1 The kind

- `ItemKind` gains `'pdf'` (append-only), stores `pdfs` and `pdf_versions` through one append-only migration (DB v6 under ADR-0015, or batched with the notebook migration), `MAX_CONTENT_SCHEMA_BY_KIND.pdf = 1`, a module entry in apps/web/src/modules.tsx (`route: 'pdfs'`, frozen once shipped), and the store lists in scripts/upgrade-test.mjs:64-65.
- Item metadata from DB v4 (`folderId`, `tagIds`, `lastOpenedAt`) apply as for every kind.
- `ItemSummary.sizeBytes` is the JSON character count of content only (indexeddb.ts:298), so it would show a PDF item as tiny. Storage displays must use attachment sizes (R-040; FIL-FR-018).

### 6.2 Content (PDF_CONTENT_SCHEMA 1)

```ts
interface PdfContent {
  schemaVersion: 1;
  /** The bytes the user imported. Immutable; never changes for the life of the item (PDF-FR-018, ADR-0017). */
  sourceAttachmentId: string;
  /** The current PDF after page operations; null = same as source. Each page operation sets a new attachment;
   *  the previous one stays referenced by the version that held it. */
  workingAttachmentId: string | null;
  sourceSha256: string;                    // checked on open; mismatch = damaged storage, opened read-only
  pageCount: number;
  /** Stable page identities in the working PDF's order; annotations refer to pageId, never to a page index. */
  pages: PdfPageRef[];
  annotations: PdfAnnotation[];
  formValues: Record<string, PdfFormValue>; // by AcroForm fully qualified field name
  info: { encrypted: boolean; signed: boolean; hasXfa: boolean; hasTextLayer: 'all' | 'some' | 'none' | 'unknown' };
}

interface PdfPageRef {
  pageId: string;                          // UUID, assigned at import, carried through every page operation
  origin: { attachmentId: string; pageIndex: number }; // where this page came from (merge provenance)
  rotation: 0 | 90 | 180 | 270;            // as written in the working PDF
  width: number; height: number;           // points, after rotation
}

type PdfAnnotation =
  | { id: string; pageId: string; type: 'highlight' | 'underline' | 'strikeout'; quads: number[][]; colour: string; text: string; commentId?: string }
  | { id: string; pageId: string; type: 'ink'; strokes: InkStroke[] }              // shared stroke model with M04
  | { id: string; pageId: string; type: 'shape'; shape: 'rect' | 'ellipse' | 'line' | 'arrow'; rect: number[]; colour: string; width: number }
  | { id: string; pageId: string; type: 'text'; rect: number[]; text: string; fontSize: number; colour: string }
  | { id: string; pageId: string; type: 'comment'; at: [number, number]; thread: { author: string; text: string; createdAt: string; replies: Array<{ author: string; text: string; createdAt: string }>; resolved: boolean } }
  | { id: string; pageId: string; type: 'imported'; subtype: string; editable: false }; // PDF-FR-020

type PdfFormValue = string | boolean | string[];
```

Coordinates are PDF user-space points of the **unrotated** page, so a rotation never moves annotations. This PRD's reading of ADR-0017 (one immutable `sourceAttachmentId` plus a changing `workingAttachmentId`) must be confirmed when ADR-0017 is accepted.

Merge and split create new items whose `sourceAttachmentId` is the newly written PDF (the user imported nothing new) and whose `pages[].origin` records provenance; the source items are unchanged.

### 6.3 Size and backup

- A PDF's bytes are SVC-BLOB attachments. Today there is no per-attachment size cap and the MIME type is trusted from the caller (brief §2 Infrastructure, attachments row); ADR-0017 adds both.
- Backup format 2 embeds attachments as base64 in one JSON string (backup.ts; ADR 0007), which does not suit large PDFs (R-024). PDF items should not ship to users before backup format 3 (ZIP container, fflate, ADR-0017) exists, or must be excluded from format-2 backups with a visible warning. This PRD does not decide which; it is part of AE-P8 scope (brief §9) and D-34.
- OPFS is a candidate for very large blobs on the web (ADR-0017); native platforms store blobs as files (ADR-0019).

## 7. Technical architecture

All library choices are **ADR-0023, Proposed, needs approval**.

### 7.1 Package and app wiring

- New workspace package `@dcos/pdf-studio`, imports only `@dcos/ui` (expected `ALLOWED` entry), with a host interface for attachments (SVC-BLOB) and item creation (SVC-ITEM), mirroring presentation-studio's hosts (hosts.ts:40-69).
- Lazy editor through `ModuleDef.loadEditor` (apps/web/src/modules.tsx:38-52). The PDF engine code lives in separate lazy chunks and worker files, so it never loads with other editors.

### 7.2 Engines (candidates)

| Role | Candidate | Licence (reported, to verify) | Notes |
|---|---|---|---|
| Rendering, text layer, search, thumbnails, reading existing annotations and form fields | `pdfjs-dist` (Mozilla pdf.js) | Apache-2.0, to verify | Worker required; CSP must allow the worker and `blob:`; bundle size and Android WebView support to check |
| Page operations, writing annotations, AcroForm filling, lossless compression | `pdf-lib` | MIT, to verify | **Maintenance status must be verified**; it appears to have had no recent releases. Evaluate maintained forks or alternatives and record the result (R-023). Encryption support for writing is Unverified |
| OCR evaluation only | `tesseract.js` | Apache-2.0, to verify | Not in the app build unless D-20 approves |

jspdf 4.2.1 and svg2pdf.js 2.8.1 (installed) only create new PDFs; they are not proposed for reading or rewriting existing ones.

### 7.3 Pipelines

| Flow | Steps |
|---|---|
| Import | Size check → magic bytes `%PDF-` → SHA-256 → `putAttachment` (dedup) → worker opens with pdf.js → page count, sizes, info flags → create item with `sourceAttachmentId`, `pages` with new UUIDs → index text (SVC-SEARCH) |
| Read | Attachment → worker → render visible pages to canvas (bitmap transfer) and text layer → thumbnails at low resolution, progressively |
| Annotate | UI layer over the page; save to content through autosave (600 ms debounce, apps/web/src/lib/storage.ts:689); no PDF bytes touched |
| Page operation | Worker loads working bytes with the write library → applies the operation → writes new bytes → `putAttachment` → content update (`workingAttachmentId`, `pages` remap) → manual version snapshot before and after |
| Export with annotations | Worker writes annotations as PDF annotation objects into a copy → download; report anything not written |
| Flatten | Worker draws annotations into page content of a copy → download |

### 7.4 Integration with other modules

- M04: a PDF attached to a notebook page opens here through SVC-REF `link` to a PDF item that shares the same attachment (no second copy of the bytes). Ink uses the same stroke model and renderer (a shared package, decided with D-10 work; not a second implementation).
- M06: PDFs submitted to assignments through SVC-REF `snapshot` (INT-04); the snapshot refers to the attachment by id, deduplicated.
- M08: import, listing with page-1 thumbnails (FIL-FR-011 previews), true sizes (FIL-FR-018).
- M09: PDF text in global search (DSH-FR-024, INT-09).
- M01: DOC-FR-102 PDF import is not in M01; documents keep exporting through the print path.

### 7.5 Security controls (SEC, detail in SECURITY_AND_PRIVACY_PLAN.md)

- Worker isolation; no `eval`; no PDF JavaScript; no form scripts; no launch actions; no embedded-file opening without an explicit download.
- External links: only `http`, `https`, `mailto` (stricter than document-studio src/links.ts:9-15, :36, which applies Tiptap's default allow-list, so ftp, tel and sms links are also accepted there; javascript: is refused), opened in a new browsing context after a confirmation that shows the full URL.
- No remote fetches triggered by PDF content.
- Caps: input size (D-20), page count for operations, decompressed stream size, time per operation; errors are reported, never crash the shell (ErrorBoundary reset, RG-7, is an AE-P3 item).
- Fuzz-style tests with a corpus of malformed PDFs (§11).

## 8. Dependencies

### 8.1 Modules and services

| Depends on | Why | Phase |
|---|---|---|
| AE-P3 | DB v4 metadata, SVC-REF/SVC-SEARCH/SVC-ORG interfaces, design tokens, measurement harness, web CSP (D-23, which must allow the PDF worker) | Before AE-P8 |
| ADR-0017 | Attachment size cap, MIME sniffing, immutable source, backup format 3 | AE-P3 design, AE-P8 delivery |
| SVC-ITEM, SVC-STORE, SVC-BLOB, SVC-BACKUP, SVC-SEARCH, SVC-REF, SVC-UI, SVC-PLAT | Platform | — |
| M04 Notebook | Shared ink stroke model and renderer | AE-P7 builds it first |

| Used by | Contract |
|---|---|
| M04 Notebook | Opening attached PDFs (SVC-REF link) |
| M06 Classroom Hub | INT-04 (submit PDFs) |
| M08 File Manager | INT-05 |
| M09 Dashboard | INT-06, INT-09 |

### 8.2 Libraries

See §7.2 for engine candidates. Additional candidates (licence to verify): a virtualised list (original code preferred) for thumbnails; the search index library is a shared SVC-SEARCH decision, not M05's. Every candidate needs a DEPENDENCY_AND_LICENCE_PLAN entry covering licence, maintenance, security record, bundle size and browser/WebView compatibility before AE-P8 starts.

## 9. API/interface contracts

M05 defines no private reference, blob, search or permission service; it uses SVC-REF, SVC-BLOB, SVC-SEARCH and SVC-PERM.

| ID | Contract | Status |
|---|---|---|
| PDF-IF-001 | Host for attachments and new items (merge, split, extract create items) | Absent |
| PDF-IF-002 | Engine interface in a worker, so the engine choice (ADR-0023) can change without UI changes | Absent |
| PDF-IF-003 | Text extractor for SVC-SEARCH, wrapped by the app as a DSH-IF-001 `TextExtractor` (locator = page id; bytes loaded through `PdfHost`) | Absent |
| PDF-IF-004 | Read-only viewer component for other modules (M04 attachments, M06 review of submissions) | Absent |
| PDF-IF-005 | Schema and safety functions matching the other studios | Absent |

```ts
// PDF-IF-001 — SVC-BLOB and SVC-ITEM through a host (shape follows presentation-studio hosts.ts:64-69)
interface PdfHost {
  putAttachment(data: Blob, mimeType: 'application/pdf'): Promise<{ id: string; sha256: string; sizeBytes: number }>;
  loadAttachment(id: string): Promise<Blob | undefined>;
  createPdfItem(input: { title: string; content: PdfContent }): Promise<{ ref: ItemRef }>;   // ItemRef from SVC-REF
  download(blob: Blob, fileName: string): Promise<void>;                                    // SVC-PLAT
}

// PDF-IF-002 — runs in a Web Worker; all methods transfer bytes, never share them
interface PdfEngine {
  open(bytes: ArrayBuffer, opts?: { password?: string }): Promise<PdfInfo>;   // password used once, never stored
  renderPage(pageIndex: number, scale: number): Promise<ImageBitmap>;
  textContent(pageIndex: number): Promise<PdfTextItem[]>;
  formFields(): Promise<PdfFormField[]>;
  apply(op: PdfPageOperation, sources: ArrayBuffer[]): Promise<{ bytes: ArrayBuffer; pages: PdfPageRef[] }>;
  writeAnnotations(bytes: ArrayBuffer, pages: PdfPageRef[], annotations: PdfAnnotation[], mode: 'annotations' | 'flatten'): Promise<{ bytes: ArrayBuffer; notWritten: string[] }>;
  fillForm(bytes: ArrayBuffer, values: Record<string, PdfFormValue>, flatten: boolean): Promise<ArrayBuffer>;
  close(): void;
}

type PdfPageOperation =
  | { kind: 'rotate'; pageIds: string[]; by: 90 | 180 | 270 }
  | { kind: 'reorder'; order: string[] }                       // pageIds in the new order
  | { kind: 'delete'; pageIds: string[] }
  | { kind: 'extract'; pageIds: string[] }                     // new item
  | { kind: 'split'; ranges: string[][] }                      // new items
  | { kind: 'merge'; itemOrder: string[] }                     // new item from several sources
  | { kind: 'compress'; mode: 'lossless' | 'lossy' };          // 'lossy' only if D-20 approves

// PDF-IF-003 — runs in a worker; per-page text so hits open the right page
function extractPdfText(bytes: ArrayBuffer): Promise<{ parts: Array<{ pageId: string; text: string }>; hasTextLayer: 'all' | 'some' | 'none' }>;

// PDF-IF-004
interface PdfViewerProps { attachmentId: string; host: Pick<PdfHost, 'loadAttachment'>; initialPage?: number; readOnly: true }

// PDF-IF-005
const PDF_CONTENT_SCHEMA = 1;
function pdfSchemaFor(content: unknown): number;
function preparePdf(raw: unknown): { content: PdfContent | null; readOnly: boolean; problem?: string };
```

## 10. Acceptance criteria

This table is the canonical wording of the module's criteria; [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) §4 only summarises them and owns the cross-cutting criteria (AC-SYS, AC-SEC, AC-PERF, AC-INT and others) (ACCEPTANCE_CRITERIA §1.2). A change to a criterion here is made in ACCEPTANCE_CRITERIA §4 in the same edit. Phase for every row: AE-P8. Nothing is Done, so no row needs "re-verify". "Real-world corpus" means the AE-P8 test set: forms, scanned, encrypted, signed, large (≥ 300 pages), damaged and malformed PDFs, plus files made by at least three different producers (brief §9, AE-P8 exit).

| AC | Verifies | Criterion | Evidence type |
|---|---|---|---|
| AC-PDF-001 | PDF-FR-001 | Every file in the real-world corpus opens or shows a clear error state with "Download original"; zoom, page entry and outline navigation work | integration + e2e (Chromium, Firefox, WebKit) |
| AC-PDF-002 | PDF-FR-002 | Thumbnails render progressively for a 300-page PDF and reflect rotation and order immediately after an operation | e2e + measurement (PERF-010) |
| AC-PDF-003 | PDF-FR-003 | Search finds every occurrence of known words in a text PDF (count matches a reference extraction); a scanned page reports "no searchable text" | integration + e2e |
| AC-PDF-004 | PDF-FR-004 | Selected text copies to the clipboard with the expected characters for Latin and one non-Latin sample | e2e |
| AC-PDF-005 | PDF-FR-005 | Highlights in each colour save, survive reload, survive rotation and reordering of their page, and leave the source SHA-256 unchanged | unit + e2e |
| AC-PDF-006 | PDF-FR-006 | Same as AC-PDF-005 for underline | unit + e2e |
| AC-PDF-007 | PDF-FR-007 | Comments with replies save, resolve, reopen, survive reload, and export as PDF text annotations visible in an independent reader (dated) | unit + e2e + external application check |
| AC-PDF-008 | PDF-FR-008 | Ink, shapes and text boxes are created by mouse, touch (mobile Chromium) and keyboard alternative, edited, deleted and exported | unit + e2e |
| AC-PDF-009 | PDF-FR-009 | Rotating pages creates a new working attachment and a version; annotations stay on their content; the source is unchanged | unit + integration |
| AC-PDF-010 | PDF-FR-010 | Reordering, deleting and duplicating pages by drag and by keyboard produce the expected page order in the output, verified by extracting page text | integration + e2e |
| AC-PDF-011 | PDF-FR-011 | Merging three corpus PDFs creates a new item with all pages in order and carried-over annotations; the three sources are byte-identical afterwards | integration + e2e |
| AC-PDF-012 | PDF-FR-012 | Splitting by ranges creates the expected new items; page counts and text match | integration |
| AC-PDF-013 | PDF-FR-013 | Lossless compression never increases size (keeps the input if it would), keeps text and rendering identical (pixel comparison at fixed scale) and reports before/after sizes; lossy mode exists only if D-20 approves | integration + measurement |
| AC-PDF-014 | PDF-FR-014 | Extracted pages form a new item that opens in an independent reader (dated) | integration + external application check |
| AC-PDF-015 | PDF-FR-015 | All AcroForm field types in the corpus form can be filled; values survive reload; "Save filled copy" opens in an independent reader with the values shown; XFA forms open read-only with a message; no form script runs | integration + e2e + external application check |
| AC-PDF-016 | PDF-FR-016 | A dated OCR evaluation report exists with measured accuracy, speed, size, memory, licences and data hosting, and a recommendation the owner has answered under D-20 | manual (dated report) |
| AC-PDF-017a | PDF-FR-017 | "Download original" returns bytes whose SHA-256 equals the imported file | integration |
| AC-PDF-017b | PDF-FR-017 | "With annotations" output opens without a repair prompt in two independent readers, annotations visible and editable (dated) | external application check |
| AC-PDF-017c | PDF-FR-017 | "Flattened" output shows the annotations as page content in two independent readers (dated); printing produces all pages | external application check + manual |
| AC-PDF-018 | PDF-FR-018 | After a scripted sequence of every annotation type, every page operation, a version restore, trash/restore, and backup/restore into an empty profile, the original's SHA-256 is unchanged and it is downloadable | integration + e2e |
| AC-PDF-019 | PDF-FR-019 | A test enumerates every PDF Studio control and export option and asserts each has exactly one class (view, annotation layer, changes the PDF) shown in its accessible name or description; the first page operation shows the explanation | unit + e2e |
| AC-PDF-020 | PDF-FR-020 | Existing annotations in corpus files are displayed; unsupported types are counted in an import note and kept in exports | integration |
| AC-PDF-021 | PDF-FR-021 | Import refuses non-PDF bytes and over-limit files before parsing; importing the same file twice makes two items and one attachment | unit + integration |
| AC-PDF-022 | PDF-FR-022 | A word that appears only inside a PDF's text is found by global search and opens the right page | integration + e2e |
| AC-PDF-023 | PDF-FR-023 | An encrypted corpus PDF opens with the right password, refuses a wrong one, and the password is not found in any store, draft or backup afterwards | integration + e2e |
| AC-PDF-024 | PDF-FR-024 | A signed corpus PDF shows its signed state and warns before a page operation; the original still carries its signature | integration + e2e |
| AC-PDF-025 | PDF-FR-025 | PDF items take part in version history, trash and backup; a backup that format 2 cannot hold is refused with a message, or (once available) written as format 3 | integration + e2e |
| AC-PDF-501 | PDF-NFR-001 | PERF-010 and PERF-008 measured with the 300-page corpus file, within the approved targets; the main thread is never blocked longer than the agreed limit during rendering | measurement |
| AC-PDF-502 | PDF-NFR-002 | Covered by AC-PDF-018 (SHA-256 of the original compared after every operation class) | integration + e2e |
| AC-PDF-503 | PDF-NFR-003 | The malformed-PDF corpus produces no crash of the app shell, no hang beyond the timeout and no script execution; `isEvalSupported` (or its equivalent in the chosen version) is off | integration (fuzz corpus) |
| AC-PDF-504 | PDF-NFR-004 | e2e/privacy.spec.ts covers import, read, search, annotate, page operations and export with zero cross-origin requests; worker and font data load from the app's origin | e2e (3 browsers) |
| AC-PDF-505 | PDF-NFR-005 | The same bytes imported into PDF Studio and attached to a notebook page are stored once | integration |
| AC-PDF-506 | PDF-NFR-006 | Covered by AC-PDF-021 (over-limit files refused before parsing), with the limit set under D-20 | unit + integration |
| AC-PDF-507 | PDF-NFR-007 | Covered by AC-PDF-025 (backups hold PDF items or are refused with a message) | integration + e2e |
| AC-PDF-508 | PDF-NFR-008 | After the first visit, PDFs open, annotate and export offline | e2e (Chromium; others where supported) |
| AC-PDF-509 | PDF-NFR-009 | axe reports no serious or critical violation in the PDF Studio chrome (if D-25 approves); keyboard-only script completes open → search → highlight → rotate → export | e2e + manual |
| AC-PDF-510 | PDF-NFR-010 | Covered by AC-PDF-017b and AC-PDF-017c (two independent readers, dated) | external application check |
| AC-PDF-511 | PDF-NFR-011 | boundaries.test.ts passes with pdf-studio importing only its allowed packages | unit |
| AC-PDF-512 | PDF-NFR-012 | All PDF Studio e2e specs pass in CI on Chromium, Firefox and WebKit; the worker and the chosen libraries are checked on an Android device in AE-P14 (dated) | e2e (CI) + manual (device, dated, AE-P14) |
| AC-PDF-701 | PDF-UX-001 | Toolbar groups and class labels match PDF-UX-001 | e2e |
| AC-PDF-702 | PDF-UX-002 | The first page operation on an item shows the explanation (new version; original under "Download original"); dismissing it lasts for the session only | e2e |
| AC-PDF-703 | PDF-UX-003 | The annotations panel lists every annotation by page, filters by type, and jumps to, edits and deletes the selected one | e2e |
| AC-PDF-704 | PDF-UX-004 | The export dialog offers the four forms of PDF-FR-017 with explanations; "with annotations (editable)" is the default | e2e |
| AC-PDF-705 | PDF-UX-005 | Every thumbnail action named in PDF-UX-005 works by keyboard and by touch (mobile Chromium) | e2e (desktop + mobile Chromium) |
| AC-PDF-706 | PDF-UX-006 | Merge of 3 × 100-page files shows progress, can be cancelled, and leaves no partial item or orphan attachment after cancel (clean-up removes it after the grace period) | e2e + integration |
| AC-PDF-707 | PDF-UX-007 | Each corpus case (scanned, password-protected, XFA, signed, damaged) shows its named state; the damaged case offers "Download original" | e2e |
| AC-PDF-708 | PDF-UX-008 | The chrome uses SVC-UI components and tokens and passes a dated light and dark check; page rendering is unchanged by the theme unless inversion is on | e2e (screenshots) + manual (dated) |
| AC-PDF-709 | PDF-UX-009 | A test enumerates every control and proves each either acts or is disabled with a reason, including for encrypted and XFA files (as AC-PRS-063) | unit + e2e |
| AC-PDF-901 | PDF-IF-001 | PDF Studio stores bytes and creates items only through `PdfHost`; a test with a fake host covers import, merge, split and extract | unit + integration |
| AC-PDF-902 | PDF-IF-002 | The UI talks to the engine only through `PdfEngine` in a worker; a second (fake) engine passes the same contract tests | unit |
| AC-PDF-903 | PDF-IF-003 | The extractor returns per-page text for the corpus text PDF and `hasTextLayer: 'none'` for the scanned file | unit + integration |
| AC-PDF-904 | PDF-IF-004 | M04 and M06 show a PDF through the read-only viewer without importing the editor; the viewer offers no annotation or page controls | integration + e2e |
| AC-PDF-905 | PDF-IF-005 | Content with an unknown newer schema opens read-only and offers the original for download | unit + e2e |

## 11. Test strategy

| Kind | Plan |
|---|---|
| Unit | Content validation and `pdfSchemaFor`; page-id remapping for every operation; annotation geometry under rotation; class labelling of controls; size and magic-byte checks |
| Integration | Engine worker against a committed real-world corpus (licences of sample files checked; only files the project may redistribute); SHA-256 preservation suite (AC-PDF-018); text-extraction comparison; write-then-read round trips (our writer, then pdf.js reading back); SVC-SEARCH indexing; backup with large attachments |
| Fuzz / security | A malformed-PDF corpus (truncated, recursive objects, huge streams, bad xref) run with time and memory limits; assert no shell crash |
| Browser (Playwright) | Chromium, Firefox, WebKit; mobile Chromium for touch annotation and thumbnail drag |
| End-to-end | Import → read → search → annotate → rotate/reorder → merge → extract → export three ways → backup → restore into an empty profile |
| Persistence | Reload, relaunch (Chromium), version restore, trash/restore; quota exhaustion path |
| Offline | Extend e2e/storage.chromium-only.spec.ts with a PDF item |
| Privacy | Extend e2e/privacy.spec.ts (AC-PDF-504) |
| Import/export | Dated checks of written PDFs in two independent readers (for example Acrobat Reader and a browser viewer), per D-22 access |
| Regression | Golden outputs for each page operation compared by page text and rendered pixels, not by bytes (writers may reorder objects) |
| Upgrade | scripts/upgrade-test.mjs extended with the pdf stores (:64-65) |
| Accessibility | Keyboard-only scripts; axe (D-25); text-layer exposure check with a screen reader before AE-P15 |
| Performance | 300-page corpus file; PERF-010 and PERF-008 measured before and after any optimisation |
| OCR evaluation | Separate scripted benchmark, not part of the app suite; results in the PDF-FR-016 report |

## 12. Known risks

From the register (brief §10):

| Risk | Why it matters here |
|---|---|
| R-023 | pdf-lib maintenance status; malformed PDFs as an attack surface |
| R-024 | Large PDFs exceed backup format 2 and memory limits |
| R-030 | OCR language data or pdf.js font data fetched from a CDN would break the privacy promise |
| R-025 | No web CSP on the public site; a PDF worker needs a CSP that allows it (D-23) |
| R-003 | The migration adding the pdf kind reaches every Pages visitor at once |
| R-040 | `sizeBytes` is a character count; PDF items would look tiny in any storage overview built on it |
| R-039 | Worker, print and download behaviour in Tauri and Android webviews (TD-28) |
| R-021 | Scope size; OCR is a deferral candidate (D-36) |

Module-specific risks. RISK_REGISTER.md §5 numbered them R-101 to R-104 in the order below (the draft labels PDF-RISK-A to D are kept for traceability):

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-101 (PDF-RISK-A) | Page operations invalidate digital signatures and can drop features the write library does not understand (layers, JavaScript, embedded files, some annotations) | M | M | PDF-FR-024 warning; original always kept; report dropped features after each operation |
| R-102 (PDF-RISK-B) | pdf.js and the write library disagree about a damaged file, so a page operation succeeds but the result renders differently | M | M | After every write, re-open the output with the renderer and compare page count and a render hash before committing the version |
| R-103 (PDF-RISK-C) | The pdf.js worker, CMaps and font data enlarge the precache past the per-file limit or slow the first load (PERF-002) | M | M | Lazy chunks; measure; precache only on first PDF use if needed |
| R-104 (PDF-RISK-D) | A real-world test corpus may contain copyrighted or personal material that cannot be committed to a public repository | H | M | Build the committed corpus from self-made or openly licensed files; keep any private sample outside the repo with a dated note |
