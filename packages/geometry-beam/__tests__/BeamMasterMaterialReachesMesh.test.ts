/**
 * ⭐ C100 §2.1 / §9.6.c / L-1127 ARM D+F — A BEAM'S `materialId` REACHES THE MESH,
 * AND SURVIVES SAVE/LOAD.
 *
 * ⚠ ITS OWN TEST, NOT A SHARED HARNESS (L-1127's standing instruction; C100 §9.3
 * retracted a slice for proving coverage with a test that never constructed its
 * subject). It drives the PRODUCTION `BeamFragmentBuilder` and reads the colour off
 * the material attached to the mesh it returns.
 *
 * ─── ⛔ THE DEFECT ──────────────────────────────────────────────────────────
 *
 * Every beam in the product got one of exactly TWO module-scoped material
 * singletons, chosen from `sectionType` and nothing else:
 *
 *   `_steelMat`    0x2a5080
 *   `_concreteMat` 0x2196f3   ← Material Design Blue 500
 *
 * A concrete beam is not bright blue; no beam could ever be anything else; and
 * `BeamData` carried no material field for one to be read from. The master's 205
 * rows were unreachable to the single most structural family in the model.
 *
 * ⭐ THIS IS THE ARM F SHAPE, WHICH IS NOT ARM D'S. C100 §9.7: *"the serializer
 * drops it"* and *"there is no field to drop"* are different defects with different
 * fixes, and ARM D can only ever see the first. Beam had BOTH — no field on the
 * runtime record AND no id in the serializer — so a fix to either alone would have
 * been invisible. Case 5 is the round-trip that pins them together.
 *
 * RED-FIRST, EXECUTED NOT ASSUMED — see the commit body for the run and its split.
 *
 * ⚠ WHAT THIS DOES NOT PROVE: that `beam.setMaterial` works. It does NOT — the verb
 * still refuses, because the bus hands it a detached plugin DTO store rather than
 * the geometry store this builder reads. That refusal was NARROWED (its data-model
 * clause is now false) and deliberately NOT lifted. See `SetBeamMaterial.ts`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { MATERIAL_CATALOG, materialHex } from '@pryzm/schemas/materials';
import { BeamFragmentBuilder } from '../src/BeamFragmentBuilder';
import type { BeamData } from '@pryzm/core-app-model/stores';

const g = globalThis as { __pryzmElementInstancingV1?: boolean };

function makeBeam(over: Partial<BeamData> = {}): BeamData {
  return {
    id: 'beam-mat-1',
    levelId: 'level-1',
    startPoint: { x: 0, y: 3, z: 0 },
    endPoint: { x: 4, y: 3, z: 0 },
    width: 0.3,
    depth: 0.5,
    loadBearing: true,
    sectionType: 'rectangular',
    properties: {},
    ...over,
  } as BeamData;
}

/** Records the MATERIAL the instanced path registers — the arg the real SpyBridge drops. */
class MatSpyBridge {
  mats: THREE.Material[] = [];
  register(_id: string, _lvl: string, _t: string, _tr: unknown, mat: unknown): void {
    this.mats.push(mat as THREE.Material);
  }
  unregister(): void {}
  updateTransform(): void {}
  isInstanced(): boolean { return false; }
}

const hex = (m: THREE.Material): string =>
  '#' + (m as THREE.MeshStandardMaterial).color.getHexString().toLowerCase();

/** Read from the master, NEVER transcribed. */
const masterHex = (id: string): string => {
  const rec = MATERIAL_CATALOG.find((m) => m.id === id);
  expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
  return rec!.color.toLowerCase();
};

/** The pre-fix answers, so the negatives are measured rather than remembered. */
const CONCRETE_BLUE = '#2196f3';
const STEEL_SLATE = '#2a5080';

