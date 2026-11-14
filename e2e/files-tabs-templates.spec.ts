import { expect, test, type Page } from '@playwright/test';
import { CommentRangeEnd, CommentRangeStart, CommentReference, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import JSZip from 'jszip';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

/** Phase 4, G-FILES: DOCX and ODT import, ODT export, the open-items tabs and the new templates, end to end. */

type StoredDoc = { id: string; title: string; content: { schemaVersion: number; doc: unknown; page: Record<string, unknown> } };
const documents = (page: Page) => readStore<StoredDoc>(page, 'documents');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Document JSON without attributes left at null and without empty content, as templates write it. */
function withoutDefaults(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutDefaults);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'attrs') {
      const attrs = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, a]) => a !== null));
      if (Object.keys(attrs).length) out.attrs = attrs;
    } else if (k === 'content' && Array.isArray(v) && !v.length) continue;
    else out[k] = withoutDefaults(v);
  }
  return out;
}

/** A Word file made with the docx library: a heading, bold text, a table and a comment (which cannot be imported). */
async function wordFile() {
  const doc = new Document({
    title: 'Field trip report',
    comments: { children: [{ id: 0, author: 'Teacher', date: new Date('2026-01-01'), children: [new Paragraph('Check this')] }] },
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Field trip report')] }),
          new Paragraph({ children: [new TextRun('We visited the '), new TextRun({ text: 'science museum', bold: true }), new TextRun('.')] }),
          new Paragraph({ children: [new CommentRangeStart(0), new TextRun('Commented sentence.'), new CommentRangeEnd(0), new TextRun({ children: [new CommentReference(0)] })] }),
          new Table({
            rows: [
              new TableRow({ children: [new TableCell({ children: [new Paragraph('Exhibit')] }), new TableCell({ children: [new Paragraph('Rating')] })] }),
              new TableRow({ children: [new TableCell({ children: [new Paragraph('Planets')] }), new TableCell({ children: [new Paragraph('5')] })] }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

test('a Word document imports as a new document, with a report of what was left out', async ({ page }) => {
  await page.goto('./#/documents');
  const before = (await documents(page)).length;
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import document' }).click();
  await (await chooser).setFiles({ name: 'trip.docx', mimeType: DOCX_MIME, buffer: await wordFile() });

  const dialog = page.getByRole('dialog').filter({ hasText: 'Imported with notes' });
  await expect(dialog).toContainText('“Field trip report” was imported as a new document');
  await expect(dialog).toContainText('1 comment was not imported.');
  await dialog.getByRole('button', { name: 'Open document' }).click();
  await expect(page).toHaveURL(/#\/documents\/[0-9a-f-]{36}$/);

  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('h1')).toHaveText('Field trip report');
  await expect(editor.locator('strong')).toHaveText('science museum');
  await expect(editor.locator('table td, table th')).toHaveText(['Exhibit', 'Rating', 'Planets', '5']);
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Field trip report');
  const docs = await documents(page);
  expect(docs).toHaveLength(before + 1);
  expect(JSON.stringify(docs.find((d) => d.title === 'Field trip report')!.content.doc)).toContain('Commented sentence.');
});

test('a file that is not a document is refused with a reason, and nothing is created', async ({ page }) => {
  await page.goto('./#/documents');
  await page.getByRole('button', { name: 'New document' }).first().click();
  const before = (await documents(page)).length;
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import a file/ }).click();
  await (await chooser).setFiles({ name: 'notes.docx', mimeType: DOCX_MIME, buffer: Buffer.from('just text') });
  await expect(page.getByText('Could not import “notes.docx”: This file is not a Word (.docx) or OpenDocument (.odt) document.')).toBeVisible();
  expect(await documents(page)).toHaveLength(before);
});

test('ODT export writes an OpenDocument file that imports back as the same document', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Lab report');
  await waitSaved(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /OpenDocument text/ }).click()]);
  expect(download.suggestedFilename()).toBe('Lab report.odt');
  await expect(page.getByText('Exported OpenDocument text', { exact: false })).toBeVisible();
  const bytes = await downloadBytes(download);
  const zip = await JSZip.loadAsync(bytes);
  expect(Object.keys(zip.files)[0]).toBe('mimetype');
  expect(await zip.file('mimetype')!.async('string')).toBe('application/vnd.oasis.opendocument.text');
  const content = await zip.file('content.xml')!.async('string');
  expect(content).toContain('<text:h text:style-name="Heading_20_2" text:outline-level="2">Aim</text:h>');
  expect(content).toContain('<table:table ');

  // Import it from the New dialog: a new document with the same body and page.
  const original = (await documents(page)).find((d) => d.id === id)!;
  await page.goto('./#/documents');
  await page.getByRole('button', { name: 'New document' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import a file/ }).click();
  await (await chooser).setFiles({ name: 'Lab report.odt', mimeType: 'application/vnd.oasis.opendocument.text', buffer: bytes });
  await expect(page).toHaveURL(/#\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Imported “Lab report”.')).toBeVisible();
  const importedId = page.url().split('/').pop()!;
  expect(importedId).not.toBe(id);
  await expect(page.locator('.ProseMirror h2').first()).toHaveText('Aim');
  const imported = (await documents(page)).find((d) => d.id === importedId)!;
  expect(withoutDefaults(imported.content.doc)).toEqual(withoutDefaults(original.content.doc));
  expect(imported.content.page).toEqual(original.content.page);
});

test('open documents and diagrams show as tabs: switch with the keyboard, remembered after a reload, closable', async ({ page }) => {
  const first = await createFromQuickStart(page, 'Assignment');
  const diagram = await createFromQuickStart(page, 'Flowchart');
  const tabs = page.getByRole('navigation', { name: 'Open items' });
  await expect(tabs.getByRole('link')).toHaveCount(2);
  await expect(tabs.getByRole('link', { name: 'Flowchart' })).toHaveAttribute('aria-current', 'page');

  await page.keyboard.press('Control+Alt+ArrowLeft');
  await expect(page).toHaveURL(new RegExp(`#/documents/${first}$`));
  await expect(tabs.getByRole('link', { name: 'Assignment' })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Control+Alt+ArrowLeft');
  await expect(page).toHaveURL(new RegExp(`#/diagrams/${diagram}$`));
  // The shortcut works once the editor (and its tab strip) has loaded: wait for it before pressing again.
  await expect(tabs.getByRole('link', { name: 'Flowchart' })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect(page).toHaveURL(new RegExp(`#/documents/${first}$`));

  await page.reload();
  await expect(tabs.getByRole('link')).toHaveCount(2);
  await tabs.getByRole('link', { name: 'Flowchart' }).click();
  await expect(page).toHaveURL(new RegExp(`#/diagrams/${diagram}$`));

  // Closing the current tab shows its neighbour; with one item left, the strip is hidden.
  await tabs.getByRole('button', { name: 'Close Flowchart' }).click();
  await expect(page).toHaveURL(new RegExp(`#/documents/${first}$`));
  await expect(tabs).toBeHidden();
  // No horizontal page scroll from the strip.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.goto('./#/settings/shortcuts');
  await expect(page.getByText('Next / previous open document or diagram')).toBeVisible();
});

// The current tab must stay in view once the other tabs' names have loaded (they widen the strip after it first shows).
test('on a phone-sized screen the open-items strip scrolls on its own and keeps the current item in view', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  const labels = ['Assignment', 'Lab report', 'Tree diagram', 'Flowchart'];
  for (const [i, label] of labels.entries()) {
    await createFromQuickStart(page, label);
    // An item joins the strip once its editor has loaded: wait for that before leaving it (under load the lazy
    // editor can take longer than the navigation back to Home, and the item would never have been opened).
    await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('dcos.openTabs') ?? '[]') as unknown[]).length), { timeout: 15_000 }).toBe(i + 1);
  }
  const tabs = page.getByRole('navigation', { name: 'Open items' });
  await expect(tabs.getByRole('link')).toHaveCount(4);
  const current = tabs.getByRole('link', { name: 'Flowchart' });
  await expect(current).toHaveAttribute('aria-current', 'page');
  await expect(current).toBeInViewport();
  const strip = await tabs.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(strip.scroll).toBeGreaterThan(strip.client);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  // The keyboard still moves through every item, wrapping round.
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect(tabs.getByRole('link', { name: 'Assignment' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.getByRole('link', { name: 'Assignment' })).toBeInViewport();
});

test('the new templates open, and each exports to Word', async ({ page }) => {
  const templates: Array<[string, string]> = [
    ['Research paper (APA style)', 'Abstract'],
    ['MLA essay', 'Works Cited'],
    ['Cover page', 'Title of the Work'],
    ['Formal letter', 'Yours sincerely,'],
  ];
  for (const [name, text] of templates) {
    await page.goto('./#/documents');
    await page.getByRole('button', { name: 'New document' }).first().click();
    await page.getByRole('button', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) }).click();
    await expect(page).toHaveURL(/#\/documents\/[0-9a-f-]{36}$/);
    await expect(page.locator('.ProseMirror')).toContainText(text);
    await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue(name);
    await page.getByRole('button', { name: 'Export' }).click();
    const [docx] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /word document/i }).click()]);
    expect((await downloadBytes(docx)).subarray(0, 2).toString()).toBe('PK');
    const stored = (await documents(page)).find((d) => d.id === page.url().split('/').pop());
    expect(stored?.content.schemaVersion).toBe(1);
  }
});
