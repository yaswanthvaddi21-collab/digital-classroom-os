# Git workflow

How changes are made, checked, recorded and (only with the owner's approval) published. Written in Phase 2 of the v0.2.0 release project.

## 1. Current state (2026-11-13)

| Item | State |
|---|---|
| Branch | `main` only, linear history from the v0.1.0 baseline |
| Tags | `v0.1.0-baseline` (the code as it was before any release work) |
| Remote | **None.** Nothing has ever been pushed. CI (`.github/workflows/ci.yml`) has therefore never run |
| Integrity | `git fsck --full --strict` clean. A verified bundle of all refs is kept in `backups/` before each phase |
| Commit identity | **Placeholder** on every commit so far: `Digital Classroom OS <noreply@anthropic.com>`. No `user.name`/`user.email` is configured on this machine. Waiting for the owner's name and email |
| Signing | Commits are not signed |
| Secrets | None in any commit or file on disk (scan in [DATA_SAFETY_REPORT.md](DATA_SAFETY_REPORT.md)) |
| GitHub CLI | Not installed |

## 2. Rules

1. **Nothing is pushed, published or tagged as a release without the owner's explicit approval**, given for that specific push.
2. **`main` must always be green**: typecheck, unit and integration tests, browser tests, build and licence gate all pass before a commit lands on it.
3. **One stable milestone per commit.** Each commit message says what changed and why, and records how it was verified.
4. **History is not rewritten** once anything has been pushed. Before the first push it may be rewritten only with the owner's approval (see §6).
5. **Never commit:** secrets, `.env` files, keys or signing material, databases, user exports, build outputs or test artifacts. `.gitignore` enforces this. Check `git status` before every commit anyway.
6. **Backups before risky work:** before any phase that changes storage or migrations, create a verified bundle and a source archive (see [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) §3).

## 3. Branches and tags

| Name | Purpose |
|---|---|
| `main` | Integrated, verified work. Every commit passes the full check |
| `phase-<n>/<topic>` | Work for one phase of the release plan, e.g. `phase-4/document-studio`. Merged into `main` once the phase is approved |
| `release/v0.2.0` | Created at release-candidate time (Phase 14) and frozen; only release fixes land there |
| `v0.2.0-rc1`, `v0.2.0-rc2`, … | Annotated tags on release candidates |
| `v0.2.0` | Annotated tag on the approved stable commit (Phase 15). The previous stable tag stays for rollback |

While there is a single developer and no remote, work may go straight to `main`, provided rule 2 holds. Once a remote exists, use phase branches and pull requests, so CI runs before merging.

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

Waiting for the owner. Once given, run this for this repository only:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

Earlier commits keep the placeholder unless history is rewritten (§6).

## 6. Before the first push: optional history clean-up

Two things in the existing history may be worth cleaning up before anything is published:
- the placeholder author on all commits
- the local path `/Users/<name>/…` in an older version of `docs/audit/FINDINGS.md` (commit `8766e18`; removed from the current file in Phase 2)

Rewriting history changes **every commit hash**, including `f50b0d4` and `ea7f316`, which the release documents refer to. So the recommendation is to **leave history as it is**: neither item is a secret. If the owner prefers a clean history, it must be done before the first push. The procedure:
1. Bundle all refs first.
2. Rewrite with `git filter-repo`, using `--mailmap` for identity and `--replace-text` for the path.
3. Re-run the full check.
4. Update every document that cites old hashes.

## 7. Creating the private GitHub repository (prepared, not done)

Every step below needs the owner's go-ahead. Nothing has been created or pushed.

1. **Create the repository.** On github.com: *New repository*, choose **Private**, do **not** add a README, licence or `.gitignore` (the project already has them). Alternatively install the GitHub CLI (`brew install gh`), run `gh auth login`, then `gh repo create <owner>/digital-classroom-os --private --source . --remote origin`.
2. **Connect it:** `git remote add origin git@github.com:<owner>/digital-classroom-os.git`, or use HTTPS.
3. **First push**, after approval: `git push -u origin main --tags`.
4. **Protect `main`:** require pull requests and passing CI checks (`web`, `e2e`, `backend` jobs); block force-pushes and deletion.
5. **Turn on security features** your plan offers: Dependabot alerts, dependency graph, secret scanning with push protection.
6. **Check the first CI run.** It is the first time Firefox and the full browser matrix run anywhere. Treat any failure as a release blocker until explained.

CI needs no secrets today. When native signing arrives (Phase 12), signing keys go into GitHub encrypted secrets, never into the repository.

## 8. Release flow (Phases 14–15, summary)

1. Freeze: create `release/v0.2.0` from a green `main`.
2. Bump versions in every manifest (root, `apps/web`, Tauri, Cargo, backend API).
3. Run the complete verification suite on the release commit.
4. Tag `v0.2.0-rc1`.
5. Build artifacts and record SHA-256 checksums.
6. Ask the owner for approval.
7. On approval, tag `v0.2.0` on the same commit and publish the release notes and artifacts as agreed.
8. Keep the previous stable tag and its artifacts for rollback.
