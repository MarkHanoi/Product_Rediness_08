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
  /**
   * §UNDO-CROSS-STACK-ORDER (C03 §4.7 follow-up 2, L: hosted-opening undo
   * skipped): epoch-ms the command committed (`Date.now()`, stamped by
   * `CommandBus.executeCommand` at push time). `performUndoRedo` compares it
   * against the legacy CommandManager's top-entry `command.timestamp` so a
   * NEWER commandManager-only action (e.g. a 3D-placed door/window
   * ADD_OPENING) is undone BEFORE an older ring-buffer entry — reverse
   * chronological order across BOTH stacks.
   *
   * ⚠ **OPTIONAL TO SUPPLY, NEVER ABSENT ONCE STORED — corrected 2026-08-23,
   * §UNDO-ORDERING-KEY (L-7300).** This doc used to end *"Optional for backwards
   * compatibility (pre-existing fixtures omit it → ring-buffer-first behaviour
   * is preserved)"*, and that sentence described a **silent mis-route**, not a
   * compatibility affordance. `performUndoRedo._cmEntryIsNewer` opens with
   * `if (typeof pairTime !== 'number') return false` — so an entry with NO
   * timestamp does not merely lose a tie-break, it makes the ring buffer win
   * **unconditionally**, jumping over a legacy-stack entry however much newer
   * that entry is. The founder's 2026-08-23 console is exactly that: three wall
   * edits (rake 80 → rake 70 → profile), all `UPDATE_ELEMENT_PARAMETER` and
   * therefore commandManager-ONLY, and one Ctrl+Z that reverted a **slab**.
   *
   * MEASURED: **6 of the 8 production push sites minted an unstamped entry** —
   * `initBusHandlers.ts` :825 (`element.changeType`, ANY store key), :1596
   * (furniture), :1647 (floor), :1703 (**slab** — the founder's), :1798
   * (ceiling), and `commitAnnotationSet.ts` (annotation). Only
   * `CommandBus.ts:591` and `initBusHandlers.ts:1335` supplied one. Six copies
   * of an obligation that C03 §4.6 U-10 states once, with nothing enforcing it.
   *
   * THE FIX IS AT THE CHOKEPOINT, NOT AT THE CALLERS. {@link
   * RingBufferUndoStack.push} stamps commit time when the pusher did not, so
   * **every stored entry carries an ordering key by construction** and no
   * present or future push site can mint an unorderable one. A caller that KNOWS
   * the commit instant still wins — its value is never overwritten.
   */
  readonly timestamp?: number;
  /**
   * §UNDO-GESTURE-ID (C03 §4.6 U-10) — the id of the USER INTERACTION that
   * produced this entry, stamped by `CommandBus.executeCommand` at push time
   * (`@pryzm/command-bus` → `gestureScope.ts`).
   *
   * `timestamp` answers "when"; this answers "which action". `performUndo` needs
   * the second question to tell a DUAL-DISPATCH TWIN (one gesture recorded on
   * both this stack and the legacy CommandManager history — undo it once, via
   * U-8) from two separate user actions (undo the newest first, U-10). It used to
   * infer that from `|Δtimestamp| ≤ 250 ms`, which made the answer depend on how
   * fast the user clicked.
   *
   * Optional, and ABSENCE IS NOT MEMBERSHIP: an entry with no `gestureId` is
   * never classified as another entry's twin — it falls to the chronological
   * rule. Pre-existing fixtures and any dispatch made outside a gesture scope
   * therefore behave conservatively rather than silently joining the previous
   * gesture.
   */
  readonly gestureId?: string;
  /**
   * §UNDO-HISTORY-DROPDOWN (ADR-0341) — the bus verb that minted this entry
   * (`record.type`, e.g. `wall.create`), stamped by `CommandBus.executeCommand`
   * at push time.
   *
   * WHY IT WAS ADDED. A `PatchPair` carried `affectedStores`, `timestamp` and
   * `gestureId` — everything undo ROUTING needs and nothing a human can read. A
   * history dropdown built from this stack could therefore only say *"wall"*
   * (a store key, and for a multi-store entry not even one), never *"Create
   * wall"*. The verb is the one fact that distinguishes create from delete from
   * move within the same store, and the bus already had it in hand two lines
   * above the push — it was simply dropped on the floor.
   *
   * OPTIONAL AND NEVER LOAD-BEARING FOR UNDO. Nothing in `performUndo` /
   * `performRedo` / `applyRingBufferSide` reads it; it is label data only. Every
   * pre-existing fixture omits it and behaves identically. A reader that finds
   * it absent MUST fall back to a store-key-derived label, never to a blank row
   * — an unnamed row is indistinguishable from a missing one.
   */
  readonly commandType?: string;
}

