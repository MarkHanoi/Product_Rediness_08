/**
 * §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO — "the batch changed nothing" and "I
 * could not read what the batch did" were the same broadcast.
 * (C78 §20 · U-INV-4 · row GR-14 · §FIX-REPORT-PAYLOAD-DISCARD.)
 *
 * ─── THE DEFECT, AS IT REACHED THE USER ──────────────────────────────────────
 * Every wall batch bridge built its outgoing report like this:
 *
 *     affectedElementIds: result?.affectedElementIds ?? [],
 *
 * `result` comes from `window.commandManager.execute(...)`. That is a FOREIGN
 * GLOBAL, read off `window` through a structural cast, so "returned something
 * unreadable" is a reachable state and not a paranoid one — the repo already
 * has `bridgeRefusalReachesTheCaller.test.ts` driving a manager that returns an
 * object with no `success` field at all.
 *
 * When that happened the bridge broadcast `affectedElementIds: []`, which is
 * bit-for-bit the payload a batch that genuinely matched no walls emits. The
 * consumer — `BATCH_REPORT_EVENTS` in ZeroTokenChatBridge, i.e. the RAC chat
 * answer the user reads — therefore said "0 walls changed" about a command that
 * may well have mutated the model on its way to returning junk.
 *
 * `UpdateWallsHeightBatch` was worse still: `outcome: result?.success ?
 * 'applied' : 'refused'` stamped the report **'refused'**, minting a refusal
 * identity for a decision nobody made.
 *
 * ─── PROVED AT THE CALLER (task step 4, §COMMITTED-IS-NOT-REACHABLE) ─────────
 * A determination type that every consumer immediately spreads back into a bare
 * array satisfies a static gate and still violates U-INV-4 in effect. So none
 * of these arms inspect the handler's return value — `execute()` returns
 * `{ forward: [], inverse: [] }` in every case and always did. Each arm
 * SUBSCRIBES to the report event, exactly as the chat bridge does, and asserts
 * on what arrives there.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateWallsColorBatchHandler, WALL_COLOR_BATCH_REPORT_EVENT } from '../src/handlers/UpdateWallsColorBatch.js';
import { UpdateWallsSystemTypeBatchHandler, WALL_TYPE_BATCH_REPORT_EVENT } from '../src/handlers/UpdateWallsSystemTypeBatch.js';

type AnyReport = {
  success: boolean;
  info: readonly string[];
  affectedElementIds: readonly string[];
  outcome?: 'applied' | 'refused' | 'indeterminate';
};

// This package's suite runs in the NODE environment (see
// `update-walls-height-batch.test.ts`, which hand-builds `g.window`). Node 20
// ships `EventTarget` and `CustomEvent` as globals, so a real event bus is
// available without pulling a DOM in — and a REAL bus matters here, because the
// whole point is to assert on what a SUBSCRIBER receives rather than on what
// the handler returns.
const g = globalThis as unknown as { window: Record<string, unknown> };

function freshWindow(): void {
  const win = new EventTarget() as unknown as Record<string, unknown>;
  win.__pryzmInitComplete = true;
  g.window = win;
}

/** Subscribe like the chat bridge does, run `fn`, return what was broadcast. */
function captureReport(event: string, fn: () => void): AnyReport[] {
  const seen: AnyReport[] = [];
  const target = g.window as unknown as EventTarget;
  const listener = (e: Event): void => { seen.push((e as CustomEvent).detail as AnyReport); };
  target.addEventListener(event, listener);
  try { fn(); } finally { target.removeEventListener(event, listener); }
  return seen;
}

/** Install a command manager whose execute() returns exactly `value`. */
function installCommandManager(value: unknown): void {
  g.window.commandManager = { execute: () => value };
}

