// @vitest-environment jsdom
/** What G-DRAWIO's presentation fields look like on the canvas: pictures, opacity, rotation, font and alignment. */
import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { DiagramEditor } from './DiagramEditor';
import { imageShapeSvg, labelBoxStyle, labelTextStyle, RotatedBody, shapeOpacity, svgTextAnchor } from './shapePresentation';
import { ShapeSvg } from './shapes';
import type { DiagramContent, ShapeData } from './types';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly ??= class {
    m22 = 1;
  };
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const base = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const data = (extra: Partial<ShapeData>): ShapeData => ({ ...base, shape: 'rectangle', label: 'x', ...extra });

describe('presentation helpers', () => {
  it('maps the fields to styles, and the defaults to nothing', () => {
    expect(shapeOpacity(data({}))).toBeUndefined();
    expect(shapeOpacity(data({ opacity: 25 }))).toBe(0.25);
    expect(labelBoxStyle(data({}))).toEqual({});
    expect(labelBoxStyle(data({ textAlign: 'left', verticalAlign: 'bottom' }))).toEqual({ justifyContent: 'flex-start', textAlign: 'left', alignItems: 'flex-end' });
    expect(labelTextStyle(data({}))).toEqual({});
    expect(labelTextStyle(data({ fontFamily: 'Georgia' }))).toEqual({ fontFamily: 'Georgia' });
    expect(svgTextAnchor(data({ textAlign: 'right' }), 100)).toEqual({ anchor: 'end', x: 90 });
  });

  it('draws a picture in an <image>, or a labelled frame when there is none', () => {
    const { container, rerender } = render(<svg>{imageShapeSvg({ image: PNG }, 80, 60)}</svg>);
    expect(container.querySelector('image')!.getAttribute('href')).toBe(PNG);
    expect(container.querySelector('image')!.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    rerender(<svg>{imageShapeSvg({}, 80, 60)}</svg>);
    expect(container.querySelector('image')).toBeNull();
    expect(container.textContent).toBe('picture');
  });

  it('ShapeSvg applies opacity and draws image shapes from their data', () => {
    const { container } = render(<ShapeSvg shape="image" width={80} height={60} fill="transparent" stroke="transparent" strokeWidth={0} data={data({ shape: 'image', image: PNG, opacity: 50 })} />);
    expect((container.querySelector('svg') as SVGElement).style.opacity).toBe('0.5');
    expect(container.querySelector('image')!.getAttribute('href')).toBe(PNG);
  });

  it('turns only rotated bodies', () => {
    const { container, rerender } = render(<RotatedBody rotation={undefined}><i /></RotatedBody>);
    expect(container.querySelector('.dcos-shape-rotated')).toBeNull();
    rerender(<RotatedBody rotation={30}><i /></RotatedBody>);
    expect((container.querySelector('.dcos-shape-rotated') as HTMLElement).style.transform).toBe('rotate(30deg)');
  });
});

describe('on the canvas', () => {
  it('draws pictures, opacity, rotation, fonts and alignment as the file describes them', () => {
    const content: DiagramContent = {
      schemaVersion: 3,
      nodes: [
        { id: 'pic', position: { x: 0, y: 0 }, width: 80, height: 80, data: data({ shape: 'image', label: 'Logo', fill: 'transparent', stroke: 'transparent', strokeWidth: 0, image: PNG }) },
        { id: 'styled', position: { x: 200, y: 0 }, width: 160, height: 80, data: data({ label: 'Styled', opacity: 40, rotation: 20, fontFamily: 'Georgia', textAlign: 'right', verticalAlign: 'top' }) },
        { id: 'plain', position: { x: 400, y: 0 }, width: 160, height: 80, data: data({ label: 'Plain' }) },
      ],
      edges: [],
      viewport: null,
      settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
    };
    const { container } = render(<DiagramEditor initialContent={content} title="T" />);
    const node = (id: string) => container.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
    expect(node('pic').querySelector('image')!.getAttribute('href')).toBe(PNG);
    const styled = node('styled');
    expect((styled.querySelector('.dcos-shape-svg') as SVGElement).style.opacity).toBe('0.4');
    expect((styled.querySelector('.dcos-shape-rotated') as HTMLElement).style.transform).toBe('rotate(20deg)');
    const label = styled.querySelector('.dcos-shape-label') as HTMLElement;
    expect([label.style.justifyContent, label.style.alignItems, label.style.textAlign]).toEqual(['flex-end', 'flex-start', 'right']);
    expect((label.querySelector('span') as HTMLElement).style.fontFamily).toBe('Georgia');
    // Shapes without these fields render as before.
    const plain = node('plain');
    expect(plain.querySelector('.dcos-shape-rotated')).toBeNull();
    expect((plain.querySelector('.dcos-shape-svg') as SVGElement).style.opacity).toBe('');
    expect((plain.querySelector('.dcos-shape-label') as HTMLElement).style.justifyContent).toBe('');
  });
});
