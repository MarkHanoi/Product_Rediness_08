// @vitest-environment node
//
// ⭐ C100 §2.1 / L-1127 ARM D + ARM F — A BEAM'S MASTER MATERIAL MUST SURVIVE
// SAVE AND RELOAD.
// ═══════════════════════════════════════════════════════════════════════════════
//
// The companion to `packages/geometry-beam/__tests__/BeamMasterMaterialReachesMesh.test.ts`,
// which proves the id reaches a PIXEL. This file proves it reaches the next SESSION.
// Both are required and neither implies the other: C100 §9.7 records that *"the
// serializer drops it"* and *"there is no field to drop"* are different defects with
// different fixes, and beam had BOTH — no `materialId` on the runtime `BeamData`
// (ARM F) and none in `serializeBeam` (ARM D). Fixing either alone is invisible.
//
// ⭐ AND THE ORDER MATTERS. A material that renders but does not persist is the
// WORST of the three states, not the middle one: the user picks concrete, sees
// concrete, saves, reopens, and gets Material Design Blue back with no error
// anywhere. §COMMITTED-IS-NOT-REACHABLE in the persistence layer — the evidence a
// reviewer reaches for (open the JSON, find the id) is the evidence that lies.
//
// ─── WHAT THIS FILE PROVES, AND WHAT IT DOES NOT — stated, not implied ────────
//
// PROVEN BEHAVIOURALLY: the RELOAD half. `ProjectLoader` rebuilds every persisted
// beam through `CreateBeamCommand` and hands it a HAND-WRITTEN option list; a field
// can be serialised perfectly and still die there. That is exactly how the slab
// defect (ARM E) worked — `serializeSlab` had ALWAYS written `materialId` and the
// loader payload never listed it. This drives the REAL `CreateBeamCommand` against
// the REAL `BeamStore` and reads the record back (C16 CA-21).
//
// PROVEN BY SOURCE PARITY, NOT BY AN EXECUTED SAVE: the WRITE half. Executing
// `ProjectSerializer.serialize` needs a ~20-store bundle plus `window`, and
// hand-building those neighbours would be the "fake more capable than the real
// thing" trap that let L-960 through. So the save half is asserted over the REAL
// SOURCE TEXT of `serializeBeam` and of `ProjectLoader`'s beam payload — the same
// method `L999SideFinishSurvivesReload.test.ts` uses, and for the same reason. The
// limitation is named here rather than papered over.
//
// ⚠ NOT PROVEN, and deliberately so: that `beam.setMaterial` can author this. It
// CANNOT — the verb still refuses, because the bus hands it a detached plugin DTO
// store. That refusal was NARROWED (its data-model clause became false today) and
// NOT lifted. See `plugins/beam/src/handlers/SetBeamMaterial.ts`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProjectContext } from '@pryzm/core-app-model';
import { BeamStore } from '@pryzm/core-app-model/stores';
import { CreateBeamCommand } from '@pryzm/command-registry';
import { materialHex } from '@pryzm/schemas/materials';

const REPO = resolve(__dirname, '../../..');
const LEVEL_ID = 'L0';
const LEVEL = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };

const src = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

/** The FOUR things `CreateBeamCommand` reads, and no more — a counter, not a BimKernel. */
function ctxFor(beamStore: BeamStore): any {
  return {
    bimManager: {
      getLevelById: (id: string) => (id === LEVEL_ID ? { ...LEVEL } : undefined),
      getLevels: () => [{ ...LEVEL }],
      registerElement: () => {},
      unregisterElement: () => {},
    },
    stores: {
      beamStore,
      wallStore: {
        activeLevelId: LEVEL_ID,
        getLevels: () => [{ ...LEVEL }],
      },
    },
  };
}

