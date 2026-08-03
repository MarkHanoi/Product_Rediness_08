// §VALENCIA-ALINEACIONES — LIVE end-to-end check of the actual provider, not a mock.
//
// Wiring that is only unit-tested against a fixture is how "authored-but-unwired" survives review:
// the fixture proves the parser, never the URL. This drives `resolveValenciaAlineaciones` against
// the real geoportal and asserts that each of the THREE distinguishable outcomes actually occurs —
// a building-ground hit, a not-building-ground refusal on the carriageway, and an out-of-box refusal.
//
// ⚠ Points are chosen by QUERYING the publisher (a real parcel centroid, a real street-axis vertex),
// never typed in by hand — a hand-picked coordinate that happens to miss would manufacture evidence
// of absence.
//
// Run: npx tsx tools/valencia-alineaciones-probe/live-provider-check.mts

import {
    resolveValenciaAlineaciones,
    VALENCIA_ARCGIS_SERVICE,
    VALENCIA_ALINEACIONES_GEOMETRY_EVIDENCE,
} from '../../packages/site-parcel-data/src/providers/resolveValenciaAlineaciones.js';

const UA = 'PRYZM-valencia-alineaciones-probe/1.0 (+https://pryzm.app)';

/** Ask the publisher for a real feature and return a WGS84 point on it. */
async function pointFrom(layer: number, where: string): Promise<{ lat: number; lon: number }> {
    const url =
        `${VALENCIA_ARCGIS_SERVICE}/${layer}/query?where=${encodeURIComponent(where)}` +
        `&outFields=*&returnGeometry=true&resultRecordCount=1&outSR=4326&f=json`;
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
    const j: any = await r.json();
    if (j.error) throw new Error(`ArcGIS ${j.error.code}: ${j.error.message}`);
    const g = j.features?.[0]?.geometry;
    if (!g) throw new Error(`no feature for layer ${layer} where ${where}`);
    if (g.rings) {
        // centroid of the outer ring — guaranteed to be a point the publisher itself drew
        const ring = g.rings[0] as [number, number][];
        const n = ring.length;
        const lon = ring.reduce((s, p) => s + p[0], 0) / n;
        const lat = ring.reduce((s, p) => s + p[1], 0) / n;
        return { lat, lon };
    }
    const path = g.paths[0] as [number, number][];
    const mid = path[Math.floor(path.length / 2)]!;
    return { lat: mid[1], lon: mid[0] };
}

async function main() {
    console.log('evidence pinned in provider:', JSON.stringify(VALENCIA_ALINEACIONES_GEOMETRY_EVIDENCE.verdict));
    let failures = 0;
    const check = (name: string, pass: boolean, got: unknown) => {
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} → ${JSON.stringify(got)}`);
        if (!pass) failures++;
    };

    // ── 1. BUILDING GROUND: a polygon the publisher marks with a positive storey count ──────────
    const buildable = await pointFrom(212, "altura = '5'");
    const hit = await resolveValenciaAlineaciones(buildable);
    check(
        'building-ground point yields a footprint',
        hit.ok === true && hit.rings.length > 0 && hit.epsg === 25830,
        hit.ok ? { rings: hit.rings.length, areaM2: hit.validation.areaM2, meanWidthM: hit.validation.meanWidthM,
            alturaKind: hit.altura.kind, heightStatus: hit.heightStatus } : hit,
    );
    // ⛔ THE GATE: a success must still refuse a height.
    check('…and STILL blocks the height (R2)', hit.ok === true && hit.heightStatus === 'blocked-r2',
        hit.ok ? hit.heightStatus : 'n/a');
    // The rings must be metric, not degrees — the CRS backstop.
    check('…rings are native EPSG:25830 metres, not degrees',
        hit.ok === true && Math.abs(hit.rings[0]![0]![0]!) > 1000,
        hit.ok ? hit.rings[0]![0] : 'n/a');

    // ── 2. NOT BUILDING GROUND: altura = 0, the carriageway / espacios libres case ──────────────
    const zero = await pointFrom(212, "altura = '0'");
    const zeroRes = await resolveValenciaAlineaciones(zero);
    check('altura=0 ground refuses with its OWN reason (never a footprint)',
        zeroRes.ok === false && zeroRes.reason === 'not-building-ground',
        zeroRes.ok ? 'returned a footprint!' : zeroRes.reason);

    // ── 3. OUT OF BOX ──────────────────────────────────────────────────────────────────────────
    const out = await resolveValenciaAlineaciones({ lat: 41.3874, lon: 2.1686 }); // Barcelona
    check('a Barcelona point is out-of-valencia', out.ok === false && out.reason === 'out-of-valencia',
        out.ok ? 'hit!' : out.reason);

    // ── 4. FAILURE ≠ EMPTY: an unreachable service must NOT read as "no polygon here" ───────────
    const dead = await resolveValenciaAlineaciones(buildable, {
        fetchImpl: (async () => { throw new Error('socket hang up'); }) as unknown as typeof fetch,
    });
    check('an unreachable service is service-error, NOT no-polygon-here',
        dead.ok === false && dead.reason === 'service-error',
        dead.ok ? 'hit!' : dead.reason);

    console.log(failures === 0 ? '\nALL LIVE CHECKS PASSED' : `\n${failures} LIVE CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('LIVE CHECK FAILED (a FAILURE, not an empty result):', e); process.exit(1); });
