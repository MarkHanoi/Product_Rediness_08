// @vitest-environment happy-dom
//
// (Required. `apps/editor/vitest.config.ts` runs `node` by default because other
//  suites assert node-shaped behaviour; this one drives the gate, which reaches
//  `chatSay` and `document`. Without the docblock the file dies at COLLECTION on
//  `ConstraintEngine.ts:113` — `window is not defined` — and reports 'no tests',
//  which is the shape of a suite that measures nothing while looking red.)
/**
 * §L-992 / §L-991 — the founder's `— undefined`, and the sentence that named no
 * candidate, MEASURED AT THE LAYER THEY EXPERIENCED THEM.
 *
 * ── THE REPORT (production, 2026-08-18) ──────────────────────────────────────
 * Their console, on a refused wall drag:
 *
 *   [WallTransform] §C83-S1-MOVE REFUSED wall.updateBaseline — undefined
 *
 * A refusal whose reason is literally `undefined` is a false report — the same
 * class as L-966's fabricated "retries exhausted". The reason was never missing:
 * `gateWallMove` has FIVE blocking arms, and on three of them (`!pre.ok`, the
 * slab refusal, the slab UNDETERMINED arm) the `verdict` is a **VALID** verdict
 * carrying no `reason` at all — the wall's OWN placement was clear and the
 * refusal came from the cascade. The two log sites read `verdict?.reason`, so
 * they printed `undefined` BY CONSTRUCTION on exactly the arm the founder hit.
 *
 * ── WHY THIS FILE IS AT THIS LAYER AND NOT AT THE PREDICATE ──────────────────
 * `L990MoveReweldHostIdentity.measure.test.ts` proves the cascade's verdict in
 * `@pryzm/command-registry`. That proves nothing about what a person is told:
 * `refusalReason` is composed in `apps/editor`, and the whole defect is that a
 * correctly-computed reason did not survive the trip. So this drives the REAL
 * `gateWallMove` against a REAL store through `storeRegistry`, with the REAL
 * `semanticGraphManager` supplying the junction, and reads what the gate returns
 * and what the chat is told. §committed-≠-reachable.
 *
 * ── THE FIXTURE, and why every wall in it is load-bearing ────────────────────
 * Lifted from `L990MoveReweldHostIdentity.measure.test.ts` §C, the case where
 * the crossing IS created by the gesture (so the refusal is CORRECT and must
 * stay a refusal — this file must never be "fixed" by making the move succeed):
 *
 *   M  the mover, 0,0 → 10,0.        No openings, and at its NEW pose it is
 *                                    1.5 m clear of H — so `verdict.valid` is
 *                                    TRUE, which is what makes `verdict.reason`
 *                                    undefined and the defect reachable.
 *   S  a stem, 2,0 → 2,4.            Terminates on M's body ⇒ it FOLLOWS M
 *                                    (§L-926 dependent-stem).
 *   H  0,-1 → 10,-1, window 1.5–2.5. S's followed foot is driven through this
 *                                    window by the move. NEW crossing ⇒ the
 *                                    cascade refuses ⇒ the gate blocks on
 *                                    `!pre.ok` ⇒ the founder's arm.
 *
 * @file apps/editor/__tests__/L992MoveRefusalCarriesItsReason.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeRegistry, semanticGraphManager } from '@pryzm/core-app-model';
import type { WallData } from '@pryzm/geometry-wall';
import { gateWallMove } from '@app/engine/consequence/wallPlacementGate';
import {
  registerChatPromptHost,
  __resetChatPromptHost,
} from '@app/ui/ai/chatPromptHost';
import { __resetWallMoveClashState } from '@app/ui/ai/WallMoveClashProposal';

const LEVEL = 'level-0';
const T = 0.243;
const MOVER = 'wall_L992_MOVER';
const STEM = 'wall_L992_STEM';
const HOST = 'wall_L992_HOST';

function wall(
  id: string,
  a: [number, number],
  b: [number, number],
  openings: unknown[] = [],
): WallData {
  return {
    id,
    type: 'wall',
    levelId: LEVEL,
    baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
    height: 3,
    thickness: T,
    childrenIds: [],
    openings,
  } as unknown as WallData;
}

function installRig() {
  const record: Record<string, WallData> = {};
  for (const w of [
    wall(MOVER, [0, 0], [10, 0]),
    wall(STEM, [2, 0], [2, 4]),
    wall(HOST, [0, -1], [10, -1], [{
      id: 'opening_L992',
      type: 'window',
      offset: 1.5,
      width: 1.0,
      height: 1.4,
      sillHeight: 0.9,
      elementId: 'el_L992_WINDOW',
    }]),
  ]) record[w.id] = w;

  const store = {
    getById: (id: string) => record[id],
    getAll: () => Object.values(record),
    getByLevel: (levelId: string) =>
      Object.values(record).filter((w) => w.levelId === levelId),
  };
  storeRegistry.register('wall', store as never);

  // The junction the founder's model would declare: the stem terminates on the
  // mover's body. WITHOUT this the graph answers "joins nothing" — a POSITIVE
  // ok — and the pre-flight correctly concludes there is nothing to re-weld,
  // which would make this arm untestable on a wrong fixture.
  semanticGraphManager.replaceJoinedToForLevelWalls(
    [MOVER, STEM, HOST],
    [{ junctionType: 'T', junctionDegree: 2, wallIds: [MOVER, STEM] }],
  );

  return { store, record };
}

function installHostDouble() {
  const said: string[] = [];
  const unregister = registerChatPromptHost({
    say: (t) => { said.push(t); },
    confirm: () => Promise.resolve(false),
    isReady: () => true,
  });
  return { said, unregister };
}

/** The mover, translated 2.5 m south. */
const MOVED = [{ x: 0, y: 0, z: -2.5 }, { x: 10, y: 0, z: -2.5 }] as
  [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];