describe('C100 §2.1 — a beam material survives the trip out to a snapshot and back', () => {
  it('⭐ RELOAD HALF, EXECUTED — CreateBeamCommand carries materialId onto the record', () => {
    // This is the exact call `ProjectLoader` makes when rebuilding a saved beam.
    const store = new BeamStore(new ProjectContext());
    const cmd = new CreateBeamCommand({
      beamId: 'b-reload',
      startPoint: { x: 0, y: 3, z: 0 },
      endPoint: { x: 4, y: 3, z: 0 },
      width: 0.3,
      depth: 0.5,
      levelId: LEVEL_ID,
      materialId: 'concrete-reinforced',
    });
    const r = cmd.execute(ctxFor(store));
    expect(r.success, 'the command must succeed').toBe(true);

    const restored = store.getAll().find((b) => b.id === 'b-reload') as any;
    expect(restored, 'the beam must be in the store').toBeTruthy();
    expect(
      restored.materialId,
      'a reloaded beam that named a material must still name it',
    ).toBe('concrete-reinforced');

    // …and the id it kept is one the master can actually resolve, or the beam
    // would reload straight into magenta (S14's defect: eight ids were dot-case
    // against a kebab-case master and every one resolved to `undefined`).
    expect(materialHex(restored.materialId)).toBeTruthy();
  });

  it('⭐ the id is DROPPED when absent, not defaulted to something plausible', () => {
    // C100 §5 / §CONTEXT-DATA-HONESTY: "this beam names no material" and "this beam
    // names concrete" must never be the same stored value. A loader that helpfully
    // filled in a default would make every legacy beam claim a material it never had.
    const store = new BeamStore(new ProjectContext());
    new CreateBeamCommand({
      beamId: 'b-plain',
      startPoint: { x: 0, y: 3, z: 0 },
      endPoint: { x: 4, y: 3, z: 0 },
      width: 0.3, depth: 0.5, levelId: LEVEL_ID,
    }).execute(ctxFor(store));

    const plain = store.getAll().find((b) => b.id === 'b-plain') as any;
    expect(plain.materialId).toBeUndefined();
  });

  it('SAVE HALF, by source parity — serializeBeam writes materialId', () => {
    // ⚠ Source text, not an executed save. See the header for why, and for what
    // that costs. The risk this covers is the real one: `serializeBeam` is a
    // HAND-WRITTEN field list, and a field missing from it is silently dropped.
    const s = src('apps/editor/src/engine/persistence/ProjectSerializer.ts');
    const fn = s.slice(s.indexOf('function serializeBeam'));
    const body = fn.slice(0, fn.indexOf('\n}'));

    expect(body, 'serializeBeam must write the master material id').toContain('materialId: b.materialId');

    // ⚠ AND `material` IS NOT THAT FIELD. It is a free-form descriptive string that
    // nothing resolves against the master. ARM D was wrong about three of six
    // findings by testing ONE SPELLING; asserting both here keeps the distinction
    // visible so a later reader does not "simplify" them into one.
    expect(body).toContain('material: b.material');
  });

  it('SAVE HALF, by source parity — ProjectLoader READS materialId back', () => {
    // ⭐ THE HALF THE SLAB DEFECT (ARM E) WAS. `serializeSlab` had always WRITTEN
    // `materialId`; `ProjectLoader`'s payload never listed it, so the id was
    // correct in the file and absent from the reloaded element. Writing without
    // reading is not persistence.
    const s = src('apps/editor/src/engine/persistence/ProjectLoader.ts');
    const i = s.indexOf('new CreateBeamCommand');
    expect(i, 'the loader must construct a CreateBeamCommand').toBeGreaterThan(-1);
    const payload = s.slice(i, s.indexOf('});', i));

    expect(payload, 'the loader payload must list materialId').toContain('materialId: b.materialId');
  });

  it('the COMMAND accepts materialId — the third link, and the one with no fallback', () => {
    // A serializer that writes and a loader that reads are both useless if the
    // command in between drops the field on the floor. It is a hand-written input
    // interface AND a hand-written record construction, so both are pinned.
    const s = src('packages/command-registry/src/beam/CreateBeamCommand.ts');
    expect(s, 'the input interface must declare materialId').toContain('materialId?: string;');
    expect(s, 'the constructed record must stamp it').toContain('materialId: this.input.materialId,');
  });

  it('the RUNTIME record declares materialId — ARM F, the field that did not exist', () => {
    // The distinction C100 §9.7 draws and ARM D structurally cannot see: this is
    // "there is no field to drop", which needs a schema change, not a serializer fix.
    const s = src('packages/core-app-model/src/stores/BeamTypes.ts');
    expect(s, 'BeamData must declare the master material reference').toContain('materialId?: string;');
  });
});
