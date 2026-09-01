// LANE FED LIVE PROBE HARNESS (E5 partial · DECISION-SUMMARY row 2) — temporary, deleted
// after the run; it lives in the package dir only for module resolution and is NOT part of
// the module (same convention as ee-chain-probe.mts, E1d).
//
// Runs the buildings-federation scaffold over TWO live extracts for one audited AOI:
//   authority — EE `etak_tuletis:etak_ehr_hooned` (WFS GeoJSON, EPSG:3301)
//   backbone  — Overture buildings, release 2026-07-22.0, reprojected to EPSG:3301 by the
//               fetch step (audit/…/impl/lane-fed-transcripts/fed-probe-overture.py)
// Neither extract is committed: the Overture half is ODbL and the module's own doctrine is
// that ODbL layers stay separable, so the probe reads them from a scratch dir given on argv.
//
//   npx tsx packages/site-parcel-data/fed-probe-tallinn.mts <dir-with-the-two-extracts>
//
// Expects <dir>/overture_tallinn_kopli.json and <dir>/ee_buildings_kopli.json.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pt2 } from '@pryzm/geometry-kernel';
import {
    addToFederationStore,
    createFederationStore,
    federateBuildings,
    federationProvenance,
    parseGersId,
    type FederationCandidate,
    type NonOdblFederatedBuilding,
} from './src/buildingsFederation/index.js';

const dir = process.argv[2];
if (!dir) throw new Error('usage: fed-probe-tallinn.mts <dir-with-extracts>');

/* ── Overture extract → backbone candidates ─────────────────────────────────────────────── */

interface OvertureRow {
    id: string;
    height: number | null;
    num_floors: number | null;
    subtype: string | null;
    wkt3301: string;
}

/** WKT `POLYGON ((x y, …))` → the OUTER ring only. Null when the shape is not a polygon. */
function outerRingFromWkt(wkt: string): Pt2[] | null {
    if (!wkt.startsWith('POLYGON')) return null; // MULTIPOLYGON etc. counted, never guessed at
    const open = wkt.indexOf('((');
    const close = wkt.indexOf(')', open + 2);
    if (open < 0 || close < 0) return null;
    const ring: Pt2[] = [];
    for (const pair of wkt.slice(open + 2, close).split(',')) {
        const [x, y] = pair.trim().split(/\s+/).map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        ring.push([x as number, y as number]);
    }
    return ring;
}

const overtureRows: OvertureRow[] = JSON.parse(
    readFileSync(join(dir, 'overture_tallinn_kopli.json'), 'utf8'),
);
let overtureNonPolygon = 0;
let overtureUnparseableId = 0;
const backboneCandidates: FederationCandidate[] = [];
for (const r of overtureRows) {
    const ring = outerRingFromWkt(r.wkt3301);
    if (ring === null) {
        overtureNonPolygon++;
        continue;
    }
    const gersId = parseGersId(r.id);
    if (gersId === null) overtureUnparseableId++;
    backboneCandidates.push({
        sourceFeatureId: r.id,
        gersId,
        ring,
        // Overture heights are ML/OSM-derived, never surveyed by Overture itself.
        heightM: r.height ?? null,
        heightMethod: r.height === null || r.height === undefined ? null : 'MODELLED',
        floorsAbove: r.num_floors ?? null,
    });
}

/* ── EE WFS extract → authority candidates ──────────────────────────────────────────────── */

interface EeFeature {
    geometry: { type: string; coordinates: number[][][] } | null;
    properties: Record<string, unknown>;
}

