# Security and privacy plan

This plan sets out how Digital Classroom OS protects users' work and, once Classroom Hub and Collaboration exist, students' personal data. It records the current security posture with evidence, the threat model for the Advanced Edition, the concrete controls that meet each security item in brief §6, the privacy-by-default and student-data rules, and the security testing that each phase must pass. It owns the SEC-NNN requirements; their acceptance criteria (AC-SEC-NNN) are listed in [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md). Library names are **candidates — licence to verify** under [DEPENDENCY_AND_LICENCE_PLAN.md](DEPENDENCY_AND_LICENCE_PLAN.md). Numeric parameters (for example key-derivation costs and session lifetimes) are **proposed starting points, to be measured and approved**, not decisions.

**Status: AE-P1 draft for owner approval (2026-11-15)**

Related documents: [ADVANCED_EDITION_PRODUCT_ROADMAP.md](ADVANCED_EDITION_PRODUCT_ROADMAP.md) (owner decisions D-NN) · [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) (ADR-0020 identity, ADR-0022 transport, SYS-014/016/018/020) · [DATABASE_AND_SYNC_ARCHITECTURE.md](DATABASE_AND_SYNC_ARCHITECTURE.md) (SYS-042 attachment limits, backup format 3, SYN-017) · [DEPENDENCY_AND_LICENCE_PLAN.md](DEPENDENCY_AND_LICENCE_PLAN.md) · [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) · [RISK_REGISTER.md](RISK_REGISTER.md) · [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md) (severity scale §6.2, signing §9) · [MODULE_06_CLASSROOM_HUB_PRD.md](MODULE_06_CLASSROOM_HUB_PRD.md) (permission matrix, CLS-NFR-007) · [MODULE_07_COLLABORATION_PRD.md](MODULE_07_COLLABORATION_PRD.md) · [MODULE_05_PDF_STUDIO_PRD.md](MODULE_05_PDF_STUDIO_PRD.md) · [MODULE_DEPENDENCY_MAP.md](MODULE_DEPENDENCY_MAP.md)

Evidence base: repository at HEAD `edc2672`, read-only; `gh` read-only queries on 2026-11-15. Nothing was run, probed or penetration-tested in AE-P1. "Done" means implemented with a test file and the recorded local run of 2026-11-15 (RELEASE_GAPS.md §11).

---

## 1. Current posture (audited 2026-11-15)

### 1.1 What protects users today

| Control | Status | Evidence | Limit |
|---|---|---|---|
| Local-only storage: all work in the browser's IndexedDB on the device | Done | ADR 0001; `packages/local-storage/src/indexeddb.ts:472-491` | Web/PWA only; native shells never built |
| No account, no server, no telemetry, no third-party requests | Done | ADR 0002, Decision item 3; docs/SECURITY.md:5; no analytics or service client in the lockfile | — |
| Privacy test: fails on any request or WebSocket to another origin | Partial | `e2e/privacy.spec.ts:8-55` (documents, diagrams, DOCX/TXT/PNG/PDF/SVG export, backup export; Chromium, WebKit) | **Presentations not covered** (0 mentions in the spec); Firefox never green on CI |
| One designed network exception: pasting a picture from a web page tries once to fetch it | Done (disclosed) | `packages/document-studio/src/extensions/remoteImages.ts:56-59` (behaviour; the fetch function is supplied by the editor, `:18-22`); FEATURE_STATUS privacy row | User-initiated; the request reveals the user's IP to the picture's website |
| Bundled fonts and KaTeX CSS (no CDN) | Done | `@fontsource-variable/inter`; `extensions/insertCss.ts:3` | — |
| Backup import validated all-or-nothing; never overwrites; attachments re-hashed | Done | `backup.ts:58-142` (`validateBackup`); `indexeddb.ts:930-1008` (`importBackup`), `:934` (re-hash); ADR 0007 | Not encrypted, not signed |
| Newer or damaged content opens read-only (protected view) | Done (3 kinds) | document `safety.ts:48` prepareDocument; diagram `editor/useDiagramState.ts:24`; presentation `safety.ts:230` | — |
| Optimistic concurrency: no silent overwrite | Done | `indexeddb.ts:735-776`; ADR 0003 | Single device |
| Link schemes limited to http, https, mailto and in-document anchors | Done (documents, diagrams); Partial (presentations) | `document-studio/src/links.ts:24-36`, `links.test.ts`; `diagram-studio/src/model.ts:49-56` (`isSafeLink`; it also accepts relative links and `data:page/id,` page links), `model.test.ts`; presentations: `presentation-studio/src/render/RichText.tsx:6-14` (`safeHref`: absolute http, https, mailto only) with `PresentationEditor.test.tsx:207-210` | Presentations: only rendering was checked in AE-P1; whether link entry and PPTX/PDF export apply the same rule is Unverified |
| KaTeX with `trust` off and size limits | Done | `extensions/equation.ts:13` | — |
| DOCX HTML parsed in an inert document | Done | `import/docx.ts:503` | — |
| Import size caps | Partial | DOCX/ODT unpack 512 MB (`import/common.ts:61`); dialog 50 MB and 100 MB for `.dcosdoc` (`ImportDocument.tsx:13,15`); `.dcosdiagram` 64 MB (`native.ts:26`); pictures 15 MB (`image.ts:2`; presentation `elements/images.ts:8`); ODT repeat caps 64 and 50 (`import/odt.ts:523-541`) | **`.drawio` has no size cap and no inflate output cap** (`drawio.ts:280`; `native.ts:230-242`); no total ODT repeat cap (TD-39); imports on the main thread (TD-40) |
| Attachments content-addressed with SHA-256 | Done | `indexeddb.ts:276-279`, `:1010-1037`; ADR 0008 | **No size cap; MIME type trusted from the caller** (`putAttachment`, `indexeddb.ts:1010`) |
| Desktop least privilege | Stub | Tauri capability `core:default` only; CSP in `apps/desktop/src-tauri/tauri.conf.json:17` | Never built |
| Backend CORS allow-list | Done (skeleton) | `backend/api/main.py:25-30`; `backend/tests/test_api.py` (unknown origin rejected) | Allows the `Authorization` header although nothing checks it |
| Repository: secret scanning and push protection | Done | gh `security_and_analysis`, 2026-11-15; `.gitignore:22-23` (`backups/`), `:30-47` (`.env*`, keys and certificates, `*.db`, `*.sqlite`) | — |

