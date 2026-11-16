# AE-P2 report: Git, backup and data safety

**Phase:** AE-P2 of the Advanced Edition ([roadmap](ADVANCED_EDITION_PRODUCT_ROADMAP.md) §5.4). Started 2026-11-16 on the owner's instruction "Start Phase 2". Branch `advanced/phase2-safety` (local, not pushed), made from `advanced/phase1-audit` with `main` (0fa0064) merged in.

**Status:** work done, waiting for the owner. Nothing from this phase has been pushed except the PR #1 merge, which the owner approved under D-03.

## 1. Decisions applied

| Decision | Owner's answer (roadmap §6.0) | What AE-P2 did |
|---|---|---|
| D-01 Public repository | Public, recorded | Recorded in roadmap §6.0 (1ae5d5b). docs/GIT_WORKFLOW.md and docs/SECURITY.md now say the repository is public |
| D-02 Pushing and deploy | Push only when the owner says which work to push; deploy stays push-triggered | The deploy is **not** gated on CI. pages.yml and docs/DEPLOYMENT.md say why. Nothing on this branch is pushed |
| D-03 PR #1 | Merge | Merged on GitHub 2026-11-16 as `0fa0064` (merge commit; branch kept) |
| D-04 Git author | Keep the placeholder | Kept for every new commit. The merge commit 0fa0064 was made through GitHub, so it carries the owner's GitHub account as author |
| D-05 Branch protection, Dependabot | Not now | Not changed |
| D-06 Versions | Tag v0.2.0, then 0.3–0.9 | Every manifest bumped to 0.2.0. Release notes drafted. The tag is **not** created yet; it goes on the AE-P2 exit commit once approved (RELEASE_STRATEGY §3.2 option a2) |
| D-39 Private vulnerability reporting | Off | docs/SECURITY.md has a "Reporting a vulnerability" section: open an issue titled "Security contact request" with no details, and a private channel is arranged |
| D-23 Web CSP | Still open | Not done. docs/SECURITY.md now states the web app has no CSP |
| D-38 Coverage and upgrade test in CI | Still open | Not added to CI |

## 2. Work done

| Item | Result | Evidence |
|---|---|---|
| Backup | `backups/repo-before-ae-phase2-20261116-055847.bundle` (all refs; complete history) and `source-before-ae-phase2-20261116-055847.tar.gz`. `git bundle verify` OK; test-restored by `git clone` with `git fsck` clean; SHA-256 recorded | backups/README.md (git-ignored), rewritten to list all 19 files with hashes |
| Off-machine copy | **Not done.** It needs a drive or account of the owner's choice | backups/README.md "Off-machine copy" |
| PR #1 merged | `0fa0064` on main. Pages run 43780673936 deployed it; the app is unchanged (test files only) | gh run list |
| CI on main | Run 43780673925 on 0fa0064: web and backend passed; e2e 496 passed, 44 skipped, **1 failed** (Firefox, e2e/cross-tab.spec.ts, failed on its retry too). Cause found and fixed in the app, see the next row | gh run view 43780673925 |
| App defect fixed: false "new version" notice | The CI trace showed the second tab displaying "A new version of Classroom OS is ready" during the test. The banner pushed the page down 30 px, so the click on "More actions" landed on empty space. vite-plugin-pwa 2.0.0 (prompt mode, `client/build/register.js:68-71`) reports a first install that another tab started as an update. The trace's network log shows that tab was not controlled by a service worker (every file revalidated with the server), so it was already running the newest build. Users saw the same false notice when they opened a second tab during their first visit. Fix: `SystemBanners` shows the notice only on a page a service worker controls (`isControlledPage`). New unit test `SystemBanners.test.tsx` (4 tests; 2 fail without the fix). Not reproduced locally: Firefox cannot launch on this Mac, and Chromium and WebKit did not show the notice even with the install slowed down (6 probe runs; probe removed) | apps/web/src/components/SystemBanners.tsx |
| Version 0.2.0 | 13 manifests and package-lock.json. The new check `npm run versions` finds 19 fields, all 0.2.0, and fails on a mismatch (tried with backend at 0.1.9: exit 1). About shows `Version 0.2.0` (found in the build output) | scripts/check-versions.mjs; CI web job step |
| CI hardening (TD-33) | ci.yml has `permissions: contents: read`. In both workflows every action is pinned to a full commit SHA, each one the commit its `@vN` tag pointed to on 2026-11-16, so behaviour is unchanged. Job timeouts (web 20, e2e 60, backend 10, Pages build 20, deploy 10 minutes). Pull-request runs cancel older runs; main runs never cancel. Both files parse as YAML. **Not yet run on GitHub**: this needs a push | .github/workflows/ci.yml, pages.yml |
| Stale documents (roadmap §3.3) | All rows corrected, see §3 | git diff |
| TD-1, TD-36, TD-37 | Verified fixed in code; marked fixed with file:line evidence | docs/audit/TECHNICAL_DEBT.md |
| TD-33, TD-34, RG-13, RG-14 | Updated with dated notes; still open where work remains | TECHNICAL_DEBT.md, RELEASE_GAPS.md |
| Release notes | Draft: docs/releases/v0.2.0.md (changes, format versions, upgrade notes, known limitations) | — |

