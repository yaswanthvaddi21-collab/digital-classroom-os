import { expect, test, type Page } from './fixtures';
import { inflateSync } from 'node:zlib';
import { createFromQuickStart, downloadBytes } from './helpers';

// G-EXPORT: images are drawn from the diagram's content by the vector renderer (no foreignObject), PDF is vector with
// real text, and the Export options dialog offers PNG scale and background, PDF pages and selection only.

/** Exports with a one-click Export menu entry and returns the file. */
async function quickExport(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Export' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()]);
  return { name: file.suggestedFilename(), bytes: await downloadBytes(file) };
}

/** Opens Export options…, runs `choose` in the dialog, exports and returns the file. */
async function optionsExport(page: Page, choose: (dialog: ReturnType<Page['getByRole']>) => Promise<void>) {
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /Export options…/ }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Export diagram' });
  await expect(dialog).toBeVisible();
  await choose(dialog);
  const [file] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /^Export (PNG|SVG|PDF)$/ }).click()]);
  await expect(dialog).toBeHidden();
  return { name: file.suggestedFilename(), bytes: await downloadBytes(file) };
}

/** Every content stream of a PDF, inflated, and the number of pages. */
function readPdf(bytes: Buffer) {
  const text = bytes.toString('latin1');
  const streams: string[] = [];
  const re = /(?<!end)stream\r?\n/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) break;
    const raw = bytes.subarray(start, end);
    try {
      streams.push(inflateSync(raw).toString('latin1'));
    } catch {
      streams.push(raw.toString('latin1'));
    }
    re.lastIndex = end;
  }
  return { text, streams: streams.join('\n'), pages: (text.match(/\/Type \/Page\b/g) ?? []).length };
}

const numbers = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map((n) => Math.round(Number(n)));
/** A translate as [x, y]: Firefox writes `translate(200px)` where Chromium writes `translate(200px, 0px)`. */
const translate = (t: string) => {
  const [x = 0, y = 0] = numbers(t);
  return [x, y];
};

test('the SVG export is plain vector SVG that matches the canvas and opens as an image', async ({ page }) => {
  await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  const canvas = await page.evaluate(() => ({
    edges: Object.fromEntries([...document.querySelectorAll('.react-flow__edge')].map((e) => [e.getAttribute('data-id') ?? e.getAttribute('data-testid')?.replace('rf__edge-', ''), e.querySelector('.react-flow__edge-path')!.getAttribute('d')])),
    nodes: Object.fromEntries([...document.querySelectorAll<HTMLElement>('.react-flow__node')].map((n) => [n.getAttribute('data-id'), n.style.transform])),
  }));

  const { name, bytes } = await quickExport(page, /^SVG image/);
  expect(name).toBe('Flowchart.svg');
  const svg = bytes.toString('utf8');
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg).not.toMatch(/foreignObject|<div|class=/);

  const exported = await page.evaluate((s) => {
    const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
    return {
      error: !!doc.querySelector('parsererror'),
      edges: Object.fromEntries([...doc.querySelectorAll('[data-edge-id]')].map((g) => [g.getAttribute('data-edge-id'), g.querySelector('path')!.getAttribute('d')])),
      nodes: Object.fromEntries([...doc.querySelectorAll('[data-node-id]')].map((g) => [g.getAttribute('data-node-id'), g.getAttribute('transform')])),
      texts: [...doc.querySelectorAll('text')].map((t) => t.textContent),
    };
  }, svg);
  expect(exported.error).toBe(false);
  // Same connector geometry as React Flow draws on the canvas (end points at the handles, same corners).
  expect(Object.keys(exported.edges).sort()).toEqual(Object.keys(canvas.edges).sort());
  for (const [id, d] of Object.entries(canvas.edges)) expect(numbers(String(exported.edges[id])), id).toEqual(numbers(String(d)));
  for (const [id, t] of Object.entries(canvas.nodes)) expect(translate(String(exported.nodes[id])), id).toEqual(translate(String(t)));
  expect(exported.texts).toEqual(expect.arrayContaining(['Start', 'Read number N', 'Yes', 'No']));

  // The file opens as an image in the browser (a plain SVG viewer): the Start terminator's fill is painted.
  const drawn = await page.evaluate(async (s) => {
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    // Start is at (200, 0) 150 × 80 and the drawing starts at (-20, -40): its centre is at (295, 80) in the image.
    return { w: img.naturalWidth, h: img.naturalHeight, px: [...g.getImageData(250, 60, 1, 1).data] };
  }, svg);
  expect(drawn.w).toBeGreaterThan(400);
  expect(drawn.px).toEqual([0xe0, 0xe7, 0xff, 255]);
});

test('the PDF is vector, with real text and no picture of the diagram', async ({ page }) => {
  await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  const { name, bytes } = await quickExport(page, /^PDF/);
  expect(name).toBe('Flowchart.pdf');
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  const pdf = readPdf(bytes);
  expect(pdf.pages).toBe(1);
  expect(pdf.text).not.toMatch(/\/Subtype\s*\/Image/);
  // Text drawn as text (searchable, selectable), in the built-in Helvetica.
  expect(pdf.streams).toMatch(/\(Read number N\)\s*Tj/);
  expect(pdf.streams).toMatch(/\(Start\)\s*Tj/);
  expect(pdf.text).toMatch(/\/BaseFont \/Helvetica/);
  // Page sized to the diagram: 590 × 720 CSS px at 0.75 pt.
  expect(pdf.text).toMatch(/\/MediaBox \[0 0 442\.\d+ 540\.?\d*\]/);
});

