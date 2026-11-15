# Module 06: Classroom Hub (PRD)

This document specifies the Classroom Hub (module M06, prefix CLS) for the Advanced Edition: classrooms, subjects, membership, assignments, submissions, grading with rubrics, feedback, announcements and administration, for three roles (teacher, student, admin). It is the first module that needs accounts, a network host and server-side permissions. It must add those without weakening the project's local-first rules: personal editing never depends on the host, classroom features are optional, and personal work stays private until a student deliberately submits it. Nothing in this module exists today beyond stub folders. The document sets requirements, a proposed design and acceptance criteria for AE-P9, and records what must be decided first.

Status: AE-P1 draft for owner approval (2026-11-15)

Related documents (this folder):
[Product roadmap](ADVANCED_EDITION_PRODUCT_ROADMAP.md) ·
[System architecture](SYSTEM_ARCHITECTURE.md) ·
[Database and sync architecture](DATABASE_AND_SYNC_ARCHITECTURE.md) ·
[Security and privacy plan](SECURITY_AND_PRIVACY_PLAN.md) ·
[Module dependency map](MODULE_DEPENDENCY_MAP.md) ·
[Acceptance criteria](ACCEPTANCE_CRITERIA.md) ·
[Risk register](RISK_REGISTER.md) ·
[Release strategy](RELEASE_STRATEGY.md) ·
[Dependency and licence plan](DEPENDENCY_AND_LICENCE_PLAN.md) ·
[M07 Collaboration](MODULE_07_COLLABORATION_PRD.md) ·
[M01 Document Studio](MODULE_01_DOCUMENT_STUDIO_PRD.md) ·
[M02 Diagram Studio](MODULE_02_DIAGRAM_STUDIO_PRD.md) ·
[M03 Presentation Studio](MODULE_03_PRESENTATION_STUDIO_PRD.md) ·
[M05 PDF Studio](MODULE_05_PDF_STUDIO_PRD.md) ·
[M08 File Manager](MODULE_08_FILE_MANAGER_PRD.md) ·
[M09 Dashboard](MODULE_09_DASHBOARD_PRD.md)

Phase naming: "AE-Pn" is an Advanced Edition phase; "v0.2 Phase n" is the earlier programme. This module is built in **AE-P9**.

---

## Current state

Copied from the canonical planning brief (§2, M06). Statuses were spot-checked against HEAD `edc2672`.

**Module status: Absent.** The infrastructure is Stub only:

- `packages/classroom/README.md` and `packages/assignments/README.md` are 4-line README stubs ("Not started"; they carry old phase numbers "Phase 3" and "Phase 2"). Neither is an npm workspace (root `package.json:7-14`).
- `backend/classroom/` and `backend/authentication/` contain an empty `__init__.py` and a README marked "Planned". No backend file has changed since `20d3f4d` (git log -- backend).
- `backend/api/main.py` (54 lines) exposes only `GET /health` (`:46-48`) and `GET /api/v1/info` (`:51-54`, returns `capabilities: []`), with no authentication. The brief cites `main.py:51-58`; the file ends at line 54. `backend/requirements.txt` lists only `fastapi>=0.115,<1` and `uvicorn[standard]>=0.30,<1`; `requirements-dev.txt` adds `pytest` and `httpx` ranges.
- `docs/DATABASE.md:53-123` is a design DDL only. The classroom part (`:56-112`) has users (with email), profiles, classrooms (with an `invite_code` column, `:67`), subjects, memberships, assignments, submissions, grades and announcements; the same block also has documents, notebooks and notes. There is no rubric, invitation, session or submission-round table; the only log is a generic `activity_logs` table (`:121-122`). The DDL is stale against the IndexedDB model (brief §0.5, R-012).

| Group | IDs | Status |
|---|---|---|
| Teacher | CLS-FR-001 create classrooms; 002 subjects; 003 manage students; 004 assignments; 005 deadlines; 006 attach materials; 007 review submissions; 008 grades; 009 rubrics; 010 feedback; 011 announcements | All Absent |
| Student | CLS-FR-020 join; 021 access subjects; 022 view assignments | Absent |
| Student | CLS-FR-023 create academic work | **Partial**: the existing studios work, but there is no link to classrooms |
| Student | CLS-FR-024 submit documents; 025 attach diagrams and presentations; 026 track deadlines; 027 view grades; 028 receive feedback | Absent |
| Administration | CLS-FR-040 user management; 041 roles and permissions; 042 classroom management; 043 activity overview; 044 account security | All Absent |
| Accounts | CLS-FR-060 teacher-created accounts; 061 self-registration | Both Absent |

Note: the "Assignment" quick-start tile (`apps/web/src/pages/Dashboard.tsx:71`, rendered at `:108-127`) only creates a document from the `assignment` template. It is not classroom work and is not counted here.

What earlier work gives this module (a head start, not a pass):

| Existing piece | Evidence | Use in M06 |
|---|---|---|
| Stable UUID ids for items, versions, attachments, devices | `packages/local-storage/src/ids.ts:1-11`; ADR 0002, Decision item 1 | Submissions refer to items by id |
| Per-item version history with a `reason` | `types.ts:33` (`'manual' \| 'auto' \| 'restore' \| 'create'`); `indexeddb.ts:48-54` | A submission refers to an exact version |
| Content-addressed attachments (SHA-256, unique index) | `indexeddb.ts:256`, `:1010-1045`; ADR 0008 | Submitted binaries are not stored twice |
| Optimistic concurrency, "keep my edits as a copy" | `indexeddb.ts:735-776`; ADR 0003 | Pattern for host 409 conflicts |
| Validated, never-overwrite import | `validateBackup`, `backup.ts:58-142`; ADR 0007 | Pattern for validating received materials |
| Privacy e2e (no request to another origin) | `e2e/privacy.spec.ts:8`; recorded passing in Chromium and WebKit on 2026-11-15 (docs/audit/RELEASE_GAPS.md §11). Covers documents, diagrams and backup export; not presentations | Must keep passing when no host is configured |
| Design-only API plan | `docs/API.md` "Planned (Phase 2–3)" | Starting point; regenerate, do not copy |

---

## 1. Product objectives

1. Give a teacher a self-hosted way to run classrooms (subjects, students, assignments, materials, announcements) and to review, grade and return work, without any paid or third-party service.
2. Let a student join a classroom, see what is due, do the work in the existing studios (M01, M02, M03, and M05 once it exists) and submit it as a fixed snapshot, without copying files around by hand.
3. Give an administrator user, role and classroom management, account security controls and an activity overview for one classroom host.
4. Keep the local-first promise: every editor, autosave, version history, backup and export keeps working with no host, no account and no network (ADR 0001; COL-FR-018). Classroom features appear only when a host is configured.
5. Keep personal work private: nothing leaves a device until its owner submits it or shares it (ADR 0002, Decision item 3; COL-FR-017). Submissions refer to existing items; they do not create duplicate files on the student's device (brief §5).
6. Protect student data: deny-by-default authorisation, hashed credentials, audit records, and no student data in logs, URLs or third-party requests.

Out of scope for M06: live co-editing (M07), plagiarism detection, video lessons, timetables, attendance, parent accounts, payments, AI marking, and any hosted or SaaS service (brief: no paid SaaS, no AI).

---

## 2. User stories