const eeFc: { features: EeFeature[] } = JSON.parse(
    readFileSync(join(dir, 'ee_buildings_kopli.json'), 'utf8'),
);
let eeNonPolygon = 0;
let eeRegisterOnlyHeight = 0;
const authorityCandidates: FederationCandidate[] = [];
for (const f of eeFc.features) {
    if (!f.geometry || f.geometry.type !== 'Polygon') {
        eeNonPolygon++;
        continue;
    }
    const outer = f.geometry.coordinates[0];
    if (!outer) {
        eeNonPolygon++;
        continue;
    }
    const ring: Pt2[] = outer.map((c) => [c[0] as number, c[1] as number]); // drop the Z ordinate
    const p = f.properties;
    const num = (v: unknown): number | null =>
        typeof v === 'number' && Number.isFinite(v)
            ? v
            : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
              ? Number(v)
              : null;
    const surveyed = num(p['korgus_m']); // ETAK, ALS-measured
    const register = num(p['korgus']); // EHR register attribute — declared, not surveyed
    if (surveyed === null && register !== null) eeRegisterOnlyHeight++;
    const heightM = surveyed ?? register;
    authorityCandidates.push({
        sourceFeatureId: String(p['etak_id'] ?? p['fid'] ?? ''),
        gersId: null, // the EE layer carries no GERS id (EE is not bridged — §D1)
        ring,
        heightM,
        // The frozen vocabulary has no DECLARED/REGISTER member; the EE provider header
        // already reads `korgus` as "MODELLED/declared", and this probe follows THAT existing
        // decision rather than minting a rival reading.
        heightMethod: heightM === null ? null : surveyed !== null ? 'SURVEYED' : 'MODELLED',
        floorsAbove: num(p['max_korruste_arv']),
    });
}

/* ── Federate ───────────────────────────────────────────────────────────────────────────── */

const t0 = Date.now();
const { buildings, report } = federateBuildings(
    {
        source: 'fed-ee-etak-ehr-hooned',
        crs: 'EPSG:3301',
        idScheme: 'etak_id',
        candidates: authorityCandidates,
    },
    {
        source: 'fed-overture-buildings',
        crs: 'EPSG:3301',
        idScheme: null,
        candidates: backboneCandidates,
    },
    'EE',
);
const ms = Date.now() - t0;

console.log('=== INPUTS ===');
console.log(`overture rows read      ${overtureRows.length}`);
console.log(`  non-polygon skipped   ${overtureNonPolygon}`);
console.log(`  ids failing parseGersId ${overtureUnparseableId}`);
console.log(`ee features read        ${eeFc.features.length}`);
console.log(`  non-polygon skipped   ${eeNonPolygon}`);
console.log(`  register-only height  ${eeRegisterOnlyHeight}`);
console.log('=== REPORT ===');
console.log(JSON.stringify({ ...report, gersConflicts: report.gersConflicts.length, undecidable: report.undecidable.length }, null, 2));
console.log(`federate wall time      ${ms} ms`);
console.log(`pairs                   ${report.authorityCount * report.backboneCount}`);
console.log(`clipper calls           ${report.geometryComparisons}`);
console.log(`federated buildings     ${buildings.length}`);
if (report.undecidable.length > 0) {
    console.log('undecidable sample:', JSON.stringify(report.undecidable.slice(0, 5)));
}

/* ── Attribute-provenance census (the weld-split, at scale) ─────────────────────────────── */

const census = new Map<string, number>();
for (const fb of buildings) {
    const p = federationProvenance(fb);
    const key = `shape=${p.source} height=${p.heightSource}/${p.heightConfidence} floors=${p.floorSource}/${p.floorConfidence} lic=${fb.licence}`;
    census.set(key, (census.get(key) ?? 0) + 1);
}
console.log('=== PER-ATTRIBUTE PROVENANCE CENSUS ===');
for (const [k, v] of [...census.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(v).padStart(5)}  ${k}`);
}

/* ── The ODbL boundary, at scale ────────────────────────────────────────────────────────── */

const odbl = createFederationStore('odbl', 'tallinn-kopli-context-db');
const clean = createFederationStore('non-odbl', 'pryzm-derived-attrs');
let accepted = 0;
let refused = 0;
for (const fb of buildings) {
    if (!addToFederationStore(odbl, fb).ok) throw new Error('an ODbL store must accept everything');
    // Deliberately attempt the FORBIDDEN merge with the type erased, as a JS caller would.
    const out = addToFederationStore(clean, fb as NonOdblFederatedBuilding);
    if (out.ok) accepted++;
    else refused++;
}
console.log('=== ODbL SEPARABILITY, AT SCALE ===');
console.log(`odbl store rows         ${odbl.rows.length}`);
console.log(`non-odbl accepted       ${accepted}`);
console.log(`non-odbl REFUSED        ${refused}`);
console.log(`non-odbl store rows     ${clean.rows.length}`);