test('Export options: A4 landscape at actual size splits the flowchart across two pages and says so', async ({ page }) => {
  await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  const { bytes } = await optionsExport(page, async (dialog) => {
    await dialog.getByText('PDF (vector)').click();
    await dialog.getByLabel('Page size').selectOption('a4');
    await dialog.getByLabel('Orientation').selectOption('landscape');
    await dialog.getByText(/^Actual size/).click();
    await expect(dialog.getByRole('status')).toHaveText('2 pages, 297 × 210 mm');
  });
  const pdf = readPdf(bytes);
  expect(pdf.pages).toBe(2);
  expect(pdf.text.match(/\/MediaBox \[0 0 841\.8\d* 595\.2\d*\]/g)).toHaveLength(2);
  expect(pdf.streams).toMatch(/\(Start\)\s*Tj/);
  expect(pdf.streams).toMatch(/\(End\)\s*Tj/);
  await expect(page.getByText('Exported PDF. It was split across 2 A4 landscape pages (1 across, 2 down) at actual size.')).toBeVisible();
});

test('Export options: a 1× PNG with a transparent background', async ({ page }) => {
  await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  const { name, bytes } = await optionsExport(page, async (dialog) => {
    await dialog.getByText('1×', { exact: true }).click();
    await dialog.getByText('Transparent').click();
    await expect(dialog.getByRole('status')).toHaveText('590 × 720 pixels');
  });
  expect(name).toBe('Flowchart.png');
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('\u0089PNG');
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([590, 720]);
  const px = await page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    return { corner: [...g.getImageData(2, 2, 1, 1).data], start: [...g.getImageData(250, 60, 1, 1).data] };
  }, bytes.toString('base64'));
  expect(px.corner[3]).toBe(0); // transparent paper
  expect(px.start).toEqual([0xe0, 0xe7, 0xff, 255]); // the Start shape is painted
});

test('Export options: selection only exports just the selected shapes', async ({ page }) => {
  await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await page.locator('.react-flow__node', { hasText: 'Start' }).click();
  const { bytes } = await optionsExport(page, async (dialog) => {
    await expect(dialog.getByRole('radio', { name: 'Selection only (1 shape)' })).toBeChecked();
    await dialog.getByText('SVG (vector)').click();
  });
  const svg = bytes.toString('utf8');
  expect(svg.match(/data-node-id="/g)).toHaveLength(1);
  expect(svg).toContain('>Start</text>');
  expect(svg).not.toContain('data-edge-id');
  await expect(page.getByText('Exported SVG of the selection')).toBeVisible();
});

test('a shape in a group, a hidden shape and a linked shape export as on the canvas, with notes', async ({ page }) => {
  // A schema-3 diagram opened from a native file.
  const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
  const diagram = {
    schemaVersion: 3,
    nodes: [
      { id: 'g', position: { x: 300, y: 200 }, width: 300, height: 200, data: { ...style, shape: 'group', fill: 'transparent', stroke: 'transparent', strokeWidth: 0, label: '' } },
      { id: 'c', position: { x: 10, y: 10 }, width: 120, height: 60, parentId: 'g', data: { ...style, shape: 'rectangle', label: 'Child', link: 'https://example.com/', tooltip: 'Opens the site' } },
      { id: 'h', position: { x: 0, y: 0 }, width: 120, height: 60, hidden: true, data: { ...style, shape: 'rectangle', label: 'Hidden' } },
    ],
    edges: [],
    viewport: null,
    settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
  };
  await page.goto('./#/diagrams');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagram file' }).click()]);
  await chooser.setFiles({ name: 'Grouped.dcosdiagram', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'dcos-diagram', version: 1, app: 'test', title: 'Grouped', diagram })) });
  await expect(page.locator('.react-flow__node[data-id="c"]')).toBeVisible();

  const { bytes } = await quickExport(page, /^SVG image/);
  const svg = bytes.toString('utf8');
  expect(svg).toMatch(/transform="translate\(310 210\)" data-node-id="c"|data-node-id="c"[^>]*transform="translate\(310 210\)"/);
  expect(svg).not.toContain('>Hidden<');
  expect(svg).toContain('href="https://example.com/"');
  expect(svg).toContain('<title>Opens the site</title>');
  await expect(page.getByText('Exported SVG. 1 hidden shape was left out.')).toBeVisible();

  const png = await quickExport(page, /^PNG/);
  expect(png.bytes.subarray(0, 4).toString('latin1')).toBe('\u0089PNG');
  await expect(page.getByText(/Exported PNG\. 1 hidden shape was left out\. 1 link and 1 tooltip cannot be kept in a PNG image/)).toBeVisible();

  const pdf = readPdf((await quickExport(page, /^PDF/)).bytes);
  expect(pdf.streams).toMatch(/\(Child\)\s*Tj/);
  expect(pdf.text).toMatch(/\/URI \(https:\/\/example\.com\/\)/); // the link stays clickable in the PDF
  await expect(page.getByText(/Exported PDF\. 1 hidden shape was left out\. 1 tooltip is not kept in the PDF/)).toBeVisible();
});