/**
 * §UNDO-HISTORY-DROPDOWN (ADR-0341) — an IMMUTABLE, SERIALISABLE view of one
 * ring-buffer entry, for read-only consumers (the undo/redo history dropdown).
 *
 * WHY A VIEW AND NOT THE `PatchPair`. `listEntries()` must not hand a UI the
 * live entries: `PatchPair.forward.value` holds whole element records, and a
 * caller that receives them can mutate model state through the undo stack —
 * P6's "commands are the only mutation path" dies quietly. This view carries
 * only what a LABEL needs, is frozen, and contains no object the stack still
 * references.
 *
 * `opPaths` is the one field that is not a scalar: the JSON Pointer strings of
 * the entry's ops, WITHOUT their values. The element ids a row names live in
 * `path[0]`, and the decoder for that (`fromJsonPointer`) belongs to
 * `@pryzm/command-bus`, which imports THIS package — so the pointers are handed
 * out undecoded rather than duplicating the decoder here. Values are never
 * included.
 */
export interface RingBufferEntryView {
  /** Position in the buffer, oldest = 0. Stable only until the next `push()`. */
  readonly index: number;
  /** The bus verb that minted the entry (`wall.create`), or `undefined`. */
  readonly commandType?: string;
  /** Store keys the entry's patches target. May be empty (C03 §4.6 U-2). */
  readonly affectedStores: readonly string[];
  /** Epoch-ms the command committed, or `undefined` on legacy fixtures. */
  readonly timestamp?: number;
  /** The user interaction that produced the entry (§UNDO-GESTURE-ID). */
  readonly gestureId?: string;
  /** JSON Pointer paths of the FORWARD ops — no values. See the doc above. */
  readonly opPaths: readonly string[];
  /**
   * `false` while the entry is at or below the cursor (a pending UNDO);
   * `true` once it has been undone and sits above the cursor (a pending REDO).
   */
  readonly isUndone: boolean;
}

export interface RingBufferUndoStackOptions {
  /**
   * Maximum number of undo entries retained in the buffer.
   * Default: 200 (CONTRACT C03 §4.2).
   * When the cap is exceeded the oldest entry is silently discarded.
   */
  maxSize?: number;
  /**
   * §UNDO-ORDERING-KEY (C03 §4.6 U-10, L-7300) — the clock {@link
   * RingBufferUndoStack.push} stamps an unstamped pair with. Defaults to
   * `Date.now`, which is the SAME clock `Command.timestamp` uses — that shared
   * clock is what makes the cross-stack comparison meaningful, so an override
   * must stay epoch-ms-compatible or the two stacks stop being comparable.
   *
   * Injectable ONLY so a test can prove the stamping is the stack's doing rather
   * than the caller's; production has exactly one construction site
   * (`composeRuntime.ts:967`) and it passes nothing.
   */
  now?: () => number;
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
  /** §UNDO-ORDERING-KEY — the clock `push()` stamps with. See the option's doc. */
  private readonly _now: () => number;

  constructor(options: RingBufferUndoStackOptions = {}) {
    this._maxSize = Math.max(1, options.maxSize ?? DEFAULT_MAX_SIZE);
    this._now = options.now ?? Date.now;
  }

  // ── Mutation API ─────────────────────────────────────────────────────────

  /**
   * Push a new `PatchPair` onto the stack.
   *
   * Steps:
   * 0. §UNDO-ORDERING-KEY — stamp `timestamp` if the pusher did not (see below).
   * 1. Truncate any redo tail above the cursor.
   * 2. If the buffer is at capacity, silently drop the oldest entry (ring).
   * 3. Append the new entry; advance cursor.
   * 4. Notify all subscribers.
   *
   * CONTRACT: never throws (C03 §4.2).
   *
   * ── §UNDO-ORDERING-KEY (C03 §4.6 U-10, L-7300) ──────────────────────────────
   * **INVARIANT ESTABLISHED HERE: every entry this stack stores carries a finite
   * numeric `timestamp`.** `current()` / `peek()` / `listEntries()` therefore
   * never hand out an entry the cross-stack arbiter cannot order.
   *
   * WHY THE OBLIGATION MOVED HERE. C03 §4.6 U-10 requires both undo stacks to
   * carry a commit timestamp, and its parenthetical named the producer —
   * *"stamped by `CommandBus` at push"*. That reading is what let SIX other
   * producers ship without one (the census is on `PatchPair.timestamp`'s doc):
   * an obligation attached to ONE caller is an obligation the other seven never
   * knew they had. `performUndoRedo._cmEntryIsNewer` then reads a missing key as
   * *"the legacy entry is not newer"* — absence answering a question it was
   * never asked — and the older ring entry wins over a newer wall edit. That is
   * the founder's `[Undo] ring-buffer applied — stores: slab` after three
   * commandManager-only wall edits.
   *
   * WHY NOT SIX EDITS AT THE CALL SITES. That is six copies of one rule with
   * nothing enforcing it — the shape this repository has re-learned at
   * `_unionTargetIds` (U-9) and at `ELEMENT_STORE_ROUTES` (L-947). Every
   * producer flows through this method; the rule belongs where it cannot be
   * forgotten.
   *
   * PRECEDENCE, AND WHY IT CANNOT REORDER AN EXISTING PAIR. A supplied
   * `timestamp` always wins — `CommandBus` and `wall.updateDimensions` keep
   * stamping their own commit instant. For the six sites that supplied none, the
   * value now minted is `Date.now()` at push, and at ALL SIX the legacy twin's
   * command was CONSTRUCTED before the push (`_cmExec` / `commandManager.execute`
   * precede the `rb.push` at every one of them — :825, :1596, :1647, :1703,
   * :1798, and `commitAnnotationSet.ts:154-165`). So `cmTime <= pairTime` holds,
   * `_cmEntryIsNewer` stays `false`, and those dual-dispatch pairs keep their
   * existing ring-buffer-first routing. The ONLY decision that changes is the
   * one that was wrong: an UNRELATED, NEWER legacy entry is no longer jumped
   * over.
   */
  push(pair: PatchPair): void {
    // 0. §UNDO-ORDERING-KEY — the ordering key is minted here when the pusher
    //    did not supply one, so no entry can exist without one. Never overwrites.
    const stamped: PatchPair =
      typeof pair.timestamp === 'number' && Number.isFinite(pair.timestamp)
        ? pair
        : { ...pair, timestamp: this._safeNow() };

    // 1. Discard the redo tail.
    this._entries = this._entries.slice(0, this._cursor + 1);

    // 2. Ring-buffer overflow: drop oldest without error.
    if (this._entries.length >= this._maxSize) {
      this._entries.shift();
      // cursor already at last position after shift; will be set to length-1.
    }

    // 3. Append + advance.
    this._entries.push(stamped);
    this._cursor = this._entries.length - 1;

    // 4. Notify.
    this._notify();
  }

