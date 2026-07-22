// L-585 PROBE — TEST THE CLAIM: "the L-581 half-plane clamp unblocks Madrid and Córdoba,
// because they fail on the same code path."
//
// The claim has two halves and BOTH are tested here, separately:
//
//   H1 (geometry): does L-581 change the BLOCK DISSOLVE outcome in Madrid / Córdoba?
//   H2 (production path): if the dissolve succeeds in Madrid / Córdoba, does the production
//                          envelope path actually reach the Art. 242.2 depth solver — i.e. is
//                          the dissolve the binding blocker at all?
//
// It re-runs the ORIGINAL L-535 9-address sample (SPAIN-CADASTRAL-DISSOLVE-PROBE.md) against
// the live Catastro + MUC services using the PRODUCTION functions:
//   server/parcelZoningProxy.js  — fetchParcelAtPoint, buildParcelBboxUrl,
//                                  parseParcelCollectionGml, manzanaPrefix   (block fetch)
//   server/mucZoningProxy.js     — fetchQualificationAtPoint                 (the zoning gate)
//   packages/site-parcel-data/src/geometry/blockRing.ts — dissolveParcelsToBlockRing
//   apps/editor/src/ui/site/boundaryProjection.ts       — latLonToSceneXZ (production projection)
//
// §CONTEXT-DATA-HONESTY (L-422/457/467/469/579): every upstream call records its own outcome.
// A network failure is reported as `net:*` and is NEVER counted as a geometry result.
//
// Run: npx tsx scratchpad/probe-l585-madrid-cordoba-claim.mts

import { writeFileSync } from 'node:fs';
import {
    fetchParcelAtPoint,
    buildParcelBboxUrl,
    parseParcelCollectionGml,
    manzanaPrefix,
    CATASTRO_WFS_ENDPOINT,
} from '../server/parcelZoningProxy.js';
import { fetchQualificationAtPoint } from '../server/mucZoningProxy.js';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import { latLonToSceneXZ } from '../apps/editor/src/ui/site/boundaryProjection.js';
import type { Pt } from '@pryzm/schemas';

// The nine L-535 points. Coordinates are re-verified in-probe against Catastro's own reverse
// geocode: `addressGot` is printed next to `addressExpected` so a mis-placed point is VISIBLE
// rather than silently measuring a different parcel (the wrong-PROPERTY failure mode).
const POINTS = [
    { id: 1, city: 'Barcelona', label: 'BCN Eixample A', lat: 41.39073, lon: 2.15803, addressExpected: 'VALENCIA 227' },
    { id: 2, city: 'Barcelona', label: 'BCN Eixample B', lat: 41.39363, lon: 2.16334, addressExpected: 'PAU CLARIS 174' },
    { id: 3, city: 'Madrid', label: 'MAD Salamanca A', lat: 40.42880, lon: -3.68450, addressExpected: 'VELAZQUEZ 33' },
    { id: 4, city: 'Madrid', label: 'MAD Salamanca B', lat: 40.42648, lon: -3.68152, addressExpected: 'AYALA 62' },
    { id: 5, city: 'Madrid', label: 'MAD Chamberí', lat: 40.43820, lon: -3.70140, addressExpected: 'VIRIATO 19' },
    { id: 6, city: 'Madrid', label: 'MAD centro', lat: 40.41550, lon: -3.70740, addressExpected: 'MAYOR 3' },
    { id: 7, city: 'Cordoba', label: 'COR centro A', lat: 37.88690, lon: -4.77800, addressExpected: 'CONDE DE TORRES CABRERA 15' },
    { id: 8, city: 'Cordoba', label: 'COR centro B', lat: 37.88200, lon: -4.78600, addressExpected: 'AV DE LA LIBERTAD' },
    { id: 9, city: 'Cordoba', label: 'COR ensanche', lat: 37.88370, lon: -4.77400, addressExpected: 'AGUAYOS 2' },
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
    id: number; city: string; label: string; lat: number; lon: number;
    addressExpected: string;
    // step 1 — parcel
    parcel: 'ok' | 'none' | 'net-error';
    parcelError?: string;
    refcat?: string;
    addressGot?: string;
    // step 2 — masa
    masa: 'ok' | 'too-few' | 'net-error' | 'skipped';
    masaError?: string;
    manzana?: string;
    siblingCount?: number;
    // step 3 — dissolve (PRODUCTION, current HEAD)
    dissolve: 'ring' | 'degenerate' | 'skipped';
    dissolveReason?: string | null;
    verts?: number;
    areaM2?: number;
    // step 3b — dissolve with the L-539 T-junction repair DISABLED (the pre-L-539 code path)
    dissolvePreL539?: 'ring' | 'degenerate';
    // step 4 — the production ZONING GATE
    muc: 'clau' | 'no-qualification' | 'net-error' | 'skipped';
    mucError?: string;
    clau?: string | null;
}

