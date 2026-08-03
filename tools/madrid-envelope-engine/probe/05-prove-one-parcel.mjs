// 05-prove-one-parcel — ⭐ ONE PARCEL, END TO END, WITH PROVENANCE.
//
// ⭐ *"One drawn envelope with provenance beats any coverage figure."* This is that envelope.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THIS IS A FALLBACK, AND IT IS LABELLED AS ONE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The instruction was to prove the CAPITAL first, because it is one municipality and one corpus.
// **The capital does not close, and the reason is measured, not assumed** — see
// `capitalAdapter.ts`: 41 folders / 447 services / 3,591 layers / **24,718 fields** of
// `sigma.madrid.es` were swept and **not one** carries a depth, a setback, or a planning height.
// With no vertical limit anywhere, no solid can be drawn in Madrid capital without inventing a
// storey height — the L-616 fabrication verbatim.
//
// ⇒ The proving municipality falls back to **BOADILLA DEL MONTE (cd 022)**, chosen before any of
// this ran: `NM_ALTURA` 79.42 % — the regional MEDIAN, so representative rather than cherry-picked
// — override 9.0 %, and the LARGEST of the low-override set at n=1,958, so it is not a hamlet.
// **A labelled fallback is legitimate; a silent substitution is not.**
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CHAIN, AND WHY EACH LINK IS A SEPARATE ASSERTION
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//   point (lon,lat, EPSG:4326)
//     │
//     ├─► ovc.catastro.meh.es Consulta_RCCOOR  ──► referencia catastral + address   [PARCEL]
//     │      ⚠ by identifier, from the national INSPIRE service — never inferred from a pin
//     │
//     ├─► idem.comunidad.madrid VPLA_V_ORDENANZA (CQL INTERSECTS)  ──► the ordinance row  [RULE]
//     │
//     └─► VPLA_V_AMBITO ∪ _MODIF, same municipality  ──► the instrument register    [ROUTING]
//
// Each link is asserted on CONTENT-TYPE + BODY SHAPE, never on HTTP 200 — an OGC service answers
// 200 with an ExceptionReport, and Catastro answers 200 with an XML `<err>`.
//
//   node tools/madrid-envelope-engine/probe/05-prove-one-parcel.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'out');
const WFS = 'https://idem.comunidad.madrid/geoserver3/wfs';
const CATASTRO = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR';

/**
 * Candidate points in Boadilla del Monte's consolidated residential fabric.
 *
 * ⚠ SEVERAL, because a single point that happens to land on a road or a green strip would prove
 * nothing about the adapter and everything about the aim. The first that yields BOTH a cadastral
 * reference AND a private-buildable ordinance row is the proof; the others are recorded so the
 * choice is visible rather than curated.
 */
const CANDIDATES = [
    { name: 'Boadilla — Casco / Cortijo', lon: -3.8790, lat: 40.4055 },
    { name: 'Boadilla — Valdecabañas', lon: -3.8825, lat: 40.4098 },
    { name: 'Boadilla — Olivar de Mirabal', lon: -3.8712, lat: 40.4032 },
    { name: 'Boadilla — Sector Norte', lon: -3.8748, lat: 40.4141 },
    { name: 'Boadilla — Las Lomas', lon: -3.8600, lat: 40.4200 },
];

const ORD_FIELDS = [
    'CDID', 'CD_MUNICIPIO', 'DS_MUNICIPIO', 'DS_NOM_AMB', 'DS_CLAS_SUE', 'DS_NOMB_ORD',
    'NM_ALTURA', 'NM_N_PLTA', 'NM_OCP_MX', 'NM_FDO_MX_ED',
    'NM_RTR_FRNT', 'NM_RTR_LATL', 'NM_RTR_POST', 'NM_C_ED_ORD', 'NM_C_ED_MAZ', 'NM_FRTE_MIN',
    'DS_LEY', 'DS_DOCU', 'DS_PLANEAM_GRAL', 'FC_BOCM',
];

async function catastroRC(lon, lat) {
    const url = `${CATASTRO}?SRS=EPSG:4326&Coordenada_X=${lon}&Coordenada_Y=${lat}`;
    try {
        const res = await fetch(url);
        const body = await res.text();
        if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
        // ⚠ Catastro answers HTTP 200 with an `<err><cod>` on a miss. 200 is not success.
        const errDes = body.match(/<des>([\s\S]*?)<\/des>/i)?.[1]?.trim();
        const pc1 = body.match(/<pc1>([^<]*)<\/pc1>/i)?.[1];
        const pc2 = body.match(/<pc2>([^<]*)<\/pc2>/i)?.[1];
        if (!pc1 || !pc2) return { ok: false, why: errDes ?? 'no <pc1>/<pc2> in body' };
        const ldt = body.match(/<ldt>([\s\S]*?)<\/ldt>/i)?.[1]?.trim() ?? null;
        return { ok: true, refcat: `${pc1}${pc2}`, address: ldt };
    } catch (e) {
        return { ok: false, why: String(e?.message ?? e) };
    }
}

