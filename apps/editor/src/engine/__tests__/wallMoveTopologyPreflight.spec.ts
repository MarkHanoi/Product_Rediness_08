/**
 * §WALL-TOPOLOGY-PREFLIGHT (ISSUE-LOG L-4700..L-4706) — THE DETECTOR THAT NAMED
 * THE CULPRIT AND LET IT STAND.
 *
 * ── THE REPORT ───────────────────────────────────────────────────────────────
 * Founder, 2026-08-22, on a 3,700-element model:
 *   *"after trying just to create a wall: a big envelope was created (WHICH IS
 *    WRONG!!) — why? fix"*
 *
 * He believed he was DRAWING a wall. He grabbed an existing one and dragged it
 * fifty-five metres, and it committed:
 *
 *     [PlanDrag] wall drag started: wall_01M0CVY0R49KYHFV3XZZ51P4YV
 *     [CommandManager] EXECUTE: UPDATE_WALL_BASELINE  elapsed=21.5ms
 *     [PlanDrag] Wall committed  Δ( -55.000 , -20.700 )
 *
 * The system SAW the damage, attributed it correctly, and did nothing:
 *
 *     [WallTopologyIntegrity] §WALL-TOPOLOGY-CORRUPT level='L0' — 1 finding(s)
 *       across 45 wall(s) [BODY_CROSSING×1]
 *     §WALL-TOPOLOGY-ATTRIBUTION: 1 of these 1 finding(s) were CREATED by this
 *       gesture; 0 were ALREADY STANDING
 *
 * ⭐ A DETECTOR WITH NO CONSEQUENCE — `refusing-half-needs-its-escape-hatch`
 * INVERTED. The audit was wired into `WallMoveReweldService`, a STORE
 * SUBSCRIBER: by the time it speaks the wall has moved. So the one derivation
 * able to answer *"did THIS gesture do it?"* lived where it could no longer act,
 * and it spoke only to `console`.
 *
 * ── WHAT THESE ARMS PIN, AND WHY EACH ONE EXISTS ─────────────────────────────
 * ARM 1  THE FOUNDER'S GESTURE. A 55 m drag that sweeps an existing wall through
 *        a partition: the gate now REPORTS the created BODY_CROSSING, with both
 *        C83 §10.3 numbers, BEFORE the dispatch, and TO THE USER.
 * ARM 2  ⛔ THE CONTROL THAT MAKES ARM 1 MEAN ANYTHING, and the one the
 *        coordinator's constraint is about: the IDENTICAL 55 m drag into CLEAR
 *        space reports NOTHING. **The discriminator is the finding, never the
 *        number.** Delete the topology diff and keep a distance threshold and
 *        this arm goes red — which is exactly what should happen.
 * ARM 3  A finding that was ALREADY STANDING is never attributed to this
 *        gesture. Without this the founder would be shown the same crossing
 *        forever, on every later drag, with no way to tell which one caused it —
 *        and a wall near a pre-existing defect would become unmovable the day
 *        the report becomes a refusal.
 * ARM 4  `blocked` is UNCHANGED on every input. Re-blocking the core gesture is
 *        the L-942 disaster and it is not this lane's to repeat; if a future
 *        lane flips it, this arm makes that a deliberate act rather than a
 *        side effect.
 *
 * ── WHAT IS REAL ─────────────────────────────────────────────────────────────
 * `gateWallMove` (the function the plan drag and the 3D gizmo drag-end both
 * funnel through), `WallStore` (geometry-wall), `storeRegistry`
 * (core-app-model), and the REAL `chatPromptHost` — the message is captured by
 * registering a host through `registerChatPromptHost`, the same API
 * `createAIPanel` uses in production, rather than by mocking the module.
 * Nothing here calls `auditWallTopology` directly to build an expectation: every
 * assertion is on `gateWallMove`'s return value or on what reached the host,
 * which is the L-942 lesson (*proving a fix at the layer that COMPUTES is worth
 * nothing if the layer that DECIDES keeps its own copy*).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore, type WallData } from '@pryzm/geometry-wall';
import { ProjectContext, semanticGraphManager, storeRegistry } from '@pryzm/core-app-model';
import { registerChatPromptHost, __resetChatPromptHost } from '@app/ui/ai/chatPromptHost';

import { gateWallMove } from '../consequence/wallPlacementGate';

const LEVEL = 'L0';

function makeLevelProvider() {
  const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
  return {
    getLevelById: (id: string) => (id === LEVEL ? { ...level } : undefined),
    getLevels: () => [{ ...level }],
  };
}

let seq = 0;
function wallRecord(id: string, s: [number, number], e: [number, number], thickness = 0.2): WallData {
  return {
    id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
    baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
    height: 3, thickness, baseOffset: 0, openings: [],
    metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'test', version: 1 },
  } as unknown as WallData;
}

let wallStore: WallStore | undefined;
let said: string[] = [];
let unregisterHost: (() => void) | undefined;

/**
 * `w-part` is added FIRST so the audit's ordered-pair scan sees it as the guest —
 * the arms assert on the PAIR rather than on which side of it, but the fixed
 * order keeps ARM 3's finding IDENTITY stable across its two audits, which is
 * the whole subject of that arm.
 */
