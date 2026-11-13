# Backup and recovery

How Classroom OS keeps work safe, how to back it up and restore it, and what to do when something goes wrong. Part 1 is for people using the app. Part 2 is for people developing it. Written in Phase 2 of the v0.2.0 release project; every procedure here is covered by an automated test (see [DATA_SAFETY_REPORT.md](DATA_SAFETY_REPORT.md)).

---

## Part 1 — For users

### 1.1 Where your work lives

Everything you make is stored **in this browser on this device**, in its local database (IndexedDB). Nothing is sent to a server. This has three consequences:

- **Each browser keeps its own copy.** Work made in Chrome is not visible in Safari, and work on your laptop is not on your phone, unless you move it with a backup file.
- **Clearing site data deletes your work.** That includes clearing browsing data, "Reset site", and private or incognito windows when they close.
- **The browser may clear storage when the device runs low on space**, unless storage is persistent. Classroom OS asks for persistent storage once you have work saved. Settings → Storage shows whether it was granted.

**A backup file is the only protection against all three.** Make one regularly and keep it somewhere else, such as a USB drive or a cloud folder.

### 1.2 Making a backup

1. Open **Settings → Backup**.
2. Click **Export backup**. One file is saved, `classroom-os-backup-<date>.json`. It holds every document, diagram, saved version, image of an embedded diagram, favourite and item in the trash.
3. **Check that your browser actually saved the file.** Browsers can't tell the app whether you cancelled the save, so "Last backup exported …" means the export started, not that the file is safe.
4. Copy the file off the device.

The Dashboard reminds you when your last export is older than the interval set in **Settings → General → Backup reminder**.

**Privacy:** a backup file is plain, unencrypted text. It contains everything above, including items in the trash and older versions of your work. Treat it like the documents themselves: don't share it if it contains anything private.

### 1.3 Restoring a backup

1. Open **Settings → Backup → Restore from file** and choose the backup file.
2. The app checks the **whole file first**. If anything in it is damaged, or it was made by a newer version of Classroom OS, **nothing is imported** and the message says why.
3. Restoring **never overwrites** anything on this device:
   - Items that aren't here yet are added.
   - Items already here and unchanged are skipped.
   - If you changed an item since the backup was made, the backed-up version is added **once**, as a separate copy marked "(restored)". Your current version stays as it is.
4. The message reports what happened, for example "3 added, 2 already present, 1 restored as copies".

Restoring the same file twice does not add duplicates. Version history is kept, up to the usual 50 versions per item.

**Moving to a new device or browser:** export on the old one, then restore on the new one.

**Backups from version 0.1.0** restore into this version unchanged. Backups made by this version restore into 0.1.0 only if they contain no embedded diagrams. A document with a diagram needs the newer version, and 0.1.0 refuses that file instead of damaging anything.

### 1.4 Getting earlier work back

| Situation | What to do |
|---|---|
| You want an earlier state of a document or diagram | Open it, click the **Version history** button (clock icon), choose a version and **Restore**. The current state is saved as a version first, so restoring can be undone. Press Ctrl/⌘+S at any time to save a version yourself |
| You deleted something | Open **Trash** and choose **Restore**. Items stay there until you delete them forever |
| You see "Some changes from your last session were not saved" | A save failed earlier, and the unsaved edits were kept as a draft. Click **Recover them**. If you've typed since, they come back as a separate "(recovered)" copy, so nothing you typed is replaced |
| Two tabs edited the same item and the app reports a conflict | Choose **Keep my edits as a copy** or **Discard mine, load latest**. Nothing is overwritten without you choosing |
| A banner says the app was updated in another tab | Your work has been saved. If some edits couldn't be written, they were kept and are offered back after you click **Reload** |

### 1.5 When the app updates how it stores data

Some updates change the layout of the local database. Before changing anything, Classroom OS:

1. **Makes a full copy of your current data on this device.** It appears in **Settings → Storage → Copies kept from before updates**, where you can export it as a backup file or delete it to free space.
2. Then performs the change, all or nothing. If the change fails part-way, it is undone completely.

**If there isn't enough space for the copy**, the update does not start, and a screen titled *"This update needs a safety copy of your data first"* appears instead of the app. Your documents and diagrams are safe and unchanged. You can:
- **Download a backup of everything.** This reads your data without changing it and saves one file you can restore in this version or later. When you're coming from version 0.1.0, that version can restore it too.
- **Free some space, then click Try again.**
- **Update without the on-device copy.** This only appears after you have downloaded the backup file and ticked "I have the backup file saved". The downloaded file then serves as the safety copy. Keep it until you've checked that your work opens normally.

