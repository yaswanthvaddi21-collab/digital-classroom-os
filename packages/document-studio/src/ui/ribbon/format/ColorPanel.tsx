import { Button, Input } from '@dcos/ui';
import { useId, useState } from 'react';
import { toHex } from '../../../export/docx/units';
import { Swatches } from '../../Popover';

/** "#1d4ed8", "1d4ed8", "#abc" → "#1d4ed8" / "#aabbcc"; anything else → null. */
export function parseHexColour(text: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${hex.toLowerCase()}`;
}

/**
 * Colour popover body: the preset swatches, a colour picker (any colour) and a hex field for typing an exact colour.
 * `onLive` applies the picker's colour while it is being chosen (the popover stays open); `onPick` applies and closes.
 */
export function ColorPanel({
  colors,
  clearLabel,
  label,
  current,
  onPick,
  onLive,
  onClear,
}: {
  colors: string[];
  clearLabel: string;
  /** e.g. "Custom text colour". */
  label: string;
  /** The colour at the cursor, if any (any CSS colour). */
  current?: string | null;
  onPick: (c: string) => void;
  onLive: (c: string) => void;
  onClear: () => void;
}) {
  const start = toHex(current ?? '') ? `#${toHex(current ?? '')!.toLowerCase()}` : '#000000';
  const [hex, setHex] = useState(start);
  const [error, setError] = useState(false);
  const errorId = useId();
  const apply = () => {
    const c = parseHexColour(hex);
    setError(!c);
    if (c) onPick(c);
  };
  return (
    <div className="flex w-52 flex-col gap-2">
      <Swatches colors={colors} clearLabel={clearLabel} onPick={onPick} onClear={onClear} />
      <form
        className="grid gap-1.5 border-t border-border pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <span className="text-xs font-medium text-muted">{label}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            aria-label={`${label} picker`}
            value={parseHexColour(hex) ?? '#000000'}
            onChange={(e) => {
              setHex(e.target.value);
              setError(false);
              onLive(e.target.value);
            }}
            className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-0.5"
          />
          <Input
            aria-label={`${label} (hex)`}
            aria-invalid={error || undefined}
            aria-describedby={error ? errorId : undefined}
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            spellCheck={false}
            className="h-8 min-w-0 px-2 font-mono text-xs"
          />
          <Button size="sm" type="submit">
            Apply
          </Button>
        </div>
        {error && (
          <span id={errorId} role="alert" className="text-xs text-danger">
            Use a hex colour such as #1d4ed8.
          </span>
        )}
      </form>
    </div>
  );
}