function seed(subjectStart: [number, number], subjectEnd: [number, number]): void {
  const store = new WallStore(
    new ProjectContext(),
    makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
  );
  store.add(wallRecord('w-part', [0, -5], [0, 5]));
  store.add(wallRecord('w-sub', subjectStart, subjectEnd));
  wallStore = store;
  // THE PRODUCTION SEAM — `readAuthoritativeWalls` reads exactly this registry
  // (ADR-0318 singleton). A wrong registration yields `skipped: 'no-wall-store'`
  // and every arm below would pass vacuously, so each asserts `skipped` is absent.
  storeRegistry.register('wall', store as never);
  Object.assign(window, { wallStore: store });
}

/** Drag `w-sub` by (dx, dz), through THE GATE. */
function drag(dx: number, dz: number) {
  const w = wallStore!.getById('w-sub')!;
  return gateWallMove('w-sub', [
    { x: w.baseLine[0].x + dx, y: w.baseLine[0].y, z: w.baseLine[0].z + dz },
    { x: w.baseLine[1].x + dx, y: w.baseLine[1].y, z: w.baseLine[1].z + dz },
  ]);
}

beforeEach(() => {
  said = [];
  semanticGraphManager.clear();
  storeRegistry.unregister('wall');
  __resetChatPromptHost();
  unregisterHost = registerChatPromptHost({
    say: (t: string) => { said.push(t); },
    confirm: async () => false,
    isReady: () => true,
  });
});

afterEach(() => {
  unregisterHost?.();
  unregisterHost = undefined;
  __resetChatPromptHost();
  storeRegistry.unregister('wall');
  semanticGraphManager.clear();
  Object.assign(window, { wallStore: undefined });
  wallStore = undefined;
});

/** `chatSay` is fired through `Promise.resolve().then(...)` so the gate's verdict
 *  is returned before the transcript is touched — drain the microtask queue. */
const settle = (): Promise<void> => Promise.resolve().then(() => undefined);

// ════════════════════════════════════════════════════════════════════════════
// ARM 1 — the founder's gesture, at the layer that let it through
// ════════════════════════════════════════════════════════════════════════════