beforeEach(() => {
  __resetChatPromptHost();
  __resetWallMoveClashState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('§L-992 — a refused move carries its REAL reason, not `undefined`', () => {
  it('blocks on the CASCADE arm, where the verdict is VALID and reasonless', () => {
    installRig();
    const chat = installHostDouble();

    const gate = gateWallMove(MOVER, MOVED);

    // ── The arm. `verdict.valid === true` is the whole point: the wall's own
    //    placement WAS clear, so `verdict.reason` is undefined and every
    //    caller that read it printed `undefined`. That is the founder's line.
    expect(gate.blocked).toBe(true);
    expect(gate.verdict?.valid).toBe(true);
    expect(gate.verdict?.reason).toBeUndefined();

    // ── §L-992 — AND THE REASON IS THERE ANYWAY, on the field the log sites
    //    now read. Non-empty, and it names the rule that refused.
    expect(typeof gate.refusalReason).toBe('string');
    expect(gate.refusalReason).not.toBe('');
    expect(gate.refusalReason).toContain('OCC_CROSSES_HOSTED_OPENING');

    // ── §L-991 — the sentence NAMES ITS CANDIDATE. Before this lane the
    //    cascade's issue read "this wall cannot be placed here" with no id, so
    //    a refusal about the cascaded STEM read as a refusal about the wall the
    //    user dragged. The stem is named, and so is the wall hosting the window.
    expect(gate.refusalReason).toContain(`${STEM}: `);
    expect(gate.refusalReason).toContain(`on wall ${HOST}`);

    // ── The refusal REACHED A PERSON, and the head no longer claims the
    //    position is clear of every opening without saying whose position.
    expect(gate.surfaced).toBe(true);
    const transcript = chat.said.join('\n');
    expect(transcript).toContain(MOVER);
    expect(transcript).toContain("That wall's own position is clear");
    expect(transcript).toContain('Nothing has changed');
    chat.unregister();
  }, 20000);
});
