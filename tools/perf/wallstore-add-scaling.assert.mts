/**
 * LANE FIX 2026-09-02 — red-first perf assertion for diagnosis fix 2a
 * (audit/perf/2026-09-02/diagnosis.md, ranked fix 2a).
 *
 * SUBJECT: WallStore.add()'s two per-add sibling scans (deriveJoinIntent, L-927;
 * retreatOntoHostFaces, L-929) were O(levelWalls) per add => O(N^2) per batch.
 * Measured before the fix (diagnose-wallstore-add-bench.mts arm A):
 * total 259.3 ms, per-add growth 10.8x over N=1000.
 *
 * ASSERTION (fails at the pre-fix numbers, passes after the proximity index):
 *   - disjoint corpus, N=1000, default flags (derivation ON, retreat ON):
 *       total <= 120 ms AND per-add growth (med[901-1000]/med[1-100]) <= 4x
 * The connected-grid corpus is measured and PRINTED (joins actually fire there)
 * but not asserted — its pre-fix number was never baselined.
 *
 * Reproduce: npx tsx tools/perf/wallstore-add-scaling.assert.mts   (exit 0 = pass)
 */
import { WallStore } from '../../packages/geometry-wall/src/WallStore';

const N = 1000;
const LEVEL = { id: 'level-1', name: 'L1', elevation: 0, height: 3 } as any;
const fakeBim = {
  getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined),
  getLevels: () => [LEVEL],
  getActiveLevel: () => LEVEL,
} as any;

function mkDisjoint(i: number) {
  const x0 = (i % 100) * 4, z0 = Math.floor(i / 100) * 4;
  return {
    id: `bench-wall-${i}`, type: 'wall' as const, levelId: LEVEL.id,
    baseLine: [{ x: x0, y: 0, z: z0 }, { x: x0 + 2.5, y: 0, z: z0 }] as any,
    height: 3, thickness: 0.2,
  } as any;
}

/** Connected corpus: a lattice whose segments SHARE endpoints (stamps + corners fire). */
function mkGrid(i: number) {
  const horizontal = i % 2 === 0;
  const k = Math.floor(i / 2);
  const gx = (k % 25) * 3, gz = Math.floor(k / 25) * 3;
  return {
    id: `grid-wall-${i}`, type: 'wall' as const, levelId: LEVEL.id,
    baseLine: horizontal
      ? [{ x: gx, y: 0, z: gz }, { x: gx + 3, y: 0, z: gz }]
      : [{ x: gx, y: 0, z: gz }, { x: gx, y: 0, z: gz + 3 }],
    height: 3, thickness: 0.2,
  } as any;
}

function med(a: number[]) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

function run(name: string, mk: (i: number) => any) {
  (globalThis as any).__pryzmWallCreateOnHostFace = true; // default path: both scans armed
  const store = new WallStore();
  store.attachEngine({} as any, fakeBim);
  const per: number[] = [];
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const w = mk(i);
    const a = performance.now();
    store.add(w);
    per.push(performance.now() - a);
  }
  const total = performance.now() - t0;
  if (store.getAll().length !== N) throw new Error(`${name}: stored ${store.getAll().length} != ${N}`);
  const first = med(per.slice(0, 100)), last = med(per.slice(900, 1000));
  const growth = last / Math.max(first, 1e-6);
  console.log(`${name.padEnd(16)} total=${total.toFixed(1).padStart(7)}ms  perAdd med[1-100]=${(first * 1000).toFixed(1)}us  med[901-1000]=${(last * 1000).toFixed(1)}us  growth=${growth.toFixed(1)}x`);
  return { total, growth };
}

run('warmup(discard)', mkDisjoint);
console.log('---');
const disjoint = run('disjoint', mkDisjoint);
const grid = run('grid(printed)', mkGrid);

const TOTAL_CAP_MS = 120;
const GROWTH_CAP = 4;
const failures: string[] = [];
if (disjoint.total > TOTAL_CAP_MS) failures.push(`disjoint total ${disjoint.total.toFixed(1)}ms > ${TOTAL_CAP_MS}ms`);
if (disjoint.growth > GROWTH_CAP) failures.push(`disjoint per-add growth ${disjoint.growth.toFixed(1)}x > ${GROWTH_CAP}x`);
console.log('---');
if (failures.length) {
  console.log(`FAIL: ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`OK: disjoint total ${disjoint.total.toFixed(1)}ms <= ${TOTAL_CAP_MS}ms, growth ${disjoint.growth.toFixed(1)}x <= ${GROWTH_CAP}x (grid printed: ${grid.total.toFixed(1)}ms)`);
