// §UNDO-GESTURE-ID — the identity a gesture has, so undo never has to infer one
// from a clock (C03 §4.6 U-10; replaces the `_SAME_GESTURE_WINDOW_MS = 250`
// heuristic in `apps/editor/src/engine/undo/performUndoRedo.ts`).
//
// THE DEFECT THIS REPLACES
// ----------------------------------------------------------------------------
// PRYZM has two undo stacks (C03 §4.4): the CommandBus ring buffer and the legacy
// CommandManager history. ONE user action can land in BOTH ("dual dispatch"), and
// `performUndo` must tell that pair — a TWIN, which must be undone once via the
// ring buffer + shadow-drop (U-8) — from two SEPARATE user actions, which must be
// undone newest-first (U-10).
//
// Until now that question was answered by subtracting two `Date.now()` stamps and
// comparing against 250 ms. A gesture is a fact about INTENT, not about elapsed
// time: the same two clicks decide differently on a slow machine, under GC, or in
// a headless run, and no threshold is right for both a fast double-click and a
// slow drag. `undoGestureOrdering.test.ts` pins the cost — an 80 ms replay of a
// sequence undoes the WRONG mutation, and a 2 ms change in the gap flips it.
//
// WHAT A GESTURE ID IS
// ----------------------------------------------------------------------------
// An opaque, process-unique string minted ONCE per user interaction and stamped
// on every undo entry that interaction produces, on either stack. Two entries are
// the same gesture iff they carry the SAME id. Absence is not membership: an
// entry with no id is NEVER a twin of anything (that is the whole bug — an
// unlabelled command silently joining the previous gesture), so unlabelled
// entries fall to the chronological U-10 rule, which is the safe answer.
//
// WHERE ONE IS MINTED (the two real shapes, measured 2026-08-12)
// ----------------------------------------------------------------------------
//   A. HANDLER-INTERNAL — `apps/editor/src/engine/initBusHandlers.ts` registers 81
//      bridge handlers whose `fn` calls `_cmExec(new XCommand(...))` while the bus
//      dispatch is on the stack (the wrapper is a NON-async function; nothing
//      awaits before `spec.fn(cmd)`). `CommandBus.executeCommand` opens the scope
//      around `handler.execute`, so those legacy commands inherit the dispatch's
//      id with no per-handler change. This is causal, not temporal: "executed
//      inside this dispatch" is a fact about the call stack.
//   B. TOOL-LEVEL — a tool calls `bus.executeCommand(...)` and then, as the next
//      statement, `commandManager.execute(...)` for the same action. The bus call
//      is not awaited, so the ring push lands in a later microtask: the tool must
//      declare the scope itself with {@link withGesture}, which both calls read.
//      `WallTool.createWall` is the one live site that produces a real twin.
//
// SYNCHRONOUS BY CONTRACT. The ambient scope covers the SYNCHRONOUS call stack
// only — it is set, the body runs, it is restored in `finally`. It is deliberately
// NOT propagated across `await` (there is no AsyncLocalStorage in a browser, and a
// module-level slot that survives an await would leak into whatever dispatch runs
// next — a bug strictly worse than the one being fixed). Anything that must carry
// a gesture across an async boundary passes the id EXPLICITLY: `executeCommand`'s
// `opts.gestureId`, or `CommandMetadata.gestureId` on the legacy side.

/** Monotonic within a process; the counter only makes ids readable in a log. */
let _seq = 0;

/** The gesture that is open on the current synchronous call stack, if any. */
let _current: string | null = null;

/**
 * Mint a fresh gesture id. Process-unique and opaque — nothing may parse it, and
 * in particular nothing may order gestures by it (ordering is what timestamps
 * are for; this answers identity only).
 */
export function newGestureId(label?: string): string {
  _seq += 1;
  const tag = label ? `${label}-` : '';
  return `g_${tag}${_seq.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The gesture open on this call stack, or `null` when none is. */
export function currentGestureId(): string | null {
  return _current;
}

/**
 * Run `body` inside a gesture scope and return whatever it returns.
 *
 * JOINS an already-open gesture rather than minting a nested one: an explicit
 * outer scope (a tool's dual dispatch, a drag) is the user interaction, and every
 * dispatch inside it belongs to that one interaction. Restores the previous value
 * in `finally`, so a throw cannot leave a gesture open.
 *
 * The id is passed to `body` so a caller can hand it to an async continuation
 * explicitly (see the SYNCHRONOUS BY CONTRACT note above).
 */
export function withGesture<T>(body: (gestureId: string) => T, label?: string): T {
  const previous = _current;
  const id = previous ?? newGestureId(label);
  _current = id;
  try {
    return body(id);
  } finally {
    _current = previous;
  }
}

/**
 * Run `body` inside an EXPLICITLY named gesture scope, even when another gesture
 * is already open. Used by `CommandBus.executeCommand` to re-establish the id it
 * captured at dispatch entry around the handler call.
 */
export function withGestureId<T>(gestureId: string, body: () => T): T {
  const previous = _current;
  _current = gestureId;
  try {
    return body();
  } finally {
    _current = previous;
  }
}

/** Test-only: assert no scope leaked out of a previous case. */
export function __resetGestureScopeForTests(): void {
  _current = null;
}
