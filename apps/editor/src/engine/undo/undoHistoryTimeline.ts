// undoHistoryTimeline — the READ-ONLY projection of PRYZM's undo state, and the
// multi-step jump that the undo/redo history dropdown drives.
//
// §UNDO-HISTORY-DROPDOWN (ADR-0341 · C03 §4.5–4.8 · C16 §5 CA-22 · P6)
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE FOUNDER ASKED FOR, AND WHICH OF THE TWO READINGS THIS IS
// ─────────────────────────────────────────────────────────────────────────────
// "Be able to undo and redo a specific thing in time" has two readings, and they
// are not variations of one feature — they are different products:
//
//   (A) SEQUENTIAL JUMP-BACK. Picking the 5th row undoes rows 1–5, newest
//       first. This is what Revit, AutoCAD, Photoshop and every shipped CAD
//       history palette do. It is correct BY CONSTRUCTION: it is N ordinary
//       undos, in the order they would have happened anyway.
//
//   (B) SELECTIVE / OUT-OF-ORDER UNDO. Undo row 3 while KEEPING rows 4 and 5.
//
// **THIS MODULE IMPLEMENTS (A). (B) IS NOT SUPPORTED, and the UI says so in
// words rather than implying otherwise by silence.**
//
// WHY (B) IS NOT MERELY UNIMPLEMENTED BUT UNSOUND IN *THIS* COMMAND MODEL —
// measured, not assumed:
//
//   1. THE INVERSE IS A POSITIONAL PATCH, NOT A COMMUTABLE OPERATION. A
//      ring-buffer entry is `PatchPair { forward, inverse }` where each side is
//      a list of JSON-Pointer ops with LITERAL values captured at commit time
//      (`RingBufferUndoStack.ts`). `inverse` restores the value the field held
//      *at that instant*. Replaying entry 3's inverse after entries 4 and 5 have
//      written the same path does not "remove entry 3's contribution" — it
//      OVERWRITES entries 4 and 5 with a value from before they existed. The
//      patch has no notion of what it is undoing; it is an assignment.
//
//   2. THE LEGACY HALF IS A SNAPSHOT, WHICH IS STRICTLY WORSE. Path-A undo
//      (`CommandManagerImpl.undo()` → `command.undo(ctx)`) writes back
//      pre-command state captured by `createSnapshot()` over WHOLE STORES
//      (C03 §4.3). Applying it out of order discards every later edit to every
//      element in those stores, not merely the one being undone.
//
//   3. HOSTED AND DERIVED ELEMENTS MAKE THE RESULT UNDEFINED, NOT MERELY WRONG.
//      C15 doors/windows are hosted IN a wall; C03 §4.6 U-9 exists precisely
//      because a create command's effects reach elements it does not name.
//      Move a wall, host a door on it, then selectively un-move the wall: the
//      door's host geometry no longer exists in the position its own record was
//      written against. There is no defined answer, which is why the major BIM
//      tools refuse this too.
//
//   The honest exit is not a partial (B). It is ADR-0251's single timeline over
//   a single store with derived geometry — at which point selective undo becomes
//   a question that can at least be ASKED. Until then, offering it would be a
//   button that silently corrupts a model, and a corrupting button with a
//   plausible tooltip is worse than no button.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A PROJECTION HAD TO BE BUILT AT ALL
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM has TWO undo stacks (C03 §4.3) and `performUndo` merges them at the top
// entry only, chronologically, with a dual-dispatch twin guard (§UNDO-CROSS-
// STACK-ORDER, §UNDO-GESTURE-ID). Neither stack could be READ beyond its own top
// entry: `RingBufferUndoStack` exposed `current()`/`peek()`, and
// `CommandManagerImpl.history`/`redoStack` were private (`getHistory()` returned
// the LIVE `Command` objects, which is a mutation path, not a view). So no UI
// could answer "what are the last twenty things I did?" — the founder's actual
// question. Both stacks now expose frozen, value-free row views, and this module
// merges them with the SAME predicates `performUndo` routes by, so the list a
// user sees is the order the undos will actually run in.
//
// ⚠ THE MERGE IS A PREVIEW, NOT A PROOF — stated here so nobody reads it as one.
// It cannot be exact, and the two places it can diverge are named:
//   • SHADOW-DROP ALIVENESS. `dropEntriesForTargets` drops a twin only when the
//     elements are ALREADY GONE (`_elementExists`). At preview time they are
//     alive, so the projection uses the ORDERING predicate (`gestureId` equality
//     + `targetIds ⊆ ringIds`) instead. That is the predicate `performUndo`
//     ROUTES by, which is the one that decides row order — but a drop can still
//     take more legacy entries than the row showed.
//   • STRANDED ENTRIES. A ring entry whose stores have no adapter (C03 §4.8,
//     `UNMAPPED_BUS_STORE_KEYS`) consumes no cursor and reverts nothing.
// Therefore {@link undoThrough} does NOT trust the projection: it runs
// `performUndo()` and STOPS at the first outcome that is not `'undone'`, and
// reports how many steps actually completed. A jump that under-delivers says so.
//
// P6 — every step goes through `performUndo()` / `performRedo()`, the single
// unified path (C03 §4.6 U-5). This module writes to no store, ever.

