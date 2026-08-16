// @vitest-environment happy-dom
//
// §MEASURED-SLAB-HALF-EXECUTED (ISSUE-LOG L-921 residue) — the STORED position
// of a wall whose slab-loop weld refuses.
//
// ## THE DEFECT, IN ONE SENTENCE
//
// `SlabWallConnectivityService.onWallUpdated` is a store SUBSCRIBER. It runs
// INSIDE the write it is reacting to, so when its `WELD_COLLAPSES_PARTNER` arm
// fires, **the wall has already moved**. The service refuses the CASCADE — the
// partners are correctly left alone — but nothing refuses the MOVE. The user is
// told the move "cannot be completed" while looking at a wall that completed it.
//
// C78 U-INV-9 is "one gesture, one undo". A gesture that half-applies, knows it,
// and reports the half it did NOT do as though it were the whole thing is the
// same defect L-921 closed on the junction path, one subscriber over.
//
// ## WHAT THIS FILE ASSERTS, AND WHY IT IS NOT A FUNCTION RETURN
//
// The standing discipline here is that a committed fix is not a reachable fix.
// So this file asserts on **the wall's baseline as it stands in the store** after
// the whole gesture has run — never on what a predicate returned. It drives the
// real chain the founder's drag drives:
//
//     gateWallMove(wallId, newBaseLine)        ← the ONE chokepoint the 3D gizmo
//       → (caller dispatches iff !blocked)        and the plan drag both use
//         → REAL UpdateWallBaselineCommand through a REAL CommandManager
//           → REAL WallStore.update emits 'update' with prevState
//             → REAL SlabWallConnectivityService.onWallUpdated
//               → REAL CascadeWallBaselineCommand
//
// `dragWall()` below is the caller contract in three lines: ask the gate, and
// dispatch only if it says you may. That IS how `MovePlanToolHandler` and the
// gizmo drag-end behave, and it is why the gate is the right place to fix this —
// neither gesture needs its own wiring and the two cannot drift apart.
//
// ## THE FIXTURE, AND WHY EVERY NUMBER IS WHERE IT IS
//
// The founder's 6×4 perimeter loop with a region-traced slab, the same one
// `packages/command-registry/__tests__/slabWeldRefusalSurface.test.ts` uses:
//
//     w-south (0,0)→(6,0)   w-east (6,0)→(6,4)
//     w-north (6,4)→(0,4)   w-west (0,4)→(0,0)
//
// `w-west` is dragged to x = 6.05 — 50 mm PAST the far end of both walls it
// shares a slab corner with. Closing either corner would leave a 50 mm stub,
// under the 100 mm floor `CascadeWallBaselineCommand` enforces as
// `WALL_TOO_SHORT`. Both numbers are in the refusal; that is the point of it.
//
// ⚠ THE `joinedTo` GRAPH IS DELIBERATELY EMPTY, and this is load-bearing.
// A wall move is judged by TWO independent pre-flights: `previewMoveReweld`
// (junction partners, from the semantic graph) and `previewSlabConnectivityWeld`
// (slab-loop corner neighbours, from the slab sketch). They weld DIFFERENT
// neighbour sets. With the L junctions declared, the junction pre-flight refuses
// this move first — `INCUMBENT_EXTENSION_REQUIRED`, and the slab arm is never
// reached, so the suite would pass while measuring the wrong gate. Cleared, the
// graph answers a POSITIVE "joins nothing" and the SLAB arm is the only thing
// that can refuse. That models a "By Pick Walls" slab whose walls have not been
// junction-resolved, which is exactly the path this service exists for.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import {
  SlabStore,
  SlabWallConnectivityService,
  traceRegionSketchAtPoint,
  type RegionWallLike,
  type SlabData,
  type SlabSketch,
  type SlabWeldRefusal,
} from '@pryzm/geometry-slab';
import {
  ProjectContext,
  semanticGraphManager,
  storeRegistry,
} from '@pryzm/core-app-model';
import { CommandManager } from '@pryzm/command-registry';
import { UpdateWallBaselineCommand } from '@pryzm/command-registry';
import { gateWallMove } from '@app/engine/consequence/wallPlacementGate';
import {
  registerChatPromptHost,
  __resetChatPromptHost,
} from '@app/ui/ai/chatPromptHost';
import { __resetWallMoveClashState } from '@app/ui/ai/WallMoveClashProposal';

const LEVEL = 'L0';
/** Where w-west stands. */
const PARKED_X = 0;
/** 50 mm past both partners' far ends ⇒ two 50 mm stubs ⇒ under the 100 mm floor. */
const DRAG_X = 6.05;

let seq = 0;

