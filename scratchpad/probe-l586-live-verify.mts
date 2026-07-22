// L-586 PROBE 9 — LIVE spot-check of the named Barcelona manzanas the taxonomy called OURS,
// against HEAD and against the working tree, with the published-area oracle applied per block.
//
// ⚠ NETWORK ERRORS ARE A THIRD OUTCOME, never folded into either geometry column.
//
// Run: npx tsx scratchpad/probe-l586-live-verify.mts

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing as HEAD } from './baseline/blockRingBaseline.js';
import { dissolveParcelsToBlockRing as NOW } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const R = 6_378_137, D = Math.PI / 180;
const A = (r: ReadonlyArray<Pt>) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; s += p.x * q.z - q.x * p.z; } return Math.abs(s / 2); };
const project = (ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] => {
    const c = Math.cos(lat0 * D);
    return ring.map((p) => ({ x: (p.lon - lon0) * D * R * c, z: -(p.lat - lat0) * D * R }));
};
function segX(a: Pt, b: Pt, c: Pt, d: Pt) {
    const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
const selfX = (r: ReadonlyArray<Pt>) => { const n = r.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segX(r[i]!, r[(i + 1) % n]!, r[j]!, r[(j + 1) % n]!)) return true; } return false; };

// The 7 the taxonomy called OURS (multi-loop), plus the one it called a CORRECT refusal, plus two
// controls that already worked — so a regression on a working block would be visible.
const CASES = [
    '0627611DF3802H', '0422328DF3802C', '0130601DF3803A', '9720801DF2892B',
    '9819101DF2891H', '0942306DF3804D', '1437807DF3813E',
    '0431601DF3803A', // non-manifold — must STILL refuse
    '0029907DF3802G', '0128801DF3802G', // controls — must be byte-identical to HEAD
];

const rows: any[] = [];
for (const refcat of CASES) {
    const manzana = manzanaPrefix(refcat)!;
    try {
        const sr = await fetch('https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
            + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`);
        if (!sr.ok) throw new Error(`self HTTP ${sr.status}`);
        const sp = parseParcelCollectionGml(await sr.text()) as any[];
        const self = sp.find((p) => p.refcat === refcat) ?? sp[0];
        if (!self) throw new Error('self missing');
        const lat = self.ring.reduce((s: number, p: any) => s + p.lat, 0) / self.ring.length;
        const lon = self.ring.reduce((s: number, p: any) => s + p.lon, 0) / self.ring.length;
        const br = await fetch(buildParcelBboxUrl(lat, lon));
        if (!br.ok) throw new Error(`bbox HTTP ${br.status}`);
        const all = parseParcelCollectionGml(await br.text()) as Array<{ refcat: string; ring: any[]; areaM2: number }>;
        const matched = all.filter((p) => manzanaPrefix(p.refcat) === manzana);
        const rings = matched.map((p) => project(p.ring, lat, lon));
        const pub = matched.reduce((s, p) => s + (p.areaM2 ?? 0), 0);
        const a = HEAD(rings), b = NOW(rings);
        const vArea = b.degenerate ? 0 : b.voids.reduce((s, v) => s + A(v), 0);
        const row = {
            refcat, manzana, parcels: matched.length, published: pub,
            head: a.degenerate ? `REFUSED (${a.reason})` : `${a.ring.length} verts, ${A(a.ring).toFixed(0)} m², selfX ${selfX(a.ring)}`,
            now: b.degenerate ? `REFUSED (${b.reason})` : `${b.ring.length} verts, ${A(b.ring).toFixed(0)} m², ${b.voids.length} void(s) ${vArea.toFixed(1)} m², selfX ${selfX(b.ring)}`,
            netErrPct: b.degenerate || !pub ? null : ((A(b.ring) - vArea - pub) / pub) * 100,
            identical: !a.degenerate && !b.degenerate && a.ring.length === b.ring.length && a.ring.every((p, i) => p.x === b.ring[i]!.x && p.z === b.ring[i]!.z),
            network: 'ok' as const,
        };
        rows.push(row);
        console.log(`${refcat} m${manzana} (${matched.length} parcels)\n    HEAD: ${row.head}\n    NOW : ${row.now}`
            + `${row.netErrPct === null ? '' : `\n    void-corrected ring area vs PUBLISHED ${pub.toFixed(0)} m²: ${row.netErrPct.toFixed(3)}%`}`
            + `${row.identical ? '\n    (byte-identical to HEAD)' : ''}`);
    } catch (e) {
        rows.push({ refcat, manzana, network: 'failed', detail: (e as Error).message });
        console.log(`${refcat} m${manzana}\n    NETWORK/UPSTREAM FAILURE: ${(e as Error).message} — not a geometry outcome`);
    }
    await new Promise((r) => setTimeout(r, 500));
}
writeFileSync(resolve(ROOT, 'scratchpad/l586-live-verify.json'), JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 2));
console.log('\nwrote scratchpad/l586-live-verify.json');
