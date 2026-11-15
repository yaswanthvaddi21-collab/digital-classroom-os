import { diagramTemplates } from '@dcos/diagram-studio/templates';
import { documentTemplates } from '@dcos/document-studio/templates';
import type { DiagramHost } from '@dcos/document-studio';
import type { ItemKind } from '@dcos/local-storage';
import type { PresentationImageHost } from '@dcos/presentation-studio';
import { presentationTemplates } from '@dcos/presentation-studio/templates';
import { FileText, GitFork, Presentation, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';

export interface EditorProps {
  initialContent: unknown;
  title: string;
  onChange: (content: unknown) => void;
  /** Documents and (Phase 7) presentations: enables embedded diagrams. */
  diagramHost?: DiagramHost;
  // @phase4:review — documents only: per-device preferences (Settings → General).
  /** Name new comments are written under. */
  authorName?: string;
  /** Whether spell checking starts on; the editor reports changes through onSpellcheckChange. */
  spellcheck?: boolean;
  onSpellcheckChange?: (on: boolean) => void;
  // @phase5:diagram-files — diagrams only: open a diagram file as a new diagram ("Open file…" in the editor menu).
  onOpenFile?: () => void;
  // Phase 7 CONTENT — presentations only: pictures stored as attachments (diagram previews go through diagramHost).
  imageHost?: PresentationImageHost;
  /** Presentations only (Phase 7 SHOW): the address of the slide show's presenter window for a session. */
  presenterUrl?: (session: string) => string;
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
  // Phase 7 (ADR 0014): route frozen from here on, like the others.
  presentation: {
    kind: 'presentation',
    route: 'presentations',
    label: 'Presentation',
    plural: 'Presentations',
    icon: Presentation,
    templates: presentationTemplates,
    loadEditor: () => import('@dcos/presentation-studio').then((m) => m.PresentationEditor as ComponentType<EditorProps>),
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
