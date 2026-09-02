// LANE 4B PROOF — the `.pryzm-family` v1.1 schema delta + the first real
// migrator, read back at the layer that actually persists.
//
// ⛔ IMPORTS THE LEAF MODULES, NOT `../../src/index.js`.  The package
//   barrel drags in `import/PDFToImageConverter.ts` -> `pdfjs-dist`,
//   which throws `ReferenceError: DOMMatrix is not defined` under the
//   package's own `environment: 'node'` vitest config.  That is why
//   `__tests__/family-round-trip.test.ts` — the suite C111 §1.2 cites as
//   the PROOF that ids survive save/load — collects ZERO TESTS at HEAD.
//   Pre-existing and NOT caused by this lane (see the lane findings doc);
//   routing around it is what lets this proof run at all.
//
// ⚠ EVERY IMPORT BELOW IS A `.js` SPECIFIER RESOLVING TO A COMMITTED
//   BUILD ARTEFACT (L-12876): vitest resolves `'./x.js'` to the real
//   `x.js`, while TypeScript resolves it to `x.ts`.  So THIS FILE
//   EXERCISES THE SAME BYTES THE PRODUCTION SERVER RUNS, and it only
//   does so because the lane regenerated those artefacts.  Before the
//   regeneration these arms passed against the OLD compiled code while
//   asserting on a field the source had already deleted.

import { describe, it, expect } from 'vitest';
import { packFamily } from '../../src/family-pack.js';
import { unpackFamily } from '../../src/family-unpack.js';
import {
  CURRENT_FORMAT_VERSION,
  FamilyDocumentSchema,
  FamilyManifestSchema,
  FAMILY_CATEGORIES_V1_0,
  CONNECTOR_KINDS_WITH_WRITER,
  classifyFormatVersion,
  compareFormatVersion,
  isSupportedFormatVersion,
  parseFormatVersion,
  type FamilyDocument,
  type FamilyManifest,
} from '../../src/family-schema.js';
import {
  MigratorRegistry,
  identityMigrator,
  migrateFamily,
  v1_0ToV1_1Migrator,
} from '../../src/family-migrations/index.js';
import type { RawFamily } from '../../src/family-migrations/types.js';

const NOW_ISO = '2026-04-28T12:00:00.000Z';
const FAM_ID = 'fam_01HZ00000000000000000FAM01';
const TYPE_ID = 'typ_01HZ00000000000000000DEF01';
const HEIGHT_ID = 'par_01HZ00000000000000000HGT01';
const WIDTH_ID = 'par_01HZ00000000000000000WHT01';
const FRAME_SOLID = 'sol_01HZ00000000000000000FRM01';
const GLASS_SOLID = 'sol_01HZ00000000000000000GZZ01';
const CUT_SOLID = 'sol_01HZ00000000000000000CTT01';
const PROFILE_ID = 'prof_01HZ00000000000000000WPR01';
const PLANE_ID = 'plane_01HZ00000000000000000PNE01';
const REP_ID = 'rep_01HZ00000000000000000MSH01';
const CONN_ID = 'conn_01HZ00000000000000000NST01';
const PSET_ID = 'pset_01HZ00000000000000000WND01';
const EMPTY_HASH =
  'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

