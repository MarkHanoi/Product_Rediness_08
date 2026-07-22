// L-585 PROBE, PART 2 — (A) does L-581 even REACH the dissolve? and (B) an INDEPENDENT oracle
// on the Madrid / Córdoba rings, per the "never accept an aggregate as proof" rule.
//
// A. IMPORT CLOSURE. Walk the transitive import graph of blockRing.ts (the production dissolve)
//    and report whether insetPolygon.ts / blockDerivedDepth.ts — the two files the three L-581
//    commits touched — appear anywhere in it. If they do not, L-581 CANNOT change a dissolve
//    outcome, and no amount of measurement is needed to know it.
//
// B. INDEPENDENT ORACLE, per city, on the frozen 956-manzana sample. "It closed" is not "it
//    closed correctly". Ring area is compared against the SUM OF PUBLISHED CADASTRAL PARCEL
//    AREAS — a number the dissolve never sees — and each ring is tested for SELF-INTERSECTION,
//    which an area check alone cannot catch (a figure-of-eight can have the right area).
//    Individual worst-case blocks are printed by name so the aggregate can be checked against
//    a specific piece of geometry.
//
// Run: npx tsx scratchpad/probe-l585-closure-and-oracle.mts

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// ── A. IMPORT CLOSURE ─────────────────────────────────────────────────────────────────
function closure(entry: string): Set<string> {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length) {
        const f = stack.pop()!;
        if (seen.has(f) || !existsSync(f)) continue;
        seen.add(f);
        const src = readFileSync(f, 'utf8');
        const re = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
            const spec = m[1]!;
            if (!spec.startsWith('.')) continue; // package specifiers: recorded below, not walked
            const base = resolve(dirname(f), spec).replace(/\.js$/, '');
            for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
                if (existsSync(cand)) { stack.push(cand); break; }
            }
        }
    }
    return seen;
}

const ENTRY = resolve(ROOT, 'packages/site-parcel-data/src/geometry/blockRing.ts');
const files = [...closure(ENTRY)].map((f) => f.replace(ROOT, '').replace(/\\/g, '/')).sort();

// The exact files the three L-581 commits changed (git show --stat 4b3147c9 f3f901d9 1383e38e).
const L581_TOUCHED = [
    '/packages/site-parcel-data/src/geometry/insetPolygon.ts',
    '/packages/site-parcel-data/src/geometry/blockDerivedDepth.ts',
];

console.log('## A. IMPORT CLOSURE OF THE PRODUCTION DISSOLVE (blockRing.ts)\n');
for (const f of files) console.log(`   ${f}`);
console.log('\n   L-581 touched these production files:');
for (const t of L581_TOUCHED) {
    const inClosure = files.includes(t);
    console.log(`     ${t}  →  ${inClosure ? '*** IN THE DISSOLVE CLOSURE ***' : 'NOT in the dissolve closure'}`);
}
const anyReach = L581_TOUCHED.some((t) => files.includes(t));
console.log(`\n   VERDICT: L-581 ${anyReach ? 'CAN' : 'CANNOT'} affect a block-dissolve outcome.\n`);

// ── B. INDEPENDENT ORACLE, PER CITY ───────────────────────────────────────────────────
interface M { city: string; manzana: string; parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }> }
const raw = JSON.parse(readFileSync(resolve(ROOT, 'scratchpad/dissolve-sample.json'), 'utf8')) as { manzanas: M[] };

const R = 6_378_137, D = Math.PI / 180;
function area(ring: ReadonlyArray<Pt>) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; a += p.x * q.z - q.x * p.z; }
    return Math.abs(a / 2);
}
// Independent of area: does the ring cross itself? A self-intersecting ring can still have a
// plausible |area| — this is the check the area oracle cannot make.
function seg(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
function selfIntersects(ring: ReadonlyArray<Pt>): boolean {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue; // adjacent through the wrap
            if (seg(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) return true;
        }
    }
    return false;
}
function q(a: number[], qs: number[]) {
    if (!a.length) return qs.map(() => NaN);
    const s = [...a].sort((x, y) => x - y);
    return qs.map((v) => s[Math.min(s.length - 1, Math.floor(v * s.length))]!);
}