### 1.2 Known gaps

| Gap | Evidence | Risk |
|---|---|---|
| No authentication, authorisation, roles or sessions anywhere | `backend/api/main.py:46-54` (two public GET endpoints; the canonical brief cites :51-58, the file has 54 lines); `backend/authentication/__init__.py` empty; ADR 0002, Decision item 2 | R-005 |
| Backend README binds the host to all interfaces | `backend/README.md:10` (`--host 0.0.0.0`) | R-005 |
| No Content-Security-Policy on the public GitHub Pages site; Pages cannot send headers | `apps/web/index.html` (no CSP meta; inline theme script at :9-16); TD-29 | R-025 |
| Raw HTML sinks rely on escaping only | `dangerouslySetInnerHTML` at `diagram-studio/src/vector/renderSvg.tsx:516, :616` and `document-studio/src/extensions/shape.tsx:63`; `innerHTML` assignments at `document-studio/src/export/insertPictures.ts:102` and `import/docx.ts:183, :196`; 8 separate escape helpers (SYS-008 lists them: `drawio.ts:64, :74`, `canvasModel.ts:713`, `objectAttrs.ts:34`, `print.ts:12`, `odt/xml.ts:7`, presentation `export/xml.ts:10`, `elements/chart.ts:337`; SYS-008) | R-025 |
| Backups are plain JSON with base64 attachments, including trash and full history; no encryption, no signature | docs/BACKUP_AND_RECOVERY.md:28; ADR 0002, Decision item 5; ADR 0007 | R-007 |
| Service worker would register inside native webviews | TD-31; no platform check in `main.tsx` | R-039 |
| No security reporting channel for a public repository | docs/SECURITY.md:23-25 ("Until a public release…"); GitHub private vulnerability reporting **disabled** (gh `private-vulnerability-reporting`: `{"enabled":false}`, 2026-11-15) | — |
| Dependabot security updates off; `main` not protected; CI actions pinned to tags, no `permissions` block | gh 2026-11-15; TD-33 | R-002 |
| Public history contains a local user path and a placeholder author on every commit | commit 8766e18 (DATA_SAFETY_REPORT.md:53); TD-34 | R-031 |
| docs/SECURITY.md is stale ("Phase 0–1", "until a public release") | docs/SECURITY.md:3, :23-25 | R-019 |

---

## 2. Assets and data classes

| Class | Examples | Where it lives today | Where it will live | Sensitivity |
|---|---|---|---|---|
| P1 Personal work | Documents, diagrams, presentations, notebooks, PDFs and their versions, drafts, attachments | Device IndexedDB; backup files the user exports | Same; plus SQLite on native if D-12 option B | High for the user; may contain personal data about others |
| P2 Device metadata | `deviceId`, preferences, open tabs, theme, emergency drafts in localStorage | Device | Same | Low; `deviceId` is a pseudonymous identifier |
| C1 Classroom records | Classrooms, subjects, memberships, assignments, materials, announcements | — | Classroom host (SQLite) and a per-user client cache (`classroom_cache`, SYS-047) | Medium |
| C2 Student work and results | Submission snapshots, grades, rubric results, feedback | — | Classroom host; student's own device | **High: student personal data** |
| C3 Identity data | Usernames, display names, roles, password hashes, session token hashes, audit log | — | Classroom host | **High** |
| C4 Secrets | Session tokens (client side), join codes, invitation codes, TLS private keys, signing keys | — | OS secure storage (native), HttpOnly cookies (web), host file system, GitHub encrypted secrets (signing) | **Critical** |
| C5 Shared co-editing state | Yjs updates, awareness (presence, cursors) | — | Host relay (transient) and participants' devices | Medium; presence must not be persisted (AC-COL-008) |

---

## 3. Threat model

### 3.1 Trust boundaries

1. **Device ↔ file.** Every imported file (backup, DOCX, ODT, `.dcosdoc`, `.drawio`, `.dcosdiagram`, pictures, PPTX if D-19 adds import, PDF from AE-P8) is untrusted input.
2. **App ↔ web origin.** The public site serves code to every visitor; anything that changes the deployed bundle changes every user's app (R-002).
3. **Client ↔ classroom host** (AE-P9). Network on a school or home Wi-Fi; other devices on the same network are untrusted.
4. **Host ↔ host operator.** The teacher or school machine that runs the host can read all C1–C3 data; the host's backups and logs are in scope.
5. **User ↔ user** inside a classroom or shared workspace (AE-P9, AE-P10): students must not see each other's work or grades unless the teacher shares it.
6. **Build ↔ supply chain.** npm, PyPI, crates.io, GitHub Actions.

### 3.2 Actors

| Actor | Capability | Main concern |
|---|---|---|
| A1 Malicious file author | Crafts a file the user opens | Denial of service (zip bomb, repeat expansion), script injection through HTML or SVG sinks, path tricks in exports |
| A2 Other user of a shared device | Physical access to the same browser profile | Reads personal work or a still-valid classroom session |
| A3 Network attacker on shared Wi-Fi | Sniffs and alters LAN traffic | Steals tokens or join codes; changes submissions in transit |
| A4 Curious or malicious student with an account | Valid low-privilege session | Reads other students' submissions or grades (IDOR), raises own role, submits after the deadline, floods the host |
| A5 Over-reaching teacher | Valid teacher session | Accesses classrooms they do not belong to; reads students' private items that were never submitted |
| A6 Compromised dependency or CI | Code execution at build time or in the shipped bundle | Exfiltration from every user's browser |
| A7 Lost or leaked backup file | Holds a copy of all P1 data, and C2 if classroom data is ever included | Disclosure |
| A8 Remote internet attacker | Reaches a host exposed to the internet (only if D-15 allows remote sync) | All of A3 and A4 at scale |

### 3.3 Threats and controls (STRIDE)

