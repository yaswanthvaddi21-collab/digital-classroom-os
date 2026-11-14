// @vitest-environment jsdom
/**
 * Phase 6 (CLIPBOARD): Document Studio recognises Diagram Studio's clipboard data without depending on it, so the two
 * packages' constants must stay equal, and what Diagram Studio writes must be what a document detects as shapes.
 */
import { CLIPBOARD_FORMAT, CLIPBOARD_HTML_ATTR, CLIPBOARD_MIME } from '@dcos/diagram-studio';
import { holdsShapes, SHAPES_CLIPBOARD_FORMAT, SHAPES_CLIPBOARD_HTML_ATTR, SHAPES_CLIPBOARD_MIME } from '../../packages/document-studio/src/extensions/diagramClipboard';
import { describe, expect, it } from 'vitest';
import { clipboardForms, toClipboardPayload } from '../../packages/diagram-studio/src/editor/canvasModel';

describe('Diagram Studio clipboard data in documents', () => {
  it('uses the same type, format and HTML carrier', () => {
    expect(SHAPES_CLIPBOARD_MIME).toBe(CLIPBOARD_MIME);
    expect(SHAPES_CLIPBOARD_FORMAT).toBe(CLIPBOARD_FORMAT);
    expect(SHAPES_CLIPBOARD_HTML_ATTR).toBe(CLIPBOARD_HTML_ATTR);
  });

  it('every form Diagram Studio writes is detected as shapes; its readable text alone is not', () => {
    const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
    const p = toClipboardPayload([{ id: 'a', type: 'shape', position: { x: 0, y: 0 }, width: 100, height: 50, selected: true, data: { ...style, shape: 'rectangle', label: 'Start' } }], [], 'ed', 1, {
      snapToGrid: true,
      showGrid: true,
      autoLayout: 'none',
    })!;
    const f = clipboardForms(p);
    const get = (d: Record<string, string>) => (t: string) => d[t] ?? '';
    expect(holdsShapes(get({ [CLIPBOARD_MIME]: f.json }))).toBe(true);
    expect(holdsShapes(get({ 'text/html': f.html }))).toBe(true);
    expect(holdsShapes(get({ 'text/plain': f.json }))).toBe(true);
    expect(holdsShapes(get({ 'text/plain': f.text }))).toBe(false);
  });
});
