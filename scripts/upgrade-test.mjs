#!/usr/bin/env node
/**
 * Real-browser upgrade test: v0.1.0 (git tag v0.1.0-baseline) → the current build, on the same origin and
 * the same browser profile, exactly as an existing user would get it.
 *
 *   npm run test:upgrade
 *
 * 1. Builds v0.1.0 from the tag in a temporary git worktree (its own lockfile, `npm ci`), caches the built app
 *    and removes the worktree. The working tree is never touched. Builds the current app with `npm run build`.
 * 2. Serves v0.1.0 on http://127.0.0.1:<port> and creates realistic data through its UI in Chromium
 *    (a persistent profile in a temporary folder): a document from every template with typed text, an image,
 *    a manual version, diagrams from several templates with edits, a favourite, a trashed item, a theme.
 * 3. Stops v0.1.0, serves the current build on the same origin, reopens the same profile and records what the
 *    old service worker does while driving it like a user (reload, close and reopen, restart the browser).
 * 4. Checks that every v0.1.0 record survived the upgrade unchanged, the safety copy, the list index, the UI
 *    (every item opens editable with its content), versions, favourite, trash, theme, backup export and
 *    re-import into a fresh profile.
 * 5. Observes going back to v0.1.0 on the same origin (downgrade) and then forward again, and checks that no
 *    data was damaged.
 * 6. Phase 7 (ADR 0014): builds the Phase 6 app (git 650cf63, database version 2) the same way, creates Phase 6 data
 *    through its UI in a fresh profile (a document with an embedded diagram, so a stored preview attachment, and a
 *    manual version; an edited diagram; a kept draft and an attachment alias written the way Phase 6 writes them),
 *    upgrades it with the current build (database version 3: nothing changed, the two presentation stores added, a
 *    verified "-backup-v2" safety copy), adds a presentation, and then goes back to the Phase 6 build: it cannot open
 *    the database (VersionError) and no database changes.
 *
 * Exits non-zero when any check fails. Never touches the real browser profile or the dev server on :5173.
 *
 * Environment:
 *   UPGRADE_TEST_CACHE       cache folder (default: <os tmp>/dcos-upgrade-test); the built v0.1.0 is kept there
 *   UPGRADE_TEST_PORT        port to serve on (default 4180)
 *   UPGRADE_TEST_SKIP_BUILD  1 = use the existing apps/web/dist instead of running `npm run build`
 *   UPGRADE_TEST_KEEP        1 = keep the browser profiles and the run folder (a failed run always keeps its report)
 *   UPGRADE_TEST_HEADED      1 = show the browser
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = 'v0.1.0-baseline';
/** The Phase 6 commit (database version 2), the last build before presentations. */
const PHASE6_REF = '650cf63';
const CACHE = resolve(process.env.UPGRADE_TEST_CACHE || join(tmpdir(), 'dcos-upgrade-test'));
const PORT = Number(process.env.UPGRADE_TEST_PORT || 4180);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const KEEP = process.env.UPGRADE_TEST_KEEP === '1';
const HEADED = process.env.UPGRADE_TEST_HEADED === '1';
const DB = 'digital-classroom-os';
const SAFETY_COPY = `${DB}-backup-v1`;
const V1_STORES = ['documents', 'diagrams', 'document_versions', 'diagram_versions', 'meta'];
const ITEM_STORES = ['documents', 'diagrams', 'document_versions', 'diagram_versions'];
const PNG = makePng(24, 16);
/** The database version the current build upgrades to, read from its source so this test follows it. */
const SCHEMA_VERSION = Number(/export const SCHEMA_VERSION = (\d+);/.exec(readFileSync(join(ROOT, 'packages/local-storage/src/indexeddb.ts'), 'utf8'))?.[1]);
if (!Number.isInteger(SCHEMA_VERSION)) throw new Error('Could not read SCHEMA_VERSION from packages/local-storage/src/indexeddb.ts');
/** Every item and version store of the current build (Phase 7 adds the presentation stores). */
const CURRENT_ITEM_STORES = ['documents', 'diagrams', 'presentations'];
const CURRENT_VERSION_STORES = ['document_versions', 'diagram_versions', 'presentation_versions'];

/** A small solid-colour PNG, encoded here so the test needs no image files. */
function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x4f)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

if (PORT === 5173) throw new Error('Port 5173 belongs to the dev server; choose another UPGRADE_TEST_PORT');
mkdirSync(CACHE, { recursive: true });
const RUN = mkdtempSync(join(CACHE, 'run-'));

// ── Reporting ───────────────────────────────────────────────────────────────────────────────────────

const checks = [];
const observations = [];
const log = (msg) => console.log(`  ${msg}`);
const phase = (title) => console.log(`\n▶ ${title}`);
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  return !!ok;
}
function observe(text) {
  observations.push(text);
  console.log(`  NOTE  ${text}`);
}
async function attempt(name, fn) {
  try {
    return await fn();
  } catch (err) {
    check(name, false, String(err?.message ?? err).split('\n')[0]);
    return undefined;
  }
}

// ── Builds ──────────────────────────────────────────────────────────────────────────────────────────

const sh = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const shLoud = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

const buildV010 = () => buildBaseline(TAG, 'v0.1.0', 'v0.1.0-dist', 'v010');
const buildPhase6 = () => buildBaseline(PHASE6_REF, 'Phase 6', 'phase6-dist', 'phase6');

/** Builds an older version from git in a temporary worktree (cached by commit), as a user had it. */
function buildBaseline(ref, label, distName, srcName) {
  const TAG = ref;
  const commit = sh('git', ['rev-parse', `${ref}^{commit}`]);
  const dist = join(CACHE, distName);
  const stampFile = join(CACHE, `${distName}.commit`);
  if (existsSync(join(dist, 'index.html')) && existsSync(stampFile) && readFileSync(stampFile, 'utf8').trim() === commit) {
    log(`${label} build reused from ${dist}`);
    return dist;
  }
  const src = join(CACHE, srcName);
  const isWorktree = existsSync(join(src, '.git'));
  if (isWorktree) {
    if (sh('git', ['rev-parse', 'HEAD'], src) !== commit) throw new Error(`${src} is not at ${TAG}; remove it and run again`);
  } else {
    if (existsSync(src)) throw new Error(`${src} exists but is not a git worktree; remove it and run again`);
    log(`git worktree add --detach ${src} ${TAG}`);
    sh('git', ['worktree', 'add', '--detach', src, TAG]);
  }
  try {
    if (!existsSync(join(src, 'node_modules'))) {
      log(`npm ci (${label} lockfile)`);
      shLoud('npm', ['ci', '--no-audit', '--no-fund', '--prefer-offline'], src);
    }
    log(`npm run build (${label})`);
    shLoud('npm', ['run', 'build'], src);
    rmSync(dist, { recursive: true, force: true });
    cpSync(join(src, 'apps/web/dist'), dist, { recursive: true });
    writeFileSync(stampFile, commit);
  } finally {
    sh('git', ['worktree', 'remove', '--force', src]);
    log('worktree removed');
  }
  return dist;
}