describe('§WALL-TOPOLOGY-PREFLIGHT — a move that CREATES a body-crossing is reported BEFORE it dispatches', () => {
  it('names the crossing with both numbers, and tells the user it moved an existing wall', async () => {
    // `w-sub` starts 55 m north of the partition, exactly as the founder's wall
    // stood 55 m from where he dropped it.
    seed([-5, 55], [5, 55]);

    const res = drag(0, -55);           // Δ( 0, -55.000 ) — his Δ( -55.000, -20.700 )
    await settle();

    // ── IT WAS EVALUATED, not skipped. `skipped` and "clear" are different
    //    values and must never be conflated (§CONTEXT-DATA-HONESTY).
    expect(res.skipped).toBeUndefined();
    expect(res.verdict?.valid).toBe(true);

    // ⭐ THE FOUNDER-LEVEL ASSERTION: the gesture no longer passes in silence.
    expect(res.createdTopology).toBeDefined();
    expect(res.createdTopology!.length).toBe(1);
    const sentence = res.createdTopology![0]!;
    expect(sentence).toContain('BODY_CROSSING');
    // Both walls named, and BOTH C83 §10.3 numbers present — a report carrying
    // one number is the defect that clause exists for.
    expect(sentence).toContain('w-part');
    expect(sentence).toContain('w-sub');
    expect(sentence).toMatch(/shortest stranded stub is \d+ mm against a \d+ mm end-cap reach/);

    // ⭐ AND IT REACHED A PERSON. `console.error` is not a user-facing message —
    // that is this module's own opening lesson, and it is what the audit did for
    // its whole life.
    expect(said.length).toBeGreaterThan(0);
    const msg = said.join('\n');
    // The half of "why?" no topology finding can carry: he thought he was
    // drawing a wall.
    expect(msg).toContain('MOVED an existing wall');
    expect(msg).toContain('55.0 m');
    expect(msg).toContain('BODY_CROSSING');
    expect(msg).toContain('Ctrl+Z');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ARM 2 — ⛔ THE CONTROL: the discriminator is the FINDING, never the NUMBER
// ════════════════════════════════════════════════════════════════════════════

describe('§WALL-TOPOLOGY-PREFLIGHT CONTROL — an identical 55 m move through CLEAR space says nothing', () => {
  /**
   * The coordinator's constraint, made executable: *"Do NOT block legitimate
   * large moves. Moving a façade 55 m is legal on a real site."*
   *
   * ⚠ THE ONLY VARIABLE ACROSS ARMS 1 AND 2 IS THE DIRECTION. Same wall, same
   * fixture, same 55 m magnitude. If anyone ever replaces the topology diff with
   * a distance threshold, ARM 1 keeps passing and THIS arm goes red — which is
   * the entire reason it is a control and not a comment that costs CI time.
   */
  it('reports nothing, and the result carries no createdTopology at all', async () => {
    seed([-5, 55], [5, 55]);

    const res = drag(0, +55);           // 55 m the OTHER way — into open ground
    await settle();

    expect(res.skipped).toBeUndefined();
    expect(res.verdict?.valid).toBe(true);
    // ABSENT, not empty: the field is omitted when there is nothing to say, so a
    // consumer cannot mistake "asked, clean" for "reported zero things".
    expect(res.createdTopology).toBeUndefined();
    expect(said).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ARM 3 — an ALREADY-STANDING finding is not this gesture's
// ════════════════════════════════════════════════════════════════════════════

describe('§WALL-TOPOLOGY-PREFLIGHT — a pre-existing crossing is never attributed to the drag', () => {
  /**
   * §L-990's rule, one subsystem over: *"refusing it would make this wall
   * unmovable without fixing anything."* The same holds for reporting — a
   * finding shown on every subsequent gesture is a finding the reader stops
   * reading, and it is the exact state the before/after split exists to prevent.
   */
  it('slides a wall that ALREADY crosses the partition along its own axis, and says nothing', async () => {
    seed([-5, 0], [5, 0]);              // ALREADY crossing `w-part` at (0,0)

    const res = drag(1, 0);             // still crossing, at the same point
    await settle();

    expect(res.skipped).toBeUndefined();
    // The crossing is real and the audit still finds it — it is simply not NEW,
    // and `created` is the only half this arm reports on.
    expect(res.createdTopology).toBeUndefined();
    expect(said).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ARM 4 — ⛔ `blocked` IS UNCHANGED. Flipping it is a founder decision.
// ════════════════════════════════════════════════════════════════════════════

describe('§WALL-TOPOLOGY-PREFLIGHT — REPORTED, NOT REFUSED', () => {
  /**
   * Three measured reasons this arm does not refuse, in decreasing order of
   * force — the full argument is at the call site in `wallPlacementGate.ts`:
   *
   *  1. `BODY_CROSSING`'s OWN doc-comment records that it *"will also report a
   *     deliberately-authored X where two walls genuinely cross"*, and that
   *     separating the two *"needs the junction INDEX, which is not reachable
   *     from this layer."* Hard-refusing on a predicate whose author wrote down
   *     that it cannot tell corruption from a legal X would block authored X
   *     junctions outright.
   *  2. A two-step edit — move A across B, then move B — passes through exactly
   *     this state. Refusing step 1 makes the pair impossible.
   *  3. L-942 shipped a refusal on THIS gate and it cost four deploys:
   *     *"THIS WAS ALL WORKING — BUT WITH ISSUES … BUT NOW NOTHING WORKS."*
   *
   * ⚠ IF YOU ARE MAKING THIS REFUSE, you are answering a C83 §10.2 IMPOSSIBLE-vs-
   * INADVISABLE question that belongs to the founder, and the predicate is one
   * branch: `topology.created.some(f => f.kind === 'BODY_CROSSING')`. Change
   * this arm deliberately, with that decision in hand — do not let it flip as a
   * side effect.
   */
  it('the gate ALLOWS the corrupting move — the report is the consequence, not a block', async () => {
    seed([-5, 55], [5, 55]);

    const res = drag(0, -55);
    await settle();

    expect(res.blocked).toBe(false);
    expect(res.refusalReason).toBeUndefined();
    // …and it allowed it having ACTUALLY LOOKED, which is what stops this test
    // passing for the wrong reason if the probe silently stops running.
    expect(res.createdTopology?.length).toBe(1);
  });
});