| # | Boundary | Threat (STRIDE) | Actor | Control today | Planned control | SEC |
|---|---|---|---|---|---|---|
| T1 | File | Denial of service by decompression or expansion (D) | A1 | Partial caps (§1.1) | Size cap before read, inflate output cap, total repeat cap, worker with timeout | SEC-020–022 |
| T2 | File | Script injection through HTML/SVG sinks or `javascript:` links (E, I) | A1 | Escaping, inert parsing, link allow-list | CSP, hostile-fixture tests per sink, one escape module per package | SEC-010–012, SEC-025 |
| T3 | File | Malformed PDF exploits the parser (E, D) | A1 | No PDF input today | pdf.js in a worker with eval disabled, no JS execution, caps | SEC-026 |
| T4 | Origin | Malicious change reaches all users through Pages (T, E) | A6 | npm audit, licence gate, secret scanning | Gated deploy (D-02), branch protection (D-05), SHA-pinned actions, Dependabot, CSP | SEC-010, SEC-080; REL-002, REL-005, REL-008; DEP-009, DEP-010 |
| T5 | Client ↔ host | Credential or token theft on Wi-Fi (I, S) | A3 | — | TLS with locally trusted certificate or fingerprint pinned at pairing (D-14); no cleartext tokens | SEC-050 |
| T6 | Client ↔ host | Brute force of passwords or join codes (S) | A3, A4 | — | Argon2id, rate limits, uniform errors, code entropy and expiry | SEC-040, SEC-041 |
| T7 | Client ↔ host | Session hijack or CSRF (S, E) | A2, A3 | — | Opaque hashed tokens, cookie flags, CSRF token, expiry, revocation | SEC-042, SEC-043 |
| T8 | User ↔ user | IDOR: reading another classroom's or student's records (I) | A4, A5 | — | Deny-by-default dependency, object-level checks, route enumeration test, IDOR tests | SEC-044, SEC-045, SEC-071 |
| T9 | User ↔ user | Privilege escalation (role change, viewer sends edits) (E) | A4 | — | Server-side role checks; relay rejects updates from viewers | SEC-044, SEC-052 |
| T10 | Client ↔ host | Tampering with a submission or its timestamp (T, R) | A3, A4 | — | SHA-256 digests per part, host time only, receipts, audit log | SEC-034, SEC-072 |
| T11 | Host operator | Logs or backups leak passwords, tokens or student content (I) | A7, operator | — | Log policy and log scan, host backup encryption option | SEC-063, SEC-072 |
| T12 | Device | Lost backup file (I) | A7 | Users told backups are plain text | Optional passphrase encryption; required for classroom data if D-34 says so | SEC-060–062 |
| T13 | Device | Shared device keeps a classroom session and cached classroom data (I) | A2 | — | Sign-out clears session and cache; idle expiry | SEC-042, SEC-074, SEC-075 |
| T14 | Host | Host flooded by uploads or sockets (D) | A4 | — | Upload size limits, per-user rate and quota, participant and update size limits | SEC-033, SEC-053 |
| T15 | Origin | Third-party request reveals usage (I) | — | Privacy test; bundled assets | Privacy test for every kind; no runtime CDN | SEC-001, SEC-002 |
| T16 | Device | Repudiation of grading or membership changes (R) | A5 | — | Append-only audit log on the host with actor and time | SEC-072 |

The threat model is reviewed at the start of every phase that adds a trust boundary (AE-P8 PDF input, AE-P9 host, AE-P10 relay, AE-P14 native shells) and in full in AE-P13 (SEC-086).

---

## 4. Brief §6 security list mapped to controls

| Brief §6 item | Concrete controls | SEC | Status today | Phase |
|---|---|---|---|---|
| Secure password handling | Argon2id on the host only; per-hash random salt (built into the encoded hash); parameters tuned by measurement; rehash on login when parameters change; no password ever in logs, URLs, client storage or backups; one-time passwords for teacher-created accounts must be changed at first sign-in | SEC-040, SEC-046 | Absent | AE-P9 |
| Authentication | Username and password on the classroom host (ADR-0020); no account for personal use; login rate limiting and uniform errors; self-registration only with a valid class join code, switchable off (CLS-FR-061) | SEC-003, SEC-041, SEC-046 | Absent (personal use needs none) | AE-P9 |
| Authorisation | Deny by default: a FastAPI dependency on every route resolves the session and checks the permission matrix; object-level checks for every id in a path or body; a route-enumeration test fails if a non-public route lacks the dependency | SEC-044 | Absent | AE-P9, AE-P10 |
| Role-based permissions | Host roles `admin`, `teacher`, `student`; classroom membership roles (owner, co-teacher, student); per-item share grants `view`, `comment`, `edit` (ADR-0020); the matrix in M06 PRD §7.4 is the single source | SEC-045 | Absent | AE-P9, AE-P10 |
| Input validation | Client: size cap before reading, decompression caps, structural validation, workers with time limits, protected view for unknown schema. Host: Pydantic models with length and range limits on every field, request body size limits, enum checks, UUID format checks | SEC-020–026, SEC-035 | Partial (client) / Absent (host) | AE-P3, AE-P4, AE-P5, AE-P8, AE-P9 |
| Secure file handling | Client attachments: size cap and MIME sniffing (SYS-042), SHA-256 addressing. Host blobs: stored by digest outside any served directory, digest verified on upload, served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, never executed or rendered by the host. Exports: file names sanitised, no user input in paths | SEC-030–034 | Partial | AE-P3, AE-P9 |
| Session protection | Opaque random tokens stored hashed; idle and absolute expiry; revocation on logout, password change and account disable; HttpOnly, Secure, SameSite cookies plus CSRF tokens for same-origin web; OS secure storage for native bearer tokens; TLS on every authenticated connection | SEC-042, SEC-043, SEC-050 | Absent | AE-P9 |
| Privacy by default | No account for personal use; no telemetry; no third-party requests; nothing leaves the device unless the user shares, submits or configures a host; privacy e2e for every kind | SEC-001–004 | Partial: the privacy e2e covers documents, diagrams and backup export, not presentations | AE-P3 onward |
| Backup security | Optional passphrase encryption (AES-256-GCM through WebCrypto); integrity hashes in the format-3 manifest; plain backups clearly labelled; classroom data excluded from personal backups or encrypted, per D-34; host backups encrypted at rest optionally and readable by admins only | SEC-060–063 | Partial (integrity on import only) | AE-P3 (format 3 design), AE-P13 (encryption) |
| Never expose private classroom or student information | Data minimisation; students see only their own work and results; response-scan and log-scan tests; client cache scoped per host and user and cleared on sign-out; no student data in URLs or query strings | SEC-070–076 | Absent (no classroom data exists yet) | AE-P9 |

---

## 5. Controls in detail

### 5.1 Passwords (SEC-040)

