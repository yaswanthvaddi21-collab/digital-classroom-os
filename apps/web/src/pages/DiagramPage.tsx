import { DiagramEditor, type DiagramContent } from '@dcos/diagram-studio';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EditorFrame, MissingItem } from '../components/EditorFrame';
import { useEditableItem } from '../lib/storage';

export function DiagramPage() {
  const { id = '' } = useParams();
  const [generation, setGeneration] = useState(0);
  return <DiagramPageInner key={`${id}:${generation}`} id={id} reload={() => setGeneration((g) => g + 1)} />;
}

function DiagramPageInner({ id, reload }: { id: string; reload: () => void }) {
  const { item, status, conflict, lastError, updateContent, rename, saveNow, resolveConflict } = useEditableItem<DiagramContent>('diagram', id);

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

  if (status === 'missing') return <MissingItem kind="diagram" />;
  if (!item) return null;

  return (
    <EditorFrame
      kind="diagram"
      id={id}
      title={item.title}
      status={status}
      lastError={lastError}
      onRename={rename}
      onRestored={reload}
      hasConflict={!!conflict}
      onResolveConflict={resolveConflict}
    >
      <DiagramEditor initialContent={item.content} title={item.title} onChange={updateContent} />
    </EditorFrame>
  );
}