## 3. Documents corrected

| Document | Change |
|---|---|
| README.md | Phase 7 committed and live; the site serves 0fa0064; link to the Advanced Edition plan |
| docs/DEPLOYMENT.md | What is live, and the ungated deploy (D-02) |
| docs/audit/FEATURE_STATUS.md | Phase 7 status. Row 61 fixed. Row 176: storage-error defect fixed, empty DataSafetyCard still open. All DiagramEditor line references re-pinned to current code |
| docs/audit/RELEASE_GAPS.md | Phase 5, 6 and 7 headings; RG-13 and RG-14 notes; "CI has never run" removed |
| docs/audit/TECHNICAL_DEBT.md | Phase headings; TD-1, TD-36, TD-37 fixed; TD-33 partly fixed; TD-34 accepted under D-04 |
| docs/GIT_WORKFLOW.md | Remote, visibility, CI, push rule, author, branch protection and backups as they are now |
| docs/TESTING.md | Firefox only in CI (with the local launch error); CI state |
| docs/DATABASE.md, ADR 0006, ADR 0007 | Schema numbers (document 3, diagram 3, presentation 1). The SQLite DDL is marked out of date and left for AE-P3/AE-P14; dated update notes in the ADRs |
| docs/SECURITY.md | Reporting route (D-39), public posture, no web CSP |
| Stub READMEs | AE phase numbers (notebook AE-P7, PDF AE-P8, classroom and assignments AE-P9, sync AE-P9/P10, desktop and Android AE-P14). Presentation Studio README now says committed and live |
| tests/acceptance/CHECKLIST.md | Dated note: not re-run since 2026-11-12 and does not cover v0.2 Phases 4–7 |

## 4. Checks run

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm test` (Vitest) | 133 files, 2001 tests passed (with the new SystemBanners test) |
| `npm run build` | Pass |
| `npm run licenses` + notices diff | Pass; THIRD_PARTY_NOTICES.md unchanged |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| Backend `pytest` | 3 passed |
| `npm run versions` | 19 fields at 0.2.0 |
| CI on main (run 43780673925, 0fa0064) | web pass, backend pass, e2e 496 passed / 44 skipped / 1 failed (Firefox cross-tab, fixed above). Main is **not yet green** |
| `SystemBanners.test.tsx` | 4 passed |
| Playwright locally (Chromium, WebKit, mobile Chromium; 4 workers) | 350 passed, 27 skipped, 0 failed (3.8 min, 2026-11-16, on the fixed build) |

## 5. AE-P2 acceptance criteria

| AC | Status |
|---|---|
| AC-REL-001 CI green on main, including Firefox | **Not yet.** The 0fa0064 run failed one Firefox test, now fixed on this branch; needs a push and a green run |
| AC-REL-002 Deploy only after green CI | **Waived by D-02** (owner controls pushes instead) |
| AC-REL-003 One version, checked in CI | Done locally; the CI step runs on the next push |
| AC-REL-004 Annotated tag on a green commit | Waiting: `v0.2.0` after approval and a green run of the AE-P2 commit |
| AC-REL-005 Branch protection | **Not chosen (D-05)** |
| AC-REL-006 Real author identity | **Not chosen (D-04)** |
| AC-REL-007 Verified bundle with off-machine copy | Bundle done and verified; **off-machine copy needs the owner** |
| AC-REL-008 Least privilege, SHA pins, timeouts, coverage floors | Done except coverage floors (D-38 open) |
| AC-REL-009 Upgrade test in CI | Open (D-38) |
| AC-REL-025 Release notes for the tag | Draft written |

## 6. Still open

1. **Owner approval to push** `advanced/phase2-safety` to `main`. The push brings the AE-P1 planning documents, the AE-P2 changes, version 0.2.0 and the update-notice fix. Pages will redeploy. The About page will then say 0.2.0, and the false "new version" notice is fixed; there are no other app changes. Its CI run is the first test of the hardened workflow.
2. **Owner approval to create and push the `v0.2.0` tag** on that commit once its CI run is green.
3. An off-machine copy of the newest bundle (owner).
4. D-23 (web CSP) and D-38 (coverage floors and the upgrade test in CI): answer in AE-P3 or now.
5. Extending and re-running the manual acceptance checklist for v0.2 Phases 4–7. It is not a condition of the tag; it can be scheduled in AE-P3 or in each module phase.
6. Still stale, noticed and left for later: `apps/desktop/src-tauri/capabilities/default.json` mentions "Phase 5"; no `package.json` has a `license` field (TD-36 note).
