// @vitest-environment happy-dom
//
// §FIX-WALL-CURVE-PLAN-VS-3D-CREATION — plan-view curved-wall regression suite.
//
// THE DEFECT (founder, live-tested 2026-08-05): "The curved wall mode works
// correctly in the 3D view. In the 2D PLAN view the curved PREVIEW renders
// correctly while drawing, but on commit the wall comes out as a LINEAR wall."
// The console proved the tool dispatched `mode: curved (curved)` — the loss was
// downstream of the handler's own logging.
//
// ROOT CAUSE (from source — the exact L-239 `layers` defect family, one field over):
//   1. `CreateWallPayload` (plugins/wall/src/handlers/CreateWall.ts) never declared
//      `curve`, and the handler never wrote it into `Wall.parse` — the canonical
//      wall.create chokepoint dropped the arc on the floor, so NO bus-created wall
//      ever carried curvature in the PRYZM3 store.
//   2. CommandEventBridge's 'wall.created' emit did not forward `curve`.
//   3. The initTools §P2.1 bus→legacy-store mirror did not copy `curve`, so the
//      legacy WallStore (which drives BOTH the 3D mesh via WallRebuildCoordinator
//      AND the plan projection) stored the straight chord.
// The 3D tool only *looked* right because it dual-writes through the legacy
// CreateWallCommand, which does stamp `curve` (Contract §03-1.2). The plan tool
// is bus-only, so every drop point was fatal there.
//
// THE FIX: carry the ONE existing curvature representation — the Wall schema's
// `curve: { control, segments }` quadratic-Bézier descriptor — through the
// chokepoint (persisted on the instance), the event bridge, and the mirror.
// No second representation of curvature is introduced.
//
// Contracts: C11 §2/§3.2 (one element ⇒ one creation pipeline), C03 §2 (the
// schema record is canonical), C11 §5.2 (typed domain events relay the COMMIT).

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  attachStores,
  createId,
} from '@pryzm/plugin-sdk';
import { WallStore, buildWallHandlerSet, type WallsState } from '@pryzm/plugin-wall';
import { EventBus, wireCommandEventBridge } from '@pryzm/runtime-composer';

/** The arc the founder drew: start → arc midpoint → end, as WallPlanToolHandler
 *  computes it (`P1 = 2·mid − 0.5·(P0 + P2)` — control so the Bézier passes
 *  through the picked midpoint at t=0.5). */
const CURVE = { control: { x: 2, y: 0, z: 3 }, segments: 16 } as const;
const BASELINE = [
  { x: 0, y: 0, z: 0 },
  { x: 4, y: 0, z: 0 },
] as const;

function buildEnv() {
  const store = new WallStore();
  const stores = { wall: store as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack: new UndoStack({ maxSize: 50 }),
    storesProvider: () => ({ wall: Object.fromEntries(store.getState()) as WallsState }),
  });
  for (const h of buildWallHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  // The PRODUCTION event relay — the same seam initTools §P2.1 subscribes to.
  const events = new EventBus();
  const disposeBridge = wireCommandEventBridge(emitter, events);
  return { store, bus, events, detach, disposeBridge };
}