function ringArea(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

async function fetchTextRaw(url: string, timeoutMs = 30_000): Promise<string> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'PRYZM-L585-Probe/1.0 (+https://pryzm.fly.dev)' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } finally { clearTimeout(t); }
}

const rows: Row[] = [];

for (const p of POINTS) {
    const row: Row = {
        id: p.id, city: p.city, label: p.label, lat: p.lat, lon: p.lon,
        addressExpected: p.addressExpected,
        parcel: 'none', masa: 'skipped', dissolve: 'skipped', muc: 'skipped',
    };
    console.log(`\n── #${p.id} ${p.label} (${p.lat}, ${p.lon})`);

    // ── STEP 1: the parcel (production fetchParcelAtPoint) ─────────────────────────────
    try {
        const parcel = await fetchParcelAtPoint(p.lon, p.lat, { timeoutMs: 30_000 });
        if (!parcel) { row.parcel = 'none'; console.log('   parcel: NONE (service answered, no parcel)'); }
        else {
            row.parcel = 'ok';
            row.refcat = parcel.refcat;
            row.addressGot = typeof parcel.address === 'string' ? parcel.address.trim() : '';
            console.log(`   parcel: ${parcel.refcat}  addr="${row.addressGot}"  (expected ~"${p.addressExpected}")`);
        }
    } catch (e: any) {
        row.parcel = 'net-error'; row.parcelError = String(e?.message ?? e);
        console.log(`   parcel: NET-ERROR ${row.parcelError}`);
    }

    // ── STEP 4 (run early, independent of geometry): the production ZONING GATE ────────
    // `applyBcnZoningThenFallback` calls this FIRST and returns to the estimated fallback if it
    // yields nothing — so this, not the dissolve, is the first gate a Madrid point meets.
    try {
        const qual = await fetchQualificationAtPoint(p.lat, p.lon, { timeoutMs: 30_000 });
        if (!qual) { row.muc = 'no-qualification'; console.log('   MUC: NO QUALIFICATION (service answered; no clau at this point)'); }
        else { row.muc = 'clau'; row.clau = qual.clau; console.log(`   MUC: clau=${qual.clau}`); }
    } catch (e: any) {
        row.muc = 'net-error'; row.mucError = String(e?.message ?? e);
        console.log(`   MUC: NET-ERROR ${row.mucError}`);
    }

    // ── STEP 2: the masa (production bbox + manzana prefix filter) ─────────────────────
    if (row.parcel === 'ok' && row.refcat) {
        const manzana = manzanaPrefix(row.refcat);
        row.manzana = manzana ?? undefined;
        try {
            // Production centres its bbox on the SUBJECT PARCEL's centroid; the click point is
            // inside that parcel, so using it is the same bbox to within metres.
            const gml = await fetchTextRaw(buildParcelBboxUrl(p.lat, p.lon), 45_000);
            const all = parseParcelCollectionGml(gml);
            const parcels = all.filter((q: any) => manzanaPrefix(q.refcat) === manzana);
            row.siblingCount = parcels.length;
            if (parcels.length < 3) {
                row.masa = 'too-few';
                console.log(`   masa: TOO FEW — ${parcels.length} of ${all.length} in bbox (production refuses <3)`);
            } else {
                row.masa = 'ok';
                console.log(`   masa: ${parcels.length} parcels (of ${all.length} in bbox)`);

                // ── STEP 3: the PRODUCTION dissolve, projected the production way ──────
                const originLat = p.lat, originLon = p.lon;
                const rings: Pt[][] = parcels.map((q: any) =>
                    q.ring.map((v: any) => latLonToSceneXZ({ lat: v.lat, lon: v.lon }, originLat, originLon)),
                );
                const head = dissolveParcelsToBlockRing(rings);
                const preL539 = dissolveParcelsToBlockRing(rings, { repairTJunctions: false });
                row.dissolvePreL539 = preL539.degenerate ? 'degenerate' : 'ring';
                if (head.degenerate) {
                    row.dissolve = 'degenerate'; row.dissolveReason = head.reason;
                    console.log(`   dissolve: DEGENERATE (${head.reason})   [pre-L539: ${row.dissolvePreL539}]`);
                } else {
                    row.dissolve = 'ring';
                    row.verts = head.ring.length;
                    row.areaM2 = Math.round(ringArea(head.ring));
                    console.log(`   dissolve: RING ${row.verts} verts, ${row.areaM2} m²   [pre-L539: ${row.dissolvePreL539}]`);
                }
            }
        } catch (e: any) {
            row.masa = 'net-error'; row.masaError = String(e?.message ?? e);
            console.log(`   masa: NET-ERROR ${row.masaError}`);
        }
    }

    rows.push(row);
    await sleep(1500); // be polite to the public services
}