function wallRecord(id: string, s: [number, number], e: [number, number]): WallData {
  return {
    id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
    baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
    height: 3, thickness: 0.2, baseOffset: 0, openings: [],
    metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'test', version: 1 },
  } as unknown as WallData;
}

function makeLevelProvider() {
  const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
  return {
    getLevelById: (id: string) => (id === LEVEL ? { ...level } : undefined),
    getLevels: () => [{ ...level }],
  };
}

interface World {
  wallStore: WallStore;
  slabStore: SlabStore;
  cm: CommandManager;
  /** Everything the injected sink was told — the production sink calls `chatSay`. */
  refusals: SlabWeldRefusal[];
  said: string[];
  dispose(): void;
}

function makeWorld(): World {
  const wallStore = new WallStore(
    new ProjectContext(),
    makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
  );
  const slabStore = new SlabStore();
  const cm = new CommandManager({
    stores: { wallStore, slabStore },
    bimManager: {
      getLevels: () => [{ id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] }],
      getLevelById: (id: string) =>
        (id === LEVEL
          ? { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] }
          : undefined),
      registerElement: () => { /* no registry in this harness */ },
      unregisterElement: () => { /* no registry in this harness */ },
    },
  } as never);

  // `WallFaceResolver` reads `window.wallStore` on the SUBSCRIBER path (the
  // pre-flight passes its own shim instead). Both must see the same walls.
  Object.assign(window, { wallStore });

  // The gate reads BOTH stores through the ADR-0318 registry singletons, which
  // is how it reaches them in production too — no test-only accessor.
  storeRegistry.register('wall', wallStore as never);
  storeRegistry.register('slab', slabStore as never);

  const refusals: SlabWeldRefusal[] = [];
  const said: string[] = [];
  const unregisterChat = registerChatPromptHost({
    say: (t) => { said.push(t); },
    confirm: () => Promise.resolve(false),
    isReady: () => true,
  });

  const svc = new SlabWallConnectivityService(
    slabStore,
    wallStore as unknown as ConstructorParameters<typeof SlabWallConnectivityService>[1],
    () => false,
    cm as never,
    // The production sink, verbatim (`engineLauncher.ts`): one channel, the chat.
    (r) => { refusals.push(r); said.push(r.sentence); },
  );
  svc.bootstrap();

  return {
    wallStore, slabStore, cm, refusals, said,
    dispose() {
      svc.dispose();
      unregisterChat();
      Object.assign(window, { wallStore: undefined });
    },
  };
}

function buildLoop(world: World): void {
  world.wallStore.add(wallRecord('w-south', [0, 0], [6, 0]));
  world.wallStore.add(wallRecord('w-east', [6, 0], [6, 4]));
  world.wallStore.add(wallRecord('w-north', [6, 4], [0, 4]));
  world.wallStore.add(wallRecord('w-west', [0, 4], [0, 0]));
  const rw: RegionWallLike[] = world.wallStore.getAll()
    .map(w => ({ id: w.id, baseLine: w.baseLine.map(p => ({ x: p.x, z: p.z })) }));
  const traced = traceRegionSketchAtPoint(rw, 3, 2)!;
  expect(traced, 'the fixture must produce a closed region sketch').not.toBeNull();
  world.slabStore.add({
    id: 'slab-loop', type: 'slab', levelId: LEVEL, thickness: 0.2,
    position: { x: 0, y: 0, z: 0 }, polygon: traced.ring, sketch: traced.sketch as SlabSketch,
    ifcData: { guid: 'g', ifcClass: 'IfcSlab' },
  } as unknown as SlabData);
  // See the header: the junction graph stays EMPTY so the SLAB arm is the only
  // thing that can refuse this move.
  semanticGraphManager.clear();
}

/**
 * THE CALLER CONTRACT, in three lines — ask the gate, dispatch iff it allows.
 * This is what `MovePlanToolHandler` and the 3D gizmo drag-end do, and it is the
 * reason a PRE-move gate is the fix: neither gesture grows its own wiring.
 */
function dragWall(world: World, id: string, toX: number) {
  const w = world.wallStore.getById(id)!;
  const newBaseLine = [
    { x: toX, y: w.baseLine[0].y, z: w.baseLine[0].z },
    { x: toX, y: w.baseLine[1].y, z: w.baseLine[1].z },
  ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];

  const gate = gateWallMove(id, newBaseLine);
  if (gate.blocked) return { gate, dispatched: false as const, result: undefined };

  const result = world.cm.execute(
    new UpdateWallBaselineCommand({ wallId: id, newBaseLine }) as never,
  ) as { success: boolean };
  return { gate, dispatched: true as const, result };
}

const xOf = (world: World, id: string): number => world.wallStore.getById(id)!.baseLine[0].x;
const bl2 = (world: World, id: string): [number, number][] => {
  const b = world.wallStore.getById(id)!.baseLine;
  return [[b[0].x, b[0].z], [b[1].x, b[1].z]];
};

