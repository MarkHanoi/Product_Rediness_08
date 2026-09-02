// family-migration — unit tests for the .pryzm-family migration
// framework (S57 §19.6 deliverable; spec gate name `family-migration`).
//
// Covers all 8 migrators required by the plan:
//   1. rename                    5. expression-introduction
//   2. add                       6. ifc-rebind
//   3. delete                    7. slot-merge
//   4. type-change               8. type-split
// Plus: identity migrator, registry chain runner, and the top-level
// migrateFamily orchestrator with entry+exit schema validation.

import { describe, it, expect } from 'vitest';
import {
  identityMigrator,
  makeAddParameterMigrator,
  makeChangeParameterTypeMigrator,
  makeDeleteParameterMigrator,
  makeIntroduceExpressionMigrator,
  makeMergeMaterialSlotsMigrator,
  makeRebindIfcMigrator,
  makeRenameParameterMigrator,
  makeSplitTypeMigrator,
  migrateFamily,
  MigratorRegistry,
} from '../../src/family-migrations/index.js';
import type {
  FamilyDocument,
  FamilyManifest,
} from '../../src/family-schema.js';
import type { RawFamily } from '../../src/family-migrations/index.js';

const NOW_ISO = '2026-04-28T12:00:00.000Z';
const HEIGHT_ID = 'par_01HZ00000000000000000HGT01';
const WIDTH_ID = 'par_01HZ00000000000000000WHT01';
const THK_ID = 'par_01HZ00000000000000000THK01';
const NEW_PAR_ID = 'par_01HZ00000000000000000NEW01';
const SOLID_ID = 'sol_01HZ00000000000000000DRS01';
const PROFILE_ID = 'prof_01HZ00000000000000000DRP01';
const PLANE_ID = 'plane_01HZ00000000000000000PNE01';
const TYPE_ID = 'typ_01HZ00000000000000000DEF01';
const NEW_TYPE_ID = 'typ_01HZ00000000000000000NEW01';
const SLOT_KEEP = 'slot_01HZ00000000000000000KP001';
const SLOT_REMOVE = 'slot_01HZ00000000000000000RM001';
const EMPTY_HASH =
  'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

