// L-586 PROBE 5 — the FAILURE TAXONOMY for the ~17% layers 1–3 lose, live against Catastro.
//
// Re-runs the 17 failing refcats from `scratchpad/l576-live-dissolve.json` and asks, per failure,
// the ONE question the aggregate cannot answer: is this OUR DEFECT, an UPSTREAM GAP, or a CORRECT
// REFUSAL?
//
// ⚠ NETWORK ERRORS ARE COUNTED SEPARATELY AND NEVER FOLDED INTO A GEOMETRY OUTCOME (L-422/457/
// 467/469/579). A fetch that fails, a manzana that genuinely has one parcel, and a dissolve that
// refuses are three different facts and are reported as three different rows.
//
// Diagnostics per failure:
//   · sheet spread   — how many distinct cartographic SHEET codes (refcat chars 8–13) the 5-char
//                      `manzanaPrefix` filter swept up. >1 ⇒ the prefix over-collects and we are
//                      dissolving parcels from two different city blocks. That would be OURS.
//   · loop census    — the perimeter's connected components and each one's area, so an
//                      `open-or-disjoint` can be told apart: one big loop + a hair loop is a
//                      digitisation artefact; two big loops is a genuinely disjoint block.
//   · too-few        — is the manzana really a single parcel (upstream/real) or did the filter
//                      miss siblings that are plainly in the bbox?
//
// Run: npx tsx scratchpad/probe-l586-taxonomy.mts

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing, VERTEX_MATCH_TOLERANCE_M } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const R = 6_378_137, D = Math.PI / 180;
const prior = Object.values(
    JSON.parse(readFileSync(resolve(ROOT, 'scratchpad/l576-live-dissolve.json'), 'utf8')) as Record<string, any>,
);
const failures = prior.filter((r) => r.outcome !== 'ok');

const project = (ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] => {
    const c = Math.cos(lat0 * D);
    return ring.map((p) => ({ x: (p.lon - lon0) * D * R * c, z: -(p.lat - lat0) * D * R }));
};
const key = (p: Pt) => { const q = (v: number) => Math.round(v / VERTEX_MATCH_TOLERANCE_M); return `${q(p.x) + 0},${q(p.z) + 0}`; };
const ek = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function absArea(r: ReadonlyArray<Pt>) {
    let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; s += p.x * q.z - q.x * p.z; }
    return Math.abs(s / 2);
}

/** Connected components of the surviving (count===1) perimeter edge set, with their areas. */
function loopCensus(rings: ReadonlyArray<ReadonlyArray<Pt>>) {
    const edges = new Map<string, { count: number; a: Pt; b: Pt; ka: string; kb: string }>();
    for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            const ka = key(a), kb = key(b); if (ka === kb) continue;
            const k = ek(ka, kb); const f = edges.get(k);
            if (f) f.count++; else edges.set(k, { count: 1, a, b, ka, kb });
        }
    }
    const nonManifold = [...edges.values()].filter((e) => e.count > 2).length;
    const perim = [...edges.values()].filter((e) => e.count === 1);
    const deg = new Map<string, number>();
    for (const e of perim) for (const k of [e.ka, e.kb]) deg.set(k, (deg.get(k) ?? 0) + 1);
    const badDeg = [...deg.values()].filter((d) => d !== 2).length;
    // Union-find over vertices to count components without relying on a clean traversal.
    const parent = new Map<string, string>();
    const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
    for (const k of deg.keys()) parent.set(k, k);
    for (const e of perim) { const a = find(e.ka), b = find(e.kb); if (a !== b) parent.set(a, b); }
    const comps = new Map<string, { edges: typeof perim }>();
    for (const e of perim) { const r = find(e.ka); const c = comps.get(r); if (c) c.edges.push(e); else comps.set(r, { edges: [e] }); }
    // Approximate each component's area by the shoelace over its edge midpoints in chain order —
    // only meaningful for components that ARE simple chains, so we report edge count too.
    const areas = [...comps.values()].map((c) => {
        let s = 0;
        for (const e of c.edges) s += e.a.x * e.b.z - e.b.x * e.a.z;
        return { edges: c.edges.length, area: Math.abs(s / 2) };
    }).sort((a, b) => b.area - a.area);
    return { perimeterEdges: perim.length, nonManifoldEdges: nonManifold, badDegreeVertices: badDeg, components: areas };
}

interface Out {
    refcat: string; manzana: string; priorOutcome: string; priorReason: string | null;
    network: 'ok' | 'failed'; networkDetail?: string;
    bboxParcels?: number; matched?: number; sheets?: Record<string, number>;
    census?: ReturnType<typeof loopCensus>;
    verdict: string; category: 'ours' | 'upstream-gap' | 'correct-refusal' | 'network';
}

