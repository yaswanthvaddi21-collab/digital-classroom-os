import { Button, IconButton, Input, Select } from '@dcos/ui';
import { ExternalLink, Lock, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { InspectorSection, NodeSectionProps } from '../Inspector';
import { isSafeLink, MAX_PROPERTIES } from '../model';
import { useEditorController } from './canvasContext';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      {children}
    </div>
  );
}

const stop = (e: React.KeyboardEvent) => e.stopPropagation();

/** Lock, and the layer when the diagram has more than one. */
function ArrangeSection({ nodes }: NodeSectionProps) {
  const ctx = useEditorController();
  if (!ctx || ctx.readOnly) return null;
  const ops = ctx.layerOps;
  const layerIds = new Set(nodes.map(ops.of));
  const lockedCount = nodes.filter((n) => n.locked).length;
  return (
    <Row label="Arrange">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Lock size={14} />} onClick={() => ctx.lock(true)}>
          Lock
        </Button>
        {lockedCount > 0 && (
          <Button size="sm" variant="ghost" onClick={() => ctx.lock(false)}>
            Unlock {lockedCount}
          </Button>
        )}
      </div>
      {ops.list.length > 1 && (
        <Select aria-label="Layer" value={layerIds.size === 1 ? [...layerIds][0] : ''} onChange={(e) => e.target.value && ops.moveSelection(e.target.value)}>
          {layerIds.size > 1 && <option value="">Several layers</option>}
          {[...ops.list].reverse().map((l) => (
            <option key={l.id} value={l.id}>
              Layer: {l.name || 'Untitled layer'}
            </option>
          ))}
        </Select>
      )}
    </Row>
  );
}

/** Opens only http(s) and mail links, in a new tab without access to this app. */
const openable = (link: string) => /^(https?:|mailto:)/i.test(link.trim());

function LinkSection({ nodes, d, onPatch, onTextFocus }: NodeSectionProps) {
  const [draft, setDraft] = useState(d.link ?? '');
  const focused = useRef(false);
  /** The stored link when typing began: an entry that turns unsafe puts it back (no unsafe prefix stays saved). */
  const before = useRef<string | undefined>(d.link);
  // Undo, redo or another shape: the field shows the stored link again (not while the user is typing in it).
  useEffect(() => {
    if (!focused.current) setDraft(d.link ?? '');
  }, [d.link]);
  const valid = draft.trim() === '' || isSafeLink(draft);
  if (nodes.length !== 1) return null;
  return (
    <Row label="Link">
      <Input
        type="url"
        aria-label="Link"
        aria-invalid={!valid}
        placeholder="https://…"
        value={draft}
        onFocus={() => {
          focused.current = true;
          before.current = d.link;
          onTextFocus(true);
        }}
        onBlur={() => {
          focused.current = false;
          onTextFocus(false);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          if (v.trim() === '') onPatch({ link: undefined }, { snapshot: false });
          else if (isSafeLink(v)) onPatch({ link: v.trim() }, { snapshot: false });
          else if (d.link !== before.current) onPatch({ link: before.current }, { snapshot: false });
        }}
        onKeyDown={stop}
        className="h-8"
      />
      {!valid && (
        <p role="alert" className="text-[12px] text-danger">
          Only web (http, https) and mail links can be kept.
        </p>
      )}
      {valid && d.link && openable(d.link) && (
        <a href={d.link.trim()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
          <ExternalLink size={12} /> Open link
        </a>
      )}
    </Row>
  );
}

function TooltipSection({ nodes, d, onPatch, onTextFocus }: NodeSectionProps) {
  if (nodes.length !== 1) return null;
  return (
    <Row label="Tooltip">
      <Input
        aria-label="Tooltip"
        placeholder="Shown when pointing at the shape"
        value={d.tooltip ?? ''}
        onFocus={() => onTextFocus(true)}
        onBlur={() => onTextFocus(false)}
        onChange={(e) => onPatch({ tooltip: e.target.value || undefined }, { snapshot: false })}
        onKeyDown={stop}
        className="h-8"
      />
    </Row>
  );
}

/** Custom properties (diagrams.net "Edit Data"): name and value pairs. */
function PropertiesSection({ nodes, d, set, onPatch, onTextFocus }: NodeSectionProps) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  if (nodes.length !== 1) return null;
  const props = d.properties ?? {};
  const entries = Object.entries(props);
  const name = key.trim();
  const problem = !name ? null : Object.hasOwn(props, name) ? 'A property with this name exists.' : entries.length >= MAX_PROPERTIES ? `A shape keeps at most ${MAX_PROPERTIES} properties.` : null;
  const add = () => {
    if (!name || problem) return;
    set({ properties: { ...props, [name]: value } });
    setKey('');
    setValue('');
  };
  return (
    <Row label="Properties">
      {entries.length > 0 && (
        <ul className="grid gap-1" aria-label="Properties">
          {entries.map(([k, v]) => (
            <li key={k} className="flex items-center gap-1">
              <span className="w-20 shrink-0 truncate text-[12px] text-muted" title={k}>
                {k}
              </span>
              <Input
                aria-label={`Value of ${k}`}
                value={v}
                onFocus={() => onTextFocus(true)}
                onBlur={() => onTextFocus(false)}
                onChange={(e) => onPatch({ properties: { ...props, [k]: e.target.value } }, { snapshot: false })}
                onKeyDown={stop}
                className="h-7 min-w-0 flex-1"
              />
              <IconButton
                label={`Remove property ${k}`}
                onClick={() => {
                  const { [k]: _gone, ...rest } = props;
                  set({ properties: Object.keys(rest).length ? rest : undefined });
                }}
              >
                <X size={13} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {/* A grid, not widths on the inputs: the shared Input is w-full, which a w-20 cannot override (cn does not merge). */}
      <div className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-1">
        <Input aria-label="New property name" placeholder="Name" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => (stop(e), e.key === 'Enter' && add())} className="h-7 min-w-0 px-2" />
        <Input aria-label="New property value" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => (stop(e), e.key === 'Enter' && add())} className="h-7 min-w-0 px-2" />
        <IconButton label="Add property" disabled={!name || !!problem} onClick={add}>
          <Plus size={14} />
        </IconButton>
      </div>
      {problem && <p className="text-[12px] text-danger">{problem}</p>}
    </Row>
  );
}

/**
 * G-CANVAS sections of the Format panel, added at the `@phase5:inspector` marker. Link, tooltip and properties are
 * per shape (one selected); each section is keyed by the shape so a draft never carries over to another shape.
 */
export const CANVAS_NODE_SECTIONS: InspectorSection<NodeSectionProps>[] = [
  { id: 'arrange', render: (p) => <ArrangeSection {...p} /> },
  { id: 'link', render: (p) => <LinkSection key={p.nodes[0].id} {...p} /> },
  { id: 'tooltip', render: (p) => <TooltipSection {...p} /> },
  { id: 'properties', render: (p) => <PropertiesSection key={p.nodes[0].id} {...p} /> },
];
