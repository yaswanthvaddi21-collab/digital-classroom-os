/**
 * Copying slide objects: within a slide, to another slide and to another presentation.
 *
 * Two carriers, so copy and paste work everywhere the app runs:
 * - The system clipboard, through the copy/cut/paste events, under ELEMENTS_MIME (with the objects' text as plain
 *   text for other apps). Browsers keep such web formats for pastes into pages, so this also works between tabs.
 * - An in-app clipboard (this module), used by the toolbar's Paste button (pages cannot read the system clipboard
 *   without a permission prompt) and when the browser sends no copy or paste event.
 *
 * Pasted objects are checked like stored content: anything this build cannot represent exactly is refused, so a
 * paste can never make a presentation open read-only later.
 */
import { presentationNovelty } from '../compat';
import { elementProblem } from '../safety';
import { plainTextOf, type SlideElement } from '../types';

export const ELEMENTS_MIME = 'application/x-dcos-slide-elements';
const FORMAT = 'dcos-slide-elements';

interface ClipboardPayload {
  format: typeof FORMAT;
  version: 1;
  elements: SlideElement[];
  /** Which tab copied (random per page load) and its copy number there, so a stale copy of this tab loses to a newer one. */
  tab?: string;
  seq?: number;
}

/** This page load's id, and the number of its last copy. */
const TAB = Math.random().toString(36).slice(2, 10);
let copies = 0;
let memory: { elements: SlideElement[]; text: string; seq: number } | null = null;
const listeners = new Set<() => void>();

/** Whether the in-app clipboard holds objects (the toolbar's Paste button). */
export const hasClipboardElements = () => !!memory?.elements.length;

/** Follows changes to the in-app clipboard (so every open editor can enable its Paste button). */
export function onClipboardChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The text other apps get for copied objects: the text of the text boxes, shapes and tables. */
export function clipboardText(elements: SlideElement[]): string {
  return elements
    .map((e) => (e.type === 'text' ? plainTextOf(e.text) : e.type === 'shape' ? plainTextOf(e.text) : e.type === 'table' ? e.rows.map((r) => r.cells.map((c) => plainTextOf(c.text)).join('\t')).join('\n') : ''))
    .filter((t) => t.trim())
    .join('\n');
}

/** Copies objects into the in-app clipboard (deep copies: later edits do not change what was copied). */
export function rememberElements(elements: SlideElement[]): void {
  memory = { elements: structuredClone(elements), text: clipboardText(elements), seq: ++copies };
  listeners.forEach((fn) => fn());
}

/** Copies of the objects in the in-app clipboard. */
export const rememberedElements = (): SlideElement[] => (memory ? structuredClone(memory.elements) : []);

export function serializeElements(elements: SlideElement[], stamp?: { tab: string; seq: number }): string {
  const payload: ClipboardPayload = { format: FORMAT, version: 1, elements, ...stamp };
  return JSON.stringify(payload);
}

function parsePayload(data: string): { elements: SlideElement[]; tab?: string; seq?: number } | null {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<ClipboardPayload>;
  if (p.format !== FORMAT || p.version !== 1 || !Array.isArray(p.elements) || !p.elements.length) return null;
  for (const el of p.elements) {
    if (elementProblem(el)) return null;
    if (presentationNovelty({ slides: [{ elements: [el] }] })) return null;
  }
  return { elements: p.elements as SlideElement[], tab: typeof p.tab === 'string' ? p.tab : undefined, seq: typeof p.seq === 'number' ? p.seq : undefined };
}

/** Objects read from ELEMENTS_MIME data, or null when the data is not readable or holds anything unknown. */
export function parseElements(data: string): SlideElement[] | null {
  return parsePayload(data)?.elements ?? null;
}

/** Fills a copy or cut event's clipboard with the in-app clipboard's objects. */
function fillEvent(e: ClipboardEvent): boolean {
  if (!e.clipboardData || !memory) return false;
  e.preventDefault();
  e.clipboardData.setData(ELEMENTS_MIME, serializeElements(memory.elements, { tab: TAB, seq: memory.seq }));
  e.clipboardData.setData('text/plain', memory.text);
  return true;
}

