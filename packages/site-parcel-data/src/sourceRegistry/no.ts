// SOURCE REGISTRY — NORWAY (NO). Seeded 2026-09-01 from the prose registries + the L5 sweep
// lane, verbatim (supplement §7): parcelProviders/registry.ts `geonorge-no` row (endpoint
// from the wired euCadastreProxy) + sweep NO ("Class A+C · GREEN (geometry), YELLOW
// (ownership: agreement gate)"; §G: "NO Matrikkelen/NDH | NLOD | GREEN geometry | FKB
// footprints COMMERCIAL — do not license").
//
// HONEST ABSENCES:
//   • FKB building footprints — commercial; internal doctrine "do NOT license" (§G). Never
//     seeded, by doctrine rather than by gap.
//   • NDH nDSM free-path heights (heightSources.mjs ndh_no, impl:documented) — endpoint
//     prose only ("Geonorge WFS + hoydedata.no NDH LiDAR"), no probed service URL to copy.
//   • "Reguleringsplaner (landsdekkende kopi)" — Norge-digitalt AGREEMENT gate for the
//     national plan copy (sweep NO; record the gate, no row).

import { defineSources } from './defineSources.js';

export const NO_SOURCES = defineSources('NO', [
    {
        id: 'no-kartverket-matrikkelen-teig-wfs',
        country: 'NO',
        authority: 'Kartverket (Matrikkelen)',
        dataset: 'matrikkelen-eiendomskart-teig app:Teig — parcel geometry (7 feature types incl. Eiendomsgrense, Teiggrensepunkt)',
        endpoint: 'https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig',
        protocol: 'WFS2',
        licence: {
            id: 'NLOD — GREEN geometry; full ownership/attribute API is free but agreement-gated at matrikkel.no (YELLOW, sweep NO)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-07-24',
                note: 'registry.ts geonorge-no (live-probe evidence 2026-07-24): HTTP 200 GML 3.2.1, real teig polygon (0301/208/644 @ Oslo), keyless.',
            },
            {
                date: '2026-08-31',
                note: 'L5 sweep NO RE-PROBED LIVE: GetCapabilities WFS 2.0.0, title "Matrikkelen - Eiendomskart Teig", 7 feature types, response count limit 1,000,000 — the two earlier HTTP 504s that session were TRANSIENT; the keyless verdict stands.',
            },
        ],
        theme: 'cadastre',
        coverage: 'national (geometry); ownership agreement-gated',
        updateFrequency: null,
        adapterStatus: 'live', // wired, proxy /api/parcel/no
    },
]);
