# Data safety report — Phase 2

| | |
|---|---|
| Date | 2026-11-13 |
| Starting point | `2ccff35` (Phase 1 audit), tag `v0.1.0-baseline` for the upgrade test |
| Scope | Repository hygiene, secrets and private data, backup and restore, survival of existing user data across the upgrade from v0.1.0 |
| Companion documents | [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) · [GIT_WORKFLOW.md](GIT_WORKFLOW.md) |

## 1. Summary

- **No secrets, keys, credentials or `.env` files** exist anywhere in the repository's history or on disk. The only personal detail was the macOS user name inside a local path in an audit note. It is removed from the current file and remains in one historical commit (see §3).
- **Backup and restore are proven end to end in real browsers** (Chromium and WebKit). Data created through the UI comes back identical in an empty browser profile:
  - every item and version
  - favourites and trash
  - inserted images and embedded diagram previews

  Restoring again adds nothing. Damaged or newer files are refused without changing anything.
- **Existing v0.1.0 user data survives the upgrade, proven in a real browser.** v0.1.0 is built from its git tag, data is created through its UI, and the same browser profile is opened with the current build on the same origin. Every v0.1.0 record is byte-identical afterwards, and a verified safety copy exists. Everything opens and edits.
- **Six data-safety defects were fixed**, each with a regression test that fails without the fix:
  - three from the Phase 1 audit (STOR-R5, R6, R7)
  - one found while fixing (a failed migration could leave a half-upgraded database)
  - two found by this phase's independent review (two tabs upgrading at once could remove the safety copy; repeated retries used up space)

  One misleading message was corrected (STOR-R9).
- **Known limits** are listed in §7, chiefly: low disk space was simulated, not real; Firefox is still unverified; nothing has been pushed anywhere.

## 2. Git and repository

| Check | Result | How |
|---|---|---|
| Integrity | ✅ `git fsck --full --strict` clean; 7 commits, linear from the baseline; no hooks | run 2026-11-13 |
| Commits named in the brief | ✅ `f50b0d4` and `ea7f316` present and intact | `git cat-file`, `git show --stat` |
| Backup before changes | ✅ `backups/repo-before-phase2-20261113-094619.bundle` (verified, 3 refs) and `backups/source-before-phase2-20261113-094619.tar.gz` | SHA-256 `708c37e2…0eda69` and `ee25037c…a7fa612` |
| Remote | None. Nothing pushed | `git remote -v` |
| Identity | Placeholder on every commit; no `user.name`/`user.email` | waiting for the owner |
| `.gitignore` | Hardened. Added `.env*` (except `.env.example`), keys and signing files (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `*.jks`, provisioning profiles, `google-services.json`), local databases (`*.db`, `*.sqlite*`), Android outputs, user backup files saved into the project root (`/classroom-os-*.json`), tool caches. No tracked file matches the new patterns | `git ls-files -ci --exclude-standard` empty |

## 3. Secrets and private data

**Method.**
- **History:** every blob in every commit (`git log --all -p`) and every file on disk, including git-ignored folders (`backups/`, test output; dependency folders excluded), was searched for AWS, GitHub, OpenAI, Slack and Google key formats, private-key blocks, bearer tokens, and `api_key` / `secret` / `password` / `token` assignments.
- **Files:** a search for `.env`, key, keystore and database files.
- **Personal details:** a search for the owner's name and e-mail.

**Results.**

| Finding | Where | Action |
|---|---|---|
| No secrets of any kind | history and disk | — |
| No credential, key or database files | disk | — |
| The owner's e-mail and name appear nowhere | history and disk | — |
| The macOS user name inside an absolute path (`/Users/<name>/…`), 3 lines | `docs/audit/FINDINGS.md`, introduced in `8766e18` | Replaced with "the repository root" in the current file. **Still present in that historical commit.** Removing it means rewriting history, which changes every later hash, including `f50b0d4` and `ea7f316`. That is only possible before the first push and needs the owner's decision ([GIT_WORKFLOW.md](GIT_WORKFLOW.md) §6) |
| `backups/indexeddb-localhost5173-2026-11-13.json` | git-ignored | An empty export (no items); contains no personal data |
| Test fixtures | `tests/fixtures/v0.1.0` | Synthetic names and text only |