describe('C100 §2.1 — a beam materialId reaches the material on the mesh', () => {
  let scene: THREE.Scene;
  let builder: BeamFragmentBuilder;

  beforeEach(() => {
    scene = new THREE.Scene();
    builder = new BeamFragmentBuilder(scene);
  });
  afterEach(() => { delete g.__pryzmElementInstancingV1; });

  const matOf = (beam: BeamData): THREE.Material =>
    (builder.build(beam) as THREE.Mesh).material as THREE.Material;

  it('⭐ 1. the MASTER\'s colour, not Material Design Blue 500', () => {
    const m = matOf(makeBeam({ materialId: 'concrete-reinforced' }));
    expect(hex(m)).toBe(masterHex('concrete-reinforced'));
    expect(hex(m), 'a concrete beam is not bright blue').not.toBe(CONCRETE_BLUE);
  });

  it('⭐ 2. two beams, two materials, two colours', () => {
    // An assertion on ONE material cannot see a resolver that ignores its
    // argument — the failure that made every handrail one brown (L-1127 S16) and
    // collapsed furniture's oak and walnut onto one grey-teal.
    const a = matOf(makeBeam({ id: 'b-a', materialId: 'concrete-reinforced' }));
    const b = matOf(makeBeam({ id: 'b-b', materialId: 'steel-structural' }));
    expect(hex(a)).toBe(masterHex('concrete-reinforced'));
    expect(hex(b)).toBe(masterHex('steel-structural'));
    expect(hex(a)).not.toBe(hex(b));
  });

  it('⭐ 3. INSTANCING SURVIVES — one material per COLOUR, shared by identity', () => {
    // ⭐ `InstancedElementRenderer`'s group key ends in `materialUuid`, so a
    // per-beam material would give a size-1 instance group PER BEAM and silently
    // destroy instancing for the family. `_sharedBeamMaterial` keys on
    // (colour, metalness, roughness), so the count tracks COLOURS.
    const mats: THREE.Material[] = [];
    for (let i = 0; i < 25; i++) {
      mats.push(matOf(makeBeam({ id: `b-inst-${i}`, materialId: 'concrete-reinforced' })));
    }
    // Identity, not equality: equal-but-distinct materials carry different uuids
    // and land in different groups, so `toBe` is the load-bearing assertion.
    for (const m of mats) expect(m).toBe(mats[0]);
    expect(hex(mats[0]!)).toBe(masterHex('concrete-reinforced'));
    expect(mats[0]!.type).toBe('MeshStandardMaterial');

    // And N distinct materials give N buckets — the complement a same-input loop
    // cannot see (a per-beam value would still have passed the loop above).
    const distinct = new Set(
      ['concrete-reinforced', 'steel-structural', 'concrete-precast'].map(
        (id, i) => hex(matOf(makeBeam({ id: `b-col-${i}`, materialId: id }))),
      ),
    );
    expect(distinct.size).toBe(3);
  });

  it('⭐ 4. the INSTANCED path gets the SAME resolved material — and steel stops taking the concrete blue', () => {
    // ⛔ A SECOND DEFECT, found while wiring: the instanced registration passed
    // `_concreteMat` UNCONDITIONALLY, so an instanced beam took the concrete blue
    // whatever its section type, while the fragment path gave a steel beam
    // `_steelMat`. The two render paths disagreed about the same beam.
    g.__pryzmElementInstancingV1 = true;
    const spy = new MatSpyBridge();
    builder.setInstanceBridge(spy as never);

    builder.build(makeBeam({ id: 'b-inst-mat', materialId: 'concrete-reinforced' }));
    expect(spy.mats).toHaveLength(1);
    expect(hex(spy.mats[0]!)).toBe(masterHex('concrete-reinforced'));
    expect(hex(spy.mats[0]!)).not.toBe(CONCRETE_BLUE);
  });

  it('5. an UNKNOWN id paints MAGENTA — never a plausible structural colour (§5)', () => {
    const m = matOf(makeBeam({ id: 'b-bad', materialId: 'not-a-real-material' }));
    expect(hex(m)).toBe('#ff00ff');
    // The concrete blue is the most dangerous available fallback here: it is what
    // every beam already looks like, so a lost material would have been literally
    // invisible (§CONTEXT-DATA-HONESTY).
    expect(hex(m)).not.toBe(CONCRETE_BLUE);
  });

  it('6. CONTROL — a beam naming NO material renders EXACTLY as it did before (§9.6.b)', () => {
    // `BeamData.materialId` did not exist until this commit, so this is every beam
    // in every existing project. Repainting them is the thing that would rightly
    // get this convergence reverted.
    expect(hex(matOf(makeBeam({ id: 'b-plain' })))).toBe(CONCRETE_BLUE);
  });

  it('⭐ 6b. THE ONE DELIBERATE REPAINT, scoped and named rather than hidden', () => {
    // ⚠ THIS CASE FAILED WHEN FIRST WRITTEN, and the failure was the useful kind:
    // I had asserted the old answer and the code gave a different one. Measured
    // rather than argued, the scope is EXACTLY ONE state — a beam whose
    // `sectionType` is UB/UC and whose `steelProfileName` names a profile that
    // `SteelProfileLibrary` does not have.
    //
    // Before: `_buildConcreteBeam` hard-coded `_concreteMat`, so a STEEL beam with
    // a broken profile reference rendered CONCRETE BLUE.
    // After:  `resolveBeamMaterial` reads `sectionType`, so it renders STEEL.
    //
    // ⭐ KEPT, NOT REVERTED, and the reasoning is the point. §9.6.b forbids
    // repainting the product, and the honest question is whether this is a repaint
    // or a second instance of the very defect being fixed. It is the second: the
    // render path was contradicting the element's own declared type, exactly as the
    // instanced path did by passing `_concreteMat` unconditionally (case 4). Forcing
    // concrete here to keep a control green would be PRESERVING A BUG TO KEEP A
    // NUMBER CLEAN.
    //
    // The blast radius is a state that already logs a warning and already falls back
    // to the wrong SHAPE (a box, not an I-section), so nothing silently changes for
    // a correctly-authored beam.
    const m = matOf(makeBeam({ id: 'b-steel-badprofile', sectionType: 'UB', steelProfileName: 'nope' }));
    expect(hex(m), 'a steel beam renders as steel even when its profile is missing').toBe(STEEL_SLATE);
    expect(hex(m)).not.toBe(CONCRETE_BLUE);

    // …and a VALID steel profile is untouched: still `_steelMat`, as before.
    const ok = matOf(makeBeam({ id: 'b-plain-rect' }));
    expect(hex(ok), 'a rectangular beam is unchanged').toBe(CONCRETE_BLUE);
  });

  it('7. the SECTION TYPE still chooses the SCALARS, the master only the COLOUR', () => {
    // A steel section stays metallic and a concrete one matte — those describe the
    // SECTION, not the material's colour, so they are deliberately not moved to the
    // master. Two beams of one material but different sections therefore share a
    // colour and differ in finish.
    const concrete = matOf(makeBeam({ id: 'b-sc', materialId: 'steel-structural' })) as THREE.MeshStandardMaterial;
    expect(hex(concrete)).toBe(masterHex('steel-structural'));
    expect(concrete.metalness).toBe(0.5);   // rectangular section scalars
    expect(concrete.roughness).toBe(0.2);
  });

  it('8. the ids this test names all resolve in the master (S14 guard)', () => {
    for (const id of ['concrete-reinforced', 'steel-structural', 'concrete-precast']) {
      expect(materialHex(id), `${id} must resolve in the master`).toBeTruthy();
    }
  });
});
