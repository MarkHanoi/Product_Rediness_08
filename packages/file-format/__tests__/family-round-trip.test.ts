// family-round-trip — unit tests for packFamily / unpackFamily.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §13
// (`family-round-trip` gate).  This file is the *unit-level* portion of
// the gate; the larger 50-document corpus drive lives in
// `tests/family-load-into-project/`.

import { describe, it, expect } from 'vitest';
import {
  packFamily,
  unpackFamily,
  type FamilyDocument,
  type FamilyEvent,
  type FamilyManifest,
} from '../src/index.js';

const NOW_ISO = '2026-04-28T12:00:00.000Z';

function makeDoorDoc(): FamilyDocument {
  return {
    formatVersion: '1.0',
    referencePlanes: [
      { id: 'plane_01HZ00000000000000000PNE01', name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: 'par_01HZ00000000000000000HGT01', name: 'Height', kind: 'type', dataType: 'length', defaultValue: 2100, expression: null, ifcMapping: { psetName: 'Pset_DoorCommon', propertyName: 'OverallHeight' }, exposed: true },
      { id: 'par_01HZ00000000000000000WHT01', name: 'Width', kind: 'type', dataType: 'length', defaultValue: 900, expression: null, ifcMapping: { psetName: 'Pset_DoorCommon', propertyName: 'OverallWidth' }, exposed: true },
      { id: 'par_01HZ00000000000000000THK01', name: 'Thickness', kind: 'type', dataType: 'length', defaultValue: 50, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles: [
      {
        id: 'prof_01HZ00000000000000000DRP01',
        name: 'DoorPlan',
        planeId: 'plane_01HZ00000000000000000PNE01',
        entities: [
          { id: '01HZE0000000000000000PT001', kind: 'point', data: { x: 0, z: 0 } },
          { id: '01HZE0000000000000000PT002', kind: 'point', data: { x: 0.9, z: 0 } },
          { id: '01HZE0000000000000000PT003', kind: 'point', data: { x: 0.9, z: 0.05 } },
          { id: '01HZE0000000000000000PT004', kind: 'point', data: { x: 0, z: 0.05 } },
        ],
        constraints: [],
      },
    ],
    solids: [
      {
        id: 'sol_01HZ00000000000000000DRS01',
        kind: 'extrude',
        profileId: 'prof_01HZ00000000000000000DRP01',
        materialSlotId: null,
        lod: { coarse: false, medium: true, fine: true },
        lengthExpression: 'Height',
        direction: { x: 0, y: 1, z: 0 },
      },
    ],
    materialSlots: [],
    types: [
      {
        id: 'typ_01HZ00000000000000000DEF01',
        name: 'Default',
        values: {},
        // sha256 of `{}` canonical-JSON; placeholder validated by Sha256 schema.
        checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
      },
    ],
    defaults: {},
  };
}

function makeManifest(schemaHash: string): FamilyManifest {
  return {
    formatVersion: '1.0',
    id: 'fam_01HZ00000000000000000FAM01',
    name: 'TestDoor',
    semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'PRYZM Test' },
    description: 'A door for the family-round-trip gate.',
    ifcEntity: 'IfcDoor',
    category: 'Door',
    tags: ['test'],
    minPRYZMVersion: '2.0.0',
    schemaHash,
    createdAt: NOW_ISO,
    lastModifiedAt: NOW_ISO,
  };
}

function makeEvents(): FamilyEvent[] {
  return [
    { id: '01HZEV00000000000000000EV1', ts: NOW_ISO, kind: 'family.created', payload: { who: 'test' } },
    { id: '01HZEV00000000000000000EV2', ts: NOW_ISO, kind: 'family.parameter.added', payload: { paramId: 'par_01HZ00000000000000000HGT01' } },
  ];
}

describe('packFamily / unpackFamily — round-trip', () => {
  it('round-trips a door document with parameters, profiles, solids, types, events', async () => {
    const document = makeDoorDoc();
    // Hash placeholder — packFamily re-stamps the manifest.schemaHash.
    const placeholderHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    const manifest = makeManifest(placeholderHash);
    const events = makeEvents();

    const packed = await packFamily({ manifest, document, events });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;

    const unpacked = await unpackFamily({ bytes: packed.bytes, verifySchemaHash: true });
    expect(unpacked.ok).toBe(true);
    if (!unpacked.ok) return;

    expect(unpacked.manifest.id).toBe(manifest.id);
    expect(unpacked.manifest.schemaHash).toBe(packed.schemaHash);
    expect(unpacked.document.parameters).toHaveLength(3);
    expect(unpacked.document.profiles).toHaveLength(1);
    expect(unpacked.document.solids).toHaveLength(1);
    expect(unpacked.document.types).toHaveLength(1);
    expect(unpacked.events).toHaveLength(2);
    expect(unpacked.ifcMapping.bindings.length).toBeGreaterThanOrEqual(2);
    expect(unpacked.telemetry.schemaHashVerified).toBe(true);
  });

  it('is byte-stable across re-packs of the same content (determinism gate)', async () => {
    const document = makeDoorDoc();
    const placeholderHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    const manifest = makeManifest(placeholderHash);
    const events = makeEvents();

    const packA = await packFamily({ manifest, document, events });
    const packB = await packFamily({ manifest, document, events });
    expect(packA.ok).toBe(true);
    expect(packB.ok).toBe(true);
    if (!packA.ok || !packB.ok) return;

    expect(packA.bytes.byteLength).toBe(packB.bytes.byteLength);
    expect(Buffer.from(packA.bytes).equals(Buffer.from(packB.bytes))).toBe(true);
  });

  it('round-trips byte-stable through unpack → re-pack', async () => {
    const document = makeDoorDoc();
    const manifest = makeManifest('sha256:0000000000000000000000000000000000000000000000000000000000000000');

    const packA = await packFamily({ manifest, document });
    expect(packA.ok).toBe(true);
    if (!packA.ok) return;

    const unpackA = await unpackFamily({ bytes: packA.bytes });
    expect(unpackA.ok).toBe(true);
    if (!unpackA.ok) return;

    const packB = await packFamily({
      manifest: unpackA.manifest,
      document: unpackA.document,
      events: unpackA.events,
    });
    expect(packB.ok).toBe(true);
    if (!packB.ok) return;

    expect(Buffer.from(packA.bytes).equals(Buffer.from(packB.bytes))).toBe(true);
  });

  it('rejects bytes that are not a ZIP', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5]);
    const result = await unpackFamily({ bytes: garbage });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not-a-zip');
    }
  });

  it('detects manifest-vs-document schema-hash mismatch when verification is enabled', async () => {
    const document = makeDoorDoc();
    const manifest = makeManifest('sha256:0000000000000000000000000000000000000000000000000000000000000000');
    const packA = await packFamily({ manifest, document });
    expect(packA.ok).toBe(true);
    if (!packA.ok) return;

    // Mutate the document fixture so the recomputed hash diverges from
    // the recorded one, then re-pack with the original recorded hash.
    const mutated = { ...document, defaults: { ...document.defaults, X: 1 } };
    const reusedManifest = { ...manifest, schemaHash: packA.schemaHash };
    // Build the ZIP manually-ish: pack with mutated doc but stomp the
    // signing/schema-hash entry afterwards.  Easier: pack with the
    // mutated doc, then overwrite signing/schema-hash to packA.schemaHash.
    const JSZip = (await import('jszip')).default;
    const packM = await packFamily({ manifest: reusedManifest, document: mutated });
    expect(packM.ok).toBe(true);
    if (!packM.ok) return;
    const z = await JSZip.loadAsync(packM.bytes);
    z.file('signing/schema-hash', packA.schemaHash);
    const tampered = await z.generateAsync({ type: 'uint8array' });

    const out = await unpackFamily({ bytes: tampered, verifySchemaHash: true });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('schema-hash-mismatch');
    }
  });
});
