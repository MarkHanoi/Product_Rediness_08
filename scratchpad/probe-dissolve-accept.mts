// L-539 PROBE, STAGE 4 — THE ACCEPTANCE RUN. Pass/fail was fixed before the code was written:
//
//   1. Barcelona ≥ 90 % block-ring success (the brief's target).
//   2. Madrid + Córdoba materially improved.
//   3. The at-scale rate beats the 63.5 % baseline this same sample measures.
//   4. **Zero previously-successful rings changed.** Any non-zero here must be justified
//      individually — a silently moved compliance number is worse than a new refusal.
//   5. The repaired rings agree with the PUBLISHED cadastral areas no worse than the exact ones
//      do. Closing is not the same as closing correctly, and only an independent number can tell
//      the two apart.
//
// Run:  npx tsx scratchpad/probe-dissolve-accept.mts

import { readFileSync } from 'node:fs';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const R = 6_378_137, D = Math.PI / 180;
interface M { city: string; manzana: string; parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }> }

const raw = JSON.parse(readFileSync(new URL('./dissolve-sample.json', import.meta.url), 'utf8')) as { manzanas: M[] };

function pct(n: number, d: number) { return d ? `${((n / d) * 100).toFixed(1)}%` : '—'; }
function area(ring: ReadonlyArray<Pt>) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; a += p.x * q.z - q.x * p.z; }
    return Math.abs(a / 2);
}
function q(a: number[], qs: number[]) {
    if (!a.length) return qs.map(() => NaN);
    const s = [...a].sort((x, y) => x - y);
    return qs.map((v) => s[Math.min(s.length - 1, Math.floor(v * s.length))]!);
}

const rows = raw.manzanas.map((m) => {
    const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon;
    const c = Math.cos(lat0 * D);
    const rings = m.parcels.map((p) => p.ring.map((v) => ({
        x: (v.lon - lon0) * D * R * c, z: -((v.lat - lat0) * D * R),
    })));
    const before = dissolveParcelsToBlockRing(rings, { repairTJunctions: false });
    const after = dissolveParcelsToBlockRing(rings);
    return { m, before, after, cadastral: m.parcels.reduce((s, p) => s + p.areaM2, 0) };
});

const cities = [...new Set(rows.map((r) => r.m.city))].sort();
console.log(`\n## BEFORE / AFTER — ${rows.length} complete manzanas, 5 cities\n`);
console.log('| city | n | before | after |');
console.log('|---|---|---|---|');
for (const city of cities) {
    const g = rows.filter((r) => r.m.city === city);
    const b = g.filter((r) => !r.before.degenerate).length;
    const a = g.filter((r) => !r.after.degenerate).length;
    console.log(`| ${city} | ${g.length} | ${b} (${pct(b, g.length)}) | **${a} (${pct(a, g.length)})** |`);
}
const B = rows.filter((r) => !r.before.degenerate).length;
const A = rows.filter((r) => !r.after.degenerate).length;
console.log(`| **ALL** | ${rows.length} | ${B} (${pct(B, rows.length)}) | **${A} (${pct(A, rows.length)})** |`);

// ── 4. Did any pre-existing ring move? ─────────────────────────────────────────────────
const changed = rows.filter((r) => !r.before.degenerate && JSON.stringify(r.before.ring) !== JSON.stringify(r.after.ring));
const lost = rows.filter((r) => !r.before.degenerate && r.after.degenerate);
console.log(`\n## REGRESSION — pre-existing rings that CHANGED: ${changed.length}; rings LOST: ${lost.length}`);
for (const r of changed.slice(0, 10)) console.log(`  ⚠ ${r.m.city} ${r.m.manzana}`);

// ── 5. Independent area check ──────────────────────────────────────────────────────────
const errExact = rows.filter((r) => !r.after.degenerate && r.after.quality.path === 'exact' && r.cadastral > 0)
    .map((r) => Math.abs(area(r.after.ring) - r.cadastral) / r.cadastral);
const errRepaired = rows.filter((r) => !r.after.degenerate && r.after.quality.path === 't-junction-split' && r.cadastral > 0)
    .map((r) => Math.abs(area(r.after.ring) - r.cadastral) / r.cadastral);
console.log(`\n## RING AREA vs SUM OF PUBLISHED PARCEL AREAS (independent of the dissolve)`);
console.log(`  exact path    n=${errExact.length}  p50/p90/p95 = ${q(errExact, [0.5, 0.9, 0.95]).map((v) => (v * 100).toFixed(2) + '%').join(' / ')}`);
console.log(`  repaired path n=${errRepaired.length}  p50/p90/p95 = ${q(errRepaired, [0.5, 0.9, 0.95]).map((v) => (v * 100).toFixed(2) + '%').join(' / ')}`);

// ── Repair magnitude + vertex budget ───────────────────────────────────────────────────
const rep = rows.filter((r) => r.after.quality.path === 't-junction-split' && !r.after.degenerate);
console.log(`\n## REPAIR MAGNITUDE — ${rep.length} rings repaired`);
console.log(`  splits per ring  p50/p90/max = ${q(rep.map((r) => r.after.quality.splitCount), [0.5, 0.9, 1]).join(' / ')}`);
console.log(`  max offset (m)   p50/p90/max = ${q(rep.map((r) => r.after.quality.maxOffset_m), [0.5, 0.9, 1]).map((v) => v.toFixed(4)).join(' / ')}`);
console.log(`  ring vertices    p50/p90/max = ${q(rep.map((r) => r.after.ring.length), [0.5, 0.9, 1]).join(' / ')}   (C19 §7.3: >200 hard-reject)`);
const exactRings = rows.filter((r) => r.after.quality.path === 'exact' && !r.after.degenerate);
console.log(`  exact-path ring vertices p50/p90/max = ${q(exactRings.map((r) => r.after.ring.length), [0.5, 0.9, 1]).join(' / ')}`);

// ── What is still refused, and why ─────────────────────────────────────────────────────
const still = rows.filter((r) => r.after.degenerate);
const byReason = new Map<string, number>();
for (const r of still) byReason.set(String(r.after.reason), (byReason.get(String(r.after.reason)) ?? 0) + 1);
console.log(`\n## STILL REFUSED — ${still.length} (${pct(still.length, rows.length)})`);
for (const [k, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
const stillByCity = new Map<string, number>();
for (const r of still) stillByCity.set(r.m.city, (stillByCity.get(r.m.city) ?? 0) + 1);
for (const c of cities) console.log(`  ${c.padEnd(16)} ${stillByCity.get(c) ?? 0}`);

const over = (n: number) => rows.filter((r) => !r.after.degenerate && r.after.ring.length > n);
console.log(`\n## VERTEX BUDGET (C19 §7.3)`);
for (const n of [50, 100, 200]) {
    const o = over(n);
    console.log(`  rings > ${n} verts: ${o.length} (${pct(o.length, A)})  — of which repaired: ${o.filter((r) => r.after.quality.path === 't-junction-split').length}`);
}
