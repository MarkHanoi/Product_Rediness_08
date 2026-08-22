/**
 * §C83-10.6 AT THE GATE — L-942's missing test.
 *
 * ⭐ WHY THIS FILE EXISTS, AND WHY IT IS NOT A DUPLICATE OF THE SEAM TESTS.
 *
 * L-942 shipped BROKEN TWICE. The second time is the one that matters:
 *
 *   deploy `6c676413` threaded the §10.6 junction discriminator through
 *   `WallMoveReweldService` and PROVED THE FOLLOW AT THAT LAYER —
 *   `wallMoveReweldSeam` 11/11, `geometry-wall` 664/664,
 *   `hostedOpeningHostMoveSeam` 9/9, all green. The founder re-tested
 *   production and got the IDENTICAL refusal, because **a user's gesture does
 *   not go through that service.** It goes through
 *   `apps/editor/src/engine/consequence/wallPlacementGate.ts` →
 *   `previewMoveReweld` (`moveReweldPreflight`), and THAT PATH BUILT ITS OWN
 *   PARTNER LIST out of `{ id, baseLine }` alone. `isMutualCorner` read false
 *   on every real move, every mutual corner scored as an incumbent, and the
 *   gate hard-blocked the gesture while every service-layer suite stayed green.
 *
 * ⭐ THE LESSON THIS FILE ENCODES: proving a fix at the layer that COMPUTES is
 * worth NOTHING if the layer that DECIDES keeps its own copy of the inputs.
 * [[committed-is-not-reachable]], three times in one session.
 *
 * So every assertion below is taken on the return value of `gateWallMove` —
 * the function the plan drag and the 3D gizmo drag-end both funnel through —
 * and on the input the gate actually handed the pre-flight. Nothing here calls
 * `WallMoveReweldService`, and nothing here calls `computeMoveReweldPlan`
 * directly. Those two are already proven, and they are exactly what hid this
 * defect for two deploys.
 *
 * ── WHAT IS REAL, STATED SO NOTHING IS OVERCLAIMED ───────────────────────────
 * REAL, imported from production: `gateWallMove` (the gate itself), `WallStore`
 * (geometry-wall), `storeRegistry` + `semanticGraphManager` (core-app-model),
 * and — via the gate's own import — `previewMoveReweld` /
 * `CascadeWallBaselineCommand` / `computeMoveReweldPlan`.
 *
 * The joinedTo edges are seeded through
 * `semanticGraphManager.replaceJoinedToForLevelWalls` — the SAME API the
 * production writer (`WallRebuildCoordinator._flush`) calls, ADR-0321
 * §CONNECT-3. `getJoinedWalls` is NEVER hand-faked: the whole defect was a real
 * call site dropping a real field on the way out of that reader, and a fake
 * reader would have hidden it exactly as the service-layer tests did.
 *
 * The ONE piece of instrumentation is a pass-through spy around
 * `previewMoveReweld` that records the input the gate passed and returns the
 * REAL result unmodified. It replaces no behaviour — it is the only way to
 * observe the `role` stamped on a plan entry from outside, because
 * `WallPlacementGateResult` deliberately carries only the verdict.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted so the `vi.mock` factory below — which is lifted above every import —
// can close over it.
const preflight = vi.hoisted(() => ({
  calls: [] as Array<{
    input: {
      wallId: string;
      joinedWallIds?: readonly string[] | null;
      junctions?: readonly {
        wallId: string;
        junctionType?: string;
        junctionDegree?: number;
      }[] | null;
    };
    result: {
      allowed: boolean;
      ok: boolean;
      incumbentBreach: boolean;
      reason?: string;
      entries: readonly { wallId: string; role?: string }[];
    };
  }>,
}));

// A PASS-THROUGH spy: the real implementation runs, its real result is returned,
// and the call is recorded. Everything else on the barrel is re-exported
// verbatim, so the gate's other imports from this package are untouched.
vi.mock('@pryzm/command-registry', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const real = actual['previewMoveReweld'] as (i: unknown) => unknown;
  return {
    ...actual,
    previewMoveReweld: (input: unknown) => {
      const result = real(input);
      preflight.calls.push({
        input: input as (typeof preflight.calls)[number]['input'],
        result: result as (typeof preflight.calls)[number]['result'],
      });
      return result;
    },
  };
});

import { WallStore, type WallData } from '@pryzm/geometry-wall';
import { ProjectContext, semanticGraphManager, storeRegistry } from '@pryzm/core-app-model';

import { gateWallMove } from '../consequence/wallPlacementGate';

// ── fixture ──────────────────────────────────────────────────────────────────

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

/**
 * The founder's `buildLoop` geometry, byte-for-byte the fixture the §10.6 seam
 * test uses — a 6×4 CLOSED PERIMETER whose corners are 2-wall junctions. The
 * gesture under test is the same one: drag the north wall 2 m outward, which
 * breaks both of its corners and therefore requires a re-weld.
 *
 * ⭐ THE ONLY VARIABLE ACROSS THE THREE ARMS IS THE STORED DISCRIMINATOR. Same
 * walls, same drag, same code path — so each assertion isolates the junction
 * metadata and nothing else, which is §10.6.2's claim: *"the topology separates
 * the two cases by MEASUREMENT, not by naming, intent, or a wall-type flag."*
 */