**When an update arrives:** the app works offline, so a new version is downloaded in the background. Existing users of 0.1.0 get the new version once **every Classroom OS tab is closed** and the app is opened again; reloading a tab isn't enough. From this version on, a banner offers **Update now**, and it saves open work before reloading.

**Going back to an older version is not supported.** If 0.1.0 is somehow loaded again after the upgrade, it can't open the upgraded database: its lists stay on "Loading…". Nothing is damaged, and opening the current version again shows everything. To use 0.1.0 again, restore a backup there that it can read (see 1.3).

---

## Part 2 — For developers

### 2.1 Before risky work: back up the repository and local data

Required before any phase that touches storage, migrations or backup code (project rule 6):

```bash
TS=$(date +%Y%m%d-%H%M%S)
git bundle create "backups/repo-before-<phase>-$TS.bundle" --all
git bundle verify "backups/repo-before-<phase>-$TS.bundle"
tar --exclude=node_modules --exclude=dist --exclude=test-results --exclude=coverage \
    --exclude=backups --exclude=.venv -czf "backups/source-before-<phase>-$TS.tar.gz" .
shasum -a 256 backups/*-$TS.*
```

`backups/` is git-ignored. Copy important bundles off the machine as well.

Also export a backup from any browser profile whose data matters, for example the dev server at `http://localhost:5173` (Settings → Backup). Browser data is not part of the repository.

### 2.2 Restoring the repository

```bash
git clone backups/repo-before-<phase>-<ts>.bundle restored-repo   # full history, all branches and tags
# or, inside the existing repository, fetch a branch back from the bundle:
git fetch backups/repo-before-<phase>-<ts>.bundle main:recovered-main
```

The `.tar.gz` holds the working tree exactly as it was, including uncommitted files.

### 2.3 Rules for database changes

- **Migrations only add.** `MIGRATIONS[i](db, tx)` upgrades version *i* → *i + 1* inside IndexedDB's upgrade transaction. Never delete or rewrite a store or record. Never edit a migration that has shipped.
- **Copy before upgrading.** The adapter makes and verifies a full copy (`<db>-backup-v<old>`) before every upgrade. A later attempt never replaces or removes an earlier complete copy; it uses `-2`, `-3`, …. If the copy can't be made, the app shows the recovery screen (§1.5) and does not upgrade.
- **All or nothing.** An error inside a migration aborts the whole upgrade transaction, so the database stays at the old version.
- **Versioned content.** Document and diagram content carry their own `schemaVersion`. Content from a newer app opens read-only and is never saved over.
- **Tests required:**
  - unit tests with fake-indexeddb against the frozen v0.1.0 fixtures (`tests/fixtures/v0.1.0`)
  - the real-browser upgrade test (§2.4)
  - backup round trips (`e2e/backup-restore.spec.ts`)

### 2.4 Verifying backup, restore and upgrades

| What | Command | What it proves |
|---|---|---|
| Storage unit tests | `npx vitest run packages/local-storage tests/integration` | Transactions, conflicts, versions and pruning, drafts, backup validation, idempotent import, the v1 → v2 migration with its safety copy, the recovery paths when the copy or the upgrade fails |
| Backup round trip in real browsers | `npx playwright test e2e/backup-restore.spec.ts --project=chromium --project=webkit` | Data created through the UI is exported, restored into an empty browser profile and checked to be identical: items, versions, favourites, trash, attachments, images and diagram previews. Also checks that restoring again adds nothing, that a changed item comes back as one copy, and that damaged or newer files are refused without changes |
| Upgrade from v0.1.0 in a real browser | `npm run test:upgrade` | Builds v0.1.0 from tag `v0.1.0-baseline` and creates data through its UI. It then upgrades the same Chromium profile to the current build on the same origin and checks that every record is identical, the safety copy is complete, everything opens and backups work. It also observes a downgrade and runs the low-space recovery flow |

`npm run test:upgrade` notes:
- **First run:** it runs `npm ci` and a build for v0.1.0 in a temporary git worktree, which it then removes.
- **Caching:** set `UPGRADE_TEST_CACHE` to keep the built v0.1.0 between runs. The port is `UPGRADE_TEST_PORT` (default 4180); 5173 is refused, to protect the dev server's data.
- **What it touches:** it uses temporary browser profiles only and rewrites `apps/web/dist`.
- **Low space is simulated:** the low-space part makes IndexedDB writes fail in a throwaway profile, because Chromium's quota override has no effect under Playwright. A real "disk full" has not been reproduced.
