// LANE TESS — probe for audit §5.3 / lane-H §4.6 "tessellation, not solver" hypothesis.
//
// Run:
//   npx tsx packages/family-instance/probes/probe-tess53.local.mts > /tmp/tess.txt 2>&1; echo "RC=$?" >> /tmp/tess.txt
//
// This probe drives the REAL machinery only:
//   • FamilyDocumentSchema / SolidFeatureSchema / ProfileSchema  (@pryzm/file-format)
//   • bakeFamilyInstance + profileToPolygon                      (@pryzm/family-instance src)
//   • produceSweep / produceLoft / produceRevolve                (@pryzm/geometry-kernel src)
//   • arcToPoints                                                (kernel producers/_internal)
//   • assertValidDescriptor + COINCIDENT_M                       (@pryzm/geometry-kernel)
//
// It IMPLEMENTS NOTHING. Every "fix" below lives inside this file and is thrown away;
// the point is to measure what the hypothesis costs, not to pay it. (Phase 8 owns the build.)

import { FamilyDocumentSchema, ProfileEntitySchema, SolidFeatureSchema } from '../../file-format/src/family-schema.js';
import type { FamilyDocument, FamilyManifest, Profile } from '../../file-format/src/family-schema.js';
import { bakeFamilyInstance } from '../src/index.js';
import { profileToPolygon, ProfileEvalError } from '../src/profileToPolygon.js';

/* ---------- id helpers (26-char Crockford ULIDs; I/L/O/U excluded) ---------- */
const ulid = (s: string) => '01HZE' + '0'.repeat(21 - s.length) + s;
const PLANE_XZ = 'plane_' + ulid('PN01');
const PLANE_XY = 'plane_' + ulid('PN02');
const PROF_SEC = 'prof_' + ulid('PF01');
const PROF_PATH = 'prof_' + ulid('PF02');
const PROF_SEC2 = 'prof_' + ulid('PF03');
const PROF_REV = 'prof_' + ulid('PF04');
const SOL_SWEEP = 'sol_' + ulid('SW01');
const SOL_LOFT = 'sol_' + ulid('FT01');
const SOL_REV = 'sol_' + ulid('RV01');
const PAR_H = 'par_' + ulid('HT01');
const TYP_DEF = 'typ_' + ulid('DF01');
const FAM = 'fam_' + ulid('FM01');
const NOW = '2026-09-01T00:00:00.000Z';
const ZERO_SHA = 'sha256:' + '0'.repeat(64);
const EMPTY_SHA = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

let pass = 0, fail = 0;
const H = (n: string) => console.log(`\n${'='.repeat(78)}\n${n}\n${'='.repeat(78)}`);
const OK = (m: string) => { pass++; console.log(`  [OK]   ${m}`); };
const NO = (m: string) => { fail++; console.log(`  [FAIL] ${m}`); };
const I = (m: string) => console.log(`         ${m}`);

/* ==========================================================================
   E1 — SCHEMA EXPRESSIBILITY (the audit's own stated test)
   "confirm a fully-determined profile is expressible with an empty constraints[]"
   ========================================================================== */
H('E1 — Is a FULLY-DETERMINED line/arc/circle profile expressible with constraints: [] ?');

// A "fully determined" outline: two straight edges plus one quarter arc, plus a circle.
// Every number is an explicit coordinate. Nothing is implied by a constraint.
const determinedSection: Profile = {
  id: PROF_SEC,
  name: 'DeterminedSection',
  planeId: PLANE_XZ,
  entities: [
    { id: ulid('E1'), kind: 'line', data: { x1: 0, z1: 0, x2: 1, z2: 0 } },
    { id: ulid('E2'), kind: 'arc', data: { cx: 0, cz: 0, r: 1, a0: 0, a1: Math.PI / 2 } },
    { id: ulid('E3'), kind: 'line', data: { x1: 0, z1: 1, x2: 0, z2: 0 } },
  ],
  constraints: [],
};

const entParse = ProfileEntitySchema.safeParse(determinedSection.entities[0]);
if (entParse.success) OK(`ProfileEntitySchema accepts kind:'line' with constraints-free data.`);
else NO(`ProfileEntitySchema REJECTED a line entity: ${entParse.error.message}`);