| ID | As a … | I want to … | So that … | Requirements |
|---|---|---|---|---|
| US-CLS-01 | teacher | create a classroom and get a join code or QR | students can join without me typing every account | CLS-FR-001, 020, 061 |
| US-CLS-02 | teacher | add subjects to a classroom | assignments and materials are grouped the way I teach | CLS-FR-002, 021 |
| US-CLS-03 | teacher | create student accounts in bulk and reset their passwords | younger students can start without self-registration | CLS-FR-003, 060 |
| US-CLS-04 | teacher | create an assignment with instructions, a deadline, materials and a rubric, and publish it later | I can prepare work in advance | CLS-FR-004, 005, 006, 009 |
| US-CLS-05 | teacher | attach my own document, diagram, presentation or PDF as a material | students open it in the right studio | CLS-FR-006, INT-03, INT-04 |
| US-CLS-06 | teacher | see who has submitted, who is late and who has not started | I can follow up | CLS-FR-007, 026 |
| US-CLS-07 | teacher | open a submission read-only, score it against the rubric and write feedback | grading is consistent and recorded | CLS-FR-007, 008, 009, 010 |
| US-CLS-08 | teacher | return graded work and allow a resubmission | students can improve their work | CLS-FR-008, 010, 024 |
| US-CLS-09 | teacher | post an announcement to a classroom or subject | everyone sees the same message | CLS-FR-011 |
| US-CLS-10 | student | join a classroom with a code | I see its subjects and assignments | CLS-FR-020, 021, 022 |
| US-CLS-11 | student | start an assignment from its page, which creates an ordinary item in my workspace | I use the studios I already know | CLS-FR-023 |
| US-CLS-12 | student | submit one or more of my existing items (document, diagram, presentation, PDF) | I do not re-upload or duplicate files | CLS-FR-024, 025 |
| US-CLS-13 | student | submit while offline and have it sent when the host is reachable | a bad Wi-Fi moment does not cost me a deadline | CLS-FR-024, CLS-NFR-005 |
| US-CLS-14 | student | see deadlines on the dashboard and in the classroom | I plan my week | CLS-FR-026, DSH-FR-007, 008 |
| US-CLS-15 | student | see my grade, rubric scores and feedback | I know how to improve | CLS-FR-027, 028 |
| US-CLS-16 | admin | create, disable and delete accounts and assign roles | the host stays under control | CLS-FR-040, 041 |
| US-CLS-17 | admin | archive classrooms and move ownership to another teacher | classes survive staff changes | CLS-FR-042 |
| US-CLS-18 | admin | see recent sign-ins, submissions and grading activity | I can spot problems | CLS-FR-043 |
| US-CLS-19 | admin | turn self-registration off, force password resets, end sessions and lock accounts after failed sign-ins | accounts are secure | CLS-FR-044, 061 |
| US-CLS-20 | any user without a host | use every studio with no account and no classroom UI clutter | personal use stays simple | CLS-NFR-001, CLS-NFR-002 |

---

## 3. Functional requirements

IDs follow brief §4.2. Blocks: Teacher 001–019, Student 020–039, Administration 040–059, Accounts 060–079. Requirements added by this PRD use the reserved gaps and are marked "(added)" with the brief bullet they derive from, or "(beyond the brief)".

"Host" means the classroom host proposed in ADR-0020 (FastAPI with SQLite on a teacher or school machine; D-13). "Proposed" ADRs are in [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) and [DATABASE_AND_SYNC_ARCHITECTURE.md](DATABASE_AND_SYNC_ARCHITECTURE.md).

### 3.1 Teacher (001–019)

| ID | Requirement | Current status | Evidence (anything not Absent) |
|---|---|---|---|
| CLS-FR-001 | Create, rename and archive classrooms. Each classroom has a name, an owner teacher, optional co-teachers, and a join code that can be regenerated or turned off. | Absent | — |
| CLS-FR-002 | Create, rename, reorder and archive subjects inside a classroom. A subject may be mapped to a local subject folder on each device (SVC-ORG; D-11). | Absent | — |
| CLS-FR-003 | Manage students in a classroom: add existing accounts, create accounts (CLS-FR-060), remove members, view a roster with last activity. Removing a member never deletes the student's own items. | Absent | — |
| CLS-FR-004 | Create assignments with title, rich-text instructions, subject, maximum score, allowed submission kinds, and states draft → scheduled → published → closed. Only published assignments are visible to students. | Absent | — |
| CLS-FR-005 | Set a deadline (time zone shown explicitly), an optional late cut-off, and per-student extensions. Late submissions are accepted and flagged unless the cut-off has passed. Deadlines use host time (ADR-0021: device time is advisory). | Absent | — |
| CLS-FR-006 | Attach learning materials to assignments, subjects or announcements: workspace items of any kind as `link` or `snapshot` references (SVC-REF, ADR-0018) and plain files as attachments (SVC-BLOB). A student opens a material read-only and may "make my own copy". | Absent | — |
| CLS-FR-007 | Review submissions: per-assignment table (not started, draft, submitted, late, returned, resubmitted), open any submitted item read-only in its studio's protected view, step to next/previous submission, download it in the studio's export formats. | Absent | — |
| CLS-FR-008 | Record grades: numeric score out of the assignment maximum, optional letter or pass/fail label, with draft and released states. Students see only released grades. Every change keeps a history (who, when, old value). | Absent | — |
| CLS-FR-009 | Create grading rubrics: criteria with performance levels and points, reusable across assignments as copies; score a submission per criterion with the total computed and shown beside any manual override. | Absent | — |
| CLS-FR-010 | Send feedback: a general comment per submission plus optional comments anchored to the submitted snapshot (document comment marks for M01 content; element or slide anchors for M02/M03; page anchors for M05). Feedback is released together with the grade, or separately. | Absent | — |
| CLS-FR-011 | Publish announcements to a classroom or a subject, with optional attachments and scheduling; edit and delete with a visible "edited" marker. | Absent | — |
| CLS-FR-012 | (added; from "Create assignments") Return a submission and allow or refuse resubmission; every submission round is kept, so a grade always points at the exact snapshot it graded. | Absent | — |
| CLS-FR-013 | (added; from "Manage students") Co-teacher membership role per classroom, with the same rights as the owner except deleting or transferring the classroom. | Absent | — |
| CLS-FR-014 | (added; from "Review submissions") Export a classroom's gradebook as CSV and a submission set as a ZIP of exported files, generated on the teacher's device. | Absent | — |
| 015–019 | Reserved | — | — |

### 3.2 Student (020–039)

| ID | Requirement | Current status | Evidence |
|---|---|---|---|
| CLS-FR-020 | Join a classroom: connect to a host (address, join code or QR, D-14), sign in or self-register (CLS-FR-061), then join with the classroom code. Leave a classroom at any time; leaving does not delete local items. | Absent | — |
| CLS-FR-021 | Access subjects: list subjects and their materials and announcements; open materials read-only (cached for offline reading, CLS-NFR-001). | Absent | — |
| CLS-FR-022 | View assignments: list by subject and by due date, with state (to do, submitted, late, returned, graded); open instructions, materials and rubric. | Absent | — |
| CLS-FR-023 | Create academic work: "Start work" creates an ordinary workspace item (document by default, or the kind the teacher suggests, optionally from a teacher template) and records a link between the item and the assignment on this device only. The item is private until submitted. | **Partial** | The studios exist: M01 (`packages/document-studio`), M02 (`packages/diagram-studio`), M03 (`packages/presentation-studio`); item creation through `apps/web/src/modules.tsx:38-109`. No link to classrooms or assignments exists (no assignment field in `WorkspaceItem`, `packages/local-storage/src/types.ts:9-29`). |
| CLS-FR-024 | Submit documents: choose one or more existing items, confirm, and the client sends an immutable snapshot of each item's current version (ItemRef `mode: 'snapshot'`, ADR-0018). No file is duplicated on the student's device; on the host, binary parts are deduplicated by SHA-256 (SVC-BLOB). Withdraw before the deadline if the teacher allows it. | Absent | — |
| CLS-FR-025 | Attach diagrams and presentations (and PDFs after AE-P8, INT-04) to the same submission as documents. Diagrams embedded in documents travel inside the document snapshot as today's embed-copies (ADR 0013). | Absent | — |
| CLS-FR-026 | Track deadlines: due dates in the classroom view, on the dashboard (DSH-FR-007/008, owned by M09), and as a local reminder when the app is open. Times shown in the device's time zone with the host's zone noted when they differ. | Absent | — |
| CLS-FR-027 | View released grades, rubric scores and grade history for own submissions only. | Absent | — |
| CLS-FR-028 | Receive feedback: general and anchored comments shown beside a read-only view of the submitted snapshot, plus a notification in the classroom view. "Open my current version" goes to the live local item. | Absent | — |
| CLS-FR-029 | (added; from "Submit documents") Submission receipt: after the host confirms, the student sees the submission time (host clock), the submitted versions and a SHA-256 digest per part, stored locally with the item. | Absent | — |
| CLS-FR-030 | (added; from "Submit documents") Offline submission queue: a submission made while the host is unreachable is queued (SVC-SYNC operation queue), clearly shown as "Waiting to send", retried with backoff, and stamped by the host on arrival. The client records the local time the student pressed Submit; whether that time counts against the deadline is owner decision D-45. | Absent | — |
| 031–039 | Reserved | — | — |

### 3.3 Administration (040–059)

