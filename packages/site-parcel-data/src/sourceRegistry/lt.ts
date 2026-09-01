// SOURCE REGISTRY — LITHUANIA (LT). Seeded 2026-09-01 from the L4 lane file, verbatim
// (supplement §7; REPORT §F LT row: "ASGR national with per-value provenance, daily FGDB;
// fill 14–18%; LiDAR soft-gated; state serves 3D allowed-height volumes"). Licence colour
// per §G: "LT ASGR/TPDR | public + attribution (VTPSI) | GREEN | 'Recommendation-grade'
// consolidation — legal source is the underlying TPD; geoportal.lt licence text not read
// verbatim" — hence verifiedDate:null everywhere here.
//
// NOTE: ASGR normative force ("rekomendacinio pobūdžio") is R5's worked example — the force
// flag rides Rule.provenance.normativeForce, never a licence colour.
//
// HONEST ABSENCE: LiDAR/terrain — soft-gated (package request + electronically signed
// licence agreement); no keyless endpoint to seed.

import { defineSources } from './defineSources.js';

const LT_VTPSI_LICENCE = {
    id: 'public + attribution to VTPSI ("Duomenys yra vieši. Naudojant būtina nurodyti savininką.") — geoportal.lt licence text not read verbatim (§G); confirm no share-alike when wiring',
    colour: 'GREEN',
    verifiedDate: null,
    textRef: null,
} as const;

export const LT_SOURCES = defineSources('LT', [
    {
        id: 'lt-vtpsi-asgr-mapserver',
        country: 'LT',
        authority: 'VTPSI (TPDR — ASGR consolidated regulations)',
        dataset: 'ASGR layer 0, ArcGIS-REST dialect, LKS-94/EPSG:3346 — MAX_AUK_M / MAX_INTENS / MAX_TANKIS / MIN_APZELD with per-value provenance columns (*_TP/*_NR/*_D/*_TPR) + PILN completeness flag',
        endpoint: 'https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/ASGR/MapServer',
        protocol: 'REST',
        licence: LT_VTPSI_LICENCE,
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'L4 lane LT-1 PROBED: keyless point query @ Vilnius (EPSG:3346) → polygon PAGR_PASK "KT", FUNKC_ZON "U_GC_P_F". Fill MEASURED (returnCountOnly): 175,557 polygons; MAX_AUK_M non-null 31,948 (18.2%); MAX_INTENS 23,920 (13.6%). ⚠ Unit caution: MAX_INTENS 15/160 suggests percent-like encoding — resolve against the ASGR methodology BEFORE computing GFA (the E1b week-1 probe register item); do not guess.',
            },
        ],
        theme: 'planning',
        coverage: '175,557 polygons national; values concentrate in urban/detail-planned zones (share of polygons, not of area)',
        updateFrequency: 'daily (the FGDB mirror refreshes daily — L4 lane LT-1)',
        adapterStatus: 'documented',
    },
    {
        id: 'lt-tpdr-asgr-bulk-fgdb',
        country: 'LT',
        authority: 'VTPSI (TPDR)',
        dataset: 'asgr.gdb.zip — whole-country ESRI FGDB mirror of ASGR (+ TPDR_RIBOS.zip / TPDR_SPRENDINIAI.zip, SHP, 24h)',
        endpoint: 'https://tpdr.planuojustatau.lt/assets/asgr.gdb.zip',
        protocol: 'bulk',
        licence: LT_VTPSI_LICENCE,
        accessOption: 3,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'L4 lane LT-1 PROBED: HTTP 200, 129,220,805 bytes, Last-Modified 2026-08-30 (daily).',
            },
        ],
        theme: 'planning',
        coverage: 'national',
        updateFrequency: 'daily',
        adapterStatus: 'documented',
    },
    {
        id: 'lt-rc-ntr-parcels-featureserver',
        country: 'LT',
        authority: 'Registrų centras (republished by Statistics Lithuania)',
        dataset: 'ntr_sklypai FeatureServer/0 (ArcGIS-REST dialect) — open cadastral parcel geometries with unikalus_nr, use-type code, protected-area flags',
        endpoint: 'https://osp-sdg.stat.gov.lt/arcgis/rest/services/ntr_sklypai/FeatureServer/0',
        protocol: 'REST',
        licence: {
            id: 'public + attribution © Registrų centras (L4 lane LT-3: CLASS A+C · GREEN)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'L4 lane LT-3 PROBED: envelope query @ Vilnius → parcels 0101/0054:0328 (0.1544 ha) + 0101/0054:0345 (0.0775 ha). ⚠ Street/state land is often unparcelled — a 0-feature point query is a data characteristic, not an outage.',
            },
        ],
        theme: 'cadastre',
        coverage: 'national; street/state land often unparcelled',
        updateFrequency: 'monthly (source dataset on data.gov.lt, NTK parcels #3780)',
        adapterStatus: 'documented',
    },
]);