function buildCurrent() {
  if (process.env.UPGRADE_TEST_SKIP_BUILD !== '1') {
    log('npm run build (current)');
    shLoud('npm', ['run', 'build'], ROOT);
  }
  // A private copy, so a build started elsewhere during the run cannot change what is served.
  const dist = join(RUN, 'current-dist');
  cpSync(join(ROOT, 'apps/web/dist'), dist, { recursive: true });
  return dist;
}

/** The entry script of a build, used to tell which app a page is running. */
function entryOf(dist) {
  const m = readFileSync(join(dist, 'index.html'), 'utf8').match(/src="\.\/assets\/(index-[^"]+\.js)"/);
  if (!m) throw new Error(`No entry script in ${dist}/index.html`);
  return m[1];
}

// ── Static server: one origin, different builds one after the other ──────────────────────────────────

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};
let server = null;
let served = null;
async function serve(dir, label) {
  await stopServing();
  const root = resolve(dir) + sep;
  server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  });
  await new Promise((ok, fail) => {
    server.once('error', (err) => fail(err.code === 'EADDRINUSE' ? new Error(`Port ${PORT} is in use; set UPGRADE_TEST_PORT`) : err));
    server.listen(PORT, '127.0.0.1', ok);
  });
  served = label;
  log(`serving ${label} on ${ORIGIN}`);
}
async function stopServing() {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((ok) => server.close(ok));
  server = null;
  log(`stopped serving ${served}`);
}

// ── Browser helpers ─────────────────────────────────────────────────────────────────────────────────

const profiles = [];
const consoleErrors = [];
const openContexts = new Set(); // closed at the end even when a step throws, before their profiles are removed
async function launch(profileDir) {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !HEADED,
    acceptDownloads: true,
    viewport: { width: 1280, height: 860 },
    serviceWorkers: 'allow',
  });
  openContexts.add(context);
  context.on('close', () => openContexts.delete(context));
  context.on('page', (p) => watch(p));
  context.pages().forEach(watch);
  return context;
}
function watch(page) {
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push({ app: served, text: m.text().slice(0, 300) }));
  page.on('pageerror', (e) => consoleErrors.push({ app: served, text: `pageerror: ${String(e.message).slice(0, 300)}` }));
}
const pageOf = async (context) => context.pages()[0] ?? (await context.newPage());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, timeout = 20_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn().catch(() => undefined);
    if (last) return last;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
async function gotoHash(page, hash) {
  await page.goto(`${ORIGIN}/#${hash}`);
  await page.waitForSelector('#root > *', { timeout: 30_000 });
}

/** Reads IndexedDB from inside the page. Never creates or upgrades a database. */
async function idb(page, op) {
  return page.evaluate(async (op) => {
    const req = (r) => new Promise((ok, fail) => ((r.onsuccess = () => ok(r.result)), (r.onerror = () => fail(r.error))));
    const openExisting = (name) =>
      new Promise((ok, fail) => {
        const r = indexedDB.open(name);
        r.onupgradeneeded = () => r.transaction.abort(); // it does not exist: do not create it
        r.onsuccess = () => ok(r.result);
        r.onerror = () => (r.error?.name === 'AbortError' ? ok(null) : fail(r.error));
      });
    const plain = (v) => {
      if (v instanceof ArrayBuffer) {
        let s = '';
        for (const b of new Uint8Array(v)) s += String.fromCharCode(b);
        return { __bytes: btoa(s) };
      }
      if (Array.isArray(v)) return v.map(plain);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
      return v;
    };
    if (op.op === 'list') return (await indexedDB.databases()).map((d) => ({ name: d.name, version: d.version }));
    if (op.op === 'localStorage') return Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
    const names = op.db ? [op.db] : (await indexedDB.databases()).map((d) => d.name);
    const out = {};
    for (const name of names) {
      const db = await openExisting(name);
      if (!db) continue;
      try {
        const entry = { version: db.version, stores: {}, layout: {} };
        for (const s of op.store ? [op.store] : Array.from(db.objectStoreNames)) {
          if (!db.objectStoreNames.contains(s)) continue;
          const st = db.transaction(s, 'readonly').objectStore(s);
          entry.layout[s] = { keyPath: st.keyPath, indexes: Array.from(st.indexNames).sort() };
          entry.stores[s] = plain(op.id !== undefined ? [await req(st.get(op.id))].filter((x) => x !== undefined) : await req(st.getAll()));
        }
        out[name] = entry;
      } finally {
        db.close();
      }
    }
    return out;
  }, op);
}
const record = async (page, store, id) => (await idb(page, { db: DB, store, id }))[DB]?.stores[store]?.[0] ?? null;
const allOf = async (page, store) => (await idb(page, { db: DB, store }))[DB]?.stores[store] ?? [];
const dbVersion = async (page) => (await idb(page, { op: 'list' })).find((d) => d.name === DB)?.version ?? 0;
/** Every item (or version) record of every kind; stores a build does not have read as empty. */
const allItemsOf = async (page) => (await Promise.all(CURRENT_ITEM_STORES.map((s) => allOf(page, s)))).flat();
const allVersionsOf = async (page) => (await Promise.all(CURRENT_VERSION_STORES.map((s) => allOf(page, s)))).flat();

async function swState(page) {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    return {
      controlled: !!navigator.serviceWorker?.controller,
      active: reg?.active?.state ?? null,
      waiting: !!reg?.waiting,
      installing: !!reg?.installing,
    };
  });
}

let ENTRY = {};
async function whichApp(page) {
  await page.waitForSelector('#root > *', { timeout: 30_000 }).catch(() => undefined);
  const scripts = await page.evaluate(() => Array.from(document.scripts, (s) => s.src));
  if (scripts.some((s) => s.endsWith(ENTRY.v010))) return 'v0.1.0';
  if (scripts.some((s) => s.endsWith(ENTRY.current))) return 'current';
  if (ENTRY.phase6 && scripts.some((s) => s.endsWith(ENTRY.phase6))) return 'phase6';
  return `unknown (${scripts.join(', ')})`;
}
const bodyText = async (page) => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();