- Algorithm: Argon2id through `argon2-cffi` (candidate, MIT reported, licence to verify).
- Parameters: proposed starting point is memory 64 MiB, 3 iterations, parallelism 4 (the second recommended option in RFC 9106), with a floor of memory 19 MiB, 2 iterations, parallelism 1 (OWASP Password Storage Cheat Sheet). Both references must be re-checked at adoption. Final values are chosen in AE-P9 so one hash takes roughly 0.3–0.5 s on the D-13 host hardware, measured and recorded.
- Rules: minimum length 10 characters (proposed), maximum at least 128; no composition rules; reject the username as password; an optional offline list of common passwords bundled with the host (candidate data source, licence to verify). No hint questions.
- Storage: only the encoded Argon2id string. Rehash on successful login when parameters change.
- Recovery: admin or teacher reset sets a one-time password that must be changed at next sign-in (CLS-FR-062); no email flow is required (CLS PRD keeps email optional).

### 5.2 Sign-in protection (SEC-041)

- Rate limit per account and per source address (proposed: 5 failures per 15 minutes per account, then exponential delay; to be approved with AC-CLS-044).
- Identical error message and similar timing for unknown user and wrong password.
- Join codes and invitation codes: at least 40 bits of randomness from a CSPRNG (proposed), shown once, expiring (proposed default 7 days), rate-limited, invalidated on regeneration (AC-CLS-001).

### 5.3 Sessions (SEC-042, SEC-043)

| Property | Proposed value |
|---|---|
| Token | 256 bits from a CSPRNG, opaque, sent as a cookie (web) or bearer header (native) |
| Storage on host | SHA-256 of the token only; a database read never yields a usable token |
| Idle expiry | 2 hours for web sessions; 14 days for native sessions (to be approved) |
| Absolute expiry | 12 hours web; 30 days native (to be approved) |
| Revocation | Logout, password change (all other sessions), account disable, membership removal (per-classroom access), admin "sign out everywhere" |
| Web cookie | `HttpOnly; Secure; SameSite=Strict; Path=/`; host-only (no `Domain`) |
| CSRF | Synchronizer token for state-changing requests from cookie sessions; `Origin` header checked against the allow-list |
| Native | Bearer token in OS secure storage: Keychain (macOS), Credential Manager (Windows), Android Keystore-backed storage; plugin candidates per DEPENDENCY_AND_LICENCE_PLAN §6.9; never in localStorage or IndexedDB (SYN-017) |
| Rotation | New token after sign-in and after privilege change |

### 5.4 Authorisation (SEC-044, SEC-045)

- Every FastAPI route except `/health`, `/api/v1/info`, the pairing handshake and sign-in carries the authentication dependency; a test enumerates `app.routes` and fails otherwise (AC-CLS-905).
- Object-level checks: every handler loads the target through a function that takes the caller and returns 404 for objects outside the caller's classrooms (no existence oracle).
- The permission matrix test runs every route with every role (AC-CLS-041).
- WebSocket relay (AE-P10): the token is checked at connect and the grant is re-checked per item; a `view` or `comment` connection's content updates are rejected and not relayed (AC-COL-003, AC-COL-019); revocation closes the socket (AC-COL-006).

**Permission matrix (detail of M06 PRD §7.4, extended to M07 grants).** "Yes" means allowed after the object-level check; everything not listed is denied.

| Action | admin | teacher, owner or co-teacher of the classroom | teacher, not a member | student, member | student, not a member |
|---|---|---|---|---|---|
| Create a classroom | yes | yes | yes | no | no |
| Delete or transfer a classroom | yes | owner only (AC-CLS-013) | no | no | no |
| Edit classroom, subjects, assignments, materials, announcements | yes | yes | no | no | no |
| Regenerate join code; add or remove members | yes | yes | no | no | no |
| Read published assignments, materials, announcements | yes | yes | no | yes | no |
| Read draft or scheduled assignments | yes | yes | no | no | no |
| Submit or withdraw work | no | no | no | own only, while open | no |
| Read a submission's metadata | yes | yes | no | own only | no |
| Read a submission's content | per D-46 (proposed: no) | yes | no | own only | no |
| Grade, write feedback, release | no (D-46) | yes | no | no | no |
| Read released grades and feedback | per D-46 | yes | no | own only | no |
| Read the gradebook export | per D-46 | yes | no | no | no |
| Manage accounts, roles, host settings | yes | create and reset students of own classrooms (CLS-FR-060, CLS-FR-062) | same | no | no |
| Read the audit log | yes | entries for own classrooms | no | no | no |

| Action on a shared item (M07) | owner | `edit` grant | `comment` grant | `view` grant | no grant |
|---|---|---|---|---|---|
| Read content and history | yes | yes | yes | yes | no |
| Send content updates | yes | yes | no (rejected by host) | no (rejected by host) | no |
| Add and resolve comments | yes | yes | yes | no | no |
| Grant, change or revoke access; stop sharing | yes | no (403) | no | no | no |
| Keep a copy after revocation | — | per D-50 | per D-50 | per D-50 | — |
| Anonymous link access | — | — | — | per D-51 (proposed: no) | — |

### 5.5 Transport and network (SEC-050–053)

- The host binds to the interface the operator chooses; the documentation stops recommending `0.0.0.0` for anything but a deliberate LAN setup.
- Authenticated traffic only over TLS. Options under D-14: (a) the host serves the web app over HTTPS with a certificate the devices trust (school CA or a locally generated CA installed on devices, tool candidate mkcert); (b) native-only LAN use with the certificate fingerprint pinned at pairing through the QR code.
- Browser constraint (ADR-0022, R-028): the public HTTPS Pages build cannot reach `http://` or `ws://` LAN addresses (mixed content), and a page served over plain `http://<LAN-IP>` is not a secure context, which disables `crypto.subtle`, `crypto.randomUUID`, Web Locks and the service worker. Plain-HTTP LAN serving is therefore not a supported configuration.
- CORS: exact origins only, no wildcard with credentials (today `main.py:25-30`).
- Limits: request body size, upload size per file and per submission, sockets per user, update size and participants per document (AC-COL-511).
- Native shells: Tauri `connect-src` widened only to the paired host; Android network-security configuration permits only the paired host; no remote content loaded into webviews; Tauri capabilities granted per feature and scoped to the app-data directory (SEC-013).

### 5.6 Web platform hardening (SEC-010–014)

Proposed meta CSP for the Pages build (D-23); to be tested in every browser project before deployment:

