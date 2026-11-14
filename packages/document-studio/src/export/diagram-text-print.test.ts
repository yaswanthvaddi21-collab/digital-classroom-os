// @vitest-environment jsdom
/**
 * Phase 6 (ADR 0013), group EXPORT: embedded diagrams in plain-text export and in print.
 * - plain text lists the diagram's visible labels (reading order), connector labels and its caption;
 * - print shows each diagram's SVG drawing, and never the editor's hints ("Loading diagram…", "Double-click …");
 *   a diagram with no picture prints neutral text and is counted for the user.
 */
import type { JSONContent } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PAGE } from '../types';
import { diagramLabels, DRAWN_DIAGRAM_SCHEMA } from './diagramAssets';
import { cleanClone, collectPrintDiagrams, printClone } from './print';
import { documentToText } from './text';

const node = (id: string, label: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ id, position: { x, y }, width: 100, height: 50, data: { shape: 'rectangle', label }, ...extra });

describe('plain-text export of diagrams', () => {
  const source = {
    schemaVersion: 3,
    layers: [
      { id: 'base', name: 'Base', visible: true, locked: false },
      { id: 'notes', name: 'Notes', visible: false, locked: false },
    ],
    nodes: [
      node('end', 'End', 0, 300),
      node('start', 'Start', 0, 0),
      node('right', 'Right side', 200, 0),
      node('hidden', 'Hidden shape', 0, 100, { hidden: true }),
      node('note', 'On a hidden layer', 0, 150, { layer: 'notes' }),
      node('group', '', 400, 400, { layer: 'notes' }),
      node('child', 'In a hidden group', 10, 10, { parentId: 'group' }),
      node('class', 'Book\n--\n+title', 0, 200),
      node('inner', 'Inside', 10, 10, { parentId: 'grp2' }),
      node('grp2', '', 500, 250),
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'end', label: 'yes' },
      { id: 'e2', source: 'start', target: 'hidden', label: 'never shown' },
      { id: 'e3', source: 'start', target: 'right', label: '' },
    ],
  };

  it('lists visible labels top to bottom, then left to right, then connector labels; hidden ones are left out', () => {
    expect(diagramLabels(source)).toEqual(['Start', 'Right side', 'Book · +title', 'Inside', 'End', 'Start → End: yes']);
  });

  it('writes them under the diagram line, then the caption', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'diagram', attrs: { title: 'Process', source, caption: 'Figure 1: the process' } }],
    };
    const text = documentToText(doc);
    expect(text).toContain('[Diagram: Process]\n   Start\n   Right side\n   Book · +title\n   Inside\n   End\n   Start → End: yes\nFigure 1: the process\n');
    expect(text).not.toContain('Hidden shape');
    expect(text).not.toContain('hidden layer');
    expect(text).not.toContain('hidden group');
  });

  it('never fails on damaged data', () => {
    for (const bad of [null, 'x', 42, [], { nodes: 'x' }, { nodes: [null, 5, { data: 7 }], edges: [null, { source: 1 }], layers: 'x' }]) expect(diagramLabels(bad)).toEqual([]);
    const loop = { nodes: [node('a', 'A', 0, 0, { parentId: 'b' }), node('b', 'B', 0, 10, { parentId: 'a' })], layers: [{ id: 'l', visible: true }] };
    expect(diagramLabels(loop)).toEqual(['A', 'B']);
  });
});

/**
 * An editor DOM like the diagram node view's (diagramEmbed.tsx DiagramView, Round 3: its current markup, with the
 * screen-reader hint and the state in the missing box's label): one with a picture, one still loading, one whose
 * preview is missing.
 */
function editorDom() {
  const root = document.createElement('div');
  root.className = 'ProseMirror';
  root.setAttribute('contenteditable', 'true');
  const hint = (id: string) => `<span id="${id}" class="dcos-diagram-hint dcos-sr-only">Press Enter or double-click (double-tap on a touch screen) to edit this diagram.</span>`;
  const tip = 'title="Press Enter or double-click (double-tap on a touch screen) to edit this diagram."';
  root.innerHTML =
    '<p>Text</p>' +
    `<figure data-type="diagram" class="dcos-diagram"><div class="dcos-diagram-box" ${tip}><img src="blob:png-1" alt="Shown" aria-describedby="h1">${hint('h1')}</div></figure>` +
    `<figure data-type="diagram" class="dcos-diagram"><div class="dcos-diagram-box" ${tip}><div class="dcos-diagram-missing" role="img" data-title="Loading one" aria-label="Loading one — loading" aria-describedby="h2">Loading diagram…</div>${hint('h2')}</div></figure>` +
    `<figure data-type="diagram" class="dcos-diagram"><div class="dcos-diagram-box" ${tip}><div class="dcos-diagram-missing" role="img" data-title="Lost" aria-label="Lost — preview unavailable" aria-describedby="h3">Diagram “Lost” — preview unavailable. Double-click or press Enter to open and re-render it.</div>${hint('h3')}<div class="dcos-diagram-busy" role="status">Editing…</div></div></figure>`;
  document.body.append(root);
  return root;
}