/** What a user sees right now, for the observation log. */
async function snapshot(page, step) {
  const app = await whichApp(page);
  const sw = await swState(page).catch(() => null);
  const version = await dbVersion(page).catch(() => 'unreadable');
  const text = (await bodyText(page).catch(() => '')).slice(0, 160);
  observe(
    `${step}: page runs ${app}; service worker ${sw ? `controls=${sw.controlled} active=${sw.active} waiting=${sw.waiting} installing=${sw.installing}` : 'unknown'}; database version ${version}; screen: "${text}"`,
  );
  return app;
}

// ── v0.1.0 data creation, through its UI ────────────────────────────────────────────────────────────

async function createFromDialog(page, kind, index) {
  await gotoHash(page, '/');
  await page.getByRole('button', { name: kind === 'document' ? 'New document' : 'New diagram' }).first().click();
  const buttons = page.locator('dialog[open] .grid > button');
  await buttons.first().waitFor();
  const names = await buttons.locator('span.font-semibold').allTextContents();
  if (index >= names.length) return null;
  await buttons.nth(index).click();
  await page.waitForURL(new RegExp(`#/${kind}s/[^/]+$`));
  return { id: page.url().split('/').pop(), template: names[index], count: names.length };
}

async function typeInDocument(page, text) {
  const body = page.locator('[aria-label="Document body"]');
  await body.waitFor();
  await body.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(` ${text}`);
}

async function addDiagramShape(page, text) {
  const nodes = page.locator('.react-flow__node');
  await nodes.first().waitFor();
  const before = await nodes.count();
  await nodes.first().click();
  await page.getByRole('button', { name: 'Add child (Tab)' }).click();
  await until(async () => (await nodes.count()) > before, 'the new shape');
  const editor = page.locator('textarea[aria-label="Shape text"]');
  if (!(await editor.isVisible())) await page.keyboard.press('F2');
  if (!(await editor.isVisible().catch(() => false))) await nodes.last().dblclick();
  await editor.waitFor({ timeout: 5000 });
  await editor.fill(text);
  await editor.press('Enter');
}

const contains = (rec, text) => !!rec && JSON.stringify(rec).includes(text);
const manualVersionsOf = async (page, store, id) => (await allOf(page, store)).filter((v) => v.itemId === id && v.reason === 'manual');

async function createV010Data(page) {
  const created = { documents: [], diagrams: [] };

  // A document from every template, each with typed text.
  for (let i = 0; ; i++) {
    const doc = await createFromDialog(page, 'document', i);
    if (!doc) break;
    const marker = `UPGRADE-DOC-${i}`;
    await typeInDocument(page, `${marker} typed in v0.1.0`);
    await until(async () => contains(await record(page, 'documents', doc.id), marker), `document ${i} to save`);
    created.documents.push({ ...doc, marker });
    log(`document "${doc.template}" created and typed in`);
  }

  // An image and a manual version in the first document (blank: it has no diagrams).
  const withImage = created.documents[0];
  await gotoHash(page, `/documents/${withImage.id}`);
  await page.locator('[aria-label="Document body"]').waitFor();
  await page.locator('[aria-label="Document body"] p').last().click();
  await page.locator('input[type=file][accept*="image/png"]').setInputFiles({ name: 'upgrade-test.png', mimeType: 'image/png', buffer: PNG });
  await until(async () => contains(await record(page, 'documents', withImage.id), 'data:image/png'), 'the image to save');
  withImage.image = true;
  await page.keyboard.press('Control+s');
  await until(async () => (await manualVersionsOf(page, 'document_versions', withImage.id)).length > 0, 'the manual version');
  withImage.manualVersion = true;
  log('image inserted and manual version saved (Ctrl+S)');

  // Diagrams from several templates, each edited (index 0 is the blank canvas, which has no shape to extend).
  for (let i = 1; i <= 4; i++) {
    const dia = await createFromDialog(page, 'diagram', i);
    if (!dia) break;
    const marker = `UPGRADE-DIA-${i}`;
    await addDiagramShape(page, marker);
    await until(async () => contains(await record(page, 'diagrams', dia.id), marker), `diagram ${i} to save`);
    created.diagrams.push({ ...dia, marker });
    log(`diagram "${dia.template}" created and edited`);
  }
  await page.keyboard.press('Control+s');
  const lastDiagram = created.diagrams.at(-1);
  await until(async () => (await manualVersionsOf(page, 'diagram_versions', lastDiagram.id)).length > 0, 'the diagram manual version');
  lastDiagram.manualVersion = true;

  // One favourite.
  const favourite = created.documents.find((d) => d.template === 'Essay') ?? created.documents[1];
  await gotoHash(page, '/documents');
  const favRow = page.locator('div.group', { has: page.getByText(favourite.template, { exact: true }) }).first();
  await favRow.hover();
  await favRow.getByRole('button', { name: 'Favorite' }).click();
  await until(async () => (await record(page, 'documents', favourite.id))?.favorite === true, 'the favourite');
  favourite.favorite = true;
  log(`"${favourite.template}" marked as favourite`);

  // One trashed item.
  const trashed = await createFromDialog(page, 'document', 0);
  const trashTitle = 'Upgrade test trashed item';
  await page.locator('input[aria-label="document title"]').fill(trashTitle);
  await until(async () => (await record(page, 'documents', trashed.id))?.title === trashTitle, 'the rename');
  await gotoHash(page, '/documents');
  const trashRow = page.locator('div.group', { has: page.getByText(trashTitle, { exact: true }) }).first();
  await trashRow.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await until(async () => !!(await record(page, 'documents', trashed.id))?.deletedAt, 'the item to move to trash');
  created.trashed = { ...trashed, title: trashTitle };
  log('one document moved to trash');

  // A theme preference.
  await gotoHash(page, '/');
  await page.getByRole('radio', { name: 'Dark theme' }).first().click();
  await until(async () => (await idb(page, { op: 'localStorage' }))['dcos.theme'] === 'dark', 'the theme preference');
  log('dark theme chosen');
  return created;
}

// ── Checks after the upgrade ────────────────────────────────────────────────────────────────────────

const byId = (records) => new Map(records.map((r) => [r.id ?? r.key, r]));
function sameRecords(a = [], b = []) {
  if (a.length !== b.length) return false;
  const mb = byId(b);
  return a.every((r) => isDeepStrictEqual(r, mb.get(r.id ?? r.key)));
}