```
default-src 'self';
script-src 'self' 'sha256-<hash of the inline theme script in index.html:9-16>';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self';
worker-src 'self' blob:;
manifest-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self'
```

Notes and open points:

- `style-src 'unsafe-inline'` is needed today because KaTeX CSS is injected as an inline style (`extensions/insertCss.ts:3`) and editors set inline styles; tightening it is a later step.
- `connect-src 'self'` blocks the pasted-web-picture fetch (`remoteImages.ts:56`). Either that feature keeps working through `connect-src https:` (weaker), or the picture stays marked "Not saved for offline use" as it already does when sites refuse. Decision under D-23.
- pdf.js (AE-P8) may need `'wasm-unsafe-eval'` for image decoders and `worker-src blob:`; to verify in the AE-P8 spike.
- A meta CSP cannot set `frame-ancestors` or a reporting endpoint, so click-jacking protection is unavailable on GitHub Pages. Moving to a host that sends headers is the alternative in D-23.
- Every raw HTML sink (§1.2) gets a hostile-fixture test, and new code uses one escape module per package (SYS-008).
- The service worker is not registered in Tauri or Capacitor webviews (SYS-018, TD-31).

### 5.7 Input validation of imports (SEC-020–026)

| Input | Today | Required control | Phase |
|---|---|---|---|
| Backup JSON (format 2) | All-or-nothing validation, schema limits, re-hash (`backup.ts:58-142`; `indexeddb.ts:934`) | Size cap before parsing; streaming or worker parse for large files | AE-P3 |
| Backup ZIP (format 3, proposed) | — | Entry count and total size caps; per-entry inflate cap; manifest hashes verified before any write; no path components honoured from entry names | AE-P3 design, AE-P8 |
| DOCX, ODT, `.dcosdoc` | Unpack 512 MB; dialog caps; ODT repeat caps 64/50 | Total ODT repeat cap (TD-39); worker with time limit (TD-40); XML parser without external entities | AE-P4 |
| `.drawio` and diagrams.net XML | **No cap** | File size cap before `file.text()`; inflate output cap; cell count cap; worker (AC-DGM-107) | AE-P5 (AE-P3 if the owner brings it forward) |
| `.dcosdiagram` | 64 MB | Keep; worker | AE-P5 |
| Pictures | 15 MB, re-encoded, downscaled | MIME sniffing by magic bytes; SVG pictures treated as untrusted (rendered only through `<img>`, never inlined) | AE-P3 |
| PPTX (only if D-19 adds import) | — | Same as DOCX | AE-P6 |
| PDF | Not accepted (`images-diagram.test.ts:41`) | pdf.js in a worker, `isEvalSupported: false`, no PDF JavaScript, no external resource loading, size and page caps, timeout; encrypted-PDF passwords held in memory only (AC-PDF-023) | AE-P8 |
| Host request bodies | — | Pydantic models with explicit limits; reject unknown fields | AE-P9 |

### 5.8 Secure file handling (SEC-030–035)

- **Client attachments:** per-attachment size cap and MIME sniffing in `putAttachment`, stored type is the sniffed one (SYS-042, AE-P3).
- **Digests:** SHA-256 on every attachment and every submitted part; the host refuses a part whose bytes do not match its digest (AC-CLS-506).
- **Host blob store:** content-addressed files in a directory the web server does not serve; downloads only through an authorised endpoint with `Content-Disposition: attachment` and `nosniff`; no server-side rendering or conversion of uploaded files in v1.0.0.
- **Export names:** derived from item titles with path separators, control characters and reserved device names removed (AC-CLS-014 for submission ZIPs).
- **Downloads in native shells** go through SVC-PLAT save dialogs (TD-28), not `<a download>`.

### 5.9 Backup security (SEC-060–063)

| Aspect | Proposal |
|---|---|
| Encryption | Optional passphrase encryption of backup format 3. AES-256-GCM through WebCrypto (`crypto.subtle`, available in secure contexts), a random 96-bit IV per encrypted entry, the manifest authenticated as associated data |
| Key derivation | Option A: PBKDF2-HMAC-SHA-256 through WebCrypto (no new dependency), iteration count from current OWASP guidance at adoption (to verify), measured on the slowest supported device. Option B: Argon2id through a WASM build (candidate, licence to verify; needs `'wasm-unsafe-eval'`). Decision with D-34 |
| Forgotten passphrase | Unrecoverable by design (the concern in ADR 0002, Decision item 5). The UI asks for the passphrase twice, shows the consequence in plain words, and offers a test-restore check of the new file |
| Integrity | Format-3 manifest lists SHA-256 of every entry; import verifies all hashes before writing anything (all-or-nothing as today) |
| Authenticity | Not proposed (no signing); the manifest gives integrity only (DATABASE_AND_SYNC_ARCHITECTURE) |
| Disclosure | Unencrypted backups are labelled as readable by anyone who has the file (today: BACKUP_AND_RECOVERY.md:28); backups include trash and history, stated in the export dialog; whether to offer "exclude trash and history" is part of D-34 |
| Classroom data | The client classroom cache is not included in personal backups (proposed); if D-34 includes it, encryption becomes mandatory for that backup |
| Host backups | Admin-only; optional encryption at rest with a key held by the operator; documented restore test (AC-CLS-045) |

### 5.10 Logging and audit (SEC-072)

- Host audit log (append-only): sign-in success and failure counts, account and role changes, membership changes, publish, submit, grade release, share grant and revoke (AC-COL-024). Each entry: actor id, action, target id, host time. **No** content, item titles, passwords, tokens or join codes.
- Application logs follow the same exclusion list; a log scan over the full e2e run fails on any match (AC-CLS-507).
- Client activity log (SVC-ACT) stays on the device and holds no content (SYS-046).
- Retention: proposed 1 year for the audit log, 30 days for application logs; owner to confirm with the student-data retention question (§7).

### 5.11 Repository, build and supply chain (SEC-076, SEC-080)

| Control | Status | Owner of the requirement |
|---|---|---|
| Private vulnerability reporting enabled; docs/SECURITY.md updated with the channel and supported versions | Absent (disabled, 2026-11-15) | SEC-080 (D-39) |
| Branch protection with required checks | Absent | REL-005 (D-05) |
| Deploy gated on green CI | Absent | REL-002 (D-02) |
| CI `permissions` blocks, SHA-pinned actions, timeouts | Absent | REL-008 (TD-33) |
| Vulnerability gates in every ecosystem; Dependabot | Partial | DEP-009, DEP-010 |
| Signing keys outside the repository with offline backup | Absent (no keys) | REL-027 |
| Secret scanning and push protection | Done | SEC-076 |

