// @vitest-environment jsdom
/** The DOCX import on documents written by Microsoft Word itself (see tests/fixtures/docx-import/README.md). */
import type { JSONContent } from '@tiptap/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDoc } from '../safety';
import { importDocx } from './docx';

const DIR = join(__dirname, '../../../../tests/fixtures/docx-import');
const load = (name: string) => importDocx(new Uint8Array(readFileSync(join(DIR, name))), name);
const textOf = (n: JSONContent): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');
const blocks = (doc: JSONContent) => (doc.content ?? []).map((b) => [b.type, textOf(b)]);

describe('importing documents made by Word', () => {
  it('tables', async () => {
    const r = await load('tables.docx');
    expect(validateDoc(r.content.doc)).toBeNull();
    const table = r.content.doc.content!.find((b) => b.type === 'table')!;
    expect(table.content!.map((row) => row.content!.map(textOf))).toEqual([
      ['Top left', 'Top right'],
      ['Bottom left', 'Bottom right'],
    ]);
    expect(r.report.empty).toBe(true);
  });

  it('lists', async () => {
    const r = await load('simple-list.docx');
    expect(blocks(r.content.doc)).toEqual([['bulletList', 'AppleBanana']]);
  });

  it('underline and strikethrough', async () => {
    const underline = await load('underline.docx');
    const marks = (doc: JSONContent, type: string) =>
      (doc.content ?? []).flatMap((b) => b.content ?? []).filter((n) => n.marks?.some((m) => m.type === type)).map((n) => n.text);
    expect(marks(underline.content.doc, 'underline')).toEqual(['Sunset']);
    expect(marks(underline.content.doc, 'bold')).toEqual(['The ', 'Sunset', ' Tree']);
    const strike = await load('strikethrough.docx');
    expect(marks(strike.content.doc, 'strike')).toEqual(["Today's Special: Salmon"]);
  });

  it('pictures, at their own size', async () => {
    const r = await load('tiny-picture.docx');
    const img = r.content.doc.content!.find((b) => b.type === 'image')!;
    expect(img.attrs).toMatchObject({ width: 10, height: 10 });
    expect(String(img.attrs?.src)).toMatch(/^data:image\/png;base64,/);
  });

  it('footnotes and endnotes become numbered notes at the end', async () => {
    for (const file of ['footnotes.docx', 'endnotes.docx']) {
      const r = await load(file);
      expect(validateDoc(r.content.doc)).toBeNull();
      expect(blocks(r.content.doc)).toEqual([
        ['paragraph', 'Ouch[1].[2]'],
        ['paragraph', 'Notes'],
        ['orderedList', 'A tachyon walks into a bar.Fin.'],
      ]);
      expect(r.report.sentences()).toEqual(['2 footnotes and endnotes were imported as numbered notes at the end']);
    }
  });

  it('says what it left out: comments, linked pictures, text boxes', async () => {
    const comments = await load('comments.docx');
    expect(textOf(comments.content.doc)).toBe('Ouch.');
    expect(comments.report.sentences()).toEqual(['2 comments were not imported']);
    const linked = await load('external-picture.docx');
    expect(linked.report.sentences()).toEqual(['1 linked (not embedded) picture was not imported']);
    const box = await load('text-box.docx');
    expect(textOf(box.content.doc)).toContain('Datum plane');
    expect(box.report.sentences()).toEqual(['The text of 1 text box was imported as ordinary paragraphs']);
  });

  it('Strict Open XML files', async () => {
    const r = await load('strict-format.docx');
    expect(blocks(r.content.doc)).toEqual([['paragraph', 'Test']]);
  });
});
