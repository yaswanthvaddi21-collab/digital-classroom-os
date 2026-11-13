# Baseline test run — 2026-11-12T08:59:38Z

## git
?? .claude/
?? .github/
?? .gitignore
?? README.md
?? apps/
fatal: your current branch 'main' does not have any commits yet

## npm run typecheck
> digital-classroom-os@0.1.0 typecheck
> tsc -p tsconfig.json

exit=0

## npm test
 ✓ packages/diagram-studio/src/diagram.test.ts > UndoStack > undoes and redoes in order, and a new change clears redo 1ms
 ✓ packages/diagram-studio/src/diagram.test.ts > UndoStack > caps history length 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > layoutTree > places children below parents, centred, without overlaps, and keeps the root in place 1ms
 ✓ packages/diagram-studio/src/diagram.test.ts > layoutTree > lays out left to right with side handles 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > layoutTree > survives cycles and self-loops 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > serialization > round-trips a template, dropping runtime-only fields 1ms
 ✓ packages/diagram-studio/src/diagram.test.ts > serialization > drops edges whose endpoints no longer exist and fills defaults 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > serialization > tolerates garbage input 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > serialization > derives arrow markers from connector data 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > blank is internally consistent 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > flowchart is internally consistent 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > tree is internally consistent 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > mindmap is internally consistent 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > orgchart is internally consistent 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > hierarchy is internally consistent 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > process is internally consistent 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > timeline is internally consistent 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > venn is internally consistent 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > network is internally consistent 0ms
 ✓ packages/diagram-studio/src/diagram.test.ts > templates > tree templates have no overlapping boxes 2ms
 ✓ packages/local-storage/src/indexeddb.test.ts > IndexedDbAdapter > creates, reads and lists items with a creation version 8ms
 ✓ packages/local-storage/src/indexeddb.test.ts > IndexedDbAdapter > persists across connections (simulated app restart) 1ms
 ✓ packages/local-storage/src/indexeddb.test.ts > IndexedDbAdapter > increments version on save and rejects stale writes 2ms
 ✓ packages/local-storage/src/indexeddb.test.ts > IndexedDbAdapter > keeps the previous record intact when a save is aborted mid-transaction 1ms
 ✓ packages/local-storage/src/indexeddb.test.ts > IndexedDbAdapter > snapshots on manual save and restores versions reversibly 9ms
 ✓ packages/local-storage/src/indexeddb.test.ts > IndexedDbAdapter > soft-deletes to trash, restores, and purges 2ms
 ✓ packages/local-storage/src/indexeddb.test.ts > IndexedDbAdapter > duplicates with a fresh id 1ms
 ✓ packages/local-storage/src/indexeddb.test.ts > IndexedDbAdapter > round-trips a backup into an empty device 2ms
 ✓ packages/local-storage/src/indexeddb.test.ts > IndexedDbAdapter > never overwrites diverged local items on import 2ms
 ✓ packages/local-storage/src/indexeddb.test.ts > IndexedDbAdapter > rejects malformed backups 0ms
 ✓ packages/document-studio/src/export/docx.test.ts > DOCX export > produces a valid package with text, styles, lists, tables, breaks and images 32ms
 ✓ packages/document-studio/src/export/docx.test.ts > DOCX export > scales oversized images to the text width 10ms
 ✓ packages/document-studio/src/export/docx.test.ts > DOCX export > applies page size and margins in twips 8ms
 ✓ packages/document-studio/src/export/docx.test.ts > DOCX export > exports every built-in template without throwing 26ms
 ✓ packages/document-studio/src/export/docx.test.ts > DOCX export > normalises colours and sizes 0ms
 ✓ packages/document-studio/src/export/docx.test.ts > Print and text export > builds a print page with page size, margins, header and page counter 0ms
 ✓ packages/document-studio/src/export/docx.test.ts > Print and text export > flattens documents to readable text 0ms
 Test Files  3 passed (3)
      Tests  37 passed (37)

## npm run build
✓ built in 452ms
precache  18 entries (2312.94 KiB)

## backend pytest
tests/test_api.py::test_health PASSED                                    [ 33%]
tests/test_api.py::test_info_identifies_host PASSED                      [ 66%]
tests/test_api.py::test_cors_rejects_unknown_origin PASSED               [100%]
============================== 3 passed in 0.25s ===============================

## licences
101 production packages. Licences: {"MIT":86,"OFL-1.1":1,"ISC":10,"BSD-3-Clause":1,"(MPL-2.0 OR Apache-2.0)":1,"(MIT AND Zlib)":1,"MIT OR SEE LICENSE IN FEEL-FREE.md":1}

## npm audit (production deps)
found 0 vulnerabilities

## npm audit (all)
deepmerge  >=4.2.0
deepmerge mergeObject() allows prototype poisoning of returned objects - https://github.com/advisories/GHSA-gcqx-w48m-w2h4
fix available via `npm audit fix --force`
node_modules/deepmerge
glob  9.0.0 - 14.0.1
Severity: moderate
fix available via `npm audit fix --force`
node_modules/glob
minimatch  7.0.0 - 11.0.0
Severity: moderate
minimatch has potential denial of service via globparts amplification - https://github.com/advisories/GHSA-g3hv-75wg-m249
fix available via `npm audit fix --force`
node_modules/minimatch
6 vulnerabilities (2 low, 4 moderate)
