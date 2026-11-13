/**
 * DOCX golden files: every v0.1.0 document fixture is exported and its Word XML compared against a committed
 * snapshot. Any change to export output must be a reviewed snapshot update (`npx vitest run -u`).
 * Each export is also re-read by an independent parser (mammoth) to prove Word-compatible structure.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Packer } from 'docx';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { describe, expect, it } from 'vitest';
import { buildDocx, type DocumentContent } from '@dcos/document-studio';
import type { WorkspaceItem } from '@dcos/local-storage';

const DIR = join(__dirname, '..', 'fixtures', 'v0.1.0', 'documents');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const PARTS = ['word/document.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels', '[Content_Types].xml'];

/** Removes values that differ on every export (random relationship and drawing ids), then pretty-prints. */
export function canonical(xml: string) {
  const ids = new Map<string, string>();
  const stable = (v: string) => {
    if (!ids.has(v)) ids.set(v, `ID${ids.size + 1}`);
    return ids.get(v)!;
  };
  return xml
    .replace(/(r:embed|r:id|Id)="(rId[^"]+)"/g, (_, attr, v) => `${attr}="${stable(v)}"`)
    .replace(/(<wp:docPr\b[^>]*\bid=")(\d+)"/g, '$1N"')
    .replace(/(<pic:cNvPr\b[^>]*\bid=")(\d+)"/g, '$1N"')
    .replace(/media\/[^"]+\.(png|jpe?g|gif|bmp)/g, 'media/IMAGE.$1')
    .replace(/></g, '>\n<');
}

async function exportParts(item: WorkspaceItem<DocumentContent>) {
  const buffer = await Packer.toBuffer(buildDocx(item.content, item.title));
  const zip = await JSZip.loadAsync(buffer);
  const parts: Record<string, string> = {};
  for (const name of PARTS) {
    const f = zip.file(name);
    if (f) parts[name] = canonical(await f.async('string'));
  }
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    parts[name] = canonical(await zip.file(name)!.async('string'));
  }
  return { buffer, parts };
}

describe.each(files)('DOCX export of v0.1.0 fixture %s', (file) => {
  const item: WorkspaceItem<DocumentContent> = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  const name = file.replace(/\.json$/, '');

  it('matches the golden Word XML', async () => {
    const { parts } = await exportParts(item);
    for (const [part, xml] of Object.entries(parts)) {
      await expect(xml).toMatchFileSnapshot(join(__dirname, '..', 'golden', 'docx', name, part.replace(/[/[\]]/g, '_')));
    }
  });

  it('is readable by an independent DOCX parser and keeps every heading', async () => {
    const { buffer } = await exportParts(item);
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const headings: string[] = [];
    const walk = (n: { type?: string; content?: unknown[]; text?: string }) => {
      if (n.type === 'heading') headings.push(((n.content ?? []) as { text?: string }[]).map((c) => c.text ?? '').join(''));
      (n.content as typeof n[] | undefined)?.forEach(walk);
    };
    walk(item.content.doc as never);
    for (const h of headings.filter(Boolean)) expect(html).toContain(h.replace(/&/g, '&amp;'));
  });
});
