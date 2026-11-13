import { documentSchema } from '../../schema';
import type { OdtCtx } from './context';
import { ODT_NOTES } from './notes';
import { ODT_HANDLED_ATTRS } from './paragraph';

/**
 * Reports attributes the ODT export does not write: any attribute of a node or mark that holds a value other than
 * its default and is not listed in ODT_HANDLED_ATTRS. So a setting added by a later feature is never dropped
 * silently, even before the ODT export learns it.
 */
export function checkAttrs(type: string, attrs: Record<string, unknown> | undefined, ctx: OdtCtx, kind: 'node' | 'mark' = 'node') {
  if (!attrs) return;
  const schema = documentSchema();
  const spec = kind === 'node' ? schema.nodes[type]?.spec : schema.marks[type]?.spec;
  if (!spec) return;
  const handled = ODT_HANDLED_ATTRS[type] ?? [];
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || handled.includes(name)) continue;
    const def = (spec.attrs?.[name] as { default?: unknown } | undefined)?.default;
    if (JSON.stringify(value) === JSON.stringify(def)) continue;
    ODT_NOTES.unsupportedAttr(ctx.report, type, name);
  }
}
