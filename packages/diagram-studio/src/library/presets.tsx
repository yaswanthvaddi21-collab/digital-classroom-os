import { Select } from '@dcos/ui';
import type { EdgeSectionProps, InspectorSection } from '../Inspector';
import type { ConnectorData, EdgeLineType, MarkerKind } from '../types';

/**
 * Connector styles of the notations in the shape library: BPMN sequence and message flows, UML messages,
 * transitions and dependencies. Each sets only existing connector fields (line type, dash, ends), so a diagram that
 * uses them stays schema 2 and opens in older builds.
 */
export interface ConnectorPreset {
  id: string;
  name: string;
  type?: EdgeLineType;
  data: Pick<ConnectorData, 'dashed'> & { startMarker: MarkerKind; endMarker: MarkerKind };
}

export const CONNECTOR_PRESETS: ConnectorPreset[] = [
  { id: 'bpmn-sequence', name: 'BPMN sequence flow', data: { dashed: false, startMarker: 'none', endMarker: 'arrow' } },
  { id: 'bpmn-message', name: 'BPMN message flow', data: { dashed: true, startMarker: 'circle', endMarker: 'triangle' } },
  { id: 'association', name: 'Association (dotted, no arrow)', data: { dashed: true, startMarker: 'none', endMarker: 'none' } },
  { id: 'uml-sync', name: 'UML synchronous message', type: 'straight', data: { dashed: false, startMarker: 'none', endMarker: 'arrow' } },
  { id: 'uml-async', name: 'UML asynchronous message', type: 'straight', data: { dashed: false, startMarker: 'none', endMarker: 'open-arrow' } },
  { id: 'uml-return', name: 'UML return message', type: 'straight', data: { dashed: true, startMarker: 'none', endMarker: 'open-arrow' } },
  { id: 'uml-transition', name: 'UML transition / control flow', data: { dashed: false, startMarker: 'none', endMarker: 'open-arrow' } },
  { id: 'uml-dependency', name: 'UML include / dependency', data: { dashed: true, startMarker: 'none', endMarker: 'open-arrow' } },
];

/**
 * The preset a connector matches: its dash and both ends, and its line type when the preset sets one. Presets that
 * set the line type are tried first, so a straight UML message is not taken for a BPMN flow with the same ends.
 */
export function matchingPreset(type: string | undefined, d: ConnectorData, markers: { start: MarkerKind; end: MarkerKind }): ConnectorPreset | undefined {
  const line = type ?? 'smoothstep';
  const ends = (p: ConnectorPreset) => p.data.dashed === d.dashed && p.data.startMarker === markers.start && p.data.endMarker === markers.end;
  return CONNECTOR_PRESETS.find((p) => p.type === line && ends(p)) ?? CONNECTOR_PRESETS.find((p) => !p.type && ends(p));
}

/** Format panel section: pick a notation's connector style for the selected connectors. */
export const CONNECTOR_PRESET_SECTION: InspectorSection<EdgeSectionProps> = {
  id: 'notation-style',
  render: ({ e, d, markers, set }) => {
    const current = matchingPreset(e.type, d, markers);
    return (
      <div className="grid gap-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Notation</div>
        <Select
          aria-label="Connector notation"
          value=""
          onChange={(ev) => {
            const p = CONNECTOR_PRESETS.find((x) => x.id === ev.target.value);
            if (p) set({ ...(p.type ? { type: p.type } : {}), data: { ...p.data } });
          }}
        >
          <option value="">{current ? current.name : 'Custom'}</option>
          {CONNECTOR_PRESETS.filter((p) => p !== current).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
    );
  },
};