let world: World | undefined;

beforeEach(() => {
  __resetChatPromptHost();
  __resetWallMoveClashState();
  semanticGraphManager.clear();
  const g = globalThis as unknown as {
    __pryzmL925Refusals?: number; __pryzmL925Unsurfaced?: number;
  };
  g.__pryzmL925Refusals = 0;
  g.__pryzmL925Unsurfaced = 0;
});

afterEach(() => {
  world?.dispose();
  world = undefined;
});

describe('§MEASURED-SLAB-HALF-EXECUTED (L-921 residue) — a refused slab weld must not leave the wall moved', () => {
  it('THE STORED POSITION: a move whose slab-loop weld collapses a partner leaves the wall where it was', () => {
    world = makeWorld();
    buildLoop(world);

    const westBefore = bl2(world, 'w-west');
    const southBefore = bl2(world, 'w-south');
    const northBefore = bl2(world, 'w-north');
    expect(xOf(world, 'w-west')).toBe(PARKED_X);

    const run = dragWall(world, 'w-west', DRAG_X);

    // ── THE ASSERTION THIS FILE EXISTS FOR ───────────────────────────────────
    // Not "the predicate returned false". The wall's BASELINE, in the store,
    // after the whole gesture has run. Before the fix this read 6.05 — the wall
    // stood at the position the system had just told the user it could not
    // occupy. C78 U-INV-9: one gesture, one undo; never half of one.
    expect(
      xOf(world, 'w-west'),
      'the wall must stand where it started — a refused move may not half-apply',
    ).toBe(PARKED_X);
    expect(bl2(world, 'w-west')).toEqual(westBefore);

    // The gate is what makes that true, and it must say so rather than letting
    // the caller find out by inspecting the model.
    expect(run.gate.blocked, 'the gate must refuse BEFORE the command is built').toBe(true);
    expect(run.dispatched, 'nothing may be dispatched for a refused gesture').toBe(false);

    // ── AND THE PARTNERS ARE UNTOUCHED TOO ───────────────────────────────────
    // Atomic means atomic: not the subject, not the incumbents.
    expect(bl2(world, 'w-south')).toEqual(southBefore);
    expect(bl2(world, 'w-north')).toEqual(northBefore);
  }, 30000);

  it('THE REFUSAL REACHES A PERSON, carrying its identity and BOTH numbers', () => {
    world = makeWorld();
    buildLoop(world);

    const run = dragWall(world, 'w-west', DRAG_X);
    expect(run.gate.blocked).toBe(true);

    // Silence is the one forbidden outcome. `surfaced` is DATA, so the absence
    // of a surface is assertable rather than something a human has to notice.
    expect(run.gate.surfaced, 'a refusal that reaches nobody is the same defect facing the other way')
      .toBe(true);

    const transcript = world.said.join('\n');
    // §REFUSAL-IDENTITY — the code lives INSIDE the prose, so a sink that takes
    // only a string cannot lose it.
    expect(transcript).toContain('WELD_COLLAPSES_PARTNER');
    // BOTH numbers: what the wall would become, and the floor that forbids it.
    expect(transcript).toMatch(/50 mm/);
    expect(transcript).toMatch(/100 mm/);
    // It names the walls it is talking about.
    expect(transcript).toMatch(/w-south|w-north/);
    // And it is truthful about the state it refused in: nothing moved, so it
    // may say so. (The post-move backstop says the OPPOSITE — see the
    // `alreadyMoved` arm of `collapseSentence` — because by then it is true.)
    expect(transcript).toContain('Nothing was changed');
    expect(transcript).not.toContain('is now OPEN');
  }, 30000);

  it('a slab-loop move that welds CLEANLY is still allowed — the gate refuses the refusable, not the unfamiliar', () => {
    // The other terminal state, asserted so a later regression cannot "fix" the
    // one above by refusing every move that touches a slab. x = 5 leaves both
    // partners 5.0 m and 1.0 m long: far above the floor, so the weld is legal
    // and the gesture must complete.
    world = makeWorld();
    buildLoop(world);

    const run = dragWall(world, 'w-west', 5);

    expect(run.gate.blocked, 'a legal weld must not be refused').toBe(false);
    expect(run.dispatched).toBe(true);
    expect(run.result!.success).toBe(true);
    expect(xOf(world, 'w-west')).toBe(5);
    // …and no refusal was raised on either side of the seam.
    expect(world.refusals).toHaveLength(0);
    const g = globalThis as unknown as { __pryzmL925Refusals?: number };
    expect(g.__pryzmL925Refusals).toBe(0);
  }, 30000);
});