async function checkStoredData(page, before) {
  const after = await idb(page, {});
  const old = before[DB];
  const now = after[DB];
  check(`database is at version ${SCHEMA_VERSION} after the upgrade`, now?.version === SCHEMA_VERSION, `version ${now?.version}`);
  for (const s of ITEM_STORES) check(`every v0.1.0 record in "${s}" is unchanged`, sameRecords(old.stores[s], now?.stores[s]), `${old.stores[s].length} records`);
  const metaNow = byId(now?.stores.meta ?? []);
  check('every v0.1.0 meta record is unchanged', old.stores.meta.every((m) => isDeepStrictEqual(m, metaNow.get(m.key))));
  check('the upgrade is recorded (meta migratedFrom = 1@…)', /^1@/.test(metaNow.get('migratedFrom')?.value ?? ''));
  for (const s of V1_STORES) check(`store "${s}" keeps its v0.1.0 layout`, isDeepStrictEqual(old.layout[s], now?.layout[s]));

  const items = [...old.stores.documents, ...old.stores.diagrams];
  const index = byId(now?.stores.item_index ?? []);
  check('item_index has a row for every item', items.length === index.size && items.every((i) => index.has(i.id)), `${index.size} rows for ${items.length} items`);
  check(
    'item_index rows match title, favourite and trash state',
    items.every((i) => {
      const row = index.get(i.id);
      return row && row.title === i.title && row.favorite === i.favorite && row.deletedAt === i.deletedAt && row.version === i.version && !('content' in row);
    }),
  );

  const copy = after[SAFETY_COPY];
  check(`safety copy database "${SAFETY_COPY}" exists`, !!copy);
  if (copy) {
    for (const s of V1_STORES) check(`safety copy of "${s}" is identical to the v0.1.0 data`, sameRecords(old.stores[s], copy.stores[s]), `${copy.stores[s]?.length ?? 0} records`);
    const info = copy.stores.__copy?.[0];
    check('safety copy records where it came from', info?.fromVersion === 1 && info?.source === DB);
  }
  return after;
}

