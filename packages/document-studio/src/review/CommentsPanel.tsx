import { Button, cn, IconButton } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Check, ChevronDown, ChevronUp, MessageSquare, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { commentAnchors, orderThreads, UNKNOWN_AUTHOR, type CommentReply, type CommentThread } from './comments';
import type { ReviewControls } from './useReview';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** A text box that posts on Ctrl/⌘+Enter and cancels on Esc. */
function Composer({ label, initial = '', submitLabel, onSubmit, onCancel, autoFocus = true }: { label: string; initial?: string; submitLabel: string; onSubmit: (text: string) => void; onCancel: () => void; autoFocus?: boolean }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const submit = () => text.trim() && onSubmit(text);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        ref={ref}
        aria-label={label}
        value={text}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        placeholder="Write a comment (Ctrl+Enter to post)"
      />
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!text.trim()} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function Entry({ entry, controls, thread, isReply }: { entry: CommentReply; controls: ReviewControls; thread: CommentThread; isReply: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const who = entry.author || UNKNOWN_AUTHOR;
  return (
    <div className={cn('flex flex-col gap-1', isReply && 'border-l-2 border-border pl-2.5')}>
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[13px] font-semibold">{who}</span>
        <span className="shrink-0 text-[11px] text-muted">
          {when(entry.createdAt)}
          {entry.editedAt ? ' · edited' : ''}
        </span>
      </div>
      {editing ? (
        <Composer
          label={isReply ? 'Edit reply' : 'Edit comment'}
          initial={entry.text}
          submitLabel="Save"
          onSubmit={(text) => {
            controls.editEntry(thread.id, entry.id, text);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{entry.text}</p>
      )}
      {!controls.readOnly && !editing && (
        <div className="flex flex-wrap gap-1">
          {confirming ? (
            <>
              <span className="self-center text-xs text-muted">{isReply ? 'Delete this reply?' : 'Delete this comment and its replies?'}</span>
              <Button size="sm" variant="danger" onClick={() => (isReply ? controls.deleteReply(thread.id, entry.id) : controls.deleteThread(thread.id))}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)} aria-label={`Edit ${isReply ? 'reply' : 'comment'} by ${who}`}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirming(true)} aria-label={`Delete ${isReply ? 'reply' : 'comment'} by ${who}`}>
                Delete
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadCard({ thread, quote, controls }: { thread: CommentThread; quote: string | null; controls: ReviewControls }) {
  const [replying, setReplying] = useState(false);
  const active = controls.active === thread.id;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);
  const short = quote && quote.length > 90 ? `${quote.slice(0, 89)}…` : quote;
  return (
    <article
      ref={ref}
      aria-label={`Comment by ${thread.author || UNKNOWN_AUTHOR}`}
      aria-current={active ? 'true' : undefined}
      data-comment-thread={thread.id}
      className={cn('flex flex-col gap-2 rounded-xl border bg-surface p-3 shadow-xs', active ? 'border-accent ring-2 ring-accent/30' : 'border-border', thread.resolved && 'opacity-80')}
    >
      <button
        type="button"
        onClick={() => controls.focusThread(thread.id)}
        className="truncate rounded-md border-l-4 border-warning/60 bg-warning/10 px-2 py-1 text-left text-xs text-fg hover:bg-warning/20 focus-visible:outline-2 focus-visible:outline-accent"
        title="Go to the commented text"
      >
        {short ? <>On “{short}”</> : <em>On deleted text</em>}
      </button>
      {thread.resolved && <span className="text-xs font-medium text-success">Resolved</span>}
      <Entry entry={thread} thread={thread} controls={controls} isReply={false} />
      {thread.replies.map((r) => (
        <Entry key={r.id} entry={r} thread={thread} controls={controls} isReply />
      ))}
      {!controls.readOnly &&
        (replying ? (
          <Composer
            label="Reply"
            submitLabel="Reply"
            onSubmit={(text) => {
              controls.reply(thread.id, text);
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
          />
        ) : (
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => setReplying(true)} aria-label={`Reply to comment by ${thread.author || UNKNOWN_AUTHOR}`}>
              Reply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={thread.resolved ? <RotateCcw size={13} /> : <Check size={13} />}
              onClick={() => controls.setResolved(thread.id, !thread.resolved)}
              aria-label={`${thread.resolved ? 'Reopen' : 'Resolve'} comment by ${thread.author || UNKNOWN_AUTHOR}`}
            >
              {thread.resolved ? 'Reopen' : 'Resolve'}
            </Button>
          </div>
        ))}
    </article>
  );
}

/**
 * The comments side panel: write, reply, edit, resolve and delete comments, and move between them. Threads are
 * listed in the order their text appears; resolved ones and those whose text was deleted are grouped below.
 */
export function CommentsPanel({ editor, controls }: { editor: Editor; controls: ReviewControls }) {
  const threads = controls.state.comments;
  const [showResolved, setShowResolved] = useState(false);
  // Re-read the document's anchors when the body changes (the panel lists threads in text order).
  const docVersion = useEditorState({ editor, selector: ({ editor: e }) => (e && !e.isDestroyed ? e.state.doc : null), equalityFn: (a, b) => a === b });
  const { anchored, detached, quotes } = useMemo(() => {
    if (!docVersion) return { anchored: [], detached: [], quotes: new Map<string, string>() };
    const json = editor.getJSON();
    const anchors = commentAnchors(json);
    return { ...orderThreads(threads, json), quotes: new Map([...anchors].map(([id, a]) => [id, a.text])) };
  }, [docVersion, threads, editor]);
  const open = anchored.filter((t) => !t.resolved);
  const resolved = anchored.filter((t) => t.resolved);
  const activeResolved = resolved.some((t) => t.id === controls.active);

  return (
    <aside
      aria-label="Comments"
      className="dcos-comments-panel flex w-full shrink-0 flex-col border-l border-border bg-surface-2/60 max-sm:absolute max-sm:inset-0 max-sm:z-20 max-sm:bg-surface sm:w-80"
    >
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <MessageSquare size={15} className="text-muted" />
        <h2 className="flex-1 text-sm font-semibold">
          Comments <span className="font-normal text-muted">({open.length} open)</span>
        </h2>
        <IconButton label="Previous comment" disabled={!open.length} onClick={() => controls.step(-1)}>
          <ChevronUp size={16} />
        </IconButton>
        <IconButton label="Next comment" disabled={!open.length} onClick={() => controls.step(1)}>
          <ChevronDown size={16} />
        </IconButton>
        <IconButton label="Close comments" onClick={() => controls.setPanelOpen(false)}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {!controls.author && !controls.readOnly && (
          <p className="rounded-lg bg-surface px-2.5 py-2 text-xs text-muted">New comments show “{UNKNOWN_AUTHOR}”. Add your name in Settings → General.</p>
        )}
        {controls.notice && (
          <p role="status" className="rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-fg">
            {controls.notice}
          </p>
        )}
        {controls.composing && (
          <div className="rounded-xl border border-accent bg-surface p-3 shadow-xs">
            <Composer
              label="New comment"
              submitLabel="Comment"
              onSubmit={(text) => controls.postComment(text)}
              onCancel={() => controls.cancelComment()}
            />
          </div>
        )}
        {!threads.length && !controls.composing && <p className="text-sm text-muted">No comments yet. Select some text and choose New comment.</p>}
        {open.map((t) => (
          <ThreadCard key={t.id} thread={t} quote={quotes.get(t.id) ?? null} controls={controls} />
        ))}
        {resolved.length > 0 && (
          <div className="flex flex-col gap-3">
            <Button size="sm" variant="ghost" aria-expanded={showResolved || activeResolved} onClick={() => setShowResolved((v) => !v)} className="self-start">
              {showResolved || activeResolved ? 'Hide' : 'Show'} resolved ({resolved.length})
            </Button>
            {(showResolved || activeResolved) && resolved.map((t) => <ThreadCard key={t.id} thread={t} quote={quotes.get(t.id) ?? null} controls={controls} />)}
          </div>
        )}
        {detached.length > 0 && (
          <section aria-label="Comments on deleted text" className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">On deleted text ({detached.length})</h3>
            <p className="text-xs text-muted">Their text was deleted. Undo brings it back; they are not exported to Word.</p>
            {detached.map((t) => (
              <ThreadCard key={t.id} thread={t} quote={null} controls={controls} />
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

/** The comment highlights (always) and the side panel (when open). */
export function CommentsLayer({ editor, controls }: { editor: Editor; controls: ReviewControls }) {
  return (
    <>
      {controls.highlightCss && <style>{controls.highlightCss}</style>}
      {controls.panelOpen && <CommentsPanel editor={editor} controls={controls} />}
    </>
  );
}