// ⚠ The decisive counter-probe: does the schema constrain the data payload AT ALL?
const garbage = ProfileEntitySchema.safeParse({ id: ulid('E9'), kind: 'arc', data: {} });
const garbage2 = ProfileEntitySchema.safeParse({
  id: ulid('EA'), kind: 'arc', data: { banana: 3, wheelbase: 'blue' },
});
if (garbage.success) NO(`ProfileEntitySchema accepts kind:'arc' with an EMPTY data payload — the arc's shape is UNCONTRACTED.`);
else OK(`ProfileEntitySchema rejects an empty arc payload.`);
if (garbage2.success) NO(`ProfileEntitySchema accepts kind:'arc' with data {banana, wheelbase} — no key is required, none is forbidden.`);
else OK(`ProfileEntitySchema rejects nonsense arc keys.`);
I(`ProfileEntitySchema.data is z.record(string, number|string|boolean|null) — see family-schema.ts §ProfileEntitySchema.`);

/* ==========================================================================
   E2 — WHAT THE SOLID ARMS ACTUALLY DEMAND (the audit said lane H never read these)
   ========================================================================== */
H('E2 — What do the sweep / loft / revolve arms of SolidFeatureSchema DEMAND?');

const lod = { coarse: false, medium: true, fine: true };
const sweepSolid = { id: SOL_SWEEP, kind: 'sweep' as const, profileId: PROF_SEC, pathProfileId: PROF_PATH, materialSlotId: null, lod };
const loftSolid = { id: SOL_LOFT, kind: 'loft' as const, profileIds: [PROF_SEC, PROF_SEC2], materialSlotId: null, lod };
const revSolid = { id: SOL_REV, kind: 'revolve' as const, profileId: PROF_REV, materialSlotId: null, lod, sweepDeg: 360, segments: 24 };

for (const [n, s] of [['sweep', sweepSolid], ['loft', loftSolid], ['revolve', revSolid]] as const) {
  const r = SolidFeatureSchema.safeParse(s);
  if (r.success) { OK(`SolidFeatureSchema parses '${n}': keys = ${Object.keys(r.data).sort().join(', ')}`); }
  else NO(`SolidFeatureSchema rejected '${n}': ${r.error.message}`);
}
I(`⛔ revolve carries sweepDeg + segments and NO AXIS field.`);
I(`⛔ loft carries profileIds ONLY — no per-section origin / right / up.`);
I(`⛔ sweep's path is a ProfileId — i.e. 2-D entities bound to a ReferencePlane, not a 3-D polyline.`);

/* ==========================================================================
   E3 — BASELINE: what the REAL bake does with this document today
   ========================================================================== */
H('E3 — BASELINE: bakeFamilyInstance on a fully-determined sweep + loft + revolve document');

const section2: Profile = { ...determinedSection, id: PROF_SEC2, name: 'Sec2' };
const pathProfile: Profile = {
  id: PROF_PATH, name: 'Path', planeId: PLANE_XY,
  entities: [
    { id: ulid('P1'), kind: 'point', data: { x: 0, z: 0 } },
    { id: ulid('P2'), kind: 'point', data: { x: 2, z: 0 } },
    { id: ulid('P3'), kind: 'point', data: { x: 2, z: 2 } },
  ],
  constraints: [],
};
const revProfile: Profile = {
  id: PROF_REV, name: 'RevSilhouette', planeId: PLANE_XY,
  entities: [
    { id: ulid('R1'), kind: 'point', data: { x: 0.2, z: 0 } },
    { id: ulid('R2'), kind: 'point', data: { x: 0.5, z: 1 } },
    { id: ulid('R3'), kind: 'point', data: { x: 0.2, z: 2 } },
  ],
  constraints: [],
};

