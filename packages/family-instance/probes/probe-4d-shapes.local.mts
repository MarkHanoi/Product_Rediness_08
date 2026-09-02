// LANE 4D — descriptor census for the §67-partial shapes, printed from the
// REAL bake so the findings document quotes measured numbers rather than
// estimates.  Implements nothing; reads the same code the acceptance suite
// drives.

import { bakeFamilyInstance, segmentsForSweep } from '../src/index.js';
import { COINCIDENT_M } from '../../geometry-kernel/src/tolerance.js';
import type { FamilyDocument, FamilyManifest } from '../../file-format/src/family-schema.js';

const PLANE = 'plane_01HZ00000000000000000PNE01';
const TYPE_ID = 'typ_01HZ00000000000000000DEF01';
const NOW = '2026-04-28T12:00:00.000Z';

const P = {
  W: 'par_01HZ00000000000000000WID01', H: 'par_01HZ00000000000000000HGT01',
  S: 'par_01HZ00000000000000000SKW01', R: 'par_01HZ00000000000000000RAD01',
  D: 'par_01HZ00000000000000000DEP01',
};

const parameters = [
  { id: P.W, name: 'Width', kind: 'type', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
  { id: P.H, name: 'Height', kind: 'type', dataType: 'length', defaultValue: 1500, expression: null, ifcMapping: null, exposed: true },
  { id: P.S, name: 'Skew', kind: 'type', dataType: 'length', defaultValue: 300, expression: null, ifcMapping: null, exposed: true },
  { id: P.R, name: 'R', kind: 'type', dataType: 'length', defaultValue: 500, expression: null, ifcMapping: null, exposed: true },
  { id: P.D, name: 'Depth', kind: 'type', dataType: 'length', defaultValue: 100, expression: null, ifcMapping: null, exposed: true },
];

const COS60 = 0.5, SIN60 = 0.8660254037844386;
const hexPts = [
  { x: 'R', z: '0' }, { x: `R * ${COS60}`, z: `R * ${SIN60}` }, { x: `0 - R * ${COS60}`, z: `R * ${SIN60}` },
  { x: '0 - R', z: '0' }, { x: `0 - R * ${COS60}`, z: `0 - R * ${SIN60}` }, { x: `R * ${COS60}`, z: `0 - R * ${SIN60}` },
];
const hexIds = hexPts.map((_, i) => `01HZE0000000000000000HX0P${i}`);

const profiles = [
  { id: 'prof_RECT', name: 'Rect', planeId: PLANE, constraints: [], entities: [
    { id: '01HZE0000000000000000RC001', kind: 'point', data: { x: '0', z: '0' } },
    { id: '01HZE0000000000000000RC002', kind: 'point', data: { x: 'Width', z: '0' } },
    { id: '01HZE0000000000000000RC003', kind: 'point', data: { x: 'Width', z: 'Height' } },
    { id: '01HZE0000000000000000RC004', kind: 'point', data: { x: '0', z: 'Height' } },
  ] },
  { id: 'prof_ARCH', name: 'Arched', planeId: PLANE, constraints: [], entities: [
    { id: 'A', kind: 'point', data: { x: '0', z: '0' } },
    { id: 'B', kind: 'point', data: { x: 'Width', z: '0' } },
    { id: 'C', kind: 'point', data: { x: 'Width', z: 'Height' } },
    { id: 'D', kind: 'point', data: { x: '0', z: 'Height' } },
    { id: 'M', kind: 'point', data: { x: 'Width / 2', z: 'Height' } },
    { id: 'L1', kind: 'line', data: { p1: 'A', p2: 'B' } },
    { id: 'L2', kind: 'line', data: { p1: 'B', p2: 'C' } },
    { id: 'H1', kind: 'arc', data: { center: 'M', radius: 'Width / 2', startAngle: 0, endAngle: Math.PI } },
    { id: 'L3', kind: 'line', data: { p1: 'D', p2: 'A' } },
  ] },
  { id: 'prof_HEX', name: 'Hexagon', planeId: PLANE, constraints: [], entities: [
    ...hexPts.map((data, i) => ({ id: hexIds[i]!, kind: 'point', data })),
    ...hexIds.map((id, i) => ({ id: `01HZE0000000000000000HX0L${i}`, kind: 'line', data: { p1: id, p2: hexIds[(i + 1) % 6]! } })),
  ] },
  { id: 'prof_RHOM', name: 'Rhomboid', planeId: PLANE, constraints: [], entities: [
    { id: '01HZE0000000000000000RH001', kind: 'point', data: { x: '0', z: '0' } },
    { id: '01HZE0000000000000000RH002', kind: 'point', data: { x: 'Width', z: '0' } },
    { id: '01HZE0000000000000000RH003', kind: 'point', data: { x: 'Width + Skew', z: 'Height' } },
    { id: '01HZE0000000000000000RH004', kind: 'point', data: { x: 'Skew', z: 'Height' } },
  ] },
  { id: 'prof_CIRC', name: 'Circle', planeId: PLANE, constraints: [], entities: [
    { id: 'CM', kind: 'point', data: { x: '0', z: '0' } },
    { id: 'CC', kind: 'circle', data: { center: 'CM', radius: 'R' } },
  ] },
];

const solids = profiles.map((p, i) => ({
  id: `sol_${String(i)}`, kind: 'extrude', profileId: p.id, materialSlotId: null,
  lod: { coarse: false, medium: true, fine: true }, lengthExpression: 'Depth',
  direction: { x: 0, y: 1, z: 0 },
}));

const document = {
  formatVersion: '1.1', referencePlanes: [{ id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true }],
  parameters, profiles, solids, materialSlots: [],
  types: [{ id: TYPE_ID, name: 'Default', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' }],
  representations: [], connectors: [], propertySets: [], featureEdges: [],
} as unknown as FamilyDocument;

const manifest = {
  formatVersion: '1.1', id: 'fam_01HZ00000000000000000FAM01', name: 'Probe', semver: '1.0.0',
  author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'T' }, description: '',
  ifcEntity: 'IfcWindow', category: 'Window', tags: [], minPRYZMVersion: '2.0.0',
  schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  createdAt: NOW, lastModifiedAt: NOW,
} as unknown as FamilyManifest;

const res = await bakeFamilyInstance({ family: { manifest, document, schemaHash: manifest.schemaHash }, typeId: TYPE_ID });
console.log(`COINCIDENT_M = ${COINCIDENT_M} m`);
console.log(`segmentsForSweep(R=0.6 m, sweep=PI)   = ${segmentsForSweep(0.6, Math.PI)}`);
console.log(`segmentsForSweep(R=0.5 m, sweep=2PI)  = ${segmentsForSweep(0.5, Math.PI * 2, 3)}`);
console.log(`segmentsForSweep(R=6.0 m, sweep=PI)   = ${segmentsForSweep(6, Math.PI)}`);
console.log('');
console.log('shape       | verts | tris  | x-extent | z-extent | max |r-R| on the curve');
for (let i = 0; i < res.baked.length; i++) {
  const b = res.baked[i]!;
  const pos = b.descriptor.position;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k < pos.length; k += 3) {
    minX = Math.min(minX, pos[k]!); maxX = Math.max(maxX, pos[k]!);
    minZ = Math.min(minZ, pos[k + 2]!); maxZ = Math.max(maxZ, pos[k + 2]!);
  }
  let dev = '—';
  if (profiles[i]!.id === 'prof_ARCH') {
    let worst = 0;
    for (let k = 0; k < pos.length; k += 3) if (pos[k + 2]! > 1.5 + 1e-9) worst = Math.max(worst, Math.abs(Math.hypot(pos[k]! - 0.6, pos[k + 2]! - 1.5) - 0.6));
    dev = `${worst.toExponential(3)} m`;
  } else if (profiles[i]!.id === 'prof_CIRC') {
    let worst = 0;
    for (let k = 0; k < pos.length; k += 3) worst = Math.max(worst, Math.abs(Math.hypot(pos[k]!, pos[k + 2]!) - 0.5));
    dev = `${worst.toExponential(3)} m`;
  }
  console.log(
    `${profiles[i]!.name.padEnd(11)} | ${String(pos.length / 3).padStart(5)} | ${String(b.descriptor.index.length / 3).padStart(5)} | ${(maxX - minX).toFixed(4)}   | ${(maxZ - minZ).toFixed(4)}   | ${dev}`,
  );
}
console.log('');
console.log(`ok=${res.ok} baked=${res.baked.length} unsupported=${res.unsupported.length}`);
