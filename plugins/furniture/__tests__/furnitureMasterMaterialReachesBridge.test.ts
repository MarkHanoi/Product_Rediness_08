/**
 * ⭐ C100 §2.1 / §9.6.c step 3 / L-1127 S16 — A FURNITURE `materialId` REACHES THE
 * BRIDGE AS THE MASTER'S HEX.
 *
 * ⚠ ITS OWN TEST, NOT A SHARED HARNESS. C100 §9.3 retracted a slice for proving
 * door coverage with a test that never constructed a door, and L-1127 records the
 * standing instruction that followed: *"sixteen remain, and each needs its own test
 * that drives a real DTO through the real producer into the real bridge — a shared
 * harness would repeat that."* So this file drives `produceFurniture` (the real
 * producer) into `colorOfFurnitureMaterialKey` (the real bridge) and reads every
 * expected hex OUT of `MATERIAL_CATALOG` rather than typing it.
 *
 * ─── ⛔ THE DEFECT, and it is the worst one C100 §9 has surfaced ─────────────
 *
 * The furniture material key had **no colour slot at all** — the stair/handrail
 * shape a third time. The `materialId` sat in slot 2, travelled the entire pipeline
 * intact, and the bridge then ran it through a **djb2 hash modulo an EIGHT-ENTRY
 * PALETTE** while the master holds **205 materials**. Measured 2026-08-19:
 *
 *   wood-oak              master #c8a96e  ->  painted #7d8c8c  (grey-teal)
 *   wood-walnut           master #5a3a28  ->  painted #7d8c8c  (grey-teal)
 *   fabric-wool-felt-grey master #747873  ->  painted #8fa6c4  (blue)
 *
 * ⭐ **Oak and walnut collided onto ONE colour** — light timber and dark timber
 * painted identically. At 205 ids over 8 buckets that is arithmetic, not bad luck.
 * Case 2 below is the load-bearing one for exactly that reason: a test that only
 * checked "oak is #c8a96e" would leave the collision unpinned, and the collision is
 * the part a user actually sees.
 *
 * ⭐ **Why it survived so long**: a hash is stable and its palette is tasteful, so
 * the wrong colour came back identically every session and read as a design
 * decision rather than as a lost material. That is precisely the failure C100 §5
 * exists to prevent — a wrong-but-believable colour is worse than a missing one,
 * because nothing ever prompts anyone to look.
 *
 * RED-FIRST, EXECUTED NOT ASSUMED — see the commit body for the run and its split.
 *
 * ⚠ WHAT THIS DOES NOT PROVE: that a mesh was drawn, that the committer used the
 * factory, or that the colour survives save/load. The runtime `FurnitureTypes.ts`
 * record still carries NO `materialId` (the gate's ARM F) and `serializeFurniture`
 * still writes none (ARM D), so a material chosen at runtime does not yet persist.
 * That is a different defect with a different fix and it is NOT closed here.
 */

import { describe, it, expect } from 'vitest';
import { MATERIAL_CATALOG, materialHex } from '@pryzm/schemas/materials';
import { Furniture, createId } from '@pryzm/schemas';
import { produceFurniture, NO_JOINS } from '@pryzm/geometry-kernel';
import {
  colorOfFurnitureMaterialKey,
  isUnresolvedFurnitureMaterialKey,
  unresolvedFurnitureMaterialId,
} from '../src/committer/material-bridge';

/** A box, so the producer emits a real group carrying a real material key. */
const BOX = (() => {
  const x = 0.5, y = 0.5, z = 0.5;
  return {
    positions: [
      -x, -y, -z, x, -y, -z, x, y, -z, -x, y, -z,
      -x, -y, z, x, -y, z, x, y, z, -x, y, z,
    ],
    indices: [
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
      0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
    ],
  };
})();

const dto = (partial: Partial<Furniture>): Furniture =>
  Furniture.parse({
    id: createId('furniture'),
    levelId: 'L1',
    catalogId: 'pryzm/sofa-3s',
    representations: { '3': BOX },
    activeLod: 3,
    ...partial,
  });

/** The colour the REAL bridge gives the REAL producer's key. */
const paintedColour = (partial: Partial<Furniture>): string => {
  const d = produceFurniture(dto(partial), NO_JOINS, 0);
  const keys = d.materialKeys as unknown as string[];
  expect(keys.length, 'the producer must emit a material key').toBeGreaterThan(0);
  return colorOfFurnitureMaterialKey(String(keys[0]));
};

/** Read from the master, NEVER transcribed. */
const masterHex = (id: string): string => {
  const rec = MATERIAL_CATALOG.find((m) => m.id === id);
  expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
  return rec!.color.toLowerCase();
};

/** The pre-fix answer, reproduced here so the negatives are measured, not remembered. */
const PALETTE = [
  '#a78b6e', '#b9a48b', '#7d8c8c', '#a3bca3',
  '#8fa6c4', '#c69ea3', '#caa56b', '#9b8eb0',
] as const;
const hashPaints = (id: string): string => {
  if (id.length === 0) return '#a78b6e';
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i);
  return PALETTE[Math.abs(h) % PALETTE.length] ?? '#a78b6e';
};

