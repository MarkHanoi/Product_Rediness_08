// @pryzm/runtime-undo-stack — RingBufferUndoStack (Wave A16 S123, A16-T9).
//
// CONTRACT (C03 §4.2):
//   "The undo ring buffer size MUST be configurable (default: 200 commands).
//    Exceeding the cap MUST silently discard the oldest entry, never throw."
//
// This is the Phase D real backend referenced in UndoStack.ts Phase-C note.
// Stores PatchPair records (forward/inverse JSON-Patch operations) and
// implements UndoStackBackend so it can be passed directly to UndoStack.
//
// Immer patch wiring (full Phase D) is out-of-scope here — callers that
// need to apply patches should subscribe and read current() after undo/redo.

import type { UndoStackBackend, UndoStackSubscription } from './UndoStack.js';

// ── Types ──────────────────────────────────────────────────────────────────

/** A single JSON-Patch operation (RFC 6902 subset used by PRYZM Immer drafts). */
export interface JsonPatchOp {
  /**
   * Immer operation type — MUST be preserved when converting from Immer `Patch`
   * so that `patchSideToImmer()` can reconstruct the full `Patch[]` for `applyPatches`.
   * Sprint A33 (C03 §4.1): previously dropped when pushed from `CommandBus`.
   */
  readonly op: 'add' | 'replace' | 'remove';
  /** JSON Pointer path, e.g. `/walls/abc123/height`. */
  readonly path: string;
  /** Serialisable value applied at this path (`undefined` for `remove` ops). */
  readonly value: unknown;
}

/** One side of a patch pair — a set of operations to apply atomically. */
export interface PatchSide {
  readonly ops: readonly JsonPatchOp[];
}

/**
 * A forward/inverse patch pair pushed onto the undo stack after each
 * `source: 'user'` command commit (C03 §4.2).
 *
 * - `forward` — re-applies the command (redo).
 * - `inverse` — reverses it (undo).
 * - `affectedStores` — store keys this command touched (Sprint A34 — C03 §4.1).
 *   Required by `applyRingBufferSide()` in `@pryzm/command-bus` so the Phase D
 *   Ctrl-Z handler knows which stores to call `applyPatch` on without having to
 *   infer the store from the patch path segments.  Optional for backwards
 *   compatibility (test fixtures that pre-date A34 omit it safely).
 */
export interface PatchPair {
  readonly forward: PatchSide;
  readonly inverse: PatchSide;
  /** Sprint A34 (C03 §4.1): store-routing metadata for Phase D undo/redo applicator. */
  readonly affectedStores?: readonly string[];
}

export interface RingBufferUndoStackOptions {
  /**
   * Maximum number of undo entries retained in the buffer.
   * Default: 200 (CONTRACT C03 §4.2).
   * When the cap is exceeded the oldest entry is silently discarded.
   */
  maxSize?: number;
}

const DEFAULT_MAX_SIZE = 200;

// ── RingBufferUndoStack ────────────────────────────────────────────────────

/**
 * RingBufferUndoStack — capped undo/redo backend for `UndoStack`.
 *
 * Implements `UndoStackBackend` so it plugs directly into `UndoStack`:
 *
 * ```ts
 * import { RingBufferUndoStack, UndoStack } from '@pryzm/runtime-undo-stack';
 *
 * const backend  = new RingBufferUndoStack({ maxSize: 200 });
 * const undoStack = new UndoStack(backend);
 *
 * // After each user command commit:
 * backend.push({ forward: { ops: [...] }, inverse: { ops: [...] } });
 *
 * // Cmd+Z:
 * undoStack.undo(); // cursor steps back; current() exposes the inverse patch
 * ```
 *
 * CONTRACT (C03 §4.2): overflow silently discards the oldest entry — never throws.
 */
export class RingBufferUndoStack implements UndoStackBackend {
  private readonly _maxSize: number;
  private _entries: PatchPair[] = [];
  /** Points at the entry that would be undone next (-1 = nothing to undo). */
  private _cursor = -1;
  private readonly _listeners = new Set<() => void>();

  constructor(options: RingBufferUndoStackOptions = {}) {
    this._maxSize = Math.max(1, options.maxSize ?? DEFAULT_MAX_SIZE);
  }

  // ── Mutation API ─────────────────────────────────────────────────────────

