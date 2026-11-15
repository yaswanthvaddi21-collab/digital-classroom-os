# Release strategy

This document defines how Digital Classroom OS moves from its current state (every manifest at 0.1.0, one baseline tag, an ungated GitHub Pages deploy and a CI that has never been green on main) to a reproducible, owner-approved v1.0.0 release on the web, macOS, Windows and Android. It covers versioning, branches and tags, the release-candidate process, the release checklist mapped to brief §15, artifact reproducibility, platform release channels, signing, rollback, data safety on upgrade and the owner's approval points. It owns the REL (release, git, versioning) and PLT (platform) requirement prefixes.

**Status: AE-P1 draft for owner approval (2026-11-15)**

Related documents in this folder:
[Product roadmap](ADVANCED_EDITION_PRODUCT_ROADMAP.md) (phases AE-P1 to AE-P16, owner decisions D-NN) ·
[Acceptance criteria](ACCEPTANCE_CRITERIA.md) (canonical AC wording, including AC-REL and AC-PLT) ·
[Risk register](RISK_REGISTER.md) ·
[Security and privacy plan](SECURITY_AND_PRIVACY_PLAN.md) ·
[Dependency and licence plan](DEPENDENCY_AND_LICENCE_PLAN.md) (SBOM) ·
[Database and sync architecture](DATABASE_AND_SYNC_ARCHITECTURE.md) (migrations, backup format 3) ·
[System architecture](SYSTEM_ARCHITECTURE.md) (SVC-PLAT, PERF targets)

Everything below is **proposed** until the owner approves it. Decisions are referenced by D-NN and are not taken here.

---

## 1. Current release state (audited 2026-11-15)