const out: Out[] = [];
for (const f of failures) {
    const refcat: string = f.refcat, manzana: string = f.manzana;
    const row: Out = { refcat, manzana, priorOutcome: f.outcome, priorReason: f.reason, network: 'ok', verdict: '', category: 'ours' };
    try {
        const selfUrl = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
            + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
        const sr = await fetch(selfUrl);
        if (!sr.ok) throw new Error(`self HTTP ${sr.status}`);
        const sp = parseParcelCollectionGml(await sr.text()) as Array<{ refcat: string; ring: Array<{ lat: number; lon: number }> }>;
        const self = sp.find((p) => p.refcat === refcat) ?? sp[0];
        if (!self || self.ring.length < 3) throw new Error('self ring unusable');
        const lat = self.ring.reduce((s, p) => s + p.lat, 0) / self.ring.length;
        const lon = self.ring.reduce((s, p) => s + p.lon, 0) / self.ring.length;
        const br = await fetch(buildParcelBboxUrl(lat, lon));
        if (!br.ok) throw new Error(`bbox HTTP ${br.status}`);
        const all = parseParcelCollectionGml(await br.text()) as Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }>;
        const matched = all.filter((p) => manzanaPrefix(p.refcat) === manzana);
        row.bboxParcels = all.length; row.matched = matched.length;
        const sheets: Record<string, number> = {};
        for (const p of matched) { const s = p.refcat.slice(7, 13); sheets[s] = (sheets[s] ?? 0) + 1; }
        row.sheets = sheets;

        if (matched.length < 3) {
            row.category = Object.keys(sheets).length > 1 ? 'ours' : 'upstream-gap';
            row.verdict = `manzana ${manzana} really has ${matched.length} parcel(s) in the bbox; `
                + `subject parcel ${self.ring.length} verts. Production refuses at <3.`;
        } else {
            const rings = matched.map((p) => project(p.ring, lat, lon));
            const census = loopCensus(rings);
            row.census = census;
            const d = dissolveParcelsToBlockRing(rings);
            const parcelSum = rings.reduce((s, r) => s + absArea(r), 0);
            const big = census.components[0]?.area ?? 0;
            const rest = census.components.slice(1).reduce((s, c) => s + c.area, 0);
            if (!d.degenerate) { row.category = 'correct-refusal'; row.verdict = 'now dissolves (upstream data changed since the sweep)'; }
            else if (Object.keys(sheets).length > 1) {
                row.category = 'ours';
                row.verdict = `prefix filter swept ${Object.keys(sheets).length} SHEETS: ${JSON.stringify(sheets)}`;
            } else if (census.components.length > 1 && rest / Math.max(big, 1) < 0.02) {
                row.category = 'ours';
                row.verdict = `${census.components.length} loops, secondary loops are ${(rest / big * 100).toFixed(3)}% of the main one `
                    + `⇒ digitisation artefact the T-junction split did not catch (perim ${census.perimeterEdges} edges, `
                    + `${census.badDegreeVertices} vertices of degree≠2, ${census.nonManifoldEdges} 3+-shared edges)`;
            } else {
                row.category = 'correct-refusal';
                row.verdict = `${census.components.length} loops, secondary ${(rest / Math.max(big, 1) * 100).toFixed(1)}% of main; `
                    + `${census.badDegreeVertices} vertices of degree≠2, ${census.nonManifoldEdges} 3+-shared edges; `
                    + `parcel-area sum ${parcelSum.toFixed(0)} m² — not a conforming tiling`;
            }
        }
    } catch (e) {
        row.network = 'failed'; row.networkDetail = (e as Error).message; row.category = 'network';
        row.verdict = `NETWORK/UPSTREAM: ${(e as Error).message} — this is NOT a geometry outcome`;
    }
    out.push(row);
    console.log(`${row.category.padEnd(16)} ${refcat} m${manzana} [${row.priorOutcome}/${row.priorReason}] — ${row.verdict}`);
    await new Promise((r) => setTimeout(r, 500));
}

console.log('\n## TAXONOMY (n=100 sweep, 17 non-ok)\n');
const cat = (c: string) => out.filter((r) => r.category === c);
for (const c of ['ours', 'upstream-gap', 'correct-refusal', 'network'] as const) {
    console.log(`  ${c.padEnd(16)} ${cat(c).length}`);
}
writeFileSync(resolve(ROOT, 'scratchpad/l586-taxonomy.json'), JSON.stringify({ ranAt: new Date().toISOString(), rows: out }, null, 2));
console.log('\nwrote scratchpad/l586-taxonomy.json');
