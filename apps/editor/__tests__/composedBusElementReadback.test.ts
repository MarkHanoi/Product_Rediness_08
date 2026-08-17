/**
 * @vitest-environment happy-dom
 */
// composedBusElementReadback — MT-01 (C70 A-INV-3 · ADR-0318 · §MT-01-COMPOSED-BUS-READBACK).
//
// ─── WHY THIS FILE EXISTS: `hello-12-elements` WAS PROVING THE WRONG THING ────
//
// `hello-12-elements.test.ts` boots `bootstrapWithEverything({audit})` DIRECTLY —
// never `composeRuntime()`, which P1 (CLAUDE.md) makes the only way production
// obtains a runtime. In that process NOTHING registers an authoritative element
// store, so `CreateWallHandler`'s census takes its `if (!s) return null` branch and
// the assertion `rt.stores.wall.get(wallId)` reads the PLUGIN DTO STORE — the exact
// store MT-01 says nobody reads. It went green for months while the capability was
// unreachable. That is not a weaker test, it is a FALSE one.
//
// This file asks the question that file cannot: on the runtime `composeRuntime()`
// PRODUCES, does a `*.create` dispatch land the element in the store the
// composition root itself names as authoritative — the module singleton
// `ProjectSerializer` reads?
//
// `hello-12-elements` is deliberately LEFT on `bootstrapWithEverything`: its
// vitest environment is `node` on purpose (sibling suites assert
// `globalThis.window === undefined`), while `composeRuntime` needs a DOM. So it
// keeps its real job — "every plugin contributes a handler and a DTO store" — and
// now says so in its own header and pins that it registers no authoritative store
// at all. THIS file carries the reachability claim.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────
//
// Nothing on the measured path is stubbed. The runtime is a real `composeRuntime`;
// the bus is its real bus; the store read is the real `wallStore` module singleton
// (asserted by IDENTITY in A-1, so a copy cannot satisfy it); the handler and its
// patch pair are real.
//
// ONE substitution, declared: the LEVEL AUTHORITY in A-3. `initBuilders.ts` attaches
// a real `BimManager`, and `new BimManager(scene)` cannot be constructed headlessly
// — it builds a `LevelVisualizer`, whose label sprites need a canvas 2D context that
// happy-dom does not provide (measured: `TypeError: Cannot read properties of null
// (reading 'beginPath')`). The stand-in implements the two members `WallStore`
// actually calls on it (`getLevelById` / `getLevels`, measured from source) and
// nothing else. It stands in for the LEVEL REGISTRY, not for the store, not for the
// bus, and not for the write.
//
// ─── WHAT THIS PINS, AND WHY EACH ARM IS HERE ───────────────────────────────
//
// A-2 pins the REFUSAL (engine absent). It must stay a refusal: a create that
//     cannot land must never report success. This is the arm that stops the fix
//     below from being "re-enabled by deleting the guard".
// A-3 pins the READBACK (engine present). Before §MT-01-COMPOSED-BUS-READBACK this
//     measured `DISPATCH OK` with the authoritative store ABSENT — attaching the
//     engine converted the honest refusal straight back into a SILENT FALSE
//     SUCCESS, because the only write site was an L7 subscriber
//     (`initTools.ts` §P2.1) that the command layer cannot see and never checked
//     for. THIS ARM IS THE ROW.
// A-4 pins that slab and room are NOT covered, with the measured reason attached,
//     so "not mirrored" can never be mistaken for "nothing to mirror"
//     (C70 L-INV-1: `[]` may only ever mean zero results).

import { describe, expect, it, beforeAll } from 'vitest';
import { createId } from '@pryzm/schemas';
import { composeRuntime, UNMIRRORED_KINDS } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';

const AUDIT = { actorId: 'mt01', projectId: 'mt01', clientId: 'node' } as const;

const LEVEL_ID = 'L0';

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

beforeAll(async () => {
  rt = await composeRuntime({
    audit: AUDIT,
    canvas: null,
    bootstrapFn: bootstrapWithEverything as never,
  });
}, 600_000);

/** The authoritative handle, reached the way any consumer would. */
function authoritative(kind: string): any {
  return rt.stores.elements.get(kind);
}

async function dispatchOutcome(verb: string, payload: unknown): Promise<string> {
  try {
    await rt.bus.executeCommand(verb, payload);
    return 'OK';
  } catch (err) {
    return (err as Error).message ?? String(err);
  }
}

