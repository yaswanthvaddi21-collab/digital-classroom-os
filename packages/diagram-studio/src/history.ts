/**
 * Snapshot-based undo/redo. Callers push the state *before* a change; undo swaps the current state
 * for the last snapshot and keeps the current one for redo.
 */
export class UndoStack<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private readonly limit = 100) {}

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

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }
}