describe('C100 §2.1 — a furniture materialId reaches the bridge as the MASTER hex', () => {
  it('⭐ 1. the MASTER\'s colour, not the hash palette\'s', () => {
    const painted = paintedColour({ materialSlots: { primary: 'wood-oak' } });
    expect(painted).toBe(masterHex('wood-oak'));

    // NEGATIVE, and it is the whole point: the pre-fix answer was a stable,
    // plausible grey-teal that no one would have questioned.
    expect(painted).not.toBe(hashPaints('wood-oak'));
    expect(painted).not.toBe('#7d8c8c');
  });

  it('⭐ 2. OAK AND WALNUT ARE DIFFERENT COLOURS — the collision, pinned', () => {
    // THE LOAD-BEARING CASE. 205 master materials over an 8-entry palette means
    // collisions are the arithmetic, not the exception. Before the fix these two
    // hashed to the SAME bucket, so a light-oak chair and a dark-walnut chair were
    // painted identically — the user-visible half of the defect, which a
    // single-material assertion cannot see.
    const oak = paintedColour({ materialSlots: { primary: 'wood-oak' } });
    const walnut = paintedColour({ materialSlots: { primary: 'wood-walnut' } });

    expect(oak).toBe(masterHex('wood-oak'));
    expect(walnut).toBe(masterHex('wood-walnut'));
    expect(oak, 'light oak and dark walnut must not paint the same colour').not.toBe(walnut);

    // …and the pre-fix collision is asserted as a FACT about the old behaviour, so
    // this case documents what it repaired rather than merely what it wants.
    expect(hashPaints('wood-oak')).toBe(hashPaints('wood-walnut'));
  });

  it('3. the LEGACY single-material field resolves too, not only materialSlots', () => {
    // `composeFurnitureMaterialKey` reads `materialSlots.primary ?? materialId`.
    // Both are real inputs, so both are pinned.
    expect(paintedColour({ materialId: 'fabric-wool-felt-grey' }))
      .toBe(masterHex('fabric-wool-felt-grey'));
  });

  it('4. an UNKNOWN id paints MAGENTA — a named failure, never a plausible timber (§5)', () => {
    const d = produceFurniture(dto({ materialSlots: { primary: 'not-a-real-material' } }), NO_JOINS, 0);
    const key = String((d.materialKeys as unknown as string[])[0]);

    expect(isUnresolvedFurnitureMaterialKey(key)).toBe(true);
    expect(unresolvedFurnitureMaterialId(key)).toBe('not-a-real-material');
    expect(colorOfFurnitureMaterialKey(key)).toBe('#ff00ff');

    // ⭐ NOT the hash's answer. The hash would have painted a perfectly believable
    // colour for an id that names nothing at all — "your material was deleted" and
    // "this sofa is wheat" as the same value (§CONTEXT-DATA-HONESTY).
    expect(colorOfFurnitureMaterialKey(key)).not.toBe(hashPaints('not-a-real-material'));
  });

  it('5. CONTROL — furniture naming NO material renders EXACTLY as it did before (§9.6.b)', () => {
    // C100 §9.6.b: repainting the product is the thing that would rightly get this
    // convergence reverted. The family default is the bridge's own pre-existing
    // FALLBACK_COLOR, chosen because `hashMaterialId('')` returned exactly it — so
    // this case is byte-identical before and after.
    expect(paintedColour({})).toBe('#a78b6e');
    expect(paintedColour({})).toBe(hashPaints(''));
  });

  it('6. CONTROL — a LEGACY key (no colour slot) is answered exactly as before', () => {
    // A cached descriptor, a pooled material or a stored fixture can still carry
    // the old 5-part shape. Answering those with black or magenta would be a
    // regression dressed as a cleanup, so the hash is retained for them alone.
    const legacy = 'furniture|pryzm/sofa-3s|wood-oak|lod=3|primary';
    expect(colorOfFurnitureMaterialKey(legacy)).toBe(hashPaints('wood-oak'));
    expect(isUnresolvedFurnitureMaterialKey(legacy)).toBe(false);

    // And the discriminator is CONTENT, not length: the legacy key's slot 3 is the
    // `lod=` token, which is what marks it legacy.
    expect(legacy.split('|')[3]).toBe('lod=3');
  });

  it('7. the ids this test names all resolve in the master (S14 guard)', () => {
    // S14 found eight ids that were dot-case while the master is kebab-case and
    // resolved to `undefined` in silence. A test naming an id that does not exist
    // would assert magenta and call it a pass.
    for (const id of ['wood-oak', 'wood-walnut', 'fabric-wool-felt-grey']) {
      expect(materialHex(id), `${id} must resolve in the master`).toBeTruthy();
    }
  });
});