| ID | Requirement | Current status | Evidence |
|---|---|---|---|
| CLS-FR-040 | User management: list, search, create, edit display name, disable, re-enable and delete accounts; bulk import from CSV (name, username, role, optional class). Deleting an account removes or anonymises its host records per a stated retention rule; it never touches anyone's local devices. | Absent | — |
| CLS-FR-041 | Roles and permissions: host roles `admin`, `teacher`, `student` (ADR-0020); per-classroom membership roles `owner`, `co-teacher`, `student`; a published permission matrix enforced server-side on every endpoint, deny by default (SVC-PERM). | Absent | — |
| CLS-FR-042 | Classroom management: list all classrooms, archive and restore, transfer ownership, see member counts and storage used. | Absent | — |
| CLS-FR-043 | Academic activity overview: counts and recent events (assignments published, submissions, late submissions, grades released, sign-ins) per classroom, from the host audit log, without showing submission content. | Absent | — |
| CLS-FR-044 | Account security: password policy, failed-sign-in lockout and rate limits, forced password reset, session list and revocation per user, audit log of security events, self-registration switch (CLS-FR-061). | Absent | — |
| CLS-FR-045 | (added; from "Account security") Host setup and health: first-run wizard creates the first admin, shows the host addresses, certificate status (D-14) and disk use; a backup and restore of the host database. | Absent | — |
| 046–059 | Reserved | — | — |

### 3.4 Accounts (060–079)

| ID | Requirement | Current status | Evidence |
|---|---|---|---|
| CLS-FR-060 | Teacher-created accounts: a teacher (for own classrooms) or admin creates accounts singly or in bulk; each gets a one-time initial password or a one-time setup code that forces a new password on first sign-in. | Absent | — |
| CLS-FR-061 | Self-registration with a classroom join code: the user picks a username and password and is placed in that classroom as a student. Can be turned off per host (ADR-0020) and per classroom; codes can expire. | Absent | — |
| CLS-FR-062 | (added; from "Account security") Password change and teacher/admin-initiated reset. No email-based reset is required (a LAN host may have no mail service). | Absent | — |
| CLS-FR-063 | (added; from ADR-0020) Device sign-in that survives restarts: session tokens stored per platform rules (HttpOnly cookie for same-origin web; OS secure storage for native), with expiry and "sign out everywhere". | Absent | — |
| CLS-FR-064 | (added; from ADR 0002, Decision item 4) Link a host account to the device's local profile: items created on the device stay owned by the device user (`ownerUserId` missing = device user); signing in never re-assigns or uploads existing items. | Absent | — |
| 065–079 | Reserved | — | — |

---

## 4. Non-functional requirements

Performance numbers are **proposed targets, to be measured** (brief §7.1; D-29). None has been measured.

| ID | Requirement | Measure / note |
|---|---|---|
| CLS-NFR-001 | Offline-first. Every studio, autosave, version history, backup and export works with the host unreachable or never configured. Assignments, materials, announcements, grades and feedback already fetched remain readable offline from the `classroom_cache` (ADR-0015 (c)). | e2e with host stopped; COL-FR-018 regression |
| CLS-NFR-002 | Optional. With no host configured the app makes no network request beyond its own origin, and shows no classroom UI except one "Connect to a classroom" entry (exact placement per D-31). | `e2e/privacy.spec.ts` keeps passing with its origin assertion unchanged (AC-CLS-502) |
| CLS-NFR-003 | Private by default. No local item, title or metadata leaves the device except as an explicit submission (CLS-FR-024) or share (M07). The submission confirmation lists exactly what will be sent. | Network-capture e2e |
| CLS-NFR-004 | Authorisation is checked on the host for every endpoint and every object (no insecure direct object references): a student can read only own submissions, grades and feedback, and only classrooms they belong to. Deny by default. | Route-enumeration test (§11) |
| CLS-NFR-005 | Reliability: submission is idempotent (client-generated operation id); a retried or duplicated send never creates two submissions; a partial upload never becomes a submitted state. All-or-nothing on the host, as for backup import (ADR 0007). | Integration tests with injected failures |
| CLS-NFR-006 | Integrity: every submitted part carries a SHA-256 digest computed on the client and verified by the host; the host stores submitted snapshots immutably. A grade references the submission round id. | Unit + integration |
| CLS-NFR-007 | Student data protection: passwords hashed with Argon2id (candidate `argon2-cffi`); tokens stored hashed; no student names, content or tokens in URLs, query strings or server logs; host database and host backups treated as sensitive (D-34). See [SECURITY_AND_PRIVACY_PLAN.md](SECURITY_AND_PRIVACY_PLAN.md). | Log review test; SEC criteria |
| CLS-NFR-008 | Capacity (proposed target, to be measured): one host on reference hardware serves 40 students submitting within one minute, each submission up to 25 MB, with p95 time from Submit to receipt ≤ 10 s on the reference LAN. | Measurement in AE-P9; feeds PERF baselines |
| CLS-NFR-009 | Responsiveness (proposed target, to be measured): classroom view with 30 assignments and 40 members renders from cache in ≤ 1 s p95; refresh from host ≤ 2 s p95. | Measurement |
| CLS-NFR-010 | Accessibility: WCAG 2.2 AA (A11Y-001); every flow keyboard-only; deadlines and states not conveyed by colour alone; tables have proper headers. | axe if D-25 approved; manual screen-reader pass before AE-P15 |
| CLS-NFR-011 | Host maintainability: pinned Python (3.12 proposed, D-37) and locked dependencies (TD-32); host schema migrations append-only with a pre-migration copy of the host database (same principle as ADR 0006). | CI backend job |
| CLS-NFR-012 | Clock safety: deadlines, submission times and ordering use host time; device clocks are advisory only (ADR-0021; R-008). | Test with skewed device clock |
| CLS-NFR-013 | Data portability: a teacher can export a classroom (roster, assignments, grades, feedback, submissions) in documented open formats (CSV, JSON, studio export formats) without the host software. | Export test |

---

## 5. UI/UX requirements

All screens use the shared design system (SVC-UI, ADR-0024). M06 must not start UI work before the AE-P3 tokens and components exist (R-006, R-036).

| ID | Requirement |
|---|---|
| CLS-UX-001 | Entry point: a "Classroom" navigation entry appears only after a host is connected; before that, a single "Connect to a classroom" action in Settings or the dashboard (D-31). |
| CLS-UX-002 | Connection status is always visible inside classroom screens: Connected, Offline (showing cached data with its age), Signing in required, Host unreachable, Certificate not trusted (D-14). Never a blank screen. |
| CLS-UX-003 | Role-specific home: teacher sees "To grade", upcoming deadlines and recent submissions; student sees "Due soon", "Returned" and announcements; admin sees host health and activity. |
| CLS-UX-004 | Submission flow: pick items from the workspace (File Manager picker, filtered to allowed kinds), see a summary (titles, kinds, versions, sizes), confirm. The confirm button names what is sent ("Submit 2 items to *Physics: Lab 3*"). After sending, show the receipt (CLS-FR-029). |
| CLS-UX-005 | Late and queued states are explicit: "Late by 2 h", "Waiting to send (offline)", "Sent, not yet confirmed". |
| CLS-UX-006 | Grading view: submission in the studio's protected read-only view on the left, rubric and feedback panel on the right (stacked on phones); next/previous student; unsaved grading is autosaved as a draft on the teacher's device. |
| CLS-UX-007 | Materials open read-only with a "Make my own copy" action that creates a normal local item (SVC-REF link → new item). |
| CLS-UX-008 | Destructive actions (remove student, delete assignment with submissions, delete account) state the consequence and need confirmation; archive is offered first. |
| CLS-UX-009 | Simple and Advanced: the student view stays minimal (assignments, materials, grades); rubric editing, extensions and bulk actions are teacher-only. |
| CLS-UX-010 | Responsive: all flows usable at phone width (no horizontal scroll), as the existing shell test does (`e2e/navigation.spec.ts:36-37`, run by the mobile-chromium project). Tablet layout checked explicitly (today there are no tablet checks). |
| CLS-UX-011 | Empty states for each list with the next action ("No assignments yet. Create one."). |
| CLS-UX-012 | Plain language for errors: say what was and was not sent, and what happens next. |

---

## 6. Data model

