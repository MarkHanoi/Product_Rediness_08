// §CORDOBA-DISSOLVE-RATE — measure the cadastral block dissolve on REAL Córdoba manzanas.
//
// WHY: `streetWidth.ts` records "Córdoba 0/3 (SPAIN-CADASTRAL-DISSOLVE-PROBE)" and the CLOSURE
// REGISTER treats that as capping the whole envelope, because CTP-1 + MC (61.2 % of ordenanzas land)
// are alignment zones that need a block ring. 0 of 3 is a THREE-SAMPLE claim. This measures it at
// scale against the publisher's own parcel geometry.
//
// ⚠ LINEAGE CAVEAT, STATED UP FRONT: this reads `coaco:vcatastro_urbanismo` — COACo's vectorisation
// of Catastro — not the Catastro INSPIRE WFS the production path fetches. Geometric CONFORMANCE
// (whether neighbouring parcels share edges exactly) is exactly the property that can differ between
// two digitisation lineages, so this measures the dissolve's behaviour on a PROXY. It is reported as
// such. What it can settle: whether the failure is UNIVERSAL (a structural property of Córdoba's
// fabric) or SAMPLE-SPECIFIC (three unlucky blocks).
import { dissolveParcelsToBlockRing } from '../../packages/site-parcel-data/src/geometry/blockRing.js';

type Pt = { x: number; z: number };
const UA = { 'User-Agent': 'PRYZM-city-completion-dissolve-probe/1.0 (+pryzmhello@gmail.com)' };
const GS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';

const res = await fetch(
    `${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=coaco:vcatastro_urbanismo`
    + '&outputFormat=application/json&count=100000',
    { headers: UA },
);
const fc: any = await res.json();
console.log('parcels fetched:', fc.features.length, 'crs:', JSON.stringify(fc.crs));

// EPSG:25830 metres already — no reprojection, so the dissolve sees true metric coordinates
// (the same frame `dissolveParcelsToBlockRing` expects: a metric XZ plane).
const ringsOf = (g: any): Pt[][] => {
    if (!g) return [];
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    // outer ring only — the dissolve takes parcel outlines
    return polys.map((p: any) => (p[0] as [number, number][]).map(([x, y]) => ({ x, z: y })));
};

// Group by MANZANA. Spanish urban `refcat` = 7-char finca code (5 manzana + 2 parcela) + sheet + control.
const byManzana = new Map<string, { rings: Pt[][]; ordenanzas: Set<string>; m2: number }>();
let noRefcat = 0;
for (const f of fc.features) {
    const refcat: string = f.properties?.refcat ?? '';
    if (typeof refcat !== 'string' || refcat.length < 7) { noRefcat++; continue; }
    const manzana = refcat.slice(0, 5);
    const rs = ringsOf(f.geometry);
    if (rs.length === 0) continue;
    const e = byManzana.get(manzana) ?? { rings: [], ordenanzas: new Set<string>(), m2: 0 };
    for (const r of rs) e.rings.push(r);
    if (f.properties?.ordenanza) e.ordenanzas.add(String(f.properties.ordenanza));
    e.m2 += Number(f.properties?.sup_pc_m2) || 0;
    byManzana.set(manzana, e);
}
console.log('manzanas grouped:', byManzana.size, '| parcels with no usable refcat:', noRefcat);

// A manzana needs >= 2 parcels to be a dissolve question at all.
const candidates = [...byManzana.entries()].filter(([, v]) => v.rings.length >= 2);
console.log('manzanas with >= 2 parcels:', candidates.length);

const byReason = new Map<string, number>();
let ok = 0;
const okByOrdenanza = new Map<string, { ok: number; total: number }>();
for (const [, v] of candidates) {
    const r = dissolveParcelsToBlockRing(v.rings);
    const reason = r.degenerate ? (r.reason ?? 'unknown') : 'OK';
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    if (!r.degenerate) ok++;
    for (const o of v.ordenanzas) {
        const e = okByOrdenanza.get(o) ?? { ok: 0, total: 0 };
        e.total++; if (!r.degenerate) e.ok++;
        okByOrdenanza.set(o, e);
    }
}
console.log('\n=== DISSOLVE RATE (COACo vcatastro lineage) ===');
console.log(`OK ${ok} / ${candidates.length} = ${(100 * ok / candidates.length).toFixed(2)}%`);
console.log('by reason:', JSON.stringify([...byReason.entries()].sort((a, b) => b[1] - a[1])));
console.log('\nby ordenanza family (a manzana counts once per family present):');
for (const [o, e] of [...okByOrdenanza.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${o.padEnd(30)} ${String(e.ok).padStart(4)}/${String(e.total).padStart(4)} = ${(100 * e.ok / e.total).toFixed(1)}%`);
}
