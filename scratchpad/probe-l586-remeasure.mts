// L-586 PROBE 12 — RE-MEASURE the live layer-1–3 resolution rate over the SAME 100 manzanas the
// 83.0% was measured on, running HEAD's logic and the working tree's logic side by side in one
// pass so both see identical upstream responses.
//
// ⚠ THE THREE AXES ARE KEPT SEPARATE AND ARE NEVER SUMMED INTO ONE RATE (L-422/457/467/469/579):
//   NETWORK   a fetch failed. Not a geometry outcome. Excluded from the geometry denominator and
//             reported on its own line.
//   GEOMETRY  a ring was produced, or was refused, by the dissolve.
//   POLICY    the route's own <3-parcel guard accepted or refused before any geometry ran.
//
// It re-uses the refcat list from `scratchpad/l576-live-dissolve.json` so the sample is FROZEN —
// a re-discovery could quietly change which manzanas are measured and make the two rates
// incomparable, which is the trap this whole exercise exists to avoid.
//
// Run: npx tsx scratchpad/probe-l586-remeasure.mts

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix, isFreeStandingBlock,
} from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing as HEAD } from './baseline/blockRingBaseline.js';
import { dissolveParcelsToBlockRing as NOW } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const R = 6_378_137, D = Math.PI / 180;
const prior = Object.values(JSON.parse(readFileSync(resolve(ROOT, 'scratchpad/l576-live-dissolve.json'), 'utf8')) as Record<string, any>);
const REFCATS: string[] = prior.map((r) => r.refcat);

const project = (ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] => {
    const c = Math.cos(lat0 * D);
    return ring.map((p) => ({ x: (p.lon - lon0) * D * R * c, z: -(p.lat - lat0) * D * R }));
};
const A = (r: ReadonlyArray<Pt>) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; s += p.x * q.z - q.x * p.z; } return Math.abs(s / 2); };
function segX(a: Pt, b: Pt, c: Pt, d: Pt) {
    const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
const selfX = (r: ReadonlyArray<Pt>) => { const n = r.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segX(r[i]!, r[(i + 1) % n]!, r[j]!, r[(j + 1) % n]!)) return true; } return false; };