Proposed (ADR-0015 (c), ADR-0018, ADR-0020, ADR-0021; all "Proposed, needs approval"). Classroom entities are **server-authoritative** and live on the host. They are **not** workspace items and are not new `ItemKind`s. The DDL in `docs/DATABASE.md:56-112` must not be reused as-is (R-012): it has no rubrics, invitations (only a classroom `invite_code` column, `:67`), sessions or submission rounds, allows one grade per submission (`grades.submission_id UNIQUE`, `:109`), has only a generic `activity_logs` table for audit (`:121-122`), and stores `content_snapshot` as one text column (`:107`).

### 6.1 Host entities (SQLite on the host)

| Entity | Key fields | Notes |
|---|---|---|
| `User` | id (UUID), username (unique, case-folded), displayName, hostRole (`admin`/`teacher`/`student`), passwordHash (Argon2id), mustChangePassword, disabledAt, createdAt, updatedAt, deletedAt | No email required |
| `Session` | id, userId, tokenHash, kind (`cookie`/`bearer`), deviceLabel, createdAt, lastSeenAt, expiresAt, revokedAt | Opaque random token; only its hash stored |
| `Classroom` | id, name, ownerUserId, joinCodeHash, joinCodeExpiresAt, joinEnabled, selfRegistrationEnabled, archivedAt, createdAt, updatedAt | Join code compared by hash |
| `Membership` | id, classroomId, userId, role (`owner`/`co-teacher`/`student`), joinedAt, removedAt | Unique (classroomId, userId) |
| `Subject` | id, classroomId, name, position, archivedAt, … | Optional local mapping on devices (SVC-ORG, D-11) |
| `Assignment` | id, classroomId, subjectId?, title, instructions (rich-text JSON in the document vocabulary), maxScore, allowedKinds[], state, publishAt?, dueAt?, lateCutoffAt?, allowResubmission, rubricId?, createdBy, timestamps | `instructions` validated with the document schema rules |
| `Extension` | assignmentId, studentId, dueAt | Per-student deadline |
| `Material` | id, ownerType (`assignment`/`subject`/`announcement`), ownerId, ref (`ItemRef`, SVC-REF) or blobSha256 + fileName + mimeType + size | Item snapshots stored like submission parts |
| `Submission` | id, assignmentId, studentId, state (`submitted`/`returned`/`withdrawn`), currentRoundId | One per (assignment, student) |
| `SubmissionRound` | id, submissionId, roundNo, clientOpId (unique), clientSubmittedAt, hostReceivedAt, late, parts[] | Immutable once complete |
| `SubmissionPart` | id, roundId, ref (`ItemRef` with `mode: 'snapshot'`, itemId, kind, version, title), contentSha256, contentBlob (SVC-BLOB key), schemaVersion, attachmentSha256[] | Content JSON stored as a content-addressed blob on the host |
| `Rubric` | id, ownerUserId, title, criteria[] → { id, title, description, levels[] → { id, label, points, description } } | Copied into an assignment when attached, so later edits do not change past grading |
| `Grade` | id, roundId, score?, label?, rubricScores[] → { criterionId, levelId, points }, overrideReason?, state (`draft`/`released`), gradedBy, updatedAt | History in `GradeHistory` |
| `Feedback` | id, roundId, authorId, body, anchor? ({ partId, kind-specific anchor }), state (`draft`/`released`), timestamps | |
| `Announcement` | id, classroomId, subjectId?, body, attachments[], publishAt, editedAt, createdBy, deletedAt | |
| `AuditEvent` | id, at (host clock), actorUserId?, action, entityType, entityId, details (no content, no secrets) | Append-only; retention per D-47 (student data on the host) |
| `HostBlob` | sha256 (PK), size, mimeType (sniffed), storedPath, refCount, createdAt | Files outside any served directory |

Host ordering: every mutating request gets a per-host sequence number (ADR-0021), used by clients to fetch changes since a known point.

### 6.2 Client side (proposed, DB v4+)

| Store / field | Purpose |
|---|---|
| `classroom_cache` (ADR-0015 (c)) keyed by `[hostId, entityType, entityId]` | Read cache of classrooms, subjects, assignments, materials, announcements, own submissions, released grades and feedback; carries `hostSeq` and `fetchedAt` |
| `sync_state` store, one record per host (DATABASE_AND_SYNC_ARCHITECTURE §3.3) | Host id (from `/api/v1/info`), last host sequence, display name, base URL, certificate fingerprint pinned at pairing (D-14), signed-in username; no password |
| `sync_outbox` store (SVC-SYNC, ADR-0021; DATABASE_AND_SYNC_ARCHITECTURE §3.3) | Pending submissions and teacher actions made offline, with `clientOpId`, attempts, next retry time |
| `assignmentLink` (per item, metadata only, stored outside the content version like `lastOpenedAt`) | `{ hostId, assignmentId }`; device-local, never sent except as part of a submission |
| Version `reason` value `'submitted'` (proposed) | Protects the submitted version from pruning (today only create, newest manual and newest restore point are protected, `indexeddb.ts:50-53`). `VersionReason` is a closed union (`types.ts:33`); an older build importing a backup maps an unknown reason to `'manual'` (`backup.ts:114`), so the protection is lost but nothing breaks. Needs a DB/backup decision in AE-P3. |
| Submission receipts | Stored with the item metadata (CLS-FR-029) |

**No duplicate storage.** The student's device keeps one copy of each item and its versions. The submission sends a snapshot of an existing version and records the receipt. Attachments referenced by the content (diagram previews, presentation pictures, compacted images) are sent once per SHA-256 that the host does not yet hold (the host answers "have / need" before upload). The teacher's device caches opened submissions in `classroom_cache` with blobs in the attachments store, deduplicated by the existing unique `by_sha256` index (`indexeddb.ts:256`).

Backups: classroom cache and queue are excluded from the personal backup by default (they are re-fetchable); pending queue entries are included so an unsent submission is not lost. Final rule with backup format 3 (ADR-0017) and D-34.

---

## 7. Technical architecture

### 7.1 Components

| Layer | Location | Responsibility |
|---|---|---|
| Classroom UI | `packages/classroom` (becomes a workspace in AE-P9) | Screens for teacher, student, admin; depends on `@dcos/ui` and on host interfaces only, like the studios (boundary rule, `tests/integration/boundaries.test.ts`) |
| Assignment and submission model | `packages/assignments` (workspace) or merged into `packages/classroom` — engineering choice in AE-P9, recorded in an ADR | Types, validation, snapshot builder, rubric maths (pure, unit-testable) |
| Client host access | `SVC-SYNC` client in `packages/sync-engine` (workspace from AE-P9) | HTTP client, auth session, operation queue, retry/backoff, cache refresh by host sequence |
| App wiring | `apps/web/src/modules.tsx`, routes in `App.tsx`, host injection (SVC-HOST pattern) | Gives the classroom package an item picker, item opener (read-only), snapshot reader and blob store without importing studios |
| Host API | `backend/api` routers, `backend/authentication`, `backend/classroom`, `backend/synchronization` | FastAPI endpoints, Pydantic models, auth dependency on every router, SQLite persistence, blob store on disk |
| Host packaging | D-13 | Standalone process on a teacher or school machine; optional Tauri sidecar is an open option in D-13 |

### 7.2 Key flows

**Pairing and sign-in.** Student enters the host address or scans a QR → client calls `GET /api/v1/info` to confirm a Classroom OS host and read `hostId` → TLS certificate check (D-14) → sign in or self-register → session (cookie or bearer) → join classroom with code.

**Assignment publish.** Teacher creates the assignment on the host (or offline on the teacher device, queued) → host assigns sequence numbers → students' clients fetch changes since their last `hostSeq` on open and on a periodic poll while the classroom screen is visible (no push channel is needed for M06; M07's socket may be reused later).

**Start work.** Student presses "Start work" → app creates a normal item through SVC-ITEM, optionally from a teacher template material (copied: SVC-REF link → new item) → sets the local `assignmentLink`. Nothing is sent.

**Submit.** Student selects items → client flushes pending autosaves (as the update prompt already does with `flushAll`, `apps/web/src/components/SystemBanners.tsx:46`) → creates a version snapshot with reason `'submitted'` for each item → builds `SubmissionPart`s (content JSON + list of attachment SHA-256s + schema version) → asks the host which blobs it needs → uploads missing blobs, then commits the round with `clientOpId` in one request → host validates (membership, assignment open, kinds allowed, sizes, schema versions it can store, digests), stores all-or-nothing, records `hostReceivedAt`, returns the receipt. On network failure the operation stays queued.