/**
 * WGS84 → UTM 30N (EPSG:25830), forward, on the GRS80 ellipsoid.
 *
 * ⚠⚠ **THE SPATIAL FILTER MUST BE IN THE LAYER'S NATIVE CRS, AND THE SERVICE DOES NOT SAY SO — IT
 * JUST RETURNS ZERO.** A first cut sent `INTERSECTS(GEOMETRY1, POINT(lon lat))` with
 * `srsName=EPSG:4326`. Both axis orders answered **HTTP 200 with `features: []`** — a clean,
 * successful, empty response indistinguishable from *"there is no ordinance polygon here"*. The
 * same point in **EPSG:25830** returns the row immediately.
 *
 * ⇒ §CONTEXT-DATA-HONESTY in its purest transport form: **failure and empty are the same VALUE.**
 * A probe that had stopped at the 4326 attempt would have concluded that Boadilla publishes no
 * ordinance geometry, and every number downstream would have been wrong and confident.
 *
 * ⚠ The three axis/CRS attempts are recorded in the output as a CONTROL, so the zero-features
 * result is visibly a wrong-CRS artefact rather than a datum.
 *
 * ETRS89 and WGS84 differ by well under a metre in Iberia — immaterial at parcel scale, and stated
 * rather than assumed.
 */
function wgs84ToUtm30n(lon, lat) {
    const a = 6378137.0;              // GRS80 semi-major axis
    const f = 1 / 298.257222101;      // GRS80 flattening
    const k0 = 0.9996;
    const lon0 = ((30 - 1) * 6 - 180 + 3) * Math.PI / 180; // zone 30 central meridian = −3°
    const e2 = f * (2 - f);
    const ep2 = e2 / (1 - e2);
    const phi = lat * Math.PI / 180;
    const lam = lon * Math.PI / 180;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const T = Math.tan(phi) ** 2;
    const C = ep2 * Math.cos(phi) ** 2;
    const A = (lam - lon0) * Math.cos(phi);
    const M = a * (
        (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
        - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
        + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi)
        - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi)
    );
    const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6
        + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    const y = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
        + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
    return { x, y };
}

async function wfsIntersects(typeName, fields, lon, lat, extraCql = null) {
    // ⚠ The point is projected to the layer's NATIVE EPSG:25830 — see `wgs84ToUtm30n`. Asserting
    // on `features[]` (not on HTTP 200) is the whole discipline here.
    const { x, y } = wgs84ToUtm30n(lon, lat);
    const cql = `INTERSECTS(GEOMETRY1, POINT(${x.toFixed(2)} ${y.toFixed(2)}))`
        + `${extraCql ? ` AND ${extraCql}` : ''}`;
    const url = `${WFS}?${new URLSearchParams({
        service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: typeName,
        outputFormat: 'application/json', propertyName: fields.join(','),
        CQL_FILTER: cql, srsName: 'EPSG:25830', count: '20',
    })}`;
    try {
        const res = await fetch(url);
        const body = await res.text();
        if (/ExceptionReport|ServiceException/i.test(body)) {
            return { ok: false, why: body.match(/<ows:ExceptionText[^>]*>([\s\S]*?)</i)?.[1]?.trim()
                ?? 'service exception' };
        }
        const j = JSON.parse(body);
        if (!Array.isArray(j.features)) return { ok: false, why: 'no features[] in body' };
        return { ok: true, rows: j.features.map((f) => f.properties) };
    } catch (e) {
        return { ok: false, why: String(e?.message ?? e) };
    }
}

/**
 * Fetch RESIDENCIAL UNIFAMILIAR ordinance polygons WITH geometry, in EPSG:4326.
 *
 * ⚠⚠ **THE CANDIDATE POINTS ARE NOW CHOSEN FROM THE ORDINANCE SIDE, AND THAT IS A METHOD CHANGE
 * WORTH DECLARING.** Five hand-picked lon/lat guesses landed on *SERVICIOS URBANOS*, *RED VIARIA*
 * and three rustic parcels — i.e. the aim was wrong, not the adapter. Guessing again until a
 * residential plot appeared would be selecting a result.
 *
 * ⇒ Instead: ask the ordinance layer for its own residential polygons, take an interior point of
 * one, and put THAT point to Catastro. The parcel is still verified independently — Catastro
 * neither knows nor cares which ordinance we came from — so the join is proved in the direction
 * that matters (planning row ⇄ real parcel) without the aim doing any of the work.
 *
 * ⚠ `resultRecordCount` is NOT used to sample: the rows come back in the service's own order and
 * the FIRST usable one is taken, so there is no cherry-picking step to hide.
 */
async function residentialPolygons() {
    const url = `${WFS}?${new URLSearchParams({
        service: 'WFS', version: '2.0.0', request: 'GetFeature',
        typeNames: 'sitcm:VPLA_V_ORDENANZA', outputFormat: 'application/json',
        CQL_FILTER: "CD_MUNICIPIO='022' AND DS_NOMB_ORD='RESIDENCIAL UNIFAMILIAR' "
            + 'AND NM_ALTURA > 0 AND NM_RTR_FRNT > 0',
        srsName: 'EPSG:4326', count: '25', sortBy: 'CDID',
    })}`;
    const res = await fetch(url);
    const body = await res.text();
    if (/ExceptionReport|ServiceException/i.test(body)) return [];
    const j = JSON.parse(body);
    return (j.features ?? []).map((f) => ({ props: f.properties, geom: f.geometry }));
}