function seedLoop(
  junctions: ReadonlyArray<{ type?: 'L' | 'T'; wallIds: [string, string] }>,
): void {
  const store = new WallStore(
    new ProjectContext(),
    makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
  );
  store.add(wallRecord('w-south', [0, 0], [6, 0]));
  store.add(wallRecord('w-east', [6, 0], [6, 4]));
  store.add(wallRecord('w-north', [6, 4], [0, 4]));
  store.add(wallRecord('w-west', [0, 4], [0, 0]));
  wallStore = store;

  // THE PRODUCTION SEAM. `wallPlacementGate.readAuthoritativeWalls` and
  // `previewReweldForMove` both read `storeRegistry.getStoreForType('wall')`
  // (ADR-0318 singleton) — not a plugin draft, not an injected context. If this
  // registration is the wrong one, the gate returns `skipped: 'no-wall-store'`
  // and every assertion below would pass vacuously, so the arms assert
  // `skipped` is absent.
  storeRegistry.register('wall', store as never);
  // WallFaceResolver reads this global in production (WallFaceResolver.ts:37).
  Object.assign(window, { wallStore: store });

  semanticGraphManager.replaceJoinedToForLevelWalls(
    ['w-south', 'w-east', 'w-north', 'w-west'],
    junctions.map(j => ({
      ...(j.type ? { junctionType: j.type, junctionDegree: j.type === 'L' ? 2 : 3 } : {}),
      wallIds: j.wallIds,
    })) as unknown as Parameters<typeof semanticGraphManager.replaceJoinedToForLevelWalls>[1],
  );
}

/** The founder's gesture: drag `w-north` 2 m outward, through THE GATE. */
function dragNorthOut() {
  const w = wallStore!.getById('w-north')!;
  return gateWallMove('w-north', [
    { x: w.baseLine[0].x, y: w.baseLine[0].y, z: w.baseLine[0].z + 2 },
    { x: w.baseLine[1].x, y: w.baseLine[1].y, z: w.baseLine[1].z + 2 },
  ]);
}

beforeEach(() => {
  preflight.calls.length = 0;
  semanticGraphManager.clear();
  storeRegistry.unregister('wall');
});

afterEach(() => {
  storeRegistry.unregister('wall');
  semanticGraphManager.clear();
  Object.assign(window, { wallStore: undefined });
  wallStore = undefined;
});

// ════════════════════════════════════════════════════════════════════════════
// ARM 1 — the founder's production refusal, at the layer that produced it
// ════════════════════════════════════════════════════════════════════════════