**Grade and return.** Teacher opens a round → client downloads the parts (cache), opens each in its studio's protected read-only view via the existing safety path (`packages/document-studio/src/safety.ts:48` `prepareDocument`, `packages/presentation-studio/src/safety.ts:230` `preparePresentation`, and diagram read-only above the known schema, `packages/diagram-studio/src/editor/useDiagramState.ts:24`) → rubric scoring and feedback saved as drafts on the host → release.

**Newer content schema.** If a student's item uses a content schema newer than the teacher's build knows, the teacher sees the existing protected view with the "download original data" option, never a broken render (the safety modules already do this per kind).

### 7.3 Network and platform constraints

These come from ADR-0022 and apply to M06 as well as M07 (R-028):

- The public HTTPS GitHub Pages build cannot call an `http://` LAN host (mixed content), and Chromium's Private Network Access rules restrict calls from a public origin to private addresses.
- A web app served over plain `http://<LAN-IP>` is not a secure context: service workers, `crypto.subtle` (used for attachment SHA-256), `crypto.randomUUID` and Web Locks are unavailable.
- Therefore M06 browser clients need either the host serving the web app over HTTPS with a certificate the devices trust, or the native apps (Tauri, Capacitor) with appropriate CSP and Android network-security configuration. This is D-14; D-13 decides who runs the host. AE-P9 starts with a spike to confirm these constraints on real browsers before UI work.
- The Tauri CSP today allows `connect-src 'self' ipc: http://ipc.localhost` only (`apps/desktop/src-tauri/tauri.conf.json:17`); it must be widened to the paired host only.

### 7.4 Authorisation model (summary; detail in SECURITY_AND_PRIVACY_PLAN)

| Action | admin | teacher (owner/co-teacher of classroom) | teacher (other) | student (member) | student (other) |
|---|---|---|---|---|---|
| Create classroom | yes | yes | yes | no | no |
| Edit classroom, subjects, assignments, materials, announcements | yes | yes | no | no | no |
| Read published assignments, materials, announcements | yes | yes | no | yes | no |
| Submit / withdraw own work | no | no | no | yes (own) | no |
| Read a submission | metadata only unless D-46 allows content | yes | no | own only | no |
| Grade, feedback, release | no (D-46) | yes | no | no | no |
| Read own released grades and feedback | — | — | — | yes | no |
| Manage users, roles, host settings | yes | create students for own classrooms (CLS-FR-060) | same | no | no |

Whether admins may read submission content and grades is a privacy decision (D-46). This table is a summary: the canonical matrix, which adds delete/transfer, join codes, drafts, gradebook export, the audit log and the M07 share grants, is SECURITY_AND_PRIVACY_PLAN §5.4.

---

## 8. Dependencies

### 8.1 Modules and shared services

| Depends on | Why | Contract |
|---|---|---|
| SVC-ID, SVC-PERM (ADR-0020) | Accounts, sessions, roles, permission checks | Shared with M07; M06 defines no own auth |
| SVC-REF (ADR-0018) | Materials (`link`, `snapshot`) and submission parts (`snapshot`) | INT-03, INT-04 |
| SVC-BLOB (ADR 0008, ADR-0017) | Deduplicated binaries on device and host; size caps and MIME sniffing | |
| SVC-SYNC (ADR-0021 part 1) | Operation queue, retry, host sequence numbers, conflict copies | Shared with M07 |
| SVC-ITEM, SVC-STORE | Creating work items, version snapshots, protected versions | DB v4 (AE-P3) |
| SVC-ORG (ADR-0016) | Mapping classroom subjects to local subject folders | D-11 |
| SVC-HOST | Injected item picker, opener and snapshot reader | Keeps package boundaries |
| SVC-SEARCH | Search over cached classroom data (INT-09) | Owned by M09 |
| SVC-ACT | Local activity entries for submissions and returned work | DSH-FR-009 |
| SVC-UI | Components (DataTable, Tabs, Drawer, etc.) from ADR-0024 | AE-P3 |
| M01, M02, M03 | Content being submitted and read-only views | Existing safety modules |
| M05 | PDF submissions and materials (INT-04) | After AE-P8 |
| M08 | Item picker, "Shared/Classroom" views | INT-05 |
| M09 | Upcoming assignments, deadlines, classroom and subject overview panels (DSH-FR-007, 008, 012, 013) | Hidden until M06 ships (D-31) |
| M07 | Reuses host, identity and permissions; M06 does not need live co-editing | — |

Phase prerequisites: AE-P2 (green CI, gated deploy), AE-P3 (DB v4, SVC-REF/ORG interfaces, design system, CSP), AE-P8 for INT-04 PDF parts.

### 8.2 Libraries (licence to verify in [DEPENDENCY_AND_LICENCE_PLAN.md](DEPENDENCY_AND_LICENCE_PLAN.md); no versions given for anything not installed)

Already in the repository (as unpinned ranges in `backend/requirements.txt` and `requirements-dev.txt`; installed only in the local Python 3.9 venv `backend/.venv`, which is not committed). The licence gate does not cover them: `docs/THIRD_PARTY_NOTICES.md:3` is generated from `package-lock.json` only (brief §1):

| Package | Use | Licence and source | Notes |
|---|---|---|---|
| FastAPI | Host API | MIT (`License-Expression` in the local venv metadata, fastapi 0.128.8, read 2026-11-15) | Pin and lock (TD-32, D-37) |
| uvicorn | ASGI server | BSD-3-Clause (local venv metadata, 0.39.0) | Pin and lock |
| Pydantic (FastAPI dependency) | Request/response validation | MIT (local venv metadata, 2.13.5) | |
| `httpx`, `pytest` (dev) | Host tests | BSD-3-Clause, MIT (local venv metadata, 0.28.1 and 8.4.2) | |

The local venv versions are evidence of what is installed on this machine only; CI installs whatever the ranges resolve to on Python 3.12 (`.github/workflows/ci.yml:51-52`).

**Candidates** (not installed; licence to verify; no licence is asserted here unless the canonical brief reports one):

| Candidate | Use | Reported licence (to verify) | Notes |
|---|---|---|---|
| `argon2-cffi` | Password hashing | MIT (reported in brief ADR-0020) | ADR-0020 |
| Python `sqlite3` (standard library) or SQLAlchemy + Alembic | Host persistence and migrations | Standard library: no new dependency. SQLAlchemy, Alembic: to verify | Choose in AE-P9; append-only migrations either way |
| `python-multipart` | Upload parsing if multipart is used | to verify | Avoid if uploads are raw bodies per blob |
| A rate-limit library (e.g. `slowapi`) or own middleware | Login rate limits | to verify | Own code is small; prefer it if the library is unmaintained |
| A QR code generator (client-side JS or Python) | Join QR | to verify | Must run offline |
| `python-zeroconf` (mDNS) | Native host discovery | to verify | If its licence is copyleft it is outside the licence policy unless the owner approves an exception; join by address/QR needs none |

### 8.3 Owner decisions this module needs

Existing: **D-13** (classroom host and accounts), **D-14** (LAN security / certificates), **D-15** (remote reachability), **D-11** (subjects as folders), **D-31** (hide panels until shipped), **D-34** (backup encryption once classroom data exists), **D-36** (scope cuts), **D-37** (Python version).

Decisions raised by this PRD and numbered in [ADVANCED_EDITION_PRODUCT_ROADMAP.md](ADVANCED_EDITION_PRODUCT_ROADMAP.md) (all block AE-P9):

- **D-45** Deadline rule for queued offline submissions: host receive time only, or the client's recorded Submit time within a grace window (device clocks can be wrong, CLS-NFR-012).
- **D-46** Whether admins may read submission content and grades, or only metadata.
- **D-47** Retention of student data on the host after a classroom is archived or a student is deleted, and who may export it. The owner should confirm which data-protection rules apply to the schools that will use it; this PRD does not interpret law.
- **D-48** Grading scales beyond numeric score and a free label (weighted categories, letter-grade mapping).
- **D-49** Whether teacher templates distributed as materials should be copied into the student's workspace automatically on "Start work".

---

## 9. API/interface contracts

Interface requirements use `CLS-IF-NNN`. Shared types (`ItemRef`, `PermissionCheck`, `Session`, `SyncOperation`) are owned by SVC-REF, SVC-PERM, SVC-ID and SVC-SYNC in [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) and [DATABASE_AND_SYNC_ARCHITECTURE.md](DATABASE_AND_SYNC_ARCHITECTURE.md); they are referenced here, not redefined.

