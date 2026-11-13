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

/**
 * Turns the keystrokes of one text-field edit into a single undo step. `begin` remembers the state when the field
 * gains focus; the first change records it. Any other undo step or a selection change invalidates it, so a stale
 * state can never be recorded and undo cannot revert unrelated edits.
 */
export class TextEditSession<T extends object> {
  private session: { base: T | null; recorded: boolean } | null = null;

  begin(state: T) {
    this.session = { base: state, recorded: false };
  }

  end() {
    this.session = null;
  }

  /** The next change in the field starts a new undo step, recorded from the state at that moment. */
  invalidate() {
    if (this.session) this.session = { base: null, recorded: false };
  }

  /**
   * The state to push as the undo step for a change, or null when the change belongs to the step already recorded
   * for this edit. `discrete` changes (a colour, a toggle) are always their own step.
   */
  stepFor(current: T, discrete: boolean): T | null {
    const s = this.session;
    if (discrete || !s) {
      this.invalidate();
      return current;
    }
    if (s.recorded) return null;
    const base = s.base;
    this.session = { base: null, recorded: true };
    // Backstop: the remembered state is used only if nothing has changed since it was taken.
    const fresh = base && (Object.keys(base) as Array<keyof T>).every((k) => base[k] === current[k]) && Object.keys(current).length === Object.keys(base).length;
    return fresh ? base : current;
  }
}
