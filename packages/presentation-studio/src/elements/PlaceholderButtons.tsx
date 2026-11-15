import { BarChart3, Image as ImageIcon, Table2 } from 'lucide-react';
import type { Placeholder, PresentationContent, Slide } from '../types';

/** The layout's picture, chart and table placeholders on a slide that nothing fills yet. */
export function emptyPlaceholders(content: PresentationContent, slide: Slide): Placeholder[] {
  const layout = content.layouts.find((l) => l.id === slide.layoutId);
  if (!layout) return [];
  const filled = new Set(slide.elements.map((e) => e.placeholderId).filter(Boolean));
  return layout.placeholders.filter((p) => (p.kind === 'picture' || p.kind === 'chart' || p.kind === 'table') && !filled.has(p.id));
}

const LABELS = { picture: 'Insert picture into the placeholder', chart: 'Insert chart into the placeholder', table: 'Insert table into the placeholder' } as const;

/**
 * Empty picture, chart and table placeholders, drawn on the canvas only (never in thumbnails, the show or exports):
 * a dashed frame with the prompt and the button that fills it. Only the button takes the pointer, so objects lying
 * over a placeholder can still be selected.
 */
export function PlaceholderButtons({ placeholders, canPictures, busy, onFill }: { placeholders: Placeholder[]; canPictures: boolean; busy: boolean; onFill: (p: Placeholder) => void }) {
  return (
    <>
      {placeholders.map((p) => {
        const kind = p.kind as keyof typeof LABELS;
        const usable = kind !== 'picture' || canPictures;
        const Icon = kind === 'picture' ? ImageIcon : kind === 'chart' ? BarChart3 : Table2;
        return (
          <div
            key={p.id}
            data-empty-placeholder={p.id}
            style={{ position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h, outline: '1px dashed #9ca3af', outlineOffset: -1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#8a8f98', fontSize: 16, textAlign: 'center', pointerEvents: 'none' }}
          >
            {usable && (
              <button
                type="button"
                aria-label={LABELS[kind]}
                title={LABELS[kind]}
                disabled={busy}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onFill(p)}
                style={{ pointerEvents: 'auto', width: 56, height: 56, borderRadius: 12, border: '1px solid #c7cbd1', background: 'rgba(255,255,255,0.9)', color: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                className="focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Icon size={28} aria-hidden />
              </button>
            )}
            <span>{usable ? p.prompt : 'Pictures cannot be added here'}</span>
          </div>
        );
      })}
    </>
  );
}