describe('§FIX-WALL-CURVE-PLAN-VS-3D-CREATION — wall.create chokepoint', () => {
  let env: ReturnType<typeof buildEnv> | undefined;
  afterEach(() => {
    env?.disposeBridge();
    env?.detach();
    env = undefined;
  });

  it('PLAN payload: a curved dispatch PERSISTS curve on the instance (the bug)', async () => {
    env = buildEnv();
    const id = createId('wall');

    // Exactly what WallPlanToolHandler._commitWall dispatches in curved mode.
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [...BASELINE],
      height: 2.7,
      thickness: 0.2,
      curve: CURVE,
    });

    const wall = env.store.get(id)!;
    expect(wall).toBeDefined();
    // THE DEFECT: this used to be `undefined` — the wall committed as its straight chord.
    expect(wall.curve).toBeDefined();
    expect(wall.curve!.control).toEqual(CURVE.control);
    expect(wall.curve!.segments).toBe(CURVE.segments);
  });

  it('PLAN and 3D produce IDENTICAL stored curves for the same arc (the L-213 guard)', async () => {
    env = buildEnv();
    const planId = createId('wall');
    const threeDId = createId('wall');

    // Plan tool: segments 16 (ARC_SEGMENTS in WallPlanToolHandler).
    await env.bus.executeCommand('wall.create', {
      id: planId,
      levelId: 'lvl_test',
      baseLine: [...BASELINE],
      height: 2.7,
      thickness: 0.2,
      curve: CURVE,
    });
    // 3D tool sends the same schema shape (WallTool.createWall stamps
    // `{ control, segments: 24 }`) — same field, same representation.
    await env.bus.executeCommand('wall.create', {
      id: threeDId,
      levelId: 'lvl_test',
      baseLine: [...BASELINE],
      height: 2.7,
      thickness: 0.2,
      curve: CURVE,
    });

    expect(env.store.get(planId)!.curve).toEqual(env.store.get(threeDId)!.curve);
  });

  it('a straight dispatch stays straight — no curvature is invented', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [...BASELINE],
      height: 2.7,
      thickness: 0.2,
    });
    expect(env.store.get(id)!.curve).toBeUndefined();
  });

  it('wall.batch.create carries curve per wall (generators / AI path)', async () => {
    env = buildEnv();
    const curved = createId('wall');
    const straight = createId('wall');

    await env.bus.executeCommand('wall.batch.create', {
      levelId: 'lvl_test',
      walls: [
        { id: curved, baseLine: [...BASELINE], curve: CURVE },
        { id: straight, baseLine: [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 3 }] },
      ],
    });

    expect(env.store.get(curved)!.curve).toEqual(CURVE);
    expect(env.store.get(straight)!.curve).toBeUndefined();
  });

  it("CommandEventBridge forwards curve on 'wall.created' — the §P2.1 mirror's input", async () => {
    env = buildEnv();
    const id = createId('wall');
    const received: unknown[] = [];
    const unsub = env.events.on('wall.created', (ev) => received.push(ev));

    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [...BASELINE],
      height: 2.7,
      thickness: 0.2,
      curve: CURVE,
    });
    unsub();

    expect(received).toHaveLength(1);
    const ev = received[0] as { wallId?: string; curve?: typeof CURVE };
    expect(ev.wallId).toBe(id);
    // THE SECOND DROP POINT: without this, the legacy mirror (3D mesh + plan
    // projection) could never see the arc even after the chokepoint persisted it.
    expect(ev.curve).toEqual(CURVE);
  });

  it("batch fan-out 'wall.created' events carry each wall's own curve", async () => {
    env = buildEnv();
    const curved = createId('wall');
    const straight = createId('wall');
    const received: Array<{ wallId?: string; curve?: unknown }> = [];
    const unsub = env.events.on('wall.created', (ev) =>
      received.push(ev as { wallId?: string; curve?: unknown }),
    );

    await env.bus.executeCommand('wall.batch.create', {
      levelId: 'lvl_test',
      walls: [
        { id: curved, baseLine: [...BASELINE], curve: CURVE },
        { id: straight, baseLine: [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 3 }] },
      ],
    });
    unsub();

    expect(received).toHaveLength(2);
    expect(received.find((e) => e.wallId === curved)?.curve).toEqual(CURVE);
    expect(received.find((e) => e.wallId === straight)?.curve).toBeUndefined();
  });

  it('curve survives the schema round-trip untouched (no second representation)', async () => {
    env = buildEnv();
    const id = createId('wall');
    await env.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      baseLine: [...BASELINE],
      curve: { control: { x: -1.5, y: 0, z: 2.25 }, segments: 24 },
    });
    const w = env.store.get(id)!;
    expect(w.curve).toEqual({ control: { x: -1.5, y: 0, z: 2.25 }, segments: 24 });
  });
});
