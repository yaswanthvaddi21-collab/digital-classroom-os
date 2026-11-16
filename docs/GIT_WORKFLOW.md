# Git workflow

How changes are made, checked, recorded and (only with the owner's approval) published. Written in Phase 2 of the v0.2.0 release project.

## 1. Current state (2026-11-16)

| Item | State |
|---|---|
| Branches | `main`, plus Advanced Edition phase branches (`advanced/phase1-audit`, `advanced/phase2-safety`) and `ci/browser-test-fixes` (PR #1, merged). History on `main` is linear up to `edc2672`; `0fa0064` is the merge commit of PR #1 |
| Tags | `v0.1.0-baseline` (the code as it was before any release work), **local only**: `git ls-remote --tags origin` lists no tags. No `v0.2.0` tag and no GitHub release yet |
| Remote | `origin` = <https://github.com/yaswanthvaddi21-collab/digital-classroom-os>. The repository is **public** by the owner's explicit choice (decision D-01, recorded 2026-11-15 in [ADVANCED_EDITION_PRODUCT_ROADMAP.md](advanced-edition/ADVANCED_EDITION_PRODUCT_ROADMAP.md) §6.0) |
| Pushing | Only when the owner says which work to push; not every update is pushed (D-02). The GitHub Pages deploy ([pages.yml](../.github/workflows/pages.yml)) runs on every push to `main` and is **not** gated on CI, so the live site changes only when the owner approves a push |
| CI | [ci.yml](../.github/workflows/ci.yml) runs on pushes to `main` and on pull requests (jobs `web`, `e2e`, `backend`) and has run many times. The `e2e` job (including Firefox) failed on `main` for `468ab89` (run 43669491390) and `edc2672` (run 43676035968). PR #1 (test-only fixes for failures seen only in CI) was green on all four Playwright projects (Chromium, Firefox, WebKit, mobile Chromium) in run 43719093806 on its branch and was merged into `main` on 2026-11-16 as `0fa0064`. In the first CI run on `main` after the merge (run 43780673925) its `web` and `backend` jobs passed, but `e2e` failed one Firefox test (`e2e/cross-tab.spec.ts`, also on retry): a false "new version is ready" notice shifted the page under the click. The app fix is on branch `advanced/phase2-safety` (AE-P2 report); a green CI run on `main` has not yet been recorded |
| Branch protection | None on `main`, and Dependabot security updates are off, by the owner's choice for now (D-05). Secret scanning and push protection are on; private vulnerability reporting is off (D-39; see [SECURITY.md](SECURITY.md)) |
| Integrity | `git fsck --full --strict` clean. A verified bundle of all refs is kept in `backups/` (git-ignored, never committed) before each phase. Newest: `repo-before-ae-phase2-20261116-055847.bundle`, test-restored on 2026-11-16 (clone succeeded, `git fsck` clean). Every backup exists only on this Mac; see `backups/README.md` |
| Commit identity | **Placeholder** `Digital Classroom OS <noreply@anthropic.com>` on every commit made in this repository; the owner chose to keep it for new commits and leave history unchanged (D-04). The one exception is the PR #1 merge commit `0fa0064`, which GitHub created under the owner's GitHub account. No `user.name`/`user.email` is configured on this machine |
| Signing | Commits are not signed |
| Secrets | None in any commit or file on disk (scan in [DATA_SAFETY_REPORT.md](DATA_SAFETY_REPORT.md)) |
| GitHub CLI | Installed (`gh`, in `~/.local/bin`) and used read-only for checks such as `gh run list` and `gh repo view` |

## 2. Rules

1. **Nothing is pushed, published or tagged as a release without the owner's explicit approval**, given for that specific push.
2. **`main` must always be green**: typecheck, unit and integration tests, browser tests, build and licence gate all pass before a commit lands on it. This has not held so far: `468ab89` and `edc2672` landed with a failing `e2e` job (§1).
3. **One stable milestone per commit.** Each commit message says what changed and why, and records how it was verified.
4. **History is not rewritten** once anything has been pushed. Before the first push it may be rewritten only with the owner's approval (see §6).
5. **Never commit:** secrets, `.env` files, keys or signing material, databases, user exports, build outputs or test artifacts. `.gitignore` enforces this. Check `git status` before every commit anyway.
6. **Backups before risky work:** before any phase that changes storage or migrations, create a verified bundle and a source archive (see [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) §3).

## 3. Branches and tags

| Name | Purpose |
|---|---|
| `main` | Integrated, verified work. Every commit passes the full check |
| `phase-<n>/<topic>` | Work for one phase of the release plan, e.g. `phase-4/document-studio`. Merged into `main` once the phase is approved |
| `release/v0.2.0` | Created at release-candidate time and frozen; only release fixes land there |
| `v0.2.0-rc1`, `v0.2.0-rc2`, … | Annotated tags on release candidates |
| `v0.2.0` | Annotated tag on the approved stable commit; under D-06 it is planned for AE-P2 to close the v0.2 programme. The previous stable tag stays for rollback |

The remote exists, so work goes on a phase branch (Advanced Edition: `advanced/phase<n>-<topic>`) and reaches `main` through a pull request, so CI runs before merging. There is no branch protection to enforce this (D-05); it is a working rule. Pushing any branch still needs the owner's go-ahead (D-02).

## 4. Before every commit

```bash
npm run typecheck
npm test
npx playwright test --project=chromium --project=webkit --project=mobile-chromium
npm run build
npm run licenses
```

Also run:
- `npm run test:upgrade` whenever storage, migrations or backup code changed (real-browser upgrade from v0.1.0).
- `cd backend && .venv/bin/pytest -q` whenever the backend changed.

Then review `git status` and `git diff --staged` and check for anything that must not be committed.

**Commit message format:**

```
Short summary in the imperative (≤ 72 characters)

What changed and why, in plain sentences. Mention data-safety implications
(migrations, storage format, backup format) explicitly.

Verified: typecheck; <n>/<n> unit; <n> e2e (chromium, webkit, mobile); build.
```

## 5. Setting the real identity

The owner chose to keep the placeholder author for new commits (D-04, 2026-11-15). If that changes, run this for this repository only:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

Earlier commits keep the placeholder unless history is rewritten (§6).

## 6. History clean-up (not done; owner chose to leave history as it is)

Two things in the existing history could have been cleaned up before anything was published:
- the placeholder author on all commits
- the local path `/Users/<name>/…` in an older version of `docs/audit/FINDINGS.md` (commit `8766e18`; removed from the current file in Phase 2)

History has now been pushed to a public repository, so rewriting it would change **every commit hash** (including `f50b0d4` and `ea7f316`, which the release documents refer to) and would need a force-push. Neither item is a secret, and the owner decided to leave history unchanged (D-04). Do not rewrite it.

## 7. The GitHub repository (created)

Superseded plan: this section used to describe creating a **private** repository. What actually exists (checked with `gh repo view` and `gh api`, 2026-11-16):

1. **Repository:** `yaswanthvaddi21-collab/digital-classroom-os`, **public** by the owner's explicit choice (D-01). Connected as `origin` over HTTPS.
2. **Pushes:** `main` and `ci/browser-test-fixes` are on the remote; the `v0.1.0-baseline` tag is not. New pushes only with the owner's approval of the specific work (D-02).
3. **Protection of `main`:** none, and Dependabot security updates are off (D-05, "not for now"). If the owner later turns protection on, require the `web`, `e2e` and `backend` checks and block force-pushes and deletion.
4. **Security features:** secret scanning and push protection are on; private vulnerability reporting is off (D-39).
5. **CI history:** the first runs on `main` (`468ab89`, `edc2672`) failed in the `e2e` job, including Firefox. PR #1 fixed the tests that failed only in CI; its run 43719093806 passed on all four Playwright projects and it was merged as `0fa0064` on 2026-11-16. Firefox is checked only in CI: Playwright cannot launch Firefox on the owner's Mac ("Could not find profile folder").
6. **Deploy:** GitHub Pages publishes every push to `main` and does not wait for CI (D-02 chose no CI gate).

CI needs no secrets today. When native signing arrives (AE-P14; D-28), signing keys go into GitHub encrypted secrets, never into the repository.

## 8. Release flow (summary)

Written for the v0.2 programme and not yet run. How and on which commit `v0.2.0` is tagged is set out in [RELEASE_STRATEGY.md](advanced-edition/RELEASE_STRATEGY.md) §3 (D-06).

1. Freeze: create `release/v0.2.0` from a green `main`.
2. Bump versions in every manifest (root, `apps/web`, Tauri, Cargo, backend API).
3. Run the complete verification suite on the release commit.
4. Tag `v0.2.0-rc1`.
5. Build artifacts and record SHA-256 checksums.
6. Ask the owner for approval.
7. On approval, tag `v0.2.0` on the same commit and publish the release notes and artifacts as agreed.
8. Keep the previous stable tag and its artifacts for rollback.
