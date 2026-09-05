// componentCommitter — §COMPONENT-RENDER (audit §12 Phase 4E) · ADR-0376 D10 ·
// spec §66 (the "no stale derived geometry" clause) · spec §75 · C100 §5.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THIS FILE IS FOR, AND WHAT IT IS NOT FOR.
// ═══════════════════════════════════════════════════════════════════════════════
//
// It is NOT this lane's acceptance. The acceptance is a RENDERED INSTANCE, and it
// was taken in a real browser against a real WebGL2 context — see
// `audit/universal-component-editor/2026-09-01/phase4/harness/` and the pixel
// census in `lane-4e-descriptor-path.md`. A passing unit test is explicitly named
// by the audit as NOT evidence of a rendering path.
//
// It is for the three behaviours a screenshot CANNOT show, because each of them
// is an ABSENCE or an ORDERING:
//   • the §COMPONENT-RENDER-GENERATION-GUARD — a bake issued under an older state
//     resolving LAST and being discarded rather than overwriting a newer one;
//   • the two REFUSALS — an unresolvable definition and an all-solids-refused
//     bake — rendering nothing, visibly, rather than a placeholder;
//   • the transform/geometry split — moving an occurrence must not re-bake it.
//
// ⭐ EVERY GEOMETRIC ARM RUNS THE REAL `bakeFamilyInstance` OVER THE REAL
//    `kernelGeometryAdapter` AND THE REAL `produceExtrude`. Where an arm needs
//    control, it controls the RESOLUTION ORDER of the real bake and nothing else —
//    a fake that manufactured its own descriptor could not falsify a committer
//    that mishandles a real one ([[fake-more-capable-than-real]]).
//
// Location: moved with its subject from `plugins/component/__tests__/` on
// 2026-09-05 (§L7-COMMITTER-HOME). Claimed by `apps/editor/vitest.config.ts`
// (`src/**/*.test.ts`, node env — the same environment it ran in before).

import { describe, expect, it } from 'vitest';
import { bakeFamilyInstance } from '@pryzm/family-instance';
import { MaterialPool } from '@pryzm/scene-committer';
import * as THREE from '@pryzm/renderer-three/three';
import type { ComponentData } from '@pryzm/plugin-component';

import { ComponentCommitter } from '../ComponentCommitter';

/* ── ids: real prefixed ULIDs (the handlers enforce the shape) ────────────── */
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
const A32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ulidN = (n: number): string => ULID_STEM + A32[Math.floor(n / 32) % 32] + A32[n % 32];

const CID = `component_${ulidN(0)}`;
const DEF_ID = `fam_${ulidN(1)}`;
const TYPE_A = `typ_${ulidN(2)}`;
const TYPE_B = `typ_${ulidN(3)}`;
const P_WIDTH = `par_${ulidN(4)}`;
const P_HEIGHT = `par_${ulidN(5)}`;
const P_DEPTH = `par_${ulidN(6)}`;
const PLANE = 'plane_01HZ00000000000000000PNE01';
const PROFILE = 'prof_01HZ00000000000000000RCT01';
const SOLID = 'sol_01HZ000000000000000000SL01';
const NOW = '2026-09-02T00:00:00.000Z';