### CLS-IF-001: Client service (TypeScript, consumed by `packages/classroom`)

```ts
// Type-only imports. Homes follow SYSTEM_ARCHITECTURE §5: ItemRef is the SVC-REF type in local-storage; the
// SVC-ID and SVC-SYNC client types live in sync-engine (a README stub today; not an npm workspace, package.json:7-14).
// The boundary rule (SYSTEM_ARCHITECTURE §6.2) lets packages/classroom import only ui, so AE-P3 must either allow
// type-only imports in the boundary test or pass these types through the ClassroomHost contract (CLS-IF-004).
import type { ItemRef } from '@dcos/local-storage';         // SVC-REF (ADR-0018)
import type { SessionInfo } from '@dcos/sync-engine';       // SVC-ID client
import type { QueuedOperation } from '@dcos/sync-engine';   // SVC-SYNC

type Iso = string;          // ISO 8601, UTC from the host
type HostId = string;

interface ClassroomHostLink {
  hostId: HostId;
  baseUrl: string;
  certificateFingerprint?: string; // pinned at pairing (D-14)
  connection(): 'connected' | 'offline' | 'unauthenticated' | 'untrusted-certificate';
  session(): SessionInfo | null;
}

interface ClassroomClient {
  hosts(): ClassroomHostLink[];
  pair(input: { address: string; joinCode?: string }): Promise<ClassroomHostLink>;
  signIn(hostId: HostId, username: string, password: string): Promise<SessionInfo>;
  register(hostId: HostId, input: { username: string; displayName: string; password: string; joinCode: string }): Promise<SessionInfo>;
  signOut(hostId: HostId, everywhere?: boolean): Promise<void>;

  classrooms(hostId: HostId): Cached<ClassroomSummary[]>;
  classroom(hostId: HostId, id: string): Cached<ClassroomDetail>;
  assignments(hostId: HostId, classroomId: string): Cached<AssignmentSummary[]>;
  assignment(hostId: HostId, id: string): Cached<AssignmentDetail>;

  startWork(hostId: HostId, assignmentId: string, kind: ItemKindForWork, templateRef?: ItemRef): Promise<{ itemId: string }>;
  submit(hostId: HostId, assignmentId: string, itemIds: string[]): Promise<SubmissionOutcome>;
  withdraw(hostId: HostId, submissionId: string): Promise<void>;
  myResults(hostId: HostId, assignmentId: string): Cached<StudentResult | null>;
}

/** Data with its cache state; never throws because the host is offline. */
interface Cached<T> { data: T | null; fetchedAt: Iso | null; hostSeq: number | null; refresh(): Promise<void>; error?: ClassroomError }

type SubmissionOutcome =
  | { state: 'confirmed'; receipt: SubmissionReceipt }
  | { state: 'queued'; operation: QueuedOperation }          // offline; retried by SVC-SYNC
  | { state: 'refused'; reason: ClassroomErrorCode; detail: string };

interface SubmissionReceipt {
  submissionId: string; roundNo: number; hostReceivedAt: Iso; late: boolean;
  parts: { ref: ItemRef; contentSha256: string; bytes: number }[];
}

type ClassroomErrorCode =
  | 'not-member' | 'assignment-closed' | 'kind-not-allowed' | 'too-large' | 'schema-too-new-for-host'
  | 'digest-mismatch' | 'rate-limited' | 'session-expired' | 'conflict' | 'host-error';
interface ClassroomError { code: ClassroomErrorCode; message: string }
type ItemKindForWork = 'document' | 'diagram' | 'presentation' | 'pdf'; // 'pdf' only after AE-P8
```

(`ClassroomSummary`, `ClassroomDetail`, `AssignmentSummary`, `AssignmentDetail`, `StudentResult` mirror §6.1 field lists.)

### CLS-IF-002: Teacher service (same client, teacher-only methods)

```ts
interface TeacherClassroomClient extends ClassroomClient {
  createClassroom(hostId: HostId, input: { name: string }): Promise<ClassroomDetail>;
  regenerateJoinCode(hostId: HostId, classroomId: string, expiresAt?: Iso): Promise<{ joinCode: string }>; // shown once
  upsertSubject(hostId: HostId, classroomId: string, input: { id?: string; name: string; position?: number }): Promise<void>;
  createStudents(hostId: HostId, classroomId: string, rows: { username: string; displayName: string }[]): Promise<{ username: string; oneTimeCode: string }[]>;
  saveAssignment(hostId: HostId, input: AssignmentInput, baseVersion?: number): Promise<AssignmentDetail>; // 409 → conflict
  attachMaterial(hostId: HostId, owner: { type: 'assignment' | 'subject' | 'announcement'; id: string }, ref: ItemRef): Promise<void>;
  submissions(hostId: HostId, assignmentId: string): Cached<SubmissionRow[]>;
  openSubmissionPart(hostId: HostId, partId: string): Promise<{ kind: string; schemaVersion: number; content: unknown; attachments: string[] }>;
  saveGrade(hostId: HostId, roundId: string, grade: GradeInput): Promise<void>;
  saveFeedback(hostId: HostId, roundId: string, feedback: FeedbackInput): Promise<void>;
  release(hostId: HostId, roundIds: string[]): Promise<void>;
  returnForResubmission(hostId: HostId, submissionId: string): Promise<void>;
  postAnnouncement(hostId: HostId, input: AnnouncementInput): Promise<void>;
}
```

### CLS-IF-003: Host HTTP API (all under `/api/v1`; JSON; UUID ids; ISO 8601 UTC; `ETag`/`base_version` for optimistic concurrency, `409 Conflict` instead of overwriting, as `docs/API.md` already plans)

| Method and path | Role (deny by default) | Notes |
|---|---|---|
| `GET /info` | public | Exists today as `/api/v1/info`; gains `hostId`, `capabilities: ['classroom']`, registration enabled flag |
| `POST /auth/login`, `POST /auth/logout`, `POST /auth/register`, `POST /auth/password` | public / signed-in | Rate-limited; CSRF token for cookie sessions |
| `GET /me`, `GET /me/sessions`, `DELETE /me/sessions/{id}` | signed-in | |
| `GET/POST /classrooms`, `GET/PATCH /classrooms/{id}`, `POST /classrooms/{id}/join` | member / teacher / student with code | |
| `GET/POST/PATCH /classrooms/{id}/subjects` | member / teacher | |
| `GET/POST /classrooms/{id}/members`, `DELETE /classrooms/{id}/members/{userId}` | teacher | |
| `GET/POST /classrooms/{id}/assignments`, `GET/PATCH /assignments/{id}` | member / teacher | Students see published only |
| `POST /blobs/query` (`{ sha256[] }` → `{ need[] }`), `PUT /blobs/{sha256}` | signed-in member | Size cap; host recomputes SHA-256; MIME sniffed |
| `PUT /assignments/{id}/submission` (body: `clientOpId`, parts) | student (own) | Idempotent on `clientOpId`; all-or-nothing |
| `GET /assignments/{id}/submissions` | teacher | |
| `GET /submission-parts/{id}` | teacher, or owning student | |
| `PUT /rounds/{id}/grade`, `PUT /rounds/{id}/feedback/{fid}`, `POST /rounds/release` | teacher | |
| `GET /assignments/{id}/my-result` | student (own) | Released only |
| `GET/POST /classrooms/{id}/announcements` | member / teacher | |
| `GET /changes?since={hostSeq}` | signed-in | Returns only entities the caller may read |
| `GET/POST/PATCH/DELETE /admin/users`, `GET /admin/classrooms`, `GET /admin/activity`, `PATCH /admin/settings` | admin | |

### CLS-IF-004: Host injection into the classroom package (SVC-HOST pattern)

```ts
// The INT-03/INT-04 ClassroomHost of MODULE_DEPENDENCY_MAP §4.2 (one host, not two)
interface ClassroomHost {
  pickItems(filter: { kinds: string[]; multiple: boolean }): Promise<string[]>;        // M08 picker
  snapshotForSubmission(itemId: string): Promise<SubmissionPartDraft>;               // flush, version 'submitted', digest
  openReadOnly(part: { kind: string; schemaVersion: number; content: unknown; attachments: Map<string, Blob> }): void; // studio protected view
  createItemFrom(ref: ItemRef | null, kind: string, title: string): Promise<string>;  // SVC-ITEM
  putAttachment(bytes: Blob, mimeType: string): Promise<{ id: string; sha256: string }>; // SVC-BLOB
}
```

