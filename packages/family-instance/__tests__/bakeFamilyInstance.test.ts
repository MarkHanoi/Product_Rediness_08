// bakeFamilyInstance — door extrusion produces a deterministic descriptor.

import { describe, it, expect } from 'vitest';
import type { FamilyDocument, FamilyManifest } from '@pryzm/file-format';
import { bakeFamilyInstance, FamilyBakeError } from '../src/index.js';

const NOW = '2026-04-28T12:00:00.000Z';

function makeDoorFamily(): { manifest: FamilyManifest; document: FamilyDocument; schemaHash: string } {
  const document: FamilyDocument = {
    formatVersion: '1.0',
    referencePlanes: [
      { id: 'plane_01HZ00000000000000000PNE01', name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: 'par_01HZ00000000000000000HGT01', name: 'Height', kind: 'type', dataType: 'length', defaultValue: 2100, expression: null, ifcMapping: null, exposed: true },
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
      { id: 'typ_01HZ00000000000000000DEF01', name: 'Default', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
    ],
    defaults: {},
  };
  const manifest: FamilyManifest = {
    formatVersion: '1.0', id: 'fam_01HZ00000000000000000FAM01', name: 'TestDoor', semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'Test' },
    description: '', ifcEntity: 'IfcDoor', category: 'Door', tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: NOW, lastModifiedAt: NOW,
  };
  return { manifest, document, schemaHash: manifest.schemaHash };
}

describe('bakeFamilyInstance', () => {
  it('bakes a door extrusion and returns a BufferGeometryDescriptor', async () => {
    const fam = makeDoorFamily();
    const result = await bakeFamilyInstance({
      family: fam,
      typeId: 'typ_01HZ00000000000000000DEF01',
    });
    expect(result.ok).toBe(true);
    expect(result.baked).toHaveLength(1);
    expect(result.unsupported).toHaveLength(0);
    const baked = result.baked[0]!;
    expect(baked.kind).toBe('extrude');
    expect(baked.descriptor.position.length).toBeGreaterThan(0);
    expect(baked.descriptor.index.length).toBeGreaterThan(0);
    // Height resolves to 2100mm = 2.1m; descriptor positions should
    // include vertices within that range.
    let maxY = -Infinity;
    const ys = baked.descriptor.position;
    for (let i = 1; i < ys.length; i += 3) {
      if (ys[i]! > maxY) maxY = ys[i]!;
    }
    expect(maxY).toBeGreaterThan(2.0);
    expect(maxY).toBeLessThan(2.2);
  });

  it('honours instance overrides on a length parameter', async () => {
    const fam = makeDoorFamily();
    const result = await bakeFamilyInstance({
      family: fam,
      typeId: 'typ_01HZ00000000000000000DEF01',
      // Override Height to 3000mm = 3.0m.
      instanceOverrides: { 'par_01HZ00000000000000000HGT01': 3000 },
    });
    expect(result.ok).toBe(true);
    let maxY = -Infinity;
    const ys = result.baked[0]!.descriptor.position;
    for (let i = 1; i < ys.length; i += 3) {
      if (ys[i]! > maxY) maxY = ys[i]!;
    }
    expect(maxY).toBeGreaterThan(2.9);
    expect(maxY).toBeLessThan(3.1);
  });

  it('is deterministic — re-baking yields byte-identical descriptor positions', async () => {
    const fam = makeDoorFamily();
    const a = await bakeFamilyInstance({ family: fam, typeId: 'typ_01HZ00000000000000000DEF01' });
    const b = await bakeFamilyInstance({ family: fam, typeId: 'typ_01HZ00000000000000000DEF01' });
    expect(a.baked[0]!.descriptor.position).toEqual(b.baked[0]!.descriptor.position);
    expect(a.baked[0]!.descriptor.index).toEqual(b.baked[0]!.descriptor.index);
  });

  it('throws FamilyBakeError on unknown typeId', async () => {
    const fam = makeDoorFamily();
    await expect(
      bakeFamilyInstance({ family: fam, typeId: 'typ_DOES_NOT_EXIST' }),
    ).rejects.toBeInstanceOf(FamilyBakeError);
  });

  it('reports unsupported solid kinds (sweep/loft/revolve gated on S57 solver)', async () => {
    const fam = makeDoorFamily();
    const document: FamilyDocument = {
      ...fam.document,
      solids: [
        ...fam.document.solids,
        {
          id: 'sol_01HZ00000000000000000SWP01',
          kind: 'sweep',
          profileId: 'prof_01HZ00000000000000000DRP01',
          pathProfileId: 'prof_01HZ00000000000000000DRP01',
          materialSlotId: null,
          lod: { coarse: false, medium: true, fine: true },
        },
      ],
    };
    const result = await bakeFamilyInstance({
      family: { ...fam, document },
      typeId: 'typ_01HZ00000000000000000DEF01',
    });
    expect(result.ok).toBe(true);
    expect(result.baked).toHaveLength(1);
    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0]!.reason).toBe('unsupported-feature');
  });
});