## 4. Backup and restore

**What was verified, and how:**

| Check | Evidence |
|---|---|
| Full round trip through the UI in a real browser: document from a template with typed text, an inserted image, an embedded diagram, a saved version and later edits; an edited diagram; a favourite; an item in the trash | `e2e/backup-restore.spec.ts` (Chromium, WebKit). The exported file is checked (format 2, counts match the database). Restoring into an **empty browser profile** gives every store deep-equal to the original: items, versions, list index, attachments byte for byte. The image and the diagram preview render, and the diagram opens with its edit |
| Restoring the same file again adds nothing | same test: stores deep-equal before and after |
| After a local edit, restoring adds exactly one "(restored)" copy, with the full history, and leaves the edited item and its history untouched | same test |
| Damaged (truncated) file, a file from a newer version, a file with invalid content: refused with a clear reason, nothing changed | same test |
| Validation, all-or-nothing, idempotency, attachments (including bytes already stored under another id), v0.1.0 backups still import, current backups import into v0.1.0 when they hold no schema-2 content | `packages/local-storage/src/indexeddb.test.ts`, `tests/integration/v0.1.0-fixtures.test.ts` |
| A backup made by the upgraded app re-imports into a fresh profile identically (items and versions compared record by record) | `npm run test:upgrade` |

**Fixed in this phase:**

| Id | Problem | Fix | Test |
|---|---|---|---|
| STOR-R7 | A backup whose item or version content was text, a list, null or a number imported as a blank item | Content must be an object; the whole file is refused, and the message names the item | 6 unit tests; e2e refusal step |
| STOR-R6 | Import could leave more than 50 versions per item; the Restore text promised "importing the same file twice adds nothing", which was false after a local edit | Import prunes each imported item to 50 versions in the same transaction, never touching protected versions. The text now describes exactly what happens | 2 unit tests; e2e checks the text and each claim |
| STOR-R9 | "Last backup" was recorded when the download started; browsers can't confirm the file was saved | All wording says "exported", and the toast asks the user to check the file was saved | e2e |
| — | A damaged file showed the browser's raw parse error | Plain "could not be read as a backup" message | e2e (Chromium, WebKit) |

## 5. Upgrades: existing user data

**Real-browser upgrade test (`npm run test:upgrade`).** The script works in a disposable Chromium profile, step by step:
1. It builds v0.1.0 from tag `v0.1.0-baseline` in a temporary worktree, using that tag's own lockfile.
2. It serves v0.1.0 and the current build one after the other on the **same origin**, as a real user would see it.
3. Through the v0.1.0 UI it creates:
   - a document from each of the 5 templates with typed text, an image and a saved version
   - 4 diagrams with edits and a saved version
   - a favourite, an item in the trash, and the dark theme
4. It upgrades the same profile to the current build and checks the result (54 checks in the last run):

- Database version 2, and **every v0.1.0 record in every store deep-equal** to before (documents, diagrams, both version stores, meta). The store layouts are unchanged.
- List index built for every item, with matching title, favourite, trash and version.
- **Safety copy `digital-classroom-os-backup-v1` complete**, with every record identical.
- Every document and diagram opens editable with its content. Versions, favourite, trash and theme are kept.
- A document without diagrams keeps content schema 1 after being opened and edited, so v0.1.0 can still read it.
- Backup export from the upgraded app works and re-imports identically into a fresh profile.

**Observed behaviour (recorded, not changed):**
- **The update arrives only after every tab is closed.** v0.1.0 has no update banner. When the current build is published, a v0.1.0 user keeps running v0.1.0 through reloads; the current app, and with it the database upgrade, starts only after **every Classroom OS tab has been closed** and the app is opened again. From this version on, an "Update now" banner offers updates.
- **Downgrade is not supported, but harmless.** Going back to v0.1.0 after the upgrade: v0.1.0 cannot open the upgraded database, and its lists stay on "Loading…". **No data is damaged:** every database was deep-equal before and after, and opening the current build again shows everything.
- **A tab still running v0.1.0** during the upgrade: edits typed there between the safety copy and that tab's reload reach the upgraded database but not the copy. Nothing is lost; the copy is a few seconds older than the data.

