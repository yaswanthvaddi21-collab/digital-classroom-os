import { cn, Dialog, Menu, Select } from '@dcos/ui';
import { ChevronDown, LayoutTemplate, Paintbrush, Palette, RotateCcw, SquareStack } from 'lucide-react';
import { cssFontFamily, THEMES } from '../themes';
import { sizeIdOf, type PresentationContent, type PresentationTheme, type SlideSizeId, type ThemeFonts } from '../types';
import { FONT_NAMES } from '../ui/HomeTab';
import { LayoutThumb } from '../ui/LayoutPicker';
import { Group, Popover, ToolButton } from '../ui/parts';
import { backgroundCss } from './BackgroundDialog';
import { radioArrows } from './radio';

export interface DesignCommands {
  content: PresentationContent;
  /** The slides the slide commands apply to (the selected ones). */
  slideIds: string[];
  applyTheme: (theme: PresentationTheme) => void;
  applyColors: (colors: PresentationTheme['colors']) => void;
  applyFonts: (fonts: ThemeFonts) => void;
  setSize: (size: SlideSizeId) => void;
  openBackground: () => void;
  changeLayout: (layoutId: string) => void;
  resetSlides: () => void;
  openMaster: () => void;
}

/** A theme drawn small: its background, "Aa" in its heading font and text colour, and its first four accents. */
function ThemeCard({ theme }: { theme: Pick<PresentationTheme, 'colors' | 'fonts'> }) {
  return (
    <span aria-hidden className="flex h-12 w-20 flex-col justify-between rounded-md border border-black/15 p-1.5" style={{ background: backgroundCss({ type: 'solid', color: { theme: 'light1' } }, theme as PresentationTheme) }}>
      <span className="text-sm font-semibold leading-none" style={{ color: theme.colors.dark1, fontFamily: cssFontFamily(theme.fonts.heading) }}>
        Aa
      </span>
      <span className="flex gap-0.5">
        {(['accent1', 'accent2', 'accent3', 'accent4'] as const).map((s) => (
          <span key={s} className="h-2 w-3 rounded-sm" style={{ background: theme.colors[s] }} />
        ))}
      </span>
    </span>
  );
}

const sameColors = (a: Record<string, string>, b: Record<string, string>) => Object.keys(b).every((k) => a[k]?.toLowerCase() === b[k]?.toLowerCase());

/**
 * The theme gallery: the built-in themes (colours and fonts together), then the built-in colour sets alone and the
 * heading and body fonts alone. A mix is stored as a custom theme.
 */