describe('§BATCH-UNREADABLE-RESULT-IS-NOT-ZERO — an unread result never reads as "zero changed"', () => {
  beforeEach(() => {
    freshWindow();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete g.window.commandManager;
    vi.restoreAllMocks();
  });

  it('ARM 1 — an UNREADABLE result reaches the caller as INDETERMINATE, not as zero walls', () => {
    // The measured shape: a manager that returns an object with no
    // `affectedElementIds` at all. Pre-fix this broadcast
    // `{ success: false, info: [], affectedElementIds: [] }` — "0 walls changed".
    installCommandManager({ somethingElse: true });

    const reports = captureReport(WALL_COLOR_BATCH_REPORT_EVENT, () => {
      UpdateWallsColorBatchHandler.execute(
        {} as never,
        { wallIds: 'all', materialColor: '#ff0000' } as never,
      );
    });

    expect(reports).toHaveLength(1);
    const r = reports[0]!;
    expect(r.outcome).toBe('indeterminate');
    expect(r.info.join(' ')).toContain('no readable');
    // The load-bearing assertion: the caller is told this is NOT a zero-claim.
    expect(r.info.join(' ')).toContain('NOT a report that none did');
  });

  it('ARM 2 — NEGATIVE CONTROL: a READABLE result with zero ids still reports zero', () => {
    // The fix must not turn every quiet batch into a refusal. A command manager
    // that answers properly and genuinely changed nothing is a real
    // determination and must survive untouched.
    installCommandManager({ success: true, affectedElementIds: [], info: ['nothing matched'] });

    const reports = captureReport(WALL_COLOR_BATCH_REPORT_EVENT, () => {
      UpdateWallsColorBatchHandler.execute(
        {} as never,
        { wallIds: 'all', materialColor: '#ff0000' } as never,
      );
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]!.outcome).toBeUndefined();
    expect(reports[0]!.success).toBe(true);
    expect(reports[0]!.affectedElementIds).toEqual([]);
  });

  it('ARM 3 — a READABLE result with ids passes them through unchanged', () => {
    installCommandManager({ success: true, affectedElementIds: ['wall-1', 'wall-2'] });

    const reports = captureReport(WALL_COLOR_BATCH_REPORT_EVENT, () => {
      UpdateWallsColorBatchHandler.execute(
        {} as never,
        { wallIds: 'all', materialColor: '#ff0000' } as never,
      );
    });

    expect(reports[0]!.affectedElementIds).toEqual(['wall-1', 'wall-2']);
  });

  it('ARM 4 — CALLER PROOF: the two cases produce DIFFERENT sentences for the user', () => {
    // This is the assertion that matters. `summarise` is the shape the chat
    // bridge applies to a batch report. Pre-fix, both inputs below produced the
    // identical string, which is precisely U-INV-4's forbidden collapse.
    function summarise(r: AnyReport): string {
      if (r.outcome === 'indeterminate') {
        return 'could not determine which walls changed';
      }
      return `${r.affectedElementIds.length} wall(s) changed`;
    }

    installCommandManager({ somethingElse: true });
    const unreadable = captureReport(WALL_TYPE_BATCH_REPORT_EVENT, () => {
      UpdateWallsSystemTypeBatchHandler.execute({} as never, { wallIds: 'all', systemTypeId: 't1' } as never);
    })[0]!;

    installCommandManager({ success: true, affectedElementIds: [] });
    const honestlyEmpty = captureReport(WALL_TYPE_BATCH_REPORT_EVENT, () => {
      UpdateWallsSystemTypeBatchHandler.execute({} as never, { wallIds: 'all', systemTypeId: 't1' } as never);
    })[0]!;

    // Both carry affectedElementIds: [] — the ARRAY alone cannot tell them
    // apart, which is exactly why the determination has to travel beside it.
    expect(unreadable.affectedElementIds).toEqual([]);
    expect(honestlyEmpty.affectedElementIds).toEqual([]);

    // And yet the caller now says two different things.
    expect(summarise(unreadable)).not.toBe(summarise(honestlyEmpty));
    expect(summarise(unreadable)).toBe('could not determine which walls changed');
    expect(summarise(honestlyEmpty)).toBe('0 wall(s) changed');
  });
});
