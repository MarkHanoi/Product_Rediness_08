/**
 * C100 §9.6.c step 3 / S17 — the window's `materialId` reaches the BRIDGE.
 *
 * ⚠ THE SECOND HALF OF THE WINDOW PROOF, NOT THE WHOLE OF IT.
 * `packages/geometry-window/__tests__/WindowMasterMaterialReachesMesh.test.ts` drives
 * the production `WindowBuilder` and reads the colour off a material attached to a
 * mesh — the path the founder sees in the editor. THIS file covers the P1 pipeline:
 * `produceWindow` → `MaterialKey` → the committer's `material-bridge`. Both exist
 * because a window has two render paths and C100 §9.1's finding is that a
 * `materialId` can be dropped on either.
 *
 * ⭐ THE DEFECT, and it contained a second one. `producers/window.ts` read
 * `const materialId = '';` — a hard-coded empty string, the door producer's defect
 * verbatim — and then minted BOTH slots with that same empty id. A window's frame
 * and its glazing are different products with different physical scalars; one id
 * could never have described both, so even filling that variable would have been
 * wrong. Each slot now carries its own id.
 *
 * §9.3 retracted an earlier slice for proving door coverage with a test that never
 * constructed a door, so this drives `produceWindow` — the real producer — into
 * `colorOfWindowMaterialKey` — the real bridge — and reads its expected hexes OUT of
 * `MATERIAL_CATALOG` rather than typing them.
 *
 * VERIFIED IT FAILS WITHOUT THE FIX — see the commit body for the executed run.
 */

import { describe, it, expect } from 'vitest';
import { MATERIAL_CATALOG, materialHex } from '@pryzm/schemas/materials';
import { produceWindow } from '@pryzm/geometry-kernel';
import {
  colorOfWindowMaterialKey,
  isUnresolvedWindowMaterialKey,
  unresolvedWindowMaterialId,
} from '../src/committer/material-bridge';

const placement = {
  axis: { x: 1, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  origin: { x: 0, y: 0, z: 0 },
  wallThickness: 0.2,
};

/** A minimal, VALID window DTO. `frameWidth * 2 <= width` or the schema refuses it. */
const winDto = (extra: Record<string, unknown>) =>
  ({
    id: 'window_test',
    wallId: 'wall_test',
    openingId: 'op_test',
    windowType: 'single',
    width: 1.2,
    height: 1.2,
    sillHeight: 0.9,
    offset: 0,
    frameThickness: 0.05,
    frameWidth: 0.05,
    ...extra,
  }) as never;

const coloursBySlot = (extra: Record<string, unknown>): Map<string, string> => {
  const d = produceWindow(winDto(extra), placement as never);
  const out = new Map<string, string>();
  for (const k of d.materialKeys as unknown as string[]) {
    out.set(String(k).split('|')[4]!, colorOfWindowMaterialKey(String(k)));
  }
  return out;
};

const masterHex = (id: string): string => {
  const rec = MATERIAL_CATALOG.find((m) => m.id === id);
  expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
  return rec!.color.toLowerCase();
};

describe('C100 §9.6.c — a window materialId reaches the bridge as the MASTER hex', () => {
  it('⭐ resolves FRAME and GLASS independently — they are different products', () => {
    const c = coloursBySlot({
      frameMaterialId: 'wood-oak',
      glassMaterialId: 'glass-clear',
    });
    expect(c.get('frame')).toBe(masterHex('wood-oak'));
    expect(c.get('glass')).toBe(masterHex('glass-clear'));

    // NEGATIVE — neither is the pre-S17 answer (this producer's family defaults).
    expect(c.get('frame')).not.toBe('#3a3a3a');
    expect(c.get('glass')).not.toBe('#a4c8e1');
  });

  it('honours an explicit frameColor OVERRIDE over the id (§2.1 step 1)', () => {
    const c = coloursBySlot({ frameMaterialId: 'wood-oak', frameColor: '#123456' });
    expect(c.get('frame')).toBe('#123456');
  });

  it('surfaces an UNKNOWN id as a NAMED failure — even on the GLASS slot (§5)', () => {
    // The glass slot is the one most likely to be given a plausible fallback, since
    // a blue tint always "looks like a window". C100 §5 forbids exactly that.
    const d = produceWindow(winDto({ glassMaterialId: 'not-a-real-material' }), placement as never);
    const glassKey = (d.materialKeys as unknown as string[])
      .map(String)
      .find((k) => k.endsWith('|glass'))!;

    expect(isUnresolvedWindowMaterialKey(glassKey)).toBe(true);
    expect(unresolvedWindowMaterialId(glassKey)).toBe('not-a-real-material');
    expect(colorOfWindowMaterialKey(glassKey)).toBe('#ff00ff');
  });

  it('leaves an unmaterialled window looking EXACTLY as it did before S17', () => {
    const c = coloursBySlot({});
    expect(c.get('frame')).toBe('#3a3a3a');
    expect(c.get('glass')).toBe('#a4c8e1');
  });

  it('the geometry hash moves when only the MATERIAL moves', () => {
    const plain = produceWindow(winDto({}), placement as never).hash;
    const oak = produceWindow(winDto({ frameMaterialId: 'wood-oak' }), placement as never).hash;
    expect(oak).not.toBe(plain);
  });

  it('the ids this test names all resolve in the master (S14 guard)', () => {
    for (const id of ['wood-oak', 'glass-clear']) {
      expect(materialHex(id), `${id} must resolve`).toBeDefined();
    }
  });
});