---

## 6. Privacy by default

1. **No account for personal use.** The device's local profile owns local items (ADR 0002). Signing in to a classroom host never changes `ownerDeviceId` or uploads anything (AC-CLS-064).
2. **Explicit sharing only.** Nothing leaves the device unless the user submits, shares or hands it in (SYN-001). Metadata such as favourites, folders and tags stays per device unless an item is shared (SYN-010).
3. **No third-party requests.** The privacy e2e is extended to every kind and every new feature: presentations (AE-P3, AC-PRS-504), notebooks (AC-NBK-503), PDFs (AC-PDF-504), File Manager (AC-FIL-507), Dashboard and search (AC-DSH-505). With a host configured, requests go only to that host and only for shared items (AC-COL-017).
4. **Disclosed exceptions.** The pasted-web-picture fetch is the only designed request today; it is user-initiated and stays listed in the user documentation. Any new exception needs an owner decision.
5. **Hosting disclosure.** The public web app is served by GitHub Pages, so GitHub receives ordinary web-server request data (such as IP addresses) when the app loads. This is outside the app's control and is stated in the user documentation; native builds avoid it.
6. **No telemetry or crash reporting** (DEP-005).
7. **Data minimisation on the host.** Username, display name and role are enough; email is optional (M06 PRD `User` entity). No birth dates, addresses, photos or phone numbers.
8. **Local search index** holds text from the user's own items only and never leaves the device (SVC-SEARCH); classroom cache entries are indexed only for the signed-in user and are removed on sign-out.

---

## 7. Student data protection

| Rule | Control | SEC | Criterion |
|---|---|---|---|
| Students see only their own submissions, grades and feedback | Object-level checks; response-scan test over every student endpoint | SEC-071 | AC-CLS-027, AC-SEC-071 |
| Teachers see only classrooms they belong to | Membership checks; IDOR tests across classrooms | SEC-044 | AC-CLS-504 |
| A student's private items are never visible to a teacher unless submitted | Submission uploads only the selected snapshot (AC-CLS-503); nothing syncs by default | SEC-004 | AC-CLS-503 |
| Draft grades are invisible to students | Release state checked server-side | SEC-071 | AC-CLS-008 |
| No student data in URLs, query strings or logs | ids only in paths; log scan | SEC-072 | AC-CLS-507 |
| Shared devices | Sign-out deletes the session token and the classroom cache for that user; idle expiry; a notice that personal items stay in the device profile | SEC-074, SEC-075 | AC-SEC-074, AC-SEC-075 |
| Retention and deletion | Removing a student, deleting an account and archiving a classroom each have a defined effect on submissions, grades and logs; an admin can export one student's records and delete them | SEC-073 | AC-SEC-073 |
| Legal basis | Which data-protection law applies depends on where the school and host operate; AE-P1 includes **no legal review**. The owner or school must confirm requirements (for example consent for minors) before AE-P9 exits | SEC-073 | owner record |