async function checkUi(page, created, before) {
  // Theme, favourite and trash first, before anything is edited.
  await gotoHash(page, '/');
  check('theme preference kept (dark)', (await idb(page, { op: 'localStorage' }))['dcos.theme'] === 'dark' && (await page.evaluate(() => document.documentElement.classList.contains('dark'))));
  const fav = created.documents.find((d) => d.favorite);
  await gotoHash(page, '/favorites');
  check('favourite listed under Favourites', await page.getByText(fav.template, { exact: true }).first().isVisible({ timeout: 10_000 }).catch(() => false));
  await gotoHash(page, '/trash');
  check('trashed item listed in Trash', await page.getByText(created.trashed.title, { exact: true }).first().isVisible({ timeout: 10_000 }).catch(() => false));
  await gotoHash(page, '/documents');
  await page.getByText(created.documents.at(-1).template, { exact: true }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('trashed item not listed among documents', !(await page.getByText(created.trashed.title, { exact: true }).count()));

  const oldDocs = byId(before[DB].stores.documents);
  for (const [i, doc] of created.documents.entries()) {
    await attempt(`document "${doc.template}" opens editable with its content`, async () => {
      await gotoHash(page, `/documents/${doc.id}`);
      const body = page.locator('[aria-label="Document body"]');
      await body.waitFor({ timeout: 15_000 });
      await until(async () => (await body.innerText()).includes(doc.marker), 'the typed text');
      const editable = (await body.getAttribute('contenteditable')) === 'true';
      const image = doc.image ? (await body.locator('img[src^="data:image/png"]').count()) > 0 : true;
      await sleep(800);
      const opened = await record(page, 'documents', doc.id);
      if (!isDeepStrictEqual(opened, oldDocs.get(doc.id))) observe(`opening "${doc.template}" without typing changed its stored record (version ${oldDocs.get(doc.id).version} → ${opened.version})`);
      const marker = `AFTER-UPGRADE-DOC-${i}`;
      await typeInDocument(page, marker);
      const saved = await until(async () => {
        const r = await record(page, 'documents', doc.id);
        return contains(r, marker) && r;
      }, 'the edit to save');
      check(`document "${doc.template}" opens editable with its content`, editable && image && saved.version > oldDocs.get(doc.id).version, `${doc.image ? 'image shown, ' : ''}edit saved as v${saved.version}`);
      if (i === 0) {
        const schema = saved.content?.schemaVersion;
        check('a document without diagrams keeps content.schemaVersion 1 after being opened and edited (v0.1.0 can still open it)', schema === 1, `schemaVersion ${schema}`);
      }
    });
  }

  // Version history of the document with the manual version, in the UI and in storage.
  const withVersion = created.documents.find((d) => d.manualVersion);
  await attempt('version history lists every version, including the manual one', async () => {
    await gotoHash(page, `/documents/${withVersion.id}`);
    await page.getByRole('button', { name: 'Version history' }).click();
    const rows = page.locator('dialog[open] li');
    await rows.first().waitFor({ timeout: 10_000 });
    const stored = (await allOf(page, 'document_versions')).filter((v) => v.itemId === withVersion.id);
    const shown = await rows.count();
    const manualShown = await page.locator('dialog[open]').getByText('Saved version').count();
    const oldCount = before[DB].stores.document_versions.filter((v) => v.itemId === withVersion.id).length;
    check('version history lists every version, including the manual one', shown === stored.length && shown >= oldCount && manualShown >= 1, `${shown} listed, ${stored.length} stored, ${oldCount} from v0.1.0`);
    await page.keyboard.press('Escape');
  });

  const oldDiagrams = byId(before[DB].stores.diagrams);
  for (const [i, dia] of created.diagrams.entries()) {
    await attempt(`diagram "${dia.template}" opens editable with its content`, async () => {
      await gotoHash(page, `/diagrams/${dia.id}`);
      await page.locator('.react-flow__node').first().waitFor({ timeout: 15_000 });
      const shown = await until(async () => (await page.locator('.react-flow').innerText()).includes(dia.marker), 'the v0.1.0 shape text');
      const readOnly = await page.getByText('Opened read-only').count();
      const marker = `AFTER-UPGRADE-DIA-${i}`;
      await addDiagramShape(page, marker);
      const saved = await until(async () => {
        const r = await record(page, 'diagrams', dia.id);
        return contains(r, marker) && r;
      }, 'the diagram edit to save');
      check(`diagram "${dia.template}" opens editable with its content`, shown && !readOnly && saved.version > oldDiagrams.get(dia.id).version, `edit saved as v${saved.version}, content schema ${saved.content?.schemaVersion}`);
    });
  }
}

async function exportBackup(page, where) {
  await gotoHash(page, '/settings/backup');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  await download.saveAs(where);
  return JSON.parse(readFileSync(where, 'utf8'));
}

async function checkBackupRoundTrip(page) {
  const file = join(RUN, 'upgraded-backup.json');
  const backup = await attempt('backup export from the upgraded app', () => exportBackup(page, file));
  if (!backup) return;
  const items = await allItemsOf(page);
  const versions = await allVersionsOf(page);
  check('backup export from the upgraded app', backup.format === 'dcos-backup' && sameRecords(items, backup.items) && sameRecords(versions, backup.versions), `${backup.items.length} items, ${backup.versions.length} versions, schemaVersion ${backup.schemaVersion}`);
  observe(`the upgraded app's backup has schemaVersion ${backup.schemaVersion}${backup.schemaVersion > 1 ? ' (diagrams edited in the current app are content schema 2, so v0.1.0 refuses this particular file)' : ''}`);

  const fresh = mkdtempSync(join(RUN, 'profile-fresh-'));
  profiles.push(fresh);
  const ctx = await launch(fresh);
  try {
    const p = await pageOf(ctx);
    await gotoHash(p, '/settings/backup');
    await p.locator('input[type=file][accept="application/json,.json"]').setInputFiles(file);
    await p.getByText(/Backup restored/).first().waitFor({ timeout: 20_000 });
    const restored = await allItemsOf(p);
    const restoredVersions = await allVersionsOf(p);
    check('the backup re-imports into a fresh profile with every item identical', sameRecords(backup.items, restored) && sameRecords(backup.versions, restoredVersions), `${restored.length} items, ${restoredVersions.length} versions`);
  } catch (err) {
    check('the backup re-imports into a fresh profile with every item identical', false, String(err.message).split('\n')[0]);
  } finally {
    await ctx.close();
  }
}

// ── Not enough space for the safety copy (audit STOR-R5), in the real browser ──────────────────────

const RECOVERY_TITLE = 'This update needs a safety copy of your data first';
async function v1Unchanged(page, before) {
  const now = (await idb(page, { db: DB }))[DB];
  return now?.version === 1 && V1_STORES.every((s) => sameRecords(before[DB].stores[s], now.stores[s])) && Object.keys(now.stores).length === V1_STORES.length;
}

/**
 * Opens a copy of the v0.1.0 profile on a full disk and drives the recovery screen: download a backup, try
 * again, update without the copy while still full, then free space and update without the copy.
 *
 * The full disk is simulated: an init script makes IndexedDB put/add throw QuotaExceededError until the test
 * "frees space". (Chromium's DevTools quota override, Storage.overrideQuotaForOrigin, was tried first and does not
 * limit IndexedDB writes in this Chromium build.) Everything else is the real app in a real browser.
 */
async function checkLowSpace(profileDir, before) {
  const ctx = await launch(profileDir);
  const recoveryFile = join(RUN, 'recovery-backup.json');
  try {
    await ctx.addInitScript(() => {
      globalThis.__dcosDiskFull = true;
      for (const method of ['put', 'add']) {
        const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (...args) {
          if (globalThis.__dcosDiskFull) throw new DOMException('The quota has been exceeded. (simulated by the upgrade test)', 'QuotaExceededError');
          return original.apply(this, args);
        };
      }
    });
    const page = await pageOf(ctx);
    await page.goto(`${ORIGIN}/`);
    await until(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting), 'the current service worker to install and wait', 30_000);
    observe('low space: simulated full disk (every IndexedDB put/add throws QuotaExceededError)');
    // Activate the waiting current version, as closing the old app's tabs would.
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const changed = new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      await changed;
    });
    await page.reload();
    check('low space: the current app is running', (await whichApp(page)) === 'current');
    const shown = await page.getByRole('alertdialog', { name: RECOVERY_TITLE }).waitFor({ timeout: 30_000 }).then(() => true, () => false);
    check('low space: the recovery screen is shown instead of the app', shown && !(await page.getByRole('link', { name: 'Documents' }).count()), shown ? '' : (await bodyText(page)).slice(0, 200));
    if (!shown) return null;
    observe(`low space: recovery screen says: "${(await page.getByRole('alertdialog').innerText()).replace(/\s+/g, ' ').slice(0, 420)}"`);
    check('low space: nothing was upgraded or changed, and no incomplete copy is left', (await v1Unchanged(page, before)) && !(await idb(page, { op: 'list' })).some((d) => d.name === SAFETY_COPY));

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download a backup of everything' }).click()]);
    await download.saveAs(recoveryFile);
    const file = JSON.parse(readFileSync(recoveryFile, 'utf8'));
    const items = [...before[DB].stores.documents, ...before[DB].stores.diagrams];
    const versions = [...before[DB].stores.document_versions, ...before[DB].stores.diagram_versions];
    check(
      'low space: "Download a backup of everything" saves every v0.1.0 record, read without upgrading',
      file.format === 'dcos-backup' && file.schemaVersion === 1 && sameRecords(items, file.items) && sameRecords(versions, file.versions) && (await v1Unchanged(page, before)),
      `${download.suggestedFilename()}: ${file.items.length} items, ${file.versions.length} versions`,
    );

    await page.getByRole('button', { name: 'Try again' }).click();
    const stillFull = await page.getByRole('alert').filter({ hasText: 'It still did not work' }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    check('low space: "Try again" while still full says so and keeps the screen', stillFull && (await page.getByRole('alertdialog').count()) === 1 && (await v1Unchanged(page, before)));

    await page.getByRole('checkbox', { name: 'I have the backup file saved' }).check();
    await page.getByRole('button', { name: 'Update without the on-device copy' }).click();
    const explained = await page.getByRole('alert').filter({ hasText: 'could not finish' }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    if (explained) observe(`low space: "Update without the on-device copy" while still full: "${(await page.getByRole('alert').innerText()).replace(/\s+/g, ' ')}"`);
    check('low space: an update without the copy that fails says so (no silent failure)', explained);
    const afterFull = await v1Unchanged(page, before);
    const appShown = (await page.getByRole('link', { name: 'Documents' }).count()) > 0;
    if (afterFull) check('low space: a failed update without the copy changes nothing and keeps the screen', !appShown && (await page.getByRole('alertdialog').count()) === 1);
    else check('low space: an update without the copy never runs while writes are failing', false, 'it went through with the disk still full');

    if (afterFull) {
      await page.evaluate(() => (globalThis.__dcosDiskFull = false)); // the user frees some space
      await page.getByRole('button', { name: 'Update without the on-device copy' }).click();
      await page.getByRole('link', { name: 'Documents' }).first().waitFor({ timeout: 30_000 });
    }
    const after = await idb(page, {});
    const index = byId(after[DB]?.stores.item_index ?? []);
    const meta = byId(after[DB]?.stores.meta ?? []);
    check(
      'low space: after "Update without the on-device copy" the app opens, upgraded, with every record unchanged',
      after[DB]?.version === SCHEMA_VERSION && ITEM_STORES.every((s) => sameRecords(before[DB].stores[s], after[DB].stores[s])) && items.every((i) => index.has(i.id)),
      `${index.size} index rows`,
    );
    check('low space: the downloaded file is recorded as the safety backup, and no on-device copy was made', /^file@/.test(meta.get('upgradeSafetyBackup')?.value ?? '') && !after[SAFETY_COPY]);
    return recoveryFile;
  } catch (err) {
    check('low space: recovery flow', false, String(err?.message ?? err).split('\n')[0]);
    return existsSync(recoveryFile) ? recoveryFile : null;
  } finally {
    await ctx.close();
  }
}

