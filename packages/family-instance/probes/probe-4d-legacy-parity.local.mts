// LANE 4D — BYTE-IDENTITY CONTROL for the v1 all-`point` profile path.
//
// The whole backward-compatibility claim of §4D-CLOSED-FORM-PROFILE is that a
// v1 document — every entity a bare `point`, every coordinate a numeric
// literal — bakes to the SAME descriptor before and after the rewrite. This
// probe prints a sha256 of the descriptor so the two states can be compared
// across a `git checkout --` of the source, rather than asserted in prose.
//
// Run it, revert the three src files, run it again, restore. Same hash or the
// claim is false.

import { createHash } from 'node:crypto';
import { bakeFamilyInstance } from '../src/bakeFamilyInstance.js';
import type { FamilyDocument, FamilyManifest } from '../../file-format/src/family-schema.js';

const NOW = '2026-04-28T12:00:00.000Z';

const document = {
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
} as unknown as FamilyDocument;

const manifest = {
  formatVersion: '1.0', id: 'fam_01HZ00000000000000000FAM01', name: 'TestDoor', semver: '1.0.0',
  author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'Test' },
  description: '', ifcEntity: 'IfcDoor', category: 'Door', tags: [],
  minPRYZMVersion: '2.0.0',
  schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  createdAt: NOW, lastModifiedAt: NOW,
} as unknown as FamilyManifest;

const res = await bakeFamilyInstance({
  family: { manifest, document, schemaHash: manifest.schemaHash },
  typeId: 'typ_01HZ00000000000000000DEF01',
});

const d = res.baked[0]!.descriptor as unknown as {
  position: Float32Array; normal: Float32Array; uv: Float32Array;
  index: Uint16Array | Uint32Array; hash: string;
};
const h = createHash('sha256');
h.update(Buffer.from(d.position.buffer, d.position.byteOffset, d.position.byteLength));
h.update(Buffer.from(d.normal.buffer, d.normal.byteOffset, d.normal.byteLength));
h.update(Buffer.from(d.uv.buffer, d.uv.byteOffset, d.uv.byteLength));
h.update(Buffer.from(d.index.buffer, d.index.byteOffset, d.index.byteLength));
h.update(d.hash);
console.log(`baked=${res.baked.length} unsupported=${res.unsupported.length} ok=${res.ok}`);
console.log(`verts=${d.position.length / 3} tris=${d.index.length / 3} geometryHash=${d.hash}`);
console.log(`DESCRIPTOR_SHA256=${h.digest('hex')}`);