**Fixed in this phase:**

| Id | Problem | Fix | Test |
|---|---|---|---|
| STOR-R5 | If the safety copy before an upgrade failed (e.g. the device is full), every storage call failed, including export, with no way out | Nothing is upgraded without a backup. A recovery screen offers: download a backup read **read-only** from the old database (this version and v0.1.0 can restore it); try again; or update without the on-device copy, only after that file was downloaded and the user confirms it is saved. Only an incomplete copy the attempt itself made is removed | 11 storage tests and 3 screen tests; real browser on a simulated full disk |
| new | An error inside a migration did not abort the upgrade, so the database could end at version 2 with a half-built list index | The upgrade transaction is aborted on any migration error; the database stays at version 1, unchanged | unit test; reproduced at the old commit first |
| new (review) | **Two tabs opening the update at once** could make the second tab delete or replace the first tab's safety copy after the first had upgraded, leaving no copy. The second tab then wrongly said nothing had changed | Copy and upgrade run under a cross-tab lock (Web Locks API); a tab that waited sees the upgrade is done and just opens. Each copy gets a name no database has yet, and an attempt only deletes a copy it created itself | unit test that **fails without the lock** and passes with it |
| new (review) | Each "Try again" after a failed upgrade step made another full copy, using up space on a full device | A retry reuses the complete copy this session already made | unit test |
| new (review) | "Open in another tab" stayed on screen for every later attempt once shown | Cleared at the start of each attempt and on success | — (single-line state reset) |

## 6. Verification run

Final run on the Phase 2 change set:

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | ✅ 0 errors |
| Unit and integration (`vitest run`) | ✅ 18 files, **233/233** passed (211 at the start of the phase) |
| Browser tests (Chromium, WebKit, mobile Chromium) | ✅ **58 passed**, 3 skipped by design (includes the new backup round trip in Chromium and WebKit) |
| Real-browser upgrade from v0.1.0 (`npm run test:upgrade`) | ✅ **54/54** checks passed, exit 0 |
| Production build | ✅ |
| Licence gate | ✅ 106 production packages, all allowed |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Backend (`pytest`) | ✅ 3/3 passed |
| Leftover git worktrees after the upgrade test | ✅ none (only `main`); the run folder of a passing run is removed |

## 7. Limits of this verification

- **Low disk space was simulated.** In a throwaway profile, IndexedDB writes are made to throw `QuotaExceededError`, because Chromium's quota override has no effect under Playwright. A real full disk has not been reproduced. One path is untested in a browser: if the disk fills exactly as the upgrade commits, the browser may report a generic abort instead of a quota error. The recovery screen then says the copy or upgrade "could not be made" and names a full device as a common cause, rather than stating it.
- **Two-tab safety depends on the Web Locks API.** It is available in all current browsers (Chrome/Edge 69+, Safari 15.4+, Firefox 96+). Older browsers run without the lock, as before this phase.
- **Firefox remains unverified.** It cannot launch on this machine, and CI has never run because there is no remote.
- **The upgrade test covers Chromium only.** The backup round trip covers Chromium and WebKit.
- **No native shells.** Desktop and Android storage (SQLite) don't exist yet; their backup and upgrade paths belong to Phase 12.
- **Data at rest and backup files are unencrypted** (audit STOR-R10). This is unchanged and is documented for users in [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md).
- **Phase 3 items not done here:** the remaining storage findings belong to architecture and storage hardening:
  - STOR-R1 (a draft from an earlier session can be overwritten)
  - STOR-R2 (storage-full status is misleading)
  - STOR-R3 (attachments never cleaned up)
  - STOR-R4 (images copied into every version)
  - STOR-R8 (edits to an item purged in another tab)
