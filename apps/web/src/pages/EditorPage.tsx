import { useToast } from '@dcos/ui';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDiagramHost } from '../components/DiagramDialogs';
import { EditorFrame, MissingItem } from '../components/EditorFrame';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { setPreference, usePreferences } from '../lib/preferences';
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
  const { host: diagramHost, dialogs, active: diagramDialogOpen } = useDiagramHost();
  const { item, status, saveNow, holdExternalUpdates } = editable;
  const toast = useToast();
  // @phase4:review — the comment author name and the remembered spell check setting, for documents.
  const prefs = usePreferences();
  const documentPrefs = { authorName: prefs.authorName, spellcheck: prefs.spellCheck, onSpellcheckChange: (on: boolean) => setPreference('spellCheck', on) };

  // A diagram dialog writes into the editor it was opened from. Remounting that editor for another tab's save would
  // drop the diagram, so while one is open external versions wait and later edits go through the conflict flow.
  useEffect(() => (diagramDialogOpen ? holdExternalUpdates() : undefined), [diagramDialogOpen, holdExternalUpdates]);

  // Ctrl/⌘+S saves a version; held keys do not repeat it (audit CODE-1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!e.repeat) saveNow().catch((err) => toast(`A version could not be saved. ${err instanceof Error ? err.message : String(err)}`, 'error'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, toast]);

  if (status === 'missing' || status === 'load-error') return <MissingItem module={module} error={status === 'load-error' ? editable.lastError : null} />;
  // Opened after another tab upgraded the database: nothing could load, so say why (the app banner offers Reload).
  if (!item && status === 'reload-required') return <MissingItem module={module} error="The app was updated in another tab. Reload this page to open it." />;
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
      draftCount={editable.draftCount}
      problem={editable.problem}
      kept={editable.kept}
      onRetry={editable.retry}
      onSaveAsNew={editable.saveAsNew}
    >
      <ErrorBoundary what={`this ${module.label.toLowerCase()}`}>
        <ModuleEditor
          module={module}
          key={editable.externalRevision}
          initialContent={item.content}
          title={editable.title}
          onChange={editable.updateContent}
          diagramHost={module.kind === 'document' ? diagramHost : undefined}
          {...(module.kind === 'document' ? documentPrefs : {})}
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
