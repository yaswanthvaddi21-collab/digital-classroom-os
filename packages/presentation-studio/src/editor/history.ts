/**
 * Snapshot-based undo/redo, the same rule as Diagram Studio's UndoStack (diagram-studio/src/history.ts; the package
 * boundary keeps presentation-studio from importing it). Callers push the state *before* a change; undo swaps the
 * current state for the last snapshot and keeps the current one for redo. Snapshots share structure (the model is
 * immutable), so they are cheap.
 */
export class UndoStack<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private readonly limit = 200) {}

  push(state: T) {
    this.past.push(state);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: T): T | undefined {
    const prev = this.past.pop();
    if (prev === undefined) return undefined;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | undefined {
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(current);
    return next;
  }

  /** Forgets the last snapshot when it is `state` (a step that turned out to change nothing). */
  dropLast(state: T): boolean {
    if (!this.past.length || this.past[this.past.length - 1] !== state) return false;
    this.past.pop();
    return true;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }
}