import { fromJsonPointer } from '@pryzm/command-bus';
import type { RingBufferEntryView } from '@pryzm/runtime-undo-stack';
import { performUndo, performRedo } from './performUndoRedo.js';

// ── The row shape ───────────────────────────────────────────────────────────

/** Which stack(s) a row came from — surfaced for diagnostics, not for the user. */
export type UndoTimelineStack = 'ring-buffer' | 'commandManager' | 'both';

/**
 * ONE ROW OF THE HISTORY DROPDOWN = ONE `performUndo()` CALL.
 *
 * That equivalence is the whole contract of this module: it is what lets
 * {@link undoThrough} implement "jump to row k" as "press Ctrl+Z k+1 times",
 * which is reading (A) and is correct by construction. A row that consumed two
 * calls, or two rows that consumed one, would break the mapping silently — which
 * is why a dual-dispatch twin (one gesture on BOTH stacks) is collapsed into a
 * single row here rather than listed twice.
 */
export interface UndoTimelineEntry {
  /** Stable within one projection; used as a DOM key. Not persistent. */
  readonly key: string;
  /** Human sentence — "Create wall", "Set wall height". Never empty. */
  readonly label: string;
  /** True when `label` came from the command's own `describe()` (C16 CA-22). */
  readonly labelAuthored: boolean;
  /** The raw verb/enum token the label was derived from. Diagnostics. */
  readonly rawType: string;
  /** Secondary line — element count, cascade count. Absent when there is none. */
  readonly detail?: string;
  /** Epoch-ms of the commit, when the entry carried one. */
  readonly timestamp?: number;
  /** Element ids this row names. May be empty (not every entry names one). */
  readonly elementIds: readonly string[];
  /** Which stack(s) this row was projected from. */
  readonly stack: UndoTimelineStack;
}

/**
 * The merged view of both stacks.
 *
 * `undo[0]` is what the NEXT Ctrl+Z reverts; `redo[0]` is what the next Ctrl+Y
 * replays. Both are newest-action-first, i.e. the order a history palette shows
 * top-down.
 */
export interface UndoTimeline {
  readonly undo: readonly UndoTimelineEntry[];
  readonly redo: readonly UndoTimelineEntry[];
}

/** What a multi-step jump ACTUALLY did — never what it was asked to do. */
export interface UndoJumpOutcome {
  readonly direction: 'undo' | 'redo';
  /** Steps asked for (rowIndex + 1). */
  readonly requested: number;
  /** Steps that returned `'undone'` / `'redone'`. May be < `requested`. */
  readonly completed: number;
  /** Why it stopped early. Absent when `completed === requested`. */
  readonly stoppedBy?: 'nothing-left' | 'stranded' | 'error';
  /** The stranded/error reason, verbatim from the undo path. */
  readonly reason?: string;
}

// ── Stack access (duck-typed, mirroring performUndoRedo) ────────────────────

