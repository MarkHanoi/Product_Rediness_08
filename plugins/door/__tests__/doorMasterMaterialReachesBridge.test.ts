/**
 * C100 §9.6.c step 3 / S17 — the door's `materialId` reaches the BRIDGE.
 *
 * ⚠ THIS IS THE SECOND HALF OF THE DOOR PROOF, NOT THE WHOLE OF IT, and saying so
 * is the point. `packages/geometry-door/__tests__/DoorMasterMaterialReachesMesh.test.ts`
 * drives the production `DoorBuilder` and reads the colour off the material attached
 * to a mesh in the scene — that is the path the founder actually sees in the editor.
 * THIS file covers the P1 pipeline: `produceDoor` → `MaterialKey` → the committer's
 * `material-bridge`. Both exist because a door has two render paths, and C100 §9.1's
 * finding is that a `materialId` can be dropped on either one.
 *
 * ⭐ WHAT C100 §9.3 RETRACTED, and what this file does instead. §9.3 struck out an
 * earlier slice whose "door" coverage test called `composeMaterialKey` directly,
 * never constructed a door, and *"would pass unchanged if `producers/door.ts` were
 * deleted"*. So this imports `produceDoor` — the real producer — and
 * `colorOfDoorMaterialKey` — the real bridge — and asserts a hex read OUT of
 * `MATERIAL_CATALOG` rather than typed here. A transcribed hex passes while the
 * catalogue moves.
 *
 * ⭐ THE DEFECT: `producers/door.ts` used to read `const materialId = '';` — a
 * hard-coded empty string, beside a comment claiming the key was *"symmetrical with
 * `composeMaterialKey`"*. Symmetrical in shape, empty in content: no door could name
 * a material, so the bridge downstream had to guess a colour from a system-type
 * string it was never given either.
 *
 * VERIFIED IT FAILS WITHOUT THE FIX — see the commit body for the executed run.
 */

import { describe, it, expect } from 'vitest';
import { MATERIAL_CATALOG, materialHex } from '@pryzm/schemas/materials';
import { produceDoor } from '@pryzm/geometry-kernel';
import {
  colorOfDoorMaterialKey,
  isUnresolvedDoorMaterialKey,
  unresolvedDoorMaterialId,
} from '../src/committer/material-bridge';

const placement = {
  axis: { x: 1, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  origin: { x: 0, y: 0, z: 0 },
  wallThickness: 0.2,
};

/** A minimal, VALID door DTO. `frameWidth * 2 <= width` or the schema refuses it. */
const doorDto = (extra: Record<string, unknown>) =>
  ({
    id: 'door_test',
    wallId: 'wall_test',
    openingId: 'op_test',
    doorType: 'single',
    width: 0.9,
    height: 2.1,
    sillHeight: 0,
    offset: 0,
    frameThickness: 0.05,
    frameWidth: 0.05,
    ...extra,
  }) as never;

/** slot → the bridge's answer for the key the producer minted for it. */
const coloursBySlot = (extra: Record<string, unknown>): Map<string, string> => {
  const d = produceDoor(doorDto(extra), placement);
  const out = new Map<string, string>();
  for (const k of d.materialKeys as unknown as string[]) {
    out.set(String(k).split('|')[4]!, colorOfDoorMaterialKey(String(k)));
  }
  return out;
};

const masterHex = (id: string): string => {
  const rec = MATERIAL_CATALOG.find((m) => m.id === id);
  expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
  return rec!.color.toLowerCase();
};

describe('C100 §9.6.c — a door materialId reaches the bridge as the MASTER hex', () => {
  it('⭐ resolves each SURFACE independently — a metal frame around a timber leaf', () => {
    // The case that decides the schema shape. A single `materialId` could not
    // express this door, which is why `Door.ts` carries one id per surface.
    const c = coloursBySlot({
      frameMaterialId: 'steel-structural',
      leafMaterialId: 'wood-oak',
    });
    expect(c.get('frame')).toBe(masterHex('steel-structural'));
    expect(c.get('leaf')).toBe(masterHex('wood-oak'));

    // NEGATIVE — neither is the pre-S17 answer (this file's own family defaults).
    expect(c.get('frame')).not.toBe('#8b7058');
    expect(c.get('leaf')).not.toBe('#c2a684');
  });

  it('honours an explicit colour OVERRIDE over the id (§2.1 step 1)', () => {
    const c = coloursBySlot({ leafMaterialId: 'wood-oak', leafColor: '#123456' });
    expect(c.get('leaf')).toBe('#123456');
  });

  it('surfaces an UNKNOWN id as a NAMED failure, never as a plausible timber (§5)', () => {
    const d = produceDoor(doorDto({ frameMaterialId: 'not-a-real-material' }), placement);
    const frameKey = (d.materialKeys as unknown as string[])
      .map(String)
      .find((k) => k.endsWith('|frame'))!;

    expect(isUnresolvedDoorMaterialKey(frameKey)).toBe(true);
    expect(unresolvedDoorMaterialId(frameKey)).toBe('not-a-real-material');
    expect(colorOfDoorMaterialKey(frameKey)).toBe('#ff00ff');
  });

  it('leaves an unmaterialled door looking EXACTLY as it did before S17', () => {
    // C100 §9.6.b names repainting the product as the thing that would rightly get
    // this convergence reverted. The two family defaults did not move; they were
    // already in this file and are now passed to the shared resolver as parameters.
    const c = coloursBySlot({});
    expect(c.get('frame')).toBe('#8b7058');
    expect(c.get('leaf')).toBe('#c2a684');
  });

  it('the geometry hash moves when only the MATERIAL moves', () => {
    // The descriptor CARRIES the material keys, so a cache keyed on a hash blind to
    // the material would serve the old keys for a new material —
    // §COMMITTED-IS-NOT-REACHABLE reintroduced through a cache.
    const plain = produceDoor(doorDto({}), placement).hash;
    const oak = produceDoor(doorDto({ leafMaterialId: 'wood-oak' }), placement).hash;
    expect(oak).not.toBe(plain);
  });

  it('the ids this test names all resolve in the master (S14 guard)', () => {
    for (const id of ['steel-structural', 'wood-oak']) {
      expect(materialHex(id), `${id} must resolve`).toBeDefined();
    }
  });
});
