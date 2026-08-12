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

// ─── §UNDO-REMOTE-ORIGIN (C03 §4.6 U-1) — the REMOTE half of the same idea ───
//
// THE DEFECT THIS CLOSES (measured 2026-08-12 by
// tools/rac-conformance/certification, finding `undo/undo-did-not-revert-own`).
//
// C03 §4.6 **U-1** is unambiguous: *`source: 'remote' | 'ai'` (i.e.
// `suppressUndo`) MUST NOT push*, and `CommandManagerImpl.execute` implements
// exactly that — `metadata.source !== 'REMOTE'` gates the `history.push`
// (§30-REAL-TIME-COLLABORATION §3.5: "each user's undo history reflects only
// their own local intent"). The rule was RIGHT and it was simply never REACHED
// on the CRDT read leg.
//
// The socket.io path stamps it (`RemoteCommandDispatcher.ts:378` passes
// `{ source: 'REMOTE' }`). The CRDT path does not. `initRemoteElementSync`'s
// sink dispatches `element.updateParameters` on the bus with `_remoteSync: true`
// — which is honoured by the CRDT applier's echo-break and by NOTHING ELSE. The
// bus's `element.updateParameters` bridge then calls `_cmExec(cmd)` with no
// metadata, so `CommandMetadata` defaults to `{ source: 'HUMAN_DIRECT' }` and a
// PEER's edit is pushed onto THIS user's undo history as if this user authored
// it.
//
// MEASURED CONSEQUENCE, on the two-client harness. Client A makes ONE edit
// (`wall.updateDimensions height=5`), syncs with client B, and A's history holds
// THREE entries, all `HUMAN_DIRECT`:
//     [0] UpdateWallDimensionsCommand    ← A's own gesture (correct)
//     [1] UpdateElementParameterCommand  ← REMOTE, must not be here
//     [2] UpdateElementParameterCommand  ← REMOTE, must not be here
// So A's Ctrl+Z pops [2] (a no-op), a second pops [1] — which REVERTS B's colour
// #c0ffee → #aabbcc on A — and only the THIRD reverts A's own height 5 → 3. Both
// halves of the harness's undo arm are this ONE bug: `undo-did-not-revert-own`
// (A's Ctrl+Z did not revert A's own gesture) and `undo-reverted-peer-work` (it
// reverted B's instead). A single-client control undoes correctly on the FIRST
// press, which is what localises the defect to the concurrent path.
//
// WHY AN AMBIENT SCOPE, AND WHY IT IS THE SMALLEST SOUND CHANGE.
// The fact "this dispatch originated remotely" is known at ONE place (the sink,
// via `suppressUndo` / the `_remoteSync` payload marker) and is needed at
// ANOTHER (`CommandManagerImpl.execute`, several frames down, inside a legacy
// bridge that takes no such parameter). That is precisely the problem
// `currentGestureId()` above already solves for gesture identity, by the same
// mechanism and with the same synchronous-call-stack contract — so this is the
// established idiom here, not a new one. The alternative — threading a
// `source` argument through all 90 `_cmExec` call sites in `initBusHandlers.ts`
// — changes 40-odd verbs to fix one fact that none of them author.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does NOT weaken the REMOTE exclusion.
// The exclusion exists because "undoing a remote collaborator's command is not
// supported; doing so silently would cause the two clients to diverge", and that
// stays exactly as it was. The bug was never that A's own edit was excluded —
// the probe proves A's own entry was present and correct at index [0] all along.
// The bug is that B's edits were INCLUDED, burying A's under two phantom
// entries. This change distinguishes "A's own edit, which happened to travel
// through the CRDT" from "B's edit, which arrived remotely" — the two facts the
// code conflated — and it does so at the only point that can tell them apart:
// whether this dispatch came from the read-back sink.
//
// THE GLOBAL SLOT, and why it is not a new pattern either.
// `CommandManagerImpl` is `@pryzm/command-registry` (L2) and this module is
// `@pryzm/command-bus` (L1); L2 does not depend on L1 and MUST NOT start to for
// one boolean. `CommandManagerImpl.execute` already reads exactly one ambient
// global for exactly this kind of cross-package undo gating —
// `__pryzmBuildingGenActive` (CommandManagerImpl.ts:157, §GEN-LOG-GATING) — so
// the slot below mirrors that precedent verbatim rather than inventing a
// channel. SYNCHRONOUS BY CONTRACT, identically to the gesture scope: set,
// body, restore in `finally`. It never spans an `await`.

/** Ambient global slot — read by `@pryzm/command-registry` without an L2→L1 edge. */
const REMOTE_ORIGIN_SLOT = '__pryzmRemoteOriginDispatch';

type RemoteOriginHost = { [REMOTE_ORIGIN_SLOT]?: boolean };

/**
 * True while a REMOTE-originated dispatch is on the current synchronous call
 * stack. Read by `CommandManagerImpl.execute` to stamp `source: 'REMOTE'` on a
 * legacy command a bridge creates inside such a dispatch, so C03 §4.6 U-1's
 * "MUST NOT push" is honoured on the CRDT read leg as it already is on the
 * socket.io one.
 */
export function isRemoteOriginDispatch(): boolean {
  return (globalThis as unknown as RemoteOriginHost)[REMOTE_ORIGIN_SLOT] === true;
}

/**
 * Run `body` marked as a REMOTE-originated dispatch.
 *
 * Restores the previous value in `finally`, so a throw cannot leave the flag
 * stuck ON — which would silently make every subsequent local edit un-undoable,
 * a defect strictly worse than the one being fixed.
 */
export function withRemoteOrigin<T>(body: () => T): T {
  const host = globalThis as unknown as RemoteOriginHost;
  const previous = host[REMOTE_ORIGIN_SLOT];
  host[REMOTE_ORIGIN_SLOT] = true;
  try {
    return body();
  } finally {
    host[REMOTE_ORIGIN_SLOT] = previous;
  }
}

/** Test-only: assert no scope leaked out of a previous case. */
export function __resetGestureScopeForTests(): void {
  _current = null;
  delete (globalThis as unknown as RemoteOriginHost)[REMOTE_ORIGIN_SLOT];
}