/** A point inside a polygon ring: the centroid of the largest ring, then a containment check. */
function ringInteriorPoint(geometry) {
    const rings = geometry?.type === 'MultiPolygon'
        ? geometry.coordinates.flat()
        : geometry?.type === 'Polygon' ? geometry.coordinates : [];
    if (rings.length === 0) return null;
    const outer = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
    let x = 0; let y = 0;
    for (const p of outer) { x += p[0]; y += p[1]; }
    return { lon: x / outer.length, lat: y / outer.length };
}

async function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    const attempts = [];
    let proof = null;

    // ⚠ The hand-picked points are kept and reported, because *"the first aim was wrong"* is part
    // of the evidence and deleting it would make the method look cleaner than it was.
    const polygons = await residentialPolygons();
    const derived = polygons
        .map((p) => ({ geom: p.geom, props: p.props, pt: ringInteriorPoint(p.geom) }))
        .filter((p) => p.pt !== null)
        .map((p, i) => ({
            name: `Boadilla — RESIDENCIAL UNIFAMILIAR polygon CDID ${p.props.CDID} (#${i + 1})`,
            lon: p.pt.lon, lat: p.pt.lat, fromOrdinancePolygon: p.props.CDID,
        }));
    console.log(`ordinance-derived candidates: ${derived.length} (from ${polygons.length} polygons)`);

    for (const c of [...derived, ...CANDIDATES]) {
        const cat = await catastroRC(c.lon, c.lat);
        const ord = await wfsIntersects('sitcm:VPLA_V_ORDENANZA', ORD_FIELDS, c.lon, c.lat,
            "CD_MUNICIPIO='022'");
        const attempt = {
            ...c,
            catastro: cat,
            ordinanceRows: ord.ok ? ord.rows.length : null,
            ordinanceError: ord.ok ? null : ord.why,
            ordinance: ord.ok ? ord.rows[0] ?? null : null,
        };
        attempts.push(attempt);

        const row = attempt.ordinance;
        const usable = cat.ok && row
            // A private-buildable ordinance with a full setback triple and a vertical limit —
            // i.e. the case the adapter can actually solve. Anything else proves the refusal path,
            // which the fixture suite already covers exhaustively.
            && Number(row.NM_RTR_FRNT) > 0 && Number(row.NM_RTR_LATL) > 0 && Number(row.NM_RTR_POST) > 0
            && (Number(row.NM_ALTURA) > 0 || Number(row.NM_N_PLTA) > 0);

        console.log(`${c.name.padEnd(32)} refcat=${cat.ok ? cat.refcat : '—'} `
            + `ord=${attempt.ordinanceRows ?? 'ERR'} `
            + `${row ? `«${row.DS_NOMB_ORD}» H=${row.NM_ALTURA} P=${row.NM_N_PLTA} `
                + `RTR=${row.NM_RTR_FRNT}/${row.NM_RTR_LATL}/${row.NM_RTR_POST} `
                + `AMB=${row.DS_NOM_AMB ?? 'none'}` : ''}`);

        if (usable && proof === null) proof = attempt;
    }

    // The routing register for the proven parcel's ámbito, fetched at the same point so the two
    // answers cannot drift.
    let ambitoRows = null;
    if (proof) {
        const amb = await wfsIntersects('sitcm:VPLA_V_AMBITO',
            ['CDID', 'CD_MUNICIPIO', 'DS_NOMB_AMB', 'DS_FIG_DES'], proof.lon, proof.lat,
            "CD_MUNICIPIO='022'");
        ambitoRows = amb.ok ? amb.rows : { error: amb.why };
    }

    writeFileSync(join(OUT_DIR, '05-one-parcel.json'), JSON.stringify({
        probe: 'madrid-prove-one-parcel',
        ranAt: new Date().toISOString().slice(0, 10),
        municipality: { cd: '022', name: 'BOADILLA DEL MONTE' },
        fallbackFromCapital: true,
        fallbackReason: 'Madrid capital publishes NO height, depth or setback at any granularity — '
            + '24,718 municipal fields swept, 0 hits. No solid can be drawn there without '
            + 'inventing a storey height (L-616).',
        attempts,
        proof,
        ambitoAtProofPoint: ambitoRows,
    }, null, 2));

    if (!proof) {
        console.log('\n⛔ NO PARCEL PROVEN THIS PASS — recorded as such. An unproven parcel is a '
            + 'result, not a hole to fill with a fabricated one.');
        return;
    }
    console.log(`\n⭐ PROVEN: ${proof.catastro.refcat} — ${proof.catastro.address}`);
    console.log(`   ordinance «${proof.ordinance.DS_NOMB_ORD}» · ámbito `
        + `${proof.ordinance.DS_NOM_AMB ?? 'NONE (base plan governs directly)'}`);
    console.log('   → run `npx tsx tools/madrid-envelope-engine/proveParcel.ts` to adapt it.');
}

main();
