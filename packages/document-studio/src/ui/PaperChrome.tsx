import type { CSSProperties } from 'react';
import { layoutOf, type HeaderFooterParts, type PageLayout } from '../pageLayout';
import type { PageSettings } from '../types';

/** Whether the page has any header or footer text or page numbers (all drawn by print margin boxes). */
export function usesHeaderFooter(page: PageSettings) {
  const l = layoutOf(page);
  const fp = l.firstPage;
  return !!(
    page.header ||
    page.footer ||
    page.pageNumbers ||
    l.headerLeft ||
    l.headerRight ||
    l.footerLeft ||
    l.footerRight ||
    (fp && (Object.values(fp.header).some(Boolean) || Object.values(fp.footer).some(Boolean)))
  );
}

/** The page number as previewed on screen ("#" stands for the number: the editor shows one continuous sheet). */
function numberPreview(layout: PageLayout) {
  return layout.pageNumberText === 'number' ? '#' : layout.pageNumberText === 'page' ? 'Page #' : 'Page # of #';
}

const row: CSSProperties = { display: 'flex', gap: '1em' };
const cell = (align: 'left' | 'center' | 'right'): CSSProperties => ({ flex: '1 1 0', minWidth: 0, textAlign: align, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });

function Parts({ parts, className, label }: { parts: HeaderFooterParts; className: string; label: string }) {
  if (!parts.left && !parts.center && !parts.right) return null;
  // Text only in the centre keeps v0.1.0's single centred line.
  if (!parts.left && !parts.right) return <div className={className} title={label}>{parts.center}</div>;
  return (
    <div className={className} style={row} title={label}>
      <span style={cell('left')}>{parts.left}</span>
      <span style={cell('center')}>{parts.center}</span>
      <span style={cell('right')}>{parts.right}</span>
    </div>
  );
}

const withNumber = (parts: HeaderFooterParts, at: keyof HeaderFooterParts | null, number: string): HeaderFooterParts =>
  at ? { ...parts, [at]: [parts[at], number].filter(Boolean).join('   ·   ') } : parts;

/**
 * Header preview at the top of the sheet. The top of the sheet is the first page, so a different first page shows
 * its own header there.
 */
export function PaperHeader({ page }: { page: PageSettings }) {
  const l = layoutOf(page);
  if (l.firstPage) return <Parts parts={l.firstPage.header} className="dcos-paper-header" label="First page header" />;
  return <Parts parts={{ left: l.headerLeft, center: page.header, right: l.headerRight }} className="dcos-paper-header" label="Header" />;
}

/** Footer preview at the bottom of the sheet, with "#" where the page number goes. */
export function PaperFooter({ page }: { page: PageSettings }) {
  const l = layoutOf(page);
  const parts = { left: l.footerLeft, center: page.footer, right: l.footerRight };
  return <Parts parts={withNumber(parts, page.pageNumbers ? l.pageNumberAlign : null, numberPreview(l))} className="dcos-paper-footer" label="Footer" />;
}
