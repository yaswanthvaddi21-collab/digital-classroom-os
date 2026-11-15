# Risk register

This register lists the risks that could stop Digital Classroom OS Advanced Edition from reaching a safe, honest v1.0.0 release, together with how likely each is, how much harm it would do, which Advanced Edition phase owns it, how it is mitigated, what event shows it is happening, and its status today. R-001 to R-040 come from the AE-P1 audits as consolidated in the canonical planning brief; R-050 to R-092 and R-101 to R-104 consolidate the module-specific risks proposed in the module PRDs (§3.7); R-093 to R-100 were added while writing the release strategy. §5 records how the numbers were allocated. The register is reviewed at step 1 (Audit) and step 9 (Report) of every phase gate.

**Status: AE-P1 draft for owner approval (2026-11-15)**

Related documents in this folder:
[Product roadmap](ADVANCED_EDITION_PRODUCT_ROADMAP.md) (phases, owner decisions D-NN) ·
[Release strategy](RELEASE_STRATEGY.md) ·
[Acceptance criteria](ACCEPTANCE_CRITERIA.md) ·
[Security and privacy plan](SECURITY_AND_PRIVACY_PLAN.md) ·
[System architecture](SYSTEM_ARCHITECTURE.md) ·
[Database and sync architecture](DATABASE_AND_SYNC_ARCHITECTURE.md) ·
[Dependency and licence plan](DEPENDENCY_AND_LICENCE_PLAN.md) ·
[Module dependency map](MODULE_DEPENDENCY_MAP.md) ·
Module PRDs: [01](MODULE_01_DOCUMENT_STUDIO_PRD.md) · [02](MODULE_02_DIAGRAM_STUDIO_PRD.md) · [03](MODULE_03_PRESENTATION_STUDIO_PRD.md) · [04](MODULE_04_DIGITAL_NOTEBOOK_PRD.md) · [05](MODULE_05_PDF_STUDIO_PRD.md) · [06](MODULE_06_CLASSROOM_HUB_PRD.md) · [07](MODULE_07_COLLABORATION_PRD.md) · [08](MODULE_08_FILE_MANAGER_PRD.md) · [09](MODULE_09_DASHBOARD_PRD.md)

---

## 1. Scales and status values

| Field | Values |
|---|---|
| Likelihood (L) | **H** = expected to happen, or already happening, without action; **M** = plausible during the programme; **L** = unlikely |
| Impact (I) | **H** = data loss, exposure of private or student data, a release blocker, or the loss of a whole module or platform; **M** = a phase slips, a feature is cut or degraded, or rework is needed; **L** = local inconvenience or small rework |
| Rating | L × I with H = 3, M = 2, L = 1. 9 = severe, 6 = high, 3–4 = medium, 1–2 = low |
| Owner phase | The AE phase responsible for the mitigation. "Also" names later phases that must re-check it |
| Status | **Open** = the risk is possible and not yet mitigated; **Realised** = the event has already happened at least once and is now an issue to fix; **Mitigating** = mitigation is under way in the current phase; **Closed** = mitigated with evidence, or no longer applicable |

