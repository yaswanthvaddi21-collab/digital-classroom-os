import { createContext, useContext } from 'react';
import type { EditorController } from './controller';

/**
 * The editor controller for components that are rendered through a registry without it (the inspector sections of
 * G-CANVAS: lock, layer, link, tooltip, properties). Provided by the editor around the Format panel and overlays.
 */
export const CanvasContext = createContext<EditorController | null>(null);
export const useEditorController = () => useContext(CanvasContext);