  /**
   * §UNDO-ORDERING-KEY — `this._now()` with the two ways an injected clock can
   * break the invariant closed: a throw, and a non-finite return. Either would
   * put an unorderable entry back into the stack, which is the whole defect this
   * closes, so both fall back to `Date.now()`. C03 §4.2: `push` never throws.
   */
  private _safeNow(): number {
    try {
      const t = this._now();
      if (typeof t === 'number' && Number.isFinite(t)) return t;
    } catch { /* an injected clock that throws is not a reason to lose the key */ }
    return Date.now();
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

  /**
   * §UNDO-HISTORY-DROPDOWN (ADR-0341) — a READ-ONLY, FROZEN projection of every
   * entry in the buffer, oldest first, each tagged with whether it is currently
   * undone (above the cursor).
   *
   * THE DEFECT THIS CLOSES. `_entries` and `_cursor` are private and the only
   * readers were `current()` / `peek()` — the TOP of each direction. A UI could
   * therefore ask "what would the next Ctrl+Z revert?" but never "what are the
   * last twenty things I did?", which is precisely the question the founder's
   * undo dropdown asks. Adding accessors for the private arrays themselves was
   * rejected: they hold `PatchPair.forward.value`, i.e. whole element records,
   * and handing those to UI code opens a mutation path into undo state that no
   * command authored (P6). This returns {@link RingBufferEntryView}s instead —
   * frozen scalars plus value-free op paths.
   *
   * ORDERING is buffer order (oldest → newest), NOT undo order. `isUndone`
   * partitions it: entries with `isUndone === false` are pending undos (the last
   * one is what `current()` returns); entries with `isUndone === true` are
   * pending redos (the first one is what `peek()` returns). Callers that want
   * undo order reverse the first partition themselves — this method does not
   * choose an ordering on their behalf, because the cross-stack merge that the
   * editor performs (C03 §4.6 U-10) has to interleave these with the legacy
   * stack anyway and a pre-baked order would be thrown away.
   *
   * Never throws; returns `[]` for an empty buffer. Does NOT move the cursor.
   */
  listEntries(): readonly RingBufferEntryView[] {
    const out: RingBufferEntryView[] = [];
    for (let i = 0; i < this._entries.length; i++) {
      const e = this._entries[i]!;
      out.push(Object.freeze({
        index: i,
        ...(e.commandType !== undefined ? { commandType: e.commandType } : {}),
        affectedStores: Object.freeze([...(e.affectedStores ?? [])]),
        ...(e.timestamp !== undefined ? { timestamp: e.timestamp } : {}),
        ...(e.gestureId !== undefined ? { gestureId: e.gestureId } : {}),
        // Values are deliberately excluded — see RingBufferEntryView's doc.
        opPaths: Object.freeze(e.forward.ops.map(o => o.path)),
        isUndone: i > this._cursor,
      }));
    }
    return Object.freeze(out);
  }

  /**
   * Index of the entry the next `undo()` would revert (`-1` when there is
   * nothing to undo). Exposed so a history view can align
   * {@link listEntries}'s indices with the undo cursor without inferring it
   * from `isUndone` — read-only, never moves anything.
   */
  get cursorIndex(): number {
    return this._cursor;
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
