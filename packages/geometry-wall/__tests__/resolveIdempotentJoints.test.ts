// §FIX-WALL-RESOLVE-IDEMPOTENT-JOINTS (L-152, founder 2026-07-07).
//
// THE founder defect (BROADER instance of the L-146 class): drawing a sequential run of walls
// (each its own `wall.create` → whole-level junction re-resolve), the first joints mitre
// correctly, but when the LAST wall is created, previously-correct corners of EARLIER walls
// CHANGE / overrun / overlap. The invariant this suite ENFORCES: creating a new wall may only
// change the junctions the NEW wall actually PARTICIPATES in; every already-resolved joint whose
// cluster membership is unchanged by the new wall must come out BYTE-IDENTICAL, and the resolve
// must be INDEPENDENT of input (store iteration) order.
//
// Root-cause investigation (see the L-152 fix note) established that BOTH resolve paths already
// uphold this for clean corners: (1) the pure V2 `resolveJunctions` (ADR-0055 P1 — the authoritative
// path for PLAIN walls) is position-stable + order-independent, and its L-146 corner-freeze keeps a
// near-coincident 3rd wall from dragging an existing clean corner; (2) the legacy
// `WallJoinResolver.resolveLevel` freezes an existing bit-exact corner (pinned primary-pair +
// T-into-corner) and anchors every authored baseline to `_sourceBaseLine`
// (§FIX-WALL-JOIN-BASELINE-IMMUTABLE, L-44/46/47). This suite LOCKS that guarantee as a permanent,
// regression-proof invariant across a sequential draw, a mid-span addition, permuted order, and a
// near-corner newcomer — so any future change that reintroduces the "adding a wall re-mitres an
// unrelated joint" class is caught. Maps to C11 (deterministic creation pipeline: creating an
// element must not mutate existing ones) and generalises §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE (L-146).

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { resolveJunctions, type WallInput, type Pt2, type WallMiter } from '../src/JunctionResolverV2';
import { WallJoinResolver } from '../src/WallJoinResolver';

// ── V2 miter fingerprint (nm precision; every corner point + pivot + invalid flag) ──
const nm = (p?: Pt2) => (p ? `${Math.round(p.x * 1e6)},${Math.round(p.z * 1e6)}` : '-');
function v2fp(m: WallMiter): string {
  return `sL${nm(m.startLeft)}|sR${nm(m.startRight)}|sP${nm(m.startPivot)}|` +
         `eL${nm(m.endLeft)}|eR${nm(m.endRight)}|eP${nm(m.endPivot)}|i${m.invalid ?? false}`;
}
function v2byId(walls: WallInput[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of resolveJunctions(walls)) out.set(m.id, v2fp(m));
  return out;
}
/** Which walls SHARE an endpoint (within the 0.20 m junction band) with `probe`? Those legitimately
 *  participate in `probe`'s junctions and MAY change; all others must be byte-identical. */
function endpointNeighbours(walls: WallInput[], probe: WallInput): Set<string> {
  const near = (a: Pt2, b: Pt2) => Math.hypot(a.x - b.x, a.z - b.z) <= 0.20;
  const s = new Set<string>();
  for (const w of walls) {
    if (w.id === probe.id) continue;
    if (near(w.start, probe.start) || near(w.start, probe.end) ||
        near(w.end, probe.start) || near(w.end, probe.end)) s.add(w.id);
  }
  return s;
}