interface RingBufferReadable {
  listEntries?(): readonly RingBufferEntryView[];
}
interface LegacyHistoryRowLike {
  readonly index: number;
  readonly id: string;
  readonly type: string;
  readonly label?: string;
  readonly timestamp?: number;
  readonly gestureId?: string;
  readonly targetIds: readonly string[];
  readonly structuralChildCount: number;
}
interface CommandManagerReadable {
  getUndoHistoryView?(): readonly LegacyHistoryRowLike[];
  getRedoHistoryView?(): readonly LegacyHistoryRowLike[];
}

function _rb(): RingBufferReadable | undefined {
  return window.runtime?.bus?.ringBuffer as unknown as RingBufferReadable | undefined;
}
function _cm(): CommandManagerReadable | undefined {
  return (globalThis as { commandManager?: CommandManagerReadable }).commandManager;
}

// ── Labelling ───────────────────────────────────────────────────────────────

/**
 * §UNDO-HISTORY-DROPDOWN — derive a plain-English label from a command token.
 *
 * THE DESIGN DECISION THIS ENCODES. A dropdown reading `UPDATE_VIEWPORT_SCALE`
 * is not the feature the founder asked for, so a label had to come from
 * somewhere. Two sources exist and BOTH are used, in strict priority:
 *
 *   1. `Command.describe()` (C16 CA-22) — the author states it, in the file that
 *      holds the payload. Only the command can say "Set wall height to 3.2 m".
 *   2. THIS FUNCTION — a total transform over the token, used when (1) is
 *      absent (which is every command today: `describe()` ships optional so no
 *      commit has to edit ~200 command classes at once).
 *
 * A UI-SIDE LOOKUP TABLE WAS REJECTED. A table is a partial function: every
 * command authored after it was written falls through to the raw enum, and
 * nothing fails — the dropdown just degrades, quietly, forever. This is a
 * TRANSFORM and is total: an unrecognised token still produces a readable
 * sentence, so a new command can be un-POLISHED but never un-NAMED.
 *
 * THE THREE TOKEN SHAPES IT SPANS (all measured in this repo):
 *   • dotted bus verb   — `wall.create`, `element.updateParameters`, `view.switch`
 *   • SCREAMING_SNAKE   — `UPDATE_WALL_HEIGHT`, `ADD_OPENING`, `MOVE_VIEWPORT`
 *   • anything else     — camelCase/kebab, sentence-cased as a fallback
 *
 * For a dotted verb the noun is inserted AFTER the leading verb word rather than
 * appended, because appending reads as machine output: `element.updateParameters`
 * → "Update element parameters", not "Update parameters element".
 *
 * Pure. Never throws. Never returns an empty string.
 */
export function describeCommandToken(token: string | undefined | null): string {
  const raw = typeof token === 'string' ? token.trim() : '';
  if (raw.length === 0) return 'Unnamed action';
  try {
    if (raw.includes('.')) return _describeDottedVerb(raw);
    return _sentenceCase(_splitToken(raw));
  } catch {
    return raw;
  }
}

/** `wall.create` → "Create wall"; `door.setOffset` → "Set door offset". */
function _describeDottedVerb(raw: string): string {
  const segments = raw.split('.').filter(s => s.length > 0);
  if (segments.length < 2) return _sentenceCase(_splitToken(raw));
  const verbToken = segments[segments.length - 1]!;
  const nounSegments = segments.slice(0, -1);
  // `wall.batch.create` — 'batch' is a dispatch shape, not part of the noun; it
  // becomes a suffix so the row reads "Create wall (batch)" rather than
  // "Create wall batch", which reads as a kind of object that does not exist.
  const isBatch = nounSegments.some(s => s.toLowerCase() === 'batch');
  const nounWords = nounSegments
    .filter(s => s.toLowerCase() !== 'batch')
    .flatMap(s => _splitToken(s));
  const verbWords = _splitToken(verbToken);
  if (verbWords.length === 0) return _sentenceCase(nounWords);
  const words = [verbWords[0]!, ...nounWords, ...verbWords.slice(1)];
  return _sentenceCase(words) + (isBatch ? ' (batch)' : '');
}

/** Split SCREAMING_SNAKE / camelCase / kebab into lower-case words. */
function _splitToken(token: string): string[] {
  return token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w.toLowerCase());
}