These status values apply to risks only. Feature statuses (Done, Partial, Stub, Absent, Unverified) are defined in [the roadmap §2.1](ADVANCED_EDITION_PRODUCT_ROADMAP.md#21-status-words).

## 2. Summary

### 2.1 Heat map (90 risks)

| Likelihood \ Impact | H | M | L |
|---|---|---|---|
| **H** | R-001, R-002, R-008, R-011, R-017, R-021, R-024, R-028, R-032, R-062, R-098 (11) | R-006, R-009, R-010, R-014, R-018, R-019, R-020, R-027, R-034, R-036, R-039, R-051, R-052, R-055, R-063, R-065, R-084, R-104 (18) | R-026, R-090, R-096 (3) |
| **M** | R-003, R-004, R-005, R-007, R-023, R-037, R-064, R-071, R-072, R-079, R-082, R-093, R-094 (13) | R-012, R-015, R-016, R-022, R-025, R-029, R-030, R-033, R-035, R-050, R-053, R-056, R-057, R-060, R-061, R-066, R-070, R-073, R-075, R-076, R-077, R-078, R-080, R-081, R-083, R-086, R-087, R-088, R-097, R-099, R-100, R-101, R-102, R-103 (34) | R-013, R-038, R-040, R-074, R-091, R-092 (6) |
| **L** | R-089, R-095 (2) | R-054 (1) | R-031, R-085 (2) |

Status counts at 2026-11-15: Realised 6 (R-001, R-002, R-019, R-035, R-037, R-096), Mitigating 1 (R-020), Open 83, Closed 0.

### 2.2 Risks by owner phase

| Phase | Owns | Also re-checks |
|---|---|---|
| AE-P1 | R-020, R-021 | — |
| AE-P2 | R-001, R-002, R-019, R-031, R-035, R-037, R-038, R-096, R-099 | — |
| AE-P3 | R-003, R-004, R-006, R-012, R-025, R-034, R-036, R-040, R-082, R-093, R-097 | R-008, R-022, R-024, R-038, R-081 |
| AE-P4 | R-009, R-010, R-011, R-013, R-050, R-051, R-052, R-053, R-098 | R-004, R-030 |
| AE-P5 | R-014, R-015, R-016, R-054, R-055, R-056, R-057 | R-098 |
| AE-P6 | R-017, R-018, R-060, R-061, R-062, R-100 | R-098 |
| AE-P7 | R-022, R-063, R-064, R-065, R-066 | R-003, R-021, R-087, R-088 |
| AE-P8 | R-023, R-024, R-030, R-101, R-102, R-103, R-104 | R-003 |
| AE-P9 | R-005, R-007, R-026, R-027, R-076, R-077, R-078, R-079, R-080 | R-012, R-028 |
| AE-P10 | R-008, R-028, R-029, R-070, R-071, R-072, R-073, R-074, R-075 | R-007, R-015 |
| AE-P11 | R-081, R-083, R-084, R-085, R-086 | R-003, R-040 |
| AE-P12 | R-087, R-088, R-089, R-090, R-091, R-092 | R-021, R-099 |
| AE-P13 | — | R-005, R-007, R-025, R-034, R-036, R-089 |
| AE-P14 | R-032, R-033, R-039, R-094, R-095 | R-012, R-037, R-057, R-065, R-084, R-098 |
| AE-P15 | — | R-021, R-035, R-098 |
| AE-P16 | — | R-093, R-094, R-095 |

---

## 3. Register

### 3.1 Process, CI and repository

| ID | Risk and evidence | L | I | Owner phase | Mitigation | Trigger | Status |
|---|---|---|---|---|---|---|---|
| R-001 | CI e2e has never passed on main; Firefox and Linux WebKit are unverified. Runs 43669491390 (468ab89) and 43676035968 (edc2672) failed in the e2e job; PR #1 run 43709861278 had 494 passed, 2 failed, 1 flaky; PR #1 run 43719093806 (4983af4) then passed every job, including Firefox and Linux WebKit, on the PR branch (completed 2026-11-15T13:48Z; seen in the AE-P1 fact-check), so the risk stays Realised until main itself is green | H | H | AE-P2 | Merge PR #1 once its CI run is green (D-03); fix the remaining Firefox and Linux WebKit failures; make green CI on all jobs an entry gate for every phase (ROADMAP §5.2) and a required check on main (D-05, REL-001) | Any red CI run on main or on a pull request to main; any phase starting while main is red | **Realised** |
| R-002 | Pages deploys every push to main, ungated (pages.yml:6-9), so failing builds and DB migrations reach all live users at once. Both deployed commits had failing CI | H | H | AE-P2 | Gate the deploy on green CI (D-02 (b)); from AE-P16 deploy release tags only; never deploy an RC to the live site unless D-41 (c); hide unreleased modules (D-31) | A deploy run for a commit whose CI is not green; a migration merged to main before its phase exit | **Realised** |
| R-019 | Documentation drift: more than 10 stale statements (README, DEPLOYMENT, FEATURE_STATUS, RELEASE_GAPS, TECHNICAL_DEBT, GIT_WORKFLOW, TESTING, DATABASE, ADR 0006/0007, SECURITY, backups/README, CHECKLIST), and planning could repeat them | H | M | AE-P2 | Correct the list in ROADMAP §3.3 in AE-P2; gate step 8 (Document) in every phase; cite `path:line` with the commit it refers to; documentation review in REL-019 | A document cites a statement from ROADMAP §3.3; a phase report finds a doc contradicting the code | **Realised** |
| R-020 | Phase-number confusion between the v0.2 programme ("Phase n" commits) and the AE numbering | H | M | AE-P1 | Always write "AE-Pn" or "v0.2 Phase n"; mapping table in ROADMAP §2.2; correct the stub and native READMEs in AE-P2 | A document, issue or commit writes "Phase n" without a prefix | **Mitigating** |
| R-021 | Scope size: nine modules, three of them networked, on one maintainer machine | H | H | AE-P1 | One phase at a time (brief §13); shared services before modules; scope-cut candidates ready (D-36); re-plan at every gate; AC waivers disclosed, not hidden | A phase exceeds its planned scope; waivers accumulate across phases; a module phase starts before shared services exist | Open |
| R-031 | The public history contains a local user path (8766e18, docs/audit/FINDINGS.md; removed from the current file, docs/DATA_SAFETY_REPORT.md:53) and a placeholder author on every commit (TD-34); rewriting needs a force-push to a public repository. The local tag `v0.1.0-baseline` carries a personal tagger identity and has not been pushed (`git ls-remote --tags origin` lists none) | L | L | AE-P2 | Leave history as it is (D-04 proposal); record the decision; real identity for new commits; decide whether the baseline tag is ever pushed | The owner asks for a history rewrite; a tag push is proposed | Open |
| R-035 | Lost evidence: the Round 3 fail-before logs and samples were cleared with the session scratchpad (RELEASE_GAPS.md:236); some evidence existed only in the scratchpad | M | M | AE-P2 | Keep every piece of evidence in the repository (docs/compatibility/<phase>-<date>/) or as CI artifacts with a retention note; never cite scratchpad paths in reports | A phase report cites evidence that is not in the repository or CI | **Realised** |
| R-037 | One machine holds all backups and runs all builds; it is shared and loaded, which causes flaky runs (load averages of about 80 and 120–180 recorded in RELEASE_GAPS.md:203 and :252) | M | H | AE-P2 | Off-machine copy of every bundle; release artifacts built only in CI (RELEASE_STRATEGY §7.1); local verification runs recorded with the load average and repeated when load is high | Load above the level at which runs were flaky; disk or machine failure; a backup exists only locally | **Realised** (flaky runs) |
| R-038 | PR #1's workaround stops 'cancel' listeners being registered on file inputs in Firefox tests (e2e/fixtures.ts on the PR branch), so the app's file-picker cancel handling is never exercised by Firefox e2e tests (the PR states that unit tests cover it, e2e/fixtures.ts:6-11 on the PR branch) | M | L | AE-P2 | Record the gap when PR #1 is merged; unify the four file pickers in AE-P3; add a manual Firefox cancel check to the acceptance checklist | PR #1 merged; a user report of a stuck picker in Firefox | Open |
| R-096 | Version metadata drift: every manifest says 0.1.0, so the About page of the deployed build shows 0.1.0 after the v0.2 programme (package.json:3; vite.config.ts:14; SettingsPages.tsx:416; inferred from the source, the live page was not fetched); nine or more files must be bumped together | H | L | AE-P2 | D-06; a CI check that all manifests in RELEASE_STRATEGY §3.4 agree (REL-003) | A tag whose manifests disagree with it; About showing a version that is not the tag | **Realised** |
| R-099 | Unfinished or between-phase features reach public users through the live site (main deploys to Pages), for example panels for modules that do not exist or controls that need a classroom host | M | M | AE-P2 | D-02 gating; D-31 hide panels until the module ships; host-dependent UI shown only when a host is configured; "no non-functional controls" checks per module | A merged feature visible on the live site before its phase exit is approved | Open |

### 3.2 Data, storage and migrations

| ID | Risk and evidence | L | I | Owner phase | Mitigation | Trigger | Status |
|---|---|---|---|---|---|---|---|
| R-003 | DB v4 and later migrations run on live users' data; older and cached builds then fail closed with VersionError (kinds.test.ts:269; UpgradeRecovery.tsx:33-34) | M | H | AE-P3 (also AE-P7, AE-P8, AE-P11) | Safety copy before every migration (indexeddb.ts:511-549); upgrade-test matrix from every released DB version in CI (RELEASE_STRATEGY §11.2, D-38); owner approval of each migration; "export a backup before updating" in release notes; PERF-014 | Any SCHEMA_VERSION bump; an upgrade-test failure; a user report of the "newer data" screen | Open |
| R-004 | No down-migrations exist; the first non-additive migration (pictures to attachments under D-08 with DOCUMENT_SCHEMA 4; ownerUserId backfill) is untested territory | M | H | AE-P3 (also AE-P4) | Decide D-07; make non-additive changes in two steps (add the new form, keep reading the old one, remove only after a release); test against exported real v3 data; dry-run the migration on a backup copy before the live store | The first migration that rewrites or removes existing fields | Open |
| R-008 | Sync correctness: device clocks are advisory; integer versions are per device and not globally comparable; purge leaves no tombstone; favourite and trash changes do not move updatedAt (indexeddb.ts:752-762, :826-840) | H | H | AE-P10 (fields in AE-P3) | Tombstones and metaUpdatedAt in DB v4 before any sync work (D-35); base_version plus origin_device_id; server-issued sequence numbers; conflict copies, never last-writer-wins without a copy (ADR-0021, proposed); never compare integer versions across devices | Sync design starts without DB v4 fields; any code that orders items from different devices by version or device time | Open |
| R-012 | The stale SQLite DDL in docs/DATABASE.md:49-125 (no presentations, drafts or item_index tables, no blobRefs, a different attachments model) is reused for native or host storage and diverges from the IndexedDB model | M | M | AE-P3 (also AE-P9, AE-P14) | Mark the DDL stale in AE-P2; regenerate any SQLite schema from the IndexedDB model (ADR-0019, proposed); shared adapter conformance suite (SYS-010) | Native-storage or classroom-host persistence work starts | Open |
| R-024 | Large PDFs exceed backup format 2 (one JSON string with base64 attachments) and memory limits | H | H | AE-P8 (design in AE-P3) | Backup format 3 as a ZIP container with binary entries (ADR-0017, proposed), designed in AE-P3 and implemented before PDF import; maximum PDF size (D-20); OPFS as a candidate for large blobs; memory measurements (PERF-008, PERF-010) | PDF import implemented before format 3; a backup export failing or exhausting memory | Open |
| R-040 | `sizeBytes` is the JSON character count of the content only (indexeddb.ts:298), excluding attachments and versions, so storage overviews built on it mislead users | M | L | AE-P3 (also AE-P11) | Compute real byte sizes including attachments and versions for FIL-FR-018 and DSH-FR-010; label any estimate as an estimate | Storage overview or breakdown work starts | Open |
| R-093 | Rolling back the live web build after a DB version bump strands users who already upgraded: the older build shows the "newer data" screen (UpgradeRecovery.tsx:52-60) and cannot open their data | M | H | AE-P3 (first DB bump; also AE-P16) | Rule: never roll back across a SCHEMA_VERSION bump, fix forward (RELEASE_STRATEGY §10.2); stronger gate for format-changing releases; safety copy export from Settings → Storage as the recovery path | A defect found after a release that bumped the DB version; a request to redeploy an older tag | Open |
| R-097 | Users stay on long-cached PWA builds: updates wait for the user to accept the banner (registerType 'prompt', apps/web/vite.config.ts:24) and the app has no periodic update check of its own (SystemBanners.tsx:35-106 only reacts when the browser finds a new service worker), so fixes reach users late and tabs on different builds can meet a newer database | M | M | AE-P3 | Periodic update check in the shell; cross-tab version-change banner kept and tested; keep the "newer data" screen's offer of a waiting update (UpgradeRecovery.tsx:46-58); release notes state minimum versions | A fix that must reach users quickly; reports of old versions in About | Open |

### 3.3 Modules and compatibility

| ID | Risk and evidence | L | I | Owner phase | Mitigation | Trigger | Status |
|---|---|---|---|---|---|---|---|
| R-009 | On-screen pagination in a ProseMirror editor is a large redesign; today one continuous sheet is drawn (DocumentEditor.tsx:387-392), and pagination affects DOC-FR-041, 042, 044, 045, 046 and 068 | H | M | AE-P4 | D-18 decides whether it is required; time-boxed spike before commitment; keep the print path as the paginated output; regression tests on all affected requirements | D-18 requires on-screen pagination; the spike exceeds its time box | Open |
| R-010 | Track changes, citations and footnotes need DOCUMENT_SCHEMA 4 and a custom OOXML reader, because mammoth reads neither comments nor tracked changes | H | M | AE-P4 | Frozen vocabulary and protected read-only view for schema 4; a scoped OOXML reader with fixtures from real Word files; staged delivery; citations are a scope-cut candidate (D-36) | D-18 includes these features | Open |
| R-011 | Word and LibreOffice compatibility is unproven: Word for Mac checked 2 of 16 DOCX samples (docs/compatibility/phase4-2026-11-14/), no Word for Windows, no LibreOffice, no ODT opened elsewhere, no OOXML or ODF schema validation | H | H | AE-P4 | D-22 access to licensed Word (Mac and Windows) and LibreOffice; dated checks of all samples; schema validation (TD-11); remove any compatibility claim that cannot be evidenced (REL-014) | AE-P4 exit approaching without the checks; a user report of a file that does not open | Open |
| R-013 | TD-38: deterministic table-of-contents bookmarks rely on a private property of docx 9.15.3 (export/docx/index.ts:118-122); a docx upgrade can break them silently | M | L | AE-P4 | Keep docx pinned; a golden test on the bookmark output; upgrade deliberately; replace with a public API or own writer when possible | A docx version change, including a Dependabot pull request | Open |
| R-014 | diagrams.net mapping errors pass every internal test, because the .drawio corpus is hand-written and no file was ever opened in diagrams.net (TD-46; RELEASE_GAPS.md:170); the Quick Connect reference never arrived (RELEASE_GAPS.md:78) | H | M | AE-P5 | D-22: dated diagrams.net check of exports and a corpus of files saved by diagrams.net; owner supplies the Quick Connect reference or accepts current behaviour | AE-P5 starts without diagrams.net access; a user's .drawio file imports wrongly | Open |
| R-015 | Diagram node and edge ids are "n-"/"e-" plus 8 hex characters (32 bits, editor/mutations.ts:13), which can collide when diagrams are merged or co-edited | M | M | AE-P5 (before AE-P10) | Full UUIDs for new ids while still reading old ones; collision check on paste and merge | Diagram co-editing scheduled (D-16); merging content between diagrams | Open |
| R-016 | Layout engines outside licence policy (elkjs, reported EPL-2.0; libavoid-js, reported LGPL-2.1; licences to verify) tempt shortcuts for DGM-FR-067 and DGM-FR-080 | M | M | AE-P5 | D-21; the licence gate rejects them unless an exception is approved; candidates `@dagrejs/dagre` (reported MIT; licence and maintenance to verify) or original code | A proposal to add a layout engine | Open |
| R-017 | PPTX was never opened in PowerPoint or Keynote; native charts and animation timing may be rejected or drawn wrongly (TD-55; docs/compatibility/phase7-2026-11-15) | H | H | AE-P6 | D-22 access; dated checks in PowerPoint, Keynote and LibreOffice; fallbacks (pictures instead of native charts, no timing) if rejected; disclose results | AE-P6 exit approaching; the first real open fails | Open |
| R-018 | PptxGenJS supports one slide master (TD-56), which blocks multiple masters | H | M | AE-P6 | D-19: accept one master, or write a custom master writer in the post-processing step; scope-cut candidate | D-19 requires multiple masters | Open |
| R-022 | The package boundary (tests/integration/boundaries.test.ts) conflicts with reusing document-studio's rich-text stack in the Notebook | M | M | AE-P7 (decision in AE-P3) | D-10: extract `@dcos/rich-text` without behaviour change and update the boundary test, or allow the dependency explicitly | AE-P7 starts without D-10 answered | Open |
| R-023 | pdf-lib's maintenance status is uncertain, and any PDF engine is exposed to malformed or hostile PDFs | M | H | AE-P8 | Dependency review including forks and alternatives (DEPENDENCY_AND_LICENCE_PLAN); parsing in a worker; size caps; a malformed-PDF test corpus; follow the engine's security guidance (to verify) | The review finds the library unmaintained; a published vulnerability in the chosen engine | Open |
| R-030 | OCR language data or fonts fetched from third-party CDNs at run time would break the privacy promise (e2e/privacy.spec.ts) | M | M | AE-P8 (also AE-P4 fonts) | Bundle every runtime asset with the app; extend the privacy e2e to every kind; CSP connect-src restricted to self | Any runtime request to another origin; adding tesseract.js or web fonts | Open |
| R-098 | External compatibility and device checks depend on software, licences and devices the owner must provide (D-22: Word, LibreOffice, PowerPoint, Keynote, diagrams.net, a Windows machine, an Android device); without them the ACs cannot pass and brief §15 "real compatibility evidence" fails | H | H | AE-P4 (also AE-P5, AE-P6, AE-P14, AE-P15) | Ask for D-22 at AE-P1 approval; schedule checks early in each phase; if access is refused, remove the unevidenced claims and disclose them as limitations rather than waive silently | A phase reaches step 5 (Test) without the required application or device | Open |
| R-100 | Exactly pinned, slow-moving dependencies: pptxgenjs 4.0.1 has had no release for about 17 months and its output is post-processed by exact pattern (DEPENDENCIES.md:76); an npm override forces image-size 2.x (package.json:47-49) | M | M | AE-P6 | Keep pins; the post-processing throws if a pattern is missing (tests cover it); periodic review in DEPENDENCY_AND_LICENCE_PLAN; a fallback plan (own writer) if the library is abandoned or vulnerable | A security advisory on pptxgenjs or image-size; a needed feature only in a newer version | Open |

### 3.4 Architecture, design system, quality and performance

| ID | Risk and evidence | L | I | Owner phase | Mitigation | Trigger | Status |
|---|---|---|---|---|---|---|---|
| R-006 | Design-system work multiplies inconsistencies if new modules start before packages/ui is extended (today 14 colour tokens, 51 arbitrary px font sizes, no Tabs, Tooltip, Checkbox, Switch, Popover or DataTable) | H | M | AE-P3 | ADR-0024 tokens and components in AE-P3, before AE-P4 adds screens; review against the design system at gate step 6 | A new screen built with ad hoc styles; the count of arbitrary px sizes rises | Open |
| R-025 | No web CSP on the public site (TD-29); innerHTML sinks rely only on escaping; .drawio import has no size or inflate cap (drawio.ts:280; native.ts:230-242) and ODT has no total repeat cap (TD-39) | M | M | AE-P3 (also AE-P13) | Meta CSP with a hash for the inline theme script (D-23); caps on .drawio size and inflate output and on ODT repeats; imports in workers (TD-40) | A new innerHTML sink or import format; a large or crafted file hanging the tab | Open |
| R-034 | No performance baselines exist (brief §10), so regressions go unseen; only pass/fail diagram time limits exist (tests/integration/large-diagram.test.ts:17-19) | H | M | AE-P3 (also AE-P13) | Measurement harness and baselines for PERF-001 to PERF-014 on reference hardware (D-29); before/after comparison at every phase exit | A phase exits without a PERF comparison | Open |
| R-036 | Accessibility debts are inherited by every new screen: dark danger button 2.77:1, badges 4.0–4.3:1, mobile drawer without Escape, focus trap or dialog role (TD-25), no skip link, no axe, no screen-reader run | H | M | AE-P3 (also AE-P13) | Fix in packages/ui first (D-09); axe in e2e (D-25); keyboard paths per feature; screen-reader passes before the RC | A new screen without accessibility tests; an axe violation on main | Open |

### 3.5 Network, identity and security

| ID | Risk and evidence | L | I | Owner phase | Mitigation | Trigger | Status |
|---|---|---|---|---|---|---|---|
| R-005 | No authentication exists; endpoints added without an auth dependency would be exposed on shared Wi-Fi (CORS allows the Authorization header, backend/api/main.py:25-30; backend/README.md:10 binds 0.0.0.0) | M | H | AE-P9 (also AE-P13) | Deny-by-default authorisation on every router (ADR-0020, proposed); a test that enumerates all routes and fails if any route other than /health is reachable without a session; bind to localhost unless the host is configured for a classroom; security review of the host | A new endpoint is added; the host is started on a LAN address | Open |
| R-007 | Student data exposure through unencrypted backups, a LAN host or logs | M | H | AE-P9 (also AE-P10, AE-P13) | Passphrase-encrypted backups once classroom data exists (D-34); classroom cache handled separately from personal backups; log redaction; TLS on the LAN (D-14); data minimisation and retention on the host | The first store of classroom or student data; backup format 3 design; logging added to the host | Open |
| R-026 | Python version drift (3.9 locally, 3.12 in CI) and unpinned dependencies (TD-32) | H | L | AE-P9 | Pin Python 3.12 (D-37) and lock dependencies with hashes | Backend work starts; a test passes in CI but fails locally or the reverse | Open |
| R-027 | Classroom host setup on school networks: firewalls, certificates and IT policy may block it | H | M | AE-P9 | D-13 and D-14; an administrator guide; a pilot on the owner's own network; native-only LAN as fallback | The first test on a real classroom network | Open |
| R-028 | Secure-context and mixed-content rules block LAN collaboration from the HTTPS web build: it cannot connect to `ws://` LAN addresses, and a page served over plain `http://<LAN-IP>` loses service workers, `crypto.subtle`, `crypto.randomUUID` and Web Locks | H | H | AE-P10 (decision in AE-P9) | ADR-0022 spike early in AE-P10; LAN collaboration first in the native apps; browsers only with an HTTPS host and a trusted certificate (D-14) | The spike result; any design that assumes the Pages build can reach a LAN host over ws:// | Open |
| R-029 | Yjs and y-prosemirror (or the Tiptap collaboration extensions) are unverified against Tiptap 3.33; keeping JSON canonical alongside a Yjs log adds persistence complexity | M | M | AE-P10 | Spike to verify compatibility (candidates, licences to verify); JSON stays the canonical stored form; Yjs state in a separate store for shared items only; documents first (D-16) | A version incompatibility found; a Tiptap upgrade | Open |

### 3.6 Platforms and release

| ID | Risk and evidence | L | I | Owner phase | Mitigation | Trigger | Status |
|---|---|---|---|---|---|---|---|
| R-032 | Native shells are unbuilt: src-tauri/icons/ is empty, there are no lock files, Rust is not installed locally (`which cargo` finds nothing), no native Android project, no Windows machine (TD-30; FEATURE_STATUS.md:245-246). An Android SDK is installed (platforms android-35 and -36, build-tools 36.0.0), but no Java runtime was found (checked 2026-11-15) | H | H | AE-P14 | Owner approval to install toolchains; CI build jobs on macOS, Windows and Linux runners; D-22 devices; consider a CI-only smoke build of both shells before AE-P14 if the owner agrees under D-30 | AE-P14 starts; the first native build fails | Open |
| R-033 | Signing certificates cost money (D-28); unsigned builds trigger Gatekeeper and SmartScreen warnings | M | M | AE-P14 | Decide D-28 by AE-P13 exit; if unsigned, document the warnings and the install steps in the release notes | D-28 unanswered at AE-P13 exit | Open |
| R-039 | WebView differences on Tauri and Android: print, downloads (`<a download>`, TD-28), full screen, BroadcastChannel and presenter mode (TD-58); the service worker would register in webviews (TD-31) | H | M | AE-P14 | SVC-PLAT adapters for save, print and share; platform detection; device tests for every PLT row | The first native build; any feature using these APIs | Open |
| R-094 | Local data loss on native platforms: Android deletes app data on uninstall, and an uninstall is forced by a signing-key change, a switch from an unsigned or debug build to a signed one, or a downgrade; changing the app identifier `org.digitalclassroom.os` (tauri.conf.json:5; capacitor.config.json) would orphan existing data | M | H | AE-P14 (also AE-P16) | Freeze the identifier; one release key for the life of the app; strictly increasing versionCode; never publish debug builds; release notes tell users to export a backup before any reinstall; fix forward instead of downgrading (RELEASE_STRATEGY §10) | A key or identifier change; a request to downgrade on Android; first public native release | Open |
| R-095 | Loss or compromise of signing keys: an Android release key cannot be replaced for sideloaded updates; Apple and Windows certificates expire or can be revoked | L | H | AE-P14 (also AE-P16) | Keys in GitHub encrypted secrets scoped to the release workflow; an offline backup held by the owner; documented renewal dates | A certificate nearing expiry; a suspected leak | Open |

---

### 3.7 Module-specific risks (from the module PRDs)

Each module PRD proposed these risks in its "Known risks" section. The wording is condensed from the PRD; the PRD remains the place for module detail. All are Open. MODULE_01, MODULE_02 and MODULE_05 proposed theirs without numbers (labels M01-a…d, M02-a…d, PDF-RISK-A…D); the numbers below were assigned by this register (§5).

| ID | Risk (source) | L | I | Owner phase | Mitigation | Trigger | Status |
|---|---|---|---|---|---|---|---|
| R-050 | Simple mode fills up as Advanced features are added, losing the "simple" promise (MODULE_01, M01-a) | M | M | AE-P4 | A Simple/Advanced policy (AC-DOC-002b in MODULE_01) agreed before new controls are built | A new M01 control is proposed for Simple mode | Open |
| R-051 | PDF quality depends on the browser: headers, footers and page numbers need Chromium 131+ (export/printSupport.ts:11) and `window.print` is reported not to work in Android WebView (Unverified until AE-P14), so Safari, Firefox and native users get poorer PDFs (MODULE_01, M01-b) | H | M | AE-P4 | D-18 decision on a generated PDF; disclosure in the UI; confirm the Android WebView print behaviour on a device in AE-P14 | D-18 keeps the print dialog; AE-P14 native builds | Open |
| R-052 | Teachers judge the studio by lossy DOCX import of real Word files, even though each loss is reported (MODULE_01, M01-c) | H | M | AE-P4 | A corpus of real Word files; a custom OOXML reader for the most common losses; clear report wording | User feedback on imports; import fidelity ACs failing | Open |
| R-053 | Citation styles are large and detailed; partial support produces bibliographies that markers reject (MODULE_01, M01-d) | M | M | AE-P4 | D-18 limits the styles; fixtures from published style guides; label output "approximate" until verified | D-18 includes citations | Open |
| R-054 | The dead html-to-image export (TD-42) stays public (diagram-studio index.ts:6), so a host could produce foreignObject SVG and raster PDF again (MODULE_02, M02-a) | L | M | AE-P5 | Remove under D-27 | D-27 not approved; a new caller of the old API | Open |
| R-055 | Diagram PDFs drop labels outside WinAnsi (TD-45), which matters for multilingual classrooms (MODULE_02, M02-b) | H | M | AE-P5 | An embedded open font (candidate, licence to verify) | Non-Latin labels in a test corpus or user report | Open |
| R-056 | Adding diagram pages changes how embeds reference diagrams; documents and slides could show the wrong page after "update from source" (MODULE_02, M02-c) | M | M | AE-P5 | A page id in embeds; interface AC in MODULE_02 | DGM-FR-085 implementation starts | Open |
| R-057 | Diagram touch interactions are automated only in mobile Chromium; real iPad and Android behaviour may differ (MODULE_02, M02-d) | M | M | AE-P5 (also AE-P14) | Dated device checks in AE-P14 | AE-P14 device testing | Open |
| R-060 | Group geometry (rotation inside rotated groups, resizing mixed content) is harder than it looks and can corrupt layout on export (MODULE_03) | M | M | AE-P6 | A pure geometry module with property-style unit tests; PPTX group transforms checked in PowerPoint | PRS-FR-029 implementation starts | Open |
| R-061 | Font embedding makes the PDF export chunk and the PWA precache much larger (precache limit 6 MiB per file, apps/web/vite.config.ts:40) (MODULE_03) | M | M | AE-P6 | Subset fonts per script; load on demand; measure (PERF-002) | Embedded fonts added (D-19) | Open |
| R-062 | No access to PowerPoint or Keynote (PowerPoint not installed; Keynote did not respond on 2026-11-15) leaves PRS-FR-062 unmeetable (MODULE_03) | H | H | AE-P6 | D-22; LibreOffice as a minimum; disclose any waiver | AE-P6 step 5 without access | Open |
| R-063 | Notebook pictures inherit TD-2 (inline data URLs) if D-08 is not approved, bloating every save, version and backup (MODULE_04) | H | M | AE-P7 | Decide D-08 before AE-P7, or an attachment-backed image node within the shared vocabulary | AE-P7 starts with D-08 unanswered or refused | Open |
| R-064 | One-record notebooks (ADR-0025, proposed) make autosave, versions and conflicts scale with notebook size (MODULE_04) | M | H | AE-P7 | Measure early; keep a per-page store alternative open in the ADR | Large-notebook measurements exceed PERF targets | Open |
| R-065 | Pen and touch behaviour (pressure, palm rejection, scrolling) differs across browsers and webviews; automated tests cover mobile Chromium only (MODULE_04) | H | M | AE-P7 (also AE-P14) | Dated manual device checks; fallback to drawing without pressure | Ink layer implementation; AE-P14 devices | Open |
| R-066 | Changes to the shared rich-text vocabulary in AE-P4 (DOCUMENT_SCHEMA 4) silently change notebook pages (MODULE_04) | M | M | AE-P7 | A page vocabulary schema field and shared golden tests across both consumers | Any change to the shared vocabulary | Open |
| R-070 | CRDT merge keeps every character but loses intent (edits inside deleted text, concurrent list restructuring), which users may read as "my work was overwritten" (MODULE_07) | M | M | AE-P10 | Pre-merge snapshots; contributor-labelled history; a review notice after long offline periods (D-52) | Merge after a long offline period; user report | Open |
| R-071 | A client with an older schema silently drops unknown nodes when it edits a shared document (MODULE_07) | M | H | AE-P10 | A schema handshake that forces read-only on older clients | Mixed client versions in one share | Open |
| R-072 | Two persistence paths (CRDT state and canonical JSON) diverge, so exports, backups or history differ from the live editor (MODULE_07) | M | H | AE-P10 | Canonical JSON derived from the CRDT on every persist and validated | Divergence detected in tests or by users | Open |
| R-073 | A separate `y-indexeddb` database or relay update log falls outside safety copies, backups and the upgrade test (MODULE_07) | M | M | AE-P10 | Keep CRDT state inside the main database unless the spike proves otherwise; include it in the upgrade test | Spike chooses a separate store | Open |
| R-074 | Document mode, local preferences or undo history leak into shared state (mode is stored in the document today, document-studio types.ts:32) (MODULE_07) | M | L | AE-P10 | Separate per-user state from synced state in the CRDT mapping | Shared-document mapping design | Open |
| R-075 | The relay choice adds a second runtime (Node) to a Python host, raising setup and security burden on teacher machines (MODULE_07) | M | M | AE-P10 | Prefer a Python relay if the spike shows it supports per-update authorisation | Spike recommends a Node relay | Open |
| R-076 | Pruning or purging a submitted version locally makes the student's receipt point at nothing; a teacher later disputes what was submitted (MODULE_06, its provisional R-060) | M | M | AE-P9 | A protected 'submitted' version reason; the host keeps the authoritative snapshot; receipt digests | Version pruning or purge of a submitted item | Open |
| R-077 | Deadline disputes from queued offline submissions and wrong device clocks (MODULE_06, provisional R-061) | M | M | AE-P9 | D-45; host time by default; visible queued state | First assignment with a deadline | Open |
| R-078 | A teacher's build older than a student's content schema cannot render a submission (MODULE_06, provisional R-062) | M | M | AE-P9 | Existing protected view with original download; host reports schema versions; release notes | Mixed client versions in a classroom | Open |
| R-079 | Loss of the host database or blob store on a single teacher machine loses grades and submissions (MODULE_06, provisional R-063) | M | H | AE-P9 | Host backup and restore; export; a documented backup routine | First real classroom use; host disk failure | Open |
| R-080 | Classroom features bloat or leak into the personal-use experience (network requests, UI clutter) (MODULE_06, provisional R-064) | M | M | AE-P9 | The privacy e2e as a gate; D-31 | Any network request without a configured host | Open |
| R-081 | Folder trash semantics confuse users (an item trashed alone versus with its folder) (MODULE_08) | M | M | AE-P11 (design in AE-P3) | Record what was trashed with what; restore message names what came back; e2e for both paths | Folder trash implementation | Open |
| R-082 | The organisation model chosen under D-11 changes after AE-P3 ships DB v4 (MODULE_08) | M | H | AE-P3 | Decide D-11 before AE-P3 exit; keep `folderId` and `tagIds` additive so a later "multiple parents" option is another additive migration | D-11 reopened after AE-P3 | Open |
| R-083 | Preview generation slows the list on low-end devices or for large items (MODULE_08) | M | M | AE-P11 | Lazy, cached, off-main-thread rendering; size caps; icon fallback | PERF measurements of the file list | Open |
| R-084 | Drag-and-drop from the operating system behaves differently in Tauri and Android webviews (MODULE_08) | H | M | AE-P11 (also AE-P14) | Keyboard and menu alternatives always present; SVC-PLAT adapters; device tests | AE-P14 builds | Open |
| R-085 | Renaming the UI string "Favorites" to "Favourites" breaks e2e selectors and user habit (MODULE_08) | L | L | AE-P11 | D-42; change strings and tests together | D-42 approves the change | Open |
| R-086 | No generic "file" kind, although the brief lists "Files" in search and "Import" in File Manager (MODULE_08) | M | M | AE-P11 | D-43; default out of scope for v1.0.0, disclosed as a limitation | D-43 answered | Open |
| R-087 | The search index grows too large or slows saves on low-end devices and large libraries (MODULE_09) | M | M | AE-P12 (also AE-P7, first indexer) | Worker indexing; chunked records; measured against PERF-005, PERF-008, PERF-011; title-only fallback | Index size or save latency over target | Open |
| R-088 | The index drifts from the data (missed events across tabs, crash mid-update) and returns stale or missing results (MODULE_09) | M | M | AE-P12 (also AE-P7) | Version-keyed entries; Web Lock for writers; a completeness flag; "Rebuild index"; rebuild after restore | Search result mismatch in tests or reports | Open |
| R-089 | Search snippets render user content as HTML (XSS in the user's own tab or from imported files) (MODULE_09) | L | H | AE-P12 (also AE-P13) | Text-only snippets with highlight ranges; a unit test with markup in content; web CSP (R-025) | Snippet rendering implemented | Open |
| R-090 | "Premium design" (DSH-UX-040) cannot be accepted objectively (MODULE_09) | H | L | AE-P12 | An owner-approved, dated design review as the acceptance evidence | AE-P12 acceptance | Open |
| R-091 | Dashboard customisation adds complexity before the core panels are stable (MODULE_09) | M | L | AE-P12 | Fixed default layout first, customisation last; reset always available | Customisation work starts before core panels pass | Open |
| R-092 | Ctrl/Cmd+K conflicts with an editor or browser shortcut (for example the Tiptap link shortcut) (MODULE_09) | M | L | AE-P12 | Palette shortcut ignored inside editor text; listed and tested per editor | App-level shortcut implementation | Open |
| R-101 | Page operations invalidate digital signatures and can drop PDF features the write library does not understand (layers, JavaScript, embedded files, some annotations) (MODULE_05, PDF-RISK-A) | M | M | AE-P8 | Warn before the operation; the original is always kept (PDF-FR-018); report dropped features after each operation | First page operation on a signed or feature-rich PDF | Open |
| R-102 | pdf.js and the write library disagree about a damaged file, so a page operation succeeds but the result renders differently (MODULE_05, PDF-RISK-B) | M | M | AE-P8 | After every write, re-open the output with the renderer and compare page count and a render hash before committing the version | A malformed-PDF corpus case that renders differently after a write | Open |
| R-103 | The pdf.js worker, CMaps and font data enlarge the precache past the per-file limit (6 MiB, apps/web/vite.config.ts:40) or slow the first load (PERF-002) (MODULE_05, PDF-RISK-C) | M | M | AE-P8 | Lazy chunks; measure; precache only on first PDF use if needed | The PDF engine is added to the build | Open |
| R-104 | A real-world PDF test corpus may contain copyrighted or personal material that cannot be committed to the public repository (MODULE_05, PDF-RISK-D) | H | M | AE-P8 | Build the committed corpus from self-made or openly licensed files; keep any private sample outside the repository with a dated note | Building the AE-P8 test corpus | Open |

## 4. Review procedure

- **Every phase, gate step 1 (Audit):** re-rate the risks the phase owns or re-checks; add new risks from R-105 onwards; never renumber.
- **Every phase, gate step 9 (Report):** list risks whose status changed, with evidence; a risk moves to Closed only with evidence (a test, a commit, a dated record).
- **Escalation:** any risk rated 9 (H × H) that is Open or Realised at a phase exit is named in the phase report with its next action and owner decision, if any.
- **Release:** at AE-P15, every Realised risk must be Closed or disclosed in the known limitations; no Critical defect (RELEASE_STRATEGY §6.2) may remain.

## 5. Number allocation and reconciliation

The canonical planning brief let every writer append risks "from R-050 onwards", so several AE-P1 documents proposed overlapping numbers. This register is the owner of R-NNN and fixes them as follows:

| Block | Use | Source |
|---|---|---|
| R-001 to R-040 | Audit risks | Canonical planning brief §10 |
| R-041 to R-049 | Unused | — |
| R-050 to R-053 | M01 risks. MODULE_01 §12 proposed them without numbers (M01-a…M01-d); numbered here in that order | MODULE_01 §12 |
| R-054 to R-057 | M02 risks. MODULE_02 §12 proposed them without numbers (M02-a…M02-d); numbered here in that order | MODULE_02 §12 |
| R-058, R-059 | Unused | — |
| R-060 to R-062 | M03 risks, numbers as proposed | MODULE_03 §12 |
| R-063 to R-066 | M04 risks, numbers as proposed | MODULE_04 §12 |
| R-067 to R-069 | Unused | — |
| R-070 to R-075 | M07 risks, numbers as proposed | MODULE_07 §12 |
| R-076 to R-080 | M06 risks. MODULE_06's draft used R-060 to R-064, which collided with M03 and M04; registered here as R-076…R-080 in the same order. MODULE_06 has since been renumbered (MODULE_06_CLASSROOM_HUB_PRD.md:609-617) | MODULE_06 §12 |
| R-081 to R-086 | M08 risks (MODULE_08 asked this register to assign numbers), in the order listed there | MODULE_08 §12.2 |
| R-087 to R-092 | M09 risks (MODULE_09 asked this register to assign numbers), in the order listed there | MODULE_09 §12.2 |
| R-093 to R-100 | Release and platform risks | RELEASE_STRATEGY §14 |
| R-101 to R-104 | M05 risks. MODULE_05 §12 proposed them as placeholders PDF-RISK-A…D; numbered here in that order | MODULE_05 §12 |
| R-105 onwards | New risks | Any later document or phase |

MODULE_01 and MODULE_02 stated in their drafts that this register "already uses R-050…R-057 for other risks" (MODULE_01_DOCUMENT_STUDIO_PRD.md:573), and four documents use R-052, R-054, R-055 and R-057 with meanings that match R-095, R-097, R-098 and R-100 here, apparently from an earlier draft numbering of the release risks. Those numbers now mean M01 and M02 risks. All the references below were corrected at the AE-P1 consolidation (2026-11-15); the line numbers are those of the drafts and are kept only as a record:

| Document and line | Uses | Meaning there | Correct ID |
|---|---|---|---|
| MODULE_01_DOCUMENT_STUDIO_PRD.md:570; MODULE_02_DIAGRAM_STUDIO_PRD.md:520; SECURITY_AND_PRIVACY_PLAN.md:377, :398 | R-054 | Users stay on long-cached PWA builds | R-097 |
| MODULE_01_DOCUMENT_STUDIO_PRD.md:571; MODULE_02_DIAGRAM_STUDIO_PRD.md:521 | R-055 | External checks depend on software and devices the owner must provide | R-098 |
| SECURITY_AND_PRIVACY_PLAN.md:379 | R-052 | Leaked or lost signing key | R-095 |
| DEPENDENCY_AND_LICENCE_PLAN.md:58, :392 | R-057 | Exactly pinned, slow-moving dependencies (pptxgenjs, image-size) | R-100 |
| MODULE_01_DOCUMENT_STUDIO_PRD.md:573; MODULE_02_DIAGRAM_STUDIO_PRD.md:523 | "no ID yet"; "new risks start at R-058" | Their module risks M01-a…d and M02-a…d | R-050…R-053 and R-054…R-057 |
| MODULE_05_PDF_STUDIO_PRD.md:432-439 | PDF-RISK-A…D ("R-101+ to assign") | MODULE_05 risks | R-101…R-104 |

ACCEPTANCE_CRITERIA.md did not exist when this register was checked (2026-11-15); it proposes no new risk. Eight plan-specific risks are proposed without numbers and without ratings: four in DEPENDENCY_AND_LICENCE_PLAN §10 (licence drift on upgrade, SBOM tooling gaps, exact pins blocking security patches, OCR "AI" ambiguity) and four in SECURITY_AND_PRIVACY_PLAN §11 (certificate setup burden, passphrase loss, unreviewed legal requirements, meta-CSP limits on Pages). They are not yet in this register; they are to be rated and numbered from R-105 at the AE-P2 gate step 1 (Audit). Any later risk also takes the next number from R-105.

## Google Drive integration risks

R-113 to R-127 belong to the optional Google Drive integration and are defined, with likelihood, impact and mitigation, in [GOOGLE_DRIVE_INTEGRATION_PLAN.md](GOOGLE_DRIVE_INTEGRATION_PLAN.md) §10.1. R-105 to R-112 stay reserved for the eight queued plan risks above.
