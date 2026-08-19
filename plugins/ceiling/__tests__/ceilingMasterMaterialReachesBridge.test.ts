/**
 * C100 §9.6.c step 3 / S16 — the ceiling's `materialId` reaches the BRIDGE.
 *
 * ⭐ THE CONTRACT SPELLS OUT WHAT THIS TEST MUST NOT BE, and it is worth quoting:
 * *"each landing with a test that drives a REAL DTO through the REAL producer
 * into the REAL bridge and asserts the master's hex — never `composeMaterialKey`
 * in isolation (§9.3)."* §9.3 RETRACTED an earlier slice for exactly that: a
 * coverage proof that never touched its subject. So this file imports
 * `produceCeiling` and `colorOfCeilingMaterialKey` — the two real ends — and
 * asserts a hex that comes out of `MATERIAL_CATALOG` rather than one typed here.
 *
 * ⚠ WHAT IT STILL DOES NOT PROVE, stated so it is never read as coverage: that
 * the bridge's `THREE.MeshStandardMaterial` is attached to a mesh, that the mesh
 * is in the scene, or that the frame drew. It proves the master's colour
 * survives producer → key → bridge, which is the link that was BROKEN
 * (§9.1: the id sat one slot over and the bridge discarded it).
 */

import { describe, it, expect } from 'vitest';
import { MATERIAL_CATALOG, materialHex } from '@pryzm/schemas/materials';
import { produceCeiling } from '@pryzm/geometry-kernel';
import {
  colorOfCeilingMaterialKey,
  isUnresolvedCeilingMaterialKey,
  unresolvedCeilingMaterialId,
} from '../src/committer/material-bridge';

/** A minimal, VALID ceiling DTO — the producer throws on <3 points or thickness ≥ height. */
const ceilingDto = (extra: Record<string, unknown>) =>
  ({
    id: 'ceiling_test',
    boundary: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 3 },
      { x: 0, y: 0, z: 3 },
    ],
    thickness: 0.02,
    ceilingHeight: 2.7,
    ...extra,
  }) as never;

const keysOf = (extra: Record<string, unknown>): string[] => {
  const d = produceCeiling(ceilingDto(extra), {} as never, 0);
  return [...d.materialKeys] as string[];
};

describe('C100 §9.6.c — a ceiling materialId reaches the bridge as the MASTER hex', () => {
  it('resolves a real master id to the catalogue colour, not the bridge fallback', () => {
    // The id `packages/types-builtin/src/ceiling` assigns to the commercial
    // acoustic ceiling AFTER S14's reconciliation. Read from the master, never
    // transcribed: a transcribed hex would pass while the catalogue moved.
    const record = MATERIAL_CATALOG.find((m) => m.id === 'gypsum-acoustic');
    expect(record, 'gypsum-acoustic must exist in the master').toBeDefined();

    const colours = keysOf({ materialId: 'gypsum-acoustic' }).map(colorOfCeilingMaterialKey);
    expect(colours.length).toBeGreaterThan(0);
    for (const c of colours) expect(c).toBe(record!.color.toLowerCase());

    // And it is NOT the pre-S16 answer — the bridge's per-slot grey.
    expect(colours).not.toContain('#eaeaea');
  });

  it('honours an explicit materialColor OVERRIDE over the id (§2.1 step 1)', () => {
    const colours = keysOf({ materialId: 'gypsum-acoustic', materialColor: '#123456' }).map(
      colorOfCeilingMaterialKey,
    );
    for (const c of colours) expect(c).toBe('#123456');
  });

  it('surfaces an UNKNOWN id as a NAMED failure, never as a plausible grey (§5)', () => {
    const keys = keysOf({ materialId: 'not-a-real-material' });
    for (const k of keys) {
      expect(isUnresolvedCeilingMaterialKey(k)).toBe(true);
      expect(unresolvedCeilingMaterialId(k)).toBe('not-a-real-material');
      expect(colorOfCeilingMaterialKey(k)).toBe('#ff00ff');
    }
  });

  it('leaves an unmaterialled ceiling looking EXACTLY as it did before S16', () => {
    // The three hexes moved upstream from the bridge into the producer. If this
    // fails, the convergence repainted the product — which C100 §9.6.b names as
    // the thing that would rightly get it reverted.
    const bySlot = new Map<string, string>();
    for (const k of keysOf({})) bySlot.set(k.split('|')[3]!, colorOfCeilingMaterialKey(k));
    expect(bySlot.get('top')).toBe('#f5f5f5');
    expect(bySlot.get('bottom')).toBe('#eaeaea');
    expect(bySlot.get('edge')).toBe('#cfcfcf');
  });

  it('the four builtin ceiling type ids all resolve in the master (S14 guard)', () => {
    for (const id of ['paint-matte-white', 'gypsum-plasterboard', 'gypsum-acoustic']) {
      expect(materialHex(id), `${id} must resolve`).toBeDefined();
    }
  });
});
