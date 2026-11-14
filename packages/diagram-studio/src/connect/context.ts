import { createContext, useContext } from 'react';
import type { Connector } from '../types';

/** What connectors on the canvas need from the editor to change themselves (G-CONNECT). */
export interface ConnectActions {
  readOnly: boolean;
  /** Bend points snap to this grid (null: snapping is off). */
  grid: number | null;
  /** Records an undo step (the state before a drag or edit). */
  snapshot: () => void;
  /** Changes one connector. `record` takes an undo step first; drags record once at their start. */
  update: (id: string, change: (e: Connector) => Connector, record: boolean) => void;
  toast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

const inert: ConnectActions = { readOnly: true, grid: null, snapshot: () => {}, update: () => {}, toast: () => {} };

export const ConnectActionsContext = createContext<ConnectActions>(inert);
export const useConnectActions = () => useContext(ConnectActionsContext);