**Owner decision D-47** (retention and export of student data on the host) covers retention periods for classroom data, submission snapshots and audit logs after a student leaves or a classroom is archived, and who may request deletion. A starting point for that discussion, not a decision: keep while the classroom exists and for one school year after archiving, then purge by admin action with a confirmation step; never delete automatically without notice. D-46 (whether admins may read submission content and grades) and D-53 (shared items' host data in host backups and retention after sharing stops) belong to the same policy.

---

## 8. SEC requirements

Status words follow the planning brief. "Owner" names the requirement in another document when the control is defined there; this table then only points to it.

| ID | Requirement | Status | Evidence | Phase | Criterion |
|---|---|---|---|---|---|
| SEC-001 | No local feature makes a network request except user-initiated, disclosed exceptions; privacy e2e covers every content kind | Partial | `e2e/privacy.spec.ts` covers documents, diagrams, backup; not presentations | AE-P3, each module phase | AC-SEC-001 |
| SEC-002 | No telemetry, analytics, crash reporting or third-party runtime assets | Done | no such packages; bundled fonts | every phase | AC-SEC-002 |
| SEC-003 | Personal use needs no account | Done (by construction) | ADR 0002 | every phase | AC-SEC-003 |
| SEC-004 | Items leave the device only when the user shares, submits or hands them in (owner: SYN-001) | Done (by construction) | no sync code | AE-P9, AE-P10 | AC-SYN-001 |
| SEC-010 | The web build has a CSP (§5.6) tested in every browser project | Absent | `apps/web/index.html`; TD-29 | AE-P2/AE-P3 (D-23) | AC-SEC-010 |
| SEC-011 | Every raw HTML sink takes only generated or escaped input and has a hostile-fixture test | Partial | sinks listed in §1.2; shape SVG escaping tested (`extensions/insertObjects.test.ts:179-183`); other sinks not checked for hostile-fixture tests in AE-P1 | AE-P3 | AC-SEC-011 |
| SEC-012 | Link schemes limited to http, https, mailto and in-document anchors in every editor and importer | Partial: Done for documents and diagrams; presentations checked at render only, link entry and export Unverified | `links.ts:24-36`; diagram `model.ts:49-56`; presentation `render/RichText.tsx:6-14` | AE-P3 | AC-SEC-012 |
| SEC-013 | Native shells use least privilege: per-feature capabilities scoped to app data, CSP, Android network-security configuration, no remote content | Stub | `tauri.conf.json:17`; capabilities `core:default` | AE-P14 | AC-SEC-013 |
| SEC-014 | No service worker inside native webviews (owner: SYS-018) | Absent | TD-31 | AE-P3, AE-P14 | AC-SYS-018 |
| SEC-020 | Every import checks a size cap before reading the whole file | Partial | `.drawio` uncapped | AE-P3 to AE-P8 | AC-SEC-020 |
| SEC-021 | Every decompression and expansion has an output cap (inflate, ODT repeats, XML entities) | Partial | `drawio.ts:280`; TD-39 | AE-P4, AE-P5 | AC-SEC-021 |
| SEC-022 | Heavy parsing runs in a worker with a time limit; failure leaves no partial item (owner: SYS-016) | Absent | TD-40 | AE-P3 onward | AC-SYS-016 |
| SEC-023 | Backup import stays all-or-nothing, never overwrites and re-hashes attachments, in every format | Done (format 2) | `backup.ts:58-142`; `indexeddb.ts:930-1008` | keep; AE-P3 format 3 | AC-SEC-023 |
| SEC-024 | Newer or damaged content of every kind opens read-only and is never written (owner: SYS-015) | Done (3 kinds) | safety modules | AE-P7, AE-P8 | AC-SYS-015 |
| SEC-025 | A malicious-fixture corpus per input format runs in CI (zip bomb, entity and repeat expansion, deep nesting, script in SVG and HTML, `javascript:` links, oversized pictures, malformed PDFs) | Partial | ODT caps tests; link tests | AE-P3 onward | AC-SEC-025 |
| SEC-026 | PDF input is parsed in a worker with eval disabled, no PDF JavaScript, no external fetches, caps and timeouts; passwords never stored | Absent | no PDF input | AE-P8 | AC-SEC-026 |
| SEC-030 | Attachments have a size cap and sniffed MIME type (owner: SYS-042) | Absent | `indexeddb.ts:1010` | AE-P3 | AC-SYS-042 |
| SEC-031 | Attachments and submitted parts are addressed and verified by SHA-256 | Done (local) | ADR 0008 | AE-P9 (host) | AC-SEC-031 |
| SEC-032 | Export and download file names are sanitised; downloads use SVC-PLAT on native | Partial | `packages/ui/src/download.ts:2-5` (`safeFileName`); `:11-20` (`downloadBlob` through `<a download>`, TD-28) | AE-P9, AE-P14 | AC-SEC-032 |
| SEC-033 | Host blobs stored outside served paths, served as attachments with `nosniff`, size-limited, never executed | Absent | — | AE-P9 | AC-SEC-033 |
| SEC-034 | Submissions carry per-part digests and host timestamps; receipts match the host record | Absent | — | AE-P9 | AC-CLS-029, AC-CLS-506 |
| SEC-035 | Every host endpoint validates input through models with explicit limits and rejects unknown fields | Absent | — | AE-P9 | AC-SEC-035 |
| SEC-040 | Passwords hashed with Argon2id (§5.1), never logged or stored elsewhere | Absent | — | AE-P9 | AC-SEC-040 |
| SEC-041 | Sign-in and code entry are rate-limited with uniform errors; codes have sufficient entropy and expiry | Absent | — | AE-P9 | AC-SEC-041 |
| SEC-042 | Sessions use hashed opaque tokens with idle and absolute expiry and revocation (§5.3) | Absent | — | AE-P9 | AC-SEC-042 |
| SEC-043 | Web sessions use HttpOnly, Secure, SameSite cookies with CSRF protection; native tokens live in OS secure storage | Absent | — | AE-P9, AE-P14 | AC-SEC-043 |
| SEC-044 | Every non-public route enforces authentication and object-level authorisation, deny by default | Absent | — | AE-P9, AE-P10 | AC-SEC-044 |
| SEC-045 | Roles and grants follow one permission matrix (M06 PRD §7.4, M07 grants) tested route by route | Absent | — | AE-P9, AE-P10 | AC-CLS-041 |
| SEC-046 | Account lifecycle: first-admin bootstrap, one-time passwords changed at first sign-in, disable revokes sessions | Absent | — | AE-P9 | AC-CLS-040, AC-CLS-045, AC-CLS-060 |
| SEC-050 | Authenticated host traffic only over TLS per D-14; the host binds to the chosen interface | Absent | `backend/README.md:10` | AE-P9 | AC-SEC-050 |
| SEC-051 | CORS allows exact origins only, never a wildcard with credentials | Done (skeleton) | `main.py:25-30`; `backend/tests/test_api.py:22-24` | keep | AC-SEC-051 |
| SEC-052 | Collaboration sockets authenticate at connect, authorise per item and reject updates beyond the grant | Absent | — | AE-P10 | AC-COL-003, AC-COL-508 |
| SEC-053 | Host limits request, upload, socket and update sizes and per-user rates | Absent | — | AE-P9, AE-P10 | AC-SEC-053 |
| SEC-060 | Backups can be encrypted with a passphrase (§5.9); encryption is mandatory for backups containing classroom data if D-34 says so | Absent | ADR 0002, Decision item 5 | AE-P13 (D-34) | AC-SEC-060 |
| SEC-061 | Backup format 3 carries per-entry SHA-256 in its manifest and import verifies all before writing | Absent (format 2 re-hashes attachments only) | `indexeddb.ts:934` | AE-P3 | AC-SEC-061 |
| SEC-062 | The export dialog states plainly what a backup contains and whether it is encrypted | Partial | BACKUP_AND_RECOVERY.md:28 (docs only) | AE-P11, AE-P13 | AC-SEC-062 |
| SEC-063 | Host backups are admin-only, optionally encrypted at rest, and restore-tested | Absent | — | AE-P9 | AC-CLS-045, AC-SEC-063 |
| SEC-070 | The host stores only the personal data listed in §6 item 7 | Absent | — | AE-P9 | AC-SEC-070 |
| SEC-071 | Students never receive another student's records; draft grades never reach students | Absent | — | AE-P9 | AC-SEC-071 |
| SEC-072 | Host audit and application logs exclude secrets and content; audit log is append-only | Absent | — | AE-P9, AE-P10 | AC-CLS-507, AC-SEC-072 |
| SEC-073 | Retention and deletion of classroom data follow an owner-approved policy | Absent | D-47 (§7) | AE-P9 | AC-SEC-073 |
| SEC-074 | The client classroom cache is scoped per host and user and removed on sign-out | Absent | — | AE-P9 | AC-SEC-074 |
| SEC-075 | Sign-out on a shared device leaves no usable session or classroom data | Absent | — | AE-P9 | AC-SEC-075 |
| SEC-076 | Credentials and student data are never committed; secret scanning and push protection stay on | Done | gh 2026-11-15; `.gitignore:36-47` | every phase | AC-SEC-076 |
| SEC-080 | A private security reporting channel exists and docs/SECURITY.md is current | Absent | private reporting disabled; SECURITY.md:3, :23-25 | AE-P2 (D-39) | AC-SEC-080 |
| SEC-085 | A security review of each networked phase (AE-P9, AE-P10) and a full review in AE-P13 end with no open Critical or High finding | Absent | — | AE-P9, AE-P10, AE-P13 | AC-SEC-085 |
| SEC-086 | The threat model (§3) is reviewed whenever a trust boundary is added | Absent | this document is the first version | AE-P8, AE-P9, AE-P10, AE-P13, AE-P14 | AC-SEC-086 |

---

## 9. Security testing

| Type | What | Tools (candidates where new) | Phase | Blocking? |
|---|---|---|---|---|
| Unit | Validators, caps, escaping, link schemes, MIME sniffing, digest checks, CSP-relevant code paths | Vitest (installed) | AE-P3 onward | Yes |
| Malicious fixtures | One corpus per input format (SEC-025), including real malformed PDFs for AE-P8 | Vitest; fixture files with recorded provenance | AE-P3 onward | Yes |
| Property-based fuzzing | Parsers (DOCX/ODT/drawio/backup), sync merge and permission matrix | fast-check (candidate, licence to verify) | AE-P4, AE-P9, AE-P13 | Yes for crash and hang findings |
| Privacy e2e | Zero cross-origin requests for every kind and feature; host-only requests with a host configured | Playwright (installed) | every phase | Yes |
| CSP e2e | Every route loads and every export works under the CSP in Chromium, Firefox and WebKit | Playwright | AE-P2/AE-P3 | Yes |
| Host API tests | Permission matrix for every route and role; route enumeration; IDOR across classrooms; response scan for other students' data; draft-grade invisibility | pytest + httpx (installed in the backend dev requirements) | AE-P9 | Yes |
| Session tests | Expiry, revocation, cookie flags, CSRF rejection, token hashing in the database | pytest; Playwright for cookies | AE-P9 | Yes |
| Rate-limit tests | Sign-in and code entry | pytest | AE-P9 | Yes |
| Relay tests | Unauthenticated socket refused; viewer update rejected; revocation closes socket | pytest or Node test client | AE-P10 | Yes |
| Log scan | No password, token, join code, item title or content in host logs after the full e2e run | Script over captured logs | AE-P9, AE-P10 | Yes |
| Transport | TLS required; plain HTTP refused for authenticated routes; certificate pinning at pairing (if D-14 chooses it) | Manual plus scripted checks on the reference LAN | AE-P9, AE-P14 | Yes |
| Dependency scanning | npm audit, pip-audit, cargo audit, Android scanner | DEP-009 | AE-P2 onward | Yes at high |
| Static analysis | Security-focused rules in ESLint (for example no `eval`, no `innerHTML` outside approved files); Python rules in ruff | ESLint, ruff (candidates, D-24) | AE-P3 | Yes for new code |
| Dynamic scan | Automated scan of the classroom host on the reference LAN | OWASP ZAP (candidate, licence to verify) | AE-P13 | Findings triaged |
| Penetration-style review | Manual review of the host and relay against §3, including the A4 student actor | Manual, recorded with date and findings | AE-P13 | No open Critical or High (SEC-085) |
| Native checks | Capabilities, CSP, network-security config, token storage, no service worker in webviews | Manual on each platform, dated | AE-P14 | Yes |

Findings use the severity scale proposed in RELEASE_STRATEGY §6.2. A Critical or High security finding blocks the phase gate and the release (REL-017).

---

## 10. Incident response and reporting

- **Reporting channel:** enable GitHub private vulnerability reporting (D-39) and update docs/SECURITY.md in AE-P2 with the channel, the supported versions and a response promise.
- **Proposed response promise:** acknowledge within 7 days; fix or mitigate Critical within 7 days and High within 30 days of confirmation; publish an advisory once a fix is deployed.
- **Web fixes** reach users through the gated deploy (D-02) and the service worker update prompt; R-097 (users on cached builds) means a fix may need the update banner to say it is a security update.
- **Classroom host incidents:** documented steps for the operator: stop the host, revoke all sessions, rotate the TLS key, restore from a known-good host backup, review the audit log.
- **Leaked signing key:** follow RELEASE_STRATEGY §9 (R-095).

---

## 11. Known risks

From [RISK_REGISTER.md](RISK_REGISTER.md):

| Risk | Summary | Controls here |
|---|---|---|
| R-002 | Ungated Pages deploys reach all users | §5.11; REL-002 |
| R-005 | Endpoints without authentication on shared Wi-Fi | SEC-044, SEC-050, route enumeration test |
| R-007 | Student data exposure through backups, the LAN host or logs | SEC-060, SEC-070–075, SEC-072 |
| R-023 | Malformed PDFs and PDF engine security | SEC-026, SEC-025 |
| R-025 | No web CSP; HTML sinks; `.drawio` and ODT expansion | SEC-010, SEC-011, SEC-020, SEC-021 |
| R-028 | Secure-context and mixed-content rules block LAN use from the HTTPS web build | §5.5; D-14 |
| R-030 | Third-party CDN assets would break the privacy promise | SEC-002; SYS-020 |
| R-031 | Public history contains a local path and placeholder author | Accepted under D-04 (no rewrite proposed) |
| R-039 | WebView differences on native platforms | SEC-013, SEC-014 |
| R-097 | Users stay on cached builds, delaying security fixes | §10 |

Plan-specific risks (proposed, not yet numbered; RISK_REGISTER §5 assigns new risks from R-105 onwards, and R-101 to R-104 are M05 risks):

- **Certificate setup burden** may push schools towards plain HTTP, which this plan does not support. Mitigation: native-first LAN option and a written setup guide (D-14).
- **Passphrase loss** makes encrypted backups unrecoverable. Mitigation: §5.9 UX and test-restore.
- **Unreviewed legal requirements** for student data. Mitigation: owner confirmation before AE-P9 exits (§7).
- **Meta CSP limits** on GitHub Pages (no `frame-ancestors`, no reporting). Mitigation: D-23 alternative host.

## 12. Owner decisions referenced

D-01 (public repository record), D-02 (gated deploy), D-04 (git identity, no history rewrite), D-05 (branch protection, Dependabot), D-12 (native storage), D-13 (classroom host), D-14 (LAN security and certificates), D-15 (remote sync), D-19 (PPTX import), D-20 (PDF scope), D-23 (web CSP), D-25 (axe), D-28 (signing), D-34 (backup encryption and contents), D-37 (Python version), D-39 (security reporting channel), D-45 (deadline rule for queued submissions), D-46 (admin access to submissions and grades), D-47 (student data retention), D-50 (former collaborator's copy), D-51 (anonymous view links), D-53 (shared items in host backups). This plan decides none of them.
