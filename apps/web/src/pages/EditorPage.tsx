import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDiagramHost } from '../components/DiagramDialogs';
import { EditorFrame, MissingItem } from '../components/EditorFrame';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useEditableItem } from '../lib/storage';
import { useModuleEditor, type EditorProps, type ModuleDef } from '../modules';

/** Opens one item of any module. Routes stay `#/<module.route>/:id` (frozen since v0.1.0). */
export function EditorPage({ module }: { module: ModuleDef }) {
  const { id = '' } = useParams();
  // Bumping the key remounts the editor after a version restore, conflict reload or recovery.
  const [generation, setGeneration] = useState(0);
  return <EditorPageInner key={`${module.kind}:${id}:${generation}`} module={module} id={id} reload={() => setGeneration((g) => g + 1)} />;
}

function EditorPageInner({ module, id, reload }: { module: ModuleDef; id: string; reload: () => void }) {
  const editable = useEditableItem<unknown>(module.kind, id);
  const { host: diagramHost, dialogs } = useDiagramHost();
  const { item, status, saveNow } = editable;

  // Ctrl/⌘+S saves a version; held keys do not repeat it (audit CODE-1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!e.repeat) void saveNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow]);

  if (status === 'missing' || status === 'load-error') return <MissingItem module={module} error={status === 'load-error' ? editable.lastError : null} />;
  if (!item) return null;

  return (
    <EditorFrame
      module={module}
      id={id}
      title={editable.title}
      status={status}
      lastError={editable.lastError}
      trashed={item.deletedAt !== null}
      hasDraft={!!editable.draft}
      onRename={editable.rename}
      onTitleBlur={() => void editable.commitTitle()}
      onBeforeRestore={editable.flush}
      onRestored={reload}
      hasConflict={!!editable.conflict}
      onResolveConflict={editable.resolveConflict}
      onRecoverDraft={editable.recoverDraft}
      onDiscardDraft={editable.discardDraft}
    >
      <ErrorBoundary what={`this ${module.label.toLowerCase()}`}>
        <ModuleEditor
          module={module}
          key={editable.externalRevision}
          initialContent={item.content}
          title={editable.title}
          onChange={editable.updateContent}
          diagramHost={module.kind === 'document' ? diagramHost : undefined}
        />
      </ErrorBoundary>
      {dialogs}
    </EditorFrame>
  );
}

function ModuleEditor({ module, ...props }: { module: ModuleDef } & EditorProps) {
  const Editor = useModuleEditor(module);
  if (!Editor) return <div className="p-6 text-sm text-muted">Opening editor…</div>;
  return <Editor {...props} />;
}