/** Writes objects to a copy or cut event's clipboard (and to the in-app clipboard). */
export function writeElementsToEvent(e: ClipboardEvent, elements: SlideElement[]): void {
  rememberElements(elements);
  fillEvent(e);
}

/**
 * Copies objects from a button or menu item (no copy event of its own): into the in-app clipboard and, through a copy
 * command run now (inside the click), into the system clipboard too. So Ctrl/⌘+V, which pastes the system
 * clipboard, pastes these objects and not whatever was copied before. Returns whether the system clipboard got them.
 */
export function copyElements(elements: SlideElement[]): boolean {
  rememberElements(elements);
  if (typeof document === 'undefined' || !memory) return false;
  const text = memory.text;
  let wrote = false;
  const onCopy = (e: ClipboardEvent) => {
    // This copy is ours: nothing else on the page (the canvas's own copy handler) handles it again.
    e.stopImmediatePropagation();
    wrote = fillEvent(e);
  };
  document.addEventListener('copy', onCopy, true);
  // Some engines (Safari) fire the copy event only when something is selected: select a hidden copy of the text.
  const sel = typeof document.getSelection === 'function' ? document.getSelection() : null;
  const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  let helper: HTMLElement | null = null;
  try {
    if (sel && sel.isCollapsed) {
      helper = document.createElement('span');
      helper.setAttribute('aria-hidden', 'true');
      helper.textContent = text || ' ';
      helper.style.cssText = 'position:fixed;left:-10000px;top:0;white-space:pre;user-select:text;-webkit-user-select:text;';
      document.body.appendChild(helper);
      const range = document.createRange();
      range.selectNodeContents(helper);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (typeof document.execCommand === 'function') document.execCommand('copy');
  } catch {
    // No copy command here: the plain-text fallback below.
  } finally {
    document.removeEventListener('copy', onCopy, true);
    if (helper) {
      helper.remove();
      sel?.removeAllRanges();
      if (saved) sel?.addRange(saved);
    }
  }
  // Without a copy event, put the objects' text on the system clipboard: a paste event carrying exactly that text is
  // recognised as these objects (readPasteEvent), so Ctrl/⌘+V still pastes them and not an older copy.
  if (!wrote) void navigator.clipboard?.writeText?.(text).catch(() => undefined);
  return wrote;
}

/**
 * What a paste event holds for the canvas: objects (from this app), or plain text from anywhere else, or nothing.
 * When the event carries only the plain text this app wrote with its last copy (a browser that drops web formats),
 * the in-app clipboard supplies the objects.
 */
export function readPasteEvent(e: ClipboardEvent): { kind: 'elements'; elements: SlideElement[] } | { kind: 'text'; text: string } | null {
  const data = e.clipboardData;
  if (!data) return null;
  const raw = data.getData(ELEMENTS_MIME);
  if (raw) {
    const got = parsePayload(raw);
    if (!got) return null;
    // An older copy of this same tab: a later copy reached only the in-app clipboard, so that one is newer.
    if (memory && got.tab === TAB && got.seq !== undefined && got.seq < memory.seq) return { kind: 'elements', elements: rememberedElements() };
    return { kind: 'elements', elements: got.elements };
  }
  const text = data.getData('text/plain');
  // Objects without text (a picture) copy as empty text: match that only when the event holds nothing else (a file).
  const onlyText = Array.from(data.types ?? []).every((t) => t === 'text/plain');
  if (memory && memory.elements.length && text === memory.text && (text !== '' || onlyText)) return { kind: 'elements', elements: rememberedElements() };
  return text.trim() ? { kind: 'text', text } : null;
}

/** For tests: empties the in-app clipboard. */
export function clearClipboardForTests() {
  memory = null;
  listeners.forEach((fn) => fn());
}