### CLS-IF-005: Permission checks

Every host router declares its permission through the SVC-PERM dependency (`require(permission, resource)`); a test enumerates all routes and fails if any route other than the public ones lacks it (AC-CLS-905).

---

## 10. Acceptance criteria

Numbering mirrors requirement numbers (brief §4.3). This table is the canonical wording of the module's criteria; [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) §4 only summarises them and owns the cross-cutting criteria (AC-SYS, AC-SEC, AC-PERF, AC-INT and others) (ACCEPTANCE_CRITERIA §1.2). A change to a criterion here is made in ACCEPTANCE_CRITERIA §4 in the same edit. Phase for all: **AE-P9** unless noted. No M06 item is v0.2-Done, so "re-verify: yes" applies only where noted. Unless a row names browsers, "e2e" means the Chromium, Firefox and WebKit Playwright projects (ACCEPTANCE_CRITERIA §1.3), plus mobile Chromium for phone-width and touch checks; a criterion is not met while Firefox is not green in CI (R-001, D-03). "integration (host)" means pytest with httpx against the FastAPI app.

| AC ID | Verifies | Criterion | Evidence type |
|---|---|---|---|
| AC-CLS-001 | CLS-FR-001 | A teacher creates a classroom; a join code is shown once; regenerating it invalidates the old code (old code → 404/403 on join). | integration (host) + e2e (Chromium, WebKit) |
| AC-CLS-002 | CLS-FR-002 | Subjects can be created, renamed, reordered and archived; archived subjects disappear from student views and remain in teacher views. | integration + e2e |
| AC-CLS-003 | CLS-FR-003 | A teacher adds and removes students; a removed student loses access to the classroom on next request; the student's local items are untouched (item count before = after). | integration + e2e (two browser contexts) |
| AC-CLS-004 | CLS-FR-004 | Draft and scheduled assignments are invisible to students (API and UI); publishing makes them visible; closing stops new submissions. | integration + e2e |
| AC-CLS-005 | CLS-FR-005 | With the host clock set past `dueAt`, a submission is accepted and flagged late; past `lateCutoffAt` it is refused with `assignment-closed`; an extension overrides both for that student only. A device clock skewed by ±24 h changes nothing. | integration (clock injection) |
| AC-CLS-006 | CLS-FR-006 | Each of document, diagram, presentation (and PDF after AE-P8) can be attached as a material; a student opens it read-only and "Make my own copy" creates a normal local item with identical content. | e2e |
| AC-CLS-007 | CLS-FR-007 | The submissions table shows correct states for not started, submitted, late, returned, resubmitted; each submitted part opens in its studio's read-only view, including a part with a newer content schema (protected view, original downloadable). | e2e + unit (state derivation) |
| AC-CLS-008 | CLS-FR-008 | Draft grades are never returned by student endpoints; after release they are; every change appears in grade history with actor and time. | integration |
| AC-CLS-009 | CLS-FR-009 | A rubric total equals the sum of selected levels; editing the rubric after attaching it does not change existing assignment copies or grades. | unit + integration |
| AC-CLS-010 | CLS-FR-010 | General and anchored feedback is shown to the student only after release; an anchor on a document snapshot highlights the right range. | e2e |
| AC-CLS-011 | CLS-FR-011 | Announcements reach members of the target classroom/subject only; edits show an "edited" marker. | integration + e2e |
| AC-CLS-012 | CLS-FR-012 | After return and resubmission, round 1 and round 2 both exist; the round-1 grade still refers to round-1 parts with the original digests. | integration |
| AC-CLS-013 | CLS-FR-013 | A co-teacher can do everything an owner can except delete or transfer the classroom (403). | integration |
| AC-CLS-014 | CLS-FR-014 | Gradebook CSV opens with the expected columns and values; the submission ZIP contains one export per part, named without paths from user input. | integration |
| AC-CLS-020 | CLS-FR-020 | A student pairs by address and by QR, self-registers or signs in, joins with a code, and leaves; leaving keeps all local items. | e2e |
| AC-CLS-021 | CLS-FR-021 | Subjects and materials fetched once remain readable with the network cut (`context.setOffline`). | e2e (Chromium; WebKit where supported) |
| AC-CLS-022 | CLS-FR-022 | A student sees only published assignments of own classrooms, with correct states; an attempt to fetch another classroom's assignment by id returns 403/404. | integration + e2e |
| AC-CLS-023 | CLS-FR-023 | "Start work" creates a local item of the chosen kind linked to the assignment; the item makes no network request until submitted (network capture). Re-verify: yes (the existing studios). | e2e + privacy capture |
| AC-CLS-024a | CLS-FR-024 | Submitting an existing document creates exactly one round; the device's item and attachment counts are unchanged except one new `'submitted'` version per part. | e2e + IndexedDB inspection |
| AC-CLS-024b | CLS-FR-024 | Sending the same `clientOpId` twice yields one round; a connection cut mid-upload leaves no partial round on the host. | integration (fault injection) |
| AC-CLS-024c | CLS-FR-024 | A binary already on the host (same SHA-256) is not uploaded again (request log). | integration |
| AC-CLS-025 | CLS-FR-025 | One submission can contain a document, a diagram and a presentation; each opens correctly for the teacher; a document with an embedded diagram keeps the diagram editable in the teacher's read-only view. | e2e |
| AC-CLS-026 | CLS-FR-026 | Due dates appear in the classroom view and on the dashboard panel (when M09 panel exists) in the device time zone, with the host zone shown when different. | unit + e2e |
| AC-CLS-027 | CLS-FR-027 | A student sees own released grades only; another student's grade is never in any response body (response scan test). | integration |
| AC-CLS-028 | CLS-FR-028 | Released feedback appears beside the submitted snapshot, not the live item; "Open my current version" opens the live item. | e2e |
| AC-CLS-029 | CLS-FR-029 | The receipt shows host time, versions and digests that match the host record. | integration |
| AC-CLS-030 | CLS-FR-030 | Submit while offline → "Waiting to send"; restore network → confirmed within the retry schedule; closing and reopening the app in between does not lose the queued submission. | e2e (Chromium) + persistence |
| AC-CLS-040 | CLS-FR-040 | Admin creates, disables, re-enables and deletes accounts; a disabled account cannot sign in and its sessions are revoked; CSV import rejects malformed rows all-or-nothing. | integration + e2e |
| AC-CLS-041 | CLS-FR-041 | The permission matrix (the full matrix in SECURITY_AND_PRIVACY_PLAN §5.4, summarised in §7.4) is enforced: an automated test exercises every route with every role and compares with the matrix. | integration |
| AC-CLS-042 | CLS-FR-042 | Archive, restore and ownership transfer work; an archived classroom is read-only for everyone. | integration |
| AC-CLS-043 | CLS-FR-043 | Activity overview counts match the audit log for a scripted scenario; no submission content or titles of student items appear in it. | integration |
| AC-CLS-044 | CLS-FR-044 | After N failed sign-ins (N set by policy) the account or source is rate-limited; forced reset requires a new password at next sign-in; session revocation takes effect on the next request. | integration |
| AC-CLS-045 | CLS-FR-045 | First run creates the first admin and refuses a second "first admin"; host backup restores to an identical state (row counts and blob digests). | integration + manual (dated) |
| AC-CLS-060 | CLS-FR-060 | Bulk-created accounts must change their one-time password on first sign-in; the one-time code works once. | integration + e2e |
| AC-CLS-061 | CLS-FR-061 | With self-registration off (host or classroom), `/auth/register` refuses; with it on, an expired code refuses. | integration |
| AC-CLS-062 | CLS-FR-062 | Password change invalidates other sessions; teacher reset is allowed only for students in own classrooms. | integration |
| AC-CLS-063 | CLS-FR-063 | Web sessions use HttpOnly, Secure, SameSite cookies; native sessions are stored in OS secure storage (checked per platform in AE-P14); tokens are stored hashed on the host (database inspection). | integration + manual per platform (dated) |
| AC-CLS-064 | CLS-FR-064 | Signing in does not change `ownerDeviceId` or upload any item; existing items show no `ownerUserId` change. | e2e + IndexedDB inspection |
| AC-CLS-501 | CLS-NFR-001 | With the host stopped, every studio creates, edits, autosaves and exports; cached classroom data is readable. | e2e (Chromium, WebKit). Re-verify: yes (COL-FR-018) |
| AC-CLS-502 | CLS-NFR-002 | With no host configured, `e2e/privacy.spec.ts`, extended to presentations, passes with its origin assertion unchanged, and no classroom UI is shown except the single "Connect to a classroom" entry. | e2e. Re-verify: yes |
| AC-CLS-503 | CLS-NFR-003 | During submission, captured requests contain only the selected items' snapshots and referenced blobs. | e2e (request capture) |
| AC-CLS-504 | CLS-NFR-004 | IDOR test: for each object type, a member of classroom A cannot read or change objects of classroom B. | integration |
| AC-CLS-505 | CLS-NFR-005 | Fault-injection suite (timeouts, 500s, dropped connections at each step) never yields duplicate or partial rounds. | integration |
| AC-CLS-506 | CLS-NFR-006 | A tampered part (changed byte) is refused with `digest-mismatch`. | integration |
| AC-CLS-507 | CLS-NFR-007 | Host logs from the full e2e run contain no password, token, join code, student item content or title (log scan). | integration |
| AC-CLS-508 | CLS-NFR-008 | Measured on reference hardware (D-29): result recorded with date; target met or waived by the owner. | measurement |
| AC-CLS-509 | CLS-NFR-009 | Measured as above. | measurement |
| AC-CLS-510 | CLS-NFR-010 | Keyboard-only run of join, submit, grade and release flows; axe clean if D-25 approved; screen-reader pass recorded before AE-P15. | e2e + manual (dated) |
| AC-CLS-511 | CLS-NFR-011 | CI backend job runs on the pinned Python with locked dependencies; a host migration test upgrades a previous-version host database with a pre-migration copy. | CI + integration |
| AC-CLS-512 | CLS-NFR-012 | Same as AC-CLS-005 clock-skew part. | integration |
| AC-CLS-513 | CLS-NFR-013 | Classroom export opens without the host (CSV in a spreadsheet, exports in their studios). | integration + manual (dated) |
| AC-CLS-701…712 | CLS-UX-001…012 | Each UX requirement checked by e2e where automatable (entry point visibility, status banners, confirm text, late/queued labels, phone width without horizontal scroll) and by a dated manual review otherwise. | e2e + manual |
| AC-CLS-901 | CLS-IF-001 | Client contract tests run against a real host in CI; `submit` returns `queued` (never throws) when offline. | integration |
| AC-CLS-902 | CLS-IF-002 | Teacher methods return 403 for students (contract tests). | integration |
| AC-CLS-903 | CLS-IF-003 | OpenAPI schema generated by the host matches the documented endpoint list; no undocumented route. | integration |
| AC-CLS-904 | CLS-IF-004 | `packages/classroom` imports no studio package (boundary test extended). | integration (`boundaries.test.ts`) |
| AC-CLS-905 | CLS-IF-005 | Route-enumeration test fails if any non-public route lacks the permission dependency. | integration |