  /**
   * Push a new `PatchPair` onto the stack.
   *
   * Steps:
   * 1. Truncate any redo tail above the cursor.
   * 2. If the buffer is at capacity, silently drop the oldest entry (ring).
   * 3. Append the new entry; advance cursor.
   * 4. Notify all subscribers.
   *
   * CONTRACT: never throws (C03 §4.2).
   */
  push(pair: PatchPair): void {
    // 1. Discard the redo tail.
    this._entries = this._entries.slice(0, this._cursor + 1);

    // 2. Ring-buffer overflow: drop oldest without error.
    if (this._entries.length >= this._maxSize) {
      this._entries.shift();
      // cursor already at last position after shift; will be set to length-1.
    }

    // 3. Append + advance.
    this._entries.push(pair);
    this._cursor = this._entries.length - 1;

    // 4. Notify.
    this._notify();
  }

  /**
   * The PatchPair at the current cursor position — i.e. the entry that will
   * be undone on the next `undo()` call.  Returns `null` if the stack is empty
   * or the cursor is at -1.
   */
  current(): PatchPair | null {
    return this._cursor >= 0 ? (this._entries[this._cursor] ?? null) : null;
  }

  /**
   * The PatchPair one position above the cursor — the entry that will be
   * re-applied on the next `redo()` call.  Returns `null` when at the top.
   */
  peek(): PatchPair | null {
    const idx = this._cursor + 1;
    return idx < this._entries.length ? (this._entries[idx] ?? null) : null;
  }

  /**
   * Remove all entries and reset the cursor.
   * Notifies subscribers.
   */
  clear(): void {
    this._entries = [];
    this._cursor = -1;
    this._notify();
  }

  /** Total number of entries currently in the buffer (undo + redo combined). */
  get size(): number {
    return this._entries.length;
  }

  // ── Atomic patch-and-move API (Sprint A33 — C03 §4.1) ────────────────────
  //
  // These methods atomically capture the patch to apply AND move the cursor
  // in a single call, eliminating the race between cursor reads and writes.
  // Callers pass the returned PatchSide to `patchSideToImmer()` from
  // `@pryzm/command-bus` and then apply via Immer's `applyPatches`.

  /**
   * Capture the **inverse** patch of the current entry and step the cursor
   * back — atomically.  Returns `null` when there is nothing to undo.
   *
   * @example
   * ```ts
   * const side = ringBuffer.undoPatch();
   * if (side) {
   *   const patches = patchSideToImmer(side);          // @pryzm/command-bus
   *   store.setState(applyPatches(store.getState(), patches));
   * }
   * ```
   *
   * CONTRACT (C03 §4.1): MUST NOT throw; MUST notify subscribers after move.
   */
  undoPatch(): PatchSide | null {
    if (!this.canUndo()) return null;
    const side = this._entries[this._cursor]!.inverse;
    this._cursor--;
    this._notify();
    return side;
  }

  /**
   * Capture the **forward** patch of the next entry and step the cursor
   * forward — atomically.  Returns `null` when there is nothing to redo.
   *
   * CONTRACT (C03 §4.1): MUST NOT throw; MUST notify subscribers after move.
   */
  redoPatch(): PatchSide | null {
    if (!this.canRedo()) return null;
    const side = this._entries[this._cursor + 1]!.forward;
    this._cursor++;
    this._notify();
    return side;
  }

  // ── UndoStackBackend ─────────────────────────────────────────────────────

  undo(): void {
    if (!this.canUndo()) return;
    this._cursor--;
    this._notify();
  }

  redo(): void {
    if (!this.canRedo()) return;
    this._cursor++;
    this._notify();
  }

  canUndo(): boolean {
    return this._cursor >= 0;
  }

  canRedo(): boolean {
    return this._cursor < this._entries.length - 1;
  }

  undoCount(): number {
    return Math.max(0, this._cursor + 1);
  }

  redoCount(): number {
    return Math.max(0, this._entries.length - 1 - this._cursor);
  }

  subscribe(listener: () => void): UndoStackSubscription {
    this._listeners.add(listener);
    return {
      dispose: (): void => {
        this._listeners.delete(listener);
      },
    };
  }

  private _notify(): void {
    for (const l of this._listeners) {
      try { l(); }
      catch (err) {
        console.error('[runtime-undo-stack] RingBufferUndoStack subscriber threw:', err);
      }
    }
  }
}
