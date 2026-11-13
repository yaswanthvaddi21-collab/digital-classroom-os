import { DocumentEditor, type DocumentContent } from '@dcos/document-studio';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EditorFrame, MissingItem } from '../components/EditorFrame';
import { useEditableItem } from '../lib/storage';

export function DocumentPage() {
  const { id = '' } = useParams();
  // Bumping the key remounts the editor after a version restore or conflict reload.
  const [generation, setGeneration] = useState(0);
  return <DocumentPageInner key={`${id}:${generation}`} id={id} reload={() => setGeneration((g) => g + 1)} />;
}

function DocumentPageInner({ id, reload }: { id: string; reload: () => void }) {
  const { item, status, conflict, lastError, updateContent, rename, saveNow, resolveConflict } = useEditableItem<DocumentContent>('document', id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow]);

  if (status === 'missing') return <MissingItem kind="document" />;
  if (!item) return null;

  return (
    <EditorFrame
      kind="document"
      id={id}
      title={item.title}
      status={status}
      lastError={lastError}
      onRename={rename}
      onRestored={reload}
      hasConflict={!!conflict}
      onResolveConflict={resolveConflict}
    >
      <DocumentEditor initialContent={item.content} title={item.title} onChange={updateContent} />
    </EditorFrame>
  );
}
