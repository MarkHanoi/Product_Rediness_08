/**
 * LANE DIAGNOSE 2026-09-02 — bisect the superlinear WallStore.add() term found by
 * BASE-INNER (0.077 ms/wall @100 -> 0.228 ms/wall @1000 inside the authoritative
 * mirror replay of wall.batch.create).
 *
 * Hypothesis (from reading WallStore.add): two per-add O(levelWalls) scans —
 *   (1) deriveJoinIntent(siblings, wall)        [WallJoinIntentStamp.ts, L-927]
 *   (2) retreatOntoHostFaces(siblings, wall)    [WallHostBodyRetreat.ts, L-929]
 * both run for every add whose joinIntent is undefined / host-face flag default ON,
 * with siblings = ALL walls already on the level => O(N^2) total.
 *
 * Arms (fresh store, same 1000 disjoint wall segments, one level):
 *   A default            derivation ON,  retreat ON   (what the mirror replay pays)
 *   B stamped+flagOff    derivation OFF, retreat OFF  (control: expect flat)
 *   C flagOff            derivation ON,  retreat OFF  (isolates deriveJoinIntent)
 *   D stamped            derivation OFF, retreat ON   (isolates retreatOntoHostFaces)
 *   E hydration          both suppressed via beginHydration() (the loader's fast path)
 * Falsification control: arm F re-runs arm A with a planted 0.05ms busy-wait listener
 * to prove the timer tracks add() (delta must appear).
 */
import { WallStore } from '../../packages/geometry-wall/src/WallStore';

const N = 1000;
const LEVEL = { id: 'level-1', name: 'L1', elevation: 0, height: 3 } as any;
const fakeBim = { getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined), getLevels: () => [LEVEL], getActiveLevel: () => LEVEL } as any;
const fakeCtx = {} as any;

function mkWall(i: number, stamped: boolean) {
  const x0 = (i % 100) * 4, z0 = Math.floor(i / 100) * 4;
  return {
    id: `bench-wall-${i}`, type: 'wall' as const, levelId: LEVEL.id,
    baseLine: [ { x: x0, y: 0, z: z0 }, { x: x0 + 2.5, y: 0, z: z0 } ] as any,
    height: 3, thickness: 0.2,
    ...(stamped ? { joinIntent: { start: 'butt' as const } } : {}),
  } as any;
}

function med(a: number[]) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

function runArm(name: string, opts: { stamped?: boolean; hostFace?: boolean; hydrate?: boolean; listenerDelayMs?: number }) {
  (globalThis as any).__pryzmWallCreateOnHostFace = opts.hostFace !== false;
  const store = new WallStore();
  store.attachEngine(fakeCtx, fakeBim);
  if (opts.listenerDelayMs) {
    (store as any).subscribe?.(() => { const t = performance.now(); while (performance.now() - t < opts.listenerDelayMs!) {} });
  }
  const endHydrate = opts.hydrate ? store.beginHydration() : null;
  const per: number[] = [];
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const w = mkWall(i, !!opts.stamped);
    const a = performance.now();
    store.add(w);
    per.push(performance.now() - a);
  }
  const total = performance.now() - t0;
  endHydrate?.();
  const first = med(per.slice(0, 100)), last = med(per.slice(900, 1000));
  console.log(
    `${name.padEnd(22)} total=${total.toFixed(1).padStart(7)}ms  perAdd med[1-100]=${(first * 1000).toFixed(1).padStart(6)}us  med[901-1000]=${(last * 1000).toFixed(1).padStart(7)}us  growth=${(last / Math.max(first, 1e-6)).toFixed(1)}x  stored=${store.getAll().length}`,
  );
  return { total, first, last };
}

// warmup JIT
runArm('warmup(discard)', {});
console.log('---');
const A = runArm('A default', {});
const B = runArm('B stamped+flagOff', { stamped: true, hostFace: false });
const C = runArm('C derivationOnly', { hostFace: false });
const D = runArm('D retreatOnly', { stamped: true });
const E = runArm('E hydration', { hydrate: true });
const F = runArm('F control+0.05ms listener', { listenerDelayMs: 0.05 });
console.log('---');
console.log(`attribution @N=1000: A-B total delta=${(A.total - B.total).toFixed(1)}ms of which derivation(C-B)=${(C.total - B.total).toFixed(1)}ms retreat(D-B)=${(D.total - B.total).toFixed(1)}ms`);
console.log(`falsification: F-A total delta=${(F.total - A.total).toFixed(1)}ms (expect >= ${(0.05 * N * 0.8).toFixed(0)}ms if listener path is timed... note: only if subscribe() exists)`);