function makeDoc(): FamilyDocument {
  return {
    formatVersion: '1.0',
    referencePlanes: [
      { id: PLANE_ID, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: HEIGHT_ID, name: 'Height', kind: 'type', dataType: 'length', defaultValue: 2100, expression: null, ifcMapping: { psetName: 'Pset_DoorCommon', propertyName: 'OverallHeight' }, exposed: true },
      { id: WIDTH_ID, name: 'Width', kind: 'type', dataType: 'length', defaultValue: 900, expression: null, ifcMapping: null, exposed: true },
      { id: THK_ID, name: 'Thickness', kind: 'type', dataType: 'length', defaultValue: 50, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles: [
      { id: PROFILE_ID, name: 'P', planeId: PLANE_ID, entities: [], constraints: [] },
    ],
    solids: [
      { id: SOLID_ID, kind: 'extrude', profileId: PROFILE_ID, materialSlotId: SLOT_REMOVE, lod: { coarse: false, medium: true, fine: true }, lengthExpression: 'Height', direction: { x: 0, y: 1, z: 0 } },
    ],
    materialSlots: [
      { id: SLOT_KEEP, name: 'Frame', defaultCategory: null },
      { id: SLOT_REMOVE, name: 'Panel', defaultCategory: null },
    ],
    types: [
      { id: TYPE_ID, name: 'Default', values: { [HEIGHT_ID]: 2100, [WIDTH_ID]: 900 }, checksum: EMPTY_HASH },
    ],
    // ⛔ `defaults` is GONE as of format v1.1 (C111 §5.3-b, delta D-5).
    //    Do not re-add it to this fixture to make an assertion pass.
  };
}

function makeManifest(): FamilyManifest {
  return {
    formatVersion: '1.0',
    id: 'fam_01HZ00000000000000000FAM01',
    name: 'TestDoor',
    semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'Test' },
    description: '',
    ifcEntity: 'IfcDoor',
    category: 'Door',
    tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: EMPTY_HASH,
    createdAt: NOW_ISO,
    lastModifiedAt: NOW_ISO,
  };
}

function makeFamily(): RawFamily {
  return { manifest: makeManifest(), document: makeDoc() };
}

/* ---------------------------------------------------------------- */
/* Op #1: rename                                                     */
/* ---------------------------------------------------------------- */

describe('rename-parameter', () => {
  it('renames the parameter and rewrites bare-identifier references in lengthExpression', () => {
    const fam = makeFamily();
    const m = makeRenameParameterMigrator('1.0', '1.0', { parameterId: HEIGHT_ID, newName: 'OverallHeight' });
    const out = m.apply(fam);
    expect(out.document.parameters.find((p) => p.id === HEIGHT_ID)!.name).toBe('OverallHeight');
    expect(out.document.solids[0]).toMatchObject({ lengthExpression: 'OverallHeight' });
    expect(fam.document.parameters.find((p) => p.id === HEIGHT_ID)!.name).toBe('Height');
  });

  it('throws on unknown parameter id', () => {
    expect(() =>
      makeRenameParameterMigrator('1.0', '1.0', { parameterId: 'par_does_not_exist', newName: 'X' }).apply(makeFamily()),
    ).toThrowError(/not found/);
  });

  it('only rewrites whole-word matches (Width does not become NewWidthMM)', () => {
    const fam = makeFamily();
    fam.document.solids[0] = { ...fam.document.solids[0], lengthExpression: 'WidthMM + Width' } as typeof fam.document.solids[0];
    const out = makeRenameParameterMigrator('1.0', '1.0', { parameterId: WIDTH_ID, newName: 'W' }).apply(fam);
    expect((out.document.solids[0] as { lengthExpression: string }).lengthExpression).toBe('WidthMM + W');
  });
});

/* ---------------------------------------------------------------- */
/* Op #2: add                                                        */
/* ---------------------------------------------------------------- */

describe('add-parameter', () => {
  // ⭐ THIS ARM WAS INVERTED, NOT DELETED (C111 §5.3-b, delta D-5).
  //   It read *"appends the parameter and seeds defaults when supplied"* and
  //   asserted `out.document.defaults[NEW_PAR_ID] === false` — i.e. it was
  //   the test that GUARDED the second default channel.  `document.defaults`
  //   was maintained by three ops and READ BY NO RESOLVER, so the value this
  //   arm protected could never reach a resolved parameter by any path.
  //   The arm is kept and turned around so the removal has a witness: a
  //   deleted test proves nothing, and someone re-adding the channel must
  //   now break an assertion that says why.
  it('appends the parameter and does NOT resurrect the dead `defaults` channel', () => {
    const fam = makeFamily();
    const m = makeAddParameterMigrator('1.0', '1.0', {
      parameter: { id: NEW_PAR_ID, name: 'HasGlazing', kind: 'type', dataType: 'boolean', defaultValue: false, expression: null, ifcMapping: null, exposed: true },
    });
    const out = m.apply(fam);
    expect(out.document.parameters.map((p) => p.id)).toContain(NEW_PAR_ID);
    // §5.3-a — `FamilyParameter.defaultValue` is the SOLE authority.
    expect(out.document.parameters.find((p) => p.id === NEW_PAR_ID)?.defaultValue).toBe(false);
    // §5.3-b/§5.3-c — and there is no second place to look.
    expect('defaults' in out.document).toBe(false);
  });

  it('rejects duplicate ids', () => {
    const fam = makeFamily();
    const m = makeAddParameterMigrator('1.0', '1.0', {
      parameter: { id: HEIGHT_ID, name: 'X', kind: 'type', dataType: 'length', defaultValue: null, expression: null, ifcMapping: null, exposed: true },
    });
    expect(() => m.apply(fam)).toThrowError(/already present/);
  });
});

/* ---------------------------------------------------------------- */
/* Op #3: delete                                                     */
/* ---------------------------------------------------------------- */

describe('delete-parameter', () => {
  it('removes the parameter and scrubs values (no `defaults` channel to scrub — D-5)', () => {
    const fam = makeFamily();
    const out = makeDeleteParameterMigrator('1.0', '1.0', { parameterId: WIDTH_ID }).apply(fam);
    expect(out.document.parameters.map((p) => p.id)).not.toContain(WIDTH_ID);
    expect(WIDTH_ID in out.document.types[0]!.values).toBe(false);
  });

  it('refuses when an extrude.lengthExpression still references the name', () => {
    const fam = makeFamily();
    expect(() =>
      makeDeleteParameterMigrator('1.0', '1.0', { parameterId: HEIGHT_ID }).apply(fam),
    ).toThrowError(/lengthExpression references/);
  });
});

/* ---------------------------------------------------------------- */
/* Op #4: change-parameter-type                                      */
/* ---------------------------------------------------------------- */

describe('change-parameter-type', () => {
  it('converts length (mm) → number (m) using the supplied converter', () => {
    const fam = makeFamily();
    const out = makeChangeParameterTypeMigrator('1.0', '1.0', {
      parameterId: WIDTH_ID,
      newDataType: 'number',
      valueConverter: (v) => (typeof v === 'number' ? v / 1000 : v),
    }).apply(fam);
    expect(out.document.parameters.find((p) => p.id === WIDTH_ID)!.dataType).toBe('number');
    expect(out.document.types[0]!.values[WIDTH_ID]).toBeCloseTo(0.9);
  });

  it('rejects no-op type changes', () => {
    expect(() =>
      makeChangeParameterTypeMigrator('1.0', '1.0', { parameterId: WIDTH_ID, newDataType: 'length', valueConverter: (v) => v }).apply(makeFamily()),
    ).toThrowError(/already has dataType/);
  });
});

/* ---------------------------------------------------------------- */
/* Op #5: introduce-expression                                       */
/* ---------------------------------------------------------------- */

describe('introduce-expression', () => {
  it('adds an expression and (optionally) clears type overrides', () => {
    const fam = makeFamily();
    const out = makeIntroduceExpressionMigrator('1.0', '1.0', { parameterId: WIDTH_ID, expression: 'Height / 2', clearTypeOverrides: true }).apply(fam);
    expect(out.document.parameters.find((p) => p.id === WIDTH_ID)!.expression).toBe('Height / 2');
    expect(WIDTH_ID in out.document.types[0]!.values).toBe(false);
  });

  /* ------------------------------------------------------------------ *
   * §SUPERSEDED-DEFAULT — ADR-0376 D4.
   *
   * ⛔ The arm above is the ORIGINAL, and it is the reason this defect
   *    shipped: it asserts the expression was WRITTEN and never asserts
   *    the `defaultValue` it was meant to replace was REMOVED. WIDTH_ID
   *    goes in with `defaultValue: 900`; the op left it there; the resolver
   *    then preferred it. Two green suites, one dead migration.
   * ------------------------------------------------------------------ */
  it('CLEARS the superseded defaultValue and keeps it as provenance (ADR-0376 D4)', () => {
    const fam = makeFamily();
    // The value that must not survive — asserted so this arm fails loudly if
    // the fixture ever stops carrying a default and quietly stops testing.
    expect(fam.document.parameters.find((p) => p.id === WIDTH_ID)!.defaultValue).toBe(900);

    const out = makeIntroduceExpressionMigrator('1.0', '1.0', {
      parameterId: WIDTH_ID,
      expression: 'Height / 2',
    }).apply(fam);

    const after = out.document.parameters.find((p) => p.id === WIDTH_ID)!;
    expect(after.expression).toBe('Height / 2');
    expect(after.defaultValue).toBeNull();
    expect(after.supersededDefault).toBe(900);
  });

  it('drops the superseded default entirely when recordSupersededDefault is false', () => {
    const fam = makeFamily();
    const out = makeIntroduceExpressionMigrator('1.0', '1.0', {
      parameterId: WIDTH_ID,
      expression: 'Height / 2',
      recordSupersededDefault: false,
    }).apply(fam);
    const after = out.document.parameters.find((p) => p.id === WIDTH_ID)!;
    expect(after.defaultValue).toBeNull();
    expect('supersededDefault' in after).toBe(false);
  });

  it('records nothing when there was no default to supersede', () => {
    const fam = makeFamily();
    fam.document.parameters = fam.document.parameters.map((p) =>
      p.id === WIDTH_ID ? { ...p, defaultValue: null } : p,
    );
    const out = makeIntroduceExpressionMigrator('1.0', '1.0', {
      parameterId: WIDTH_ID,
      expression: 'Height / 2',
    }).apply(fam);
    const after = out.document.parameters.find((p) => p.id === WIDTH_ID)!;
    expect(after.defaultValue).toBeNull();
    expect('supersededDefault' in after).toBe(false);
  });

  it('does not mutate the input family (Migrator.apply is pure)', () => {
    const fam = makeFamily();
    makeIntroduceExpressionMigrator('1.0', '1.0', { parameterId: WIDTH_ID, expression: 'Height / 2' }).apply(fam);
    const original = fam.document.parameters.find((p) => p.id === WIDTH_ID)!;
    expect(original.defaultValue).toBe(900);
    expect(original.expression).toBeNull();
  });

  it('leaves every OTHER parameter untouched', () => {
    const fam = makeFamily();
    const out = makeIntroduceExpressionMigrator('1.0', '1.0', { parameterId: WIDTH_ID, expression: 'Height / 2' }).apply(fam);
    const height = out.document.parameters.find((p) => p.id === HEIGHT_ID)!;
    expect(height.defaultValue).toBe(2100);
    expect(height.expression).toBeNull();
    expect('supersededDefault' in height).toBe(false);
  });
});

/* ---------------------------------------------------------------- */
/* Op #6: ifc-rebind                                                 */
/* ---------------------------------------------------------------- */

describe('rebind-ifc', () => {
  it('updates the in-document ifcMapping and the side-car entry', () => {
    const fam = makeFamily();
    fam.ifcMapping = { formatVersion: '1.0', predefinedType: null, parameters: [{ parameterId: HEIGHT_ID, psetName: 'Pset_DoorCommon', propertyName: 'OverallHeight' }] };
    const out = makeRebindIfcMigrator('1.0', '1.0', { parameterId: HEIGHT_ID, newPset: 'Pset_DoorCommonExt', newProperty: 'NominalHeight' }).apply(fam);
    expect(out.document.parameters.find((p) => p.id === HEIGHT_ID)!.ifcMapping).toEqual({ psetName: 'Pset_DoorCommonExt', propertyName: 'NominalHeight' });
    expect(out.ifcMapping!.parameters[0]).toMatchObject({ psetName: 'Pset_DoorCommonExt', propertyName: 'NominalHeight' });
  });

  it('clears the binding when newPset is null', () => {
    const fam = makeFamily();
    fam.ifcMapping = { formatVersion: '1.0', predefinedType: null, parameters: [{ parameterId: HEIGHT_ID, psetName: 'P', propertyName: 'X' }] };
    const out = makeRebindIfcMigrator('1.0', '1.0', { parameterId: HEIGHT_ID, newPset: null, newProperty: null }).apply(fam);
    expect(out.document.parameters.find((p) => p.id === HEIGHT_ID)!.ifcMapping).toBeNull();
    expect(out.ifcMapping!.parameters).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- */
/* Op #7: merge-material-slots                                       */
/* ---------------------------------------------------------------- */

describe('merge-material-slots', () => {
  it('rebinds solids and removes the redundant slot', () => {
    const fam = makeFamily();
    const out = makeMergeMaterialSlotsMigrator('1.0', '1.0', { keepSlotId: SLOT_KEEP, removeSlotId: SLOT_REMOVE }).apply(fam);
    expect(out.document.materialSlots.map((s) => s.id)).toEqual([SLOT_KEEP]);
    expect(out.document.solids[0]!.materialSlotId).toBe(SLOT_KEEP);
  });
});

/* ---------------------------------------------------------------- */
/* Op #8: split-type                                                 */
/* ---------------------------------------------------------------- */

describe('split-type', () => {
  it('clones the source type with overrides + recomputes checksum', () => {
    const fam = makeFamily();
    const out = makeSplitTypeMigrator('1.0', '1.0', { sourceTypeId: TYPE_ID, newTypeId: NEW_TYPE_ID, newTypeName: '1000 mm', valueOverrides: { [WIDTH_ID]: 1000 } }).apply(fam);
    expect(out.document.types).toHaveLength(2);
    const cloned = out.document.types.find((t) => t.id === NEW_TYPE_ID)!;
    expect(cloned.name).toBe('1000 mm');
    expect(cloned.values[WIDTH_ID]).toBe(1000);
    expect(cloned.values[HEIGHT_ID]).toBe(2100);
    expect(cloned.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(cloned.checksum).not.toBe(EMPTY_HASH);
  });
});

/* ---------------------------------------------------------------- */
/* Registry + identity migrator                                      */
/* ---------------------------------------------------------------- */

describe('MigratorRegistry', () => {
  it('runs an identity chain and returns the input unchanged structurally', () => {
    const r = new MigratorRegistry();
    r.register(identityMigrator('1.0', '1.0-bridge'));
    r.register(identityMigrator('1.0-bridge', '1.1'));
    const fam = makeFamily();
    fam.document.formatVersion = '1.0';
    const result = r.run(fam, '1.1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps).toHaveLength(2);
    expect(result.family.document.parameters).toEqual(fam.document.parameters);
  });

  it('returns no-path when no migrator is registered for the source version', () => {
    const r = new MigratorRegistry();
    const fam = makeFamily();
    const result = r.run(fam, '1.1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no-path');
  });

  it('rejects from===to migrators at registration time', () => {
    const r = new MigratorRegistry();
    expect(() => r.register({ id: 'bad', from: '1.0', to: '1.0', description: '', apply: (x) => x })).toThrowError(/infinite loop/);
  });

  it('short-circuits when source already equals target', () => {
    const r = new MigratorRegistry();
    const fam = makeFamily();
    const result = r.run(fam, '1.0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps).toHaveLength(0);
    expect(result.family).toBe(fam);
  });
});

/* ---------------------------------------------------------------- */
/* migrateFamily orchestrator (entry+exit schema validation)         */
/* ---------------------------------------------------------------- */

describe('migrateFamily', () => {
  it('runs an end-to-end chain that adds + renames + splits a type, then validates exit schema', () => {
    const r = new MigratorRegistry();
    r.register({
      id: 'compose-1.0->1.1',
      from: '1.0',
      to: '1.1',
      description: 'compose three ops',
      apply(input) {
        const a = makeAddParameterMigrator('1.0', '1.0', {
          parameter: { id: NEW_PAR_ID, name: 'HasGlazing', kind: 'type', dataType: 'boolean', defaultValue: null, expression: null, ifcMapping: null, exposed: true },
        }).apply(input);
        const b = makeRenameParameterMigrator('1.0', '1.0', { parameterId: HEIGHT_ID, newName: 'OverallHeight' }).apply(a);
        const c = makeSplitTypeMigrator('1.0', '1.0', { sourceTypeId: TYPE_ID, newTypeId: NEW_TYPE_ID, newTypeName: '1000 mm', valueOverrides: { [WIDTH_ID]: 1000 } }).apply(b);
        // ⭐ C111 §8.3 — THIS LINE USED TO READ:
        //      return { ...c, document: { ...c.document, formatVersion: '1.0' } };
        //   i.e. THE ONLY END-TO-END MIGRATION TEST PASSED BY WRITING THE OLD
        //   VERSION NUMBER BACK INTO THE MIGRATED DOCUMENT.  It was the
        //   workaround for §C111-MIGRATION-EXIT-UNSATISFIABLE, not a test of
        //   it: with `formatVersion` typed `z.literal('1.0')`, a document
        //   honestly stamped '1.1' failed `migrateFamily`'s own exit gate.
        //   ⛔ Do not restore the old line. The migrator now stamps the
        //   version it actually declares, and the exit gate accepts it —
        //   which is the D-1 proof obligation, asserted below.
        return {
          ...c,
          manifest: { ...c.manifest, formatVersion: '1.1' },
          document: { ...c.document, formatVersion: '1.1' },
        };
      },
    });
    const result = migrateFamily(makeFamily(), r, '1.1', { validateExit: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps).toHaveLength(1);
    expect(result.family.document.types).toHaveLength(2);
    expect(result.family.document.parameters.map((p) => p.id)).toContain(NEW_PAR_ID);
    expect(result.exitSchemaErrors ?? []).toEqual([]);
    // ⭐ D-1: the migrated document reports the version it was migrated TO,
    //   and BOTH fields agree.  Neither was assertable before v1.1.
    expect(result.family.document.formatVersion).toBe('1.1');
    expect(result.family.manifest.formatVersion).toBe('1.1');
  });

  it('reports exit schema errors when a migrator yields an invalid document', () => {
    const r = new MigratorRegistry();
    r.register({
      id: 'broken-1.0->1.1',
      from: '1.0',
      to: '1.1',
      description: 'corrupts manifest id',
      apply(input) {
        return { ...input, manifest: { ...input.manifest, id: 'not-a-ulid' } as typeof input.manifest };
      },
    });
    const result = migrateFamily(makeFamily(), r, '1.1', { validateEntry: false, validateExit: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/exit schema invalid/);
  });
});