function ThemeGallery({ ctx, close }: { ctx: DesignCommands; close: () => void }) {
  const current = ctx.content.theme;
  const fontOptions = (value: string) => (FONT_NAMES.includes(value) ? FONT_NAMES : [...FONT_NAMES, value]);
  return (
    <div className="flex w-[19rem] max-w-[calc(100vw-2rem)] flex-col gap-3 text-xs">
      <div>
        <div className="mb-1 text-muted">Themes</div>
        <div role="radiogroup" aria-label="Themes" onKeyDown={radioArrows} className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => {
            const checked = ctx.content.themeId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={`${t.name} theme`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  ctx.applyTheme(t);
                  close();
                }}
                className={cn('flex flex-col items-center gap-1 rounded-lg p-1 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent', checked && 'bg-accent-soft ring-1 ring-accent')}
              >
                <ThemeCard theme={t} />
                <span className="truncate">{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-1 text-muted">Colours</div>
        <div role="radiogroup" aria-label="Theme colours" onKeyDown={radioArrows} className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => {
            const checked = sameColors(current.colors, t.colors);
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={`${t.name} colours`}
                title={`${t.name} colours`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ctx.applyColors(t.colors)}
                className={cn('flex gap-0.5 rounded-md border border-border p-1 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent', checked && 'ring-2 ring-accent')}
              >
                {(['light1', 'dark1', 'accent1', 'accent2', 'accent3'] as const).map((s) => (
                  <span key={s} aria-hidden className="h-4 w-2.5 rounded-sm border border-black/10" style={{ background: t.colors[s] }} />
                ))}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Heading font</span>
          <Select aria-label="Heading font" value={current.fonts.heading} onChange={(e) => ctx.applyFonts({ ...current.fonts, heading: e.target.value })} className="h-8 py-0 text-xs">
            {fontOptions(current.fonts.heading).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Body font</span>
          <Select aria-label="Body font" value={current.fonts.body} onChange={(e) => ctx.applyFonts({ ...current.fonts, body: e.target.value })} className="h-8 py-0 text-xs">
            {fontOptions(current.fonts.body).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </label>
      </div>
    </div>
  );
}

/**
 * The Design tab: themes (with colours and fonts), the slide size, the selected slides' background, layout and reset,
 * and the slide master.
 */
export function DesignTab(ctx: DesignCommands) {
  const none = ctx.slideIds.length === 0;
  const many = ctx.slideIds.length > 1;
  const theme = ctx.content.theme;
  return (
    <>
      <Group label="Themes">
        <Popover
          label="Themes"
          trigger={({ open, toggle }) => (
            <ToolButton label="Themes" text={`Theme: ${theme.name}`} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
              <Palette size={16} />
            </ToolButton>
          )}
        >
          {(close) => <ThemeGallery ctx={ctx} close={close} />}
        </Popover>
      </Group>
      <Group label="Slide size">
        <Select aria-label="Slide size" value={sizeIdOf(ctx.content.size)} onChange={(e) => ctx.setSize(e.target.value as SlideSizeId)} className="h-8 w-40 py-0 text-xs">
          <option value="16:9">Widescreen (16:9)</option>
          <option value="4:3">Standard (4:3)</option>
        </Select>
      </Group>
      <Group label="Slides">
        <ToolButton label={many ? 'Format background of the selected slides' : 'Format background'} text="Background" disabled={none} onClick={ctx.openBackground}>
          <Paintbrush size={16} />
        </ToolButton>
        <Menu
          trigger={(p) => (
            <button
              type="button"
              {...p}
              aria-haspopup="menu"
              aria-label={many ? 'Layout of the selected slides' : 'Layout'}
              disabled={none}
              onMouseDown={(e) => e.preventDefault()}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
            >
              <LayoutTemplate size={16} />
              Layout
              <ChevronDown size={12} />
            </button>
          )}
          items={ctx.content.layouts.map((l) => ({ label: l.name, icon: <LayoutThumb layout={l} size={ctx.content.size} />, onSelect: () => ctx.changeLayout(l.id) }))}
        />
        <ToolButton label={many ? 'Reset slides' : 'Reset slide'} text="Reset" disabled={none} onClick={ctx.resetSlides}>
          <RotateCcw size={16} />
        </ToolButton>
      </Group>
      <Group label="Master">
        <ToolButton label="Edit the slide master and layouts" text="Slide master" onClick={ctx.openMaster}>
          <SquareStack size={16} />
        </ToolButton>
      </Group>
    </>
  );
}

/** "Layout…" from the slide menu: every layout, drawn small; the one the selected slides use is marked. */
export function LayoutDialog({ open, onClose, content, slideIds, onPick }: { open: boolean; onClose: () => void; content: PresentationContent; slideIds: string[]; onPick: (layoutId: string) => void }) {
  const using = new Set(content.slides.filter((s) => slideIds.includes(s.id)).map((s) => s.layoutId));
  return (
    <Dialog open={open} onClose={onClose} title="Layout" description={slideIds.length > 1 ? `${slideIds.length} slides` : 'The selected slide'}>
      <div role="radiogroup" aria-label="Layouts" onKeyDown={radioArrows} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {content.layouts.map((l) => {
          const checked = using.size === 1 && using.has(l.id);
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onPick(l.id)}
              className={cn('flex flex-col items-center gap-1 rounded-lg border p-2 text-xs hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent', checked ? 'border-accent bg-accent-soft' : 'border-border')}
            >
              <LayoutThumb layout={l} size={content.size} />
              {l.name}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