const rows = raw.manzanas.map((m) => {
    const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon;
    const c = Math.cos(lat0 * D);
    const rings = m.parcels.map((p) => p.ring.map((v) => ({ x: (v.lon - lon0) * D * R * c, z: -((v.lat - lat0) * D * R) })));
    const before = dissolveParcelsToBlockRing(rings, { repairTJunctions: false });
    const after = dissolveParcelsToBlockRing(rings);
    const cadastral = m.parcels.reduce((s, p) => s + p.areaM2, 0);
    const err = after.degenerate ? null : Math.abs(area(after.ring) - cadastral) / cadastral * 100;
    return {
        m, before, after, cadastral,
        ringArea: after.degenerate ? null : area(after.ring),
        errPct: err,
        repaired: before.degenerate && !after.degenerate,
        xsect: after.degenerate ? null : selfIntersects(after.ring),
    };
});

console.log('## B. INDEPENDENT ORACLE — ring area vs SUM OF PUBLISHED PARCEL AREAS (the dissolve never sees it)\n');
console.log('| city | rings | area-err p50 | p90 | worst | self-intersecting rings |');
console.log('|---|---|---|---|---|---|');
const CITIES = ['Barcelona', 'Barcelona-old', 'Madrid', 'Madrid-centro', 'Cordoba', 'Sevilla', 'Valencia'];
for (const city of CITIES) {
    const g = rows.filter((r) => r.m.city === city && !r.after.degenerate);
    const errs = g.map((r) => r.errPct!).filter(Number.isFinite);
    const [p50, p90] = q(errs, [0.5, 0.9]);
    const worst = errs.length ? Math.max(...errs) : NaN;
    const xs = g.filter((r) => r.xsect).length;
    console.log(`| ${city} | ${g.length} | ${p50.toFixed(2)}% | ${p90.toFixed(2)}% | ${worst.toFixed(2)}% | ${xs} |`);
}

console.log('\n## SPOT-CHECK — the individual blocks the aggregate could be hiding\n');
for (const city of ['Madrid', 'Madrid-centro', 'Cordoba']) {
    const g = rows.filter((r) => r.m.city === city && !r.after.degenerate);
    const worst = [...g].sort((a, b) => (b.errPct ?? 0) - (a.errPct ?? 0)).slice(0, 3);
    console.log(`  ${city}:`);
    for (const r of worst) {
        console.log(
            `    manzana ${r.m.manzana}  ${r.m.parcels.length} parcels  ` +
            `ring ${r.ringArea!.toFixed(0)} m²  vs published ${r.cadastral.toFixed(0)} m²  ` +
            `err ${r.errPct!.toFixed(2)}%  verts ${r.after.ring.length}  ` +
            `${r.repaired ? 'L539-REPAIRED' : 'exact'}  self-intersecting: ${r.xsect}`,
        );
    }
}

const repairedMadCor = rows.filter((r) => r.repaired && ['Madrid', 'Madrid-centro', 'Cordoba'].includes(r.m.city));
console.log(`\n  Blocks in Madrid+Córdoba that ONLY dissolve because of L-539's T-junction split: ${repairedMadCor.length}`);
const rErrs = repairedMadCor.map((r) => r.errPct!).filter(Number.isFinite);
const [rp50, rp90] = q(rErrs, [0.5, 0.9]);
console.log(`  Their area error vs published: p50 ${rp50.toFixed(2)}%  p90 ${rp90.toFixed(2)}%  worst ${Math.max(...rErrs).toFixed(2)}%`);
console.log(`  Self-intersecting among them: ${repairedMadCor.filter((r) => r.xsect).length}`);

writeFileSync(resolve(ROOT, 'scratchpad/l585-closure-and-oracle.json'), JSON.stringify({
    ranAt: new Date().toISOString(),
    dissolveClosure: files,
    l581Touched: L581_TOUCHED,
    l581ReachesDissolve: anyReach,
    perCity: CITIES.map((city) => {
        const g = rows.filter((r) => r.m.city === city);
        const ok = g.filter((r) => !r.after.degenerate);
        return {
            city, manzanas: g.length,
            ringsPreL539: g.filter((r) => !r.before.degenerate).length,
            ringsHead: ok.length,
            selfIntersecting: ok.filter((r) => r.xsect).length,
            areaErrPct: q(ok.map((r) => r.errPct!).filter(Number.isFinite), [0.5, 0.9, 1]),
        };
    }),
}, null, 2));
console.log('\nwrote scratchpad/l585-closure-and-oracle.json');
