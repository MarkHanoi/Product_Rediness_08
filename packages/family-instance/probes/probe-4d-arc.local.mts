// LANE 4D — INDEPENDENT RE-FALSIFICATION of "route arcs through the existing
// `arcToPoints`" (audit §12 lane-4D row; audit §5.3 fact #2).
//
// ⛔ This probe re-measures the claim from the SOURCE rather than quoting
//    `phase3/tessellation-hypothesis-verdict.md`. The verdict predates lane
//    4B's edits to `family-schema.ts` (verdict mtime 2026-09-01 18:34 ·
//    family-schema.ts mtime 2026-09-01 23:54), so nothing inherited is taken
//    on trust here — the arc claim, the ReferencePlane claim and the
//    ProfileEntity claim are each re-read at HEAD-with-4A/4B-in-tree.
//
// It implements nothing. It measures. Every "fix" is inline and thrown away.

import { arcToPoints } from '../../geometry-kernel/src/producers/_internal/WallPath.js';
import { COINCIDENT_M } from '../../geometry-kernel/src/tolerance.js';
import { ReferencePlaneSchema, ProfileEntitySchema } from '../../file-format/src/family-schema.js';

const lines: string[] = [];
const say = (s: string) => { lines.push(s); console.log(s); };

let fail = 0;
const check = (label: string, ok: boolean, detail: string) => {
  say(`${ok ? '[OK]  ' : '[FAIL]'} ${label} — ${detail}`);
  if (!ok) fail++;
};

say('=== LANE 4D · ARC RE-FALSIFICATION =========================================');
say(`COINCIDENT_M (declared, geometry-kernel/src/tolerance.ts) = ${COINCIDENT_M} m`);
say('');

// ── E1 · a 90° arc, R = 1 m, centre at origin, from +X to +Z ────────────────
// The BEST possible single quadratic Bezier for a circular arc puts the
// control point at the intersection of the end tangents.
const R = 1;
const p0 = { x: R, y: 0, z: 0 };
const p2 = { x: 0, y: 0, z: R };
const ctrl90 = { x: R, y: 0, z: R }; // tangent intersection for a 90 deg arc

say('--- E1: arcToPoints (quadratic Bezier) vs a TRUE circle, 90 deg, R = 1 m ---');
for (const segments of [8, 32, 256, 4096]) {
  const pts = arcToPoints(p0, ctrl90, p2, segments);
  let maxDev = 0;
  for (const p of pts) {
    const r = Math.hypot(p.x, p.z);
    maxDev = Math.max(maxDev, Math.abs(r - R));
  }
  say(`  segments=${String(segments).padStart(4)}  max|r-R| = ${maxDev.toFixed(6)} m  = ${(maxDev / COINCIDENT_M).toFixed(1)}x COINCIDENT_M`);
}
{
  const a = arcToPoints(p0, ctrl90, p2, 32);
  const b = arcToPoints(p0, ctrl90, p2, 4096);
  const devA = Math.max(...a.map((p) => Math.abs(Math.hypot(p.x, p.z) - R)));
  const devB = Math.max(...b.map((p) => Math.abs(Math.hypot(p.x, p.z) - R)));
  check(
    'E1 arcToPoints error is INVARIANT in `segments` (it converges to the Bezier, not the circle)',
    Math.abs(devA - devB) < 1e-12 && devA > COINCIDENT_M,
    `dev(32)=${devA.toFixed(6)} dev(4096)=${devB.toFixed(6)} — both > COINCIDENT_M=${COINCIDENT_M}`,
  );
}
say('');

// ── E2 · spec §64's "arched top" is a SEMICIRCLE ────────────────────────────
// End tangents are anti-parallel: no finite control point exists. Search k for
// the best symmetric control point (0, 0, k*R) over the half circle +X -> -X.
say('--- E2: spec §64 ARCHED TOP (semicircle, R = 1 m) — best single Bezier ---');
{
  const s0 = { x: R, y: 0, z: 0 };
  const s2 = { x: -R, y: 0, z: 0 };
  let bestK = 0;
  let bestDev = Infinity;
  for (let k = 0.1; k <= 8.0001; k += 0.0005) {
    const c = { x: 0, y: 0, z: k * R };
    const pts = arcToPoints(s0, c, s2, 512);
    let dev = 0;
    for (const p of pts) dev = Math.max(dev, Math.abs(Math.hypot(p.x, p.z) - R));
    if (dev < bestDev) { bestDev = dev; bestK = k; }
  }
  say(`  best k = ${bestK.toFixed(3)}   floor max|r-R| = ${bestDev.toFixed(4)} m = ${(bestDev / COINCIDENT_M).toFixed(0)}x COINCIDENT_M`);
  check(
    'E2 NO single quadratic Bezier reaches COINCIDENT_M on a semicircle',
    bestDev > COINCIDENT_M,
    `floor ${bestDev.toFixed(4)} m > ${COINCIDENT_M} m at every k in [0.1, 8]`,
  );
}
say('');