interface Row {
    refcat: string; manzana: string; network: 'ok' | 'failed'; networkDetail?: string;
    parcels?: number; headOutcome?: string; nowOutcome?: string;
    headSelfX?: boolean; nowSelfX?: boolean; voids?: number;
    published?: number; netErrPct?: number | null; freeStanding?: boolean | null;
}
const rows: Row[] = [];
for (const refcat of REFCATS) {
    const manzana = manzanaPrefix(refcat)!;
    const row: Row = { refcat, manzana, network: 'ok' };
    try {
        const sr = await fetch('https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
            + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`);
        if (!sr.ok) throw new Error(`self HTTP ${sr.status}`);
        const sp = parseParcelCollectionGml(await sr.text()) as any[];
        const self = sp.find((p) => p.refcat === refcat) ?? sp[0];
        if (!self || self.ring.length < 3) throw new Error('self ring unusable');
        const lat = self.ring.reduce((s: number, p: any) => s + p.lat, 0) / self.ring.length;
        const lon = self.ring.reduce((s: number, p: any) => s + p.lon, 0) / self.ring.length;
        const br = await fetch(buildParcelBboxUrl(lat, lon));
        if (!br.ok) throw new Error(`bbox HTTP ${br.status}`);
        const all = parseParcelCollectionGml(await br.text()) as Array<{ refcat: string; ring: any[]; areaM2: number }>;
        const parcels = all.filter((p) => manzanaPrefix(p.refcat) === manzana);
        row.parcels = parcels.length;
        row.published = parcels.reduce((s, p) => s + (p.areaM2 ?? 0), 0);

        // HEAD policy: blanket refusal below 3.
        if (parcels.length < 3) {
            row.headOutcome = 'policy-refused (<3 parcels)';
            const fs = isFreeStandingBlock(parcels, all);
            row.freeStanding = fs.freeStanding;
            if (!fs.freeStanding) { row.nowOutcome = 'policy-refused (abuts another parcel)'; rows.push(row); await sleep(); continue; }
        }
        const rings = parcels.map((p) => project(p.ring, lat, lon));
        if (parcels.length >= 3) {
            const h = HEAD(rings);
            row.headOutcome = h.degenerate ? `refused (${h.reason})` : 'ok';
            row.headSelfX = h.degenerate ? undefined : selfX(h.ring);
        }
        const b = NOW(rings);
        row.nowOutcome = b.degenerate ? `refused (${b.reason})` : 'ok';
        if (!b.degenerate) {
            row.nowSelfX = selfX(b.ring);
            row.voids = b.voids.length;
            const v = b.voids.reduce((s, r) => s + A(r), 0);
            row.netErrPct = row.published ? ((A(b.ring) - v - row.published) / row.published) * 100 : null;
        }
    } catch (e) {
        row.network = 'failed'; row.networkDetail = (e as Error).message;
    }
    rows.push(row);
    const mark = row.network === 'failed' ? '⚠net' : row.nowOutcome === 'ok' ? '✔' : '✖';
    console.log(`${mark} ${refcat} m${manzana} — HEAD ${row.headOutcome ?? '—'} | NOW ${row.nowOutcome ?? '—'}${row.network === 'failed' ? ` (${row.networkDetail})` : ''}`);
    await sleep();
}
function sleep() { return new Promise((r) => setTimeout(r, 400)); }

const net = rows.filter((r) => r.network === 'failed');
const geo = rows.filter((r) => r.network === 'ok');
const headOk = geo.filter((r) => r.headOutcome === 'ok').length;
const nowOk = geo.filter((r) => r.nowOutcome === 'ok').length;
console.log(`\n${'─'.repeat(78)}\nLAYERS 1–3 RESOLUTION, LIVE — same ${rows.length} manzanas as the 83.0% sweep\n${'─'.repeat(78)}`);
console.log(`  NETWORK failures (NOT a geometry outcome, excluded from the rate below): ${net.length}`);
for (const r of net) console.log(`      ${r.refcat}: ${r.networkDetail}`);
console.log(`\n  geometry denominator                : ${geo.length}`);
console.log(`  resolved at HEAD                    : ${headOk}  (${(headOk / geo.length * 100).toFixed(1)}%)`);
console.log(`  resolved now                        : ${nowOk}  (${(nowOk / geo.length * 100).toFixed(1)}%)`);
console.log(`  self-intersecting rings at HEAD     : ${geo.filter((r) => r.headSelfX).length}`);
console.log(`  self-intersecting rings now         : ${geo.filter((r) => r.nowSelfX).length}   <-- must be 0`);
console.log(`  rings gained by §BLOCK-SINGLETON    : ${geo.filter((r) => r.headOutcome?.startsWith('policy-refused') && r.nowOutcome === 'ok').length}`);
console.log(`  rings gained by §INTERIOR-VOID      : ${geo.filter((r) => r.headOutcome?.startsWith('refused') && r.nowOutcome === 'ok').length}`);
console.log(`  rings LOST                          : ${geo.filter((r) => r.headOutcome === 'ok' && r.nowOutcome !== 'ok').length}`);
const still = geo.filter((r) => r.nowOutcome !== 'ok');
const byReason = new Map<string, number>();
for (const r of still) byReason.set(r.nowOutcome!, (byReason.get(r.nowOutcome!) ?? 0) + 1);
console.log(`\n  remaining unresolved (${still.length}):`);
for (const [k, v] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`    ${v}  ${k}`);
const errs = geo.filter((r) => typeof r.netErrPct === 'number').map((r) => Math.abs(r.netErrPct!)).sort((a, b) => a - b);
console.log(`\n  INDEPENDENT ORACLE — |void-corrected ring area − published parcel areas| / published:`);
console.log(`    p50 ${errs[Math.floor(errs.length / 2)]?.toFixed(3)}%  p90 ${errs[Math.floor(errs.length * 0.9)]?.toFixed(3)}%  worst ${errs[errs.length - 1]?.toFixed(3)}%`);
console.log('\n  SPOT-CHECKS — the rings §BLOCK-SINGLETON newly admitted, by name:');
for (const r of geo.filter((x) => x.headOutcome?.startsWith('policy-refused') && x.nowOutcome === 'ok')) {
    console.log(`    ${r.refcat} m${r.manzana}: ${r.parcels} parcel(s), free-standing ${r.freeStanding}, published ${r.published?.toFixed(0)} m², ring error ${r.netErrPct?.toFixed(3)}%, self-intersecting ${r.nowSelfX}`);
}
writeFileSync(resolve(ROOT, 'scratchpad/l586-remeasure.json'), JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 2));
console.log('\nwrote scratchpad/l586-remeasure.json');
