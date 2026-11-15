import { Button, Card, useToast } from '@dcos/ui';
import { ExternalLink, LifeBuoy, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { relativeTime } from '../../lib/format';
import { canSaveDraftAsNew, discardUnsavedDraft, listUnsavedDrafts, saveUnsavedDraftAsNew, useStorageChanges, type UnsavedDraft } from '../../lib/storage';
import { itemHref, MODULES } from '../../modules';

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Every unsaved draft on this device, including drafts of items that were deleted since, so none is ever lost
 * without the user choosing to discard it (Settings → Storage).
 */
export function UnsavedDrafts() {
  const toast = useToast();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<UnsavedDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDrafts(await listUnsavedDrafts());
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useStorageChanges(() => void load());

  const saveAsNew = async (draft: UnsavedDraft) => {
    const noun = MODULES[draft.kind].label.toLowerCase();
    try {
      const item = await saveUnsavedDraftAsNew(draft);
      toast(`Saved as a new ${noun}`, 'success');
      navigate(itemHref(item.kind, item.id));
    } catch (err) {
      toast(`Could not save it as a new ${noun}. ${messageOf(err)}`, 'error');
    }
  };

  const discard = async (draft: UnsavedDraft) => {
    if (!confirm('Discard these unsaved changes? This cannot be undone.')) return;
    try {
      await discardUnsavedDraft(draft);
      toast('Unsaved changes discarded', 'success');
      await load();
    } catch (err) {
      toast(`Could not discard them. ${messageOf(err)}`, 'error');
    }
  };

  return (
    <Card className="p-5" aria-labelledby="unsaved-drafts-title" role="region">
      <h3 id="unsaved-drafts-title" className="text-sm font-semibold">
        Unsaved drafts
      </h3>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Edits that could not be saved when they were made are kept here until you open, save or discard them, also when the document, diagram or presentation they
        belong to was deleted.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          Unsaved drafts could not be read. {error}
        </p>
      ) : !drafts ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : drafts.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No unsaved drafts on this device.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {drafts.map((d) => {
            const module = MODULES[d.kind];
            const Icon = module.icon;
            const noun = module.label.toLowerCase();
            const name = d.item ? d.item.title : 'Deleted item';
            return (
              <li key={d.key} aria-label={`Unsaved draft: ${name}`} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{name}</div>
                  <div className="text-xs text-muted">
                    {module.label}
                    {!d.item && ' · deleted item'}
                    {d.item?.deletedAt && ' · in the trash'}
                    {d.title !== undefined && d.title !== d.item?.title && ` · draft title “${d.title}”`}
                    {d.savedAt && ` · kept ${relativeTime(d.savedAt)}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.item && (
                    <Link
                      to={itemHref(d.kind, d.itemId)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-2"
                    >
                      <ExternalLink size={13} /> Open
                    </Link>
                  )}
                  {canSaveDraftAsNew(d) && (
                    <Button size="sm" icon={<Save size={13} />} onClick={() => void saveAsNew(d)}>
                      Save as a new {noun}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => void discard(d)}>
                    Discard
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {drafts && drafts.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <LifeBuoy size={13} /> Opening a document, diagram or presentation also offers its drafts for recovery there.
        </p>
      )}
    </Card>
  );
}
