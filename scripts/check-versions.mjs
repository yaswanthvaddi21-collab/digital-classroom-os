#!/usr/bin/env node
/**
 * Version consistency check (REL-003, RELEASE_STRATEGY §3.4): every manifest that carries the product version
 * must hold the same value. Read-only; exits 1 and names each file that differs. Run in CI (web job).
 *
 *   node scripts/check-versions.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

/** [file, version] pairs. */
const found = [];
const add = (file, version) => found.push([file, version ?? '(missing)']);

add('package.json', json('package.json').version);

// Every workspace package plus the native shells, so a new workspace joins the check automatically.
for (const dir of ['apps', 'packages']) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}/package.json`;
    if (existsSync(join(root, rel))) add(rel, json(rel).version);
  }
}

add('apps/desktop/src-tauri/tauri.conf.json', json('apps/desktop/src-tauri/tauri.conf.json').version);
add('apps/desktop/src-tauri/Cargo.toml', /^version\s*=\s*"([^"]+)"/m.exec(read('apps/desktop/src-tauri/Cargo.toml'))?.[1]);
add('backend/api/main.py', /^API_VERSION\s*=\s*"([^"]+)"/m.exec(read('backend/api/main.py'))?.[1]);

const lock = json('package-lock.json');
add('package-lock.json (root)', lock.version);
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (path !== '' && !path.includes('node_modules') && entry.version !== undefined) add(`package-lock.json (${path})`, entry.version);
}

const expected = found[0][1];
const wrong = found.filter(([, v]) => v !== expected);
if (wrong.length > 0) {
  console.error(`Version mismatch: package.json says ${expected}, but:`);
  for (const [file, v] of wrong) console.error(`  ${file}: ${v}`);
  process.exit(1);
}
console.log(`All ${found.length} version fields are ${expected}.`);