// ── E3 · the closed-form trig alternative, same subject ─────────────────────
say('--- E3: closed-form trig tessellation, same semicircle ---');
{
  const tessellate = (cx: number, cz: number, r: number, a0: number, a1: number, n: number) => {
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      out.push({ x: cx + r * Math.cos(t), z: cz + r * Math.sin(t) });
    }
    return out;
  };
  for (const n of [8, 16, 64]) {
    const pts = tessellate(0, 0, R, 0, Math.PI, n);
    let dev = 0;
    for (const p of pts) dev = Math.max(dev, Math.abs(Math.hypot(p.x, p.z) - R));
    // chord sagitta is the REAL error of the polyline, not the vertex error
    const sag = R * (1 - Math.cos(Math.PI / n / 2));
    say(`  n=${String(n).padStart(3)}  max vertex |r-R| = ${dev.toExponential(3)} m   chord sagitta = ${sag.toExponential(3)} m`);
  }
  const pts16 = tessellate(0, 0, R, 0, Math.PI, 16);
  const dev16 = Math.max(...pts16.map((p) => Math.abs(Math.hypot(p.x, p.z) - R)));
  check(
    'E3 closed-form trig places every vertex ON the circle to machine precision',
    dev16 < 1e-15,
    `n=16 max|r-R| = ${dev16.toExponential(3)} m`,
  );
}
say('');

// ── E4 · the SCHEMA half, re-read at HEAD (post-4B) ─────────────────────────
say('--- E4: ReferencePlaneSchema / ProfileEntitySchema re-read AFTER lane 4B ---');
{
  const plane = ReferencePlaneSchema.parse({
    id: 'plane_01HZ00000000000000000PNE01',
    name: 'Host',
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
  });
  const keys = Object.keys(plane).sort().join(', ');
  say(`  ReferencePlane parsed keys: ${keys}`);
  check(
    'E4a ReferencePlane STILL carries no in-plane basis after 4B',
    !('right' in plane) && !('up' in plane) && !('basis' in plane) && !('xAxis' in plane),
    `keys = {${keys}} — origin + normal fix orientation but leave the spin about the normal FREE`,
  );

  // the decisive consequence, executed
  const n = { x: 0, y: 1, z: 0 };
  const lift = (right: { x: number; y: number; z: number }, up: { x: number; y: number; z: number }, u: number, v: number) => ({
    x: right.x * u + up.x * v, y: right.y * u + up.y * v, z: right.z * u + up.z * v,
  });
  const A = lift({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 2, 0);
  const c = Math.cos(Math.PI / 3), s = Math.sin(Math.PI / 3);
  const B = lift({ x: c, y: 0, z: s }, { x: -s, y: 0, z: c }, 2, 0);
  const sep = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
  say(`  basis A -> (${A.x.toFixed(4)}, ${A.y.toFixed(4)}, ${A.z.toFixed(4)})`);
  say(`  basis B -> (${B.x.toFixed(4)}, ${B.y.toFixed(4)}, ${B.z.toFixed(4)})`);
  check(
    'E4b the same document point lifts to two DIFFERENT world points under two legal bases',
    sep > COINCIDENT_M,
    `separation ${sep.toFixed(4)} m = ${(sep / COINCIDENT_M).toFixed(0)}x COINCIDENT_M — normal alone is short one rotational DOF`,
  );

  const junk = ProfileEntitySchema.safeParse({ id: '01HZE0000000000000000AR001', kind: 'arc', data: { banana: 3 } });
  const empty = ProfileEntitySchema.safeParse({ id: '01HZE0000000000000000AR002', kind: 'arc', data: {} });
  check(
    'E4c ProfileEntity.data is STILL an uncontracted z.record after 4B',
    junk.success && empty.success,
    `arc with {banana:3} accepted=${junk.success}; arc with {} accepted=${empty.success} — no key required, none forbidden`,
  );
}

say('');
say(`PROBE SUMMARY — FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