function _sentenceCase(words: readonly string[]): string {
  if (words.length === 0) return 'Unnamed action';
  const first = words[0]!;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
}

/**
 * Element ids named by a ring-buffer row — `path[0]` of each op, exactly as
 * `performUndoRedo._idsOf` derives them, using the SAME decoder so the two can
 * never drift on pointer escaping.
 */
function _idsFromPaths(paths: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const p of paths) {
    try {
      const seg = fromJsonPointer(p)[0];
      if (seg != null && String(seg).length > 0) ids.add(String(seg));
    } catch { /* malformed pointer — skip, exactly as _idsOf does */ }
  }
  return [...ids];
}

function _detailFor(elementIds: readonly string[], structuralChildCount: number): string | undefined {
  const parts: string[] = [];
  if (elementIds.length > 1) parts.push(`${elementIds.length} elements`);
  // §L-874-ONE-UNDO — a gesture's structural cascades revert WITH it. They are
  // deliberately not their own rows; naming the count is how the row stays
  // honest about reverting more than the sentence says.
  if (structuralChildCount > 0) {
    parts.push(`+${structuralChildCount} related change${structuralChildCount === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

// ── The merge ───────────────────────────────────────────────────────────────

interface PendingRing {
  readonly kind: 'ring';
  readonly view: RingBufferEntryView;
  readonly ids: string[];
}
/**
 * §UNDO-SAME-GESTURE — is this legacy row the SAME GESTURE as this ring entry (a
 * dual-dispatch twin), rather than a separate later action?
 *
 * This is deliberately a COPY OF THE PREDICATE SHAPE in
 * `performUndoRedo._isSameGestureTwin`, not an approximation of it: `gestureId`
 * equality (never a clock — C03 §4.6 U-10's amendment is explicit that wall-clock
 * proximity MUST NOT be used to infer gesture membership) AND `targetIds ⊆
 * ringIds`. Absence is never membership: an entry with no gesture id is not a
 * twin, so it gets its own row. That direction costs at most one extra row in a
 * preview; the other direction would hide a real user action from the list.
 *
 * It cannot be imported from `performUndoRedo` because that predicate takes a
 * live `PatchPair`; this takes the frozen view. The pair is pinned together by
 * `undoHistoryTimeline.test.ts`.
 */
function _isTwin(ring: PendingRing, legacy: LegacyHistoryRowLike): boolean {
  const targets = legacy.targetIds;
  if (targets.length === 0) return false;
  const g = ring.view.gestureId;
  if (g === undefined || legacy.gestureId === undefined) return false;
  if (g !== legacy.gestureId) return false;
  const ids = new Set(ring.ids);
  return targets.every(id => ids.has(id));
}

/**
 * Merge the two newest-first queues into rows, mirroring `performUndo`'s
 * routing: take the legacy head FIRST when it is strictly newer than the ring
 * head and the two are not a twin (§UNDO-CROSS-STACK-ORDER); otherwise take the
 * ring head, collapsing every legacy twin of it into the same row (U-8's
 * shadow-drop, which is why those must not appear as separate rows).
 *
 * `direction` only changes the label prefix of the diagnostics — the ordering
 * rule is the same for the redo queue read forward.
 */
function _merge(ring: PendingRing[], legacy: LegacyHistoryRowLike[], keyPrefix: string): UndoTimelineEntry[] {
  const out: UndoTimelineEntry[] = [];
  let r = 0;
  let l = 0;
  let guard = 0;
  const limit = ring.length + legacy.length + 1;
  while ((r < ring.length || l < legacy.length) && guard++ < limit) {
    const rh = r < ring.length ? ring[r]! : null;
    const lh = l < legacy.length ? legacy[l]! : null;

    if (rh === null && lh !== null) { out.push(_rowFromLegacy(lh, keyPrefix, out.length)); l++; continue; }
    if (lh === null && rh !== null) { out.push(_rowFromRing(rh, [], keyPrefix, out.length)); r++; continue; }
    if (rh === null || lh === null) break;

    const rt = rh.view.timestamp;
    const lt = lh.timestamp;
    const legacyIsNewer =
      typeof rt === 'number' && typeof lt === 'number' && lt > rt && !_isTwin(rh, lh);
    if (legacyIsNewer) { out.push(_rowFromLegacy(lh, keyPrefix, out.length)); l++; continue; }

    // Ring head wins. Absorb every legacy twin of it (U-8 shadow-drop collapses
    // them into this one gesture — one action, one row, one Ctrl+Z).
    const twins: LegacyHistoryRowLike[] = [];
    while (l < legacy.length && _isTwin(rh, legacy[l]!)) { twins.push(legacy[l]!); l++; }
    out.push(_rowFromRing(rh, twins, keyPrefix, out.length));
    r++;
  }
  return out;
}

function _rowFromRing(
  p: PendingRing, twins: readonly LegacyHistoryRowLike[], keyPrefix: string, ordinal: number,
): UndoTimelineEntry {
  // Prefer an AUTHORED sentence from a twin's describe() over a derived one: the
  // twin is the same gesture, and an author's words beat a transform.
  const authored = twins.find(t => typeof t.label === 'string' && t.label.length > 0)?.label;
  const rawType = p.view.commandType ?? (p.view.affectedStores[0] ?? 'change');
  const childCount = twins.reduce((n, t) => n + t.structuralChildCount, 0);
  const detail = _detailFor(p.ids, childCount);
  return Object.freeze({
    key: `${keyPrefix}:rb:${p.view.index}:${ordinal}`,
    label: authored ?? describeCommandToken(p.view.commandType ?? rawType),
    labelAuthored: authored !== undefined,
    rawType,
    ...(detail !== undefined ? { detail } : {}),
    ...(p.view.timestamp !== undefined ? { timestamp: p.view.timestamp } : {}),
    elementIds: Object.freeze([...p.ids]),
    stack: (twins.length > 0 ? 'both' : 'ring-buffer') as UndoTimelineStack,
  });
}

function _rowFromLegacy(row: LegacyHistoryRowLike, keyPrefix: string, ordinal: number): UndoTimelineEntry {
  const authored = typeof row.label === 'string' && row.label.length > 0 ? row.label : undefined;
  const detail = _detailFor(row.targetIds, row.structuralChildCount);
  return Object.freeze({
    key: `${keyPrefix}:cm:${row.id || row.index}:${ordinal}`,
    label: authored ?? describeCommandToken(row.type),
    labelAuthored: authored !== undefined,
    rawType: row.type,
    ...(detail !== undefined ? { detail } : {}),
    ...(row.timestamp !== undefined ? { timestamp: row.timestamp } : {}),
    elementIds: Object.freeze([...row.targetIds]),
    stack: 'commandManager' as UndoTimelineStack,
  });
}

/**
 * §UNDO-HISTORY-DROPDOWN — THE projection. Read both stacks, merge, return rows
 * newest-first in each direction.
 *
 * `undo[0]` is what the next Ctrl+Z reverts, `redo[0]` what the next Ctrl+Y
 * replays — so `undoThrough(k)` is "everything from `undo[0]` down to and
 * including `undo[k]`", which is exactly what the UI highlights.
 *
 * A collaborator's edit can never appear: `CommandManagerImpl.execute()` excludes
 * `REMOTE` and remote-origin dispatches from `history` at the PUSH (C03 §4.6 U-1
 * / §UNDO-REMOTE-ORIGIN), and `CommandBus` skips the ring-buffer push for
 * `suppressUndo`. This function adds no filter of its own, deliberately — a
 * second copy of that rule here would be the weaker one, and the copy at the push
 * is the one the two-client harness measured.
 *
 * Never throws: a missing runtime, a stack without the new accessors, or a
 * malformed row yields fewer rows, never an exception. `{undo:[],redo:[]}` is the
 * honest answer for "I could not read the stacks" AND for "there is nothing" —
 * a distinction this projection genuinely cannot make, because an unreadable
 * stack and an empty stack are the same observation from here. Callers that need
 * to tell them apart must ask the stacks directly.
 */
export function buildUndoTimeline(): UndoTimeline {
  let ringUndo: PendingRing[] = [];
  let ringRedo: PendingRing[] = [];
  try {
    const entries = _rb()?.listEntries?.() ?? [];
    const pending: PendingRing[] = [];
    const undone: PendingRing[] = [];
    for (const view of entries) {
      const p: PendingRing = { kind: 'ring', view, ids: _idsFromPaths(view.opPaths) };
      (view.isUndone ? undone : pending).push(p);
    }
    // Newest-first in both directions: the next undo is the last pending entry;
    // the next redo is the FIRST undone entry (the ring replays oldest-first).
    ringUndo = pending.reverse();
    ringRedo = undone;
  } catch (err) {
    console.warn('[UndoTimeline] ring-buffer projection failed', err);
  }

  let cmUndo: LegacyHistoryRowLike[] = [];
  let cmRedo: LegacyHistoryRowLike[] = [];
  try {
    const cm = _cm();
    cmUndo = [...(cm?.getUndoHistoryView?.() ?? [])].reverse();
    // `redoStack` is a stack: the next redo is its LAST element, so newest-first
    // for a redo list is the stack read backwards, same as the undo half.
    cmRedo = [...(cm?.getRedoHistoryView?.() ?? [])].reverse();
  } catch (err) {
    console.warn('[UndoTimeline] commandManager projection failed', err);
  }

  return Object.freeze({
    undo: Object.freeze(_merge(ringUndo, cmUndo, 'u')),
    redo: Object.freeze(_merge(ringRedo, cmRedo, 'r')),
  });
}

// ── The jump (reading A) ────────────────────────────────────────────────────

/**
 * READING (A) — undo every row from the top down to and INCLUDING `rowIndex`.
 *
 * Implemented as `rowIndex + 1` sequential `performUndo()` calls, which is what
 * makes it correct by construction: it does exactly what pressing Ctrl+Z that
 * many times does, through the one unified path (C03 §4.6 U-5, P6). There is no
 * second undo algorithm here and there must never be one.
 *
 * IT STOPS AT THE FIRST STEP THAT DID NOT UNDO. `performUndo` returns
 * `'stranded'` when an entry is pending but has no adapter (C03 §4.8) — a real
 * state in this repo, enumerated in `UNMAPPED_BUS_STORE_KEYS`. Continuing past
 * one would spin against an unmovable cursor and report N steps for zero work.
 * The outcome therefore reports `completed`, which the caller MUST surface when
 * it is less than `requested`: "I undid 3 of the 5 you asked for" is the whole
 * difference between a tool you can trust and one you cannot.
 *
 * `rowIndex` is clamped at 0; a negative index does nothing and says so.
 */
export function undoThrough(rowIndex: number): UndoJumpOutcome {
  const requested = Math.max(0, Math.floor(rowIndex) + 1);
  let completed = 0;
  for (let i = 0; i < requested; i++) {
    const outcome = performUndo();
    if (outcome.status === 'undone') { completed++; continue; }
    return Object.freeze({
      direction: 'undo' as const,
      requested,
      completed,
      stoppedBy: outcome.status === 'nothing-to-undo' ? 'nothing-left' as const
        : outcome.status === 'stranded' ? 'stranded' as const : 'error' as const,
      ...(outcome.status === 'stranded' || outcome.status === 'error'
        ? { reason: outcome.reason }
        : {}),
    });
  }
  return Object.freeze({ direction: 'undo' as const, requested, completed });
}

/** Mirror of {@link undoThrough} for the redo direction. Same guarantees. */
export function redoThrough(rowIndex: number): UndoJumpOutcome {
  const requested = Math.max(0, Math.floor(rowIndex) + 1);
  let completed = 0;
  for (let i = 0; i < requested; i++) {
    const outcome = performRedo();
    if (outcome.status === 'redone') { completed++; continue; }
    return Object.freeze({
      direction: 'redo' as const,
      requested,
      completed,
      stoppedBy: outcome.status === 'nothing-to-redo' ? 'nothing-left' as const
        : outcome.status === 'stranded' ? 'stranded' as const : 'error' as const,
      ...(outcome.status === 'stranded' || outcome.status === 'error'
        ? { reason: outcome.reason }
        : {}),
    });
  }
  return Object.freeze({ direction: 'redo' as const, requested, completed });
}