/** TYPE_A is 1200 wide, TYPE_B is 600 — so a type swap is visible as GEOMETRY. */
/* eslint-disable @typescript-eslint/no-explicit-any */
function makeFamily(): any {
  return {
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    manifest: {
      formatVersion: '1.1', id: DEF_ID, name: 'Lane4E Window', semver: '1.0.0',
      author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'lane4e' },
      description: '', ifcEntity: 'IfcWindow', category: 'Window', tags: [],
      minPRYZMVersion: '2.0.0',
      schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      createdAt: NOW, lastModifiedAt: NOW,
    },
    document: {
      formatVersion: '1.1',
      referencePlanes: [
        { id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
      ],
      parameters: [
        { id: P_WIDTH, name: 'Width', kind: 'type', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
        { id: P_HEIGHT, name: 'Height', kind: 'type', dataType: 'length', defaultValue: 1500, expression: null, ifcMapping: null, exposed: true },
        { id: P_DEPTH, name: 'Depth', kind: 'type', dataType: 'length', defaultValue: 100, expression: null, ifcMapping: null, exposed: true },
      ],
      profiles: [
        {
          id: PROFILE, name: 'Rect', planeId: PLANE,
          entities: [
            { id: '01HZE0000000000000000RC001', kind: 'point', data: { x: '0', z: '0' } },
            { id: '01HZE0000000000000000RC002', kind: 'point', data: { x: 'Width', z: '0' } },
            { id: '01HZE0000000000000000RC003', kind: 'point', data: { x: 'Width', z: 'Height' } },
            { id: '01HZE0000000000000000RC004', kind: 'point', data: { x: '0', z: 'Height' } },
          ],
          constraints: [],
        },
      ],
      solids: [
        {
          id: SOLID, kind: 'extrude', profileId: PROFILE, materialSlotId: null,
          lod: { coarse: false, medium: true, fine: true },
          lengthExpression: 'Depth', direction: { x: 0, y: 1, z: 0 },
        },
      ],
      materialSlots: [],
      types: [
        { id: TYPE_A, name: 'W1200', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
        { id: TYPE_B, name: 'W600', values: { [P_WIDTH]: 600 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
      ],
      representations: [], connectors: [], propertySets: [], featureEdges: [],
    },
  };
}

const FAMILY = makeFamily();

/** THE REAL BAKE. Nothing below substitutes a descriptor for it. */
const realBake = async (input: {
  definitionId: string;
  typeId: string;
  instanceOverrides: Readonly<Record<string, number | string | boolean>>;
}): Promise<any> => {
  if (input.definitionId !== DEF_ID) throw new Error(`unknown definition ${input.definitionId}`);
  return bakeFamilyInstance({
    family: FAMILY,
    typeId: input.typeId,
    instanceOverrides: input.instanceOverrides,
  }) as any;
};

const DEFINITIONS = { has: (id: string) => id === DEF_ID };

function dto(over: Partial<ComponentData> = {}): ComponentData {
  return {
    id: CID,
    levelId: 'L0',
    definitionId: DEF_ID,
    typeId: TYPE_A,
    definitionVersion: '1.0.0',
    instanceParameters: {},
    origin: { x: 0, y: 0, z: 0 },
    rotation: 0,
    ...over,
  } as unknown as ComponentData;
}

/** Resolve when the committer SAYS geometry landed — never a timeout. */
function readyLatch() {
  let resolve!: () => void;
  let p = new Promise<void>((r) => { resolve = r; });
  return {
    hit: () => resolve(),
    wait: () => p,
    arm: () => { p = new Promise<void>((r) => { resolve = r; }); },
  };
}

/** X-extent of a group's attached solids, read off the POSITION BUFFER the GPU
 *  would receive — never off the committer's own bookkeeping (C16 CA-21's rule,
 *  applied to a render seam: read the artefact, not the writer). */
function xExtentOf(group: THREE.Object3D): number {
  let min = Infinity;
  let max = -Infinity;
  for (const child of group.children) {
    const pos = (child as THREE.Mesh).geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      if (x < min) min = x;
      if (x > max) max = x;
    }
  }
  return max - min;
}

describe('ComponentCommitter — the descriptor path for one family', () => {
  it('A — onAdd returns an EMPTY group, and the real bake fills it (the async seam)', async () => {
    const latch = readyLatch();
    const c = new ComponentCommitter({
      materialPool: new MaterialPool(),
      bake: realBake,
      definitions: DEFINITIONS,
      onGeometryReady: () => latch.hit(),
    });
    const group = c.onAdd(CID, dto());

    // ⭐ The §COMPONENT-RENDER-ASYNC-SEAM, asserted rather than glossed: at the
    // instant the host registers the object there is NOTHING in it.
    expect(group.children.length).toBe(0);

    await latch.wait();
    expect(group.children.length).toBe(1);
    // 1200 mm authored → 1.2 m in the descriptor (§4D-ONE-LENGTH-SEAM).
    expect(xExtentOf(group)).toBeCloseTo(1.2, 6);
    expect(c.stats.rebuilds).toBe(1);
    expect(c.stats.attachedSolids).toBe(1);
    expect(c.stats.refusedBakes).toBe(0);
  });

  it('B — a MOVE writes the transform and does NOT re-bake', async () => {
    const latch = readyLatch();
    const c = new ComponentCommitter({
      materialPool: new MaterialPool(),
      bake: realBake,
      definitions: DEFINITIONS,
      onGeometryReady: () => latch.hit(),
    });
    const group = c.onAdd(CID, dto());
    await latch.wait();
    const rebuildsAfterAdd = c.stats.rebuilds;

    c.onUpdate(CID, dto({ origin: { x: 4, y: 0, z: 7 }, rotation: Math.PI / 2 }), group);

    expect(c.stats.rebuilds).toBe(rebuildsAfterAdd);
    expect(c.stats.transformOnlyUpdates).toBe(1);
    expect(group.position.x).toBeCloseTo(4, 9);
    expect(group.position.z).toBeCloseTo(7, 9);
    expect(group.rotation.y).toBeCloseTo(Math.PI / 2, 9);
    // and the geometry is the SAME buffer — nothing was rebuilt underneath it.
    expect(group.children.length).toBe(1);
    expect(xExtentOf(group)).toBeCloseTo(1.2, 6);
  });

  it('C — a TYPE SWAP regenerates the geometry from the definition', async () => {
    const latch = readyLatch();
    const c = new ComponentCommitter({
      materialPool: new MaterialPool(),
      bake: realBake,
      definitions: DEFINITIONS,
      onGeometryReady: () => latch.hit(),
    });
    const group = c.onAdd(CID, dto());
    await latch.wait();
    expect(xExtentOf(group)).toBeCloseTo(1.2, 6);

    latch.arm();
    c.onUpdate(CID, dto({ typeId: TYPE_B }), group);
    await latch.wait();

    // ⭐ Nothing about the occurrence's own record changed size — the record holds
    // no width. The 600 came out of the TYPE, through the one resolver.
    expect(xExtentOf(group)).toBeCloseTo(0.6, 6);
    expect(c.stats.rebuilds).toBe(2);
    expect(c.stats.attachedSolids).toBe(1);
  });

  it('D — ⭐ a stale bake resolving LAST does not overwrite newer state (spec §66)', async () => {
    // Control the ORDER of two REAL bakes; the geometry is still the kernel's.
    const gate: Array<() => void> = [];
    let calls = 0;
    const orderedBake = async (input: any): Promise<any> => {
      const result = await realBake(input);
      calls += 1;
      if (calls <= 2) {
        // Hold both in flight, release them in REVERSE order below.
        await new Promise<void>((r) => gate.push(r));
      }
      return result;
    };
    const latch = readyLatch();
    const c = new ComponentCommitter({
      materialPool: new MaterialPool(),
      bake: orderedBake,
      definitions: DEFINITIONS,
      onGeometryReady: () => latch.hit(),
    });

    const group = c.onAdd(CID, dto());              // bake #1 — TYPE_A (1200)
    await new Promise<void>((r) => setTimeout(r, 0));
    c.onUpdate(CID, dto({ typeId: TYPE_B }), group); // bake #2 — TYPE_B (600)
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(gate.length).toBe(2);

    // Release the NEWER one first, then the older one — the pathological order.
    gate[1]!();
    await latch.wait();
    latch.arm();
    gate[0]!();
    await new Promise<void>((r) => setTimeout(r, 0));

    // ⭐ The 1200-wide geometry from the SUPERSEDED bake must not be on screen.
    expect(xExtentOf(group)).toBeCloseTo(0.6, 6);
    expect(c.stats.staleBakesDiscarded).toBe(1);
    expect(group.children.length).toBe(1);
  });

  it('E — an UNRESOLVABLE definition renders nothing, and says so (spec §75)', async () => {
    const latch = readyLatch();
    const c = new ComponentCommitter({
      materialPool: new MaterialPool(),
      bake: realBake,
      definitions: { has: () => false },   // no registry can resolve it
      onGeometryReady: () => latch.hit(),
    });
    const group = c.onAdd(CID, dto());
    await latch.wait();

    expect(group.children.length).toBe(0);
    expect(c.stats.unresolvedDefinitions).toBe(1);
    expect(c.stats.attachedSolids).toBe(0);
    // ⛔ The absence is NAMED. A placeholder box here would be indistinguishable
    // from a resolved component, which is the defect C100 §5 exists to prevent.
    expect(group.userData['pryzmUnresolvedDefinition']).toBe(DEF_ID);
  });

  it('F — a bake that REFUSES every solid renders nothing and carries the reason', async () => {
    const latch = readyLatch();
    // The real bake, asked for a type that does not exist → `FamilyBakeError`.
    const c = new ComponentCommitter({
      materialPool: new MaterialPool(),
      bake: realBake,
      definitions: DEFINITIONS,
      onGeometryReady: () => latch.hit(),
    });
    const group = c.onAdd(CID, dto({ typeId: `typ_${ulidN(9)}` }), );
    await latch.wait();

    expect(group.children.length).toBe(0);
    expect(c.stats.refusedBakes).toBe(1);
    expect(String(group.userData['pryzmBakeError'])).toMatch(/unknown-type|has no type/i);
  });

  it('G — onRemove detaches, and a bake still in flight for it is discarded', async () => {
    const gate: Array<() => void> = [];
    const heldBake = async (input: any): Promise<any> => {
      const result = await realBake(input);
      await new Promise<void>((r) => gate.push(r));
      return result;
    };
    const c = new ComponentCommitter({
      materialPool: new MaterialPool(),
      bake: heldBake,
      definitions: DEFINITIONS,
    });
    const group = c.onAdd(CID, dto());
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(gate.length).toBe(1);

    c.onRemove(CID, group);
    gate[0]!();
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(group.children.length).toBe(0);
    expect(c.stats.staleBakesDiscarded).toBe(1);
  });
});