describe('§FIX-WALL-RESOLVE-IDEMPOTENT-JOINTS (L-152) — V2 resolve is idempotent under sequential draw', () => {
  // A 4-wall rectangle drawn as a run, then a mid-span divider drawn LAST.
  const run: WallInput[] = [
    { id: 'W1', start: { x: 0, z: 0 }, end: { x: 8, z: 0 }, thickness: 0.2 },
    { id: 'W2', start: { x: 8, z: 0 }, end: { x: 8, z: 3 }, thickness: 0.2 },
    { id: 'W3', start: { x: 8, z: 3 }, end: { x: 0, z: 3 }, thickness: 0.2 },
    { id: 'W4', start: { x: 0, z: 3 }, end: { x: 0, z: 0 }, thickness: 0.2 },
    { id: 'W5', start: { x: 4, z: 0 }, end: { x: 4, z: 3 }, thickness: 0.2 }, // divider tees mid-span on W1 & W3
  ];

  it('CORE: after each wall N, every EARLIER joint the new wall does NOT participate in is byte-identical', () => {
    for (let k = 2; k <= run.length; k++) {
      const before = v2byId(run.slice(0, k - 1));   // walls 1..k-1
      const after = v2byId(run.slice(0, k));         // walls 1..k
      const newWall = run[k - 1]!;
      const participants = endpointNeighbours(run.slice(0, k), newWall);
      for (const [id, fpBefore] of before) {
        if (participants.has(id)) continue;          // sharing the new wall's endpoint ⇒ legit change
        expect(`${newWall.id}->${id}: ${after.get(id)}`).toBe(`${newWall.id}->${id}: ${fpBefore}`);
      }
    }
  });

  it('a MID-SPAN divider added last leaves ALL four perimeter walls byte-identical', () => {
    const before = v2byId(run.slice(0, 4));   // rectangle only
    const after = v2byId(run);                // + divider W5 (tees on bodies, no shared endpoint)
    for (const id of ['W1', 'W2', 'W3', 'W4']) {
      expect(`${id}: ${after.get(id)}`).toBe(`${id}: ${before.get(id)}`);
    }
  });

  it('the resolve is ORDER-INDEPENDENT — permuted input yields byte-identical per-wall miters', () => {
    const ref = v2byId(run);
    for (const perm of [[4, 3, 2, 1, 0], [2, 0, 4, 1, 3], [1, 2, 3, 4, 0], [3, 4, 0, 2, 1]]) {
      const got = v2byId(perm.map(i => run[i]!));
      for (const [id, s] of ref) expect(`perm${perm.join('')} ${id}: ${got.get(id)}`).toBe(`perm${perm.join('')} ${id}: ${s}`);
    }
  });

  it('a near-corner newcomer (L-146) leaves the two existing clean-corner walls byte-identical', () => {
    // Clean L at (5,0); a 3rd wall started a few mm off the corner must not drag it.
    const A: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: 0.2 };
    const B: WallInput = { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: 0.2 };
    const bare = v2byId([A, B]);
    for (const cs of [{ x: 5.003, z: 0.004 }, { x: 4.997, z: -0.003 }, { x: 4.99, z: 0.01 }]) {
      const C: WallInput = { id: 'C', start: cs, end: { x: 2, z: 3 }, thickness: 0.2 };
      const withC = v2byId([A, B, C]);
      expect(`A@${cs.x},${cs.z}: ${withC.get('A')}`).toBe(`A@${cs.x},${cs.z}: ${bare.get('A')}`);
      expect(`B@${cs.x},${cs.z}: ${withC.get('B')}`).toBe(`B@${cs.x},${cs.z}: ${bare.get('B')}`);
    }
  });
});

// ── Legacy resolveLevel: existing clean corner is frozen when a 3rd wall joins it ──
let _seq = 0;
function wd(id: string, sx: number, sz: number, ex: number, ez: number, thickness = 0.2): any {
  return {
    id, levelId: 'L0', thickness, height: 2.7,
    baseLine: [new THREE.Vector3(sx, 0, sz), new THREE.Vector3(ex, 0, ez)],
    openings: [], layers: [], metadata: { createdAt: _seq++ },
  };
}
function legacyFp(j: any): string {
  if (!j) return 'none';
  const b = j.baseLine;
  const mm = (n: number) => Math.round((Number(n) || 0) * 1000);
  const v = (u: any) => (u && typeof u.x === 'number' ? `${mm(u.x)},${mm(u.y)},${mm(u.z)}` : '-');
  return `${mm(b[0].x)},${mm(b[0].z)}>${mm(b[1].x)},${mm(b[1].z)}|sMN${v(j.startMN)}|eMN${v(j.endMN)}|i${j.invalid ?? false}`;
}

describe('§FIX-WALL-RESOLVE-IDEMPOTENT-JOINTS (L-152) — legacy resolveLevel freezes an existing corner', () => {
  const cases: Array<[string, Pt2]> = [
    ['C co-terminates EXACTLY at the corner (5,0)', { x: 5, z: 0 }],
    ['C starts a few cm off the corner into free space', { x: 5.03, z: 0.04 }],
    ['C starts a bit off the corner (within band)', { x: 4.95, z: 0.06 }],
  ];
  for (const [label, cs] of cases) {
    it(`the existing clean L (A,B) stays byte-identical — ${label}`, () => {
      _seq = 0;
      const bare = WallJoinResolver.resolveLevel([wd('A', 0, 0, 5, 0), wd('B', 5, 0, 5, 5)], { snapRadius: 0.3 });
      const aBare = legacyFp(bare.get('A')), bBare = legacyFp(bare.get('B'));
      _seq = 0;
      const withC = WallJoinResolver.resolveLevel(
        [wd('A', 0, 0, 5, 0), wd('B', 5, 0, 5, 5), wd('C', cs.x, cs.z, 2, 4)],
        { snapRadius: 0.3 },
      );
      expect(`A ${label}: ${legacyFp(withC.get('A'))}`).toBe(`A ${label}: ${aBare}`);
      expect(`B ${label}: ${legacyFp(withC.get('B'))}`).toBe(`B ${label}: ${bBare}`);
    });
  }
});