| Item | State | Evidence |
|---|---|---|
| Manifest versions | 0.1.0 in root package.json:3, apps/web, apps/desktop, apps/android, every packages/* manifest, apps/desktop/src-tauri/tauri.conf.json:4, Cargo.toml:3 and backend/api/main.py:15 (`API_VERSION`) | grep; git show HEAD |
| Version shown to users | Settings → About shows `__APP_VERSION__`, taken from the root package.json (apps/web/vite.config.ts:14; SettingsPages.tsx:416), so the deployed build of edc2672 shows 0.1.0 (inferred from the source; the live page was not fetched in AE-P1) | vite.config.ts:14 |
| Tags | `v0.1.0-baseline` only (annotated, → 20d3f4d), local only: it was never pushed (`git ls-remote --tags origin` lists no tags). No v0.2.0 tag, no RC tag | git tag -l; git ls-remote |
| GitHub releases | None | gh release list |
| Branches | main, advanced/phase1-audit, ci/browser-test-fixes; no release branch | git branch -a |
| Commit identity | All 15 commits use the placeholder `Digital Classroom OS <noreply@anthropic.com>` (TD-34); commits are unsigned | git log |
| Web deploy | .github/workflows/pages.yml publishes apps/web/dist on every push to main and on manual dispatch (pages.yml:6-9); not gated on CI; edc2672 deployed by run 43676035951 (2026-11-15T04:16Z). The `github-pages` environment accepts deployments from the branch `main` only (one custom deployment-branch policy, type branch). The live page was not fetched in AE-P1 | gh run list; gh api …/environments/github-pages/deployment-branch-policies (2026-11-15) |
| CI | web and backend jobs pass; the e2e job failed on main for 468ab89 (run 43669491390) and edc2672 (run 43676035968). main has never been green | gh run list |
| PR #1 | `ci/browser-test-fixes` (2731876, 4983af4): open, mergeable, test-only (54 files). Run 43709861278 failed (494 passed, 2 failed, 1 flaky); run 43719093806 on 4983af4, in progress at audit time, completed with success at 2026-11-15T13:48Z (web, e2e on all four Playwright projects: 497 passed, 44 skipped, 0 failed; backend). Main itself has never been green | gh pr view 1; gh run view |
| Repository | PUBLIC (owner's choice, not yet recorded, D-01); `main` not protected; Dependabot security updates off; secret scanning and push protection on | gh |
| Desktop (Tauri 2) | Configuration only, never built. Bundle targets dmg, app, nsis, msi (tauri.conf.json:22); icons listed (:23) but src-tauri/icons/ is empty; no Cargo.lock (TD-30); no signing configuration | ls; FEATURE_STATUS.md:245 |
| Android (Capacitor 7) | Configuration only (apps/android/capacitor.config.json); no native project (apps/android/android absent and git-ignored) | ls |
| Reproducibility | Web only, via package-lock.json and `npm ci` in pages.yml. Python dependencies are unpinned ranges (TD-32); Rust crates unlocked (TD-30); actions pinned to tags, not SHAs (TD-33) | — |
| SBOM and checksums | None | grep |
| Repository backups | Bundles and tarballs before v0.2 Phases 2–7 in backups/ (git-ignored, this machine only); the newest bundle heads main=650cf63; none after edc2672 | git bundle list-heads; ls -A backups (2026-11-15) |
| Documented release flow | docs/GIT_WORKFLOW.md §8 describes a v0.2.0 flow (release branch, bump, verify, rc tag, checksums, approval, tag) that has never been run; §1 and §5–§7 are stale (R-019) | GIT_WORKFLOW.md:5-16, :66-101 (§5–§7), :102-111 (§8) |

## 2. Principles

1. **The owner publishes.** No push, tag, deploy or release happens without the owner's approval (brief §14, §15). While main deploys to the live site, a push to main is a publication.
2. **Release candidate first.** The stable release is the same commit as an approved RC, re-tagged (brief §15).
3. **Automated tests are necessary, not sufficient.** Every release also needs the manual acceptance checklist, dated external-application checks and real-device checks (brief §15).
4. **Data safety outranks schedule.** A known data-loss bug blocks a release without exception. A migration ships only behind a safety copy, with an upgrade test from every earlier released database version.
5. **Reproducible from the tag.** Every artifact is built by CI from a tagged commit with locked dependencies, and is published with SHA-256 checksums and an SBOM.
6. **Honest limitations.** Every waived AC and known incompatibility is listed in the release's known-limitations section.

## 3. Versioning

### 3.1 Scheme

- Semantic Versioning 2.0.0 for the application version: `MAJOR.MINOR.PATCH`, with pre-release identifiers `-rc.N`.
- Before 1.0.0, a MINOR increment marks a completed AE phase; a PATCH increment is a fix release between phases.
- One version number for the whole product. Every manifest listed in §3.4 carries the same number (REL-003).
- Git tags are annotated and named `v<version>` (for example `v0.3.0`, `v1.0.0-rc.1`, `v1.0.0`). `v0.1.0-baseline` keeps its name.

### 3.2 Closing the v0.2 programme (D-06 (a))

The v0.2 programme ended at edc2672 without a tag, and the About page still shows 0.1.0. D-06 (a) proposes tagging `v0.2.0` and bumping the manifests in AE-P2. Two ways to do it, for the owner to choose under D-06:

| Option | What is tagged | For | Against |
|---|---|---|---|
| (a1) Historical tag | `v0.2.0` on edc2672 as it is | Marks exactly what the v0.2 programme delivered | CI was red on that commit (run 43676035968); its manifests say 0.1.0, so the tag and the About page disagree |
| (a2) Baseline tag (proposed) | The AE-P2 exit commit: PR #1 merged, CI green including Firefox, manifests bumped to 0.2.0, stale docs corrected | The tagged build is green, says 0.2.0, and is the starting point for AE-P3 | The tag includes AE-P2 changes (tests, docs, CI), not only v0.2 work |

### 3.3 Phase-to-version mapping (D-06 (b))

D-06 (b) as written ("0.3.x … 0.9.x per AE phase") gives seven minor numbers for the twelve phases AE-P3 to AE-P14. The owner needs to pick one of these (or another) under D-06:

| Phase | Option B1: one minor per phase (proposed; SemVer allows 0.10.0 and above) | Option B2: stay within 0.9.x |
|---|---|---|
| AE-P2 | 0.2.0 | 0.2.0 |
| AE-P3 | 0.3.0 | 0.3.0 |
| AE-P4 | 0.4.0 | 0.4.0 |
| AE-P5 | 0.5.0 | 0.5.0 |
| AE-P6 | 0.6.0 | 0.6.0 |
| AE-P7 | 0.7.0 | 0.7.0 |
| AE-P8 | 0.8.0 | 0.8.0 |
| AE-P9 | 0.9.0 | 0.9.0 (M06) |
| AE-P10 | 0.10.0 | 0.9.0 continued (no tag) |
| AE-P11 | 0.11.0 | 0.9.0 continued (no tag) |
| AE-P12 | 0.12.0 | 0.9.0 continued (no tag) |
| AE-P13 | 0.13.0 | 0.9.0 continued (no tag) |
| AE-P14 | 0.14.0 | 0.9.0 continued (no tag) |
| AE-P15 | 1.0.0-rc.1, rc.2, … | 1.0.0-rc.1, rc.2, … |
| AE-P16 | 1.0.0 | 1.0.0 |

Option B2 leaves five phases without a tag to roll back to; B1 gives every approved phase a tag. A phase that does not change user-visible behaviour (for example AE-P13 if it only adds tests) still gets its tag under B1, so that every phase exit is a reproducible point.

### 3.4 Manifests that carry the version

| File | Field | Read by |
|---|---|---|
| package.json:3 | `version` | `__APP_VERSION__` (vite.config.ts:14), shown in About (SettingsPages.tsx:416) |
| apps/web/package.json:3 | `version` | — |
| packages/{ui,local-storage,document-studio,diagram-studio,presentation-studio}/package.json | `version` | — |
| apps/desktop/package.json:3 | `version` | — |
| apps/desktop/src-tauri/tauri.conf.json:4 | `version` | Installer and app metadata (macOS bundle version, Windows installer version) |
| apps/desktop/src-tauri/Cargo.toml:3 | `version` | Rust crate |
| apps/android/package.json:3 | `version` | — |
| Android native project (to be generated in AE-P14) | `versionName`, and a strictly increasing integer `versionCode` | Android installer; a lower `versionCode` cannot be installed over a higher one |
| backend/api/main.py:15 | `API_VERSION` | GET /health and GET /api/v1/info |

Proposed (REL-003): a small read-only script, run in CI, that fails when these values differ. New stub packages that become workspaces (notebook, pdf-studio, classroom, assignments, sync-engine) join the list.

### 3.5 Format versions are independent of the app version

The app version never stands in for a data-format version. Each format has its own number, and release notes state every change to any of them.

| Format | Today | Defined at | Planned changes |
|---|---|---|---|
| IndexedDB `SCHEMA_VERSION` | 3 | packages/local-storage/src/indexeddb.ts:46 | v4 in AE-P3 (metadata, folders, tags, tombstones, activity); new versions for the notebook (AE-P7) and pdf (AE-P8) kinds, numbers assigned at implementation (ADR-0015, proposed) |
| Backup format | 2 | backup.ts:6 | 3 (ZIP container) designed in AE-P3, needed by AE-P8 (ADR-0017, proposed). Every build must import every earlier format |
| DOCUMENT_SCHEMA | 3 | document-studio migrate.ts:13 | 4 for pictures as attachments (D-08), footnotes, tracked changes, citations (AE-P4) |
| DIAGRAM_SCHEMA | 3 | diagram-studio types.ts:221 | 4 for pages, components, styles (AE-P5, D-21) |
| PRESENTATION_SCHEMA | 1 | presentation-studio types.ts:16 | 2 for grouping, per-object hide, timeline and exit/emphasis effects (AE-P6, D-19). Cell merge needs no schema change: `colSpan`, `rowSpan` and `merged` are already in the schema-1 vocabulary (MODULE_03, Current state) |
| .dcosdiagram native file | format version 1 | diagram-studio native.ts:20-26 | — |
| Backend API | `API_VERSION` 0.1.0 | backend/api/main.py:15 | Follows the app version; a separate protocol version for classroom-host sync is proposed in DATABASE_AND_SYNC_ARCHITECTURE |

## 4. Branches, tags and commits

| Item | Proposal |
|---|---|
| main | Always releasable and green (all CI jobs, including Firefox). Protected (D-05): changes by pull request only, required checks web, e2e and backend, no force-push, no deletion |
| Phase branches | `advanced/ae-pN-<topic>` from main; merged by pull request after the phase's review step; the owner approves the merge |
| Release branch | `release/v1.0` cut from main at the start of AE-P15; only fixes land on it; fixes are also merged back to main |
| Fix releases between phases | `fix/<topic>` branch, PATCH version, same gate as a phase exit but limited to the fix's ACs and a full regression run |
| Tags | Annotated. Created only on a commit whose CI run is green and only with owner approval. Signed tags are optional and need the owner's own signing key (proposal, not required) |
| Commit identity | A real author name and email for every new commit (D-04). The placeholder history stays unless the owner decides otherwise; rewriting needs a force-push to a public repository (R-031) |
| Commit content | Descriptive messages; data-format changes (DB version, content schema, backup format) named explicitly in the message (GIT_WORKFLOW.md §4 practice) |
| Forbidden | Force-push or reset of main, or pushing without approval (brief §14); credentials or student data in any commit (.gitignore covers .env*, *.pem, *.key, *.p12, *.keystore, *.jks; secret scanning with push protection is on) |
| Repository backups | Before each phase: `git bundle create` of all refs, `git bundle verify`, a source tarball, and an off-machine copy (R-037). backups/README.md updated each time |

## 5. Release candidate process

Applies to `v1.0.0-rc.N` in AE-P15. Phase-exit tags (0.x.0) use steps 1–5 and 8–10 only.

1. **Freeze.** All AE-P1 to AE-P14 phases approved. Cut `release/v1.0` from a green main. Only fixes for release blockers land from here on.
2. **Bump.** Set every manifest in §3.4 to `1.0.0-rc.N`; the Android `versionCode` increases. The consistency check (REL-003) passes.
3. **Verify automatically.** CI on the release commit: typecheck, unit tests with enforced coverage floors (D-38), integration tests, Playwright on Chromium, Firefox, WebKit and mobile Chromium, the upgrade test from every released database version (§11.2), backend tests, licence gate, dependency audit (npm, Python, Rust), lint. All green.
4. **Build.** CI builds every artifact from the tag (§7): web bundle, macOS .dmg/.app, Windows .msi and NSIS installer, Android APK (and AAB if D-40 chooses a store). Signed per D-28.
5. **Checksums and SBOM.** SHA-256 for every artifact; SBOM in the format chosen under D-26; reproducibility check (§7.3).
6. **Verify manually.** The rebuilt manual acceptance checklist (tests/acceptance/CHECKLIST.md successor) on every platform in §8.1; dated external-application checks for every import/export claim; screen-reader passes (VoiceOver, NVDA, TalkBack, A11Y); performance run against the AE-P3 baselines (PERF-001 to PERF-014).
7. **Triage.** Every defect gets a severity (§6.2). Any open Critical or High defect, or any known data-loss defect, means a new RC after the fix (back to step 2 with N+1).
8. **Document.** Release notes, known limitations (every waived AC and every unverified compatibility claim), upgrade notes (data-format changes, "export a backup before updating"), checksums.
9. **Report.** A release-candidate report: checklist results (§6.1) with evidence links.
10. **Approve.** The owner approves the RC tag and, separately, its distribution to testers (where the web RC is served is D-41).

An RC is never deployed to the live Pages site unless the owner chooses D-41 (c), because its migrations would reach every visitor (R-002, R-093).

**Stable (AE-P16):** after the owner's explicit approval of a specific RC, tag `v1.0.0` on **the same commit** with the manifests' version changed to `1.0.0` only (a version-only commit is the one permitted difference; its CI run must also be green and its artifacts rebuilt and re-checksummed). Publish the GitHub release with artifacts, checksums, SBOM, release notes and known limitations; deploy the web build of that tag; keep the rollback plan (§10) ready.

## 6. Release checklist

### 6.1 Brief §15 items

Each line must pass for v1.0.0. "First measured" is the phase where the item first becomes a gate; AE-P15 re-runs all of them.

| # | Brief §15 item | Release requirement | How it is verified | Evidence kept | First measured |
|---|---|---|---|---|---|
| 1 | All nine modules are functional | REL-010: every AC-DOC, AC-DGM, AC-PRS, AC-NBK, AC-PDF, AC-CLS, AC-COL, AC-FIL, AC-DSH passes or is waived by the owner and disclosed | AC results table per module | RC report; phase reports | AE-P4 to AE-P12 |
| 2 | Cross-module workflows work | REL-011: AC-INT-01 to AC-INT-09 pass end to end | e2e across modules on the production build; manual checklist | RC report | AE-P12 |
| 3 | No known critical or high-severity bugs | REL-012: zero open Critical or High defects (§6.2) | Issue triage at RC freeze | Triage list in the RC report | AE-P13 |
| 4 | No known data-loss bugs | REL-013: zero open defects that lose, corrupt or silently overwrite user data, in any severity | Triage; upgrade, backup and conflict tests | RC report | Every phase |
| 5 | Import/export has real compatibility evidence | REL-014: every format the UI offers has a dated record of a check in an independent application (Word on Mac and Windows, LibreOffice, Pages, PowerPoint, Keynote, diagrams.net, an independent PDF reader), or the claim is removed from the UI and docs | External checks; docs/compatibility/<phase>-<date>/ folders | Compatibility records | AE-P4, AE-P5, AE-P6, AE-P8 |
| 6 | Offline workflows work | REL-015: offline e2e for every content kind in Chromium, Firefox and WebKit, plus a manual offline check on each native platform | e2e; manual | RC report | AE-P3 onwards per kind |
| 7 | Backup and restore work | REL-016: backup and restore of every kind and every store (format 3 and import of format 2) in every browser project; restore into an empty profile on another platform | e2e/backup-restore successor; manual cross-platform restore | RC report | AE-P3, AE-P8 |
| 8 | Security review passes | REL-017: AC-SEC pass; no open Critical or High security finding; classroom host reviewed | AE-P13 review report | Security review report | AE-P9, AE-P13 |
| 9 | Supported platform builds have been tested | REL-018: AC-PLT pass for PLT-001 to PLT-008 as approved under D-30, on real machines and devices, with dated records | Device test runs | Platform test records | AE-P14 |
| 10 | Documentation is complete | REL-019: user guide, admin guide for the classroom host, architecture and ADRs, data-format docs, security reporting channel, release notes; no stale statement of the kind listed in ROADMAP §3.3 | Documentation review | Review checklist | AE-P2 onwards |
| 11 | Known limitations are disclosed | REL-020: a known-limitations section in the release notes listing every waived AC, every unverified compatibility claim, every platform limit | Review | Release notes | AE-P15 |
| 12 | Release artifacts are reproducible | REL-021: §7 satisfied; a second CI build of the tag gives the same web bundle hashes; native rebuild differences explained | Reproducibility job | Checksums, build logs | AE-P14, AE-P15 |
| — | Release candidate first | REL-022: v1.0.0 is the same commit as an approved RC plus a version-only change (§5) | git | Tags | AE-P15 |
| — | Stable only after explicit approval | REL-023: the owner's dated approval is recorded before the v1.0.0 tag and publication | Owner record | Release record | AE-P16 |
| — | Automated tests alone are not sufficient | REL-024: the manual acceptance checklist was run on the RC, on every supported platform, with dates | Checklist | Checklist file | AE-P15 |

### 6.2 Severity definitions (proposed)

| Severity | Meaning | Release rule |
|---|---|---|
| Critical | Data loss or corruption; silent overwrite; exposure of another person's data (student data, private items); the app cannot start or open existing data; a security flaw exploitable on the classroom network | Blocks any release, including phase tags |
| High | A core workflow of a module is broken with no reasonable workaround; an export the UI offers produces a file the target application cannot open; an accessibility blocker on a core path; a migration that fails without a working recovery path | Blocks the RC and stable release |
| Medium | A workflow works with a workaround; a cosmetic or fidelity loss that is reported to the user | Allowed if disclosed in known limitations |
| Low | Minor polish | Allowed |

A data-loss defect is Critical regardless of how unlikely it is (REL-013).

### 6.3 Phase-exit tags

Each phase exit (0.x.0) needs: CI green on the tagged commit; the phase's ACs passed or waived; the upgrade test from every earlier released database version if the phase changed a data format; a repository backup; release notes for the phase; owner approval. Phase tags get a GitHub release only if the owner wants one; they always get checksums of the web build.

## 7. Artifact reproducibility

### 7.1 Inputs that must be locked

| Input | Today | Required by AE-P15 | Phase |
|---|---|---|---|
| npm dependencies (workspaces) | package-lock.json (lockfileVersion 3); `npm ci` in pages.yml and ci.yml | Unchanged; one `overrides` entry today (image-size, package.json:47-49) recorded with its reason | — |
| npm dependencies of the shells | apps/desktop and apps/android are outside the workspaces and the lockfile (TD-30) | In a lockfile, and in the licence gate and audit | AE-P14 |
| Node.js | `engines: node >=20` (package.json:44-46); CI uses Node 22; local v22.23.4 | One exact Node version for release builds, recorded in the repo (for example `.nvmrc`) and used by CI | AE-P2 |
| Rust toolchain and crates | No Cargo.lock; crate versions are ranges ('2'); Rust not installed locally | Cargo.lock committed; toolchain pinned (for example `rust-toolchain.toml`) | AE-P14 |
| Android build | No native project. An Android SDK is installed on the maintainer machine (platforms android-35 and android-36, build-tools 36.0.0, NDK, cmake); no Java runtime was found by `/usr/libexec/java_home` (checked 2026-11-15) | Gradle wrapper and dependency versions committed; Android SDK and build-tools versions recorded | AE-P14 |
| Python (classroom host) | Unpinned ranges (backend/requirements.txt); local 3.9, CI 3.12 (TD-32) | Pinned Python version (D-37) and a hashed lock file | AE-P9 |
| CI actions | Pinned to tags (@v3/@v4/@v5), no permissions block in ci.yml (TD-33) | Pinned to commit SHAs; least-privilege permissions | AE-P2 |
| Build environment | Local builds on a shared, loaded machine (R-037) | Release artifacts built only in CI from the tag | AE-P14 |

### 7.2 Outputs published with each release

- Every artifact with its SHA-256 checksum in a `SHA256SUMS` file.
- An SBOM in the format approved under D-26 (proposal: CycloneDX covering npm, Python and Rust; tools are candidates in [DEPENDENCY_AND_LICENCE_PLAN](DEPENDENCY_AND_LICENCE_PLAN.md)).
- The licence report (docs/THIRD_PARTY_NOTICES.md, extended to Python, Rust and shell dependencies).
- The commit SHA, CI run IDs and tool versions used for the build.
- Optional, candidate: a build provenance attestation from the CI platform (to evaluate in AE-P14; not required).

### 7.3 Reproducibility check

- Web: CI builds the tag twice in clean environments and compares the SHA-256 of every file in apps/web/dist; any difference is investigated and either fixed or explained in the release notes. Not yet done; the build has never been checked for determinism.
- Native: Tauri, Windows installer and Android outputs may embed timestamps or signatures; the check compares the unsigned payloads where possible and records known non-deterministic fields. To be designed in AE-P14.

## 8. Platform release channels

### 8.1 Supported platform matrix (PROPOSED, D-30)

| ID | Platform | Proposed support | Today | Release artifact | Channel (proposed, D-40) |
|---|---|---|---|---|---|
| PLT-001 | Web: Chrome/Edge (Chromium) | Latest 2 majors | Tested locally (Playwright Chromium) | Static web build | GitHub Pages |
| PLT-002 | Web: Firefox | Latest plus ESR | **Never green on main**; green once on the PR #1 branch (run 43719093806, 2026-11-15) | Static web build | GitHub Pages |
| PLT-003 | Web: Safari on macOS | Latest 2 majors | WebKit tested via Playwright, not real Safari | Static web build | GitHub Pages |
| PLT-004 | Safari on iOS/iPadOS | Best-effort web only; not a target platform in the brief | No real-device test | Static web build | GitHub Pages |
| PLT-005 | macOS desktop (Tauri 2, WKWebView) | Current and previous major macOS | Never built | .dmg containing the .app | GitHub Releases |
| PLT-006 | Windows desktop (Tauri 2, WebView2) | Windows 10 22H2 and Windows 11 | Never built; no Windows machine confirmed | .msi and NSIS .exe installer | GitHub Releases |
| PLT-007 | Android (Capacitor 7, system WebView) | Minimum API level set after checking Capacitor 7's own minimum; proposed Android 10 or later | No native project | Signed APK (AAB if a store is chosen) | GitHub Releases (sideload); store only if D-40 (b) |
| PLT-008 | PWA install | Chromium and Android | SVG icon only (TD-27) | Same web build | GitHub Pages |

Real Safari, real Firefox and real devices are needed for AC-PLT; Playwright's WebKit is not Safari (R-039).

### 8.2 Web (GitHub Pages)

- **Today:** every push to main is published, including builds whose e2e job failed: deploy runs 43669491300 (468ab89) and 43676035951 (edc2672) succeeded while the CI runs for the same commits (43669491390, 43676035968) failed in e2e (pages.yml:6-9).
- **Proposal under D-02:** during AE-P2 to AE-P14, deploy only when the CI workflow for the same commit is green (D-02 (b)). From AE-P16, deploy only release tags (D-02 (c)), so the live site always runs an approved version. Today the `github-pages` environment accepts deployments from the branch `main` only (gh api, 2026-11-15), so a tag deploy would be refused; AE-P2 must add a tag rule to the environment (a repository setting, owner approval) before D-02 (c) or a tag rollback (§10.1) can work.
- **Service worker behaviour:** `registerType: 'prompt'` (apps/web/vite.config.ts:24); users keep the cached build until they accept the update banner (SystemBanners.tsx:35-106), which saves work first. The app has no periodic update check of its own (no `registration.update()` call in apps/web/src; the browser still checks for a new service worker on navigation), and an update waits until the user accepts the banner, so some users can stay on old builds (R-097). Migrations reach each user when they accept the update, not at deploy time, but within days they reach everyone (R-002).
- **What every web release must state:** the version, any data-format change, and whether older builds can still open the data (they cannot after a DB version bump; §10.2).
- **Unfinished modules:** panels and routes for modules that are not yet released stay hidden (D-31), so the public site never shows controls that do not work (R-099).

### 8.3 macOS (Tauri 2)

- Artifact: `.dmg` with the `.app` (tauri.conf.json:22), built in CI on a macOS runner.
- Signing and notarisation: Apple Developer ID and notarisation (D-28; yearly Apple Developer Program fee). Without them, Gatekeeper blocks the first launch and users must override it in System Settings; release notes must explain this if D-28 chooses unsigned builds.
- Updates: no in-app updater is configured; users download the new .dmg. An updater plugin is a candidate for after 1.0 and needs its own signing key.
- Data location: the webview's storage and any SQLite database live in the app's data directory, which is tied to the bundle identifier `org.digitalclassroom.os` (tauri.conf.json:5). The identifier must never change after the first public build (R-094); how Tauri derives the webview storage path from it is to be verified in AE-P14.

### 8.4 Windows (Tauri 2)

- Artifacts: `.msi` and NSIS `.exe` (tauri.conf.json:22), built in CI on a Windows runner. WebView2 runtime handling (bootstrapper or fixed version) decided in AE-P14.
- Signing: an Authenticode code-signing certificate (D-28; recurring cost). Unsigned installers trigger SmartScreen warnings.
- Updates and data location: as macOS; the identifier rule applies.
- Testing needs a Windows machine (D-22); none is confirmed today.

### 8.5 Android (Capacitor 7)

- Artifact: a signed release APK for sideloading from GitHub Releases (proposed, D-40 (a)); an AAB only if Google Play is chosen (D-40 (b)), which also brings the store's target-API and review requirements.
- Signing: a release keystore generated by or for the owner, stored outside the repository (.gitignore covers *.keystore and *.jks) with an off-machine backup. Android only installs an update signed with the same key; losing it forces users to uninstall, which deletes their local data (R-094, R-095).
- `versionCode` strictly increases with every release, including RCs.
- WebView limits: `<a download>` does not work (TD-28); print, full screen and BroadcastChannel behave differently (TD-58, R-039). Native save, share and print adapters (SVC-PLAT) are required before AE-P14 exits.
- Debug builds are never published.

### 8.6 Backend (classroom host)

- Not deployed anywhere today; pages.yml publishes only the web app.
- From AE-P9: released as part of the same version, as a pinned Python package or bundle with installation instructions for the platforms chosen under D-13 (or as a Tauri sidecar if D-13 chooses that). It is self-hosted by schools or teachers; no paid hosting is required (brief §11).
- The host and clients must agree on a protocol version; a client refuses to sync with a host whose protocol it does not understand, rather than guessing (DATABASE_AND_SYNC_ARCHITECTURE).

## 9. Signing and secrets

| Artifact | Signing | Cost | Key custody | If unsigned (D-28 alternative) |
|---|---|---|---|---|
| Web build | HTTPS from GitHub Pages; checksums of the release archive | None | — | — |
| macOS .app/.dmg | Developer ID Application certificate plus notarisation | Yearly Apple Developer Program fee | Certificate and app-specific credentials in GitHub encrypted secrets | Gatekeeper warning; manual override |
| Windows installers | Authenticode (OV or EV) certificate | Certificate cost | Certificate in GitHub encrypted secrets or a signing service chosen in AE-P14 | SmartScreen warning |
| Android APK/AAB | Release keystore | None (self-generated) | Keystore and passwords in GitHub encrypted secrets; offline backup kept by the owner | Not possible: Android requires a signature; an unsigned build cannot be installed |
| Git tags | Optional signed tags | None | Owner's own key | Annotated unsigned tags (today's practice) |
| Classroom host package | Checksums; optional signature | None | — | — |

Rules: no signing key, certificate or password is ever committed (secret scanning and push protection are on); secrets are scoped to the release workflow only; the owner keeps an offline copy of every key that cannot be replaced (Android keystore). Purchasing certificates needs the owner's approval (D-28).

## 10. Rollback

### 10.1 What can be rolled back

| Platform | Mechanism | Limits |
|---|---|---|
| Web | Re-deploy the build of the previous release tag (manual dispatch of the deploy workflow on that tag, once AE-P2 adds a tag rule to the `github-pages` environment; today only `main` may deploy) | Users only receive it after accepting the update banner (registerType 'prompt'). Not possible across a database version bump (§10.2) |
| macOS, Windows | Users reinstall the previous installer from GitHub Releases; previous releases are never deleted | Same database rule; the app data directory is kept across reinstalls |
| Android | Sideloaded builds cannot be downgraded over a higher `versionCode` without uninstalling, and uninstalling deletes app data | Therefore no downgrade path on Android: fixes roll forward only; users must export a backup before any uninstall |
| Classroom host | Reinstall the previous pinned version; host database backed up before every upgrade | Host schema migrations follow the same safety-copy rule as the client |

### 10.2 The database rule

An older build refuses a newer IndexedDB database and shows the "newer data" screen instead of an empty app (UpgradeRecovery.tsx:33-34, :52-60; kinds.test.ts:269 VersionError). Content saved under a newer content schema opens read-only in an older build. Consequences:

- **Never roll back across a `SCHEMA_VERSION` bump.** Users who already upgraded would be locked out of their data until the newer build returns. Fix forward with a PATCH release instead (R-093).
- A rollback within the same database version is allowed, but content saved under a newer content schema opens read-only in the older build; the release notes must say so.
- The pre-upgrade safety copy (database `digital-classroom-os-backup-v<old>`) and the user's own backup files are the recovery path; Settings → Storage ("Copies kept from before updates") can export the safety copy as a backup file (SettingsPages.tsx:150-168; `exportSafetyCopy`, indexeddb.ts:1082). If the copy cannot be made, the user can download a backup read without upgrading (`exportWithoutUpgrade`, indexeddb.ts:631-637).
- A release that bumps the database version therefore needs a stronger gate: the upgrade test from every released version, a manual upgrade on each platform, and owner approval of the migration itself (§12).

### 10.3 Rollback procedure (proposed)

1. Owner decides to roll back (or to fix forward) after a defect report.
2. Check whether the faulty release changed any data format. If it changed `SCHEMA_VERSION`: fix forward only.
3. Otherwise re-deploy the previous tag (web) or point users to the previous installer (desktop).
4. Publish a notice in the release notes and the repository explaining what happened, what data is affected and how to recover it (safety copy, backup).
5. Record the incident and add a regression test before the fix release.

## 11. Data safety on upgrade

### 11.1 Rules for every release that changes a data format

- Migrations are append-only and run only after a verified safety copy (indexeddb.ts:511-549; ADR 0006). If the copy fails, no upgrade runs and the user is offered a read-only export.
- Every build imports every earlier backup format (format 2 today, format 3 later) and never overwrites existing items (ADR 0007).
- Newer content opens read-only in older builds, with a download of the original data.
- The release notes say "export a backup before updating" and name the format changes.
- Migration time is measured (PERF-014: v3→v4 on 1,000 items in ≤ 30 s with progress shown; proposed target, to be measured).
- Native first launch under D-12 Option B: migrate from the webview's IndexedDB to SQLite through the backup format, keep the IndexedDB data untouched until the SQLite copy is verified, and offer a backup export first.
- Reversibility follows D-07: either "safety copy plus backup, older builds fail closed" is accepted as reversible where practical, or down-migrations are required.

### 11.2 Upgrade test matrix

scripts/upgrade-test.mjs today upgrades from `v0.1.0-baseline` and from 650cf63 (DB v2) to the current build in Chromium only, and checks that an older build fails closed (82/82 on 2026-11-15, RELEASE_GAPS.md:261). It is not in CI, and its store lists are hard-coded (scripts/upgrade-test.mjs:64-65).

Proposed matrix, extended at every release that changes a format:

| From | Database version | To | Browsers | Phase added |
|---|---|---|---|---|
| v0.1.0-baseline (20d3f4d) | 1 | current | Chromium (today); Firefox and WebKit proposed | exists |
| 650cf63 | 2 | current | Chromium (today) | exists |
| edc2672 / v0.2.0 | 3 | current | Chromium, Firefox, WebKit | AE-P3 |
| v0.3.0 (DB v4) | 4 | current | Chromium, Firefox, WebKit | AE-P4 onwards |
| Each later tag with a new database version | n | current | Chromium, Firefox, WebKit | AE-P7, AE-P8, … |
| Web IndexedDB → native SQLite (if D-12 Option B) | current | native | Tauri on macOS and Windows; Android | AE-P14 |

The test runs as a scheduled or manually triggered CI job (D-38) and is mandatory before any tag that changes a data format.

## 12. Owner approval points

| Action | Approval needed | Recorded where |
|---|---|---|
| Start of each phase | Owner approves previous phase exit and the start | Phase report |
| Any push to main (while main deploys to Pages) | Yes | PR approval |
| Change to the deploy trigger (D-02) | Yes | ADR or dated note |
| Repository visibility (D-01) | Yes (already given; to be recorded) | Dated note in AE-P2 |
| Any data-format change (DB version, content schema, backup format) | Yes, before implementation | ADR acceptance |
| Phase-exit tag `v0.x.0` | Yes | Phase report |
| New dependency | Yes, after its review in DEPENDENCY_AND_LICENCE_PLAN | Dependency record |
| Signing certificates and accounts (D-28), store accounts (D-40) | Yes (cost) | Decision record |
| Installing toolchains on the maintainer machine (Rust; a JDK; any Android SDK components beyond those already installed, §7.1) | Yes | Phase report |
| Each RC tag and its distribution to testers (D-41) | Yes | RC report |
| Waiver of any AC | Yes, explicit, disclosed in known limitations | Phase or RC report |
| `v1.0.0` tag and publication | Yes, explicit (brief §15) | Release record |
| Rollback or fix-forward decision | Yes | Incident note |
| Force-push, history rewrite, reset of main | Yes, and proposed never (brief §14; R-031) | — |

## 13. REL requirements

AC-REL-NNN in [ACCEPTANCE_CRITERIA](ACCEPTANCE_CRITERIA.md) verifies REL-NNN; the wording there is canonical.

| ID | Requirement | Phase | Status today |
|---|---|---|---|
| REL-001 | CI is green on main for every job, including Firefox, at AE-P2 exit and before every later phase starts | AE-P2 | Absent (main never green; the PR #1 branch was green once, run 43719093806) |
| REL-002 | The Pages deploy runs only after green CI for the same commit (D-02), and from AE-P16 only for release tags | AE-P2, AE-P16 | Absent (pages.yml:6-9) |
| REL-003 | Every manifest in §3.4 carries the same version; a CI check enforces it | AE-P2 | Partial (all equal at 0.1.0; no check) |
| REL-004 | Every release and phase exit has an annotated tag on a green commit | AE-P2 | Partial (only v0.1.0-baseline) |
| REL-005 | main is protected (pull requests, required checks, no force-push) | AE-P2 | Absent |
| REL-006 | New commits carry a real author identity | AE-P2 | Absent (TD-34) |
| REL-007 | A verified repository bundle with an off-machine copy exists before each phase | AE-P2 | Partial (bundles to 650cf63, this machine only) |
| REL-008 | CI hardening: least-privilege permissions, SHA-pinned actions, timeouts, enforced coverage floors | AE-P2 | Absent (TD-33) |
| REL-009 | The upgrade test runs in CI (scheduled or manual) and before every format-changing tag | AE-P2/AE-P3 | Partial (local, Chromium only) |
| REL-010 to REL-024 | The release checklist items in §6.1 | AE-P4 to AE-P16 | See §6.1 |
| REL-025 | Release notes for every tag state format changes, upgrade notes and known limitations | AE-P2 onwards | Absent |
| REL-026 | Rollback procedure (§10.3) documented and rehearsed once on the web before AE-P15 | AE-P14 | Absent |
| REL-027 | Signing keys and certificates are held outside the repository with an offline backup of irreplaceable keys | AE-P14 | Absent (no keys exist) |

## 14. Risks relevant to releases

| Risk | Summary | Where handled |
|---|---|---|
| R-001 | CI e2e never passed on main | AE-P2, REL-001 |
| R-002 | Ungated Pages deploy reaches every user | D-02, REL-002, §8.2 |
| R-003 | Migrations on live users' data; older builds fail closed | §10.2, §11 |
| R-019 | Documentation drift | REL-019 |
| R-031 | Public history with placeholder author and local path | §4 |
| R-032 | Native shells unbuilt | AE-P14, §8.3–§8.5 |
| R-033 | Signing costs; unsigned warnings | D-28, §9 |
| R-035 | Lost evidence | §5 step 9, §7.2 |
| R-037 | Single machine for backups and builds | §4, §7.1 |
| R-039 | WebView differences | §8.5 |
| R-093 | Rollback across a schema bump strands users | §10.2 |
| R-094 | Android uninstall or identifier change loses local data | §8.3, §8.5 |
| R-095 | Signing key loss or compromise | §9 |
| R-096 | Version metadata drift | REL-003 |
| R-097 | Long-cached PWA builds | §8.2 |
| R-099 | Unfinished features on the public site | D-31, §8.2 |

Full descriptions, likelihood, impact, mitigations and triggers are in [RISK_REGISTER](RISK_REGISTER.md).