describe('print', () => {
  it('prints no editing hints: a diagram without a picture is neutral text, and is counted', () => {
    const dom = editorDom();
    const { html, placeholders } = printClone(dom, DEFAULT_PAGE);
    expect(html).not.toMatch(/double-click|double-tap|press enter|Loading diagram|Editing…|re-render|aria-describedby/i);
    expect(html).toContain('[Diagram: Loading one — preview not available]');
    expect(html).toContain('[Diagram: Lost — preview not available]');
    expect(html).toContain('src="blob:png-1"');
    expect(placeholders).toBe(2);
    expect(cleanClone(dom, DEFAULT_PAGE)).toBe(html);
    dom.remove();
  });

  it('prints the SVG drawing given for a diagram, in place of its PNG or of its missing preview', () => {
    const dom = editorDom();
    const [shown, loading, lost] = Array.from(dom.querySelectorAll('[data-type="diagram"]'));
    const { html, placeholders } = printClone(dom, DEFAULT_PAGE, [
      { dom: shown, title: 'Shown', src: 'blob:svg-1' },
      { dom: loading, title: 'Loading one', src: 'blob:svg-2' },
      { dom: lost, title: 'Lost', src: null },
    ]);
    const root = document.createElement('div');
    root.innerHTML = html;
    const diagrams = Array.from(root.querySelectorAll('[data-type="diagram"]'));
    expect(diagrams[0].querySelector('img')?.getAttribute('src')).toBe('blob:svg-1');
    expect(diagrams[1].querySelector('img')?.getAttribute('src')).toBe('blob:svg-2');
    expect(diagrams[1].querySelector('img')?.getAttribute('alt')).toBe('Loading one');
    expect(diagrams[2].textContent).toBe('[Diagram: Lost — preview not available]');
    expect(placeholders).toBe(1);
    // The editor itself is unchanged.
    expect(dom.querySelector('img')?.getAttribute('src')).toBe('blob:png-1');
    expect(dom.textContent).toContain('Double-click');
    dom.remove();
  });

  it('finds the diagram inside the node view\'s outer element (what view.nodeDOM gives)', () => {
    const dom = editorDom();
    for (const d of Array.from(dom.querySelectorAll('[data-type="diagram"]'))) {
      const outer = document.createElement('div');
      outer.className = 'react-renderer node-diagram';
      d.replaceWith(outer);
      outer.append(d);
    }
    const outers = Array.from(dom.querySelectorAll('.react-renderer'));
    const { html, placeholders } = printClone(dom, DEFAULT_PAGE, outers.map((o, i) => ({ dom: o, title: `D${i}`, src: `blob:svg-${i}` })));
    const root = document.createElement('div');
    root.innerHTML = html;
    expect(Array.from(root.querySelectorAll('[data-type="diagram"] img')).map((img) => img.getAttribute('src'))).toEqual(['blob:svg-0', 'blob:svg-1', 'blob:svg-2']);
    expect(placeholders).toBe(0);
    dom.remove();
  });

  it('collects each diagram\'s SVG: the stored one, else one drawn from its data (copies drawn once); a newer diagram keeps its PNG', async () => {
    const dom = editorDom();
    const doms = Array.from(dom.querySelectorAll('[data-type="diagram"]'));
    const source = { schemaVersion: 2, nodes: [] };
    const nodes = [
      { attrs: { title: 'Stored', svgPreviewId: 's1', source } },
      { attrs: { title: 'Drawn', source } },
      { attrs: { title: 'Drawn', source } },
      { attrs: { title: 'Newer', source: { schemaVersion: DRAWN_DIAGRAM_SCHEMA + 1 } } },
      { attrs: { title: 'No data', source: null } },
    ];
    const at = [doms[0], doms[1], doms[1], doms[0], doms[2]];
    const view = {
      state: { doc: { descendants: (f: (n: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => void) => nodes.forEach((n, i) => f({ type: { name: 'diagram' }, attrs: n.attrs }, i)) } },
      nodeDOM: (pos: number) => at[pos],
    };
    const host = {
      loadPreview: vi.fn(async () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><title>stored</title></svg>'])),
      renderPreview: vi.fn(async () => ({ png: new Blob([]), svg: '<svg xmlns="http://www.w3.org/2000/svg"><title>drawn</title></svg>', width: 1, height: 1 })),
    };
    const out = await collectPrintDiagrams(view, host);
    expect(out.map((d) => [d.title, d.svg?.match(/<title>(\w+)/)?.[1] ?? null])).toEqual([
      ['Stored', 'stored'],
      ['Drawn', 'drawn'],
      ['Drawn', 'drawn'],
      ['Newer', null],
      ['No data', null],
    ]);
    expect(host.loadPreview).toHaveBeenCalledWith('s1');
    expect(host.renderPreview).toHaveBeenCalledTimes(1);
    dom.remove();
  });

  it('never waits forever, and keeps what is on screen when drawing fails', async () => {
    const dom = editorDom();
    const view = {
      state: { doc: { descendants: (f: (n: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => void) => f({ type: { name: 'diagram' }, attrs: { title: 'Slow', source: { nodes: [] } } }, 0) } },
      nodeDOM: () => dom.querySelector('[data-type="diagram"]'),
    };
    const slow = { loadPreview: async () => undefined, renderPreview: () => new Promise<null>(() => {}) };
    expect(await collectPrintDiagrams(view, slow, 30)).toEqual([expect.objectContaining({ title: 'Slow', svg: null })]);
    const failing = { loadPreview: async () => undefined, renderPreview: async () => Promise.reject(new Error('no canvas')) };
    expect((await collectPrintDiagrams(view, failing))[0].svg).toBeNull();
    expect((await collectPrintDiagrams(view, null))[0].svg).toBeNull();
    dom.remove();
  });
});