// ── REPORT ────────────────────────────────────────────────────────────────────────────
console.log('\n\n## RESULTS — 9 L-535 points, live services, PRODUCTION functions, HEAD\n');
console.log('| # | point | refcat | address returned | masa | dissolve (HEAD) | dissolve (pre-L539) | MUC clau |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) {
    console.log(
        `| ${r.id} | ${r.label} | ${r.refcat ?? (r.parcel === 'net-error' ? 'NET-ERROR' : '—')} | ` +
        `${r.addressGot ?? '—'} | ${r.masa === 'ok' ? `${r.siblingCount}` : r.masa} | ` +
        `${r.dissolve === 'ring' ? `RING ${r.verts}v ${r.areaM2}m²` : r.dissolve === 'degenerate' ? `DEGENERATE ${r.dissolveReason}` : r.dissolve} | ` +
        `${r.dissolvePreL539 ?? '—'} | ${r.muc === 'clau' ? r.clau : r.muc} |`,
    );
}

const geomEligible = rows.filter((r) => r.masa === 'ok');
const netErrors = rows.filter((r) => r.parcel === 'net-error' || r.masa === 'net-error' || r.muc === 'net-error');

console.log('\n## §CONTEXT-DATA-HONESTY — NETWORK OUTCOMES, COUNTED SEPARATELY\n');
console.log(`  parcel fetch  net-errors: ${rows.filter((r) => r.parcel === 'net-error').length} / ${rows.length}`);
console.log(`  masa  fetch   net-errors: ${rows.filter((r) => r.masa === 'net-error').length} / ${rows.filter((r) => r.parcel === 'ok').length} attempted`);
console.log(`  MUC   fetch   net-errors: ${rows.filter((r) => r.muc === 'net-error').length} / ${rows.length}`);
console.log(`  points with ANY net-error: ${netErrors.length} — these are EXCLUDED from every geometry rate below.`);

console.log('\n## DISSOLVE RATE — geometry-eligible points only (masa ok)\n');
for (const city of ['Barcelona', 'Madrid', 'Cordoba']) {
    const g = geomEligible.filter((r) => r.city === city);
    const head = g.filter((r) => r.dissolve === 'ring').length;
    const pre = g.filter((r) => r.dissolvePreL539 === 'ring').length;
    console.log(`  ${city.padEnd(10)} n=${g.length}  pre-L539: ${pre}/${g.length}   HEAD: ${head}/${g.length}`);
}

console.log('\n## THE PRODUCTION ZONING GATE (what actually gates an envelope)\n');
for (const city of ['Barcelona', 'Madrid', 'Cordoba']) {
    const g = rows.filter((r) => r.city === city && r.muc !== 'net-error');
    const withClau = g.filter((r) => r.muc === 'clau').length;
    console.log(`  ${city.padEnd(10)} n=${g.length}  points with a resolvable clau: ${withClau}/${g.length}`);
}

const out = new URL('./l585-madrid-cordoba-claim.json', import.meta.url);
writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 2));
console.log(`\nwrote ${out.pathname}`);
