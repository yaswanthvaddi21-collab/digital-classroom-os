import { Button, cn, Dialog, Select } from '@dcos/ui';
import { ImagePlus } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { PresentationImageHost } from '../hosts';
import { useAttachmentUrl } from '../render/attachments';
import { resolveColor } from '../themes';
import type { Background, Color, GradientStop, PresentationTheme, ThemeColorSlot } from '../types';
import { STANDARD_COLORS } from '../ui/parts';
import { radioArrows } from './radio';

/** Picture types every browser draws and every export format takes. */
export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const SLOTS: Array<[ThemeColorSlot, string]> = [
  ['light1', 'Background'],
  ['light2', 'Background 2'],
  ['dark1', 'Text'],
  ['dark2', 'Text 2'],
  ['accent1', 'Accent 1'],
  ['accent2', 'Accent 2'],
  ['accent3', 'Accent 3'],
  ['accent4', 'Accent 4'],
  ['accent5', 'Accent 5'],
  ['accent6', 'Accent 6'],
];

/** Gradient directions, as OOXML angles (0 = left to right, 90 = top to bottom). */
export const GRADIENT_DIRECTIONS: Array<[number, string]> = [
  [90, 'Top to bottom'],
  [270, 'Bottom to top'],
  [0, 'Left to right'],
  [180, 'Right to left'],
  [45, 'Diagonal, top left to bottom right'],
  [315, 'Diagonal, bottom left to top right'],
];

/** Gradients made of theme colours, so they follow a theme change. */
export const GRADIENT_PRESETS: Array<{ name: string; from: ThemeColorSlot; to: ThemeColorSlot }> = [
  { name: 'Soft', from: 'light1', to: 'light2' },
  { name: 'Accent', from: 'accent1', to: 'accent2' },
  { name: 'Deep', from: 'dark2', to: 'accent1' },
  { name: 'Warm', from: 'accent3', to: 'accent4' },
  { name: 'Cool', from: 'accent6', to: 'accent1' },
  { name: 'Mist', from: 'light2', to: 'accent6' },
];

const sameColor = (a: Color, b: Color) => JSON.stringify(a) === JSON.stringify(b);
const firstColor = (bg: Background): Color => (bg.type === 'solid' ? bg.color : bg.type === 'gradient' ? [...bg.stops].sort((a, b) => a.position - b.position)[0]?.color ?? { theme: 'light1' } : { theme: 'light1' });

/** A CSS preview of a background (for swatches). */
export function backgroundCss(bg: Background, theme: PresentationTheme): string {
  if (bg.type === 'solid') return resolveColor(bg.color, theme);
  if (bg.type === 'gradient') return `linear-gradient(${bg.angle + 90}deg, ${[...bg.stops].sort((a, b) => a.position - b.position).map((s) => `${resolveColor(s.color, theme)} ${Math.round(s.position * 100)}%`).join(', ')})`;
  return theme.colors.light2;
}

export interface BackgroundDialogProps {
  open: boolean;
  onClose: () => void;
  /** What the background is for ("Slide 2", "Layout: Title slide"…). */
  description: string;
  theme: PresentationTheme;
  /** The background shown now. */
  value: Background;
  /**
   * Changes the background. `continuous` marks a change while a colour is being dragged in the system colour picker:
   * a run of them is one undo step.
   */
  onChange: (bg: Background, continuous?: boolean) => void;
  /** "Reset background" (the slide or layout then shows what is beneath); left out when there is nothing to reset. */
  onReset?: () => void;
  resetLabel?: string;
  /** "Apply to all slides"; left out where it does not apply. */
  onApplyAll?: () => void;
  imageHost?: PresentationImageHost;
  onError: (message: string) => void;
}

/**
 * "Format background": a solid colour (theme or standard colours, or any colour), a two-colour gradient (theme
 * presets, direction, colours) or a picture (stored as an attachment through the image host), applied as it is
 * chosen. Picture is offered only when the app can store pictures.
 */