describe('§C83-10.6 at the GATE — a mutual L/degree-2 corner is NOT blocked', () => {
  /**
   * Pre-`9bb11a4c` this returned `blocked: true`, and the founder's production
   * console said so in as many words:
   *
   *   [wallPlacementGate] blocking wall …: cascade ok=true, incumbentBreach=true
   *
   * The cascade never objected (`ok=true`); the INCUMBENT arm did, because the
   * gate handed the pre-flight partners with no `junctionType` and no
   * `junctionDegree`, so `isMutualCorner` was false and every co-owned corner
   * scored as somebody else's wall to protect.
   */
  it('the gate ALLOWS the move, and the plan it computed stamps the partners `mutual-corner`', () => {
    seedLoop([
      { type: 'L', wallIds: ['w-south', 'w-east'] },
      { type: 'L', wallIds: ['w-east', 'w-north'] },
      { type: 'L', wallIds: ['w-north', 'w-west'] },
      { type: 'L', wallIds: ['w-west', 'w-south'] },
    ]);

    const res = dragNorthOut();

    // THE FOUNDER-LEVEL ASSERTION. Everything else in this test explains WHY;
    // this line is the gesture succeeding.
    expect(res.blocked).toBe(false);
    // …and it succeeded because it was EVALUATED, not because the gate could
    // not find a model to judge against. `skipped` and "clear" are different
    // values and must never be conflated (§CONTEXT-DATA-HONESTY).
    expect(res.skipped).toBeUndefined();
    expect(res.verdict?.valid).toBe(true);

    // ── THE DEFECT'S EXACT SHAPE: the gate FORWARDED the discriminator ───────
    // This is the line 9bb11a4c added. Asserted on the input the GATE built,
    // not on one this test built, because "the gate builds its own partner
    // list" is the entire mechanism of L-942.
    expect(preflight.calls).toHaveLength(1);
    const call = preflight.calls[0]!;
    expect(call.input.wallId).toBe('w-north');
    expect([...(call.input.joinedWallIds ?? [])].sort()).toEqual(['w-east', 'w-west']);
    const east = call.input.junctions?.find(j => j.wallId === 'w-east');
    const west = call.input.junctions?.find(j => j.wallId === 'w-west');
    expect(east).toEqual({ wallId: 'w-east', junctionType: 'L', junctionDegree: 2 });
    expect(west).toEqual({ wallId: 'w-west', junctionType: 'L', junctionDegree: 2 });

    // ── AND THE PLAN CARRIES THE ROLE ───────────────────────────────────────
    // `role` is stamped by `computeMoveReweldPlan`, the only place that
    // measured whose corner this is. Reading it here (rather than re-deriving
    // it) is what proves the discriminator survived the whole trip: gate →
    // preflight → partner list → engine.
    expect(call.result.allowed).toBe(true);
    expect(call.result.incumbentBreach).toBe(false);
    const roles = new Map(call.result.entries.map(e => [e.wallId, e.role]));
    expect(roles.get('w-east')).toBe('mutual-corner');
    expect(roles.get('w-west')).toBe('mutual-corner');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ARM 2 — ⭐ THE L-922 CONTROL, at the gate layer
// ════════════════════════════════════════════════════════════════════════════

describe('§C83-10.6 CONTROL at the GATE — T/degree-3 is DETECTED and REPORTED, no longer refused', () => {
  /**
   * L-922, verbatim: an INTERIOR wall was moved and the cascade shifted the
   * PERIMETER's baseline start ~2.19 m, proven by three hosted doors re-seated
   * by the same delta — one clamped to offset 0.000, §10.2.4's named example of
   * a clamp standing where a refusal belongs.
   *
   * ⚠ THIS ARM WAS INVERTED ON 2026-08-17, AND THE HISTORY MATTERS MORE THAN
   *   THE CURRENT VALUE — read it before flipping it back.
   *
   *   11:10  this arm was written, pinning `blocked === true`. Its own note read:
   *          *"if this test ever goes green by the gate allowing the move, L-942's
   *          fix has become L-922's cause."*
   *   11:34  `b9f9d3b2`, a FOUNDER DECISION, made the incumbent arm REPORT rather
   *          than REFUSE — 24 minutes later. Founder: *"THIS WAS ALL WORKING —
   *          BUT WITH ISSUES … BUT NOW NOTHING WORKS."* The refusal was blocking
   *          every wall move that breaks a junction, and it had shipped without
   *          its escape hatch (C83 §10.6.7).
   *
   * So the sentence above was overtaken by a decision it could not have known
   * about, and this arm sat RED — not because the gate regressed, but because a
   * control outlived its law. The re-scope pins the DECISION, not the symptom:
   * the breach is still detected and still named, and it is now also REPORTED.
   *
   * ⚠ The trade is deliberate and its cost is real: L-922 CAN happen again here.
   * It is Ctrl+Z-able and it is not silent. If you are reverting this arm, you
   * are reverting `b9f9d3b2`, which is the founder's call and not a test edit.
   *
   * ⚠ THE FIXTURE IS BYTE-FOR-BYTE ARM 1's. An earlier control in this family
   * was theatre: it used a mid-span partition, which `classifyWeldAuthorship`
   * calls a `stem` — `isMutualCorner` is never consulted there, so the test
   * passed identically with the discriminator check removed. Varying exactly
   * one thing is what makes this a control rather than a comment that costs CI
   * time.
   */
  it('the gate BLOCKS, on the incumbent arm — same geometry, T/3 instead of L/2', () => {
    seedLoop([
      { type: 'L', wallIds: ['w-south', 'w-east'] },
      { type: 'L', wallIds: ['w-west', 'w-south'] },
      // ⭐ THE ONLY VARIABLE. These two are the junctions w-north's move must
      // re-weld; degree 3 means a third wall has a stake, so neither is
      // w-north's to close.
      { type: 'T', wallIds: ['w-east', 'w-north'] },
      { type: 'T', wallIds: ['w-north', 'w-west'] },
    ]);

    const warns: string[] = [];
    const warnSpy = vi.spyOn(console, 'warn')
      .mockImplementation((...a: unknown[]) => { warns.push(a.map(String).join(' ')); });
    const res = dragNorthOut();
    warnSpy.mockRestore();

    // ── RE-SCOPED 2026-08-17 to `b9f9d3b2` (§L-942-UNBLOCK), a FOUNDER DECISION
    //    taken 24 minutes after this arm was written. ────────────────────────────
    // The gate no longer refuses on `incumbentBreach` (POLICY); it refuses only on
    // `!pre.ok` (geometric impossibility). The founder took that trade knowingly —
    // a known, visible, Ctrl+Z-able over-follow, against a hard stop on the single
    // most common gesture in a BIM tool. The commit states the re-opening in
    // advance: *"L-922 can happen again."*
    //
    // ⚠ WHAT THIS ARM STILL CONTROLS, and why it is not weaker than before: every
    // assertion below is UNCHANGED. The preflight must still DETECT the breach,
    // still name it, and still propose nothing for the incumbents. Only who ACTS
    // on that detection moved. If the detection itself regresses, this goes red.
    expect(res.blocked).toBe(false);
    expect(res.skipped).toBeUndefined();
    // ⭐ AND THE PASS CAME FROM THE POLICY ARM, NOT FROM A GEOMETRIC ALL-CLEAR.
    // Without this line the test would pass if the re-weld had silently succeeded
    // — a right answer for the wrong reason, which is the failure mode this whole
    // lane exists to stop.
    expect(res.verdict?.valid).toBe(true);

    // ⭐ THE HALF THAT MAKES THE TRADE SAFE. The founder's condition was not "let
    // it through", it was "let it through AND TELL THEM". A permitted breach that
    // says nothing is the L-921 defect wearing L-942's clothes, so the report is
    // pinned here with its numbers — not merely asserted to be non-empty.
    const unblock = warns.find(w => w.includes('§L-942-UNBLOCK'));
    expect(unblock, 'a permitted incumbent breach must not be silent').toBeDefined();
    expect(unblock).toContain('REPORTED, NOT REFUSED');
    expect(unblock).toContain('Ctrl+Z');
    expect(unblock).toContain('2 non-subject wall(s)');

    expect(preflight.calls).toHaveLength(1);
    const call = preflight.calls[0]!;
    expect(call.input.junctions?.find(j => j.wallId === 'w-east'))
      .toEqual({ wallId: 'w-east', junctionType: 'T', junctionDegree: 3 });
    expect(call.result.allowed).toBe(false);
    expect(call.result.incumbentBreach).toBe(true);
    // The refusal names itself (§REFUSAL-IDENTITY) — a blocked gate with no
    // reason is indistinguishable from a gate that crashed.
    expect(call.result.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
    // Nothing was proposed for the incumbents.
    expect(call.result.entries.some(e => e.wallId === 'w-east')).toBe(false);
    expect(call.result.entries.some(e => e.wallId === 'w-west')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ARM 3 — ABSENT METADATA TAKES THE PRE-§10.6 BRANCH, VERBATIM
// ════════════════════════════════════════════════════════════════════════════

describe('§C83-10.6.3 #1 at the GATE — absent discriminator does NOT follow', () => {
  /**
   * §10.6.3 #1 and C70 L-INV-1: a missing discriminator is *"I could not
   * determine"*, never *"L"*. This is the state a real project sits in whenever
   * the joinedTo writer has not yet flushed over the level — so it is not a
   * hypothetical, it is the first few seconds of every session.
   *
   * ⚠ THIS IS THE ARM THAT WOULD FAIL SILENTLY IF ABSENCE WERE READ AS
   * PERMISSION — the "empty means unknown" collision this programme exists to
   * abolish, pointed at wall authority. And it is the arm most at risk from a
   * well-meaning fix to arm 1: defaulting `junctionType ?? 'L'` anywhere on the
   * path would turn every unflushed project into an authority to move
   * incumbents.
   */
  it('the gate BLOCKS when the walls are joined but no junctionType/Degree is stamped', () => {
    // The walls ARE joined — the graph is told so — but with NO junctionType
    // and NO junctionDegree on any edge.
    seedLoop([
      { wallIds: ['w-south', 'w-east'] },
      { wallIds: ['w-east', 'w-north'] },
      { wallIds: ['w-north', 'w-west'] },
      { wallIds: ['w-west', 'w-south'] },
    ]);

    const res = dragNorthOut();

    // ── RE-SCOPED 2026-08-17 to `b9f9d3b2`, exactly as the T/3 arm above, and for
    //    the same reason: the gate stopped refusing on POLICY. ──────────────────
    // ⚠ ONLY THIS LINE MOVED. Everything below is the §10.6.3 #1 control proper —
    // *a missing discriminator is "I could not determine", never "L"* — and it is
    // deliberately left exactly as written. `b9f9d3b2` changed who ACTS on the
    // breach; it did not license reading absence as permission. If the assertions
    // below now fail, that is NOT this decision: it is the open §10.6.3 #1-vs-#2
    // question (does an absent discriminator get MEASURED and followed?), which is
    // a C83 amendment for the founder, not something to settle by editing a test.
    //
    // ══════════════════════════════════════════════════════════════════════════
    // ⚠⚠ THE PARAGRAPH ABOVE IS WRONG, AND IS KEPT VERBATIM BECAUSE **HOW** IT IS
    //    WRONG IS THE FINDING (lane WALL8, 2026-08-22 · ISSUE-LOG L-4110).
    // ══════════════════════════════════════════════════════════════════════════
    // *"the OPEN §10.6.3 #1-vs-#2 question … a C83 amendment for the founder"* —
    // **it was not open.** The founder answered it in `55a2eda3`, 2026-08-17
    // **11:53**, quoting his own report in the commit body and amending C83
    // §10.6.3 #1 in the same commit: **ABSENT ⇒ MEASURE the degree, and follow at
    // 2.** The re-scope note above was written against `b9f9d3b2` (11:34) and
    // missed the decision that landed **nineteen minutes later** — the SAME
    // one-commit blindness it was itself correcting one arm up, one commit apart.
    //
    // ⭐ WHY THIS ARM IS STILL RED AND IS DELIBERATELY NOT GREENED HERE. Three
    // assertions below implement the SUPERSEDED rule. Re-scoping a founder control
    // is a founder decision — `b9f9d3b2`'s own note says so — and this lane will
    // not make it by editing the file, which is exactly what the ARM 2 note above
    // forbids. What the lane CAN do is remove the excuse for leaving it red: the
    // question is closed, the contract now says so in ONE voice (C83 §10.6.5's
    // third bullet said the opposite of §10.6.3 for five days — corrected in
    // place), and the values are measured rather than guessed.
    //
    // MEASURED 2026-08-22 on THIS fixture, off the real `previewMoveReweld`
    // return, with these three assertions temporarily removed so the run reached
    // the end:
    //   allowed = true · incumbentBreach = false · reason = undefined
    //   entries = [{ w-east: 'mutual-corner' }, { w-west: 'mutual-corner' }]
    // and, in the SAME run, the byte-identical T/degree-3 fixture (ARM 2):
    //   allowed = false · incumbentBreach = true ·
    //   reason = 'INCUMBENT_EXTENSION_REQUIRED' · entries = []
    // ⇒ **the L-922 guard is intact.** The three lines below are measuring a rule
    // the founder replaced, not a regression.
    //
    // TO CLOSE THIS ARM (founder's call, both ways stated plainly):
    //  · CONFIRM the amendment ⇒ re-scope the three lines to `allowed=true`,
    //    `incumbentBreach=false`, and roles `mutual-corner` — and KEEP every other
    //    assertion, because "the partners resolved from the graph" and "no
    //    junctionType/Degree was stamped" are still the things that make this a
    //    control rather than a copy of ARM 1.
    //  · REVERSE it ⇒ revert `55a2eda3`, and accept the report it was made for:
    //    a perimeter wall dragged PAST a neighbour's far end cannot close its
    //    corner on any gesture, because production `joinedTo` edges frequently
    //    carry no discriminator at all.
    // ⛔ There is no third option in which this file is edited to green without
    // one of those two happening first.
    expect(res.blocked).toBe(false);
    expect(res.skipped).toBeUndefined();
    expect(res.verdict?.valid).toBe(true);

    expect(preflight.calls).toHaveLength(1);
    const call = preflight.calls[0]!;
    // The partners ARE resolved — this is not the level-scan fallback, it is a
    // real graph answer with an unreadable discriminator.
    expect([...(call.input.joinedWallIds ?? [])].sort()).toEqual(['w-east', 'w-west']);
    for (const j of call.input.junctions ?? []) {
      expect(j.junctionType).toBeUndefined();
      expect(j.junctionDegree).toBeUndefined();
    }
    expect(call.result.allowed).toBe(false);
    expect(call.result.incumbentBreach).toBe(true);
    // No entry stamped `mutual-corner` anywhere — absence never authorised a
    // follow.
    expect(call.result.entries.some(e => e.role === 'mutual-corner')).toBe(false);
  });
});