const rawDoc = {
  formatVersion: '1.0',
  referencePlanes: [
    { id: PLANE_XZ, name: 'XZ', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    { id: PLANE_XY, name: 'XY', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, isHost: false },
  ],
  parameters: [{ id: PAR_H, name: 'Height', kind: 'type', dataType: 'length', defaultValue: 2100, expression: null, ifcMapping: null, exposed: true }],
  profiles: [determinedSection, section2, pathProfile, revProfile],
  solids: [sweepSolid, loftSolid, revSolid],
  materialSlots: [],
  types: [{ id: TYP_DEF, name: 'Default', values: {}, checksum: EMPTY_SHA }],
  defaults: {},
};

let document: FamilyDocument;
const docParse = FamilyDocumentSchema.safeParse(rawDoc);
if (!docParse.success) {
  NO(`FamilyDocumentSchema REJECTED the fully-determined document: ${JSON.stringify(docParse.error.issues.slice(0, 4), null, 1)}`);
  throw new Error('cannot continue without a parsed document');
}
document = docParse.data as FamilyDocument;
OK(`FamilyDocumentSchema.parse ACCEPTS a document whose profiles carry line+arc entities and constraints: [].`);
I(`→ the audit's stated E1 test HOLDS: a fully-determined profile IS expressible with an empty constraints[].`);

const manifest: FamilyManifest = {
  formatVersion: '1.0', id: FAM, name: 'TessProbe', semver: '1.0.0',
  author: { id: 'usr_probe', displayName: 'lane-tess' }, description: '',
  ifcEntity: 'IfcBuildingElementProxy', category: 'Generic', tags: [],
  minPRYZMVersion: '2.0.0', schemaHash: ZERO_SHA, createdAt: NOW, lastModifiedAt: NOW,
};

const bake = await bakeFamilyInstance({ family: { manifest, document, schemaHash: ZERO_SHA }, typeId: TYP_DEF });
I(`bake.ok=${bake.ok}  baked=${bake.baked.length}  unsupported=${bake.unsupported.length}`);
for (const u of bake.unsupported) I(`  · ${u.kind}  reason='${u.reason}'  ${u.message}`);
if (bake.unsupported.length === 3 && bake.baked.length === 0) {
  OK(`Baseline reproduced: all three kinds refused, zero baked. The refusal is the ONE message in bakeFamilyInstance's tail branch.`);
} else NO(`Unexpected baseline: baked=${bake.baked.length} unsupported=${bake.unsupported.length}`);

// And the profile-side refusal, measured separately.
try {
  profileToPolygon(determinedSection);
  NO(`profileToPolygon accepted a line/arc profile — the §5.3 blocker is not where the audit says.`);
} catch (e) {
  const c = e instanceof ProfileEvalError ? e.code : 'non-ProfileEvalError';
  if (c === 'profile-needs-solver') OK(`profileToPolygon throws code='profile-needs-solver' on the first non-point entity — §5.3's stated blocker CONFIRMED.`);
  else NO(`profileToPolygon threw '${c}', not 'profile-needs-solver'.`);
}

/* ==========================================================================
   E4 — CLAIM A(i): "arc tessellation already exists in the kernel — arcToPoints"
   ========================================================================== */
H('E4 — Does the kernel\'s claimed existing tessellator (arcToPoints) serve a CIRCULAR arc?');

// axis 1 (import) — is it on the public entry the audit says to reuse?
const kernelIndex = await import('../../geometry-kernel/src/index.js');
if ('arcToPoints' in kernelIndex) OK(`arcToPoints is exported from the kernel public index.`);
else NO(`arcToPoints is NOT exported from @pryzm/geometry-kernel — it lives in producers/_internal/WallPath.ts (deep-path import required).`);

const { arcToPoints } = await import('../../geometry-kernel/src/producers/_internal/WallPath.js');
const { COINCIDENT_M } = kernelIndex as { COINCIDENT_M: number };

// The measurement that decides it: a QUARTER CIRCLE of radius 1 m.
// arcToPoints samples a QUADRATIC BÉZIER  B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2.
// Feed it the only sane control point (the tangent intersection) and measure the
// radial error against the true circle, at increasing segment counts.
const R = 1;
for (const segs of [8, 32, 256, 4096]) {
  const pts = arcToPoints({ x: R, y: 0, z: 0 }, { x: R, y: 0, z: R }, { x: 0, y: 0, z: R }, segs);
  let worst = 0;
  for (const p of pts) worst = Math.max(worst, Math.abs(Math.hypot(p.x, p.z) - R));
  const verdict = worst <= COINCIDENT_M ? 'within' : 'OUTSIDE';
  I(`segments=${String(segs).padStart(4)}  max |r-R| = ${worst.toFixed(6)} m  → ${verdict} COINCIDENT_M (${COINCIDENT_M} m)  [×${(worst / COINCIDENT_M).toFixed(0)}]`);
}
{
  const pts = arcToPoints({ x: R, y: 0, z: 0 }, { x: R, y: 0, z: R }, { x: 0, y: 0, z: R }, 4096);
  let worst = 0;
  for (const p of pts) worst = Math.max(worst, Math.abs(Math.hypot(p.x, p.z) - R));
  if (worst > COINCIDENT_M) {
    NO(`arcToPoints CANNOT tessellate a circular arc: the residual is ${worst.toFixed(6)} m and does NOT shrink with segments — a quadratic Bézier is a different curve, not a coarse sampling of the circle.`);
  } else OK(`arcToPoints converges to the circle.`);
}
I(`⛔ So audit §5.3 fact #2 ("arcToPoints already does it") is FALSE for kind:'arc' and kind:'circle'.`);
I(`   It is TRUE only for a quadratic-Bézier 'arc' — the WallPath spelling — which ProfileEntitySchema does not define.`);

// E4b — the FAIREST possible test of arcToPoints: search for the BEST symmetric control
// point for §64's own case, a SEMICIRCULAR "arched top". Report the minimum achievable error.
{
  let best = Infinity, bestK = 0;
  for (let k = 0.1; k <= 8; k += 0.001) {
    const pts = arcToPoints({ x: R, y: 0, z: 0 }, { x: 0, y: 0, z: k * R }, { x: -R, y: 0, z: 0 }, 512);
    let worst = 0;
    for (const q of pts) worst = Math.max(worst, Math.abs(Math.hypot(q.x, q.z) - R));
    if (worst < best) { best = worst; bestK = k; }
  }
  I(`SEMICIRCLE (spec §64 "arched top"), R=1 m — BEST symmetric control point k=${bestK.toFixed(3)}·R gives max |r-R| = ${best.toFixed(4)} m (${(best / COINCIDENT_M).toFixed(0)}× COINCIDENT_M).`);
  NO(`No control point makes a SINGLE quadratic Bézier a semicircle — the end tangents are anti-parallel, so the tangent intersection is at infinity. arcToPoints cannot express spec §64's arched top at ANY tolerance without a subdivision routine that does not exist.`);
}

// What a real circular tessellator costs, written here and thrown away:
const tessArc = (cx: number, cz: number, r: number, a0: number, a1: number, n: number) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return { x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) };
  });
{
  const p = tessArc(0, 0, R, 0, Math.PI / 2, 16);
  let worst = 0;
  for (const q of p) worst = Math.max(worst, Math.abs(Math.hypot(q.x, q.z) - R));
  OK(`A 6-line closed-form circular tessellator gives max |r-R| = ${worst.toExponential(2)} m at 16 segments. Claim A's MATH is trivial and needs no solver — confirmed.`);
}