Integration criteria owned by MODULE_DEPENDENCY_MAP: **AC-INT-03** (attach documents to assignments) and **AC-INT-04** (submit presentations and PDFs; PDF part after AE-P8).

---

## 11. Test strategy

| Level | What | Where / how |
|---|---|---|
| Unit | Rubric maths, state machines (assignment, submission, grade release), deadline/late logic with injected clocks, snapshot builder (digest, attachment list), cache merge by `hostSeq`, error mapping | Vitest in `packages/classroom` / `assignments` / `sync-engine`; pytest for host models and services |
| Integration (host) | Every endpoint with every role (matrix test, AC-CLS-041), IDOR suite, idempotency and fault injection, blob dedup, migrations of the host DB, log scan | pytest + httpx against an in-process app with a temporary SQLite file and blob directory |
| Integration (client ↔ host) | Client contract tests against a real host process started by the test runner; offline queue replay; 409 conflict → copy | Vitest (node) + spawned uvicorn; added to CI |
| Browser | Classroom UI in Chromium, WebKit, mobile Chromium, Firefox (once green, PR #1 / D-03) | Playwright with a host fixture started per worker; host served over HTTPS with a test certificate to reproduce the secure-context setup (D-14) |
| End-to-end | Teacher and student in separate browser contexts (separate IndexedDB): create → publish → start work → submit → grade → release → view | Playwright, two contexts per test |
| Persistence | Host restart mid-scenario; client reload with queued operations; IndexedDB upgrade with classroom stores (upgrade test `scripts/upgrade-test.mjs` store lists updated, ADR-0015) | Playwright + upgrade test |
| Offline | Network cut during submit, during grade save, during materials fetch; host stopped; app restart while offline | `context.setOffline`, killing the host process |
| Import/export | Gradebook CSV, submission ZIP, classroom export; read-only open of submitted DOCX/PPTX/PDF exports | Integration + dated manual check in a spreadsheet application |
| Regression | Existing suites unchanged; `e2e/privacy.spec.ts` with no host; storage, backup and upgrade tests; boundary test | CI on every PR |
| Security | Rate limits, CSRF on cookie sessions, session revocation, upload caps and MIME sniffing, path traversal in file names, oversized JSON, SQL injection probes on every string field | pytest; AE-P13 penetration-style review |
| Accessibility | Keyboard paths, roles and labels, contrast via tokens; axe if D-25 | Playwright; manual screen-reader pass (AE-P15) |
| Performance | CLS-NFR-008/009 on reference hardware with a scripted 40-student load generator | Measurement script, results recorded with date |

Test data must be synthetic; no real student names or work in fixtures or screenshots.

---

## 12. Known risks

From the canonical register ([RISK_REGISTER.md](RISK_REGISTER.md)):

| Risk | Why it matters for M06 |
|---|---|
| R-005 | Any endpoint added without the auth dependency is exposed on shared Wi-Fi (CORS already allows `Authorization`, `backend/api/main.py:25-30`). Mitigation: AC-CLS-905 route test, deny by default. |
| R-007 | Student data exposure via unencrypted backups, the LAN host or logs. Mitigation: CLS-NFR-007, D-34, log scan. |
| R-008 | Device clocks and per-device integer versions are not globally comparable. Mitigation: host time and host sequence only (CLS-NFR-012). |
| R-012 | Reusing the stale DDL in `docs/DATABASE.md`. Mitigation: §6 model regenerated in AE-P9. |
| R-021 | Scope: three networked modules on one maintainer machine. Mitigation: D-36 scope cuts; M06 has no live co-editing. |
| R-024 | Large PDF submissions exceed backup format 2 and memory. Mitigation: blob store, size caps, format 3 (ADR-0017). |
| R-026 | Python version drift and unpinned dependencies. Mitigation: D-37, lock file. |
| R-027 | Host setup on school networks (firewall, certificates, IT policy). Mitigation: setup wizard (CLS-FR-045), documented manual, early spike. |
| R-028 | Secure-context and mixed-content rules block browser clients. Mitigation: D-14, native-first if needed, spike at the start of AE-P9. |
| R-036 | Accessibility debts inherited by new screens. Mitigation: build on AE-P3 components only. |
| R-002, R-003 | The live Pages build reaches every visitor at once; DB v4+ migrations for classroom stores land on live data. Mitigation: D-02 gated deploy, upgrade test. |

Module-specific risks, with the numbers [RISK_REGISTER.md](RISK_REGISTER.md) assigned (this PRD's draft numbers R-060 to R-064 clashed with the register's MODULE_03 and MODULE_04 risks and were replaced):

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-076 | Pruning or purging a submitted version locally makes the student's receipt point at nothing; a teacher later disputes what was submitted. | M | M | Protected `'submitted'` version reason; host keeps the authoritative snapshot; receipt digests. |
| R-077 | Deadline disputes from queued offline submissions and wrong device clocks. | M | M | D-45 (deadline rule); host time only by default; visible queued state. |
| R-078 | A teacher's build older than a student's content schema cannot render a submission. | M | M | Existing protected view with original download; host reports schema versions; release notes. |
| R-079 | Host database or blob store loss on a single teacher machine loses grades and submissions. | M | H | Host backup and restore (CLS-FR-045), export (CLS-NFR-013), documented backup routine. |
| R-080 | Classroom features bloat the personal-use experience or leak into it (requests, UI clutter). | M | M | CLS-NFR-002 with the privacy e2e as a gate; D-31. |