/** Imports a backup file into a fresh profile of whatever build is being served, through Settings. */
async function importIntoFresh(file, route) {
  const fresh = mkdtempSync(join(RUN, 'profile-import-'));
  profiles.push(fresh);
  const ctx = await launch(fresh);
  try {
    const p = await pageOf(ctx);
    await gotoHash(p, route);
    await p.locator('input[type=file][accept="application/json,.json"]').setInputFiles(file);
    await p.getByText(/Backup restored/).first().waitFor({ timeout: 20_000 });
    return { items: await allItemsOf(p), versions: await allVersionsOf(p) };
  } finally {
    await ctx.close();
  }
}

// ── Phase 6 (database version 2) → the current build (Phase 7, ADR 0014) ─────────────────────────────

const SAFETY_COPY_V2 = `${DB}-backup-v2`;

/** Phase 6 data, made through the Phase 6 UI, plus a kept draft and an attachment alias written as Phase 6 writes them. */
async function createPhase6Data(page) {
  const quick = async (label, kind) => {
    await gotoHash(page, '/');
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForURL(new RegExp(`#/${kind}s/[0-9a-f-]{36}$`));
    return page.url().split('/').pop();
  };
  // A document with typed text and an embedded diagram (its preview is a stored attachment), then a manual version.
  const docId = await quick('Assignment', 'document');
  const editor = page.locator('.ProseMirror');
  await editor.getByText('Begin your answer here.', { exact: false }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' PHASE6-DOC typed in Phase 6.');
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: 'Flowchart', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await dialog.locator('.react-flow__node').first().waitFor({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await editor.locator('.dcos-diagram img').first().waitFor({ timeout: 15_000 });
  await until(async () => {
    const r = await record(page, 'documents', docId);
    return contains(r, 'PHASE6-DOC') && contains(r, '"previewId"');
  }, 'the Phase 6 document to save');
  await page.keyboard.press('Control+s');
  await until(async () => (await manualVersionsOf(page, 'document_versions', docId)).length > 0, 'the Phase 6 manual version');
  log('Phase 6 document with an embedded diagram and a manual version');

  // An edited diagram.
  const diagramId = await quick('Flowchart', 'diagram');
  await page.locator('.react-flow__node', { hasText: 'Print "Odd"' }).dblclick();
  const shapeText = page.getByRole('textbox', { name: 'Shape text' });
  await shapeText.fill('PHASE6-DIA edited');
  await shapeText.press('Enter');
  await until(async () => contains(await record(page, 'diagrams', diagramId), 'PHASE6-DIA'), 'the Phase 6 diagram to save');
  log('Phase 6 diagram edited');

  // A kept draft referring to the preview, and a second id (alias) for the preview's bytes, as Phase 6 stores them.
  const previewId = JSON.stringify(await record(page, 'documents', docId)).match(/"previewId":"([^"]+)"/)?.[1];
  await page.evaluate(
    async ({ db, docId, previewId }) => {
      const open = await new Promise((ok, fail) => {
        const r = indexedDB.open(db);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
      });
      const tx = open.transaction(['drafts', 'attachments'], 'readwrite');
      tx.objectStore('drafts').put({ key: `document:${docId}:upgrade-test`, kind: 'document', itemId: docId, session: 'upgrade-test', baseVersion: 1, title: 'Kept draft', content: { schemaVersion: 3, doc: { type: 'doc', content: [{ type: 'diagram', attrs: { previewId } }] } }, savedAt: new Date().toISOString() });
      tx.objectStore('attachments').put({ id: 'upgrade-test-alias', aliasOf: previewId, createdAt: new Date().toISOString() });
      await new Promise((ok, fail) => ((tx.oncomplete = ok), (tx.onerror = () => fail(tx.error))));
      open.close();
    },
    { db: DB, docId, previewId },
  );
  log('a kept draft and an attachment alias added');
  return { docId, diagramId };
}

async function checkPhase6Upgrade(phase6Dist, currentDist) {
  const profile = mkdtempSync(join(RUN, 'profile-phase6-'));
  profiles.push(profile);
  await stopServing();
  await serve(phase6Dist, 'Phase 6');
  let ctx = await launch(profile);
  let page = await pageOf(ctx);
  let created;
  let before;
  try {
    await page.goto(`${ORIGIN}/`);
    check('Phase 6 is running', (await whichApp(page)) === 'phase6');
    // Phase 6 registers its service worker with registerType 'prompt' (no clientsClaim, unlike v0.1.0's autoUpdate):
    // the first page stays uncontrolled, so wait until the worker is active and reload, as a returning user would.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await until(() => page.evaluate(() => !!navigator.serviceWorker.controller), 'the Phase 6 service worker to take control', 30_000);
    created = await createPhase6Data(page);
    before = await idb(page, {});
    writeFileSync(join(RUN, 'phase6-data.json'), JSON.stringify(before, null, 1));
    const counts = Object.fromEntries(Object.entries(before[DB].stores).map(([st, r]) => [st, r.length]));
    log(`Phase 6 data: ${JSON.stringify(counts)}`);
    check('Phase 6 data recorded at database version 2, with attachments, an alias, a draft and versions', before[DB].version === 2 && counts.attachments >= 2 && counts.drafts >= 1 && counts.document_versions >= 2 && !before[SAFETY_COPY_V2]);
  } finally {
    await ctx.close();
  }

  phase('Phase 6 → current: serve the current build on the same origin and reopen the Phase 6 profile');
  await stopServing();
  await serve(currentDist, 'current');
  const drive = await driveTo('current', profile, 'after switching from Phase 6 to the current build');
  ({ ctx, page } = drive);
  check('Phase 6 → current: the current app eventually runs', !drive.stuck);
  if (drive.stuck) return void (await ctx.close());
  await until(async () => (await dbVersion(page)) === SCHEMA_VERSION, 'the database upgrade from version 2', 30_000);
  const after = await idb(page, {});
  const old = before[DB];
  const now = after[DB];
  check(`Phase 6 → current: the database is at version ${SCHEMA_VERSION}`, now?.version === SCHEMA_VERSION, `version ${now?.version}`);
  for (const st of Object.keys(old.stores).filter((x) => x !== 'meta')) {
    check(`Phase 6 → current: every Phase 6 record in "${st}" is unchanged`, sameRecords(old.stores[st], now?.stores[st]), `${old.stores[st].length} records`);
    check(`Phase 6 → current: store "${st}" keeps its layout`, isDeepStrictEqual(old.layout[st], now?.layout[st]));
  }
  const metaNow = byId(now?.stores.meta ?? []);
  check('Phase 6 → current: every Phase 6 meta record is unchanged', old.stores.meta.every((m) => isDeepStrictEqual(m, metaNow.get(m.key))));
  check('Phase 6 → current: the upgrade is recorded (meta migratedFrom = 2@…)', /^2@/.test(metaNow.get('migratedFrom')?.value ?? ''));
  const added = Object.keys(now?.stores ?? {}).filter((x) => !(x in old.stores)).sort();
  check('Phase 6 → current: only the presentation stores were added, empty, shaped like the document stores', isDeepStrictEqual(added, ['presentation_versions', 'presentations']) && now.stores.presentations.length === 0 && now.stores.presentation_versions.length === 0 && isDeepStrictEqual(now.layout.presentation_versions, now.layout.document_versions), added.join(', '));
  const copy = after[SAFETY_COPY_V2];
  check(`Phase 6 → current: safety copy "${SAFETY_COPY_V2}" exists`, !!copy);
  if (copy) {
    check('Phase 6 → current: the safety copy holds every Phase 6 record', Object.keys(old.stores).every((st) => sameRecords(old.stores[st], copy.stores[st])));
    const info = copy.stores.__copy?.[0];
    check('Phase 6 → current: the safety copy records where it came from', info?.fromVersion === 2 && info?.source === DB);
  }
  await attempt('Phase 6 → current: the Phase 6 document opens with its text and its diagram', async () => {
    await gotoHash(page, `/documents/${created.docId}`);
    const body = page.locator('.ProseMirror');
    await body.waitFor({ timeout: 15_000 });
    await until(async () => (await body.innerText()).includes('PHASE6-DOC'), 'the Phase 6 text');
    await page.locator('.dcos-diagram img').first().waitFor({ timeout: 15_000 });
    check('Phase 6 → current: the Phase 6 document opens with its text and its diagram', (await page.getByText('Opened read-only').count()) === 0);
  });
  await attempt('Phase 6 → current: a presentation can be created after the upgrade', async () => {
    await gotoHash(page, '/');
    await page.getByRole('button', { name: 'Blank presentation', exact: true }).click();
    await page.waitForURL(/#\/presentations\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop();
    await page.getByRole('listbox', { name: 'Slides' }).waitFor({ timeout: 15_000 });
    await until(async () => (await record(page, 'presentations', id)) !== null, 'the presentation to be stored');
    check('Phase 6 → current: a presentation can be created after the upgrade', true);
  });
  await sleep(1500);
  const beforeDowngrade = await idb(page, {});
  writeFileSync(join(RUN, 'phase6-upgraded-data.json'), JSON.stringify(beforeDowngrade, null, 1));
  await ctx.close();

  phase('Going back to Phase 6 (observed): serve the Phase 6 build again on the same origin');
  await stopServing();
  await serve(phase6Dist, 'Phase 6');
  const back = await driveTo('phase6', profile, 'after switching the server back to Phase 6');
  ({ ctx, page } = back);
  try {
    if (back.stuck) observe('Phase 6 downgrade: the Phase 6 app never ran; the current app stayed in charge (served by its service worker)');
    else {
      await sleep(2500);
      observe(`Phase 6 downgrade: the Phase 6 dashboard shows: "${(await bodyText(page)).slice(0, 300)}"`);
      const refused = await page.evaluate(
        (db) =>
          new Promise((ok) => {
            const r = indexedDB.open(db, 2);
            r.onsuccess = () => (r.result.close(), ok('opened'));
            r.onerror = () => ok(r.error?.name ?? 'error');
          }),
        DB,
      );
      check('Phase 6 downgrade: opening the database at version 2 (as Phase 6 does) is refused with VersionError', refused === 'VersionError', String(refused));
    }
    const afterDowngrade = await idb(page, {});
    const damaged = Object.keys(beforeDowngrade).filter((name) => !isDeepStrictEqual(beforeDowngrade[name], afterDowngrade[name]));
    check('Phase 6 downgrade: no database changed (the Phase 6 build fails closed)', damaged.length === 0, damaged.length ? `changed: ${damaged.join(', ')}` : '');
  } finally {
    await ctx.close();
  }
}

// ── Driving the service-worker handover like a user ─────────────────────────────────────────────────

/**
 * Tries what a user would do until `want` runs: wait on the open page, reload, close the tab and open the app
 * again, restart the browser. Records each step. Returns the context and page that run `want`.
 */
async function driveTo(want, profile, label) {
  let ctx = await launch(profile);
  let page = await pageOf(ctx);
  await page.goto(`${ORIGIN}/`);
  if ((await snapshot(page, `${label}, first visit`)) === want) return { ctx, page };
  await sleep(5000);
  if ((await snapshot(page, `${label}, same page 5 s later`)) === want) return { ctx, page };
  await page.reload();
  if ((await snapshot(page, `${label}, after a reload`)) === want) return { ctx, page };
  await page.reload();
  if ((await snapshot(page, `${label}, after a second reload`)) === want) return { ctx, page };
  await page.close();
  await sleep(1500);
  page = await ctx.newPage();
  await page.goto(`${ORIGIN}/`);
  if ((await snapshot(page, `${label}, tab closed and the app opened in a new tab`)) === want) return { ctx, page };
  await ctx.close();
  ctx = await launch(profile);
  page = await pageOf(ctx);
  await page.goto(`${ORIGIN}/`);
  if ((await snapshot(page, `${label}, browser restarted`)) === want) return { ctx, page };
  return { ctx, page, stuck: true };
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────────────

let exitCode = 1;
try {
  phase('Builds');
  const v010Dist = buildV010();
  const phase6Dist = buildPhase6();
  const currentDist = buildCurrent();
  ENTRY = { v010: entryOf(v010Dist), current: entryOf(currentDist), phase6: entryOf(phase6Dist) };
  if (new Set(Object.values(ENTRY)).size !== 3) throw new Error('Two builds have the same entry script; cannot tell them apart');

  const profile = mkdtempSync(join(RUN, 'profile-'));
  profiles.push(profile);

  phase('v0.1.0: create data through the UI');
  await serve(v010Dist, 'v0.1.0');
  let ctx = await launch(profile);
  let page = await pageOf(ctx);
  await page.goto(`${ORIGIN}/`);
  check('v0.1.0 is running', (await whichApp(page)) === 'v0.1.0');
  await until(() => page.evaluate(() => !!navigator.serviceWorker.controller), 'the v0.1.0 service worker to take control', 30_000);
  const created = await createV010Data(page);
  const before = await idb(page, {});
  const localBefore = await idb(page, { op: 'localStorage' });
  writeFileSync(join(RUN, 'v0.1.0-data.json'), JSON.stringify({ before, localStorage: localBefore }, null, 1));
  const counts = Object.fromEntries(Object.entries(before[DB].stores).map(([s, r]) => [s, r.length]));
  log(`v0.1.0 data: ${JSON.stringify(counts)}; databases: ${Object.keys(before).join(', ')}`);
  check('v0.1.0 data recorded at database version 1', before[DB].version === 1 && !before[SAFETY_COPY]);
  await ctx.close();
  const lowSpaceProfile = join(RUN, 'profile-low-space');
  cpSync(profile, lowSpaceProfile, { recursive: true });
  profiles.push(lowSpaceProfile);

  phase('Upgrade: serve the current build on the same origin and reopen the same profile');
  await stopServing();
  await serve(currentDist, 'current');
  const drive = await driveTo('current', profile, 'after switching the server to the current build');
  ({ ctx, page } = drive);
  check('the current app eventually runs after the switch', !drive.stuck);
  if (drive.stuck) throw new Error('The current app never ran; stopping');
  await until(async () => (await dbVersion(page)) === SCHEMA_VERSION, 'the database upgrade', 30_000);
  await page.waitForSelector('#root > *');

  phase('After the upgrade: stored data');
  await checkStoredData(page, before);
  phase('After the upgrade: in the app');
  await checkUi(page, created, before);
  phase('After the upgrade: backup export and re-import');
  await checkBackupRoundTrip(page);
  const beforeDowngrade = await idb(page, {});
  writeFileSync(join(RUN, 'upgraded-data.json'), JSON.stringify(beforeDowngrade, null, 1));
  await ctx.close();

  phase('Downgrade (observed only): serve v0.1.0 again on the same origin');
  await stopServing();
  await serve(v010Dist, 'v0.1.0');
  const back = await driveTo('v0.1.0', profile, 'after switching the server back to v0.1.0');
  ({ ctx, page } = back);
  if (back.stuck) observe('downgrade: v0.1.0 never ran; the current app stayed in charge (served by its service worker)');
  else {
    await sleep(2000);
    const text = await bodyText(page);
    observe(`downgrade: v0.1.0 dashboard shows: "${text.slice(0, 300)}"`);
    await gotoHash(page, '/documents');
    await sleep(1500);
    observe(`downgrade: v0.1.0 documents page shows: "${(await bodyText(page)).slice(0, 300)}"`);
  }
  const afterDowngrade = await idb(page, {});
  const damaged = Object.keys(beforeDowngrade).filter((name) => !isDeepStrictEqual(beforeDowngrade[name], afterDowngrade[name]));
  observe(`downgrade: databases afterwards: ${Object.entries(afterDowngrade).map(([n, d]) => `${n} v${d.version}`).join(', ')}`);
  check('going back to v0.1.0 damages no data (every database identical before and after)', damaged.length === 0, damaged.length ? `changed: ${damaged.join(', ')}` : '');
  await ctx.close();

  phase('Forward again (observed): serve the current build once more');
  await stopServing();
  await serve(currentDist, 'current');
  const again = await driveTo('current', profile, 'after switching the server to the current build again');
  ({ ctx, page } = again);
  if (!again.stuck) {
    const items = [...(await allOf(page, 'documents')), ...(await allOf(page, 'diagrams'))];
    check('after going back and forth, the current app opens with every item intact', sameRecords([...beforeDowngrade[DB].stores.documents, ...beforeDowngrade[DB].stores.diagrams], items), `${items.length} items`);
  } else check('after going back and forth, the current app opens with every item intact', false, 'the current app never ran');
  await ctx.close();

  phase('Not enough space for the safety copy (STOR-R5): a copy of the v0.1.0 profile on a simulated full disk');
  const recoveryFile = await checkLowSpace(lowSpaceProfile, before);
  if (recoveryFile) {
    const items = [...before[DB].stores.documents, ...before[DB].stores.diagrams];
    const versions = [...before[DB].stores.document_versions, ...before[DB].stores.diagram_versions];
    const intoCurrent = await importIntoFresh(recoveryFile, '/settings/backup').catch((err) => ({ err }));
    check('the recovery backup imports into the current app (fresh profile)', !intoCurrent.err && sameRecords(items, intoCurrent.items) && sameRecords(versions, intoCurrent.versions), intoCurrent.err ? String(intoCurrent.err.message).split('\n')[0] : `${intoCurrent.items.length} items, ${intoCurrent.versions.length} versions`);
    await stopServing();
    await serve(v010Dist, 'v0.1.0');
    const intoOld = await importIntoFresh(recoveryFile, '/settings').catch((err) => ({ err }));
    check('the recovery backup imports into v0.1.0 (fresh profile)', !intoOld.err && sameRecords(items, intoOld.items) && sameRecords(versions, intoOld.versions), intoOld.err ? String(intoOld.err.message).split('\n')[0] : `${intoOld.items.length} items, ${intoOld.versions.length} versions`);
  }

  phase('Phase 6 (database version 2) → the current build (Phase 7, ADR 0014)');
  await checkPhase6Upgrade(phase6Dist, currentDist);

  exitCode = checks.every((c) => c.ok) ? 0 : 1;
} catch (err) {
  check('the upgrade test ran to the end', false, String(err?.stack ?? err).split('\n').slice(0, 3).join(' | '));
  exitCode = 1;
} finally {
  for (const ctx of openContexts) await ctx.close().catch(() => undefined);
  await stopServing().catch(() => undefined);
  const errorsByApp = consoleErrors.reduce((acc, e) => ((acc[e.app] ??= new Set()).add(e.text), acc), {});
  for (const [app, set] of Object.entries(errorsByApp)) observe(`console errors while the server served ${app} (${set.size} distinct): ${[...set].slice(0, 6).join(' || ')}`);
  writeFileSync(join(RUN, 'report.json'), JSON.stringify({ checks, observations, consoleErrors }, null, 1));
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${'─'.repeat(100)}\nUpgrade test: ${checks.length - failed.length} passed, ${failed.length} failed`);
  for (const c of failed) console.log(`  FAIL  ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
  if (KEEP) console.log(`Kept: ${RUN}`);
  else if (failed.length) {
    // Keep the report and data snapshots of a failed run for diagnosis; the bulky profiles and build go.
    for (const p of profiles) rmSync(p, { recursive: true, force: true });
    rmSync(join(RUN, 'current-dist'), { recursive: true, force: true });
    console.log(`Report: ${join(RUN, 'report.json')}`);
  } else rmSync(RUN, { recursive: true, force: true });
  process.exit(exitCode);
}