/** A v1.1 Window definition exercising EVERY field the delta added. */
function makeV1_1Doc(): FamilyDocument {
  return {
    formatVersion: '1.1',
    referencePlanes: [
      { id: PLANE_ID, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: HEIGHT_ID, name: 'Height', kind: 'type', dataType: 'length', defaultValue: 1.5, expression: null, ifcMapping: null, exposed: true },
      { id: WIDTH_ID, name: 'Width', kind: 'type', dataType: 'length', defaultValue: 1.2, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles: [
      { id: PROFILE_ID, name: 'WindowPlan', planeId: PLANE_ID, entities: [], constraints: [] },
    ],
    solids: [
      { id: FRAME_SOLID, kind: 'extrude', profileId: PROFILE_ID, materialSlotId: null, lod: { coarse: false, medium: true, fine: true }, lengthExpression: 'Height', direction: { x: 0, y: 1, z: 0 } },
      { id: GLASS_SOLID, kind: 'extrude', profileId: PROFILE_ID, materialSlotId: null, lod: { coarse: false, medium: true, fine: true }, lengthExpression: 'Height', direction: { x: 0, y: 1, z: 0 } },
      // ⭐ D-7: the window can finally express "frame MINUS glazing void".
      { id: CUT_SOLID, kind: 'boolean', op: 'subtract', subjectSolidId: FRAME_SOLID, toolSolidId: GLASS_SOLID, materialSlotId: null, lod: { coarse: false, medium: true, fine: true } },
    ],
    materialSlots: [],
    types: [
      { id: TYPE_ID, name: 'Medium', values: { [HEIGHT_ID]: 1.5, [WIDTH_ID]: 1.2 }, checksum: EMPTY_HASH },
    ],
    representations: [
      { id: REP_ID, kind: 'mesh', source: 'derived', lod: { coarse: false, medium: true, fine: true } },
    ],
    connectors: [
      {
        id: CONN_ID,
        name: 'Wall insertion',
        kind: 'insertion',
        allowedHostClasses: ['Wall'],
        // ⛔ METRES (ADR-0376 D3 / C112 §2.1), and NO pose (C112 §2.3).
        demandedVoid: { width: 1.2, height: 1.5, sillHeight: 0.9 },
      },
    ],
    propertySets: [
      { id: PSET_ID, name: 'Pset_WindowCommon', properties: [{ name: 'FrameMaterial', dataType: 'string', value: 'Aluminium' }] },
    ],
    featureEdges: [{ from: CUT_SOLID, to: GLASS_SOLID, kind: 'consumes' }],
  };
}

function makeManifest(formatVersion = '1.1'): FamilyManifest {
  return {
    formatVersion,
    id: FAM_ID,
    name: 'TestWindow',
    semver: '1.0.0',
    author: { id: 'u1', displayName: 'Test' },
    description: '',
    ifcEntity: 'IfcWindow',
    category: 'Window',
    tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: EMPTY_HASH,
    createdAt: NOW_ISO,
    lastModifiedAt: NOW_ISO,
  };
}

/* ================================================================== */
/* §PROOF-ROUND-TRIP — the lane's stated acceptance                    */
/* ================================================================== */

describe('§PROOF-ROUND-TRIP — pack -> unpack -> identical schemaHash', () => {
  it('round-trips a v1.1 document carrying EVERY added field, hash-identical', async () => {
    const packed = await packFamily({ manifest: makeManifest(), document: makeV1_1Doc() });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;

    const read = await unpackFamily({ bytes: packed.bytes, verifySchemaHash: true });
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    // ⭐ The acceptance: the hash the writer stamped is the hash the
    //   reader re-derives from the bytes it actually read back.
    expect(read.schemaHash).toBe(packed.schemaHash);
    expect(read.telemetry.schemaHashVerified).toBe(true);

    // …and re-packing what was read reproduces the same hash, so the
    //   added fields are STABLE under canonicalisation and not merely
    //   accepted once.
    const repacked = await packFamily({ manifest: read.manifest, document: read.document });
    expect(repacked.ok).toBe(true);
    if (!repacked.ok) return;
    expect(repacked.schemaHash).toBe(packed.schemaHash);
  });

  it('carries every added field through the ZIP with its value intact', async () => {
    const packed = await packFamily({ manifest: makeManifest(), document: makeV1_1Doc() });
    if (!packed.ok) throw new Error('pack failed');
    const read = await unpackFamily({ bytes: packed.bytes });
    if (!read.ok) throw new Error('unpack failed: ' + read.message);
    const d = read.document;

    expect(d.formatVersion).toBe('1.1');
    expect(read.manifest.formatVersion).toBe('1.1');

    const bool = d.solids.find((s) => s.kind === 'boolean');
    expect(bool).toBeDefined();
    expect(bool && 'op' in bool && bool.op).toBe('subtract');

    expect(d.representations[0]?.kind).toBe('mesh');
    expect(d.representations[0]?.source).toBe('derived');
    expect(d.connectors[0]?.kind).toBe('insertion');
    expect(d.connectors[0]?.demandedVoid?.width).toBe(1.2);
    expect(d.propertySets[0]?.properties[0]?.value).toBe('Aluminium');
    expect(d.featureEdges[0]?.kind).toBe('consumes');
  });

  /* ---------------------------------------------------------------- */
  /* ⭐ FALSIFICATION — the round-trip must be ABLE to fail, and must   */
  /*    NAME the field that broke.  A hash check that cannot go red is  */
  /*    not evidence.                                                   */
  /* ---------------------------------------------------------------- */
  it('FALSIFIER: corrupting ONE migrated field breaks the round-trip and names it', async () => {
    const packed = await packFamily({ manifest: makeManifest(), document: makeV1_1Doc() });
    if (!packed.ok) throw new Error('pack failed');

    // Corrupt exactly one field of the migrated delta — the connector's
    // demanded void, in the one way C112 §2.5 forbids (a non-positive
    // opening: a void that demands nothing is not a demand).
    const corrupted = makeV1_1Doc();
    (corrupted.connectors[0] as { demandedVoid: { width: number } }).demandedVoid.width = -1;

    const repack = await packFamily({ manifest: makeManifest(), document: corrupted });
    expect(repack.ok).toBe(false);
    if (repack.ok) return;
    expect(repack.reason).toBe('document-invalid');
    // ⭐ It names the FIELD, not merely "invalid".
    expect(repack.message).toContain('connectors');
    expect(repack.message).toContain('demandedVoid');
  });

  it('FALSIFIER (control): a DIFFERENT value changes the hash, so equality above is meaningful', async () => {
    const a = await packFamily({ manifest: makeManifest(), document: makeV1_1Doc() });
    const mutated = makeV1_1Doc();
    mutated.propertySets[0]!.properties[0]!.value = 'Timber';
    const b = await packFamily({ manifest: makeManifest(), document: mutated });
    if (!a.ok || !b.ok) throw new Error('pack failed');
    expect(b.schemaHash).not.toBe(a.schemaHash);
  });
});

/* ================================================================== */
/* §PROOF-D1 — C111 delta D-1's literal proof obligation               */
/* ================================================================== */

describe('§PROOF-D1 — a version bump can now complete', () => {
  // C111 D-1, verbatim: "the probe goes green for identityMigrator
  // ('1.0','1.1') WITH `validateExit` LEFT AT ITS DEFAULT."
  it('identityMigrator(1.0 -> 1.1) completes with validateExit at its DEFAULT', () => {
    const r = new MigratorRegistry();
    r.register(identityMigrator('1.0', '1.1'));
    const input: RawFamily = {
      manifest: makeManifest('1.0'),
      document: { ...makeV1_1Doc(), formatVersion: '1.0' },
    };
    // ⛔ NO `{ validateExit: false }`. C111 §12 R-9 / §8.4-d: converting an
    //    unsatisfiable gate into an ABSENT one is strictly worse.
    const out = migrateFamily(input, r, '1.1');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.steps).toHaveLength(1);
    expect(out.family.document.formatVersion).toBe('1.1');
    expect(out.exitSchemaErrors ?? []).toEqual([]);
  });

  it('the registered v1.0->v1.1 migrator drops the dead `defaults` channel', () => {
    const r = new MigratorRegistry();
    r.register(v1_0ToV1_1Migrator);
    const legacy = { ...makeV1_1Doc(), formatVersion: '1.0' } as FamilyDocument & {
      defaults?: Record<string, unknown>;
    };
    legacy.defaults = { [HEIGHT_ID]: 2100 };

    const out = migrateFamily({ manifest: makeManifest('1.0'), document: legacy }, r, '1.1');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // D-5: the second channel is gone, on BOTH sides of the bump.
    expect('defaults' in out.family.document).toBe(false);
    // …and BOTH version fields moved together (they did not, before).
    expect(out.family.document.formatVersion).toBe('1.1');
    expect(out.family.manifest.formatVersion).toBe('1.1');
  });

  it('refuses an incoherent bundle NAMING BOTH numbers (C16 CA-18)', () => {
    const r = new MigratorRegistry();
    r.register(v1_0ToV1_1Migrator);
    const out = migrateFamily(
      {
        manifest: makeManifest('1.1'), // manifest says 1.1
        document: { ...makeV1_1Doc(), formatVersion: '1.0' }, // document says 1.0
      },
      r,
      '1.1',
      { validateEntry: false },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toContain('1.1');
    expect(out.message).toContain('1.0');
    expect(out.message).toContain('incoherent');
  });
});

/* ================================================================== */
/* §PROOF-VERSION-COMPARABLE — C111 §8.4-b/c                           */
/* ================================================================== */

describe('§PROOF-VERSION-COMPARABLE', () => {
  it('parses and ORDERS versions (the literal could do neither)', () => {
    expect(parseFormatVersion('1.10')).toEqual({ major: 1, minor: 10 });
    expect(parseFormatVersion('nope')).toBeNull();
    expect(compareFormatVersion('1.0', '1.1')).toBe(-1);
    expect(compareFormatVersion('1.10', '1.9')).toBe(1);
    expect(compareFormatVersion('2.0', '1.9')).toBe(1);
    expect(compareFormatVersion('1.1', '1.1')).toBe(0);
    // ⛔ A comparison against a non-version is NOT 0.
    expect(compareFormatVersion('1.0', 'nope')).toBeNull();
  });

  it('DISTINGUISHES unparseable from future-major (they are different facts)', () => {
    expect(classifyFormatVersion('1.1')).toBe('supported');
    expect(classifyFormatVersion('1.0')).toBe('supported');
    expect(classifyFormatVersion('1.2')).toBe('future-minor');
    expect(classifyFormatVersion('2.0')).toBe('future-major');
    expect(classifyFormatVersion('banana')).toBe('unparseable');
    expect(isSupportedFormatVersion('2.0')).toBe(false);
  });

  // C111 §8.4-c — the branch that was UNREACHABLE FOR EVERY INPUT, covered
  // by a test that feeds `unpackFamily` (NOT `unpack`) a future file.
  it('unpackFamily REACHES `unsupported-future-version` for a v2.0 file, with upgrade advice', async () => {
    const packed = await packFamily({
      manifest: makeManifest('2.0'),
      document: { ...makeV1_1Doc(), formatVersion: '2.0' },
    });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;

    const read = await unpackFamily({ bytes: packed.bytes });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    // ⭐ BEFORE v1.1 this read `manifest-invalid`: the user was told their
    //   file was MALFORMED rather than that their PRYZM was old.
    expect(read.reason).toBe('unsupported-future-version');
    expect(read.message).toContain('2.0');
    expect(read.message).toContain('upgrade PRYZM');
  });

  it('a MALFORMED version is still refused as malformed, not as "newer"', () => {
    const bad = FamilyManifestSchema.safeParse({ ...makeManifest(), formatVersion: 'banana' });
    expect(bad.success).toBe(false);
  });
});

/* ================================================================== */
/* §PROOF-DELTA-INVARIANTS — the clauses that are easy to "tidy" away  */
/* ================================================================== */

describe('§PROOF-DELTA-INVARIANTS', () => {
  it('C112 §2.2: a MISSING allowedHostClasses stays MISSING, an EMPTY one stays EMPTY', () => {
    const doc = makeV1_1Doc();
    delete (doc.connectors[0] as { allowedHostClasses?: string[] }).allowedHostClasses;
    const parsed = FamilyDocumentSchema.parse(doc);
    // ⛔ If someone "tidies" this to `.default([])`, THIS ASSERTION IS THE
    //    ONE THAT BREAKS. Missing means "not yet declared" and must refuse
    //    as UNKNOWN; empty means "joins nothing". Different values.
    expect('allowedHostClasses' in parsed.connectors[0]!).toBe(false);

    const doc2 = makeV1_1Doc();
    doc2.connectors[0]!.allowedHostClasses = [];
    expect(FamilyDocumentSchema.parse(doc2).connectors[0]!.allowedHostClasses).toEqual([]);
  });

  it('C112 §2.3: the schema REFUSES a connector that stores its own pose', () => {
    const doc = makeV1_1Doc();
    (doc.connectors[0] as Record<string, unknown>).position = { x: 1, y: 2, z: 3 };
    (doc.connectors[0] as Record<string, unknown>).normal = { x: 0, y: 1, z: 0 };
    const parsed = FamilyDocumentSchema.parse(doc);
    // Zod strips them: the pose CANNOT be persisted, so no stale second
    // copy can ever survive a save. C15 §2.1 stays the single authority.
    expect('position' in parsed.connectors[0]!).toBe(false);
    expect('normal' in parsed.connectors[0]!).toBe(false);
  });

  it('C112 §2.4: `direction` and `compatibility` are NOT mintable yet', () => {
    const doc = makeV1_1Doc();
    (doc.connectors[0] as Record<string, unknown>).direction = 'supply';
    (doc.connectors[0] as Record<string, unknown>).compatibility = { systemTag: 'waste' };
    const parsed = FamilyDocumentSchema.parse(doc);
    expect('direction' in parsed.connectors[0]!).toBe(false);
    expect('compatibility' in parsed.connectors[0]!).toBe(false);
  });

  it('C112 §2.2: both writer-bearing connector kinds parse; parked members remain declared', () => {
    for (const kind of CONNECTOR_KINDS_WITH_WRITER) {
      const doc = makeV1_1Doc();
      doc.connectors[0]!.kind = kind;
      expect(FamilyDocumentSchema.safeParse(doc).success).toBe(true);
    }
    // C71 §2.4 — a parked member may not be deleted.
    for (const parked of ['mep', 'structural', 'facade', 'attachment'] as const) {
      const doc = makeV1_1Doc();
      (doc.connectors[0] as { kind: string }).kind = parked;
      expect(FamilyDocumentSchema.safeParse(doc).success).toBe(true);
    }
  });

  it('C69 §1.1: no v1.0 category was dropped by the widening', () => {
    for (const legacy of FAMILY_CATEGORIES_V1_0) {
      const m = FamilyManifestSchema.safeParse({ ...makeManifest(), category: legacy });
      expect(m.success).toBe(true);
    }
    // …and the spec §61 additions parse.
    for (const added of ['Wall', 'Roof', 'CurtainWall', 'MEPComponent', 'CustomSystem'] as const) {
      expect(FamilyManifestSchema.safeParse({ ...makeManifest(), category: added }).success).toBe(true);
    }
    // ⛔ And "Generic Component" was NOT spelled a second way (C84 EI-9).
    expect(FamilyManifestSchema.safeParse({ ...makeManifest(), category: 'GenericComponent' }).success).toBe(false);
  });

  it('the boolean feature reuses the FROZEN geometry-kernel BooleanOp spellings', () => {
    for (const op of ['union', 'subtract', 'intersect'] as const) {
      const doc = makeV1_1Doc();
      (doc.solids[2] as { op: string }).op = op;
      expect(FamilyDocumentSchema.safeParse(doc).success).toBe(true);
    }
    // ⛔ A rival vocabulary must NOT parse — that is what keeps the two
    //    declarations from drifting into a translation table.
    for (const rival of ['difference', 'intersection', 'minus']) {
      const doc = makeV1_1Doc();
      (doc.solids[2] as { op: string }).op = rival;
      expect(FamilyDocumentSchema.safeParse(doc).success).toBe(false);
    }
  });

  it('§5.3-b: `defaults` cannot be smuggled back in through a parse', () => {
    const doc = { ...makeV1_1Doc(), defaults: { [HEIGHT_ID]: 2100 } };
    const parsed = FamilyDocumentSchema.parse(doc);
    expect('defaults' in parsed).toBe(false);
  });

  it('CURRENT_FORMAT_VERSION is what a fresh document declares', () => {
    expect(CURRENT_FORMAT_VERSION).toBe('1.1');
    expect(makeV1_1Doc().formatVersion).toBe(CURRENT_FORMAT_VERSION);
  });
});

/* ================================================================== */
/* §ENTRY-GATE-BLOCKS-NARROWING — a SECOND unsatisfiable gate, one     */
/* level up from C111 §8.2's exit gate.  Measured, not asserted.       */
/*                                                                     */
/* C111 §8.2 found that `migrateFamily` validated the RESULT against   */
/* the current schema, so no migrator could complete a version bump.   */
/* This lane fixed that.  But `collectSchemaErrors` is called TWICE —  */
/* on ENTRY as well as on exit — with THE SAME `FamilyDocumentSchema`. */
/*                                                                     */
/* So the SOURCE document must already satisfy the CURRENT schema.     */
/* A migration that NARROWS anything therefore rejects its own input   */
/* before it runs: the very document it exists to repair cannot get    */
/* through the door.  Only WIDENING migrations are expressible — which */
/* is exactly why every field v1.1 adds is optional or defaulted, and  */
/* why C111 D-12's `ent_`/`con_`/`evt_` prefixes could NOT ride in this */
/* bump despite §8.4-e asking for them.  Fixing it needs a per-version  */
/* schema pair (a mechanism change), not a field change.  OWED.        */
/*                                                                     */
/* `types: .min(1)` is used as the narrowing stand-in because it is a  */
/* REAL constraint already in the current schema — no hypothetical.    */
/* ================================================================== */

describe('§ENTRY-GATE-BLOCKS-NARROWING', () => {
  it('CONTROL: a document satisfying the current schema migrates normally', () => {
    const r = new MigratorRegistry();
    r.register(identityMigrator('1.0', '1.1'));
    const out = migrateFamily(
      { manifest: makeManifest('1.0'), document: { ...makeV1_1Doc(), formatVersion: '1.0' } },
      r,
      '1.1',
    );
    expect(out.ok).toBe(true);
  });

  it('PROBE: a repairing migrator NEVER RUNS — the entry gate rejects the document it exists to repair', () => {
    const r = new MigratorRegistry();
    let migratorRan = false;
    r.register({
      id: 'seed-a-default-type',
      from: '1.0',
      to: '1.1',
      description: 'repairs a document that has no types by seeding one',
      apply(input) {
        migratorRan = true;
        return {
          ...input,
          manifest: { ...input.manifest, formatVersion: '1.1' },
          document: {
            ...input.document,
            formatVersion: '1.1',
            types: [{ id: TYPE_ID, name: 'Default', values: {}, checksum: EMPTY_HASH }],
          },
        };
      },
    });

    const unrepaired = { ...makeV1_1Doc(), formatVersion: '1.0', types: [] as never };
    const out = migrateFamily({ manifest: makeManifest('1.0'), document: unrepaired }, r, '1.1');

    expect(out.ok).toBe(false);
    if (out.ok) return;
    // ⭐ THE FINDING: it did not fail because the migrator was wrong. The
    //   migrator never executed at all.
    expect(migratorRan).toBe(false);
    expect(out.reason).toBe('unknown-source-version');
    expect(out.message).toContain('entry schema invalid');
    expect(out.message).toContain('types');
  });

  it('FALSIFICATION CONTROL: the SAME migrator succeeds once the entry gate is lifted', () => {
    const r = new MigratorRegistry();
    let migratorRan = false;
    r.register({
      id: 'seed-a-default-type',
      from: '1.0',
      to: '1.1',
      description: 'repairs a document that has no types by seeding one',
      apply(input) {
        migratorRan = true;
        return {
          ...input,
          manifest: { ...input.manifest, formatVersion: '1.1' },
          document: {
            ...input.document,
            formatVersion: '1.1',
            types: [{ id: TYPE_ID, name: 'Default', values: {}, checksum: EMPTY_HASH }],
          },
        };
      },
    });

    const unrepaired = { ...makeV1_1Doc(), formatVersion: '1.0', types: [] as never };
    // ⛔ `validateEntry: false` IS NOT THE FIX — it is the ISOLATOR. It
    //    proves the migrator is correct and the GATE is what refused, the
    //    same way C111 §8.2's `validateExit: false` control did for the
    //    exit gate. Shipping either flag defaulted to false would convert
    //    an unsatisfiable gate into an absent one (§8.4-d / R-9).
    const out = migrateFamily(
      { manifest: makeManifest('1.0'), document: unrepaired },
      r,
      '1.1',
      { validateEntry: false },
    );

    expect(out.ok).toBe(true);
    expect(migratorRan).toBe(true);
    if (!out.ok) return;
    expect(out.family.document.types).toHaveLength(1);
    // …and the EXIT gate — left at its default — accepted the repair.
    expect(out.exitSchemaErrors ?? []).toEqual([]);
  });
});