describe('MT-01 — element creates on the COMPOSED bus, read back from the AUTHORITATIVE store', () => {
  it('A-1: the slot is the module singleton ProjectSerializer reads — identity, not a copy', async () => {
    const { wallStore } = await import('@pryzm/geometry-wall/store');
    const { slabStore } = await import('@pryzm/geometry-slab/store');
    // Identity (`toBe`), so a rival construction or a proxy fails this line. Every
    // readback below is therefore a read of THE authoritative record, not of a
    // lookalike — which is precisely the check `hello-12-elements` never made.
    expect(authoritative('wall')).toBe(wallStore);
    expect(authoritative('slab')).toBe(slabStore);

    // …and the DTO store the FALSE test asserted on is not even a key here.
    expect((rt.stores as Record<string, unknown>).wall).toBeUndefined();
    expect((rt.stores as Record<string, unknown>).slab).toBeUndefined();
  });

  it('A-2: ENGINE ABSENT — wall.create + slab.create REFUSE BY NAME and write nothing', async () => {
    expect(authoritative('wall').isEngineAttached()).toBe(false);

    const wallId = createId('wall');
    const wallOutcome = await dispatchOutcome('wall.create', {
      id: wallId,
      levelId: LEVEL_ID,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    });
    // Not merely "it threw": the reason must NAME the real cause, so a caller reads
    // the truth rather than an incidental complaint (ADR-0318 I-3).
    expect(wallOutcome).not.toBe('OK');
    expect(wallOutcome).toMatch(/engine half is NOT attached/);
    expect(wallOutcome).toMatch(/ADR-0318/);
    expect(authoritative('wall').getById(wallId)).toBeUndefined();

    const slabId = createId('slab');
    const slabOutcome = await dispatchOutcome('slab.create', { id: slabId, levelId: LEVEL_ID });
    expect(slabOutcome).not.toBe('OK');
    expect(slabOutcome).toMatch(/engine half is NOT attached/);
    expect(authoritative('slab').getById(slabId)).toBeUndefined();
  });

  it('A-3: ENGINE PRESENT — wall.create is READBACK-POSITIVE on the composed bus', async () => {
    // Attach the engine half the way apps/editor/src/engine/initBuilders.ts:551
    // does — the same `attachEngine(projectContext, bimKernel)` call, with the
    // level-authority substitution declared in the STUB LEDGER above.
    const { projectContext } = await import('@pryzm/core-app-model/context');
    const { wallStore } = await import('@pryzm/geometry-wall/store');
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, childrenIds: [] as string[] };
    const levelAuthority = {
      getLevelById: (id: string) => (id === LEVEL_ID ? level : undefined),
      getLevels: () => [level],
      registerElement: () => { /* spatial registration is an L7 concern */ },
    };
    (wallStore as any).attachEngine(projectContext, levelAuthority);
    expect(authoritative('wall').isEngineAttached()).toBe(true);

    const wallId = createId('wall');
    const outcome = await dispatchOutcome('wall.create', {
      id: wallId,
      levelId: LEVEL_ID,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      thickness: 0.3,
      height: 2.9,
    });
    expect(outcome).toBe('OK');

    // ⭐ THE REACHABILITY PROOF. Not `success === true`; not the DTO store; not a
    // pure function's return. The STORED record, read out of the singleton A-1
    // proved is the one ProjectSerializer reads.
    const stored = authoritative('wall').getById(wallId);
    expect(stored).toBeDefined();
    expect(stored.id).toBe(wallId);
    expect(stored.levelId).toBe(LEVEL_ID);
    // The COMMITTED values, so this cannot pass on a placeholder record: the
    // handler resolved these, and they must survive into authoritative state.
    expect(stored.thickness).toBe(0.3);
    expect(stored.height).toBe(2.9);
    expect(stored.baseLine[1].x).toBe(5);
  });

  it('A-4: slab + room are DELIBERATELY not covered — the census carries the reason', async () => {
    // §CONTEXT-DATA-HONESTY — "not covered" is a value with a reason attached, never
    // a silent omission. Asserted against the exported census so the reason cannot
    // rot into a stale comment.
    const kinds = UNMIRRORED_KINDS.map((k) => k.kind).sort();
    expect(kinds).toEqual(['room', 'slab']);
    for (const entry of UNMIRRORED_KINDS) {
      expect(entry.reason.length).toBeGreaterThan(80);
      expect(entry.commandTypes.length).toBeGreaterThan(0);
    }

    // SLAB — measured: the committed plugin record carries `boundary`, the
    // authoritative store demands `polygon`/`position`. Still readback-negative,
    // and that is a SHAPE defect, not a wiring one.
    const { slabStore } = await import('@pryzm/geometry-slab/store');
    (slabStore as any).attachEngine({ activeLevelId: LEVEL_ID });
    const slabId = createId('slab');
    const slabOutcome = await dispatchOutcome('slab.create', {
      id: slabId,
      levelId: LEVEL_ID,
      // `boundary` (world Vec3, XZ plane), not the plan-tool `polygon` alias: the
      // alias maps {x,y} → {x, y, z: 0}, which `validateSlabBoundary` then measures
      // as zero XZ area. SlabPlanToolHandler.ts:296 already works around that by
      // sending worldZ in BOTH y and z (its own TODO, SLAB-BOUNDARY-CONVENTION).
      // Using the unambiguous field keeps THIS arm about the readback.
      boundary: [
        { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
        { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 },
      ],
    });
    expect(slabOutcome).toBe('OK');
    expect(authoritative('slab').getById(slabId)).toBeUndefined();

    // ROOM — a DISTINCT defect from the readback one: `CreateRoomHandler` declares
    // `affectedStores: []` and delegates to `window.commandManager`, so there is no
    // patch pair to mirror and no authoritative write available in this process.
    // It throws BY NAME rather than lying, which is the part that is already right.
    const roomOutcome = await dispatchOutcome('room.create', {
      id: '0318a318-0318-4318-8318-000000000001',
      type: 'room',
      levelId: LEVEL_ID,
      name: 'MT-01 room',
      roomNumber: 'R-1',
      occupancyType: 'unclassified',
      boundary: {
        polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
        height: 2.7,
        baseOffset: 0,
        detectionMethod: 'manual-boundary',
      },
      boundingWallIds: [], boundingSlabIds: [], boundingColumnIds: [],
      finishes: {}, properties: {},
      computed: {
        area: 12, grossArea: 12, perimeter: 14, volume: 32.4,
        centroid: { x: 2, z: 1.5 },
        boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
      },
      metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'mt01', version: 1 },
    });
    expect(roomOutcome).not.toBe('OK');
    expect(roomOutcome).toMatch(/legacy command manager is not available/);
    expect(authoritative('room').getById('0318a318-0318-4318-8318-000000000001')).toBeUndefined();
  });
});
