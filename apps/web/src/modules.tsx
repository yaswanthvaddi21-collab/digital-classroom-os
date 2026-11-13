import { diagramTemplates } from '@dcos/diagram-studio/templates';
import { documentTemplates } from '@dcos/document-studio/templates';
import type { ItemKind } from '@dcos/local-storage';
import { FileText, GitFork, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';

export interface EditorProps {
  initialContent: unknown;
  title: string;
  onChange: (content: unknown) => void;
}

export interface TemplateOption {
  id: string;
  name: string;
  description: string;
  build: () => unknown;
}

/** Everything the app shell needs to know about one kind of item. Adding a module means adding an entry here. */
export interface ModuleDef {
  kind: ItemKind;
  /** Route segment; `#/<route>` lists items and `#/<route>/:id` opens one. Frozen for existing modules. */
  route: string;
  label: string;
  plural: string;
  icon: LucideIcon;
  templates: TemplateOption[];
  /**
   * Loads the editor on demand so its code downloads only when first opened. A plain dynamic import rather than
   * React.lazy: editors own live engine instances (Tiptap, React Flow) that must not be mounted inside a Suspense
   * boundary, where React 19 may render them hidden and later reconnect their effects.
   */
  loadEditor: () => Promise<ComponentType<EditorProps>>;
}

export const MODULES: Record<ItemKind, ModuleDef> = {
  document: {
    kind: 'document',
    route: 'documents',
    label: 'Document',
    plural: 'Documents',
    icon: FileText,
    templates: documentTemplates,
    loadEditor: () => import('@dcos/document-studio').then((m) => m.DocumentEditor as ComponentType<EditorProps>),
  },
  diagram: {
    kind: 'diagram',
    route: 'diagrams',
    label: 'Diagram',
    plural: 'Diagrams',
    icon: GitFork,
    templates: diagramTemplates,
    loadEditor: () => import('@dcos/diagram-studio').then((m) => m.DiagramEditor as ComponentType<EditorProps>),
  },
};

const loaded = new Map<ItemKind, ComponentType<EditorProps>>();

/** The module's editor component, or null while its code is loading. Throws load failures to the error boundary. */
export function useModuleEditor(module: ModuleDef): ComponentType<EditorProps> | null {
  const [state, setState] = useState<{ Editor: ComponentType<EditorProps> | null; error: unknown }>(() => ({ Editor: loaded.get(module.kind) ?? null, error: null }));
  useEffect(() => {
    if (state.Editor) return;
    let cancelled = false;
    module.loadEditor().then(
      (Editor) => {
        loaded.set(module.kind, Editor);
        if (!cancelled) setState({ Editor, error: null });
      },
      (error) => !cancelled && setState({ Editor: null, error }),
    );
    return () => {
      cancelled = true;
    };
  }, [module, state.Editor]);
  if (state.error) throw state.error;
  return state.Editor;
}

export const MODULE_LIST = Object.values(MODULES);
export const itemHref = (kind: ItemKind, id: string) => `/${MODULES[kind].route}/${id}`;
