import { expect, test, type Page } from '@playwright/test';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

// Regression tests for review findings DOC-1, DOC-2 and DOC-3: diagram work in documents must not disappear.

type DiagramAttrs = { source: { nodes: Array<{ data: { label: string } }> } | null; previewId: string | null; width: number; title: string };
type StoredDoc = { id: string; content: { doc: unknown } };

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

function findDiagrams(node: unknown, out: DiagramAttrs[] = []): DiagramAttrs[] {
  const n = node as { type?: string; attrs?: DiagramAttrs; content?: unknown[] };
  if (n.type === 'diagram' && n.attrs) out.push(n.attrs);
  n.content?.forEach((c) => findDiagrams(c, out));
  return out;
}
async function storedDiagrams(page: Page, id: string) {
  const doc = (await readStore<StoredDoc>(page, 'documents')).find((d) => d.id === id)!;
  return findDiagrams(doc.content.doc);
}

async function newDiagram(page: Page, template: string) {
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /new diagram/i }).click();
  await page.getByRole('menuitem', { name: template, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  return dialog;
}

async function toEndOfText(page: Page) {
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).click();
  // Chromium hands a click's caret to the editor a few milliseconds later (selectionchange is async); a person never
  // types that fast, but a script does, so wait until a previously selected diagram is no longer selected.
  await expect(page.locator('.ProseMirror-selectednode')).toHaveCount(0);
  await page.keyboard.press('End');
}

test('Escape inside the diagram dialog never throws away a new diagram without asking', async ({ page }) => {
  await createFromQuickStart(page, 'Assignment');
  await toEndOfText(page);
  const dialog = await newDiagram(page, 'Flowchart');

  // Escape that closes a label edit stays inside the diagram.
  await dialog.locator('.react-flow__node', { hasText: 'Start' }).dblclick();
  const box = dialog.getByRole('textbox', { name: 'Shape text' });
  await box.fill('Begin');
  await box.press('Escape');
  await expect(box).toBeHidden();
  await expect(dialog).toBeVisible();

  // Make a real change, then press Escape on the dialog itself: it asks, and "Cancel" keeps the work.
  await dialog.locator('.react-flow__node', { hasText: 'Start' }).dblclick();
  await dialog.getByRole('textbox', { name: 'Shape text' }).fill('Begin');
  await dialog.getByRole('textbox', { name: 'Shape text' }).press('Enter');
  await expect(dialog.locator('.react-flow__node', { hasText: 'Begin' })).toBeVisible();
  let asked = 0;
  page.once('dialog', (d) => {
    asked++;
    void d.dismiss();
  });
  await page.keyboard.press('Escape');
  await expect.poll(() => asked).toBe(1);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.react-flow__node', { hasText: 'Begin' })).toBeVisible();

  // Agreeing discards it, and nothing is inserted.
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.ProseMirror .dcos-diagram')).toHaveCount(0);
});

test('cut, paste and copy keep the whole diagram, and inserting next to a selected diagram keeps it', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'keyboard clipboard shortcuts are only reliable in headless Chromium');
  const id = await createFromQuickStart(page, 'Assignment');
  await toEndOfText(page);
  const dialog = await newDiagram(page, 'Flowchart');
  await dialog.getByRole('button', { name: 'Insert into document' }).click();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await waitSaved(page);
  const [original] = await storedDiagrams(page, id);
  expect(original.source).not.toBeNull();

  // Cut, then paste at the end of the text.
  await page.locator('.ProseMirror .dcos-diagram-box').click();
  await page.keyboard.press(`${mod}+x`);
  await expect(page.locator('.ProseMirror .dcos-diagram')).toHaveCount(0);
  await toEndOfText(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press(`${mod}+v`);
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toBeVisible();
  await waitSaved(page);
  await expect.poll(async () => (await storedDiagrams(page, id)).length).toBe(1);
  expect((await storedDiagrams(page, id))[0]).toEqual(original);

  // Copy and paste makes a full duplicate.
  await page.locator('.ProseMirror .dcos-diagram-box').click();
  await page.keyboard.press(`${mod}+c`);
  await toEndOfText(page);
  await page.keyboard.press(`${mod}+v`);
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toHaveCount(2);
  await waitSaved(page);
  await expect.poll(async () => (await storedDiagrams(page, id)).length).toBe(2);
  for (const d of await storedDiagrams(page, id)) expect(d).toEqual(original);

  // A new diagram inserted while one is selected goes next to it instead of replacing it.
  await page.locator('.ProseMirror .dcos-diagram-box').first().click();
  const next = await newDiagram(page, 'Tree diagram');
  await next.getByRole('button', { name: 'Insert into document' }).click();
  await expect(page.locator('.ProseMirror .dcos-diagram img')).toHaveCount(3);
  await waitSaved(page);
  await expect.poll(async () => (await storedDiagrams(page, id)).map((d) => d.title).sort()).toEqual(['Flowchart', 'Flowchart', 'Tree diagram']);
});
