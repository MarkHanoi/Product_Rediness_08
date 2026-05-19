// UndoStack — bounded ring-style history of EventRecords.
//
// Constraints from ADR-002:
//   • bounded size (default 100 — F lock; tunable per-project later)
//   • clear-on-load (loading a different project resets the stack)
//   • undo returns the inverse-patch event; redo returns the forward-patch event
//   • redo stack is wiped on a fresh `push` (typical undo semantics)

import type { EventRecord } from './types.js';

export interface UndoStackOptions {
  /** Maximum number of historical records.  Older entries are dropped. */
  maxSize?: number;
}

export class UndoStack {
  private readonly maxSize: number;
  private undoBuf: EventRecord[] = [];
  private redoBuf: EventRecord[] = [];

  constructor(opts: UndoStackOptions = {}) {
    this.maxSize = Math.max(1, Math.floor(opts.maxSize ?? 100));
  }

  push(record: EventRecord): void {
    this.undoBuf.push(record);
    if (this.undoBuf.length > this.maxSize) {
      this.undoBuf.shift();
    }
    // A new mutation invalidates redo history.
    this.redoBuf = [];
  }

  /** Pop the most recent forward event; caller applies its `inverse` patches. */
  undo(): EventRecord | null {
    const popped = this.undoBuf.pop();
    if (!popped) return null;
    this.redoBuf.push(popped);
    return popped;
  }

  /** Pop the most recent undone event; caller applies its `forward` patches. */
  redo(): EventRecord | null {
    const popped = this.redoBuf.pop();
    if (!popped) return null;
    this.undoBuf.push(popped);
    return popped;
  }

  clear(): void {
    this.undoBuf = [];
    this.redoBuf = [];
  }

  get size(): number {
    return this.undoBuf.length;
  }

  get redoSize(): number {
    return this.redoBuf.length;
  }

  /** Snapshot — for introspection and tests. */
  snapshot(): { undo: readonly EventRecord[]; redo: readonly EventRecord[] } {
    return { undo: [...this.undoBuf], redo: [...this.redoBuf] };
  }
}