export function BackgroundDialog(props: BackgroundDialogProps) {
  const { value, theme, onChange } = props;
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pictures = !!props.imageHost;
  const picture = useAttachmentUrl(props.imageHost, value.type === 'image' ? value.attachmentId : undefined);
  const preview = value.type === 'image' && picture.state === 'ready' ? { backgroundImage: `url("${picture.url}")`, backgroundSize: value.fit === 'stretch' ? '100% 100%' : value.fit, backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : { background: backgroundCss(value, theme) };

  const setType = (type: Background['type']) => {
    if (type === value.type) return;
    if (type === 'solid') onChange({ type: 'solid', color: firstColor(value) });
    else if (type === 'gradient') {
      const from = firstColor(value);
      onChange({ type: 'gradient', angle: 90, stops: [{ position: 0, color: from }, { position: 1, color: sameColor(from, { theme: 'light2' }) ? { theme: 'accent1' } : { theme: 'light2' } }] });
    } else file.current?.click();
  };

  const choosePicture = async (f: File | undefined) => {
    if (!f || !props.imageHost) return;
    if (!PICTURE_TYPES.includes(f.type)) {
      props.onError('Choose a PNG, JPEG, GIF or WebP picture.');
      return;
    }
    setBusy(true);
    try {
      const stored = await props.imageHost.putAttachment(f, f.type);
      onChange({ type: 'image', attachmentId: stored.id, fit: value.type === 'image' ? value.fit : 'cover' });
    } catch (err) {
      props.onError(`The picture could not be stored: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const swatch = (label: string, css: string, pressed: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn('h-7 w-7 rounded-md border border-black/15 transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent', pressed && 'ring-2 ring-accent ring-offset-1')}
      style={{ background: css }}
    />
  );

  const fillTypes: Array<[Background['type'], string]> = [
    ['solid', 'Solid colour'],
    ['gradient', 'Gradient'],
    ...(pictures || value.type === 'image' ? ([['image', 'Picture']] as Array<[Background['type'], string]>) : []),
  ];

  let body: ReactNode = null;
  if (value.type === 'solid') {
    const color = value.color;
    body = (
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1 text-xs text-muted">Theme colours</div>
          <div className="flex flex-wrap gap-1.5">{SLOTS.map(([slot, name]) => swatch(`${name} (${theme.colors[slot]})`, theme.colors[slot], sameColor(color, { theme: slot }), () => onChange({ type: 'solid', color: { theme: slot } })))}</div>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">Standard colours</div>
          <div className="flex flex-wrap gap-1.5">{STANDARD_COLORS.map((c) => swatch(`Colour ${c}`, c, sameColor(color, c), () => onChange({ type: 'solid', color: c })))}</div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="color" aria-label="Custom colour" value={resolveColor(color, theme)} onChange={(e) => onChange({ type: 'solid', color: e.target.value.toLowerCase() }, true)} className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent" />
          Custom colour
        </label>
      </div>
    );
  } else if (value.type === 'gradient') {
    const stops = [...value.stops].sort((a, b) => a.position - b.position);
    const from = stops[0]?.color ?? { theme: 'light1' };
    const to = stops[stops.length - 1]?.color ?? { theme: 'light2' };
    const withStops = (a: Color, b: Color): GradientStop[] => [{ position: 0, color: a }, { position: 1, color: b }];
    body = (
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1 text-xs text-muted">Theme gradients</div>
          <div className="flex flex-wrap gap-1.5">
            {GRADIENT_PRESETS.map((g) =>
              swatch(
                `${g.name} gradient`,
                backgroundCss({ type: 'gradient', angle: value.angle, stops: withStops({ theme: g.from }, { theme: g.to }) }, theme),
                stops.length === 2 && sameColor(from, { theme: g.from }) && sameColor(to, { theme: g.to }),
                () => onChange({ type: 'gradient', angle: value.angle, stops: withStops({ theme: g.from }, { theme: g.to }) }),
              ),
            )}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Direction
          <Select aria-label="Gradient direction" value={String(value.angle)} onChange={(e) => onChange({ ...value, angle: Number(e.target.value) })}>
            {!GRADIENT_DIRECTIONS.some(([a]) => a === value.angle) && <option value={String(value.angle)}>{value.angle}°</option>}
            {GRADIENT_DIRECTIONS.map(([a, name]) => (
              <option key={a} value={String(a)}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="color" aria-label="Start colour" value={resolveColor(from, theme)} onChange={(e) => onChange({ ...value, stops: withStops(e.target.value.toLowerCase(), to) }, true)} className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent" />
            Start colour
          </label>
          <label className="flex items-center gap-2">
            <input type="color" aria-label="End colour" value={resolveColor(to, theme)} onChange={(e) => onChange({ ...value, stops: withStops(from, e.target.value.toLowerCase()) }, true)} className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent" />
            End colour
          </label>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Fit
          <Select aria-label="Picture fit" value={value.fit} onChange={(e) => onChange({ ...value, fit: e.target.value as 'cover' | 'contain' | 'stretch' })}>
            <option value="cover">Fill the slide (crop)</option>
            <option value="contain">Fit inside the slide</option>
            <option value="stretch">Stretch</option>
          </Select>
        </label>
        {pictures && (
          <div>
            <Button size="sm" icon={<ImagePlus size={14} />} disabled={busy} onClick={() => file.current?.click()}>
              Change picture…
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Format background"
      description={props.description}
      footer={
        <>
          {props.onReset && <Button onClick={props.onReset}>{props.resetLabel ?? 'Reset background'}</Button>}
          {props.onApplyAll && <Button onClick={props.onApplyAll}>Apply to all slides</Button>}
          <Button variant="primary" onClick={props.onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Fill" onKeyDown={radioArrows} className="flex flex-wrap gap-1.5">
          {fillTypes.map(([type, label]) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={value.type === type}
              disabled={busy || (type === 'image' && !pictures)}
              onClick={() => setType(type)}
              className={cn('rounded-lg border px-3 py-1.5 text-sm', value.type === type ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:bg-surface-2')}
            >
              {type === 'image' && value.type !== 'image' ? 'Picture…' : label}
            </button>
          ))}
        </div>
        <div className="h-16 w-28 rounded-md border border-border" data-background-preview="" aria-hidden style={preview} />
        {busy ? <p className="text-sm text-muted">Storing the picture…</p> : body}
        <input
          ref={file}
          type="file"
          accept={PICTURE_TYPES.join(',')}
          aria-label="Background picture file"
          className="hidden"
          onChange={(e) => {
            void choosePicture(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </Dialog>
  );
}