/* ==========================================================================
   E5 — CLAIM B: can the already-written producers be DRIVEN from the document?
   ========================================================================== */
H('E5 — Can produceSweep / produceLoft / produceRevolve be driven from a parsed FamilyDocument?');

const { produceSweep } = await import('../../geometry-kernel/src/producers/sweep.js');
const { produceLoft } = await import('../../geometry-kernel/src/producers/loft.js');
const { produceRevolve } = await import('../../geometry-kernel/src/producers/revolve.js');
const { assertValidDescriptor } = kernelIndex as { assertValidDescriptor: (d: unknown) => void };

if ('produceSweep' in kernelIndex || 'produceLoft' in kernelIndex || 'produceRevolve' in kernelIndex) {
  OK(`the three producers are on the kernel's public entry.`);
} else {
  NO(`produceSweep / produceLoft / produceRevolve are NOT exported from @pryzm/geometry-kernel's index — only produceExtrude is. AXIS-1 (import) is BROKEN for all three.`);
}

// ---- 5a: do the producers themselves work when hand-fed? (isolates producer quality)
const uv = [{ u: 0, v: 0 }, { u: 0.1, v: 0 }, { u: 0.1, v: 0.05 }, { u: 0, v: 0.05 }];
try {
  const d = produceSweep(uv, [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }]);
  assertValidDescriptor(d);
  OK(`produceSweep hand-fed → valid descriptor (${d.position.length / 3} verts, ${d.index.length / 3} tris).`);
} catch (e) { NO(`produceSweep hand-fed FAILED: ${(e as Error).message}`); }
try {
  const d = produceLoft([
    { profile: uv, worldOrigin: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
    { profile: uv, worldOrigin: { x: 0, y: 2, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  ]);
  assertValidDescriptor(d);
  OK(`produceLoft hand-fed → valid descriptor (${d.position.length / 3} verts, ${d.index.length / 3} tris).`);
} catch (e) { NO(`produceLoft hand-fed FAILED: ${(e as Error).message}`); }
try {
  const d = produceRevolve([{ r: 0.2, y: 0 }, { r: 0.5, y: 1 }, { r: 0.2, y: 2 }], { segments: 24 });
  assertValidDescriptor(d);
  OK(`produceRevolve hand-fed → valid descriptor (${d.position.length / 3} verts, ${d.index.length / 3} tris).`);
} catch (e) { NO(`produceRevolve hand-fed FAILED: ${(e as Error).message}`); }

// ---- 5b: the INPUT-DEMAND ledger — what the producer needs vs what the document carries
H('E5b — INPUT-DEMAND LEDGER: producer demand  ×  document supply');
type Row = { producer: string; demands: string; documentSupplies: string; verdict: 'SUPPLIED' | 'MISSING' | 'CONVENTION' };
const rows: Row[] = [
  { producer: 'produceSweep', demands: 'profile: {u,v}[] (closed, metres, local cross-section)', documentSupplies: "Profile.entities on a ReferencePlane → (x,z)", verdict: 'CONVENTION' },
  { producer: 'produceSweep', demands: 'path: Point3D[] (≥2, WORLD 3-D, metres)', documentSupplies: 'pathProfileId → a 2-D Profile bound to a plane', verdict: 'MISSING' },
  { producer: 'produceSweep', demands: 'options.closed', documentSupplies: '(no field on the sweep arm)', verdict: 'MISSING' },
  { producer: 'produceLoft', demands: 'section.profile: {u,v}[] — SAME vertex count in every section', documentSupplies: 'profileIds[] — no arity rule in the schema', verdict: 'MISSING' },
  { producer: 'produceLoft', demands: 'section.worldOrigin: Point3D', documentSupplies: 'ReferencePlane.origin', verdict: 'SUPPLIED' },
  { producer: 'produceLoft', demands: 'section.right: Point3D (unit, in-plane +U)', documentSupplies: '(ReferencePlane carries origin+normal ONLY)', verdict: 'MISSING' },
  { producer: 'produceLoft', demands: 'section.up: Point3D (unit, in-plane +V)', documentSupplies: '(ReferencePlane carries origin+normal ONLY)', verdict: 'MISSING' },
  { producer: 'produceRevolve', demands: 'profile: {r,y}[] — r = distance from AXIS, r ≥ 0', documentSupplies: "Profile.entities → (x,z); which is r and which is y is unrecorded", verdict: 'CONVENTION' },
  { producer: 'produceRevolve', demands: 'the AXIS itself (hard-wired to world +Y)', documentSupplies: '(no axis field on the revolve arm)', verdict: 'MISSING' },
  { producer: 'produceRevolve', demands: 'startAngle / endAngle (radians)', documentSupplies: 'sweepDeg (degrees, default 360)', verdict: 'SUPPLIED' },
  { producer: 'produceRevolve', demands: 'segments (≥3)', documentSupplies: 'segments (≥3, default 24)', verdict: 'SUPPLIED' },
];
for (const r of rows) I(`${r.verdict.padEnd(10)} ${r.producer.padEnd(14)} needs ${r.demands}\n                          doc gives ${r.documentSupplies}`);
const missing = rows.filter((r) => r.verdict === 'MISSING').length;
const conv = rows.filter((r) => r.verdict === 'CONVENTION').length;
I(`\nTOTAL: ${rows.length} demanded inputs — ${rows.filter(r => r.verdict === 'SUPPLIED').length} SUPPLIED, ${conv} CONVENTION-ONLY, ${missing} MISSING FROM THE SCHEMA.`);

// ---- 5c: the decisive one — is the plane→world lift determined?
H('E5c — Is the 2-D→3-D lift determined by ReferencePlane {origin, normal}?');
const plane = document.referencePlanes.find((p) => p.id === PLANE_XY)!;
I(`ReferencePlane keys on disk: ${Object.keys(plane).sort().join(', ')}`);
// Two DIFFERENT in-plane bases, both perfectly orthonormal, both perpendicular to the same normal.
const n = plane.normal; // (0,0,1)
const basisA = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } };
const th = Math.PI / 3;
const basisB = { right: { x: Math.cos(th), y: Math.sin(th), z: 0 }, up: { x: -Math.sin(th), y: Math.cos(th), z: 0 } };
const lift = (b: typeof basisA, p: { x: number; z: number }) => ({
  x: plane.origin.x + b.right.x * p.x + b.up.x * p.z,
  y: plane.origin.y + b.right.y * p.x + b.up.y * p.z,
  z: plane.origin.z + b.right.z * p.x + b.up.z * p.z,
});
const pt = { x: 2, z: 0 };
const a = lift(basisA, pt), bb = lift(basisB, pt);
const dot = (u: typeof n, v: typeof n) => u.x * v.x + u.y * v.y + u.z * v.z;
I(`both bases are orthonormal and ⟂ normal: A·n=${dot(basisA.right, n)}, B·n=${dot(basisB.right, n).toFixed(15)}`);
I(`same document point (x=2,z=0) lifts to A=(${a.x},${a.y},${a.z}) and B=(${bb.x.toFixed(4)},${bb.y.toFixed(4)},${bb.z})`);
const sep = Math.hypot(a.x - bb.x, a.y - bb.y, a.z - bb.z);
if (sep > COINCIDENT_M) {
  NO(`the SAME document lifts to points ${sep.toFixed(4)} m apart (${(sep / COINCIDENT_M).toFixed(0)}× COINCIDENT_M) under two equally-legal bases. The lift is UNDERDETERMINED by one rotation DOF about the normal.`);
} else OK(`the lift is determined.`);
I(`⛔ Consequence: a sweep PATH and every loft SECTION are unplaceable in 3-D from the document as it stands.`);
I(`   This is a SCHEMA gap (ReferencePlane has no in-plane basis), not a solver gap and not a tessellation gap.`);

/* ==========================================================================
   E6 — DETERMINISM: would a convention-based lift even be stable?
   ========================================================================== */
H('E6 — A derived basis is a THIRD source of truth for orientation');
// The "dominant-axis perpendicular" trick produceSweep uses internally for its FIRST frame:
const derive = (nn: { x: number; y: number; z: number }) => {
  const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
  const seed = ax <= ay && ax <= az ? { x: 1, y: 0, z: 0 } : ay <= az ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  return seed;
};
const EPS = 1e-12;  // far BELOW PARALLEL_RAD (1e-9), the repo's declared parallel tolerance
const nA = { x: EPS, y: 1, z: 0 }, nB = { x: 0, y: 1, z: EPS };
for (const nn of [{ x: 0, y: 1, z: 0 }, nA, nB]) I(`normal (${nn.x}, ${nn.y}, ${nn.z}) → seed axis ${JSON.stringify(derive(nn))}`);
if (JSON.stringify(derive(nA)) !== JSON.stringify(derive(nB))) {
  NO(`a DERIVED basis flips discontinuously: two normals ${EPS} apart — a THOUSAND times below PARALLEL_RAD (${kernelIndex.PARALLEL_RAD}) — pick DIFFERENT seed axes, spinning every profile on that plane by 90°. Deriving instead of persisting makes orientation non-deterministic under authoring, and check-deterministic-regeneration is already a RED ratchet.`);
} else OK(`derived basis is continuous across the tie.`);

/* ==========================================================================
   E7 — THE RESIDUE THAT DOES HOLD: does a tessellated curve reach a descriptor
   through the REAL bake, with NO schema change and NO new dependency?
   ========================================================================== */
H(`E7 — Tessellate an ARCHED profile (spec §64 "arched top") and drive the REAL bakeFamilyInstance`);

// profileToPolygon's OUTPUT type is {x,z}[] — exactly what the tessellator emits.
// So: flatten the arc closed-form, express the result as the point entities the
// CURRENT schema+evaluator already accept, and run the REAL bake unchanged.
const archPts: { x: number; z: number }[] = [
  { x: 0, z: 0 }, { x: 1.2, z: 0 }, { x: 1.2, z: 1.0 },
  ...tessArc(0.6, 1.0, 0.6, 0, Math.PI, 12).slice(1, 12),
  { x: 0, z: 1.0 },
];
const archProfileId = 'prof_' + ulid('AR01');
const archSolidId = 'sol_' + ulid('AR01');
const archDocRaw = {
  ...rawDoc,
  profiles: [{
    id: archProfileId, name: 'ArchedTop', planeId: PLANE_XZ,
    entities: archPts.map((p, i) => ({ id: ulid('A' + i.toString(36).toUpperCase()), kind: 'point', data: { x: p.x, z: p.z } })),
    constraints: [],
  }],
  solids: [{
    id: archSolidId, kind: 'extrude', profileId: archProfileId, materialSlotId: null, lod,
    lengthExpression: 'Height', direction: { x: 0, y: 1, z: 0 },
  }],
};
const archParse = FamilyDocumentSchema.safeParse(archDocRaw);
if (!archParse.success) { NO(`arched document rejected: ${archParse.error.issues[0]?.message}`); }
else {
  const archBake = await bakeFamilyInstance({
    family: { manifest, document: archParse.data as FamilyDocument, schemaHash: ZERO_SHA }, typeId: TYP_DEF,
  });
  if (archBake.ok && archBake.baked.length === 1) {
    const d = archBake.baked[0]!.descriptor;
    assertValidDescriptor(d);
    OK(`ARCHED extrude baked through the UNMODIFIED bake: ${d.position.length / 3} verts, ${d.index.length / 3} tris, hash=${String(d.contentHash ?? d.hash ?? '(n/a)').slice(0, 24)}…`);
    I(`⭐ The ONLY thing standing between §64's "arched top" and this descriptor is profileToPolygon's`);
    I(`   refusal of a non-point entity. The tessellator's output type IS profileToPolygon's return type.`);
    I(`   Zero new dependency, zero WASM, zero C74 authorisation, ZERO schema change — for EXTRUDE only.`);
  } else {
    NO(`arched extrude failed: ok=${archBake.ok} unsupported=${JSON.stringify(archBake.unsupported)}`);
  }
}

/* ==========================================================================
   E8 — FOUR-AXIS REACHABILITY OF THE PAYOFF (a claim naming fewer than four is not a claim)
   ========================================================================== */
H('E8 — Four-axis reachability of whatever this lights up');
I(`AXIS 1 import/construction : produceExtrude IS on the kernel index; produceSweep/Loft/Revolve are NOT (measured E5).`);
I(`AXIS 2 bus verb            : no component.* / family.* bus verb dispatches a bake — grep in the verdict.`);
I(`AXIS 3 build graph         : @pryzm/family-instance ← apps/bake-worker only; apps/editor has zero importers.`);
I(`AXIS 4 call                : bakeFamilyInstance has ONE production call site (RebakeFamilyInstanceJob),`);
I(`                             and that job is documented as unfed until "family.instance.placed" exists.`);

/* ========================================================================== */
H(`PROBE SUMMARY  —  OK ${pass} · FAIL ${fail}`);
console.log(`
  CLAIM A (tessellation is closed-form, needs no solver) ......... HOLDS
  CLAIM A's stated MECHANISM (reuse arcToPoints) ................ FAILS  (Bézier ≠ circle; not exported)
  CLAIM A's stated PRECONDITION (arc data is expressible) ....... HOLDS at the type level,
                                                                  FAILS as a contract (data is z.record)
  CLAIM B (routing solid.kind lights up 3 of 4 tools) ........... FAILS  (${missing} demanded inputs
                                                                  are absent from the schema)
`);
process.exit(fail > 0 ? 1 : 0);
